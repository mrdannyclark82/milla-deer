/**
 * LAM + SLM Routes
 *
 * Exposes the LAM execution engine and SLM pipeline via REST:
 *
 * POST /api/lam/run          — Run a LAM agentic loop for a goal
 * GET  /api/lam/trajectories — Get trajectory stats
 *
 * POST /api/slm/route        — Route a prompt through the SLM router
 * POST /api/slm/cluster      — Run a clustering pass on usage data
 * GET  /api/slm/stats        — Usage + cluster stats
 * GET  /api/slm/export/:id   — Export fine-tuning data for a cluster
 */

import type { Express, Request, Response } from 'express';
import { runLAMLoop } from '../lam/lamExecutionEngine';
import { getTrajectoryStats } from '../lam/lamTrajectoryCollector';
import { slmRouter } from '../slm/slmRouter';
import { getUsageStats } from '../slm/agentUsageLogger';
import { runClusteringPass, getClusterStats, exportClusterForFineTuning, CLUSTER_DEFINITIONS } from '../slm/taskClusterService';
import { generateGeminiResponse } from '../geminiService';

export function registerLAMRoutes(app: Express): void {

  // ── LAM ──────────────────────────────────────────────────────────────────

  /** POST /api/lam/run — execute a LAM agentic loop */
  app.post('/api/lam/run', async (req: Request, res: Response) => {
    const { goal, source = 'self' } = req.body as { goal?: string; source?: 'expert' | 'self' };
    if (!goal) return res.status(400).json({ error: 'goal is required' });

    try {
      const result = await runLAMLoop(
        goal,
        async (prompt) => {
          const r = await generateGeminiResponse(prompt);
          return r.content;
        },
        source as 'expert' | 'self',
      );
      return res.json({ success: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  });

  /** GET /api/lam/trajectories — trajectory collection stats */
  app.get('/api/lam/trajectories', async (_req: Request, res: Response) => {
    const stats = await getTrajectoryStats();
    return res.json({ success: true, stats: stats || { total: 0, message: 'No trajectories yet' } });
  });

  // ── SLM ──────────────────────────────────────────────────────────────────

  /** POST /api/slm/route — route a single prompt and return which model handled it */
  app.post('/api/slm/route', async (req: Request, res: Response) => {
    const { prompt, execute = false } = req.body as { prompt?: string; execute?: boolean };
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const classification = slmRouter.classify(prompt);

    if (!execute) {
      // Dry run — just return routing decision
      return res.json({ success: true, wouldRoute: classification });
    }

    try {
      const result = await slmRouter.route(prompt, 'api/slm/route', async (p) => {
        const r = await generateGeminiResponse(p);
        return { content: r.content, success: r.success };
      });
      return res.json({ success: true, result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  });

  /** POST /api/slm/cluster — trigger a clustering pass */
  app.post('/api/slm/cluster', async (req: Request, res: Response) => {
    const { limit = 500 } = req.body as { limit?: number };
    try {
      const result = await runClusteringPass(limit);
      return res.json({ success: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  });

  /** GET /api/slm/stats — combined usage + cluster stats */
  app.get('/api/slm/stats', async (_req: Request, res: Response) => {
    const [usage, clusters] = await Promise.all([
      getUsageStats(),
      getClusterStats(),
    ]);
    return res.json({
      success: true,
      usage: usage || { total: 0, message: 'No usage data yet' },
      clusters,
      clusterDefinitions: CLUSTER_DEFINITIONS.map((c) => ({
        id: c.id,
        label: c.label,
        preferredModel: c.preferredModel,
      })),
    });
  });

  /** GET /api/slm/export/:clusterId — export fine-tuning JSONL for a cluster */
  app.get('/api/slm/export/:clusterId', async (req: Request, res: Response) => {
    const { clusterId } = req.params;
    const valid = CLUSTER_DEFINITIONS.find((c) => c.id === clusterId);
    if (!valid) {
      return res.status(404).json({ error: `Unknown cluster: ${clusterId}` });
    }
    try {
      const jsonl = await exportClusterForFineTuning(clusterId);
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', `attachment; filename="${clusterId}_finetune.jsonl"`);
      return res.send(jsonl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  });
}
