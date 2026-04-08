import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

const DEERFLOW_BASE = 'http://127.0.0.1:8001';

router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query?: string };
    if (!query?.trim()) {
      res.status(400).json({ error: 'query is required' });
      return;
    }
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 60_000);
    const upstream = await fetch(`${DEERFLOW_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: query }] }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!upstream.ok) {
      res.status(502).json({ error: `DeerFlow upstream error: ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    res.json({ result: data?.messages?.at(-1)?.content ?? JSON.stringify(data) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'DeerFlow proxy error';
    res.status(502).json({ error: msg });
  }
});

export default router;
