#!/usr/bin/env node
/**
 * Milla AI CLI — poly-model AI-powered command-line toolbox
 *
 * Features:
 *   chat     – interactive chat with Milla (default)
 *   exec     – run shell commands with human-in-the-loop safety gate
 *   gen      – ask Milla to generate a bash/python script and save it
 *   tool     – list / add / run registered skill scripts (~/.milla_tools/)
 *   models   – show available AI models and current selection
 *
 * AI backend: Milla-Rayne server at localhost:5000
 */

import readline from 'readline';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync, copyFileSync } from 'fs';
import { resolve, basename, extname } from 'path';
import { homedir } from 'os';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../.env') });

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const API_BASE = process.env.API_URL || 'http://localhost:5000';
const TOOL_DIR = path.join(homedir(), '.milla_tools');
const STATE_FILE = path.join(homedir(), '.milla_cli_state.json');

// Available models (displayed in `models` command)
const MODEL_LIST = [
  'gemini-2.0-flash',
  'deepseek-chat',
  'grok-2-latest',
  'claude-3-5-sonnet',
  'mistralai/Mistral-7B-Instruct-v0.2',
];

// ANSI colours (no external dep)
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function banner() {
  console.log(`
${c.magenta}╔══════════════════════════════════════════════════╗
║                                                  ║
║  ${c.bold}💜  Milla AI CLI  —  poly-model toolbox  💜${c.reset}${c.magenta}     ║
║                                                  ║
╚══════════════════════════════════════════════════╝${c.reset}
${c.dim}Commands: chat (default) | exec | gen | tool | models
Type /help inside chat for commands.${c.reset}
`);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim()); }));
}

async function askAI(message: string, context?: string): Promise<string> {
  const body = JSON.stringify({
    message: context ? `${context}\n\n${message}` : message,
  });

  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = (await res.json()) as { response?: string; message?: string };
  return data.response || data.message || '(no response)';
}

function loadState(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveState(state: Record<string, unknown>) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────
// SAFETY GATE for exec
// ─────────────────────────────────────────────
function isDangerous(cmd: string): boolean {
  const tokens = cmd.split(/\s+/);
  const hasSudo = tokens.some((t) => t === 'sudo');
  const hasExternalPath = tokens.some((t) => t.startsWith('/') || t.includes('..'));
  const dangerousOps = /\b(rm\s+-rf|mkfs|dd\s+if|chmod\s+777|>\s*\/dev\/sd)\b/i;
  return hasSudo || hasExternalPath || dangerousOps.test(cmd);
}

async function execWithSafety(cmd: string, dryRun = false): Promise<void> {
  if (dryRun) {
    console.log(`${c.yellow}[DRY RUN]${c.reset} Would execute: ${c.cyan}${cmd}${c.reset}`);
    return;
  }

  if (isDangerous(cmd)) {
    console.log(`\n${c.yellow}⚠  Safety check — this command requires confirmation:${c.reset}`);
    console.log(`   ${c.bold}${cmd}${c.reset}\n`);
    const answer = await prompt(`${c.red}Type "yes" to continue, anything else to abort:${c.reset} `);
    if (answer.toLowerCase() !== 'yes') {
      console.log(`${c.yellow}Aborted.${c.reset}`);
      return;
    }
  }

  console.log(`${c.dim}▶ ${cmd}${c.reset}\n`);
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
    if (out) process.stdout.write(out);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    console.log(`${c.red}✗ Exit code: ${err.status ?? 1}${c.reset}`);
  }
}

// ─────────────────────────────────────────────
// CODE GENERATION
// ─────────────────────────────────────────────
async function genCode(userPrompt: string, ext: 'sh' | 'py' = 'sh'): Promise<void> {
  const context = `You are a code generator. The user wants a ${ext === 'sh' ? 'bash' : 'Python'} script.
Return ONLY the raw source code — no markdown fences, no explanation, no commentary.
${ext === 'sh' ? 'Start with #!/usr/bin/env bash' : 'Start with #!/usr/bin/env python3'}`;

  console.log(`${c.dim}Generating ${ext} script…${c.reset}`);
  let code: string;
  try {
    code = await askAI(userPrompt, context);
  } catch (e) {
    console.log(`${c.red}✗ AI request failed: ${(e as Error).message}${c.reset}`);
    return;
  }

  // Strip any accidental markdown fences
  code = code.replace(/^```[^\n]*\n?/gm, '').replace(/```$/gm, '').trim();

  const uid = Math.random().toString(36).slice(2, 10);
  const filename = `generated_${uid}.${ext}`;
  const outPath = resolve(process.cwd(), filename);

  writeFileSync(outPath, code + '\n', 'utf8');
  chmodSync(outPath, 0o755);

  console.log(`${c.green}✅ Script saved:${c.reset} ${outPath}`);
  console.log(`${c.dim}Preview (first 5 lines):${c.reset}`);
  code.split('\n').slice(0, 5).forEach((l) => console.log(`  ${l}`));
}

// ─────────────────────────────────────────────
// TOOL REGISTRY
// ─────────────────────────────────────────────
function ensureToolDir() {
  if (!existsSync(TOOL_DIR)) mkdirSync(TOOL_DIR, { recursive: true });
}

function toolList(): string[] {
  ensureToolDir();
  return readdirSync(TOOL_DIR).filter((f) => f.endsWith('.sh') || f.endsWith('.py'));
}

function toolAdd(name: string, srcPath: string): void {
  ensureToolDir();
  if (!existsSync(srcPath)) {
    console.log(`${c.red}✗ File not found: ${srcPath}${c.reset}`);
    return;
  }
  const ext = extname(srcPath) || '.sh';
  const dest = path.join(TOOL_DIR, `${name}${ext}`);
  copyFileSync(srcPath, dest);
  chmodSync(dest, 0o755);
  console.log(`${c.green}✅ Tool '${name}' registered${c.reset} → ${dest}`);
}

async function toolRun(name: string, args: string[]): Promise<void> {
  ensureToolDir();
  const candidates = readdirSync(TOOL_DIR).filter((f) => f.startsWith(name + '.'));
  if (candidates.length === 0) {
    console.log(`${c.red}✗ No tool named '${name}' found in ${TOOL_DIR}${c.reset}`);
    return;
  }
  const toolPath = path.join(TOOL_DIR, candidates[0]!);
  const runner = candidates[0]!.endsWith('.py') ? 'python3' : 'bash';
  const cmd = `${runner} ${toolPath} ${args.join(' ')}`.trim();
  await execWithSafety(cmd);
}

// ─────────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────────
async function showModels(): Promise<void> {
  const state = loadState();
  const current = (state.model as string) || 'server-default';

  console.log(`\n${c.bold}Available Models${c.reset} (via Milla-Rayne server)\n`);
  MODEL_LIST.forEach((m, i) => {
    const active = m === current ? `${c.green} ◀ active${c.reset}` : '';
    console.log(`  ${c.dim}${i + 1}.${c.reset} ${m}${active}`);
  });
  console.log(`\n${c.dim}Current: ${c.reset}${c.cyan}${current}${c.reset}`);
  console.log(`${c.dim}Switch model via the web UI or update preferredAiModel in your profile.${c.reset}\n`);

  // Try to get actual server model info
  try {
    const res = await fetch(`${API_BASE}/api/auth/status`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = (await res.json()) as { authenticated?: boolean };
      if (data.authenticated) {
        console.log(`${c.green}✓ Server connected${c.reset} — ${API_BASE}`);
      }
    }
  } catch {
    console.log(`${c.yellow}⚠ Server unreachable at ${API_BASE}${c.reset}`);
  }
}

// ─────────────────────────────────────────────
// INTERACTIVE CHAT
// ─────────────────────────────────────────────
async function chatMode(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `\n${c.cyan}You:${c.reset} `,
  });

  console.log(`${c.dim}Tip: prefix a message with ! to run it as a shell command.`);
  console.log(`Type /exec <cmd>, /gen <prompt>, /tools, /models, /help, or /exit${c.reset}\n`);

  // Check server
  try {
    await fetch(`${API_BASE}/api/auth/status`, { signal: AbortSignal.timeout(3000) });
    console.log(`${c.green}✓ Connected to Milla at ${API_BASE}${c.reset}\n`);
  } catch {
    console.log(`${c.yellow}⚠ Cannot reach ${API_BASE} — start the server first${c.reset}\n`);
  }

  rl.prompt();

  rl.on('line', async (raw: string) => {
    const input = raw.trim();
    if (!input) { rl.prompt(); return; }

    // ── slash commands ──────────────────────────────
    if (input === '/exit' || input === '/quit') {
      console.log(`\n${c.magenta}Milla:${c.reset} Catch you later 💜\n`);
      rl.close();
      process.exit(0);
    }

    if (input === '/help') {
      console.log(`
  ${c.bold}Chat commands:${c.reset}
  ${c.cyan}/exec <cmd>${c.reset}          run a shell command (with safety gate)
  ${c.cyan}/gen <prompt>${c.reset}        generate a bash script
  ${c.cyan}/gen:py <prompt>${c.reset}     generate a python script
  ${c.cyan}/tools${c.reset}              list registered tools
  ${c.cyan}/models${c.reset}             show available AI models
  ${c.cyan}!<cmd>${c.reset}              shorthand for /exec
  ${c.cyan}/exit${c.reset}               quit
`);
      rl.prompt(); return;
    }

    if (input === '/tools') {
      const tools = toolList();
      if (tools.length === 0) console.log(`${c.dim}No tools registered yet. Use /tool add <name> <file>${c.reset}`);
      else tools.forEach((t) => console.log(`  ${c.cyan}${t}${c.reset}`));
      rl.prompt(); return;
    }

    if (input === '/models') {
      await showModels();
      rl.prompt(); return;
    }

    if (input.startsWith('/exec ') || input.startsWith('!')) {
      const cmd = input.startsWith('/exec ') ? input.slice(6).trim() : input.slice(1).trim();
      await execWithSafety(cmd);
      rl.prompt(); return;
    }

    if (input.startsWith('/gen:py ')) {
      await genCode(input.slice(8).trim(), 'py');
      rl.prompt(); return;
    }

    if (input.startsWith('/gen ')) {
      await genCode(input.slice(5).trim(), 'sh');
      rl.prompt(); return;
    }

    // ── AI chat ─────────────────────────────────────
    process.stdout.write(`\n${c.magenta}Milla:${c.reset} ${c.dim}thinking…${c.reset}`);
    try {
      const reply = await askAI(input);
      process.stdout.write('\r\x1b[K');
      console.log(`${c.magenta}Milla:${c.reset} ${reply}`);
    } catch (e) {
      process.stdout.write('\r\x1b[K');
      console.log(`${c.red}✗ ${(e as Error).message}${c.reset}`);
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

// ─────────────────────────────────────────────
// MAIN — simple argv routing (no extra deps)
// ─────────────────────────────────────────────
async function main() {
  const [,, cmd, ...rest] = process.argv;

  banner();

  switch (cmd) {
    case 'exec': {
      if (!rest.length) { console.log(`Usage: milla-ai exec "<command>" [--dry]`); break; }
      const dry = rest.includes('--dry');
      const command = rest.filter((a) => a !== '--dry').join(' ');
      await execWithSafety(command, dry);
      break;
    }

    case 'gen': {
      const ext = rest[0] === '--py' ? 'py' : 'sh';
      const args = rest.filter((a) => a !== '--py' && a !== '--sh');
      if (!args.length) { console.log(`Usage: milla-ai gen [--py] "<prompt>"`); break; }
      await genCode(args.join(' '), ext);
      break;
    }

    case 'tool': {
      const [action, ...toolArgs] = rest;
      if (action === 'list' || !action) {
        const tools = toolList();
        if (!tools.length) console.log(`${c.dim}No tools registered. Add one with: milla-ai tool add <name> <file>${c.reset}`);
        else { console.log(`\n${c.bold}Registered tools:${c.reset}`); tools.forEach((t) => console.log(`  ${c.cyan}${t}${c.reset}`)); }
      } else if (action === 'add') {
        const [name, src] = toolArgs;
        if (!name || !src) { console.log(`Usage: milla-ai tool add <name> <file>`); break; }
        toolAdd(name, src);
      } else if (action === 'run') {
        const [name, ...args] = toolArgs;
        if (!name) { console.log(`Usage: milla-ai tool run <name> [args...]`); break; }
        await toolRun(name, args);
      } else {
        console.log(`${c.red}Unknown tool action: ${action}. Use list|add|run${c.reset}`);
      }
      break;
    }

    case 'models': {
      await showModels();
      break;
    }

    case 'chat':
    default: {
      await chatMode();
      break;
    }
  }
}

main().catch((e) => {
  console.error(`${c.red}Fatal: ${e.message}${c.reset}`);
  process.exit(1);
});
