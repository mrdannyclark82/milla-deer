# Copilot Instructions – Milla-Rayne / Milla-Deer

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
