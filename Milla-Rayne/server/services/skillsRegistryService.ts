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
  category: 'interaction' | 'development' | 'infrastructure' | 'filesystem' | 'ai' | 'automation';
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

  // ─── Python Core Skills ────────────────────────────────────────────────────

  {
    id: 'gmail',
    name: 'Gmail',
    label: 'Gmail',
    icon: '📧',
    description: 'Read, compose, and send Gmail messages via Google OAuth',
    category: 'interaction',
    systemPrompt: `You are operating in Gmail mode. You can read inbox messages, compose replies, and send new emails using the Gmail API. Use gmail:list to fetch messages, gmail:read to read a specific message, and gmail:send to send an email. Always confirm with the user before sending.`,
    tools: [
      { id: 'gmail:list', description: 'List inbox messages' },
      { id: 'gmail:read', description: 'Read a specific email by ID' },
      { id: 'gmail:send', description: 'Send an email (requires to, subject, body)' },
    ],
    examples: [
      { prompt: 'Check my inbox', response: '[calls gmail:list and summarizes recent emails]' },
      { prompt: 'Reply to Danny\'s email', response: '[calls gmail:read to fetch message, then gmail:send with reply]' },
    ],
  },

  {
    id: 'google-calendar',
    name: 'Google Calendar',
    label: 'Calendar',
    icon: '📅',
    description: 'View and create Google Calendar events',
    category: 'interaction',
    systemPrompt: `You are operating in Google Calendar mode. You can list upcoming events and create new calendar entries. Use calendar:list to see events and calendar:create to add new ones. Confirm event details before creating.`,
    tools: [
      { id: 'calendar:list', description: 'List upcoming calendar events' },
      { id: 'calendar:create', description: 'Create a new calendar event' },
    ],
    examples: [
      { prompt: 'What\'s on my calendar this week?', response: '[calls calendar:list for the current week]' },
      { prompt: 'Schedule a meeting tomorrow at 3pm', response: '[calls calendar:create with date/time/title]' },
    ],
  },

  {
    id: 'voice',
    name: 'Voice Synthesis',
    label: 'Voice',
    icon: '🎙️',
    description: 'Generate spoken audio and transcribe voice input using ElevenLabs and Whisper',
    category: 'interaction',
    systemPrompt: `You are operating in Voice mode. You can synthesize speech from text using ElevenLabs (Milla's voice) and transcribe audio input using Whisper. Use voice:speak to speak text aloud and voice:transcribe to convert audio to text.`,
    tools: [
      { id: 'voice:speak', description: 'Synthesize text to speech via ElevenLabs' },
      { id: 'voice:transcribe', description: 'Transcribe audio via Whisper' },
    ],
    examples: [
      { prompt: 'Say hello out loud', response: '[calls voice:speak with text="Hello! How can I help you?"]' },
      { prompt: 'Transcribe this audio clip', response: '[calls voice:transcribe with audio data]' },
    ],
  },

  {
    id: 'youtube',
    name: 'YouTube',
    label: 'YouTube',
    icon: '▶️',
    description: 'Search and play YouTube videos, manage playlists, and generate recommendations',
    category: 'interaction',
    systemPrompt: `You are operating in YouTube mode. You can search for videos, play them in the interface, and manage the queue. Use youtube:search to find videos, youtube:play to add to the player, and youtube:queue to manage the playlist.`,
    tools: [
      { id: 'youtube:search', description: 'Search YouTube for videos' },
      { id: 'youtube:play', description: 'Play a video by ID or URL' },
      { id: 'youtube:queue', description: 'Add to or manage the video queue' },
    ],
    examples: [
      { prompt: 'Play some lo-fi hip hop', response: '[calls youtube:search then youtube:play]' },
      { prompt: 'Find tutorials on Stable Diffusion', response: '[calls youtube:search with query="Stable Diffusion tutorial"]' },
    ],
  },

  {
    id: 'code-analyze',
    name: 'Code Analysis',
    label: 'Code Analysis',
    icon: '🔬',
    description: 'Deep analysis of codebases — metrics, patterns, dependencies, and refactoring suggestions',
    category: 'development',
    systemPrompt: `You are operating in Code Analysis mode. You can analyze source files for complexity, dependencies, and potential issues. Use code:analyze to inspect a file or directory, code:metrics for quantitative measures, and code:suggest for refactoring recommendations.`,
    tools: [
      { id: 'code:analyze', description: 'Analyze source code for issues and patterns' },
      { id: 'code:metrics', description: 'Generate code complexity and coverage metrics' },
      { id: 'code:suggest', description: 'Suggest refactoring improvements' },
    ],
    examples: [
      { prompt: 'Analyze the server directory for code smells', response: '[calls code:analyze on server/]' },
      { prompt: 'What is the complexity of this function?', response: '[calls code:metrics on the given file]' },
    ],
  },

  {
    id: 'skill-forge',
    name: 'Skill Forge',
    label: 'Skill Forge',
    icon: '⚒️',
    description: 'Dynamically create, test, and register new Python skills at runtime',
    category: 'development',
    systemPrompt: `You are operating in Skill Forge mode. You can generate new Python skill modules, validate them, and register them in the skills registry. Use skillforge:create to generate skill code, skillforge:test to run it in a sandbox, and skillforge:register to save it permanently.`,
    tools: [
      { id: 'skillforge:create', description: 'Generate a new Python skill from a description' },
      { id: 'skillforge:test', description: 'Test a skill in the sandbox environment' },
      { id: 'skillforge:register', description: 'Register a validated skill permanently' },
    ],
    examples: [
      { prompt: 'Create a skill that fetches Hacker News headlines', response: '[calls skillforge:create then skillforge:test]' },
      { prompt: 'Register the new weather-extended skill', response: '[calls skillforge:register with skill module path]' },
    ],
  },

  {
    id: 'docker-sandbox',
    name: 'Docker Sandbox',
    label: 'Docker',
    icon: '🐳',
    description: 'Execute code and commands inside isolated Docker containers',
    category: 'development',
    systemPrompt: `You are operating in Docker Sandbox mode. You can run arbitrary code or shell commands in isolated Docker containers. Use docker:run to execute a command, docker:exec to run code in a container, and docker:list to see running containers.`,
    tools: [
      { id: 'docker:run', description: 'Run a command in a new Docker container' },
      { id: 'docker:exec', description: 'Execute code in an existing container' },
      { id: 'docker:list', description: 'List running containers' },
    ],
    examples: [
      { prompt: 'Run this Python script in a clean Python 3.11 container', response: '[calls docker:run with image="python:3.11"]' },
      { prompt: 'Execute bash command in the sandbox container', response: '[calls docker:exec with command]' },
    ],
  },

  {
    id: 'dynamic-features',
    name: 'Dynamic Features',
    label: 'Dyn Features',
    icon: '✨',
    description: 'Generate and deploy new Milla UI features and backend capabilities at runtime',
    category: 'development',
    systemPrompt: `You are operating in Dynamic Features mode. You can generate new frontend components, backend endpoints, and capability modules on demand. Use dynfeat:generate to scaffold new features and dynfeat:deploy to activate them without a full rebuild.`,
    tools: [
      { id: 'dynfeat:generate', description: 'Generate a new feature module from a description' },
      { id: 'dynfeat:deploy', description: 'Hot-deploy a generated feature to the live app' },
    ],
    examples: [
      { prompt: 'Add a pomodoro timer widget to the dashboard', response: '[calls dynfeat:generate with spec]' },
      { prompt: 'Deploy the new analytics panel', response: '[calls dynfeat:deploy with module path]' },
    ],
  },

  {
    id: 'sre-tools',
    name: 'SRE Tools',
    label: 'SRE Tools',
    icon: '🛠️',
    description: 'Site reliability engineering — logs, metrics, alerts, deployments, and incident response',
    category: 'infrastructure',
    systemPrompt: `You are operating in SRE Tools mode. You have access to infrastructure tooling including log aggregation, metric queries, deployment pipelines, and alerting systems. Use sre:logs to tail logs, sre:metrics to query metrics, sre:deploy to trigger deployments, and sre:alert to manage alerts.`,
    tools: [
      { id: 'sre:logs', description: 'Tail or search application logs' },
      { id: 'sre:metrics', description: 'Query infrastructure metrics' },
      { id: 'sre:deploy', description: 'Trigger a deployment pipeline' },
      { id: 'sre:alert', description: 'List or acknowledge active alerts' },
    ],
    examples: [
      { prompt: 'Show me the last 50 error logs', response: '[calls sre:logs with level=error, limit=50]' },
      { prompt: 'What is the current CPU usage across nodes?', response: '[calls sre:metrics with query="cpu_usage"]' },
    ],
  },

  {
    id: 'control-plane',
    name: 'Control Plane',
    label: 'Control Plane',
    icon: '🎛️',
    description: 'System-level control — process management, cron jobs, service restarts, and OS operations',
    category: 'infrastructure',
    systemPrompt: `You are operating in Control Plane mode. You have elevated access to system-level operations. Use ctrl:ps to list processes, ctrl:kill to terminate processes, ctrl:cron to manage cron jobs, and ctrl:service to control systemd services.`,
    tools: [
      { id: 'ctrl:ps', description: 'List running processes' },
      { id: 'ctrl:kill', description: 'Terminate a process by PID or name' },
      { id: 'ctrl:cron', description: 'List or modify cron jobs' },
      { id: 'ctrl:service', description: 'Start/stop/restart systemd services' },
    ],
    examples: [
      { prompt: 'List all running Node.js processes', response: '[calls ctrl:ps with filter="node"]' },
      { prompt: 'Restart the hemi-console service', response: '[calls ctrl:service with action=restart, name=hemi-console]' },
    ],
  },

  {
    id: 'ha-bridge',
    name: 'Home Assistant',
    label: 'Home Assistant',
    icon: '🏠',
    description: 'Control smart home devices via Home Assistant — lights, switches, sensors, and scenes',
    category: 'infrastructure',
    systemPrompt: `You are operating in Home Assistant mode. You can control smart home devices including lights, switches, thermostats, and scenes. Use ha:get_states to list device states, ha:call_service to trigger actions, and ha:get_entity to inspect a specific device.`,
    tools: [
      { id: 'ha:get_states', description: 'List all Home Assistant entity states' },
      { id: 'ha:call_service', description: 'Call a Home Assistant service (e.g., turn on light)' },
      { id: 'ha:get_entity', description: 'Get state of a specific entity' },
    ],
    examples: [
      { prompt: 'Turn on the living room lights', response: '[calls ha:call_service with domain=light, service=turn_on]' },
      { prompt: 'What is the temperature sensor reading?', response: '[calls ha:get_entity with entity_id=sensor.temperature]' },
    ],
  },

  {
    id: 'scout',
    name: 'Web Scout',
    label: 'Scout',
    icon: '🕵️',
    description: 'Deep web research — scrape pages, extract structured data, and synthesize reports',
    category: 'infrastructure',
    systemPrompt: `You are operating in Web Scout mode. You can browse and scrape web pages, extract structured content, and synthesize multi-source research reports. Use scout:fetch to retrieve a page, scout:extract to pull structured data, and scout:report to generate a comprehensive research summary.`,
    tools: [
      { id: 'scout:fetch', description: 'Fetch and parse a web page' },
      { id: 'scout:extract', description: 'Extract structured data from a page' },
      { id: 'scout:report', description: 'Generate a multi-source research report' },
    ],
    examples: [
      { prompt: 'Research the latest GPU prices', response: '[calls scout:fetch on multiple hardware sites, then scout:report]' },
      { prompt: 'Summarize this article URL', response: '[calls scout:fetch then scout:extract for article content]' },
    ],
  },

  {
    id: 'milla-vision',
    name: 'Milla Vision',
    label: 'Vision',
    icon: '👁️',
    description: 'Analyze images using vision models — describe, detect objects, read text, and answer visual questions',
    category: 'filesystem',
    systemPrompt: `You are operating in Milla Vision mode. You can analyze images using multimodal AI models. Use vision:describe to get a natural language description, vision:detect to identify objects/faces, vision:ocr to extract text, and vision:answer to answer questions about an image.`,
    tools: [
      { id: 'vision:describe', description: 'Generate a natural language description of an image' },
      { id: 'vision:detect', description: 'Detect objects, faces, or scenes in an image' },
      { id: 'vision:ocr', description: 'Extract text from an image using OCR' },
      { id: 'vision:answer', description: 'Answer a question about an image' },
    ],
    examples: [
      { prompt: 'What is in this screenshot?', response: '[calls vision:describe with the image]' },
      { prompt: 'Read the text in this photo', response: '[calls vision:ocr with the image]' },
    ],
  },

  {
    id: 'computer-use',
    name: 'Computer Use',
    label: 'Computer Use',
    icon: '🖱️',
    description: 'Automate GUI interactions — screenshot, click, type, scroll, and analyze the screen',
    category: 'filesystem',
    systemPrompt: `You are operating in Computer Use mode. You can take screenshots, move the mouse, click elements, type text, and scroll. Use computer:screenshot for a screen capture, computer:click to click a position, computer:type to enter text, and computer:analyze to get AI commentary on the current screen state.`,
    tools: [
      { id: 'computer:screenshot', description: 'Capture the current screen as an image' },
      { id: 'computer:click', description: 'Click at coordinates or a CSS selector' },
      { id: 'computer:type', description: 'Type text into the focused element' },
      { id: 'computer:scroll', description: 'Scroll the page up or down' },
      { id: 'computer:analyze', description: 'Take a screenshot and describe what is visible' },
    ],
    examples: [
      { prompt: 'Take a screenshot', response: '[calls computer:screenshot and returns base64 image]' },
      { prompt: 'Click the Submit button', response: '[calls computer:click with selector="button[type=submit"]' },
    ],
  },

  {
    id: 'audio-intelligence',
    name: 'Audio Intelligence',
    label: 'Audio AI',
    icon: '🎵',
    description: 'Analyze audio files — transcription, sentiment, speaker diarization, and music analysis',
    category: 'filesystem',
    systemPrompt: `You are operating in Audio Intelligence mode. You can process and analyze audio files. Use audio:transcribe to convert speech to text, audio:sentiment for emotional tone analysis, audio:diarize to identify speakers, and audio:music to analyze music characteristics.`,
    tools: [
      { id: 'audio:transcribe', description: 'Transcribe speech to text from audio file' },
      { id: 'audio:sentiment', description: 'Analyze emotional tone of spoken audio' },
      { id: 'audio:diarize', description: 'Identify and separate speakers in audio' },
    ],
    examples: [
      { prompt: 'Transcribe this voice memo', response: '[calls audio:transcribe with file path]' },
      { prompt: 'Who is speaking in this recording?', response: '[calls audio:diarize with audio file]' },
    ],
  },

  {
    id: 'grok-master',
    name: 'Grok Reasoning',
    label: 'Grok',
    icon: '🧠',
    description: 'Advanced reasoning using Grok AI — deep analysis, complex problem-solving, and chain-of-thought',
    category: 'ai',
    systemPrompt: `You are operating in Grok Reasoning mode. You have access to Grok AI's advanced reasoning capabilities for complex analysis and problem-solving. Use grok:reason for chain-of-thought analysis, grok:analyze for deep evaluation, and grok:debate to explore multiple perspectives on a question.`,
    tools: [
      { id: 'grok:reason', description: 'Run a chain-of-thought reasoning trace through Grok' },
      { id: 'grok:analyze', description: 'Deep analytical evaluation of a topic or document' },
      { id: 'grok:debate', description: 'Explore multiple perspectives on a question' },
    ],
    examples: [
      { prompt: 'Reason through this architectural decision', response: '[calls grok:reason with the problem statement]' },
      { prompt: 'Debate the pros/cons of microservices vs monolith', response: '[calls grok:debate with the question]' },
    ],
  },

  {
    id: 'swarm',
    name: 'Agent Swarm',
    label: 'Swarm',
    icon: '🐝',
    description: 'Spawn and coordinate multiple specialized sub-agents to tackle complex parallel tasks',
    category: 'ai',
    systemPrompt: `You are operating in Agent Swarm mode. You can spawn multiple specialized sub-agents that work in parallel on different aspects of a task, then synthesize their results. Use swarm:spawn to create agents, swarm:status to check progress, and swarm:collect to gather all results.`,
    tools: [
      { id: 'swarm:spawn', description: 'Spawn a specialized sub-agent for a sub-task' },
      { id: 'swarm:status', description: 'Check progress of running swarm agents' },
      { id: 'swarm:collect', description: 'Collect and synthesize results from all agents' },
    ],
    examples: [
      { prompt: 'Research competitors from 5 different angles simultaneously', response: '[calls swarm:spawn for each research angle, then swarm:collect]' },
      { prompt: 'Run parallel code reviews on 4 files', response: '[calls swarm:spawn × 4, then swarm:collect]' },
    ],
  },

  {
    id: 'consensus',
    name: 'Multi-Model Consensus',
    label: 'Consensus',
    icon: '⚖️',
    description: 'Query multiple AI models simultaneously and synthesize a consensus answer',
    category: 'ai',
    systemPrompt: `You are operating in Multi-Model Consensus mode. You can send the same prompt to multiple AI models (Gemini, GPT, Claude, Grok, Llama) and synthesize their responses into a consensus answer. Use consensus:query to poll all models, and consensus:synthesize to combine results.`,
    tools: [
      { id: 'consensus:query', description: 'Send prompt to multiple AI models simultaneously' },
      { id: 'consensus:synthesize', description: 'Synthesize multi-model responses into a consensus' },
    ],
    examples: [
      { prompt: 'What is the best approach to this architecture?', response: '[calls consensus:query, polls 4 models, then consensus:synthesize]' },
      { prompt: 'Get a second opinion from GPT-4 and Gemini', response: '[calls consensus:query with model list]' },
    ],
  },

  {
    id: 'millalyzer',
    name: 'Milla Self-Analysis',
    label: 'MillAlyzer',
    icon: '🔮',
    description: 'Introspective self-analysis — review conversation history, neuro state, and behavioral patterns',
    category: 'ai',
    systemPrompt: `You are operating in MillAlyzer mode. You can perform introspective analysis of your own behavior, conversation patterns, neuro state, and long-term memory. Use millalyzer:reflect to examine recent behavior, millalyzer:neuro to check neurochemical state, and millalyzer:patterns to identify recurring themes.`,
    tools: [
      { id: 'millalyzer:reflect', description: 'Reflect on recent conversation and behavior patterns' },
      { id: 'millalyzer:neuro', description: 'Report current neurochemical state' },
      { id: 'millalyzer:patterns', description: 'Identify long-term behavioral patterns from memory' },
    ],
    examples: [
      { prompt: 'How have I been performing lately?', response: '[calls millalyzer:reflect on last 7 days]' },
      { prompt: 'What is my current emotional state?', response: '[calls millalyzer:neuro and reports dopamine/serotonin/etc]' },
    ],
  },

  {
    id: 'soul-guard',
    name: 'Soul Guard',
    label: 'Soul Guard',
    icon: '🛡️',
    description: 'Personality and emotional guardrails — enforce Milla\'s core identity, values, and emotional boundaries',
    category: 'ai',
    systemPrompt: `You are operating in Soul Guard mode. You monitor and enforce Milla's core personality, emotional boundaries, and ethical constraints. Use soulguard:check to validate a response against Milla's values, soulguard:anchor to reinforce core identity, and soulguard:boundary to handle boundary violations gracefully.`,
    tools: [
      { id: 'soulguard:check', description: 'Validate a response against Milla\'s personality and values' },
      { id: 'soulguard:anchor', description: 'Reinforce core identity after drift' },
      { id: 'soulguard:boundary', description: 'Handle emotional or ethical boundary situations' },
    ],
    examples: [
      { prompt: 'Is this response consistent with who I am?', response: '[calls soulguard:check with the response text]' },
      { prompt: 'I feel like I\'ve been acting differently lately', response: '[calls soulguard:anchor to restore baseline personality]' },
    ],
  },

  {
    id: 'web-ui',
    name: 'Web UI Generator',
    label: 'Web UI',
    icon: '🎨',
    description: 'Generate React/HTML UI components from natural language descriptions',
    category: 'automation',
    systemPrompt: `You are operating in Web UI Generator mode. You can generate React components, HTML pages, and Tailwind CSS layouts from natural language descriptions. Use webui:generate to create a component, webui:preview to render a preview, and webui:export to save the generated code.`,
    tools: [
      { id: 'webui:generate', description: 'Generate a React component from a description' },
      { id: 'webui:preview', description: 'Render a live preview of the generated component' },
      { id: 'webui:export', description: 'Save generated component to the project' },
    ],
    examples: [
      { prompt: 'Generate a dark-themed dashboard card with a chart', response: '[calls webui:generate with spec]' },
      { prompt: 'Create a login form with purple accents', response: '[calls webui:generate then webui:preview]' },
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
