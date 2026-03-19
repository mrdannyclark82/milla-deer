import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerSandboxRoutes } from './sandbox.routes';

vi.mock('../sandboxEnvironmentService', () => ({
  getAllSandboxes: vi.fn().mockResolvedValue([]),
  getSandbox: vi.fn(),
  testFeature: vi.fn().mockResolvedValue({ success: true }),
}));

vi.stubGlobal('fetch', vi.fn());

describe('Sandbox Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerSandboxRoutes(app);
    vi.clearAllMocks();
    vi.mocked(fetch).mockReset();
    delete process.env.GITHUB_TOKEN;
  });

  it('lists repository contents through GitHub', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          path: 'src/index.ts',
          mode: '100644',
          type: 'file',
          sha: 'abc123',
          size: 128,
        },
      ]),
    } as any);

    const response = await request(app)
      .post('/api/repo/contents')
      .send({ owner: 'octocat', repo: 'hello-world', path: 'src' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        path: 'src/index.ts',
        mode: '100644',
        type: 'blob',
        sha: 'abc123',
        size: 128,
        url: '/api/repo/file?owner=octocat&repo=hello-world&path=src%2Findex.ts',
      },
    ]);
  });

  it('returns decoded file contents through the repo file proxy', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: Buffer.from('console.log("hello");').toString('base64'),
      }),
    } as any);

    const response = await request(app).get(
      '/api/repo/file?owner=octocat&repo=hello-world&path=src/index.ts'
    );

    expect(response.status).toBe(200);
    expect(response.text).toBe('console.log("hello");');
  });
});
