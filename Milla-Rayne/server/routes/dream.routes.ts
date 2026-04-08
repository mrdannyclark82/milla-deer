import { type Express } from 'express';
import { asyncHandler } from '../utils/routeHelpers';
import { requireAuth } from '../middleware/auth.middleware';
import * as fs from 'fs';

const NEURO_STATE = '/home/nexus/ogdray/core_os/memory/neuro_state.json';
const GIM_JOURNAL = '/home/nexus/ogdray/core_os/memory/gim_journal.md';
const STREAM_FILE  = '/home/nexus/ogdray/stream_of_consciousness.md';
const DREAM_LOG    = '/home/nexus/ogdray/core_os/memory/dream_log.md';

export function registerDreamRoutes(app: Express): void {
  // Current neuro state
  app.get('/api/dream/neuro', requireAuth, asyncHandler(async (_req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(NEURO_STATE, 'utf8')) as Record<string, number>;
      res.json(data);
    } catch {
      res.json({ dopamine: 0.5, serotonin: 0.5, cortisol: 0.3, oxytocin: 0.5, energy: 0.6 });
    }
  }));

  // Recent GIM entries
  app.get('/api/dream/gim', requireAuth, asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 20;
    try {
      const content = fs.readFileSync(GIM_JOURNAL, 'utf8');
      const entries = content.split(/\n---\n|\n\n/).filter(Boolean).slice(-limit).reverse();
      res.json({ entries, count: entries.length });
    } catch {
      res.json({ entries: [], count: 0 });
    }
  }));

  // Stream of consciousness entries
  app.get('/api/dream/stream', requireAuth, asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 30;
    try {
      const content = fs.readFileSync(STREAM_FILE, 'utf8');
      const lines = content.split('\n').filter(l => l.trim().startsWith('>')).slice(-limit).reverse();
      res.json({ lines, count: lines.length });
    } catch {
      res.json({ lines: [], count: 0 });
    }
  }));

  // Dream log
  app.get('/api/dream/log', requireAuth, asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    try {
      const content = fs.existsSync(DREAM_LOG) ? fs.readFileSync(DREAM_LOG, 'utf8') : '';
      const entries = content
        .split(/\n## /)
        .filter(Boolean)
        .slice(-limit)
        .reverse()
        .map(e => '## ' + e.trim());
      res.json({ entries, count: entries.length });
    } catch {
      res.json({ entries: [], count: 0 });
    }
  }));
}
