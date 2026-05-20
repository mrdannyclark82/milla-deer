import { Router, type Express } from 'express';
import { asyncHandler } from '../utils/routeHelpers';
import { indexFromFile, bootstrapRagIndex } from '../services/ragAutoIndexer';
import { semanticSearchMemories } from '../memoryService';
import { vectorDB } from '../vectorDBService';

export function registerRagRoutes(app: Express) {
  const router = Router();

  /**
   * GET /api/rag/status
   * Returns vector store entry count.
   */
  router.get(
    '/rag/status',
    asyncHandler(async (_req, res) => {
      const size = await vectorDB.getStoreSize();
      res.json({ entries: size });
    })
  );

  /**
   * POST /api/rag/search
   * Body: { query: string, topK?: number, userId?: string }
   */
  router.post(
    '/rag/search',
    asyncHandler(async (req, res) => {
      const {
        query,
        topK = 5,
        userId = 'default-user',
      } = req.body as {
        query: string;
        topK?: number;
        userId?: string;
      };
      if (!query) {
        res.status(400).json({ error: 'query is required' });
        return;
      }
      const results = await semanticSearchMemories(query, {
        userId,
        topK,
        minSimilarity: 0.5,
      });
      res.json({ results });
    })
  );

  /**
   * POST /api/rag/index/file
   * Body: { path: string, type?: 'memory'|'conversation', userId?: string }
   * Index an arbitrary file into the vector store.
   */
  router.post(
    '/rag/index/file',
    asyncHandler(async (req, res) => {
      const {
        path: filePath,
        type = 'memory',
        userId = 'default-user',
      } = req.body as {
        path: string;
        type?: 'memory' | 'conversation';
        userId?: string;
      };

      if (!filePath) {
        res.status(400).json({ error: 'path is required' });
        return;
      }
      const count = await indexFromFile(filePath, type, userId);
      res.json({ indexed: count });
    })
  );

  /**
   * POST /api/rag/bootstrap
   * Re-run the bootstrap indexer (memories.txt + shared_chat.jsonl + stream_of_consciousness.md).
   */
  router.post(
    '/rag/bootstrap',
    asyncHandler(async (req, res) => {
      const { userId = 'default-user' } = req.body as { userId?: string };
      // Force re-index regardless of store size
      const { indexFromFile: idx } = await import('../services/ragAutoIndexer');
      const sources = [
        {
          path: `${process.cwd()}/memory/memories.txt`,
          type: 'memory' as const,
        },
        {
          path: `${process.cwd()}/ReplycA/core_os/memory/shared_chat.jsonl`,
          type: 'conversation' as const,
        },
        {
          path: `${process.cwd()}/ReplycA/core_os/memory/stream_of_consciousness.md`,
          type: 'memory' as const,
        },
      ];
      let total = 0;
      for (const src of sources) total += await idx(src.path, src.type, userId);
      res.json({ indexed: total });
    })
  );

  app.use('/api', router);
}
