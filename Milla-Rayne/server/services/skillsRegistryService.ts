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
  {
    id: 'system-health',
    name: 'System Health',
    label: 'System Health',
    icon: '🖥️',
    description: 'Check server health, memory usage, uptime, and active connections',
    category: 'infrastructure',
    systemPrompt: `You are operating in System Health mode. You can check CPU usage, memory, uptime, and server statistics. When asked about system status, call the system:health tool to retrieve live metrics.`,
    tools: [
      { id: 'system:health', description: 'Returns CPU, memory, uptime stats' },
    ],
    examples: [
      { prompt: 'Check system health', response: '[calls system:health]' },
      { prompt: 'How much memory is free?', response: '[calls system:health and reports free memory]' },
    ],
  },
  {
    id: 'model-status',
    name: 'Model Status',
    label: 'Model Status',
    icon: '🤖',
    description: 'List all available AI models and which ones are currently loaded',
    category: 'infrastructure',
    systemPrompt: `You are operating in Model Status mode. You can list all configured AI models and check which ones are active. Call model:status to retrieve the current model configuration.`,
    tools: [
      { id: 'model:status', description: 'Returns active model list' },
    ],
    examples: [
      { prompt: 'What models are available?', response: '[calls model:status and lists models]' },
      { prompt: 'Which AI model is loaded?', response: '[calls model:status]' },
    ],
  },
  {
    id: 'file-browser',
    name: 'File Browser',
    label: 'File Browser',
    icon: '📁',
    description: 'Browse files in the Milla workspace directory',
    category: 'filesystem',
    systemPrompt: `You are operating in File Browser mode. You can list files and directories in the Milla workspace. Call files:list to browse directory contents. Pass a path payload to browse a specific directory.`,
    tools: [
      { id: 'files:list', description: 'Lists workspace files' },
    ],
    examples: [
      { prompt: 'Show files in workspace', response: '[calls files:list]' },
      { prompt: 'Browse the src directory', response: '[calls files:list with path="/home/nexus/ogdray/src"]' },
    ],
  },
  {
    id: 'weather',
    name: 'Weather',
    label: 'Weather',
    icon: '🌤️',
    description: 'Get current weather for a location. Payload: { location: "city name" }',
    category: 'interaction',
    systemPrompt: `You are operating in Weather mode. You can fetch current weather data for any city. Call web:weather with a location payload to get temperature, conditions, and humidity.`,
    tools: [
      { id: 'web:weather', description: 'Fetches current weather' },
    ],
    examples: [
      { prompt: 'What is the weather in Atlanta?', response: '[calls web:weather with location="Atlanta"]' },
      { prompt: 'Current weather for NYC', response: '[calls web:weather with location="New York City"]' },
    ],
  },
  {
    id: 'web-search',
    name: 'Web Search',
    label: 'Web Search',
    icon: '🔍',
    description: 'Search the web using DuckDuckGo. Payload: { query: "search terms" }',
    category: 'interaction',
    systemPrompt: `You are operating in Web Search mode. You can search the web using DuckDuckGo. Call web:search with a query payload to retrieve instant answers and related topics.`,
    tools: [
      { id: 'web:search', description: 'DuckDuckGo search' },
    ],
    examples: [
      { prompt: 'Search for TypeScript best practices', response: '[calls web:search with query="TypeScript best practices"]' },
      { prompt: 'Look up latest AI news', response: '[calls web:search with query="latest AI news 2024"]' },
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
