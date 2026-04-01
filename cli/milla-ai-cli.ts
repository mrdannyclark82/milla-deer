#!/usr/bin/env node
/**
 * Milla AI CLI — poly-model AI-powered command-line toolbox
 *
 * Features:
 *   chat   – interactive chat with Milla (default)
 *   exec   – run shell commands with human-in-the-loop safety gate
 *   gen    – ask Milla to generate a bash/python script and save it
 *   tool   – list / add / run registered skill scripts (~/.milla_tools/)
 *   models – show available AI models
 *
 * AI backend: Milla-Rayne server at localhost:5000
 * Switch model with /model <name> inside chat, or via the web UI.
 */

import readline from 'readline';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync, copyFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
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
const API_BASE      = process.env.API_URL       || 'http://localhost:5000';
const OLLAMA_BASE   = process.env.OLLAMA_URL    || 'http://dray-dx4870.lan:11434';
const TOOL_DIR      = path.join(homedir(), '.milla_tools');
const STATE_FILE    = path.join(homedir(), '.milla_cli_state.json');

// Models — nemotron on the office PC is primary brain; others via Milla server
const MODEL_LIST = [
  { id: 'nemotron',  label: 'nemotron-3-nano:30b-cloud', provider: 'Ollama / dray-dx4870 ★', backend: 'ollama' },
  { id: 'gemini',    label: 'gemini-2.0-flash',           provider: 'Google Gemini',           backend: 'milla'  },
  { id: 'deepseek',  label: 'deepseek-chat',               provider: 'DeepSeek',                backend: 'milla'  },
  { id: 'grok',      label: 'grok-2-latest',               provider: 'xAI Grok',                backend: 'milla'  },
  { id: 'claude',    label: 'claude-3-5-sonnet',           provider: 'Anthropic',               backend: 'milla'  },
  { id: 'openai',    label: 'gpt-4o',                      provider: 'OpenAI',                  backend: 'milla'  },
];

// ANSI colours (no external dep)
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function banner() {
  const ctxLoaded = PROJECT_CONTEXT.length > 0;
  console.log(`
${c.magenta}╔══════════════════════════════════════════════════╗
║                                                  ║
║  ${c.bold}💜  Milla AI CLI  —  poly-model toolbox  💜${c.reset}${c.magenta}     ║
║                                                  ║
╚══════════════════════════════════════════════════╝${c.reset}
${c.dim}Commands: chat (default) | exec | gen | tool | models
Type /help inside chat for all commands.${c.reset}${ctxLoaded ? `\n${c.green}✓ Project context loaded${c.reset}` : ''}
`);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim()); }));
}

function loadState(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s: Record<string, unknown>) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// Active model preference — nemotron is the default brain
let activeModel = loadState().model as string | undefined ?? 'nemotron';

// Load project context from .github/copilot-instructions.md — injected as system context
function loadProjectContext(): string {
  const candidates = [
    path.resolve(__dirname, '../.github/copilot-instructions.md'),
    path.resolve(__dirname, '../../.github/copilot-instructions.md'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf8');
        // Extract just the Agent Context section (everything up to ## Repository Structure)
        const match = raw.match(/## Agent Context[\s\S]*?(?=## Repository Structure|$)/);
        const ctx = match ? match[0].trim() : raw.slice(0, 3000);
        return `[Project Context]\n${ctx}`;
      } catch { /* ignore */ }
    }
  }
  return '';
}

const PROJECT_CONTEXT = loadProjectContext();

async function askAI(message: string, systemContext?: string): Promise<string> {
  const ctx = [PROJECT_CONTEXT, systemContext].filter(Boolean).join('\n\n');
  const model = MODEL_LIST.find((m) => m.id === activeModel) ?? MODEL_LIST[0];

  // ── Ollama backend (nemotron on the office PC) ──
  if (model.backend === 'ollama') {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.label,
        messages: [
          ...(ctx ? [{ role: 'system', content: ctx }] : []),
          { role: 'user', content: message },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status} at ${OLLAMA_BASE}`);
    const data = (await res.json()) as { message?: { content: string } };
    return data.message?.content ?? '(no response)';
  }

  // ── Milla server backend (all other models) ──
  const body = JSON.stringify({
    message: ctx ? `${ctx}\n\n${message}` : message,
    model: activeModel,
  });
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Milla server error ${res.status} — is it running?`);
  const data = (await res.json()) as { response?: string; message?: string };
  return data.response || data.message || '(no response)';
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
  const current = (state.model as string) ?? 'nemotron';

  console.log(`\n${c.bold}Available Models${c.reset}\n`);
  MODEL_LIST.forEach((m) => {
    const active = m.id === current ? `${c.green} ◀ active${c.reset}` : '';
    const backendLabel = m.backend === 'ollama'
      ? `${c.cyan}[ollama]${c.reset}`
      : `${c.dim}[milla] ${c.reset}`;
    console.log(`  ${backendLabel} ${c.magenta}${m.id.padEnd(10)}${c.reset} ${m.label.padEnd(30)} ${c.dim}${m.provider}${c.reset}${active}`);
  });
  console.log(`\n${c.dim}Switch with: /model <id>  (e.g. /model deepseek)${c.reset}\n`);

  // Check both backends
  try {
    await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    console.log(`${c.green}✓ Ollama online${c.reset} — ${OLLAMA_BASE} ${c.cyan}(nemotron brain)${c.reset}`);
  } catch {
    console.log(`${c.yellow}⚠ Ollama unreachable at ${OLLAMA_BASE}${c.reset}`);
  }
  try {
    await fetch(`${API_BASE}/api/auth/status`, { signal: AbortSignal.timeout(3000) });
    console.log(`${c.green}✓ Milla server online${c.reset} — ${API_BASE}`);
  } catch {
    console.log(`${c.yellow}⚠ Milla server unreachable at ${API_BASE}${c.reset}`);
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

  const modelLabel = () => {
    const m = MODEL_LIST.find((x) => x.id === activeModel);
    const backend = m?.backend === 'ollama' ? `${c.cyan}ollama${c.reset}` : `${c.dim}milla${c.reset}`;
    return `${c.magenta}[${activeModel}]${c.reset} via ${backend}`;
  };

  console.log(`${c.dim}Tip: prefix with ! to run a shell command. /model <id> to switch AI.${c.reset}`);
  console.log(`Brain: ${modelLabel()}\n`);

  const curModel = MODEL_LIST.find((m) => m.id === activeModel);
  if (curModel?.backend === 'ollama') {
    try {
      await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
      console.log(`${c.green}✓ Nemotron online${c.reset} — ${OLLAMA_BASE} ${c.cyan}(dray-dx4870)${c.reset}\n`);
    } catch {
      console.log(`${c.yellow}⚠ Ollama unreachable at ${OLLAMA_BASE} — trying Milla fallback${c.reset}\n`);
    }
  } else {
    try {
      await fetch(`${API_BASE}/api/auth/status`, { signal: AbortSignal.timeout(3000) });
      console.log(`${c.green}✓ Milla server online${c.reset} — ${API_BASE}\n`);
    } catch {
      console.log(`${c.yellow}⚠ Milla server offline — start with: pnpm dev${c.reset}\n`);
    }
  }

  rl.prompt();

  rl.on('line', async (raw: string) => {
    const input = raw.trim();
    if (!input) { rl.prompt(); return; }

    // ── slash commands ──────────────────────────────
    if (input === '/exit' || input === '/quit') {
      console.log(`\n${c.magenta}See ya Danny 💜${c.reset}\n`);
      rl.close();
      process.exit(0);
    }

    if (input === '/help') {
      console.log(`
  ${c.bold}Chat commands:${c.reset}
  ${c.magenta}/model <id>${c.reset}          switch AI model (gemini|deepseek|grok|claude|openai)
  ${c.cyan}/exec <cmd>${c.reset}          run a shell command (safety gate on sudo/abs paths)
  ${c.cyan}/gen <prompt>${c.reset}        generate + save a bash script
  ${c.cyan}/gen:py <prompt>${c.reset}     generate + save a python script
  ${c.cyan}/tools${c.reset}               list registered skill tools
  ${c.cyan}/models${c.reset}              show all available models
  ${c.cyan}!<cmd>${c.reset}               shorthand for /exec
  ${c.cyan}/exit${c.reset}                quit
`);
      rl.prompt(); return;
    }

    // Switch model
    if (input.startsWith('/model ')) {
      const req = input.slice(7).trim();
      const found = MODEL_LIST.find((m) => m.id === req || m.label.startsWith(req));
      if (!found) {
        console.log(`${c.red}Unknown model. Choose: ${MODEL_LIST.map((m) => m.id).join(' | ')}${c.reset}`);
      } else {
        activeModel = found.id;
        const state = loadState(); state.model = activeModel; saveState(state);
        console.log(`${c.green}✓ Switched to ${found.label} (${found.provider})${c.reset}`);
      }
      rl.prompt(); return;
    }

    if (input === '/tools') {
      const tools = toolList();
      if (tools.length === 0) console.log(`${c.dim}No tools yet. Add with: milla-ai tool add <name> <file>${c.reset}`);
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
    process.stdout.write(`\n${c.magenta}Milla${c.reset} ${c.dim}[${activeModel}] thinking…${c.reset}`);
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
  const [cmd, ...rest] = process.argv.slice(2);

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
