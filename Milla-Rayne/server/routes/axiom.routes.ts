import type { Express, Request, Response } from 'express';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { asyncHandler } from '../utils/routeHelpers';
import { requireAuth } from '../middleware/auth.middleware';
import {
  CANONICAL_AI_MODELS,
  DEFAULT_CHAT_MODEL,
  isSupportedAIModel,
} from '../aiModelPreferences';

const REPO_ROOT = '/home/nexus/ogdray/Milla-Deer';
const MEMORY_DIR = path.join(REPO_ROOT, 'memory');
const LOGS_DIR = path.join(REPO_ROOT, 'Milla-Rayne', 'logs');
const BACKUPS_DIR = '/home/nexus/backups';
const NEURO_STATE_PATH = '/home/nexus/ogdray/neuro_state.json';

const COMMAND_ALLOWLIST = new Set([
  'ls', 'pwd', 'df', 'free', 'uptime', 'whoami', 'ps', 'cat', 'echo',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function shellExec(
  cmd: string,
  cwd?: string,
  timeoutMs = 30_000
): { ok: true; stdout: string } | { ok: false; error: string } {
  try {
    const stdout = execSync(cmd, {
      cwd: cwd ?? REPO_ROOT,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (e: unknown) {
    const err = e as { message?: string; stderr?: Buffer | string };
    const detail = err.stderr
      ? (Buffer.isBuffer(err.stderr) ? err.stderr.toString() : err.stderr)
      : (err.message ?? String(e));
    return { ok: false, error: detail.toString().trim() };
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function readMemoryJson<T>(filename: string, fallback: T): T {
  return readJson(path.join(MEMORY_DIR, filename), fallback);
}

function writeMemoryJson(filename: string, data: unknown): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
  fs.writeFileSync(
    path.join(MEMORY_DIR, filename),
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

/** Returns the resolved path if it is safely inside REPO_ROOT, else null. */
function assertRepoPath(rawPath: string): string | null {
  const resolved = path.resolve(REPO_ROOT, rawPath.replace(/^\//, ''));
  return resolved.startsWith(REPO_ROOT + path.sep) || resolved === REPO_ROOT
    ? resolved
    : null;
}

function sseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function sseWrite(res: Response, line: string): void {
  res.write(`data: ${JSON.stringify(line)}\n\n`);
}

/** Run a python3 script by writing it to stdin; resolves with stdout/stderr combined. */
function spawnPython(script: string): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-'], { stdio: 'pipe' });
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', (code) => {
      resolve({ ok: code === 0, stdout: out.trim() });
    });
    proc.stdin.write(script);
    proc.stdin.end();
  });
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerAxiomRoutes(app: Express): void {

  // ── GIT ──────────────────────────────────────────────────────────────────

  app.get('/api/git/status', requireAuth, asyncHandler(async (_req, res) => {
    const status = shellExec('git status --short', REPO_ROOT);
    const branch = shellExec('git branch --show-current', REPO_ROOT);
    if (!status.ok) return res.json({ ok: false, error: status.error });
    return res.json({
      ok: true,
      status: status.stdout,
      branch: branch.ok ? branch.stdout : '',
    });
  }));

  app.get('/api/git/log', requireAuth, asyncHandler(async (req, res) => {
    const n = Math.min(parseInt(String(req.query.n ?? '20'), 10) || 20, 100);
    const result = shellExec(`git log --oneline -${n}`, REPO_ROOT);
    if (!result.ok) return res.json({ ok: false, error: result.error });
    const commits = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(' ');
        return { hash: line.slice(0, idx), message: line.slice(idx + 1) };
      });
    return res.json({ ok: true, commits });
  }));

  app.post('/api/git/pull', requireAuth, asyncHandler(async (_req, res) => {
    return res.json(shellExec('git pull', REPO_ROOT));
  }));

  app.post('/api/git/commit', requireAuth, asyncHandler(async (req, res) => {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) {
      return res.status(400).json({ ok: false, error: 'message required' });
    }
    const add = shellExec('git add -A', REPO_ROOT);
    if (!add.ok) return res.json(add);
    return res.json(
      shellExec(`git commit -m ${JSON.stringify(message)}`, REPO_ROOT)
    );
  }));

  // ── FILES ─────────────────────────────────────────────────────────────────

  app.get('/api/files/tree', requireAuth, asyncHandler(async (req, res) => {
    const rawPath = String(req.query.path ?? '/');
    const resolved = assertRepoPath(rawPath);
    if (!resolved) {
      return res.status(403).json({ ok: false, error: 'Path outside repo' });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ ok: false, error: 'Path not found' });
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true }).map((e) => {
      let size: number | null = null;
      if (e.isFile()) {
        try { size = fs.statSync(path.join(resolved, e.name)).size; } catch { /* skip */ }
      }
      return {
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        ext: e.isFile() ? path.extname(e.name) : null,
        size,
      };
    });
    return res.json({ ok: true, path: rawPath, entries });
  }));

  app.get('/api/files/read', requireAuth, asyncHandler(async (req, res) => {
    const rawPath = String(req.query.path ?? '');
    if (!rawPath) {
      return res.status(400).json({ ok: false, error: 'path required' });
    }
    const resolved = assertRepoPath(rawPath);
    if (!resolved) {
      return res.status(403).json({ ok: false, error: 'Path outside repo' });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return res.status(400).json({ ok: false, error: 'Not a file' });
    }
    if (stat.size > 5 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: 'File too large (>5 MB)' });
    }
    return res.json({ ok: true, content: fs.readFileSync(resolved, 'utf8'), size: stat.size });
  }));

  app.post('/api/files/write', requireAuth, asyncHandler(async (req, res) => {
    const { path: rawPath, content } = req.body as { path?: string; content?: string };
    if (!rawPath || content === undefined) {
      return res.status(400).json({ ok: false, error: 'path and content required' });
    }
    const resolved = assertRepoPath(rawPath);
    if (!resolved) {
      return res.status(403).json({ ok: false, error: 'Path outside repo' });
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
    return res.json({ ok: true, path: resolved });
  }));

  // ── SYSTEM ────────────────────────────────────────────────────────────────

  app.get('/api/system/stats', requireAuth, asyncHandler(async (_req, res) => {
    const cpuList = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadavg = os.loadavg();
    // CPU percent: use 1-min load avg / cpu count, capped at 100
    const cpuPercent = Math.min(100, (loadavg[0] / cpuList.length) * 100);

    // Disk usage via df
    let diskTotalGb = 0, diskUsedGb = 0, diskPercent = 0;
    const df = shellExec("df -BG / | tail -1 | awk '{print $2,$3,$5}'", undefined, 5000);
    if (df.ok) {
      const parts = df.stdout.trim().split(/\s+/);
      diskTotalGb = parseInt(parts[0] ?? '0', 10);
      diskUsedGb  = parseInt(parts[1] ?? '0', 10);
      diskPercent = parseInt((parts[2] ?? '0').replace('%',''), 10);
    }

    // Network counters from /proc/net/dev
    let netSentMb = 0, netRecvMb = 0;
    const netR = shellExec("awk '/eth0|ens|enp|wlan/{print $2,$10}' /proc/net/dev | head -1", undefined, 3000);
    if (netR.ok && netR.stdout.trim()) {
      const np = netR.stdout.trim().split(/\s+/);
      netRecvMb = Math.round(parseInt(np[0] ?? '0', 10) / (1024 * 1024));
      netSentMb = Math.round(parseInt(np[1] ?? '0', 10) / (1024 * 1024));
    }

    // Temperatures
    const temps: Record<string, number> = {};
    const tempR = shellExec(
      "paste <(cat /sys/class/thermal/thermal_zone*/type 2>/dev/null) <(cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null) | awk '{print $1, $2/1000}'",
      undefined, 3000
    );
    if (tempR.ok) {
      tempR.stdout.trim().split('\n').filter(Boolean).forEach(line => {
        const [k, v] = line.split(' ');
        if (k && v) temps[k] = parseFloat(v);
      });
    }

    // Top processes
    const psR = shellExec(
      "ps aux --sort=-%cpu | awk 'NR>1&&NR<=7{print $2,$3,$4,$11}' | head -6",
      undefined, 5000
    );
    const topProcs: Array<{pid:number;name:string;cpu_percent:number;memory_percent:number}> = [];
    if (psR.ok) {
      psR.stdout.trim().split('\n').filter(Boolean).forEach(line => {
        const p = line.split(/\s+/);
        topProcs.push({
          pid: parseInt(p[0] ?? '0', 10),
          cpu_percent: parseFloat(p[1] ?? '0'),
          memory_percent: parseFloat(p[2] ?? '0'),
          name: (p[3] ?? 'unknown').split('/').pop() ?? 'unknown',
        });
      });
    }

    return res.json({
      ok: true,
      cpu_percent: Math.round(cpuPercent * 10) / 10,
      cpu_count: cpuList.length,
      mem_total_gb: Math.round(totalMem / 1e9 * 100) / 100,
      mem_used_gb:  Math.round(usedMem  / 1e9 * 100) / 100,
      mem_percent:  Math.round((usedMem / totalMem) * 100),
      disk_total_gb: diskTotalGb,
      disk_used_gb:  diskUsedGb,
      disk_percent:  diskPercent,
      net_sent_mb: netSentMb,
      net_recv_mb: netRecvMb,
      uptime_secs: Math.round(os.uptime()),
      temperatures: temps,
      top_procs: topProcs,
      // legacy fields kept for compatibility
      cpus: cpuList,
      freemem: freeMem,
      totalmem: totalMem,
      loadavg,
      platform: os.platform(),
      hostname: os.hostname(),
    });
  }));

  app.get('/api/system/updates', requireAuth, asyncHandler(async (_req, res) => {
    const result = shellExec(
      'apt list --upgradable 2>/dev/null | tail -n +2',
      undefined,
      20_000
    );
    if (!result.ok) return res.json({ ok: false, error: result.error });
    const packages = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const slash = line.indexOf('/');
        return { name: line.slice(0, slash), info: line.slice(slash + 1) };
      });
    return res.json({ ok: true, count: packages.length, packages });
  }));

  // SSE stream of apt upgrade output
  app.get('/api/system/upgrade', requireAuth, (req: Request, res: Response) => {
    sseHeaders(res);
    const proc = spawn('apt', ['upgrade', '-y'], {
      env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
    });
    const pipe = (chunk: Buffer) =>
      chunk.toString().split('\n').filter(Boolean).forEach((l) => sseWrite(res, l));
    proc.stdout.on('data', pipe);
    proc.stderr.on('data', pipe);
    proc.on('close', (code) => {
      sseWrite(res, `[done: exit ${code}]`);
      res.end();
    });
    req.on('close', () => { if (!proc.killed) proc.kill(); });
  });

  // ── LOGS ──────────────────────────────────────────────────────────────────

  app.get('/api/logs/list', requireAuth, asyncHandler(async (_req, res) => {
    const files: { name: string; path: string; size: number }[] = [];
    if (fs.existsSync(LOGS_DIR)) {
      for (const f of fs.readdirSync(LOGS_DIR)) {
        const fp = path.join(LOGS_DIR, f);
        try {
          const stat = fs.statSync(fp);
          if (stat.isFile() && f.endsWith('.log')) {
            files.push({ name: f, path: fp, size: stat.size });
          }
        } catch { /* skip unreadable entries */ }
      }
    }
    return res.json({ ok: true, files });
  }));

  app.get('/api/logs/tail', requireAuth, asyncHandler(async (req, res) => {
    const file = String(req.query.file ?? '');
    const n = Math.min(parseInt(String(req.query.n ?? '100'), 10) || 100, 1000);
    if (!file) return res.status(400).json({ ok: false, error: 'file required' });
    const resolved = path.resolve(file);
    if (!resolved.startsWith(REPO_ROOT)) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }
    const result = shellExec(`tail -n ${n} "${resolved}"`);
    if (!result.ok) return res.json(result);
    return res.json({ ok: true, lines: result.stdout.split('\n') });
  }));

  // SSE: live tail -f
  app.get('/api/logs/stream', requireAuth, (req: Request, res: Response) => {
    const file = String(req.query.file ?? '');
    if (!file) { res.status(400).json({ ok: false, error: 'file required' }); return; }
    const resolved = path.resolve(file);
    if (!resolved.startsWith(REPO_ROOT)) {
      res.status(403).json({ ok: false, error: 'Access denied' }); return;
    }
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ ok: false, error: 'File not found' }); return;
    }
    sseHeaders(res);
    const tail = spawn('tail', ['-f', resolved]);
    tail.stdout.on('data', (chunk: Buffer) =>
      chunk.toString().split('\n').filter(Boolean).forEach((l) => sseWrite(res, l))
    );
    req.on('close', () => { if (!tail.killed) tail.kill(); });
  });

  // ── CAST ──────────────────────────────────────────────────────────────────

  app.get('/api/cast/discover', requireAuth, asyncHandler(async (_req, res) => {
    const result = shellExec(
      'avahi-browse -t -r _googlecast._tcp 2>/dev/null',
      undefined,
      10_000
    );
    if (!result.ok || !result.stdout.trim()) {
      return res.json({
        ok: true,
        mock: true,
        devices: [
          { name: 'Living Room TV', ip: '192.168.1.101', port: 8009 },
          { name: 'Office Chromecast', ip: '192.168.1.102', port: 8009 },
        ],
      });
    }
    return res.json({ ok: true, mock: false, raw: result.stdout });
  }));

  app.post('/api/cast/youtube', requireAuth, asyncHandler(async (req, res) => {
    const { video_id, device_name, ip } = req.body as {
      video_id?: string;
      device_name?: string;
      ip?: string;
    };
    if (!video_id || (!device_name && !ip)) {
      return res
        .status(400)
        .json({ ok: false, error: 'video_id and (device_name or ip) required' });
    }
    const script = `
import sys
try:
    import pychromecast
    target_name = ${JSON.stringify(device_name ?? '')}
    target_ip   = ${JSON.stringify(ip ?? '')}
    vid         = ${JSON.stringify(video_id)}
    casts, browser = pychromecast.get_chromecasts()
    cast = next(
        (c for c in casts if c.host == target_ip or c.name == target_name),
        None
    )
    if not cast:
        print("ERROR: device not found")
        sys.exit(1)
    cast.wait()
    cast.play_youtube_video(vid)
    print("OK")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
    const result = await spawnPython(script);
    return res.json(result);
  }));

  app.post('/api/cast/volume', requireAuth, asyncHandler(async (req, res) => {
    const { ip, volume } = req.body as { ip?: string; volume?: number };
    if (!ip || volume === undefined) {
      return res.status(400).json({ ok: false, error: 'ip and volume required' });
    }
    const vol = Math.min(1, Math.max(0, Number(volume)));
    const script = `
import sys
try:
    import pychromecast
    target_ip = ${JSON.stringify(ip)}
    casts, _ = pychromecast.get_chromecasts()
    cast = next((c for c in casts if c.host == target_ip), None)
    if not cast:
        print("ERROR: device not found")
        sys.exit(1)
    cast.wait()
    cast.set_volume(${vol})
    print("OK")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
    return res.json(await spawnPython(script));
  }));

  // ── AGENT FEED ────────────────────────────────────────────────────────────

  app.get('/api/agent/feed', requireAuth, asyncHandler(async (_req, res) => {
    const feedItems: Array<{source:string;content:string}> = [];

    // Read agent activity log
    const logPath = path.join(LOGS_DIR, 'agent-activity.log');
    if (fs.existsSync(logPath)) {
      const result = shellExec(`tail -n 50 "${logPath}"`);
      if (result.ok && result.stdout.trim()) {
        feedItems.push({ source: 'cron:agent-activity', content: result.stdout.trim() });
      }
    }

    // Read main server log for recent errors
    const serverLogPath = '/tmp/milla-server.log';
    if (fs.existsSync(serverLogPath)) {
      const errR = shellExec(`tail -20 "${serverLogPath}" | grep -i "error\\|warn" | tail -5`);
      if (errR.ok && errR.stdout.trim()) {
        feedItems.push({ source: 'Last Error', content: errR.stdout.trim() });
      }
    }

    // Stream context
    const streamPath = path.join(LOGS_DIR, 'stream.log');
    if (fs.existsSync(streamPath)) {
      const sR = shellExec(`tail -n 10 "${streamPath}"`);
      if (sR.ok && sR.stdout.trim()) {
        feedItems.push({ source: 'Stream', content: sR.stdout.trim() });
      }
    }

    if (feedItems.length === 0) {
      feedItems.push({
        source: 'Milla-Rayne',
        content: [
          `[${new Date().toISOString()}] Agent system active`,
          `[${new Date().toISOString()}] No activity logs found — awaiting first agent run`,
        ].join('\n'),
      });
    }

    return res.json({ ok: true, feed: feedItems });
  }));

  // ── NEURO ─────────────────────────────────────────────────────────────────

  app.get('/api/neuro', requireAuth, asyncHandler(async (_req, res) => {
    if (!fs.existsSync(NEURO_STATE_PATH)) {
      return res.json({
        ok: true,
        exists: false,
        state: { dopamine: 0.5, serotonin: 0.5, cortisol: 0.3, oxytocin: 0.6, energy: 0.7 },
      });
    }
    const state = readJson<unknown>(NEURO_STATE_PATH, null);
    return res.json({ ok: true, exists: true, state });
  }));

  // ── BACKUP ────────────────────────────────────────────────────────────────

  app.get('/api/backup/list', requireAuth, asyncHandler(async (_req, res) => {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.tar.gz'))
      .map((f) => {
        const fp = path.join(BACKUPS_DIR, f);
        const stat = fs.statSync(fp);
        return { name: f, path: fp, size: stat.size, created: stat.birthtime };
      })
      .sort((a, b) => b.created.getTime() - a.created.getTime());
    return res.json({ ok: true, files });
  }));

  app.post('/api/backup/create', requireAuth, asyncHandler(async (_req, res) => {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUPS_DIR, `backup-${ts}.tar.gz`);
    const result = shellExec(
      `tar -czf "${dest}" "${REPO_ROOT}" --exclude="*/node_modules" --exclude="*/.git"`,
      REPO_ROOT,
      120_000
    );
    return res.json({ ...result, dest });
  }));

  // ── DOCKER ────────────────────────────────────────────────────────────────

  app.get('/api/docker/list', requireAuth, asyncHandler(async (_req, res) => {
    const result = shellExec('docker ps -a --format "{{json .}}"', undefined, 15_000);
    if (!result.ok) return res.json({ ok: false, error: result.error, containers: [] });
    const containers = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; }
      })
      .filter((c): c is Record<string, unknown> => c !== null);
    return res.json({ ok: true, containers });
  }));

  // ── COMMAND (allowlisted shell) ───────────────────────────────────────────

  app.post('/api/command', requireAuth, asyncHandler(async (req, res) => {
    const { command } = req.body as { command?: string };
    if (!command?.trim()) {
      return res.status(400).json({ ok: false, error: 'command required' });
    }
    const base = command.trim().split(/\s+/)[0];
    if (!COMMAND_ALLOWLIST.has(base)) {
      return res.status(403).json({
        ok: false,
        error: `'${base}' not in allowlist: [${[...COMMAND_ALLOWLIST].join(', ')}]`,
      });
    }
    return res.json(shellExec(command));
  }));

  // ── SKILLS ────────────────────────────────────────────────────────────────

  app.get('/api/skills', requireAuth, asyncHandler(async (_req, res) => {
    return res.json({ ok: true, skills: readMemoryJson<unknown[]>('skills.json', []) });
  }));

  app.post('/api/skills/install', requireAuth, asyncHandler(async (req, res) => {
    const { url } = req.body as { url?: string };
    if (!url) return res.status(400).json({ ok: false, error: 'url required' });
    // Stub — npm install integration TBD
    return res.json({
      ok: true,
      stub: true,
      message: `Skill install from ${url} queued (not yet implemented)`,
    });
  }));

  // ── CRON ──────────────────────────────────────────────────────────────────

  interface CronEntry {
    id: string;
    name: string;
    schedule: string;
    command: string;
    createdAt: string;
  }

  app.get('/api/cron/list', requireAuth, asyncHandler(async (_req, res) => {
    return res.json({ ok: true, crons: readMemoryJson<CronEntry[]>('crons.json', []) });
  }));

  app.post('/api/cron/create', requireAuth, asyncHandler(async (req, res) => {
    const { name, schedule, command } = req.body as {
      name?: string;
      schedule?: string;
      command?: string;
    };
    if (!name || !schedule || !command) {
      return res.status(400).json({ ok: false, error: 'name, schedule and command required' });
    }
    const crons = readMemoryJson<CronEntry[]>('crons.json', []);
    const entry: CronEntry = {
      id: `cron_${Date.now()}`,
      name,
      schedule,
      command,
      createdAt: new Date().toISOString(),
    };
    crons.push(entry);
    writeMemoryJson('crons.json', crons);
    return res.json({ ok: true, cron: entry });
  }));

  app.post('/api/cron/trigger', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.body as { id?: string };
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const crons = readMemoryJson<CronEntry[]>('crons.json', []);
    const cron = crons.find((c) => c.id === id);
    if (!cron) return res.status(404).json({ ok: false, error: 'Cron not found' });
    return res.json({ ok: true, cron, result: shellExec(cron.command) });
  }));

  // ── BRIEFS ────────────────────────────────────────────────────────────────

  interface BriefEntry {
    id: string;
    date: string;
    content: string;
    createdAt: string;
  }

  app.get('/api/brief/latest', requireAuth, asyncHandler(async (_req, res) => {
    const briefs = readMemoryJson<BriefEntry[]>('daily_briefs.json', []);
    if (briefs.length === 0) {
      return res.json({
        ok: true,
        stub: true,
        brief: {
          id: 'brief_stub',
          date: new Date().toISOString().split('T')[0],
          content: 'No briefs recorded yet. Milla-Rayne standing by.',
          createdAt: new Date().toISOString(),
        } satisfies BriefEntry,
      });
    }
    return res.json({ ok: true, brief: briefs[briefs.length - 1] });
  }));

  app.get('/api/brief/list', requireAuth, asyncHandler(async (_req, res) => {
    return res.json({ ok: true, briefs: readMemoryJson<BriefEntry[]>('daily_briefs.json', []) });
  }));

  // NOTE: POST /api/vision/analyze is already registered by vision.routes.ts — no duplication.

  // ── MODEL ─────────────────────────────────────────────────────────────────

  app.get('/api/model', requireAuth, asyncHandler(async (_req, res) => {
    return res.json({ ok: true, current: DEFAULT_CHAT_MODEL, available: CANONICAL_AI_MODELS });
  }));

  app.post('/api/model/provider', requireAuth, asyncHandler(async (req, res) => {
    const { model } = req.body as { model?: string };
    if (!model) return res.status(400).json({ ok: false, error: 'model required' });
    if (!isSupportedAIModel(model)) {
      return res.status(400).json({
        ok: false,
        error: `Unknown model '${model}'. Available: ${CANONICAL_AI_MODELS.join(', ')}`,
      });
    }
    return res.json({
      ok: true,
      model,
      message: 'Use POST /api/user/preferences to persist model preference per user',
    });
  }));

  // ── SWARM ─────────────────────────────────────────────────────────────────

  interface SwarmAgent {
    id: string;
    name: string;
    status: string;
    role: string;
  }

  const DEFAULT_AGENTS: SwarmAgent[] = [
    { id: 'milla', name: 'Milla-Rayne', status: 'active', role: 'orchestrator' },
    { id: 'axiom', name: 'Axiom', status: 'active', role: 'reasoning' },
    { id: 'deer', name: 'Deer-Flow', status: 'idle', role: 'research' },
    { id: 'elara', name: 'Elara', status: 'idle', role: 'frontend' },
  ];

  app.get('/api/swarm/status', requireAuth, asyncHandler(async (_req, res) => {
    return res.json({
      ok: true,
      agents: readMemoryJson<SwarmAgent[]>('swarm_agents.json', DEFAULT_AGENTS),
    });
  }));

  app.get('/api/swarm/flags', requireAuth, asyncHandler(async (_req, res) => {
    return res.json({ ok: true, flags: readMemoryJson<unknown[]>('swarm_flags.json', []) });
  }));

  // Stub routes for dashboard UI calls
  app.get('/api/notifications', requireAuth, (_req, res) => res.json({ ok: true, items: [] }));
  app.get('/api/nodes', requireAuth, (_req, res) => res.json({
    ok: true,
    nodes: { termux: false, google: false, swarm: false }
  }));
  app.get('/api/search', requireAuth, asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    return res.json({ ok: true, query: q, results: [] });
  }));
}
