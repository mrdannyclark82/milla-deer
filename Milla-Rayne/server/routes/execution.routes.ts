/**
 * Code Execution Routes
 *
 * POST /api/sandbox/execute   – run a snippet in Python, Node.js, or bash
 * POST /api/sandbox/execute/python – run Python code
 * POST /api/sandbox/execute/node   – run Node.js code
 * POST /api/sandbox/execute/bash   – run a bash script
 *
 * POST /api/computer-use/screenshot   – take a browser screenshot
 * POST /api/computer-use/navigate     – navigate browser to URL
 * POST /api/computer-use/click        – click at coord or selector
 * POST /api/computer-use/type         – type text
 * POST /api/computer-use/press-key    – press a keyboard key
 * POST /api/computer-use/scroll       – scroll the page
 * POST /api/computer-use/move-mouse   – move the mouse cursor
 * POST /api/computer-use/find-element – find element & bounding box
 * POST /api/computer-use/analyze      – screenshot + AI analysis
 * GET  /api/computer-use/page-info    – current page URL + title
 * POST /api/computer-use/close        – close the managed browser
 *
 * All code-execution and computer-use routes require an authenticated session
 * (requireAuth middleware) to prevent unauthorized server-side code execution.
 */

import { type Express } from 'express';
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { asyncHandler } from '../utils/routeHelpers';
import { requireAuth } from '../middleware/auth.middleware';
import {
  screenshot,
  navigate,
  click,
  typeText,
  pressKey,
  scroll,
  moveMouse,
  findElement,
  analyzeScreen,
  getPageInfo,
  closeBrowser,
} from '../services/computerUseService';

// ─── Code Execution ──────────────────────────────────────────────────────────

/**
 * EXEC_TIMEOUT_MS: 30 seconds — provides a reasonable window for most code snippets
 * while preventing runaway processes from holding server resources indefinitely.
 * Override via SANDBOX_EXEC_TIMEOUT_MS environment variable.
 */
const EXEC_TIMEOUT_MS = Number(process.env.SANDBOX_EXEC_TIMEOUT_MS ?? 30_000);

/**
 * MAX_OUTPUT_BYTES: 128 KB — sufficient for typical console output while preventing
 * memory exhaustion from programs that produce extremely large output streams.
 * Override via SANDBOX_MAX_OUTPUT_BYTES environment variable.
 */
const MAX_OUTPUT_BYTES = Number(process.env.SANDBOX_MAX_OUTPUT_BYTES ?? 128 * 1024);

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  error?: string;
}

function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; stdinData?: string } = {}
): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;

    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        child.kill('SIGTERM');
        resolve({
          success: false,
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
          exitCode: null,
          timedOut: true,
          error: `Execution timed out after ${EXEC_TIMEOUT_MS / 1000}s`,
        });
      }
    }, EXEC_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += chunk.toString('utf-8');
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += chunk.toString('utf-8');
      }
    });

    if (options.stdinData) {
      child.stdin?.write(options.stdinData);
      child.stdin?.end();
    }

    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        success: (code ?? 1) === 0,
        stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
        stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
        exitCode: code,
      });
    });

    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        success: false,
        stdout: '',
        stderr: err.message,
        exitCode: null,
        error: err.message,
      });
    });
  });
}

async function executePython(code: string): Promise<ExecResult> {
  const tmpFile = join(tmpdir(), `milla_exec_${randomUUID()}.py`);
  try {
    await writeFile(tmpFile, code, 'utf-8');
    return await runProcess('python3', [tmpFile]);
  } finally {
    await unlink(tmpFile).catch(() => undefined);
  }
}

async function executeNode(code: string): Promise<ExecResult> {
  const tmpFile = join(tmpdir(), `milla_exec_${randomUUID()}.mjs`);
  try {
    await writeFile(tmpFile, code, 'utf-8');
    return await runProcess('node', [tmpFile]);
  } finally {
    await unlink(tmpFile).catch(() => undefined);
  }
}

async function executeBash(script: string): Promise<ExecResult> {
  const tmpFile = join(tmpdir(), `milla_exec_${randomUUID()}.sh`);
  try {
    await writeFile(tmpFile, script, 'utf-8');
    return await runProcess('bash', [tmpFile]);
  } finally {
    await unlink(tmpFile).catch(() => undefined);
  }
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerExecutionRoutes(app: Express) {
  /** Generic execute endpoint — detects language from `lang` field */
  app.post(
    '/api/sandbox/execute',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as { code?: unknown; lang?: unknown };
      if (typeof body.code !== 'string' || !body.code.trim()) {
        res.status(400).json({ success: false, error: 'code is required' });
        return;
      }
      const lang = typeof body.lang === 'string' ? body.lang.toLowerCase() : 'node';

      let result: ExecResult;
      if (lang === 'python' || lang === 'py') {
        result = await executePython(body.code);
      } else if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
        result = await executeBash(body.code);
      } else {
        result = await executeNode(body.code);
      }

      res.json(result);
    })
  );

  /** Execute Python code */
  app.post(
    '/api/sandbox/execute/python',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as { code?: unknown };
      if (typeof body.code !== 'string' || !body.code.trim()) {
        res.status(400).json({ success: false, error: 'code is required' });
        return;
      }
      res.json(await executePython(body.code));
    })
  );

  /** Execute Node.js code */
  app.post(
    '/api/sandbox/execute/node',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as { code?: unknown };
      if (typeof body.code !== 'string' || !body.code.trim()) {
        res.status(400).json({ success: false, error: 'code is required' });
        return;
      }
      res.json(await executeNode(body.code));
    })
  );

  /** Execute bash/shell script */
  app.post(
    '/api/sandbox/execute/bash',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as { code?: unknown };
      if (typeof body.code !== 'string' || !body.code.trim()) {
        res.status(400).json({ success: false, error: 'code is required' });
        return;
      }
      res.json(await executeBash(body.code));
    })
  );

  // ─── Computer Use Endpoints ──────────────────────────────────────────────

  /** Take a screenshot of the current (or a given) URL */
  app.post(
    '/api/computer-use/screenshot',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { url } = req.body as { url?: string };
      res.json(await screenshot(url));
    })
  );

  /** Navigate the managed browser to a URL */
  app.post(
    '/api/computer-use/navigate',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { url } = req.body as { url?: string };
      if (typeof url !== 'string' || !url) {
        res.status(400).json({ success: false, error: 'url is required' });
        return;
      }
      res.json(await navigate(url));
    })
  );

  /** Click at a coordinate or CSS selector */
  app.post(
    '/api/computer-use/click',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { x, y, selector, button } = req.body as {
        x?: number;
        y?: number;
        selector?: string;
        button?: 'left' | 'right' | 'middle';
      };
      if (typeof selector === 'string') {
        res.json(await click(selector, undefined, button));
      } else if (typeof x === 'number') {
        res.json(await click(x, y, button));
      } else {
        res.status(400).json({ success: false, error: 'Provide x/y coordinates or selector' });
      }
    })
  );

  /** Type text into focused element or a selector */
  app.post(
    '/api/computer-use/type',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { text, selector, clearFirst } = req.body as {
        text?: string;
        selector?: string;
        clearFirst?: boolean;
      };
      if (typeof text !== 'string') {
        res.status(400).json({ success: false, error: 'text is required' });
        return;
      }
      res.json(await typeText(text, selector, clearFirst));
    })
  );

  /** Press a keyboard key */
  app.post(
    '/api/computer-use/press-key',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { key } = req.body as { key?: string };
      if (typeof key !== 'string') {
        res.status(400).json({ success: false, error: 'key is required' });
        return;
      }
      res.json(await pressKey(key));
    })
  );

  /** Scroll the page */
  app.post(
    '/api/computer-use/scroll',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { direction, amount, selector } = req.body as {
        direction?: 'up' | 'down' | 'left' | 'right';
        amount?: number;
        selector?: string;
      };
      res.json(await scroll(direction, amount, selector));
    })
  );

  /** Move the mouse cursor */
  app.post(
    '/api/computer-use/move-mouse',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { x, y } = req.body as { x?: number; y?: number };
      if (typeof x !== 'number' || typeof y !== 'number') {
        res.status(400).json({ success: false, error: 'x and y are required' });
        return;
      }
      res.json(await moveMouse(x, y));
    })
  );

  /** Find an element by selector */
  app.post(
    '/api/computer-use/find-element',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { selector } = req.body as { selector?: string };
      if (typeof selector !== 'string') {
        res.status(400).json({ success: false, error: 'selector is required' });
        return;
      }
      res.json(await findElement(selector));
    })
  );

  /** Take a screenshot and analyze with AI vision */
  app.post(
    '/api/computer-use/analyze',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { url } = req.body as { url?: string };
      res.json(await analyzeScreen(url));
    })
  );

  /** Get current page URL and title */
  app.get(
    '/api/computer-use/page-info',
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json(await getPageInfo());
    })
  );

  /** Close the managed browser session */
  app.post(
    '/api/computer-use/close',
    requireAuth,
    asyncHandler(async (_req, res) => {
      await closeBrowser();
      res.json({ success: true });
    })
  );
}
