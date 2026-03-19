import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { registerSystemRoutes } from './system.routes';
import { agentController } from '../agentController';
import { circuitBreaker } from '../apiResilience';
import * as selfEvolution from '../selfEvolutionService';
import * as metacognitiveService from '../metacognitiveService';
import * as memoryScheduler from '../memorySummarizationScheduler';
import * as consciousnessScheduler from '../consciousnessScheduler';
import * as repositoryDiscoveryScheduler from '../repositoryDiscoveryScheduler';
import * as collaborationScheduler from '../collaborationScheduler';
import * as mcpRuntimeService from '../mcpRuntimeService';
import * as shellExecutionService from '../shellExecutionService';
import * as replycaSocialBridgeService from '../replycaSocialBridgeService';
import { config } from '../config';

vi.mock('../agentController');
vi.mock('../apiResilience');
vi.mock('../metacognitiveService');
vi.mock('../memorySummarizationScheduler');
vi.mock('../consciousnessScheduler');
vi.mock('../repositoryDiscoveryScheduler');
vi.mock('../collaborationScheduler');
vi.mock('../selfEvolutionService');
vi.mock('../moodService');
vi.mock('../mcpRuntimeService');
vi.mock('../shellExecutionService');
vi.mock('../replycaSocialBridgeService');
vi.stubGlobal('fetch', vi.fn());

describe('System Routes', () => {
  let app: express.Express;
  let replycaFixtureRoot: string;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerSystemRoutes(app);
    vi.clearAllMocks();
    vi.mocked(fetch).mockReset();
    delete process.env.ADMIN_TOKEN;
    replycaFixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'replyca-fixture-'));
    mkdirSync(path.join(replycaFixtureRoot, 'core_os', 'memory', 'thought_archives'), {
      recursive: true,
    });
    writeFileSync(
      path.join(replycaFixtureRoot, 'core_os', 'memory', 'stream_of_consciousness.md'),
      '### 💭 GIM Session: 2026-03-16 04:00:00\nA saved internal monologue.\n'
    );
    writeFileSync(
      path.join(replycaFixtureRoot, 'core_os', 'memory', 'neuro_state_v2.json'),
      JSON.stringify({
        atp_energy: 98.2,
        adenosine: 0.15,
        pain_level: 0,
        journal: ['entry-one'],
        events_buffer: [{ type: 'visual_stimulus' }],
        plasticity_buffer: [{ type: 'memory' }],
        chemicals: { dopamine: 0.6 },
      })
    );

    // Default mocks
    vi.spyOn(circuitBreaker, 'getStatus').mockReturnValue({});
    vi.spyOn(metacognitiveService, 'getSCPAQueueStatus').mockReturnValue({
      queueSize: 0,
      criticalFailures: 0,
    } as any);
    vi.spyOn(memoryScheduler, 'getSchedulerStatus').mockReturnValue({
      isRunning: false,
      successRate: 1,
    } as any);
    vi.spyOn(
      consciousnessScheduler,
      'getConsciousnessSchedulerStatus'
    ).mockReturnValue({
      isInitialized: true,
      replycaRoot: replycaFixtureRoot,
      replycaResolved: true,
      gimEnabled: true,
      remEnabled: true,
      gimCron: '0 */4 * * *',
      remCron: '0 2 * * *',
      cycles: {
        gim: { totalRuns: 1, successfulRuns: 1, lastError: null },
        rem: { totalRuns: 1, successfulRuns: 1, lastError: null },
      },
    } as any);
    vi.spyOn(
      repositoryDiscoveryScheduler,
      'getRepositoryDiscoverySchedulerStatus'
    ).mockReturnValue({
      isScheduled: true,
      isRunning: false,
      enabled: true,
      cron: '0 */6 * * *',
      maxReposPerCycle: 10,
      totalRuns: 2,
      successfulRuns: 2,
      lastError: null,
    } as any);
    vi.spyOn(
      collaborationScheduler,
      'getCollaborationSchedulerStatus'
    ).mockReturnValue({
      isInitialized: true,
      isScheduled: true,
      isRunning: false,
      settings: {
        enabled: true,
        cron: '0 8 * * *',
        timezone: 'America/Chicago',
      },
      lastRunAt: 1710000000000,
      lastSuccessAt: 1710000300000,
      lastError: null,
      totalRuns: 3,
      successfulRuns: 3,
      latestReport: {
        generatedAt: 1710000300000,
        repoPath: '/repo',
        proactive: {
          discoveredCount: 4,
          recommendedCount: 2,
          topRecommendations: ['Daily collaboration report'],
          scheduler: {
            isScheduled: true,
            isRunning: false,
            cron: '0 */6 * * *',
            enabled: true,
            maxReposPerCycle: 10,
            lastRunAt: 1710000000000,
            lastSuccessAt: 1710000200000,
            lastError: null,
            totalRuns: 2,
            successfulRuns: 2,
          },
        },
        sarii: {
          success: true,
          suggestion: {
            feature_name: 'Daily collaboration report',
            reasoning: 'Create a daily engineering brief from scheduler data.',
            code_snippet: '# planner only',
            pr_title: 'feat: add daily collaboration brief',
          },
          syncedFeatureId: 'feat_sync_1',
          error: null,
        },
      },
    } as any);
    vi.spyOn(collaborationScheduler, 'runCollaborationCycle').mockResolvedValue({
      generatedAt: 1710000400000,
      repoPath: '/repo',
      proactive: {
        discoveredCount: 5,
        recommendedCount: 3,
        topRecommendations: ['Daily collaboration report'],
        scheduler: {
          isScheduled: true,
          isRunning: false,
          cron: '0 */6 * * *',
          enabled: true,
          maxReposPerCycle: 10,
          lastRunAt: 1710000000000,
          lastSuccessAt: 1710000200000,
          lastError: null,
          totalRuns: 2,
          successfulRuns: 2,
        },
      },
      sarii: {
        success: true,
        suggestion: {
          feature_name: 'Daily collaboration report',
          reasoning: 'Create a daily engineering brief from scheduler data.',
          code_snippet: '# planner only',
          pr_title: 'feat: add daily collaboration brief',
        },
        syncedFeatureId: 'feat_sync_1',
        error: null,
      },
    } as any);
    vi.spyOn(
      collaborationScheduler,
      'updateCollaborationSchedule'
    ).mockResolvedValue(undefined);
    vi.spyOn(
      replycaSocialBridgeService,
      'getReplycaSocialStatus'
    ).mockResolvedValue({
      replycaRoot: replycaFixtureRoot,
      sharedChatPath: path.join(
        replycaFixtureRoot,
        'core_os',
        'memory',
        'shared_chat.jsonl'
      ),
      statePath: path.join(replycaFixtureRoot, 'replyca_social_bridge.json'),
      sharedChatExists: false,
      totalLines: 0,
      importedLineCount: 0,
      pendingLines: 0,
      importedMessages: 0,
      lastSyncedAt: null,
    });
    vi.spyOn(
      replycaSocialBridgeService,
      'syncReplycaSharedHistory'
    ).mockResolvedValue({
      replycaRoot: replycaFixtureRoot,
      sharedChatPath: path.join(
        replycaFixtureRoot,
        'core_os',
        'memory',
        'shared_chat.jsonl'
      ),
      statePath: path.join(replycaFixtureRoot, 'replyca_social_bridge.json'),
      sharedChatExists: true,
      totalLines: 2,
      importedLineCount: 2,
      pendingLines: 0,
      importedMessages: 2,
      lastSyncedAt: 1710000500000,
      synced: true,
      importedThisRun: 2,
    });
    vi.spyOn(mcpRuntimeService, 'getMcpRuntimeStatus').mockReturnValue({
      enabled: true,
      initialized: true,
      initializedAt: 1710000000000,
      connectedServerCount: 1,
      servers: [
        {
          id: 'huggingface',
          name: 'Hugging Face MCP',
          enabled: true,
          configured: true,
          connected: true,
          command: 'node',
          args: ['node_modules/.bin/huggingface-mcp-server', '--transport', 'stdio'],
          transport: 'stdio',
          toolCount: 2,
          tools: ['generate_image', 'generate_story'],
          lastError: null,
        },
      ],
    });
    vi.spyOn(mcpRuntimeService, 'listMcpTools').mockResolvedValue([
      {
        serverId: 'huggingface',
        serverName: 'Hugging Face MCP',
        name: 'generate_image',
        description: 'Generate an image',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
          },
        },
      },
    ]);
    vi.spyOn(mcpRuntimeService, 'invokeMcpTool').mockResolvedValue({
      serverId: 'huggingface',
      toolName: 'generate_image',
      result: {
        content: [{ type: 'text', text: 'ok' }],
      },
    });
    vi.spyOn(shellExecutionService, 'getShellRunnerStatus').mockReturnValue({
      enabled: true,
      requiresAdminToken: false,
      activeRunId: 'run-1',
      queuedRunIds: ['run-2'],
      queueLength: 1,
      activeRun: null,
      queuedRuns: [],
      availableCommands: [
        {
          id: 'workspace-check',
          label: 'Workspace check',
          description: 'Run the workspace TypeScript smoke check.',
          cwd: '/repo',
        },
      ],
      recentRuns: [],
    });
    vi.spyOn(shellExecutionService, 'getShellRunnerSummary').mockReturnValue({
      enabled: true,
      requiresAdminToken: false,
      activeRunId: 'run-1',
      queuedRunIds: ['run-2'],
      queueLength: 1,
      availableCommands: [
        {
          id: 'workspace-check',
          label: 'Workspace check',
          description: 'Run the workspace TypeScript smoke check.',
          cwd: '/repo',
        },
      ],
    });
    vi.spyOn(shellExecutionService, 'enqueueAllowedShellCommand').mockResolvedValue({
      runId: 'run-1',
      commandId: 'workspace-check',
      label: 'Workspace check',
      command: 'npm run check',
      status: 'running',
      startedAt: 1710000000000,
      finishedAt: null,
      durationMs: null,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
    });
    vi.spyOn(shellExecutionService, 'getShellRun').mockImplementation((runId) =>
      runId === 'run-1'
        ? ({
            runId: 'run-1',
            commandId: 'workspace-check',
            label: 'Workspace check',
            command: 'npm run check',
            status: 'running',
            startedAt: 1710000000000,
            finishedAt: null,
            durationMs: null,
            exitCode: null,
            stdout: 'partial output',
            stderr: '',
            error: null,
          } as any)
        : null
    );
    vi.spyOn(shellExecutionService, 'cancelShellCommand').mockResolvedValue({
      runId: 'run-1',
      commandId: 'workspace-check',
      label: 'Workspace check',
      command: 'npm run check',
      status: 'cancelling',
      startedAt: 1710000000000,
      finishedAt: null,
      durationMs: null,
      exitCode: null,
      stdout: 'partial output',
      stderr: '',
      error: 'Cancellation requested by user.',
    } as any);
    vi.spyOn(shellExecutionService, 'subscribeToShellRun').mockImplementation(
      (_runId, listener) => {
        listener({
          type: 'snapshot',
          run: {
            runId: 'run-1',
            commandId: 'workspace-check',
            label: 'Workspace check',
            command: 'npm run check',
            status: 'running',
            startedAt: 1710000000000,
            finishedAt: null,
            durationMs: null,
            exitCode: null,
            stdout: 'partial output',
            stderr: '',
            error: null,
          },
        });
        return vi.fn();
      }
    );
    delete process.env.ADMIN_TOKEN;
  });

  describe('GET /api/monitoring/health', () => {
    it('should return system health', async () => {
      vi.spyOn(agentController, 'getAllMetrics').mockReturnValue({});
      vi.spyOn(agentController, 'getRegisteredAgents').mockReturnValue([]);

      const response = await request(app).get('/api/monitoring/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.health).toBe('healthy');
    });
  });

  describe('GET /api/self-improvement/status', () => {
    it('should return evolution status', async () => {
      vi.spyOn(selfEvolution, 'getServerEvolutionStatus').mockReturnValue({
        isRunning: false,
      } as any);

      const response = await request(app).get('/api/self-improvement/status');

      expect(response.status).toBe(200);
      expect(response.body.server.isRunning).toBe(false);
    });
  });

  describe('GET /api/proactive/*', () => {
    it('should proxy proactive feature requests through the main app', async () => {
      vi.mocked(fetch).mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(
          JSON.stringify({ success: true, features: [] })
        ),
      } as any);

      const response = await request(app).get(
        '/api/proactive/api/milla/features/discovered'
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, features: [] });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/milla/features/discovered',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('GET /api/system/config-status', () => {
    it('should return config diagnostics and integration checks', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: vi.fn().mockResolvedValue(JSON.stringify({ status: 'ok' })),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo, workflow' }),
          json: vi.fn().mockResolvedValue({ login: 'tester' }),
        } as any);

      process.env.GITHUB_TOKEN = 'ghp_test_token';

      const response = await request(app).get('/api/system/config-status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.integrationChecks.proactive.reachable).toBe(true);
      expect(response.body.integrationChecks.github.configured).toBe(true);
      expect(response.body.integrationChecks.github.valid).toBe(true);
      expect(response.body.integrationChecks.shell.enabled).toBe(true);
      expect(response.body.integrationChecks.shell.queueLength).toBe(1);
      expect(response.body.integrationChecks.mcp.connectedServerCount).toBe(1);
      expect(response.body.integrationChecks.consciousness.isInitialized).toBe(
        true
      );
      expect(
        response.body.integrationChecks.repositoryDiscovery.isScheduled
      ).toBe(true);
      expect(response.body.integrationChecks.collaboration.isScheduled).toBe(true);
      expect(response.body.integrationChecks.replycaSocial.replycaRoot).toBe(
        replycaFixtureRoot
      );

      delete process.env.GITHUB_TOKEN;
    });
  });

  describe('ReplycA social bridge routes', () => {
    it('should expose ReplycA social bridge status', async () => {
      const response = await request(app).get('/api/system/replyca-social');

      expect(response.status).toBe(200);
      expect(response.body.replycaRoot).toBe(replycaFixtureRoot);
      expect(replycaSocialBridgeService.getReplycaSocialStatus).toHaveBeenCalled();
    });

    it('should trigger a ReplycA social sync', async () => {
      const response = await request(app).post('/api/system/replyca-social/sync');

      expect(response.status).toBe(200);
      expect(response.body.synced).toBe(true);
      expect(replycaSocialBridgeService.syncReplycaSharedHistory).toHaveBeenCalled();
    });
  });

  describe('GET /api/system/context-window-status', () => {
    it('should return current context window settings', async () => {
      const response = await request(app).get('/api/system/context-window-status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.settings.routeHistoryMaxMessages).toBeGreaterThan(0);
      expect(response.body.settings.memoryContextMaxChars).toBeGreaterThan(0);
    });
  });

  describe('GET /api/system/network-access', () => {
    it('should return recommended LAN access URLs', async () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true,
            cidr: '127.0.0.1/8',
          },
        ],
        eth0: [
          {
            address: '192.168.40.117',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '192.168.40.117/24',
          },
        ],
      } as any);

      const response = await request(app)
        .get('/api/system/network-access')
        .set('Host', '127.0.0.1:5000');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.privateIpv4Candidates).toContain('192.168.40.117');
      expect(response.body.recommendedUrl).toBe('http://192.168.40.117:5000');
      expect(response.body.loopbackUrl).toBe('http://127.0.0.1:5000');
    });
  });

  describe('GET /api/system/browser-targets', () => {
    it('should return curated browser targets for supervised computer use', async () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true,
            cidr: '127.0.0.1/8',
          },
        ],
        eth0: [
          {
            address: '192.168.40.117',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '192.168.40.117/24',
          },
        ],
      } as any);

      const response = await request(app)
        .get('/api/system/browser-targets')
        .set('Host', '127.0.0.1:5000');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'local-app',
            url: 'http://127.0.0.1:5000',
            category: 'app',
          }),
          expect.objectContaining({
            id: 'lan-app',
            url: 'http://192.168.40.117:5000',
            category: 'remote',
          }),
          expect.objectContaining({
            id: 'collaboration-cycle',
            url: 'http://127.0.0.1:5000/api/system/collaboration-cycle',
            category: 'system',
          }),
          expect.objectContaining({
            id: 'proactive-recommendations',
            url: 'http://localhost:5001/recommendations',
            category: 'proactive',
          }),
        ])
      );
    });
  });

  describe('GET /api/system/mcp-status', () => {
    it('should return MCP runtime status', async () => {
      const response = await request(app).get('/api/system/mcp-status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.connectedServerCount).toBe(1);
      expect(response.body.servers[0].id).toBe('huggingface');
    });
  });

  describe('GET /api/system/mcp-tools', () => {
    it('should list MCP tools without an admin token', async () => {
      const response = await request(app).get('/api/system/mcp-tools');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should list MCP tools for admins', async () => {
      const response = await request(app)
        .get('/api/system/mcp-tools')
        .set('x-admin-token', 'secret-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tools[0].name).toBe('generate_image');
    });
  });

  describe('POST /api/system/mcp-call', () => {
    it('should invoke MCP tools without an admin token', async () => {
      const response = await request(app).post('/api/system/mcp-call').send({
        serverId: 'huggingface',
        toolName: 'generate_image',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should invoke MCP tools for admins', async () => {
      const response = await request(app)
        .post('/api/system/mcp-call')
        .set('x-admin-token', 'secret-token')
        .send({
          serverId: 'huggingface',
          toolName: 'generate_image',
          args: { prompt: 'nebula wolf' },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mcpRuntimeService.invokeMcpTool).toHaveBeenCalledWith(
        'huggingface',
        'generate_image',
        { prompt: 'nebula wolf' }
      );
    });
  });

  describe('GET /api/system/shell-status', () => {
    it('should return shell runner status', async () => {
      const response = await request(app)
        .get('/api/system/shell-status')
        .set('x-admin-token', 'secret-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.availableCommands[0].id).toBe('workspace-check');
    });

    it('should return shell status without an admin token', async () => {
      const response = await request(app).get('/api/system/shell-status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/system/shell/run', () => {
    it('should enqueue an allowlisted shell command', async () => {
      const response = await request(app)
        .post('/api/system/shell/run')
        .send({ commandId: 'workspace-check' });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(shellExecutionService.enqueueAllowedShellCommand).toHaveBeenCalledWith(
        'workspace-check'
      );
    });

    it('should enqueue a shell command without an admin token', async () => {
      const response = await request(app)
        .post('/api/system/shell/run')
        .send({ commandId: 'workspace-check' });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/system/shell/runs/:runId', () => {
    it('should return a shell run by id', async () => {
      const response = await request(app)
        .get('/api/system/shell/runs/run-1')
        .set('x-admin-token', 'secret-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.run.runId).toBe('run-1');
    });
  });

  describe('POST /api/system/shell/cancel', () => {
    it('should cancel a shell run', async () => {
      const response = await request(app)
        .post('/api/system/shell/cancel')
        .set('x-admin-token', 'secret-token')
        .send({ runId: 'run-1' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(shellExecutionService.cancelShellCommand).toHaveBeenCalledWith('run-1');
    });
  });

  describe('GET /api/system/shell/stream/:runId', () => {
    it('should stream shell run events as SSE', async () => {
      const response = await request(app)
        .get('/api/system/shell/stream/run-1?once=true')
        .set('x-admin-token', 'secret-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.text).toContain('event: snapshot');
    });
  });

  describe('GET /api/system/consciousness', () => {
    it('should return stored GIM and REM snapshot data', async () => {
      const response = await request(app).get('/api/system/consciousness');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.storage.available).toBe(true);
      expect(response.body.storage.gim.exists).toBe(true);
      expect(response.body.storage.gim.latestPreview).toContain('saved internal monologue');
      expect(response.body.storage.rem.summary.atpEnergy).toBe(98.2);
      expect(response.body.storage.rem.summary.journalEntries).toBe(1);
    });
  });

  describe('POST /api/system/consciousness/trigger', () => {
    it('should trigger a consciousness cycle', async () => {
      vi.spyOn(
        consciousnessScheduler,
        'triggerConsciousnessCycle'
      ).mockResolvedValue(true);

      const response = await request(app)
        .post('/api/system/consciousness/trigger')
        .send({ cycle: 'gim' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.cycle).toBe('gim');
      expect(consciousnessScheduler.triggerConsciousnessCycle).toHaveBeenCalledWith(
        'gim'
      );
    });
  });

  describe('GET /api/system/collaboration-cycle', () => {
    it('should return collaboration scheduler status', async () => {
      const response = await request(app).get('/api/system/collaboration-cycle');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isScheduled).toBe(true);
      expect(response.body.latestReport.sarii.syncedFeatureId).toBe('feat_sync_1');
    });
  });

  describe('POST /api/system/collaboration-cycle/trigger', () => {
    it('should trigger a collaboration cycle', async () => {
      const response = await request(app).post(
        '/api/system/collaboration-cycle/trigger'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Collaboration cycle completed');
      expect(collaborationScheduler.runCollaborationCycle).toHaveBeenCalled();
    });
  });

  describe('POST /api/system/collaboration-cycle/schedule', () => {
    it('should update the collaboration schedule', async () => {
      const response = await request(app)
        .post('/api/system/collaboration-cycle/schedule')
        .send({ enabled: true, cron: '0 9 * * *', timezone: 'America/Chicago' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(collaborationScheduler.updateCollaborationSchedule).toHaveBeenCalledWith({
        enabled: true,
        cron: '0 9 * * *',
        timezone: 'America/Chicago',
      });
    });
  });
});
