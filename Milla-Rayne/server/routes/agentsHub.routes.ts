import { type Express } from 'express';
import { asyncHandler } from '../utils/routeHelpers';
import { requireAuth } from '../middleware/auth.middleware';

const AGENT_SERVER = 'http://localhost:7788';

export function registerAgentsHubRoutes(app: Express): void {
  // List all available agents from .copilot/agents/
  app.get('/api/agents-hub/catalog', requireAuth, asyncHandler(async (_req, res) => {
    const response = await fetch(`${AGENT_SERVER}/agents/catalog`, { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    res.json(data);
  }));

  // Invoke an agent with a prompt
  app.post('/api/agents-hub/invoke', requireAuth, asyncHandler(async (req, res) => {
    const { agentId, prompt } = req.body as { agentId: string; prompt: string };
    if (!agentId || !prompt) {
      res.status(400).json({ error: 'agentId and prompt are required' });
      return;
    }
    const url = new URL(`${AGENT_SERVER}/agents/invoke`);
    url.searchParams.set('agent_id', agentId);
    url.searchParams.set('prompt', prompt);
    const response = await fetch(url.toString(), { method: 'POST', signal: AbortSignal.timeout(60000) });
    const data = await response.json();
    res.json(data);
  }));
}
