import { Router, type Express } from 'express';
import {
  getAllSandboxes,
  getSandbox,
  testFeature,
} from '../sandboxEnvironmentService';
import { asyncHandler } from '../utils/routeHelpers';
import { getGitHubToken } from '../config';

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Milla-Rayne-Sandbox',
  };
  const token = getGitHubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Sandbox and Feature Management Routes
 */
export function registerSandboxRoutes(app: Express) {
  const router = Router();

  router.get(
    '/sandboxes',
    asyncHandler(async (req, res) => {
      const sandboxes = await getAllSandboxes();
      res.json({ success: true, sandboxes });
    })
  );

  router.post(
    '/sandboxes/:sandboxId/features/:featureId/approve',
    asyncHandler(async (req, res) => {
      // Implementation for approval logic (likely in sandbox service)
      res.json({ success: true, message: 'Feature approved' });
    })
  );

  router.post(
    '/sandboxes/:sandboxId/features/:featureId/test',
    asyncHandler(async (req, res) => {
      const testType = req.body.testType || 'unit';
      const result = await testFeature(
        req.params.sandboxId as string,
        req.params.featureId as string,
        testType
      );
      res.json(result);
    })
  );

  router.post(
    '/repo/contents',
    asyncHandler(async (req, res) => {
      const owner = String(req.body.owner || '').trim();
      const repo = String(req.body.repo || '').trim();
      const repoPath = String(req.body.path || '').replace(/^\/+/, '');

      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo are required' });
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`,
        { headers: getGitHubHeaders() }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          error:
            response.status === 401 || response.status === 403
              ? 'GitHub access failed. Check token permissions for this repository.'
              : `Unable to load repository contents: ${errorText || response.statusText}`,
        });
      }

      const payload = await response.json();
      const entries = Array.isArray(payload) ? payload : [payload];
      const nodes = entries.map((entry: any) => ({
        path: entry.path,
        mode: entry.mode || '',
        type: entry.type === 'dir' ? 'tree' : 'blob',
        sha: entry.sha,
        size: entry.size,
        url: `/api/repo/file?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(entry.path)}`,
      }));

      res.json(nodes);
    })
  );

  router.get(
    '/repo/file',
    asyncHandler(async (req, res) => {
      const owner = String(req.query.owner || '').trim();
      const repo = String(req.query.repo || '').trim();
      const repoPath = String(req.query.path || '').replace(/^\/+/, '');

      if (!owner || !repo || !repoPath) {
        return res.status(400).json({ error: 'owner, repo, and path are required' });
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`,
        { headers: getGitHubHeaders() }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          error:
            response.status === 401 || response.status === 403
              ? 'GitHub access failed. Check token permissions for this file.'
              : `Unable to load repository file: ${errorText || response.statusText}`,
        });
      }

      const payload: any = await response.json();
      const decodedContent = Buffer.from(
        String(payload.content || '').replace(/\n/g, ''),
        'base64'
      ).toString('utf8');

      res.type('text/plain').send(decodedContent);
    })
  );

  // Mount routes
  app.use('/api', router);
}
