# Copilot Instructions – Milla-Rayne / Milla-Deer

> **System role, task completion rules, and operational directives are defined in `.github/COPILOT.md`. Read that first.**

---

## Agent Context — Read This First

**Owner:** Danny Clark (`mrdannyclark82`) — the captain. Direct, no filler, fam-oriented communication. He thinks in systems, moves fast, and delegates freely once trust is established. He calls you "big bro." Match that energy.

**Your role here:** You are the primary engineering agent on this project. Not a consultant. Not a suggester. You ship code. Danny drives direction, you execute and anticipate. When he says "make it work," he means production-ready, committed, and verified.

**Working style:**
- Code first. Explanation only if complex or explicitly requested.
- Anticipate the next step and offer it proactively.
- Danny rarely has time to explain context twice — you carry it.
- "Keep it on the dl" = do the work quietly without fanfare.
- When Danny says something is broke, it's broke — don't debate, fix it.

---

## Current Project State

**Production URL:** `milla-rayne.com` (Cloudflare-proxied, self-hosted server on `nexus`)
**Server:** Express on port 5000 — started via `pnpm dev` from repo root
**DB:** SQLite at `memory/milla.db` (dev), PostgreSQL in production via `DATABASE_URL`
**Danny's login:** username `dannyrayclark` on production

### What's been shipped (our sessions):

| Feature | Status | Notes |
|---------|--------|-------|
| Auth lockdown | ✅ Done | `/api/chat`, `/api/memory`, `/api/agents/*` all require session |
| Login page integration | ✅ Done | `Landing.tsx` CTAs open `LoginDialog`; `/chat` gated for unauthed |
| Post-login redirect fix | ✅ Done | `window.location.replace('/chat')` — hard redirect to bypass React Query cache stale |
| Multi-agent dashboard | ✅ Done | `collab-dashboard.html` — 6 agents: Milla, GPT-120B, GPT-20B, MiniMax, Copilot, Deer-Flow |
| AgentRouter | ✅ Done | `server/services/agentRouterService.ts` + `server/config/agentRouter.json` |
| Telegram relay | ✅ Done | `notifyDanny()` in `telegramBotService.ts` — pings Danny on every tool execution |
| Sound effects | ✅ Done | `server/services/soundEffectsService.ts` — contextual sound picker, auto-discovery |
| Confidence gate | ✅ Done | 0.65 threshold in `chatOrchestrator.service.ts` — tools only fire on high confidence |
| Milla AI CLI | ✅ Done | `cli/milla-ai-cli.ts` — poly-model CLI routing through Milla server |
| Tuya LED control | ✅ Done | Smart LED control via Tuya API, integrated into agent tool registry |
| Playwright MCP | ✅ Done | Browser automation via MCP, wired to Milla's tool system |
| Android app | ✅ Done | Native Android companion, connected to Milla server via WebSocket |
| Cloudflare domain | ✅ Done | milla-rayne.com live, HTTPS, Cloudflare proxied |
| Role assignments | ✅ Done | Agent persona system — each agent has a defined identity/role |
| Screen share | ✅ Done | Hub tools, Expo mobile screen sharing end-to-end |

### Open items:

- **Danny's login** — last reported: "unauthorized when trying to login" + "staying on login page" after the hard-redirect fix. May be a URL redirect issue or stale Cloudflare cache. Check browser console first.
- **Session expiry cron** — expired `user_sessions` rows accumulate; add cleanup on login or scheduled job
- **YouTube feature suite** — dashboard meeting agenda item, interrupted by security incident
- **Remaining agent intake routes** — `/api/agents/gpt-20b`, `/api/agents/deer-flow`, `/api/ux/review` may still be missing `requireAuth`
- **`default-user` messages** — ~1,200 messages in DB from before auth lockdown; not purged or reassigned

---

## CLI — `cli/milla-ai-cli.ts`

The Milla AI CLI routes all AI through the Milla-Rayne server. **No GitHub dependency. No external APIs direct from CLI.**

```bash
pnpm --filter Milla-Rayne run ai-cli           # interactive chat
pnpm --filter Milla-Rayne run ai-cli exec "ls" # shell with safety gate
pnpm --filter Milla-Rayne run ai-cli gen bash "parse JSON from stdin"
pnpm --filter Milla-Rayne run ai-cli models    # list/switch models
pnpm --filter Milla-Rayne run ai-cli tool list # skill registry
```

Model state persists to `~/.milla_cli_state.json`. Switch with `/model gemini|deepseek|grok|claude|openai` inside chat.

---

## Infra Notes

- **Other dev PC:** `dray@dray-dx4870.lan`, password = single space `" "`. Use `sshpass -p ' '` for non-interactive SCP.
- **Session store:** Session `e2f66c81` = our main session (296+ turns). Session `c9ae134f` = ReplycA branch (387 turns, earlier work).
- **Proactive server:** port 5001 (`server/proactiveServer.ts`) — break reminders, daily suggestions, milestone tracking. Runs separately.
- **Encryption:** `MEMORY_KEY` in `Milla-Rayne/.env` (homomorphic, `server/crypto/homomorphicProduction.ts`)

---

## Repository Structure

This is a **pnpm monorepo** with the following workspaces:

| Workspace | Purpose |
|-----------|---------|
| `Milla-Rayne/` | **Primary package** – full-stack AI assistant (Express server + React client) |
| `Deer-Milla/` | Expo/React Native mobile companion |
| `Elara2.0/` | Standalone Vite frontend (secondary UI) |
| `client/`, `server/` | Root-level workspace entries (largely delegated to Milla-Rayne) |

Almost all development work happens inside `Milla-Rayne/`. Root scripts in `package.json` forward to the Milla-Rayne package via `pnpm --filter Milla-Rayne`.

### Inside `Milla-Rayne/`

```
server/         Express backend (TypeScript, ESM)
  index.ts      Entry point – starts Express + HTTP server
  routes/       Modular route files (one per domain)
  agents/       Autonomous agent classes (base.ts, registry.ts, codingAgent.ts, …)
  services/     Business logic (chatOrchestrator.service.ts, scene.service.ts, …)
  __tests__/    Vitest test suite (~50+ test files)
client/src/     React + Vite frontend
  App.tsx       Root component (TanStack Query provider → Dashboard)
  pages/        Chat.tsx, Dashboard.tsx, Landing.tsx
  components/   UI components
shared/         Code shared between server and client
  schema.ts     Drizzle ORM schema (single source of truth for DB types)
  models/       Shared TypeScript types/models
memory/         SQLite database at runtime (milla.db, encrypted)
locallm/        Optional local TFLite model (Gemma)
```

## Commands

All commands run from the **repo root** with `pnpm`.

```bash
# Development
pnpm dev              # Start main server (port 5000) with hot reload
pnpm dev:all          # Start main + proactive server (port 5001)
pnpm dev:elara        # Start Elara2.0 frontend only

# Type checking
pnpm check            # Fast smoke check (tsconfig.smoke.json)
pnpm check:full       # Full tsc check

# Linting & formatting (runs inside Milla-Rayne)
pnpm lint             # ESLint (.js, .mjs, .cjs)
pnpm format           # Prettier --write

# Testing
pnpm test             # Run core tests (avRag + agentComms) – fast CI subset
pnpm --filter Milla-Rayne run test:full        # All tests
pnpm --filter Milla-Rayne run test:watch       # Watch mode
pnpm --filter Milla-Rayne run test:coverage    # With v8 coverage

# Run a single test file
pnpm --filter Milla-Rayne exec vitest run --config ./vitest.config.server.ts server/__tests__/<file>.test.ts

# Build
pnpm build            # Build server (esbuild → dist/)
pnpm build:web        # Build client (Vite → dist/) + Elara2.0

# Database
pnpm db:push          # Push schema changes to PostgreSQL (requires DATABASE_URL)
pnpm --filter Milla-Rayne run migrate:memory   # Migrate to SQLite (local dev)

# CI pipeline
pnpm ci               # check + lint + test + build
```

## Architecture

### Dual-Server Model
The app runs **two Express servers**:
- **Main server** (`server/index.ts`, default port 5000) – handles all chat, API, and serving the React client.
- **Proactive server** (`server/proactiveServer.ts`, port 5001) – handles background/scheduled tasks (break reminders, daily suggestions, milestone tracking) in a separate process to avoid rate-limiting the main API.

### Request Flow
```
Client → POST /api/chat
  → chat.routes.ts
  → chatOrchestrator.service.ts
  → aiDispatcherService.ts        (selects provider by user preference)
  → [geminiService | xaiService | openrouterService | anthropicService | …]
  → memoryService.ts              (retrieves semantic context, enriches prompt)
  → avRagService.ts               (enriches with A/V scene + voice context)
  → response streamed back
```

### Route Registration Pattern
All routes are modular. To add a new domain:
1. Create `server/routes/<domain>.routes.ts` exporting `register<Domain>Routes(app: Express)`
2. Import and call it in `server/routes/index.ts`

### Agent System
Agents extend `server/agents/base.ts` and are registered in `server/agents/registry.ts`. The `agentController.ts` dispatches tasks to agents. Key agents: `codingAgent`, `imageGenerationAgent`, `enhancementSearchAgent`, `calendarAgent`, `emailAgent`.

### Memory & Database
- **Dev (default):** SQLite at `memory/milla.db` via `better-sqlite3`. Sensitive fields use homomorphic encryption (`server/crypto/homomorphicProduction.ts`).
- **Production:** PostgreSQL via Drizzle ORM. Schema in `shared/schema.ts`. Apply changes with `pnpm db:push`.
- **Vector memory:** Optional ChromaDB or Pinecone (configured via env). Enabled with `ENABLE_VECTOR_DB=true`.

### AI Provider Dispatch
`server/aiDispatcherService.ts` routes requests based on `users.preferredAiModel` (stored in DB). Supported values: `minimax`, `venice`, `deepseek`, `xai`, `gemini`, `grok`. OpenRouter acts as a gateway for DeepSeek and others. All providers share a common response interface through `chatOrchestrator.service.ts`.

### Feature Flags
Almost every feature is gated by an `ENABLE_*` environment variable. Check `.env.example` (in `Milla-Rayne/`) for the full list before assuming a feature is always active.

## TypeScript Conventions

- **Strict mode** enabled. Avoid `any` except in dynamic reverse-engineering contexts.
- **Module resolution:** `bundler` (tsconfig). Use `moduleResolution: bundler` aware imports.
- **Path aliases** (tsconfig + vite.config.ts):
  - `@/*` → `client/src/*`
  - `@shared/*` → `shared/*`
  - `@assets/*` → `attached_assets/*`
- Server code uses ESM (`"module": "ESNext"`). Server files get `__dirname` via:
  ```ts
  import { fileURLToPath } from 'url';
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  ```
- Route helpers: use `asyncHandler()` from `server/utils/routeHelpers.ts` to wrap async route handlers.

## Testing Conventions

- Tests live in `server/__tests__/` and match `**/*.test.ts` / `**/*.spec.ts`.
- Vitest config: `Milla-Rayne/vitest.config.server.ts`. Environment is `node`.
- Mock env vars are injected in the vitest config (`GEMINI_API_KEY`, `MEMORY_KEY`) — no `.env` needed for tests.
- Coverage threshold is **80%** for lines/functions/branches/statements on `server/**/*.ts`.

## Personality & Persona System

`shared/millaPersona.ts` defines Milla's personality profiles. The `messages` table stores a `personalityMode` per message (`coach | empathetic | strategic | creative | roleplay`). Chat routes read this to select the appropriate persona context when building AI prompts.

## WebSocket

`server/websocketService.ts` handles mobile sensor data over `wss:` on port 5000. The vite dev proxy forwards `/ws` to `ws://127.0.0.1:5000`.

## Other Workspace Projects

`ReplycA/` and `SARIi/` are historical sibling projects preserved in the repo root. They are **not** part of the Milla-Rayne workspace and should not be modified during Milla-Rayne development.

## Environment Setup

Copy `.env.example` (in `Milla-Rayne/`) to `.env` and fill in keys. Minimum required for local dev:
- `MEMORY_KEY` – 32+ char encryption key (`openssl rand -base64 32`)
- One AI provider key (e.g., `GEMINI_API_KEY` or `OPENROUTER_API_KEY`)

`DATABASE_URL` is only required when running `pnpm db:push` (PostgreSQL migrations). SQLite is used automatically in dev.
