import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath, override: false });
}

/**
 * Memoization helper for config values with key-based caching
 * Caches computed values to avoid repeated processing
 */
const memoize = <T>(fn: (...args: any[]) => T): ((...args: any[]) => T) => {
  const cache = new Map<string, T>();

  return (...args: any[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

// Helper to get boolean config values with memoization
const getBoolConfig = memoize(
  (key: string, defaultValue: boolean = false): boolean => {
    return (
      process.env[key] === 'true' ||
      (defaultValue && process.env[key] !== 'false')
    );
  }
);

// Helper to get integer config values with memoization
const getIntConfig = memoize((key: string, defaultValue: number): number => {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
});

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveReplycaPythonExecutable(): string {
  const candidates = [
    process.env.REPLYCA_PYTHON_BIN,
    path.resolve(process.cwd(), 'venv', 'bin', 'python'),
    path.resolve(process.cwd(), '..', 'venv', 'bin', 'python'),
    path.resolve(MODULE_DIR, '..', 'venv', 'bin', 'python'),
    path.resolve(MODULE_DIR, '..', '..', 'venv', 'bin', 'python'),
    'python3',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate === 'python3' || existsSync(candidate)) {
      return candidate;
    }
  }

  return 'python3';
}

function resolveHuggingFaceApiKey(): string | undefined {
  const candidates = [
    process.env.HUGGINGFACE_API_KEY,
    process.env.HUGGING_FACE_HUB_TOKEN,
    process.env.HUGGINGFACEHUB_API_TOKEN,
    process.env.HF_TOKEN,
  ];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function resolveGoogleGenAIApiKey(): string | undefined {
  const candidates = [
    process.env.GOOGLE_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GEMINI_API_KEY,
  ];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

const RETIRED_HUGGINGFACE_MODELS = new Set([
  'philipp-zettl/UnfilteredAI-NSFW-gen-v2',
]);

function resolveHuggingFaceModel(): string {
  const requestedModel =
    process.env.HUGGINGFACE_MODEL?.trim() || 'stabilityai/stable-diffusion-2-1';

  if (RETIRED_HUGGINGFACE_MODELS.has(requestedModel)) {
    return 'stabilityai/stable-diffusion-2-1';
  }

  return requestedModel;
}

export const config = {
  huggingface: {
    apiKey: resolveHuggingFaceApiKey(),
    model: resolveHuggingFaceModel(),
  },
  memory: {
    key: process.env.MEMORY_KEY,
    enableSummarization: process.env.MEMORY_ENABLE_SUMMARIZATION === 'true',
    summarizationCron: process.env.MEMORY_SUMMARIZATION_CRON || '0 0 * * *',
  },
  admin: {
    token: process.env.ADMIN_TOKEN,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    model: process.env.MISTRAL_MODEL,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  xai: {
    apiKey: process.env.XAI_API_KEY,
    model: process.env.XAI_MODEL || 'grok-4-fast-reasoning',
  },
  venice: {
    apiKey: process.env.VENICE_API_KEY,
    model: process.env.VENICE_MODEL || 'venice/venice-uncensored',
  },
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY,
    model: process.env.MINIMAX_MODEL || 'abab6.5s-chat',
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    minimaxApiKey: process.env.OPENROUTER_MINIMAX_API_KEY,
    grok1ApiKey: process.env.OPENROUTER_GROK1_API_KEY,
    grok4ApiKey: process.env.OPENROUTER_GROK4_API_KEY,
    katCoderApiKey: process.env.OPENROUTER_KAT_CODER_API_KEY,
    geminiFlashApiKey:
      process.env.OPENROUTER_GEMINI_FLASH_API_KEY ||
      process.env.OPENROUTER_GEMINI_API_KEY,
    minimaxModel:
      process.env.OPENROUTER_MINIMAX_MODEL || 'openai/gpt-3.5-turbo',
    grok1Model: process.env.OPENROUTER_GROK1_MODEL || 'x-ai/grok-code-fast-1',
    grok4Model: process.env.OPENROUTER_GROK4_MODEL || 'x-ai/grok-4.1-fast:free',
    katCoderModel:
      process.env.OPENROUTER_KAT_CODER_MODEL || 'kwaipilot/kat-coder-pro:free',
    geminiFlashModel:
      process.env.OPENROUTER_GEMINI_FLASH_MODEL ||
      'google/gemini-2.0-flash-001',
    geminiApiKey:
      process.env.OPENROUTER_GEMINI_API_KEY ||
      process.env.OPENROUTER_GEMINI_FLASH_API_KEY,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY,
  },
  google: {
    genAiApiKey: resolveGoogleGenAIApiKey(),
    imageModel:
      process.env.GOOGLE_IMAGE_MODEL?.trim() || 'imagen-4.0-generate-001',
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // Accept either GOOGLE_REDIRECT_URI (preferred) or the older GOOGLE_OAUTH_REDIRECT_URI
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI,
    ttsApiKey: process.env.GOOGLE_CLOUD_TTS_API_KEY,
  },
  github: {
    token: process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN,
  },
  smartHome: {
    enableIntegration: process.env.ENABLE_SMART_HOME === 'true',
  },
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
  },
  banana: {
    apiKey: process.env.BANANA_API_KEY,
    apiUrl: process.env.BANANA_API_URL,
    apiEndpoint: process.env.BANANA_API_ENDPOINT,
    modelKey: process.env.BANANA_MODEL_KEY,
    model: process.env.BANANA_MODEL,
  },
  email: {
    sendEmails: process.env.SEND_EMAILS === 'true',
    provider: process.env.EMAIL_PROVIDER || 'sendgrid',
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    fromAddress: process.env.EMAIL_FROM || 'noreply@example.com',
    deliveryIntervalMs: parseInt(
      process.env.EMAIL_DELIVERY_INTERVAL_MS || '60000',
      10
    ),
    maxAttempts: parseInt(process.env.EMAIL_MAX_ATTEMPTS || '3', 10),
    // SMTP specific settings (used when provider === 'smtp')
    smtp: {
      host: process.env.EMAIL_SMTP_HOST,
      port: process.env.EMAIL_SMTP_PORT
        ? parseInt(process.env.EMAIL_SMTP_PORT, 10)
        : undefined,
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS,
      secure: process.env.EMAIL_SMTP_SECURE === 'true',
      requireTLS: process.env.EMAIL_SMTP_REQUIRE_TLS === 'true',
    },
    // Backoff settings for retries (ms)
    baseBackoffMs: parseInt(process.env.EMAIL_BASE_BACKOFF_MS || '60000', 10),
    maxBackoffMs: parseInt(
      process.env.EMAIL_MAX_BACKOFF_MS || String(24 * 60 * 60 * 1000),
      10
    ),
  },
  // Feature flags and global settings
  enableDevTalk: process.env.ENABLE_DEV_TALK === 'true',
  enablePredictiveUpdates: process.env.ENABLE_PREDICTIVE_UPDATES === 'true',
  enableProactiveRepositoryManagement:
    process.env.ENABLE_PROACTIVE_REPOSITORY_MANAGEMENT !== 'false', // default true
  enableProactiveMessages: process.env.ENABLE_PROACTIVE_MESSAGES !== 'false', // default true
  enableAutonomousCodeImprovement:
    process.env.ENABLE_AUTONOMOUS_CODE_IMPROVEMENT !== 'false', // default true
  maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS || '1024', 10),
  proactiveRepoManager: {
    checkInterval: parseInt(
      process.env.PROACTIVE_CHECK_INTERVAL || '10800000',
      10
    ), // 3 hours
    suggestionsSlice: parseInt(
      process.env.PROACTIVE_SUGGESTIONS_SLICE || '3',
      10
    ),
    featureDiscoveryInterval: parseInt(
      process.env.PROACTIVE_FEATURE_DISCOVERY_INTERVAL || '86400000',
      10
    ), // 24 hours
    topFeatureRecommendations: parseInt(
      process.env.PROACTIVE_TOP_FEATURE_RECOMMENDATIONS || '3',
      10
    ),
    featureRelevanceThreshold: parseInt(
      process.env.PROACTIVE_FEATURE_RELEVANCE_THRESHOLD || '7',
      10
    ),
    initialCheckTimeout: parseInt(
      process.env.PROACTIVE_INITIAL_CHECK_TIMEOUT || '60000',
      10
    ), // 1 minute
    optimizationTokenAward: parseInt(
      process.env.PROACTIVE_OPTIMIZATION_TOKEN_AWARD || '30',
      10
    ),
  },
  repositoryDiscovery: {
    enabled: process.env.ENABLE_REPOSITORY_DISCOVERY !== 'false',
    cron: process.env.REPOSITORY_DISCOVERY_CRON || '0 */6 * * *',
    maxReposPerCycle: parseInt(
      process.env.REPOSITORY_DISCOVERY_MAX_REPOS || '10',
      10
    ),
    initialRunDelayMs: parseInt(
      process.env.REPOSITORY_DISCOVERY_INITIAL_DELAY_MS || '120000',
      10
    ),
  },
  consciousness: {
    enableGimCycle: process.env.ENABLE_GIM_CYCLE !== 'false',
    gimCron: process.env.GIM_CYCLE_CRON || '0 */4 * * *',
    enableRemCycle: process.env.ENABLE_REM_CYCLE !== 'false',
    remCron: process.env.REM_CYCLE_CRON || '0 2 * * *',
    pythonExecutable: resolveReplycaPythonExecutable(),
    replycaRoot:
      process.env.REPLYCA_ROOT ||
      path.resolve(process.cwd(), 'ReplycA') ||
      path.resolve(process.cwd(), '../ReplycA') ||
      path.resolve(MODULE_DIR, '../ReplycA') ||
      path.resolve(MODULE_DIR, '../../ReplycA'),
    executionTimeoutMs: parseInt(
      process.env.CONSCIOUSNESS_CYCLE_TIMEOUT_MS || '300000',
      10
    ),
  },
  // Local model configuration
  localModel: {
    enabled: process.env.ENABLE_LOCAL_MODEL === 'true',
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    model:
      process.env.OLLAMA_CHAT_MODEL ||
      process.env.LOCAL_MODEL ||
      process.env.LOCAL_MODEL_PATH ||
      'gemma3:1b',
    preferLocal: process.env.PREFER_LOCAL_MODEL === 'true', // If true, use Ollama before cloud providers
  },
  shell: {
    enabled: process.env.ENABLE_SHELL_RUNNER === 'true',
  },
  mcp: {
    enabled: process.env.ENABLE_MCP_SERVERS !== 'false',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  },
};

export interface ConfigDiagnosticSummary {
  runtime: {
    nodeVersion: string;
    platform: string;
  };
  integrations: {
    googleOAuthConfigured: boolean;
    githubTokenConfigured: boolean;
    huggingFaceConfigured: boolean;
    xaiConfigured: boolean;
    veniceConfigured: boolean;
    proactiveBaseUrl: string;
    localModelConfigured: boolean;
    shellRunnerEnabled: boolean;
    mcpEnabled: boolean;
  };
  warnings: string[];
}

export function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
}

export function getConfigDiagnostics(): ConfigDiagnosticSummary {
  const warnings: string[] = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);

  if (nodeMajor >= 25) {
    warnings.push(
      'Node 25+ detected. Native modules like better-sqlite3 may need rebuilding and can be less stable than current LTS releases.'
    );
  }

  if (
    process.env.GOOGLE_API_KEY &&
    process.env.GEMINI_API_KEY &&
    process.env.GOOGLE_API_KEY !== process.env.GEMINI_API_KEY
  ) {
    warnings.push(
      'Both GOOGLE_API_KEY and GEMINI_API_KEY are set with different values. Current config prefers GOOGLE_API_KEY.'
    );
  }

  const githubToken = getGitHubToken();

    if (!githubToken) {
      warnings.push(
        'GitHub token is not configured. IDE sandbox repo actions and proactive GitHub automation will stay limited.'
      );
    }

  if (config.consciousness.enableGimCycle || config.consciousness.enableRemCycle) {
    const replycaRootCandidates = [
      config.consciousness.replycaRoot,
      path.resolve(process.cwd(), 'ReplycA'),
      path.resolve(process.cwd(), '../ReplycA'),
      path.resolve(MODULE_DIR, '../ReplycA'),
      path.resolve(MODULE_DIR, '../../ReplycA'),
    ];
    const hasReplycaRoot = replycaRootCandidates.some((candidate) =>
      Boolean(candidate && existsSync(candidate))
    );

    if (!hasReplycaRoot) {
      warnings.push(
        'ReplycA root could not be resolved. GIM and REM cron cycles will not run until REPLYCA_ROOT points to a valid ReplycA directory.'
      );
    }
  }

  if (!config.huggingface.apiKey) {
    warnings.push(
      'Hugging Face API key is not configured. HF image generation will be unavailable.'
    );
  }

  if (!config.google.clientId || !config.google.clientSecret || !config.google.redirectUri) {
    warnings.push(
      'Google OAuth is partially configured. Sign-in, Gmail, and Calendar integrations require client ID, secret, and redirect URI.'
    );
  }

  if (config.mcp.enabled && !config.huggingface.apiKey) {
    warnings.push(
      'MCP runtime is enabled, but no Hugging Face key is configured for the installed Hugging Face MCP server.'
    );
  }

  if (process.env.ENABLE_SHELL_RUNNER !== 'true') {
    warnings.push(
      'Shell runner is disabled. Set ENABLE_SHELL_RUNNER=true to allow dashboard shell commands.'
    );
  }

  return {
    runtime: {
      nodeVersion: process.versions.node,
      platform: `${process.platform}/${process.arch}`,
    },
    integrations: {
      googleOAuthConfigured: Boolean(
        config.google.clientId && config.google.clientSecret && config.google.redirectUri
      ),
      githubTokenConfigured: Boolean(githubToken),
      huggingFaceConfigured: Boolean(config.huggingface.apiKey),
      xaiConfigured: Boolean(config.xai.apiKey),
      veniceConfigured: Boolean(config.venice.apiKey),
      proactiveBaseUrl: process.env.PROACTIVE_BASE_URL || 'http://localhost:5001',
      localModelConfigured: Boolean(config.localModel.host && config.localModel.model),
      shellRunnerEnabled: config.shell.enabled,
      mcpEnabled: config.mcp.enabled,
    },
    warnings,
  };
}
