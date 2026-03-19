import { Router, type Express } from 'express';
import { access, readFile, readdir, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { agentController } from '../agentController';
import { circuitBreaker } from '../apiResilience';
import { getSCPAQueueStatus } from '../metacognitiveService';
import {
  getSchedulerStatus,
  forceMemorySummarization,
} from '../memorySummarizationScheduler';
import {
  getServerEvolutionStatus,
  triggerServerEvolution,
  getServerEvolutionHistory,
} from '../selfEvolutionService';
import { getMillaMoodData } from '../moodService';
import { asyncHandler } from '../utils/routeHelpers';
import { getConfigDiagnostics, getGitHubToken } from '../config';
import { validateGitHubToken } from '../githubApiService';
import {
  getConsciousnessSchedulerStatus,
  triggerConsciousnessCycle,
} from '../consciousnessScheduler';
import { getRepositoryDiscoverySchedulerStatus } from '../repositoryDiscoveryScheduler';
import {
  getCollaborationSchedulerStatus,
  runCollaborationCycle,
  updateCollaborationSchedule,
} from '../collaborationScheduler';
import { getContextWindowStatus } from '../contextWindowService';
import {
  getMcpRuntimeStatus,
  invokeMcpTool,
  listMcpTools,
} from '../mcpRuntimeService';
import {
  cancelShellCommand,
  enqueueAllowedShellCommand,
  getShellRun,
  getShellRunnerSummary,
  getShellRunnerStatus,
  subscribeToShellRun,
} from '../shellExecutionService';
import {
  getReplycaSocialStatus,
  syncReplycaSharedHistory,
} from '../replycaSocialBridgeService';

const PROACTIVE_BASE_URL = (
  process.env.PROACTIVE_BASE_URL || 'http://localhost:5001'
).replace(/\/$/, '');

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getNetworkAccessSnapshot(hostHeader?: string) {
  const normalizedHost = (hostHeader || '').replace(/:\d+$/, '');
  const port =
    hostHeader?.split(':')[1] ||
    process.env.PORT ||
    process.env.SERVER_PORT ||
    '5000';

  const privateIpv4Candidates = Array.from(
    new Set(
      Object.values(os.networkInterfaces())
        .flat()
        .filter(
          (details): details is NonNullable<typeof details> =>
            Boolean(details) &&
            details.family === 'IPv4' &&
            !details.internal &&
            Boolean(details.address)
        )
        .map((details) => details.address)
        .filter(
          (address) =>
            address.startsWith('10.') ||
            address.startsWith('192.168.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
        )
    )
  );

  const recommendedHost =
    privateIpv4Candidates[0] ||
    (normalizedHost &&
    normalizedHost !== 'localhost' &&
    normalizedHost !== '127.0.0.1'
      ? normalizedHost
      : null);

  return {
    port: Number(port),
    privateIpv4Candidates,
    recommendedUrl: recommendedHost ? `http://${recommendedHost}:${port}` : null,
    loopbackUrl: `http://127.0.0.1:${port}`,
  };
}

function getBrowserTargets(hostHeader?: string) {
  const network = getNetworkAccessSnapshot(hostHeader);
  const localBase = network.loopbackUrl;
  const lanBase =
    network.recommendedUrl && network.recommendedUrl !== localBase
      ? network.recommendedUrl
      : null;

  return [
    {
      id: 'local-app',
      label: 'Local app',
      url: localBase,
      category: 'app',
      description: 'Open the main Milla-Rayne app served on this machine.',
    },
    lanBase
      ? {
          id: 'lan-app',
          label: 'LAN app',
          url: lanBase,
          category: 'remote',
          description: 'Open the main app over the current local network.',
        }
      : null,
    {
      id: 'health',
      label: 'Health API',
      url: `${localBase}/api/monitoring/health`,
      category: 'system',
      description: 'Inspect the current server health payload.',
    },
    {
      id: 'collaboration-cycle',
      label: 'Collaboration status',
      url: `${localBase}/api/system/collaboration-cycle`,
      category: 'system',
      description: 'Review the latest collaboration scheduler state and report.',
    },
    {
      id: 'proactive-recommendations',
      label: 'Proactive recommendations',
      url: `${PROACTIVE_BASE_URL}/recommendations`,
      category: 'proactive',
      description: 'Open the proactive repository recommendations feed.',
    },
  ].filter((target): target is NonNullable<typeof target> => Boolean(target));
}

async function getConsciousnessSnapshot() {
  const scheduler = getConsciousnessSchedulerStatus();
  const replycaRoot = scheduler.replycaRoot;

  if (!replycaRoot) {
    return {
      scheduler,
      storage: {
        available: false,
        error: 'ReplycA root could not be resolved',
      },
    };
  }

  const gimPath = path.join(
    replycaRoot,
    'core_os',
    'memory',
    'stream_of_consciousness.md'
  );
  const archivesPath = path.join(
    replycaRoot,
    'core_os',
    'memory',
    'thought_archives'
  );
  const remPath = path.join(
    replycaRoot,
    'core_os',
    'memory',
    'neuro_state_v2.json'
  );

  const gimExists = await pathExists(gimPath);
  const remExists = await pathExists(remPath);
  const archivesExist = await pathExists(archivesPath);

  let gim = {
    exists: gimExists,
    path: gimPath,
    updatedAt: null as number | null,
    archiveCount: 0,
    latestSessionAt: null as string | null,
    latestPreview: null as string | null,
  };

  if (gimExists) {
    const [gimContents, gimStats] = await Promise.all([
      readFile(gimPath, 'utf8'),
      stat(gimPath),
    ]);

    const latestMarker = gimContents.lastIndexOf('### 💭 GIM Session:');
    const latestSection =
      latestMarker >= 0 ? gimContents.slice(latestMarker).trim() : gimContents.trim();
    const latestLines = latestSection.split('\n').filter(Boolean);
    const latestHeading = latestLines[0] || null;
    const latestPreview = latestLines.slice(1).join(' ').trim();

    gim = {
      ...gim,
      updatedAt: gimStats.mtimeMs,
      latestSessionAt: latestHeading
        ? latestHeading.replace('### 💭 GIM Session:', '').trim()
        : null,
      latestPreview: latestPreview ? latestPreview.slice(0, 320) : null,
    };
  }

  if (archivesExist) {
    const archiveEntries = await readdir(archivesPath);
    gim.archiveCount = archiveEntries.filter((entry) => entry.endsWith('.md')).length;
  }

  let rem = {
    exists: remExists,
    path: remPath,
    updatedAt: null as number | null,
    summary: null as
      | {
          atpEnergy: number | null;
          adenosine: number | null;
          painLevel: number | null;
          journalEntries: number;
          eventsBuffered: number;
          plasticityEvents: number;
          chemicals: Record<string, number>;
        }
      | null,
  };

  if (remExists) {
    const [remContents, remStats] = await Promise.all([
      readFile(remPath, 'utf8'),
      stat(remPath),
    ]);
    const state = JSON.parse(remContents) as Record<string, unknown>;

    rem = {
      ...rem,
      updatedAt: remStats.mtimeMs,
      summary: {
        atpEnergy:
          typeof state.atp_energy === 'number' ? state.atp_energy : null,
        adenosine:
          typeof state.adenosine === 'number' ? state.adenosine : null,
        painLevel:
          typeof state.pain_level === 'number' ? state.pain_level : null,
        journalEntries: Array.isArray(state.journal) ? state.journal.length : 0,
        eventsBuffered: Array.isArray(state.events_buffer)
          ? state.events_buffer.length
          : 0,
        plasticityEvents: Array.isArray(state.plasticity_buffer)
          ? state.plasticity_buffer.length
          : 0,
        chemicals:
          state.chemicals && typeof state.chemicals === 'object'
            ? (state.chemicals as Record<string, number>)
            : {},
      },
    };
  }

  return {
    scheduler,
    storage: {
      available: true,
      gim,
      rem,
    },
  };
}

/**
 * Monitoring and System Routes
 */
export function registerSystemRoutes(app: Express) {
  const router = Router();

  // Combined system health
  router.get(
    '/monitoring/health',
    asyncHandler(async (req, res) => {
      const agentMetrics = agentController.getAllMetrics();
      const cbStatus = circuitBreaker.getStatus();
      const scpaStatus = getSCPAQueueStatus();
      const schedulerStatus = getSchedulerStatus();

      const openCircuits = Object.values(cbStatus).filter(
        (s: any) => s.state === 'OPEN'
      ).length;
      const criticalFailures = scpaStatus.criticalFailures;
      const agentFailures = Object.values(agentMetrics).reduce(
        (sum: number, m: any) => sum + (m.failureCount || 0),
        0
      );

      let health = 'healthy';
      if (criticalFailures > 3 || openCircuits > 2) {
        health = 'critical';
      } else if (
        criticalFailures > 0 ||
        openCircuits > 0 ||
        agentFailures > 5
      ) {
        health = 'degraded';
      }

      res.json({
        success: true,
        health,
        components: {
          agents: {
            total: agentController.getRegisteredAgents().length,
            failures: agentFailures,
          },
          circuitBreakers: {
            total: Object.keys(cbStatus).length,
            open: openCircuits,
          },
          scpa: { queueSize: scpaStatus.queueSize, critical: criticalFailures },
          scheduler: {
            running: schedulerStatus.isRunning,
            successRate: schedulerStatus.successRate,
          },
        },
        timestamp: Date.now(),
      });
    })
  );

  // Memory scheduler monitoring
  router.get(
    '/monitoring/memory-scheduler',
    asyncHandler(async (req, res) => {
      const status = getSchedulerStatus();
      res.json({ success: true, ...status, timestamp: Date.now() });
    })
  );

  router.post(
    '/monitoring/memory-scheduler/force-run',
    asyncHandler(async (req, res) => {
      await forceMemorySummarization();
      res.json({
        success: true,
        message: 'Memory summarization triggered',
        timestamp: Date.now(),
      });
    })
  );

  // SCPA queue status
  router.get(
    '/monitoring/scpa',
    asyncHandler(async (req, res) => {
      const status = getSCPAQueueStatus();
      res.json({ success: true, ...status, timestamp: Date.now() });
    })
  );

  // Milla's mood
  router.get(
    '/milla-mood',
    asyncHandler(async (req, res) => {
      const moodData = await getMillaMoodData();
      res.json({ mood: moodData, success: true });
    })
  );

  // Self-Improvement / Evolution
  router.get(
    '/self-improvement/status',
    asyncHandler(async (req, res) => {
      const serverStatus = getServerEvolutionStatus();
      res.json({ server: serverStatus, success: true });
    })
  );

  router.post(
    '/self-improvement/trigger',
    asyncHandler(async (req, res) => {
      const serverEvolutions = await triggerServerEvolution();
      res.json({
        serverEvolutions,
        message: 'Self-improvement cycle initiated successfully',
        success: true,
      });
    })
  );

  router.get(
    '/self-improvement/history',
    asyncHandler(async (req, res) => {
      const serverHistory = await getServerEvolutionHistory();
      const { type } = req.query;

      let filteredHistory = serverHistory;
      if (type && type !== 'all') {
        filteredHistory = serverHistory.filter(
          (h: any) => h.evolutionType === type
        );
      }

      res.json({ serverHistory: filteredHistory, success: true });
    })
  );

  router.get(
    '/system/config-status',
    asyncHandler(async (_req, res) => {
      const diagnostics = getConfigDiagnostics();

      let proactive = { reachable: false as boolean, error: null as string | null };
      try {
        const response = await fetch(`${PROACTIVE_BASE_URL}/health`);
        proactive = {
          reachable: response.ok,
          error: response.ok ? null : `Health check failed with ${response.status}`,
        };
      } catch (error) {
        proactive = {
          reachable: false,
          error: error instanceof Error ? error.message : 'Unknown proactive health error',
        };
      }

      const githubToken = getGitHubToken();

      let github = {
        configured: Boolean(githubToken),
        valid: null as boolean | null,
        scopes: [] as string[],
        error: null as string | null,
      };

      if (githubToken) {
        const validation = await validateGitHubToken(githubToken);
        github = {
          configured: true,
          valid: validation.valid,
          scopes: validation.scopes || [],
          error: validation.error || null,
        };
      }

      res.json({
        success: true,
        ...diagnostics,
        integrationChecks: {
          proactive,
          github,
          shell: getShellRunnerSummary(),
          mcp: getMcpRuntimeStatus(),
          consciousness: getConsciousnessSchedulerStatus(),
          repositoryDiscovery: getRepositoryDiscoverySchedulerStatus(),
          collaboration: getCollaborationSchedulerStatus(),
          replycaSocial: await getReplycaSocialStatus(),
        },
      });
    })
  );

  router.get(
    '/system/network-access',
    asyncHandler(async (req, res) => {
      res.json({
        success: true,
        ...getNetworkAccessSnapshot(req.headers.host),
      });
    })
  );

  router.get(
    '/system/browser-targets',
    asyncHandler(async (req, res) => {
      res.json({
        success: true,
        targets: getBrowserTargets(req.headers.host),
      });
    })
  );

  router.get(
    '/system/shell-status',
    asyncHandler(async (_req, res) => {
      res.json({
        success: true,
        ...getShellRunnerStatus(),
      });
    })
  );

  router.post(
    '/system/shell/run',
    asyncHandler(async (req, res) => {
      const commandId = typeof req.body?.commandId === 'string' ? req.body.commandId : '';
      if (!commandId) {
        res.status(400).json({
          success: false,
          message: 'commandId is required',
        });
        return;
      }

      const run = await enqueueAllowedShellCommand(commandId);
      const statusCode = run.status === 'rejected' ? 400 : 202;

      res.status(statusCode).json({
        success: run.status !== 'rejected',
        run,
        shell: getShellRunnerStatus(),
      });
    })
  );

  router.get(
    '/system/shell/runs/:runId',
    asyncHandler(async (req, res) => {
      const run = getShellRun(req.params.runId);
      if (!run) {
        res.status(404).json({
          success: false,
          message: 'Shell run not found',
        });
        return;
      }

      res.json({
        success: true,
        run,
      });
    })
  );

  router.post(
    '/system/shell/cancel',
    asyncHandler(async (req, res) => {
      const runId = typeof req.body?.runId === 'string' ? req.body.runId : undefined;
      const run = await cancelShellCommand(runId);

      if (!run) {
        res.status(404).json({
          success: false,
          message: 'No matching active or queued shell run found',
        });
        return;
      }

      res.json({
        success: true,
        run,
        shell: getShellRunnerStatus(),
      });
    })
  );

  router.get('/system/shell/stream/:runId', (req, res) => {
    const run = getShellRun(req.params.runId);
    if (!run) {
      res.status(404).json({
        success: false,
        message: 'Shell run not found',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (eventType: string, payload: unknown) => {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    writeEvent('snapshot', { run });

    if (req.query.once === 'true') {
      res.end();
      return;
    }

    const unsubscribe = subscribeToShellRun(req.params.runId, (event) => {
      writeEvent(event.type, event);
    });

    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  });

  router.get(
    '/system/mcp-status',
    asyncHandler(async (_req, res) => {
      res.json({
        success: true,
        ...getMcpRuntimeStatus(),
      });
    })
  );

  router.get(
    '/system/mcp-tools',
    asyncHandler(async (req, res) => {
      const serverId =
        typeof req.query.serverId === 'string' ? req.query.serverId : undefined;
      const tools = await listMcpTools(serverId);
      res.json({
        success: true,
        tools,
      });
    })
  );

  router.post(
    '/system/mcp-call',
    asyncHandler(async (req, res) => {
      const serverId = typeof req.body?.serverId === 'string' ? req.body.serverId : '';
      const toolName = typeof req.body?.toolName === 'string' ? req.body.toolName : '';
      const args =
        req.body?.args && typeof req.body.args === 'object' && !Array.isArray(req.body.args)
          ? (req.body.args as Record<string, unknown>)
          : {};

      if (!serverId || !toolName) {
        res.status(400).json({
          success: false,
          message: 'serverId and toolName are required',
        });
        return;
      }

      const result = await invokeMcpTool(serverId, toolName, args);
      res.json({
        success: true,
        ...result,
      });
    })
  );

  router.get(
    '/system/context-window-status',
    asyncHandler(async (_req, res) => {
      res.json({
        success: true,
        ...getContextWindowStatus(),
      });
    })
  );

  router.get(
    '/system/replyca-social',
    asyncHandler(async (_req, res) => {
      const status = await getReplycaSocialStatus();
      res.json(status);
    })
  );

  router.post(
    '/system/replyca-social/sync',
    asyncHandler(async (_req, res) => {
      const result = await syncReplycaSharedHistory();
      res.json(result);
    })
  );

  router.get(
    '/system/consciousness',
    asyncHandler(async (_req, res) => {
      const snapshot = await getConsciousnessSnapshot();
      res.json({
        success: true,
        ...snapshot,
      });
    })
  );

  router.post(
    '/system/consciousness/trigger',
    asyncHandler(async (req, res) => {
      const cycle = req.body?.cycle;
      if (cycle !== 'gim' && cycle !== 'rem') {
        res.status(400).json({
          success: false,
          message: 'cycle must be either "gim" or "rem"',
        });
        return;
      }

      const success = await triggerConsciousnessCycle(cycle);
      const snapshot = await getConsciousnessSnapshot();

      res.status(success ? 200 : 500).json({
        success,
        cycle,
        message: success
          ? `${cycle.toUpperCase()} cycle triggered successfully`
          : `${cycle.toUpperCase()} cycle failed`,
        ...snapshot,
      });
    })
  );

  router.get(
    '/system/collaboration-cycle',
    asyncHandler(async (_req, res) => {
      res.json({
        success: true,
        ...getCollaborationSchedulerStatus(),
      });
    })
  );

  router.post(
    '/system/collaboration-cycle/trigger',
    asyncHandler(async (_req, res) => {
      const report = await runCollaborationCycle();
      const status = getCollaborationSchedulerStatus();

      res.status(report ? 200 : 500).json({
        success: Boolean(report),
        message: report
          ? 'Collaboration cycle completed'
          : 'Collaboration cycle failed',
        ...status,
      });
    })
  );

  router.post(
    '/system/collaboration-cycle/schedule',
    asyncHandler(async (req, res) => {
      const enabled = req.body?.enabled;
      const cron = req.body?.cron;
      const timezone = req.body?.timezone;

      await updateCollaborationSchedule({
        ...(typeof enabled === 'boolean' ? { enabled } : {}),
        ...(typeof cron === 'string' ? { cron } : {}),
        ...(typeof timezone === 'string' ? { timezone } : {}),
      });

      res.json({
        success: true,
        message: 'Collaboration schedule updated',
        ...getCollaborationSchedulerStatus(),
      });
    })
  );

  router.use(
    '/proactive',
    asyncHandler(async (req, res) => {
      const proxiedPath = req.originalUrl.replace(/^\/api\/proactive\/?/, '');
      const targetUrl = `${PROACTIVE_BASE_URL}/${proxiedPath}`;
      const upstreamResponse = await fetch(targetUrl, {
        method: req.method,
        headers: {
          Accept: req.headers.accept || 'application/json',
          'Content-Type':
            req.headers['content-type'] || 'application/json',
        },
        body:
          req.method === 'GET' || req.method === 'HEAD'
            ? undefined
            : JSON.stringify(req.body ?? {}),
      });

      const contentType = upstreamResponse.headers.get('content-type');
      const responseBody = await upstreamResponse.text();

      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      res.status(upstreamResponse.status).send(responseBody);
    })
  );

  // Mount routes
  app.use('/api', router);
}
