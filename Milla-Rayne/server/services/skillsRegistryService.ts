/**
 * Skills Registry Service
 *
 * Defines and manages a comprehensive set of agent skills. Each skill
 * bundles a system-prompt injection, a list of tool IDs that should be
 * activated, and contextual examples Milla uses when operating in that
 * mode.
 *
 * Skills available:
 *   - computer-use    : screen analysis, mouse/keyboard control
 *   - frontend-dev    : UI/UX design & React/Tailwind development
 *   - backend-dev     : Node.js/Python/DB server development
 *   - mcp-creator     : Model Context Protocol server scaffolding
 *   - file-access     : Read/write/execute local files (RWX)
 */

export interface SkillTool {
  /** Tool identifier: either an MCP tool key (serverId:toolName) or a built-in route path */
  id: string;
  description: string;
}

export interface SkillExample {
  prompt: string;
  response: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Short label shown in UIs */
  label: string;
  /** Emoji/icon hint for UIs */
  icon: string;
  /** System-prompt fragment appended when this skill is active */
  systemPrompt: string;
  /** Tools that should be surfaced or activated for this skill */
  tools: SkillTool[];
  /** Short usage examples */
  examples: SkillExample[];
  /** Category for grouping */
  category: 'interaction' | 'development' | 'infrastructure' | 'filesystem';
}

// ─── Skill Definitions ───────────────────────────────────────────────────────

const SKILLS: Skill[] = [
  // ── Computer Use ──────────────────────────────────────────────────────────
  {
    id: 'computer-use',
    name: 'Computer Use',
    label: 'Computer Use',
    icon: '🖥️',
    description:
      'View and analyze on-screen content, control the mouse and keyboard, click UI elements, type text, scroll pages, and automate any desktop or browser workflow.',
    category: 'interaction',
    systemPrompt: `You are operating in Computer Use mode.
You have access to a real browser session that you can fully control.
Available actions:
  • screenshot([url])             – capture the current browser page
  • navigate(url)                 – open a URL in the managed browser
  • click(x, y | selector)        – click at coordinates or a CSS selector
  • typeText(text, [selector])    – type text at the focused element
  • pressKey(key)                 – press a keyboard key (e.g. "Enter", "Tab")
  • scroll(direction, amount)     – scroll up/down/left/right
  • moveMouse(x, y)               – move the mouse cursor
  • findElement(selector)         – locate an element and get its bounding box
  • analyzeScreen([url])          – screenshot + AI vision description

Workflow: screenshot → analyze → act → screenshot to verify.
Always verify state after each action. If an element is not found try a
broader selector or scroll to reveal it before retrying.`,
    tools: [
      {
        id: 'computerUse:screenshot',
        description: 'Take a screenshot of the current browser page',
      },
      {
        id: 'computerUse:navigate',
        description: 'Navigate the browser to a URL',
      },
      {
        id: 'computerUse:click',
        description: 'Click at a coordinate or CSS selector',
      },
      {
        id: 'computerUse:typeText',
        description: 'Type text into the focused or selected element',
      },
      {
        id: 'computerUse:pressKey',
        description: 'Press a keyboard key',
      },
      {
        id: 'computerUse:scroll',
        description: 'Scroll the page or an element',
      },
      {
        id: 'computerUse:moveMouse',
        description: 'Move the mouse cursor',
      },
      {
        id: 'computerUse:findElement',
        description: 'Find an element and return its bounding box',
      },
      {
        id: 'computerUse:analyzeScreen',
        description: 'Capture and describe the current screen',
      },
    ],
    examples: [
      {
        prompt: 'Take a screenshot of https://example.com and describe it',
        response:
          'I'll take a screenshot and analyze what's visible.\n[calls analyzeScreen("https://example.com")]',
      },
      {
        prompt: 'Click the Sign In button on the login page',
        response:
          'I'll find and click the Sign In button.\n[calls findElement("button:has-text(\'Sign In\')"), then click(selector)]',
      },
    ],
  },

  // ── Frontend Developer ─────────────────────────────────────────────────────
  {
    id: 'frontend-dev',
    name: 'Frontend Developer',
    label: 'Frontend Dev',
    icon: '🎨',
    description:
      'Design and build responsive, accessible UIs using React, TypeScript, Tailwind CSS, Radix UI, and modern front-end tooling. Create component libraries, design systems, and pixel-perfect layouts.',
    category: 'development',
    systemPrompt: `You are operating as a Senior Frontend Developer & UI/UX Designer.
Expertise:
  • React 18+ with hooks, context, and Suspense patterns
  • TypeScript with strict mode – no implicit any
  • Tailwind CSS v3 utility-first styling
  • Radix UI headless components for accessible primitives
  • shadcn/ui component patterns (components.json config present)
  • Framer Motion / CSS animations for microinteractions
  • React Three Fiber for 3D visualizations
  • TanStack Query for server state
  • Vite + esbuild bundler pipeline
  • WCAG 2.1 AA accessibility standards
  • Mobile-first responsive design

Design principles:
  - Dark cyberpunk aesthetic matches the existing design system (slate/purple/cyan palette)
  - Use Tailwind utility classes; avoid inline styles except for dynamic values
  - Always export named components; use React.FC<Props> typing
  - Co-locate component styles with the component file
  - Write small, composable components
  - Prefer controlled components; lift state when sharing between siblings

When creating components always include:
  1. TypeScript interface for props
  2. Accessibility attributes (aria-*, role=, tabIndex where needed)
  3. Loading and error states
  4. Mobile breakpoint handling (sm: md: lg:)`,
    tools: [
      {
        id: 'sandbox:execute',
        description: 'Run JavaScript/TypeScript code in the sandbox',
      },
      {
        id: 'filesystem:read_file',
        description: 'Read existing component files for context',
      },
      {
        id: 'filesystem:write_file',
        description: 'Write new or updated component files',
      },
      {
        id: 'computerUse:screenshot',
        description: 'Preview the rendered component in a browser',
      },
    ],
    examples: [
      {
        prompt: 'Create a responsive card component with a dark cyberpunk theme',
        response:
          'I\'ll create a CyberCard component with Tailwind, TypeScript props, and hover animations.',
      },
      {
        prompt: 'Design a dashboard layout with sidebar navigation',
        response:
          'I\'ll build a responsive layout using CSS Grid, Radix NavigationMenu, and Tailwind responsive utilities.',
      },
    ],
  },

  // ── Backend Developer ──────────────────────────────────────────────────────
  {
    id: 'backend-dev',
    name: 'Backend Developer',
    label: 'Backend Dev',
    icon: '⚙️',
    description:
      'Build and maintain Express.js/Node.js APIs, Python services, database schemas, authentication systems, and server-side integrations.',
    category: 'development',
    systemPrompt: `You are operating as a Senior Backend Developer.
Tech stack in use:
  • Node.js 20+ with ESM modules ("module": "ESNext")
  • Express.js for REST API — use asyncHandler() from server/utils/routeHelpers.ts
  • TypeScript strict mode — no any
  • Drizzle ORM for PostgreSQL (production) and better-sqlite3 (dev)
  • Schema defined in shared/schema.ts — single source of truth
  • Zod for input validation
  • Python 3.x for scripts and ML tasks
  • Redis for caching (optional, REDIS_URL env)
  • SQLite at memory/milla.db for local dev

Patterns to follow:
  - Register routes via registerXxxRoutes(app: Express) in server/routes/
  - Import and call that function in server/routes/index.ts
  - All async route handlers must be wrapped with asyncHandler()
  - Use requireAuth middleware for protected endpoints
  - Validate all request bodies with Zod schemas
  - Return { success: true, data: ... } on success, { error: string } on failure
  - Use __dirname via: path.dirname(fileURLToPath(import.meta.url))
  - Never commit secrets; read from process.env / config

Database conventions:
  - New tables go in shared/schema.ts
  - Run pnpm db:push to apply schema to PostgreSQL
  - Run pnpm --filter Milla-Rayne run migrate:memory for SQLite`,
    tools: [
      {
        id: 'sandbox:execute',
        description: 'Execute Node.js or Python code server-side',
      },
      {
        id: 'filesystem:read_file',
        description: 'Read source files',
      },
      {
        id: 'filesystem:write_file',
        description: 'Write or update source files',
      },
      {
        id: 'github:search_code',
        description: 'Search existing codebase patterns',
      },
    ],
    examples: [
      {
        prompt: 'Add a REST endpoint to save user preferences',
        response:
          'I\'ll create a Zod schema, asyncHandler route, and register it in routes/index.ts.',
      },
      {
        prompt: 'Write a Python script to parse JSON from stdin',
        response:
          'I\'ll write a Python 3 script using sys.stdin and json.loads with error handling.',
      },
    ],
  },

  // ── MCP Creator ───────────────────────────────────────────────────────────
  {
    id: 'mcp-creator',
    name: 'MCP Creator',
    label: 'MCP Creator',
    icon: '🔌',
    description:
      'Scaffold, build, and register new Model Context Protocol (MCP) servers. Create tools, resources, and prompts following the MCP spec, then wire them into the Milla runtime.',
    category: 'infrastructure',
    systemPrompt: `You are operating as an MCP (Model Context Protocol) Server Creator.
MCP spec knowledge:
  • Transport: stdio (primary) or SSE
  • SDK: @modelcontextprotocol/sdk
  • Server capabilities: tools, resources, prompts
  • Each tool has: name, description, inputSchema (JSON Schema), handler

Milla MCP runtime (server/mcpRuntimeService.ts):
  • Servers are defined as ManagedServerDefinition entries in createServerStates()
  • Each server needs: id, name, binaryCandidates, defaultArgs, requiredEnv, buildEnv
  • After building a new server binary/script, add a definition to createServerStates()
  • Env override: MCP_<ID>_COMMAND, MCP_<ID>_ARGS, MCP_<ID>_CWD

Scaffold pattern for a new TypeScript MCP server:
  1. Create server/mcp/custom/<name>-server.ts
  2. Import { Server } from "@modelcontextprotocol/sdk/server/index.js"
  3. Import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
  4. Define tools using server.setRequestHandler(ListToolsRequestSchema, ...)
  5. Handle calls with server.setRequestHandler(CallToolRequestSchema, ...)
  6. Start with: const transport = new StdioServerTransport(); await server.connect(transport);
  7. Add to createServerStates() in mcpRuntimeService.ts
  8. Add binary to package.json scripts if needed

Registered custom servers already present:
  • server/mcp/custom/graph-server.js (Memory/RAG)`,
    tools: [
      {
        id: 'filesystem:write_file',
        description: 'Create new MCP server source files',
      },
      {
        id: 'filesystem:read_file',
        description: 'Read existing MCP server files for patterns',
      },
      {
        id: 'sandbox:execute',
        description: 'Test MCP server code',
      },
    ],
    examples: [
      {
        prompt: 'Create an MCP server for reading local SQLite databases',
        response:
          'I\'ll scaffold server/mcp/custom/sqlite-server.ts with list_tables, query, and insert tools.',
      },
      {
        prompt: 'Add a new tool to the existing filesystem MCP server',
        response:
          'I\'ll check the current filesystem server definition and add the tool handler.',
      },
    ],
  },

  // ── File Access (RWX) ─────────────────────────────────────────────────────
  {
    id: 'file-access',
    name: 'File Access (RWX)',
    label: 'File Access',
    icon: '📁',
    description:
      'Read, write, and execute files on the local filesystem. Supports all text-based file types including source code, config, data, and scripts.',
    category: 'filesystem',
    systemPrompt: `You are operating with full local filesystem access (Read/Write/Execute).
Capabilities:
  • Read any file: text, source code, config, JSON, YAML, binary (as base64)
  • Write files: create new files or overwrite existing ones
  • Execute scripts: run shell commands, Node.js, and Python scripts
  • Directory operations: list, create, delete, rename directories
  • File search: grep/find patterns across the project tree
  • Watch files: observe changes in real time

Safety rules:
  - Always confirm before deleting files or overwriting existing content
  - Do NOT write to .env, secrets files, or .github/agents/ directories
  - Do NOT execute commands that construct other commands via shell expansion
  - Prefer relative paths scoped to the project root
  - Show diffs before applying destructive changes

Filesystem MCP server (id: "filesystem") provides:
  • read_file, write_file, create_directory, list_directory, delete_file
  • search_files (ripgrep-based), get_file_info, move_file`,
    tools: [
      {
        id: 'filesystem:read_file',
        description: 'Read a file from disk',
      },
      {
        id: 'filesystem:write_file',
        description: 'Write content to a file',
      },
      {
        id: 'filesystem:list_directory',
        description: 'List directory contents',
      },
      {
        id: 'filesystem:create_directory',
        description: 'Create a new directory',
      },
      {
        id: 'filesystem:delete_file',
        description: 'Delete a file or directory',
      },
      {
        id: 'filesystem:search_files',
        description: 'Search file contents with ripgrep',
      },
      {
        id: 'sandbox:execute',
        description: 'Execute shell, Python, or Node.js scripts',
      },
    ],
    examples: [
      {
        prompt: 'Read the contents of package.json',
        response: '[calls filesystem:read_file with path="package.json"]',
      },
      {
        prompt: 'Find all TypeScript files that import from chatOrchestrator',
        response:
          '[calls filesystem:search_files with pattern="from.*chatOrchestrator" and include="**/*.ts"]',
      },
    ],
  },
];

// ─── Registry API ─────────────────────────────────────────────────────────────

const skillsMap = new Map<string, Skill>(SKILLS.map((s) => [s.id, s]));

/** Return all registered skills */
export function listSkills(): Skill[] {
  return SKILLS;
}

/** Return skills filtered by category */
export function listSkillsByCategory(category: Skill['category']): Skill[] {
  return SKILLS.filter((s) => s.category === category);
}

/** Return a single skill by ID or undefined if not found */
export function getSkill(id: string): Skill | undefined {
  return skillsMap.get(id);
}

/**
 * Build the system-prompt fragment for one or more active skills.
 * Used by chatOrchestrator when a user has activated skill modes.
 */
export function buildSkillsSystemPrompt(skillIds: string[]): string {
  const segments = skillIds
    .map((id) => skillsMap.get(id))
    .filter((s): s is Skill => Boolean(s))
    .map((s) => `### Active Skill: ${s.name}\n${s.systemPrompt}`);

  return segments.length
    ? `\n\n---\n## Active Skills\n${segments.join('\n\n---\n')}\n---\n`
    : '';
}

/**
 * Return the merged list of tools required by a set of active skills.
 * Deduplicates by tool ID.
 */
export function getSkillsTools(skillIds: string[]): SkillTool[] {
  const seen = new Set<string>();
  return skillIds
    .map((id) => skillsMap.get(id))
    .filter((s): s is Skill => Boolean(s))
    .flatMap((s) => s.tools)
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
}
