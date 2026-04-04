import { type Express, type Request, type Response } from 'express';
import {
  readdir, stat, readFile, writeFile, mkdir, unlink, rename,
} from 'fs/promises';
import path from 'path';
import { requireAuth } from '../middleware/auth.middleware';

// Sandbox root — all file ops are confined to this directory
const WORKSPACE_ROOT = path.resolve(process.cwd());

/** Ensure the resolved path stays inside WORKSPACE_ROOT */
function safePath(requestedPath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, requestedPath.replace(/^\/+/, ''));
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Path traversal denied');
  }
  return resolved;
}

function relPath(abs: string) {
  return abs.slice(WORKSPACE_ROOT.length) || '/';
}

export function registerFilesRoutes(app: Express) {
  // GET /api/files/browse?path=<relative>  — list directory contents
  app.get('/api/files/browse', requireAuth, async (req: Request, res: Response) => {
    try {
      const dir = safePath((req.query.path as string) || '/');
      const entries = await readdir(dir, { withFileTypes: true });
      const items = await Promise.all(
        entries.map(async (e) => {
          const fullPath = path.join(dir, e.name);
          const info = await stat(fullPath).catch(() => null);
          return {
            name: e.name,
            path: relPath(fullPath),
            type: e.isDirectory() ? 'dir' : 'file',
            size: info?.size ?? 0,
            modified: info?.mtime?.toISOString() ?? null,
          };
        }),
      );
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      res.json({ ok: true, path: relPath(dir), items });
    } catch (err: any) {
      res.status(err.message === 'Path traversal denied' ? 403 : 500)
        .json({ ok: false, error: err.message });
    }
  });

  // GET /api/files/read?path=<relative>  — read file contents
  app.get('/api/files/read', requireAuth, async (req: Request, res: Response) => {
    try {
      const filePath = safePath((req.query.path as string) || '');
      const info = await stat(filePath);
      if (info.isDirectory()) {
        return res.status(400).json({ ok: false, error: 'Path is a directory' });
      }
      if (info.size > 5 * 1024 * 1024) {
        return res.status(413).json({ ok: false, error: 'File too large (>5MB)' });
      }
      const content = await readFile(filePath, 'utf-8');
      res.json({ ok: true, path: relPath(filePath), content, size: info.size });
    } catch (err: any) {
      res.status(err.message === 'Path traversal denied' ? 403 : 500)
        .json({ ok: false, error: err.message });
    }
  });

  // POST /api/files/write  — create or overwrite a file
  app.post('/api/files/write', requireAuth, async (req: Request, res: Response) => {
    try {
      const { path: filePath, content = '' } = req.body as { path: string; content?: string };
      if (!filePath) return res.status(400).json({ ok: false, error: 'path required' });
      const abs = safePath(filePath);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf-8');
      res.json({ ok: true, path: relPath(abs) });
    } catch (err: any) {
      res.status(err.message === 'Path traversal denied' ? 403 : 500)
        .json({ ok: false, error: err.message });
    }
  });

  // POST /api/files/mkdir  — create a directory
  app.post('/api/files/mkdir', requireAuth, async (req: Request, res: Response) => {
    try {
      const { path: dirPath } = req.body as { path: string };
      if (!dirPath) return res.status(400).json({ ok: false, error: 'path required' });
      const abs = safePath(dirPath);
      await mkdir(abs, { recursive: true });
      res.json({ ok: true, path: relPath(abs) });
    } catch (err: any) {
      res.status(err.message === 'Path traversal denied' ? 403 : 500)
        .json({ ok: false, error: err.message });
    }
  });

  // POST /api/files/rename  — rename or move a file/dir
  app.post('/api/files/rename', requireAuth, async (req: Request, res: Response) => {
    try {
      const { from, to } = req.body as { from: string; to: string };
      if (!from || !to) return res.status(400).json({ ok: false, error: 'from and to required' });
      const absFrom = safePath(from);
      const absTo = safePath(to);
      await rename(absFrom, absTo);
      res.json({ ok: true, from: relPath(absFrom), to: relPath(absTo) });
    } catch (err: any) {
      res.status(err.message === 'Path traversal denied' ? 403 : 500)
        .json({ ok: false, error: err.message });
    }
  });

  // DELETE /api/files/delete  — delete a file
  app.delete('/api/files/delete', requireAuth, async (req: Request, res: Response) => {
    try {
      const filePath = (req.query.path as string) || (req.body as any)?.path;
      if (!filePath) return res.status(400).json({ ok: false, error: 'path required' });
      const abs = safePath(filePath);
      await unlink(abs);
      res.json({ ok: true, path: relPath(abs) });
    } catch (err: any) {
      res.status(err.message === 'Path traversal denied' ? 403 : 500)
        .json({ ok: false, error: err.message });
    }
  });

  // GET /api/files/stat?path=<relative>  — file/dir metadata
  app.get('/api/files/stat', requireAuth, async (req: Request, res: Response) => {
    try {
      const filePath = safePath((req.query.path as string) || '/');
      const info = await stat(filePath);
      res.json({
        ok: true,
        path: relPath(filePath),
        type: info.isDirectory() ? 'dir' : 'file',
        size: info.size,
        modified: info.mtime.toISOString(),
        created: info.birthtime.toISOString(),
      });
    } catch (err: any) {
      res.status(err.message === 'Path traversal denied' ? 403 : 500)
        .json({ ok: false, error: err.message });
    }
  });
}
