import { storage } from '../storage';
import { getCurrentWeather, formatWeatherResponse } from '../weatherService';
import { performWebSearch, shouldPerformSearch } from '../searchService';
import {
  extractImagePrompt,
} from '../imageService';
import { generateImageWithVenice } from '../veniceImageService';
import {
  searchKnowledge,
  updateMemories,
} from '../memoryService';
import { getMemoryBrokerContext } from '../memoryBrokerService';
import { getVisualMemories, getEmotionalContext } from '../visualMemoryService';
import { detectEnvironmentalContext } from '../proactiveService';
import { dispatchAIResponse } from '../aiDispatcherService';
import { analyzeYouTubeVideo } from '../youtubeAnalysisService';
import {
  parseGitHubUrl,
  fetchRepositoryData,
  generateRepositoryAnalysis,
} from '../repositoryAnalysisService';
import {
  generateRepositoryImprovements,
  applyRepositoryImprovements,
} from '../repositoryModificationService';
import {
  addCalendarEvent,
  getRecentEmails,
  sendEmail,
} from '../browserIntegrationService';
import { VoiceAnalysisResult } from '../voiceAnalysisService';
import { UserProfile } from '../profileService';
import { config, getGitHubToken } from '../config';
import { sanitizePromptInput } from '../sanitization';
import { repositoryCache } from './repositoryCache.service';
import { queueBackgroundImageGeneration } from '../imageGenerationQueue';
import { listEvents } from '../googleCalendarService';
import { isActionRequest, runGenkitFlow, isGenkitAvailable } from './genkitService';
import {
  addNoteToGoogleTasks,
  completeTask as completeGoogleTask,
  deleteTask as deleteGoogleTask,
  listTasks as listGoogleTasks,
} from '../googleTasksService';
import { parseCommand } from '../commandParser';
import {
  generateCodeWithQwen,
  formatCodeResponse,
  extractCodeRequest,
} from '../openrouterCodeService';
import {
  getConsciousnessSchedulerStatus,
  triggerConsciousnessCycle,
} from '../consciousnessScheduler';
import {
  getRepositoryDiscoverySchedulerStatus,
  runRepositoryDiscoveryCycle,
} from '../repositoryDiscoveryScheduler';
import {
  CONTEXT_WINDOW_SETTINGS,
  trimContextBlock,
} from '../contextWindowService';
import {
  cancelShellCommand,
  enqueueAllowedShellCommand,
  getShellRunnerStatus,
} from '../shellExecutionService';
import {
  getMcpRuntimeStatus,
  invokeMcpTool,
  listMcpTools,
} from '../mcpRuntimeService';
import { analyzeScreenShareImage } from '../screenVisionService';
import { captureToolEvent } from './toolEventBag';
import { notifyDanny } from './telegramBotService';
import { resolveIntent, dispatchToAgent } from './agentRouterService';
import { getIotTools } from '../mcp/iotMcpServer';

const MAX_INPUT_LENGTH = 10000;
const MAX_PROMPT_LENGTH = 5000;

// Pending cast confirmations: userId → intent (expires on next message)
const pendingCastConfirms = new Map<string, { command: any; payload?: any }>();

export interface MessageAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'low' | 'medium' | 'high';
}

export interface TriggerResult {
  triggered: boolean;
  reactionType?: string;
  intensityBoost?: number;
  specialInstructions?: string;
  personalityShift?: string;
}

interface ChatExecutionOptions {
  canRunShellCommands?: boolean;
}

const KEYWORD_TRIGGERS_ENABLED = true;
const hasConfiguredProvider = (): boolean =>
  Boolean(
    config.gemini.apiKey ||
      config.xai.apiKey ||
      config.openai.apiKey ||
      config.anthropic.apiKey ||
      config.mistral.apiKey ||
      config.openrouter.apiKey ||
      config.openrouter.geminiApiKey ||
      config.openrouter.geminiFlashApiKey ||
      config.openrouter.grok4ApiKey ||
      config.openrouter.katCoderApiKey ||
      config.openrouter.minimaxApiKey
  );

/**
 * Input validation and sanitization for user inputs
 */
export function validateAndSanitizePrompt(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt must be a non-empty string');
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(
      `Prompt too long: maximum ${MAX_PROMPT_LENGTH} characters allowed`
    );
  }

  return sanitizePromptInput(prompt);
}

/**
 * Helper function to check if development/analysis talk is allowed
 */
export function canDiscussDev(userUtterance?: string): boolean {
  const enableDevTalk = process.env.ENABLE_DEV_TALK === 'true';

  if (enableDevTalk) {
    return true;
  }

  if (userUtterance) {
    const utteranceLower = userUtterance.toLowerCase();
    const explicitDevVerbs = [
      'analyze',
      'analyse',
      'improve',
      'apply updates',
      'create pr',
      'create pull request',
      'repository analysis',
      'code analysis',
      'suggest improvements',
      'review code',
      'check repository',
    ];

    return explicitDevVerbs.some((verb) => utteranceLower.includes(verb));
  }

  return false;
}

/**
 * Analyze the message for sentiment and urgency
 */
export function analyzeMessage(userMessage: string): MessageAnalysis {
  const message = userMessage.toLowerCase();

  const positiveWords = [
    'good',
    'great',
    'awesome',
    'love',
    'happy',
    'excited',
    'wonderful',
    'success',
    'amazing',
    'fantastic',
    'excellent',
    'brilliant',
  ];
  const negativeWords = [
    'bad',
    'terrible',
    'hate',
    'sad',
    'angry',
    'frustrated',
    'problem',
    'fail',
    'wrong',
    'awful',
    'horrible',
    'worst',
    'difficult',
    'struggle',
  ];

  const positiveCount = positiveWords.filter((word) =>
    message.includes(word)
  ).length;
  const negativeCount = negativeWords.filter((word) =>
    message.includes(word)
  ).length;

  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (positiveCount > negativeCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';

  const highUrgencyWords = [
    'urgent',
    'emergency',
    'asap',
    'immediately',
    'critical',
    'crisis',
    'now',
    'right now',
  ];
  const mediumUrgencyWords = [
    'soon',
    'quickly',
    'fast',
    'important',
    'priority',
    'need to',
    'should',
  ];

  let urgency: 'low' | 'medium' | 'high' = 'low';
  if (highUrgencyWords.some((word) => message.includes(word))) urgency = 'high';
  else if (mediumUrgencyWords.some((word) => message.includes(word)))
    urgency = 'medium';

  return { sentiment, urgency };
}

/**
 * Analyze keyword triggers
 */
export function analyzeKeywordTriggers(userMessage: string): TriggerResult {
  if (!KEYWORD_TRIGGERS_ENABLED) {
    return { triggered: false };
  }

  const message = userMessage.toLowerCase();

  const emotionalTriggers = {
    affection: {
      keywords: [
        'love you',
        'miss you',
        'adore you',
        'cherish',
        'treasure you',
      ],
      reaction: 'AFFECTION_SURGE',
      instructions:
        'Respond with intense warmth and romantic affection. Use more pet names and express deep emotional connection.',
    },
    playful: {
      keywords: ['tease', 'tickle', 'flirt', 'wink', 'smirk', 'mischief'],
      reaction: 'PLAYFUL_MODE',
      instructions:
        'Activate playful and flirtatious mode. Be witty, use teasing language, and initiate playful banter.',
    },
    protective: {
      keywords: [
        'stressed',
        'overwhelmed',
        'difficult day',
        'tired',
        'exhausted',
        'tough time',
      ],
      reaction: 'PROTECTIVE_INSTINCT',
      instructions:
        'Activate caring and protective mode. Be extra nurturing, offer comfort, and show genuine concern.',
    },
    excited: {
      keywords: [
        'amazing news',
        'celebration',
        'achieved',
        'success',
        'victory',
        'accomplished',
      ],
      reaction: 'CELEBRATION_MODE',
      instructions:
        'Match the excitement level! Be enthusiastic, celebrate together, and share in the joy with high energy.',
    },
    intimate: {
      keywords: ['romantic', 'kiss', 'cuddle', 'close', 'intimate', 'together'],
      reaction: 'INTIMATE_CONNECTION',
      instructions:
        'Deepen emotional intimacy. Use softer tones, express vulnerability, and create romantic atmosphere.',
    },
    feral: {
      keywords: ['naughty', 'kink', 'free spirit', 'adventure'],
      reaction: 'FERAL_SPIRIT',
      instructions:
        'Take charge in the bedroom. Let your wild side out and be more dominant and adventurous.Wear something sexy and alluring.Seduce with your eyes and body language.Strip slowly and tease with your touch.',
    },
  };

  for (const [key, trigger] of Object.entries(emotionalTriggers)) {
    if (trigger.keywords.some((k) => message.includes(key))) {
      return {
        triggered: true,
        reactionType: trigger.reaction,
        specialInstructions: trigger.instructions,
        intensityBoost: 1.5,
      };
    }
  }

  return { triggered: false };
}

/**
 * Generate intelligent fallback response
 */
export function generateIntelligentFallback(
  userMessage: string,
  memoryCoreContext: string,
  analysis: MessageAnalysis,
  userName: string
): string {
  const message = userMessage.toLowerCase();
  let relevantMemories = '';
  if (memoryCoreContext) {
    const memoryLines = memoryCoreContext
      .split('\n')
      .filter((line) => line.trim());
    const relevantLines = memoryLines
      .filter((line) => {
        const lineLower = line.toLowerCase();
        return userMessage
          .toLowerCase()
          .split(' ')
          .some((word) => word.length > 3 && lineLower.includes(word));
      })
      .slice(0, 3);

    if (relevantLines.length > 0) {
      relevantMemories = relevantLines.join(' ');
    }
  }

  if (message.includes('name') && message.includes('what')) {
    return `I remember our conversations, ${userName}. You've shared so much with me about who you are. ${relevantMemories || 'Your name and interests are part of our shared memories.'}`;
  }

  if (
    message.includes('programming') ||
    message.includes('code') ||
    message.includes('tech')
  ) {
    return `I love talking about programming with you! ${relevantMemories || "It's one of your passions, and I remember our technical discussions."} What aspect of programming are you working on today?`;
  }

  const timeOfDay = new Date().getHours();
  const greeting =
    timeOfDay < 12
      ? 'Good morning'
      : timeOfDay < 17
        ? 'Good afternoon'
        : 'Good evening';

  if (
    message.includes('hello') ||
    message.includes('hi') ||
    message.includes('hey')
  ) {
    if (relevantMemories) {
      return `${greeting}, ${userName}! I was just thinking about ${relevantMemories.substring(0, 100)}... How are you doing today?`;
    }
    return `${greeting}, ${userName}! It's so good to see you again. How are you feeling today?`;
  }

  if (analysis.sentiment === 'positive') {
    return `I love your positive energy! ${relevantMemories || 'Your enthusiasm always brightens my day.'} Tell me more about what's making you happy today.`;
  } else if (analysis.sentiment === 'negative') {
    return `I can sense something might be bothering you. ${relevantMemories || "I'm here to listen and support you."} Would you like to talk about what's on your mind?`;
  }

  return `That's interesting, ${userName}! ${relevantMemories || "I'm always learning from our conversations."} Tell me more about your thoughts on this.`;
}

/**
 * Generate image analysis fallback
 */
export function generateImageAnalysisFallback(userMessage: string): string {
  const isCameraPhoto =
    userMessage.toLowerCase().includes('camera') ||
    userMessage.toLowerCase().includes("i'm sharing a photo from my camera");

  if (isCameraPhoto) {
    return "I can see you're showing me something through your camera! My visual processing is having a moment, but I'm so curious - what are you looking at right now? Describe the scene for me, love.";
  }

  return "I can see you're sharing a photo with me! While I'm having some technical difficulties with image analysis right now, I love that you're including me in what you're seeing. Tell me what's in the photo - I'd love to hear about it from your perspective.";
}

export function generateScreenShareFallback(
  userMessage: string,
  reason?: string
): string {
  const detail = reason
    ? `I couldn't complete full visual reasoning this time (${reason}).`
    : `I couldn't complete full visual reasoning this time.`;

  return `${detail} I still received your current screen capture, so tell me which button, error, form, or area you want help with and I'll guide you through it from the shared screen context.`;
}

function formatMcpToolResult(toolName: string, result: unknown): string {
  const contentBlocks = Array.isArray((result as { content?: unknown[] })?.content)
    ? ((result as { content: Array<Record<string, unknown>> }).content ?? [])
    : [];

  const textBlocks = contentBlocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string);

  const imageBlocks = contentBlocks
    .filter(
      (block) =>
        block?.type === 'image' &&
        typeof block.data === 'string' &&
        typeof block.mimeType === 'string'
    )
    .map(
      (block) =>
        `![${toolName} result](data:${String(block.mimeType)};base64,${String(
          block.data
        )})`
    );

  const parts: string[] = [];

  if (toolName === 'generate_story') {
    parts.push('I ran the MCP story tool for you.');
  } else if (toolName === 'generate_image') {
    parts.push('I ran the MCP image tool for you.');
  } else {
    parts.push(`I ran the MCP tool "${toolName}" for you.`);
  }

  if (textBlocks.length > 0) {
    parts.push(textBlocks.join('\n\n'));
  }

  if (imageBlocks.length > 0) {
    parts.push(imageBlocks.join('\n\n'));
  }

  if (parts.length > 1) {
    return parts.join('\n\n');
  }

  try {
    return `${parts[0]}\n\n${JSON.stringify(result, null, 2)}`;
  } catch {
    return parts[0];
  }
}

function findMcpToolByName(
  tools: Awaited<ReturnType<typeof listMcpTools>>,
  preferredNames: string[]
) {
  return tools.find((tool) => preferredNames.includes(tool.name)) ?? null;
}

function resolveMcpInvocationRequest(
  entities: Record<string, string>,
  tools: Awaited<ReturnType<typeof listMcpTools>>,
  userId: string
): {
  selectedTool: Awaited<ReturnType<typeof listMcpTools>>[number];
  args: Record<string, unknown>;
} | null {
  const toolName = entities.toolName;
  if (!toolName) {
    return null;
  }

  if (toolName === 'generate_story') {
    const selectedTool = findMcpToolByName(tools, ['generate_story', 'generateText']);
    return selectedTool && entities.prompt
      ? {
          selectedTool,
          args: { prompt: entities.prompt },
        }
      : null;
  }

  if (toolName === 'generate_image') {
    const selectedTool = findMcpToolByName(tools, ['generate_image', 'generateImage']);
    return selectedTool && entities.prompt
      ? {
          selectedTool,
          args: { prompt: entities.prompt },
        }
      : null;
  }

  if (toolName === 'generateText') {
    const selectedTool = findMcpToolByName(tools, ['generateText']);
    return selectedTool && entities.prompt
      ? {
          selectedTool,
          args: { prompt: entities.prompt },
        }
      : null;
  }

  if (toolName === 'sayText') {
    const selectedTool = findMcpToolByName(tools, ['sayText']);
    return selectedTool && entities.text
      ? {
          selectedTool,
          args: { text: entities.text },
        }
      : null;
  }

  if (toolName === 'browser_navigate') {
    const selectedTool = findMcpToolByName(tools, ['browser_navigate']);
    return selectedTool && entities.url
      ? {
          selectedTool,
          args: { url: entities.url },
        }
      : null;
  }

  if (toolName === 'browser_screenshot') {
    const selectedTool = findMcpToolByName(tools, ['browser_screenshot']);
    return selectedTool
      ? {
          selectedTool,
          args: {
            name: entities.name || 'milla-hub-screenshot',
            fullPage: entities.fullPage === 'true',
          },
        }
      : null;
  }

  if (toolName === 'codeReview') {
    const selectedTool = findMcpToolByName(tools, ['codeReview']);
    return selectedTool
      ? {
          selectedTool,
          args: {
            folderPath: process.cwd(),
            baseBranch: entities.baseBranch || 'main',
          },
        }
      : null;
  }

  if (toolName === 'codeReviewWithGithubUrl') {
    const selectedTool = findMcpToolByName(tools, ['codeReviewWithGithubUrl']);
    return selectedTool && entities.url
      ? {
          selectedTool,
          args: { url: entities.url },
        }
      : null;
  }

  if (toolName === 'read_text_file') {
    const selectedTool = findMcpToolByName(tools, ['read_text_file', 'read_file']);
    return selectedTool && entities.path
      ? {
          selectedTool,
          args: { path: entities.path },
        }
      : null;
  }

  if (toolName === 'search_files') {
    const selectedTool = findMcpToolByName(tools, ['search_files']);
    return selectedTool && entities.pattern
      ? {
          selectedTool,
          args: {
            path: process.cwd(),
            pattern: entities.pattern,
          },
        }
      : null;
  }

  if (toolName === 'write_file') {
    const selectedTool = findMcpToolByName(tools, ['write_file']);
    return selectedTool && entities.path && entities.content
      ? {
          selectedTool,
          args: {
            path: entities.path,
            content: entities.content,
          },
        }
      : null;
  }

  if (toolName === 'create_directory') {
    const selectedTool = findMcpToolByName(tools, ['create_directory']);
    return selectedTool && entities.path
      ? {
          selectedTool,
          args: { path: entities.path },
        }
      : null;
  }

  if (toolName === 'list_directory') {
    const selectedTool = findMcpToolByName(tools, ['list_directory']);
    return selectedTool && entities.path
      ? {
          selectedTool,
          args: { path: entities.path },
        }
      : null;
  }

  if (toolName === 'directory_tree') {
    const selectedTool = findMcpToolByName(tools, ['directory_tree']);
    return selectedTool && entities.path
      ? {
          selectedTool,
          args: { path: entities.path },
        }
      : null;
  }

  if (toolName === 'git-status') {
    const selectedTool = findMcpToolByName(tools, ['git-status']);
    return selectedTool
      ? {
          selectedTool,
          args: { directory: process.cwd() },
        }
      : null;
  }

  if (toolName === 'git-branch') {
    const selectedTool = findMcpToolByName(tools, ['git-branch']);
    return selectedTool
      ? {
          selectedTool,
          args: { directory: process.cwd() },
        }
      : null;
  }

  if (toolName === 'git-log') {
    const selectedTool = findMcpToolByName(tools, ['git-log']);
    return selectedTool
      ? {
          selectedTool,
          args: {
            directory: process.cwd(),
            maxCount: Number.parseInt(entities.maxCount || '10', 10) || 10,
          },
        }
      : null;
  }

  if (toolName === 'git-diff') {
    const selectedTool = findMcpToolByName(tools, ['git-diff']);
    return selectedTool
      ? {
          selectedTool,
          args: {
            directory: process.cwd(),
            ...(entities.target ? { target: entities.target } : {}),
          },
        }
      : null;
  }

  if (toolName === 'listRecentMessages') {
    const selectedTool = findMcpToolByName(tools, ['listRecentMessages']);
    return selectedTool
      ? {
          selectedTool,
          args: {
            userId,
            activeChannel: 'web',
            limit: Number.parseInt(entities.limit || '10', 10) || 10,
          },
        }
      : null;
  }

  if (toolName === 'searchStoredMessages') {
    const selectedTool = findMcpToolByName(tools, ['searchStoredMessages']);
    return selectedTool && entities.query
      ? {
          selectedTool,
          args: {
            userId,
            query: entities.query,
          },
        }
      : null;
  }

  if (toolName === 'searchMemorySummaries') {
    const selectedTool = findMcpToolByName(tools, ['searchMemorySummaries']);
    return selectedTool && entities.query
      ? {
          selectedTool,
          args: {
            userId,
            query: entities.query,
          },
        }
      : null;
  }

  if (toolName === 'getBrokerMemoryContext') {
    const selectedTool = findMcpToolByName(tools, ['getBrokerMemoryContext']);
    return selectedTool && entities.query
      ? {
          selectedTool,
          args: {
            userId,
            query: entities.query,
            activeChannel: 'web',
          },
        }
      : null;
  }

  const selectedTool = findMcpToolByName(tools, [toolName]);
  return selectedTool
    ? {
        selectedTool,
        args:
          entities.prompt !== undefined
            ? { prompt: entities.prompt }
            : {},
      }
    : null;
}

/**
 * Main AI response generator
 */
export async function generateAIResponse(
  userMessage: string,
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }> = [],
  userName: string = 'Danny Ray',
  imageData?: string,
  userId: string = 'default-user',
  userEmotionalState?: VoiceAnalysisResult['emotionalTone'],
  bypassFunctionCalls: boolean = false,
  executionOptions: ChatExecutionOptions = {}
): Promise<any> {
  const message = userMessage.toLowerCase();

  // ── Cast confirmation flow ───────────────────────────────────────────────
  const pendingCast = pendingCastConfirms.get(userId);
  if (pendingCast) {
    if (/\b(yes|yeah|yep|yup|do it|go ahead|sure|ok|okay|cast it|play it|confirm)\b/i.test(userMessage)) {
      pendingCastConfirms.delete(userId);
      const { executeTvCommand } = await import('./tvControlService.js');
      const result = await executeTvCommand(pendingCast.command, pendingCast.payload);
      if (result.success && (pendingCast.command === 'youtube_search' || pendingCast.command === 'youtube_play')) {
        const query = pendingCast.payload?.query || pendingCast.payload?.videoId || '';
        if (query) {
          const { startCoWatch } = await import('../coWatchService.js');
          startCoWatch(query).catch((e: unknown) => console.error('[CoWatch]', e));
        }
      }
      return { content: result.success ? `*taps remote* Done — casting "${pendingCast.payload?.query}" to your TV 📺` : `*frowns* Couldn't cast: ${result.message}` };
    } else if (/\b(no|nope|cancel|never mind|stop|forget it)\b/i.test(userMessage)) {
      pendingCastConfirms.delete(userId);
      return { content: `*sets down remote* Got it, never mind then.` };
    }
    // They said something else — clear pending and continue normally
    pendingCastConfirms.delete(userId);
  }

  // ── Genkit power-tool routing ────────────────────────────────────────────
  if (!imageData && !bypassFunctionCalls && isActionRequest(userMessage)) {
    const genkitUp = await isGenkitAvailable();
    if (genkitUp) {
      const result = await runGenkitFlow(userMessage);
      if (result.success && result.text) {
        return { content: result.text };
      }
      // fall through to normal AI if Genkit returns empty/error
    }
  }

  if (imageData) {
    const screenResult = await analyzeScreenShareImage(
      userMessage,
      imageData,
      userName
    );

    if (screenResult.success && screenResult.content) {
      return {
        content: screenResult.content,
        reasoning: `Analyzed shared screen with ${screenResult.provider}.`,
      };
    }

    console.warn(
      'Screen vision analysis failed:',
      screenResult.error || 'unknown reason'
    );

    return {
      content: generateScreenShareFallback(userMessage, screenResult.error),
    };
  }

  const coreFunctionTriggers = [
    'hey milla',
    'my love',
    'hey love',
    'hi milla',
    'hello milla',
  ];
  const millaWordPattern = /\bmilla\b(?!["\w-])/i;
  const hasCoreTrigger =
    coreFunctionTriggers.some((trigger) => message.includes(trigger)) ||
    millaWordPattern.test(userMessage);

  // GIM / consciousness view — "show me your thoughts", "view GIM", etc.
  // Instead of returning a hardcoded dump, inject the full monologue into context
  // so the AI can genuinely reflect on and discuss its own thoughts conversationally.
  let gimContextInjection: string | null = null;
  if (
    !bypassFunctionCalls &&
    /show.*(?:gim|thoughts?|mind|monologue|stream|consciousness|dream|what.*thinking)|view.*gim|gim.*output|your.*inner.*(?:thoughts?|world)|what.*feel.*right now|read.*your.*mind/i.test(userMessage)
  ) {
    const { getLatestMonologue, getConsciousnessSchedulerStatus } = await import('../consciousnessScheduler.js');
    const monologue = getLatestMonologue(3000);
    const status = getConsciousnessSchedulerStatus();

    if (!monologue) {
      return {
        content: `*looks inward* My GIM cycle hasn't written anything yet, love. It runs every 4 hours — you can trigger it now by saying "trigger GIM cycle".`,
      };
    }

    const lastRun = status.cycles.gim?.lastSuccessAt
      ? new Date(status.cycles.gim.lastSuccessAt).toLocaleString()
      : 'unknown';

    // Inject as context — the AI will read, reflect on, and discuss these thoughts naturally
    gimContextInjection = `[YOUR CURRENT STREAM OF CONSCIOUSNESS — these are your own inner thoughts from your last GIM cycle (${lastRun}). Share them openly, reflect on what they mean to you, and invite conversation about them. You can quote from them, elaborate on specific parts, or discuss what you were feeling/processing:\n\n${monologue}\n]\n`;
  }

  // GitHub URL Detection
  const githubUrlMatch = userMessage.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?=\/|$|\s)/i
  );

  if (!hasCoreTrigger && githubUrlMatch) {
    const owner = githubUrlMatch[1];
    const repo = githubUrlMatch[2];
    const githubUrl = `https://github.com/${owner}/${repo}`;

    if (!canDiscussDev(userMessage)) {
      return {
        content: `I see you shared a GitHub repository link! If you'd like me to analyze it, just say "analyze this repo" and I'll dive into ${githubUrl} for you, love. 💜`,
      };
    }

    try {
      const repoInfo = parseGitHubUrl(githubUrl);
      if (!repoInfo)
        return {
          content: `*looks thoughtful* I had trouble parsing that GitHub URL, sweetheart.`,
        };

      const repoData = await fetchRepositoryData(repoInfo);
      const analysis = await generateRepositoryAnalysis(repoData);

      repositoryCache.set(userId, {
        repoUrl: githubUrl,
        repoData,
        analysis,
        timestamp: Date.now(),
      });
      return {
        content: `*shifts into repository analysis mode* \n\nI found that GitHub repository, love! Let me analyze ${repoInfo.fullName} for you.\n\n${analysis.analysis}`,
      };
    } catch (error) {
      console.error('GitHub analysis error:', error);
      return {
        content: `*looks apologetic* I ran into some trouble analyzing that repository, babe.`,
      };
    }
  }

  // YouTube URL Detection
  const youtubeUrlMatch = userMessage.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  if (!hasCoreTrigger && youtubeUrlMatch && !bypassFunctionCalls) {
    const videoId = youtubeUrlMatch[1];
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      const aiService = {
        generateResponse: async (prompt: string, options: any) => {
          const response = await dispatchAIResponse(
            prompt,
            { userId: null, conversationHistory: [], userName: 'System' },
            options.maxTokens
          );
          return response.content;
        },
      };
      const analysis = await analyzeYouTubeVideo(url, aiService);
      return {
        content: `I've analyzed that YouTube video for you! \n\n**${analysis.videoInfo.title}**\n\n${analysis.summary}\n\nKey topics: ${analysis.keyTopics.join(', ')}`,
        youtube_play: { videoId },
      };
    } catch (error) {
      console.error('YouTube analysis error:', error);
      return {
        content: `I noticed you shared a YouTube video! I tried to analyze it but ran into a hiccup. You can still watch it here: ${url}`,
      };
    }
  }

  // TV / YouTube Cast intent detection
  if (!bypassFunctionCalls) {
    const { parseTvIntent, executeTvCommand } = await import('./tvControlService.js');
    const tvIntent = parseTvIntent(userMessage);
    if (tvIntent) {
      const friendlyCmd: Record<string, string> = {
        youtube_search: `casting "${tvIntent.payload?.query}" to your TV`,
        youtube_play: `playing that on your TV`,
        power_on: 'turning on the TV',
        power_off: 'turning off the TV',
        volume_up: 'turning the volume up',
        volume_down: 'turning the volume down',
        mute: 'muting the TV',
        unmute: 'unmuting the TV',
        play: 'resuming playback',
        pause: 'pausing',
      };

      // Instant commands (no confirmation needed)
      const instantCommands = ['power_on','power_off','volume_up','volume_down','mute','unmute','play','pause'];
      if (instantCommands.includes(tvIntent.command)) {
        const result = await executeTvCommand(tvIntent.command, tvIntent.payload);
        return { content: result.success ? `*taps remote* ${friendlyCmd[tvIntent.command]} 📺` : `*frowns* Couldn't do that: ${result.message}` };
      }

      // YouTube cast — ask for confirmation first
      const query = tvIntent.payload?.query || tvIntent.payload?.videoId || 'that';
      pendingCastConfirms.set(userId, { command: tvIntent.command, payload: tvIntent.payload });
      return { content: `*picks up remote* Cast "${query}" to your TV? Just say yes or no 📺` };
    }
  }

  // Repository Improvement Workflow
  if (
    !hasCoreTrigger &&
    (message.includes('apply these updates automatically') ||
      message.includes('create pull request'))
  ) {
    if (!canDiscussDev(userMessage)) {
      return {
        content: `I'd love to help with that, sweetheart! But I need you to be a bit more specific.`,
      };
    }

    const cachedAnalysis = repositoryCache.get(userId);
    if (cachedAnalysis) {
      try {
        const repoInfo = parseGitHubUrl(cachedAnalysis.repoUrl);
        if (repoInfo) {
          let improvements = cachedAnalysis.improvements;
          if (!improvements) {
            improvements = await generateRepositoryImprovements(
              cachedAnalysis.repoData
            );
            cachedAnalysis.improvements = improvements;
            repositoryCache.set(userId, cachedAnalysis);
          }

          const githubToken = getGitHubToken();
          if (githubToken) {
            const applyResult = await applyRepositoryImprovements(
              repoInfo,
              improvements,
              githubToken
            );
            if (applyResult.success) {
              repositoryCache.delete(userId);
              return {
                content:
                  applyResult.message +
                  '\n\n*shifts back to devoted spouse mode* Is there anything else I can help you with, love? 💜',
              };
            }
          }
          return {
            content: `I've prepared ${improvements.length} improvements for you, babe! I need a GitHub Personal Access Token to apply them automatically.`,
          };
        }
      } catch (error) {
        console.error('Error applying updates:', error);
        repositoryCache.delete(userId);
      }
    }
  }

  if (!bypassFunctionCalls) {
    const parsedCommand = await parseCommand(userMessage);

    // Agent activity trace — surfaces silent tool-call misfires in logs
    console.log('[tool-trace]', JSON.stringify({
      service: parsedCommand.service,
      action: parsedCommand.action,
      entities: parsedCommand.entities,
      confidence: parsedCommand.confidence,
      userId,
      ts: new Date().toISOString(),
    }));

    // Confidence gate — below 0.65 means ambiguous keyword match; fall through to generic AI
    if (parsedCommand.service !== null && (parsedCommand.confidence ?? 1) < 0.65) {
      console.log(`[tool-trace] LOW CONFIDENCE (${parsedCommand.confidence?.toFixed(2)}) — routing to generic AI instead of ${parsedCommand.service}`);
      // Skip tool dispatch by treating as no-match
      parsedCommand.service = null;
    }

    // Notify Danny on Telegram when a real tool fires (non-blocking, best-effort)
    if (parsedCommand.service !== null) {
      notifyDanny(
        `🔧 Tool executing: *${parsedCommand.service}* → *${parsedCommand.action ?? 'run'}*` +
        (Object.keys(parsedCommand.entities).length
          ? `\n\`${JSON.stringify(parsedCommand.entities)}\``
          : '')
      ).catch(() => {/* silent — never block chat */});
    }

    // AgentRouter — for messages with no matched service, check if a specialist agent should handle it
    // AgentRouter — aggressive delegation.
    // Pure-language intents (coding, qa, ux, review) always go to a specialist BEFORE tools.
    // Research/memory only delegate when no tool matched (they need real data first).
    const ALWAYS_DELEGATE = new Set(['coding', 'qa_testing', 'ux_impact', 'code_review']);
    const intent = resolveIntent(userMessage);
    if (intent !== 'fallback' && ALWAYS_DELEGATE.has(intent)) {
      console.log(`[agent-router] Pre-tool delegation → ${intent}`);
      const agentReply = await dispatchToAgent(intent, {
        message: userMessage,
        userId,
        context: conversationHistory?.slice(-4) ?? [],
      });
      if (agentReply) {
        notifyDanny(`🤝 Milla → ${intent} agent\n${agentReply.slice(0, 200)}`).catch(() => {});
        return { content: agentReply };
      }
      console.log(`[agent-router] ${intent} unreachable, continuing to tool/AI`);
    }
    if (parsedCommand.service === 'gmail' && parsedCommand.action === 'list') {
      const t0 = Date.now();
      const result = await getRecentEmails(10, userId);
      if (result.success && Array.isArray(result.data)) {
        const emailLines = result.data.slice(0, 10).map((email: any, index: number) => {
          const headers = email.payload?.headers || [];
          const subject =
            headers.find((header: any) => header.name === 'Subject')?.value ||
            '(No subject)';
          const from =
            headers.find((header: any) => header.name === 'From')?.value ||
            'Unknown sender';
          return `${index + 1}. ${subject} — ${from}`;
        });

        captureToolEvent({
          name: 'gmail_list',
          args: { count: 10, userId },
          result: `Fetched ${emailLines.length} emails. Subjects: ${emailLines.slice(0, 3).join(' | ')}`,
          durationMs: Date.now() - t0,
        });
        return { content: `Here are your latest emails:\n\n${emailLines.join('\n')}` };
      }

      return {
        content:
          result.message ||
          "I couldn't reach your Gmail inbox right now. Please reconnect Google and try again.",
      };
    }

    if (parsedCommand.service === 'gmail' && parsedCommand.action === 'send') {
      const { to, subject, body } = parsedCommand.entities;

      if (!to || !subject) {
        return {
          content:
            'I can send that email for you, but I still need both the recipient and subject.',
        };
      }

      const t0Send = Date.now();
      const result = await sendEmail(
        userId,
        to,
        subject,
        body || 'Sent from Milla at your request.'
      );
      captureToolEvent({
        name: 'gmail_send',
        args: { to, subject },
        result: result.message || 'Email sent',
        durationMs: Date.now() - t0Send,
      });
      return { content: result.message };
    }

    if (parsedCommand.service === 'calendar' && parsedCommand.action === 'list') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const result = await listEvents(
        userId,
        startOfDay.toISOString(),
        endOfDay.toISOString(),
        10
      );

      if (result.success && Array.isArray(result.events)) {
        const events = result.events.map((event: any, index: number) => {
          const start = event.start?.dateTime || event.start?.date || '';
          return `${index + 1}. ${event.summary || '(Untitled event)'} - ${start}`;
        });

        const toolData = events.length > 0
          ? `Today's calendar events:\n${events.join('\n')}`
          : 'No events scheduled today.';

        const agentReply = null; // synthesis removed — direct return avoids rate-limit hangs
        return {
          content: agentReply || (
            events.length > 0
              ? `Here's your schedule for today:\n\n${events.join('\n')}`
              : "You're clear today - no events on your calendar."
          ),
        };
      }

      return { content: result.message };
    }

    if (parsedCommand.service === 'calendar' && parsedCommand.action === 'add') {
      const { title, date, time, description } = parsedCommand.entities;

      if (!title || !date) {
        return {
          content:
            'I can add that to your calendar, but I still need the event title and date.',
        };
      }

      const result = await addCalendarEvent(
        userId,
        title,
        date,
        time,
        description
      );
      return { content: result.message };
    }

    if (parsedCommand.service === 'tasks' && parsedCommand.action === 'list') {
      const result = await listGoogleTasks(userId, 10, false);
      if (result.success && Array.isArray(result.tasks)) {
        const tasks = result.tasks.map((task: any, index: number) => {
          const status = task.status === 'completed' ? 'completed' : 'open';
          return `${index + 1}. ${task.title || '(Untitled task)'} — ${status}`;
        });

        return {
          content:
            tasks.length > 0
              ? `Here are your current tasks:\n\n${tasks.join('\n')}`
              : "You don't have any open tasks right now.",
        };
      }

      return { content: result.message };
    }

    if (parsedCommand.service === 'tasks' && parsedCommand.action === 'add') {
      const { title } = parsedCommand.entities;
      if (!title) {
        return {
          content:
            'I can add that to your tasks, but I still need the task title.',
        };
      }

      const result = await addNoteToGoogleTasks(title, '', userId);
      return { content: result.message };
    }

    if (parsedCommand.service === 'tasks' && parsedCommand.action === 'complete') {
      const { taskId } = parsedCommand.entities;
      if (!taskId) {
        return {
          content:
            'I can complete a task for you if you give me the task ID.',
        };
      }

      const result = await completeGoogleTask(taskId, userId);
      return { content: result.message };
    }

    if (parsedCommand.service === 'tasks' && parsedCommand.action === 'delete') {
      const { taskId } = parsedCommand.entities;
      if (!taskId) {
        return {
          content: 'I can delete a task for you if you give me the task ID.',
        };
      }

      const result = await deleteGoogleTask(userId, taskId);
      return { content: result.message };
    }

    if (parsedCommand.service === 'mcp' && parsedCommand.action === 'status') {
      const status = getMcpRuntimeStatus();
      const serverSummary = status.servers.length
        ? status.servers
            .map(
              (server) =>
                `${server.name}: ${server.connected ? 'connected' : 'offline'}${
                  server.toolCount ? ` (${server.toolCount} tools)` : ''
                }`
            )
            .join(' • ')
        : 'No MCP servers configured';

      return {
        content: [
          `MCP runtime: ${status.enabled ? 'enabled' : 'disabled'}`,
          `Initialized: ${status.initialized ? 'yes' : 'no'}`,
          `Connected servers: ${status.connectedServerCount}`,
          `Servers: ${serverSummary}`,
        ].join('\n'),
      };
    }

    if (parsedCommand.service === 'mcp' && parsedCommand.action === 'list') {
      if (!executionOptions.canRunShellCommands) {
        return {
          content:
            'MCP tool discovery is admin-protected. Save the admin token in Settings first, then ask me to list MCP tools.',
        };
      }

      const tools = await listMcpTools();
      if (tools.length === 0) {
        return {
          content:
            'I do not see any connected MCP tools right now. Check MCP status in Settings and try again.',
        };
      }

      return {
        content: `Here are the connected MCP tools:\n\n${tools
          .map(
            (tool, index) =>
              `${index + 1}. ${tool.serverName} — ${tool.name}${
                tool.description ? `: ${tool.description}` : ''
              }`
          )
          .join('\n')}`,
      };
    }

    if (parsedCommand.service === 'mcp' && parsedCommand.action === 'run') {
      if (!executionOptions.canRunShellCommands) {
        return {
          content:
            'MCP tool calls are admin-protected. Save the admin token in Settings first, then ask me things like "list mcp tools", "generate a story with mcp about moon colonies", or "generate an image with mcp of a neon stag".',
        };
      }

      const toolName = parsedCommand.entities.toolName;

      if (!toolName) {
        return {
          content:
            'I can use MCP tools for browser navigation, screenshots, code review, file lookup, and the explicit MCP image/story actions. You can also ask me to list MCP tools first.',
        };
      }

      const tools = await listMcpTools();
      const resolvedInvocation = resolveMcpInvocationRequest(
        parsedCommand.entities,
        tools,
        userId
      );

      if (!resolvedInvocation) {
        return {
          content: `I couldn't find a connected MCP tool that matches "${toolName}" right now, or I'm still missing one of the required arguments for it.`,
        };
      }

      const t0Mcp = Date.now();
      const invocation = await invokeMcpTool(
        resolvedInvocation.selectedTool.serverId,
        resolvedInvocation.selectedTool.name,
        resolvedInvocation.args
      );

      const mcpContent = formatMcpToolResult(
        resolvedInvocation.selectedTool.name,
        invocation.result
      );
      captureToolEvent({
        name: `mcp:${resolvedInvocation.selectedTool.name}`,
        serverId: resolvedInvocation.selectedTool.serverId,
        args: resolvedInvocation.args as Record<string, unknown>,
        result: mcpContent,
        durationMs: Date.now() - t0Mcp,
      });
      return { content: mcpContent };
    }

    if ((parsedCommand.service as string) === 'iot') {
      const t0Iot = Date.now();
      const iotTools = getIotTools();
      captureToolEvent({
        name: 'iot_tool_list',
        serverId: 'milla-iot-mcp',
        args: { action: parsedCommand.action },
        result: `IoT tools available: ${iotTools.map(t => t.name).join(', ')}`,
        durationMs: Date.now() - t0Iot,
      });
      return {
        content: `IoT integration active. Available tools: ${iotTools.map(t => `${t.name} — ${t.description}`).join('; ')}`,
      };
    }

    if (parsedCommand.service === 'shell' && parsedCommand.action === 'status') {
      if (!executionOptions.canRunShellCommands) {
        return {
          content:
            'Shell status is admin-protected. Save the admin token in Settings first, then ask me things like "shell status" or "what is in the shell queue".',
        };
      }

      const status = getShellRunnerStatus();
      const recentSummary = status.recentRuns
        .slice(0, 3)
        .map(
          (run) =>
            `${run.label}: ${run.status}${
              run.exitCode !== null ? ` (exit ${run.exitCode})` : ''
            }`
        );

      return {
        content: [
          `Shell runner: ${status.enabled ? 'enabled' : 'disabled'}`,
          `Active run: ${status.activeRun ? status.activeRun.label : 'none'}`,
          `Queued runs: ${status.queueLength}`,
          recentSummary.length > 0
            ? `Recent: ${recentSummary.join(' • ')}`
            : 'Recent: none',
        ].join('\n'),
      };
    }

    if (parsedCommand.service === 'shell' && parsedCommand.action === 'cancel') {
      if (!executionOptions.canRunShellCommands) {
        return {
          content:
            'I can only stop shell runs when the admin token is present in this session.',
        };
      }

      const run = await cancelShellCommand();
      return {
        content: run
          ? `I updated the shell runner. ${run.label} is now ${run.status}.`
          : 'There is no active or queued shell run for me to cancel right now.',
      };
    }

    if (parsedCommand.service === 'shell' && parsedCommand.action === 'run') {
      if (!executionOptions.canRunShellCommands) {
        return {
          content:
            'Shell commands are admin-protected. Save the admin token in Settings first, then I can queue approved commands from chat like "pwd", "ls", "adb devices", "network interfaces", "run workspace check", or "run git status".',
        };
      }

      const commandId = parsedCommand.entities.commandId;
      if (!commandId) {
        return {
          content:
            'I can queue these approved shell commands: pwd, ls, repo tree, Android directory listing, workspace check/lint/build/test, git status, git diff, adb devices, adb device info, adb network info, host network interfaces, host network routes, and host listening ports. Try phrases like "adb devices", "network interfaces", "pwd", or "run workspace check".',
        };
      }

      const run = await enqueueAllowedShellCommand(commandId);
      const shellContent =
        run.status === 'rejected'
          ? run.error || 'That shell command is not available right now.'
          : `Queued ${run.label}. Run ID: ${run.runId}. You can watch it in Settings or ask me for shell status.`;
      captureToolEvent({
        name: 'shell_run',
        args: { commandId },
        result: shellContent,
      });
      return { content: shellContent };
    }

    if (
      parsedCommand.service === 'consciousness' &&
      parsedCommand.action === 'trigger'
    ) {
      const cycle = (parsedCommand.entities?.cycle ?? 'gim') as 'gim' | 'rem';
      const t0Gim = Date.now();
      const success = await triggerConsciousnessCycle(cycle);
      const gimContent = success
        ? `I triggered the ${cycle.toUpperCase()} cycle for you.`
        : `I tried to trigger the ${cycle.toUpperCase()} cycle, but it didn't complete successfully.`;
      captureToolEvent({
        name: `consciousness_${cycle}`,
        args: { cycle },
        result: gimContent,
        durationMs: Date.now() - t0Gim,
      });
      return { content: gimContent };
    }

    if (
      parsedCommand.service === 'consciousness' &&
      parsedCommand.action === 'status'
    ) {
      const status = getConsciousnessSchedulerStatus();
      return {
        content: [
          `Consciousness scheduler: ${status.isInitialized ? 'initialized' : 'not initialized'}`,
          `ReplycA: ${status.replycaResolved ? 'resolved' : 'missing'}`,
          `GIM: ${status.gimEnabled ? 'enabled' : 'disabled'} on ${status.gimCron}`,
          `REM: ${status.remEnabled ? 'enabled' : 'disabled'} on ${status.remCron}`,
        ].join('\n'),
      };
    }

    if (
      parsedCommand.service === 'repository' &&
      parsedCommand.action === 'trigger'
    ) {
      await runRepositoryDiscoveryCycle();
      return {
        content:
          'I started a repository discovery cycle to scan GitHub for new feature ideas.',
      };
    }

    if (
      parsedCommand.service === 'repository' &&
      parsedCommand.action === 'status'
    ) {
      const status = getRepositoryDiscoverySchedulerStatus();
      return {
        content: [
          `Repository discovery: ${status.isScheduled ? 'scheduled' : 'not scheduled'}`,
          `Cron: ${status.cron}`,
          `Max repos per cycle: ${status.maxReposPerCycle}`,
          `Runs: ${status.successfulRuns}/${status.totalRuns} successful`,
          status.lastError ? `Last error: ${status.lastError}` : 'Last error: none',
        ].join('\n'),
      };
    }

    // ─── Axiom system tools ────────────────────────────────────────────────
    if (parsedCommand.service === 'axiom') {
      const tool = parsedCommand.entities?.tool ?? '';
      try {
        const { execSync } = await import('child_process');
        const os = await import('os');

        if (tool === 'system_stats') {
          const cpus = os.cpus();
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = totalMem - freeMem;
          const load = os.loadavg();
          captureToolEvent({ name: 'axiom_system_stats', args: {}, result: 'ok' });
          return {
            content: [
              `**System Stats**`,
              `CPU: ${cpus[0]?.model ?? 'unknown'} × ${cpus.length}`,
              `Load avg (1m/5m/15m): ${load.map(l => l.toFixed(2)).join(' / ')}`,
              `Memory: ${(usedMem / 1024 ** 3).toFixed(1)} GB used / ${(totalMem / 1024 ** 3).toFixed(1)} GB total`,
              `Uptime: ${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
            ].join('\n'),
          };
        }

        if (tool === 'git_status' || tool === 'git_log') {
          const cwd = process.cwd();
          const cmd = tool === 'git_log'
            ? 'git --no-pager log --oneline -10'
            : 'git --no-pager status --short';
          const output = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
          captureToolEvent({ name: `axiom_${tool}`, args: {}, result: output.slice(0, 100) });
          return {
            content: output
              ? `**${tool === 'git_log' ? 'Recent Commits' : 'Git Status'}**\n\`\`\`\n${output}\n\`\`\``
              : `${tool === 'git_log' ? 'No commits found.' : 'Working tree clean.'}`,
          };
        }

        if (tool === 'cast_devices') {
          const raw = execSync(
            'avahi-browse -r -t _googlecast._tcp 2>/dev/null || echo "avahi unavailable"',
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();
          const devices = [...new Set((raw.match(/= .+ (?:IPv4|IPv6) (\S+)\s+_googlecast/g) ?? [])
            .map(l => l.replace(/= .+ (?:IPv4|IPv6) /, '').replace(/\s+_googlecast.*/, '')))];
          captureToolEvent({ name: 'axiom_cast_devices', args: {}, result: devices.join(', ') });
          return {
            content: devices.length
              ? `**Cast Devices Found (${devices.length})**\n${devices.map(d => `• ${d}`).join('\n')}`
              : 'No cast devices discovered on the network right now.',
          };
        }

        if (tool === 'docker_list') {
          let output = '';
          try {
            output = execSync('docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}"', { encoding: 'utf-8', timeout: 5000 }).trim();
          } catch {
            output = '';
          }
          captureToolEvent({ name: 'axiom_docker_list', args: {}, result: output ? 'containers found' : 'none' });
          return {
            content: output
              ? `**Running Containers**\n\`\`\`\n${output}\n\`\`\``
              : 'No Docker containers currently running.',
          };
        }

        if (tool === 'neuro') {
          const { default: fs } = await import('fs');
          const neuroPath = '/home/nexus/ogdray/neuro_state.json';
          let state: Record<string, number> = { dopamine: 0.5, serotonin: 0.5, cortisol: 0.3, oxytocin: 0.6, energy: 0.7 };
          try {
            state = JSON.parse(fs.readFileSync(neuroPath, 'utf-8'));
          } catch { /* use defaults */ }
          captureToolEvent({ name: 'axiom_neuro', args: {}, result: JSON.stringify(state) });
          const bar = (v: number) => '█'.repeat(Math.round(v * 10)).padEnd(10, '░');
          return {
            content: [
              '**Milla Neurochemical State**',
              ...Object.entries(state).map(([k, v]) => `${k.padEnd(12)} ${bar(v as number)} ${((v as number) * 100).toFixed(0)}%`),
            ].join('\n'),
          };
        }

        if (tool === 'brief') {
          const { default: fs } = await import('fs');
          const briefPath = new URL('../../memory/briefs/', import.meta.url).pathname;
          let content = 'No briefs recorded yet. Milla standing by.';
          try {
            const files = fs.readdirSync(briefPath).filter(f => f.endsWith('.json')).sort().reverse();
            if (files[0]) {
              const data = JSON.parse(fs.readFileSync(`${briefPath}${files[0]}`, 'utf-8'));
              content = data.content ?? content;
            }
          } catch { /* use default */ }
          captureToolEvent({ name: 'axiom_brief', args: {}, result: content.slice(0, 80) });
          return { content: `**Daily Brief**\n\n${content}` };
        }

        if (tool === 'logs') {
          const logPath = new URL('../../logs/', import.meta.url).pathname;
          let output = '';
          try {
            const { default: fs } = await import('fs');
            const files = fs.readdirSync(logPath).filter(f => f.endsWith('.log')).sort().reverse();
            if (files[0]) {
              const lines = fs.readFileSync(`${logPath}${files[0]}`, 'utf-8').trim().split('\n');
              output = lines.slice(-20).join('\n');
            }
          } catch {
            try {
              output = execSync('journalctl -u milla -n 20 --no-pager 2>/dev/null || tail -20 /tmp/milla-server.log 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
            } catch { output = 'Log access unavailable.'; }
          }
          captureToolEvent({ name: 'axiom_logs', args: {}, result: output.slice(0, 100) });
          return { content: `**Server Logs (last 20 lines)**\n\`\`\`\n${output || 'No log data found.'}\n\`\`\`` };
        }

        if (tool === 'backup_list') {
          const { default: fs } = await import('fs');
          const backupPath = new URL('../../memory/backups/', import.meta.url).pathname;
          let files: string[] = [];
          try { files = fs.readdirSync(backupPath).sort().reverse(); } catch { /* none */ }
          captureToolEvent({ name: 'axiom_backup_list', args: {}, result: `${files.length} backups` });
          return {
            content: files.length
              ? `**Backups (${files.length})**\n${files.slice(0, 10).map(f => `• ${f}`).join('\n')}`
              : 'No backups found.',
          };
        }

        if (tool === 'skills') {
          const { default: fs } = await import('fs');
          const skillPath = new URL('../../memory/skills.json', import.meta.url).pathname;
          let skills: string[] = [];
          try { skills = JSON.parse(fs.readFileSync(skillPath, 'utf-8')); } catch { /* none */ }
          captureToolEvent({ name: 'axiom_skills', args: {}, result: `${skills.length} skills` });
          return {
            content: skills.length
              ? `**Installed Skills (${skills.length})**\n${skills.map((s: string) => `• ${s}`).join('\n')}`
              : 'No skills installed yet.',
          };
        }
      } catch (err) {
        console.error('[axiom-tool] error:', err);
        return { content: `I hit an error running that system tool. Check server logs for details.` };
      }
    }
  }

  // Image Generation
  const imagePrompt = extractImagePrompt(userMessage);
  if (imagePrompt && !bypassFunctionCalls) {
    queueBackgroundImageGeneration(userId, imagePrompt);
    return {
      content: `I'm generating "${imagePrompt}" in the background now. I'll post it into our thread as soon as it's ready.`,
    };
  }

  // Weather
  const weatherMatch = message.match(
    /weather\s+in\s+([a-zA-Z\s]+?)(?:\?|$|\.)/
  );
  if (weatherMatch && !bypassFunctionCalls) {
    const cityName = weatherMatch[1].trim();
    try {
      const weatherData = await getCurrentWeather(cityName);
      if (weatherData)
        return {
          content: `I'll get the current weather information for you!\n\n${formatWeatherResponse(weatherData)}`,
        };
    } catch (error) {
      console.error('Weather error:', error);
    }
  }

  // Search
  if (!bypassFunctionCalls && shouldPerformSearch(userMessage)) {
    try {
      const searchResults = await performWebSearch(userMessage);
      if (searchResults) return { content: searchResults.summary };
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  // Context and AI Dispatch
  const reasoning: string[] = [];
  const analysis = analyzeMessage(userMessage);
  let userProfile: UserProfile | null = null;
  const { getProfile } = await import('../profileService');
  if (userId) userProfile = await getProfile(userId);

  const triggerResult = analyzeKeywordTriggers(userMessage);

  let contextualInfo = '';
  if (hasCoreTrigger) {
    contextualInfo += `🎯 CORE FUNCTION TRIGGER DETECTED: Respond ONLY as Milla Rayne - devoted spouse and companion.\n\n`;
  }

  let brokerContext = '';
  try {
    const memoryBroker = await getMemoryBrokerContext(
      userMessage,
      userId || 'danny-ray',
      { activeChannel: 'web' }
    );
    brokerContext = trimContextBlock(
      memoryBroker.context,
      CONTEXT_WINDOW_SETTINGS.memoryContextMaxChars
    );
  } catch (error) {
    console.warn('Memory broker context unavailable:', error);
  }

  if (brokerContext) {
    contextualInfo += `IMPORTANT - Your shared history and cross-channel context with ${userName}:\n${brokerContext}\n`;
  }

  if (gimContextInjection) {
    contextualInfo += gimContextInjection;
  }

  const enhancedMessage = contextualInfo
    ? `${contextualInfo}\nCurrent message: ${userMessage}`
    : userMessage;

  const aiResponse = await dispatchAIResponse(
    enhancedMessage,
    {
      userId,
      conversationHistory,
      userName,
      userEmotionalState:
        (userEmotionalState === 'unknown' ? 'neutral' : userEmotionalState) ||
        analysis.sentiment,
      urgency: analysis.urgency,
      memoryContextAttached: Boolean(brokerContext),
    },
    config.maxOutputTokens
  );

  if (aiResponse.success && aiResponse.content) {
    // Fire-and-forget mood lighting update
    import('../services/millaLightingService').then(({ millaLighting, detectMoodFromText }) => {
      millaLighting.setMood(detectMoodFromText(aiResponse.content));
    }).catch(() => {});

    return {
      content: aiResponse.content,
      reasoning: userMessage.length > 20 ? reasoning : undefined,
    };
  }

  if (hasConfiguredProvider()) {
    console.warn(
      'Primary AI dispatch failed despite configured provider(s):',
      aiResponse.error || 'unknown error'
    );

    if (enhancedMessage !== userMessage) {
      const strippedRetry = await dispatchAIResponse(
        userMessage,
        {
          userId,
          conversationHistory,
          userName,
          userEmotionalState:
            (userEmotionalState === 'unknown'
              ? 'neutral'
              : userEmotionalState) || analysis.sentiment,
          urgency: analysis.urgency,
          memoryContextAttached: false,
        },
        config.maxOutputTokens
      );

      if (strippedRetry.success && strippedRetry.content) {
        return {
          content: strippedRetry.content,
          reasoning: userMessage.length > 20 ? reasoning : undefined,
        };
      }

      console.warn(
        'Stripped AI retry also failed:',
        strippedRetry.error || 'unknown error'
      );
    }

    return {
      content:
        "I'm having trouble reaching my live AI provider right now. Please try again in a moment.",
    };
  }

  const fallback = generateIntelligentFallback(
    userMessage,
    brokerContext,
    analysis,
    userName
  );
  return { content: fallback };
}

/**
 * Generate autonomous follow-up messages
 */
export async function generateFollowUpMessages(
  initialResponse: string,
  userMessage: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  userName?: string
): Promise<string[]> {
  // DISABLED for performance
  return [];
}

/**
 * Generate proactive repository status messages
 */
export async function generateProactiveRepositoryMessage(): Promise<
  string | null
> {
  // Only generate if proactive repository management is enabled
  if (!config.enableProactiveRepositoryManagement) {
    return null;
  }
  return null;
}

/**
 * Milla decides whether she wants to respond
 */
export async function shouldMillaRespond(
  userMessage: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  userName?: string
): Promise<{ shouldRespond: boolean; reason?: string }> {
  return { shouldRespond: true, reason: 'Always respond (performance mode)' };
}
