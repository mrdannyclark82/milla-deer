import {
  generateXAIResponse,
  PersonalityContext as XAIPersonalityContext,
} from './xaiService';
import { generateMinimaxResponse } from './minimaxService';
import { generateVeniceResponse } from './veniceService';
import { getUserAIModel } from './authService';
import {
  generateOpenRouterResponse,
  generateGrokResponse,
  OpenRouterContext,
} from './openrouterService';
import { generateGeminiResponse } from './geminiService';
import { generateAnthropicResponse } from './anthropicService';
import { generateMistralResponse } from './mistralService';
import { storage } from './storage';
import { config } from './config';
import { generateOpenAIResponse } from './openaiChatService';
import { getSemanticMemoryContext, searchMemoryCore } from './memoryService';
import { semanticSearchVideos } from './youtubeKnowledgeBase';
import {
  type AVRagContext,
  enrichMessageWithAVContext,
  validateSceneContext,
  validateVoiceContext,
  createAVContext,
} from './avRagService';
import type { VoiceAnalysisResult } from './voiceAnalysisService';
import type { UICommand } from '../shared/schema';
import {
  startReasoningSession,
  trackCommandIntent,
  trackToolSelection,
  trackMemoryRetrieval,
  trackResponseGeneration,
  getReasoningData,
  addReasoningStep,
  type XAIData,
} from './xaiTracker';
import { getAmbientContext, type AmbientContext } from './realWorldInfoService';
import {
  generateActivePersona,
  formatPersonaForPrompt,
  type ActiveUserPersona,
} from './personaFusionService';
import { DEFAULT_CHAT_MODEL, normalizeAIModel } from './aiModelPreferences';
import {
  CONTEXT_WINDOW_SETTINGS,
  boundConversationHistory,
  trimContextBlock,
} from './contextWindowService';

// Response cache for avoiding duplicate AI calls
const responseCache = new Map<
  string,
  { response: AIResponse; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const MEMORY_RELEVANCE_THRESHOLD = 8.0;
const CONTENT_TRUNCATION_SHORT = 200;
const CONTENT_TRUNCATION_MEDIUM = 250;
const CONTENT_TRUNCATION_LONG = 300;
const GEMINI_QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
let geminiCooldownUntil = 0;
const hasApiKey = (value: string | null | undefined): value is string =>
  Boolean(value?.trim());
const hasOpenRouterKeyConfigured = (): boolean =>
  [
    config.openrouter.apiKey,
    config.openrouter.minimaxApiKey,
    config.openrouter.grok1ApiKey,
    config.openrouter.grok4ApiKey,
    config.openrouter.katCoderApiKey,
    config.openrouter.geminiApiKey,
    config.openrouter.geminiFlashApiKey,
  ].some(hasApiKey);
const hasDirectProviderConfigured = (): boolean =>
  [
    config.gemini?.apiKey,
    config.xai?.apiKey,
    config.openai?.apiKey,
    config.anthropic?.apiKey,
    config.mistral?.apiKey,
    config.minimax?.apiKey,
    config.venice?.apiKey,
  ].some(hasApiKey);
const shouldInjectMemoryContext = (message: string): boolean =>
  /remember|recall|memory|when we|before|previous|history|what did i|told you/i.test(
    message
  );

export interface AIResponse {
  content: string;
  success: boolean;
  error?: string;
  uiCommand?: UICommand;
  xaiSessionId?: string;
}

export interface DispatchContext {
  userId: string | null;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  userName: string;
  userEmotionalState?: 'positive' | 'negative' | 'neutral';
  urgency?: 'low' | 'medium' | 'high';
  sceneContext?: any;
  voiceContext?: VoiceAnalysisResult;
  ambientContext?: AmbientContext;
  memoryContextAttached?: boolean;
}

const isGeminiQuotaError = (response: AIResponse): boolean => {
  const error = response.error?.toLowerCase() || '';
  const content = response.content?.toLowerCase() || '';
  return (
    error.includes('429') ||
    error.includes('quota') ||
    error.includes('rate limit') ||
    content.includes('gemini service')
  );
};

const isGeminiAvailable = (): boolean => Date.now() >= geminiCooldownUntil;

const markGeminiQuotaCooldown = () => {
  geminiCooldownUntil = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
};

async function enrichContextWithSemanticRetrieval(
  userMessage: string,
  context: DispatchContext
): Promise<string> {
  const userId = context.userId || 'default-user';
  try {
    const memoryContext =
      shouldInjectMemoryContext(userMessage) && !context.memoryContextAttached
        ? await getSemanticMemoryContext(userMessage, userId)
        : '';
    const youtubeResults = await semanticSearchVideos(userMessage, {
      userId,
      topK: 2,
      minSimilarity: 0.7,
    });

    let enrichedContext = '';
    if (memoryContext) enrichedContext += memoryContext;
    if (youtubeResults.length > 0) {
      const youtubeParts = youtubeResults.map(
        (result, index) =>
          `YouTube Knowledge ${index + 1} (${result.video.title}, relevance: ${(result.similarity * 100).toFixed(1)}%):\n${result.video.summary}`
      );
      enrichedContext += `\n\nRelevant YouTube knowledge:\n${youtubeParts.join('\n\n')}`;
    }
    return trimContextBlock(
      enrichedContext,
      CONTEXT_WINDOW_SETTINGS.semanticContextMaxChars
    );
  } catch (error) {
    console.error('Error enriching context with semantic retrieval:', error);
    return '';
  }
}

function buildAVRagContext(context: DispatchContext): AVRagContext | null {
  try {
    const scene = validateSceneContext(context.sceneContext);
    const voice = validateVoiceContext(context.voiceContext);
    if (!scene && !voice) return null;
    return createAVContext(scene || undefined, voice || undefined);
  } catch (error) {
    console.error('Error building A/V-RAG context:', error);
    return null;
  }
}

function detectIntent(message: string): string {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('youtube') || lowerMessage.includes('video'))
    return 'Video analysis or playback request';
  if (lowerMessage.includes('meditat') || lowerMessage.includes('relax'))
    return 'Meditation or relaxation request';
  if (lowerMessage.includes('search') || lowerMessage.includes('find'))
    return 'Information search request';
  if (lowerMessage.includes('code') || lowerMessage.includes('programming'))
    return 'Programming or technical assistance';
  if (lowerMessage.includes('weather')) return 'Weather information request';
  if (lowerMessage.includes('calendar') || lowerMessage.includes('schedule'))
    return 'Calendar or scheduling request';
  return 'General conversation';
}

function buildAmbientContextString(ambient: AmbientContext): string {
  const parts: string[] = [];
  if (ambient.motionState && ambient.motionState !== 'unknown')
    parts.push(`User is currently ${ambient.motionState}`);
  if (ambient.lightLevel !== undefined) {
    const lightDescription =
      ambient.lightLevel > 70
        ? 'bright'
        : ambient.lightLevel > 30
          ? 'moderate'
          : 'low';
    parts.push(`ambient light is ${lightDescription} (${ambient.lightLevel}%)`);
  }
  if (ambient.deviceContext.battery !== null) {
    parts.push(
      `device battery at ${ambient.deviceContext.battery}%${ambient.deviceContext.charging ? ' (charging)' : ''}`
    );
  }
  if (ambient.deviceContext.network)
    parts.push(`connected via ${ambient.deviceContext.network}`);
  if (ambient.location) parts.push(`location available`);
  if (parts.length === 0) return '';
  return `\n\n[Real-time Context: ${parts.join(', ')}]`;
}

function detectUICommand(
  userMessage: string,
  responseContent: string
): UICommand | undefined {
  const lowerMessage = userMessage.toLowerCase();
  if (
    lowerMessage.includes('youtube') &&
    (lowerMessage.includes('analyze') ||
      lowerMessage.includes('video') ||
      lowerMessage.includes('watch'))
  ) {
    const videoIdMatch = userMessage.match(
      /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (videoIdMatch) {
      return {
        action: 'SHOW_COMPONENT',
        componentName: 'VideoAnalysisPanel',
        data: { videoId: videoIdMatch[1] },
        metadata: {
          reason: 'User requested YouTube video analysis',
          priority: 'high',
        },
      };
    }
  }
  if (
    lowerMessage.includes('meditat') ||
    lowerMessage.includes('relax') ||
    lowerMessage.includes('calm') ||
    lowerMessage.includes('breathing')
  ) {
    return {
      action: 'SHOW_COMPONENT',
      componentName: 'GuidedMeditation',
      data: { duration: lowerMessage.includes('quick') ? 5 : 10 },
      metadata: {
        reason: 'User requested meditation or relaxation',
        priority: 'medium',
      },
    };
  }
  if (
    lowerMessage.includes('search') ||
    lowerMessage.includes('find') ||
    lowerMessage.includes('look up') ||
    lowerMessage.includes('what do you know about')
  ) {
    return {
      action: 'SHOW_COMPONENT',
      componentName: 'KnowledgeBaseSearch',
      data: { query: userMessage },
      metadata: {
        reason: 'User requested knowledge base search',
        priority: 'medium',
      },
    };
  }
  if (
    lowerMessage.includes('note') ||
    lowerMessage.includes('write down') ||
    lowerMessage.includes('remember this')
  ) {
    return {
      action: 'SHOW_COMPONENT',
      componentName: 'SharedNotepad',
      data: {},
      metadata: { reason: 'User wants to take notes', priority: 'low' },
    };
  }
  return undefined;
}

function generateMemoryBasedResponse(
  userMessage: string,
  memoryResults: Array<{
    entry: { content: string; speaker: string };
    relevanceScore: number;
    matchedTerms: string[];
  }>,
  userName: string
): string {
  const lowerMessage = userMessage.toLowerCase();
  const pickRandom = <T>(arr: T[]): T =>
    arr[Math.floor(Math.random() * arr.length)];
  const truncate = (content: string, maxLength: number): string =>
    content.length > maxLength
      ? content.substring(0, maxLength) + '...'
      : content;
  const topMemory = memoryResults[0];
  const greetings = ['Hey', 'Hi', 'Hello'];
  const transitions = [
    'I remember',
    'From what I recall',
    'Based on our conversations',
    'I know from our history that',
  ];
  const closings = [
    "Is there anything else you'd like to know, love?",
    'What else can I help you with, sweetheart?',
    'Let me know if you need more details!',
    'Feel free to ask if you want me to elaborate, babe.',
  ];
  const greeting = pickRandom(greetings);
  const transition = pickRandom(transitions);
  const closing = pickRandom(closings);
  if (
    lowerMessage.includes('remember') ||
    lowerMessage.includes('recall') ||
    lowerMessage.includes('told you')
  ) {
    return `${greeting} ${userName}! ${transition}, we talked about this before. ${truncate(topMemory.entry.content, CONTENT_TRUNCATION_SHORT)} ${closing}`;
  }
  if (
    lowerMessage.includes('what') &&
    (lowerMessage.includes('said') || lowerMessage.includes('mentioned'))
  ) {
    return `${transition}: ${truncate(topMemory.entry.content, CONTENT_TRUNCATION_LONG)} ${closing}`;
  }
  return `${greeting} ${userName}! ${transition}: ${truncate(topMemory.entry.content, CONTENT_TRUNCATION_MEDIUM)}\n\n${closing}`;
}

export async function dispatchAIResponse(
  userMessage: string,
  context: DispatchContext,
  maxTokens?: number,
  traceId?: string
): Promise<AIResponse> {
  const requestTraceId =
    traceId || `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const cacheKey = `${userMessage.substring(0, 100)}-${context.userId || 'anon'}`;
  const cached = responseCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`🔍 [TRACE:${requestTraceId}] Cache hit for key: ${cacheKey}`);
    return cached.response;
  }

  console.log(`🔍 [TRACE:${requestTraceId}] dispatchAIResponse - Starting`);
  const startTime = Date.now();
  const userId = context.userId || 'default-user';
  const boundedConversationHistory = boundConversationHistory(
    context.conversationHistory || [],
    {
      maxMessages: CONTEXT_WINDOW_SETTINGS.dispatcherHistoryMaxMessages,
      maxChars: CONTEXT_WINDOW_SETTINGS.dispatcherHistoryMaxChars,
      stage: 'dispatcher-history',
    }
  );

  // Memory-First Check
  try {
    const memoryResults = await searchMemoryCore(userMessage, 5, userId);
    const topScore =
      memoryResults.length > 0 ? memoryResults[0].relevanceScore : 0;

    /* Memory short-circuit disabled by request
    if (topScore >= MEMORY_RELEVANCE_THRESHOLD && memoryResults.length > 0) {
      console.log(`🧠 [TRACE:${requestTraceId}] Using memory-based response (score ${topScore.toFixed(2)})`);
      const memoryBasedResponse = generateMemoryBasedResponse(userMessage, memoryResults, context.userName);
      const response: AIResponse = { content: memoryBasedResponse, success: true, xaiSessionId: requestTraceId };
      responseCache.set(cacheKey, { response, timestamp: Date.now() });
      return response;
    }
    */
  } catch (error) {
    console.error(`🔍 [TRACE:${requestTraceId}] Memory search error:`, error);
  }

  const xaiSessionId = startReasoningSession(context.userId || 'anonymous');
  const intent = detectIntent(userMessage);
  trackCommandIntent(xaiSessionId, intent);

  // Context Enrichment
  let ambientContext: AmbientContext | null = null;
  if (context.userId) ambientContext = getAmbientContext(context.userId);
  let activePersona: ActiveUserPersona | null = null;
  if (context.userId) {
    try {
      activePersona = await generateActivePersona(context.userId, userMessage);
    } catch (e) {
      console.error(e);
    }
  }
  let adaptivePersona = null;
  try {
    const { getActivePersonaConfig } = await import('./selfEvolutionService');
    adaptivePersona = getActivePersonaConfig();
  } catch (e) {}

  const semanticContext = await enrichContextWithSemanticRetrieval(
    userMessage,
    context
  );
  const avContext = buildAVRagContext(context);

  let augmentedMessage = userMessage;
  if (adaptivePersona?.systemPromptModifier)
    augmentedMessage =
      `[PERSONA DIRECTIVE]: ${adaptivePersona.systemPromptModifier}\n\n` +
      augmentedMessage;
  if (activePersona)
    augmentedMessage =
      formatPersonaForPrompt(activePersona) + '\n\n' + augmentedMessage;
  if (semanticContext)
    augmentedMessage += `\n\n---\nContext from knowledge base:${semanticContext}`;
  if (avContext)
    augmentedMessage = enrichMessageWithAVContext(augmentedMessage, avContext);
  if (ambientContext)
    augmentedMessage += buildAmbientContextString(ambientContext);

  // === DYNAMIC MODEL SELECTION & FALLBACK CHAIN ===
  // Priority: User Preference -> Local Preference -> Gemini -> xAI -> OpenAI -> Anthropic -> Mistral -> OpenRouter

  let response: AIResponse = { content: '', success: false };
  let modelUsed = 'none';
  let attemptedGemini = false;

  // Check user preference
  let preferredModel = null;
  if (userId && userId !== 'default-user') {
    try {
      const result = await getUserAIModel(userId);
      if (result.success) preferredModel = normalizeAIModel(result.model);
    } catch (error) {
      console.error('Error fetching user AI model:', error);
    }
  }
  preferredModel ||= DEFAULT_CHAT_MODEL;

  // 0. User Preferred Model (Direct Routing)
  if (preferredModel) {
    console.log(`🤖 User preferred model: ${preferredModel}`);

    if (preferredModel === 'gemini') {
      attemptedGemini = true;
      if (isGeminiAvailable()) {
        response = await generateGeminiResponse(augmentedMessage);
        if (!response.success && isGeminiQuotaError(response)) {
          markGeminiQuotaCooldown();
        }
      } else {
        response = {
          content: 'Gemini is temporarily cooling down after a quota limit.',
          success: false,
          error: 'Gemini cooldown active after quota limit',
        };
      }
      if (response.success) modelUsed = 'gemini';
    } else if (preferredModel === 'minimax') {
      response = await generateMinimaxResponse(
        augmentedMessage,
        {
          conversationHistory: boundedConversationHistory,
          userName: context.userName,
          userEmotionalState: context.userEmotionalState,
          urgency: context.urgency,
        },
        maxTokens
      );
      if (response.success) modelUsed = 'minimax';
    } else if (
      preferredModel === 'venice' ||
      preferredModel === 'venice-uncensored'
    ) {
      response = await generateVeniceResponse(
        augmentedMessage,
        {
          conversationHistory: boundedConversationHistory,
          userName: context.userName,
          userEmotionalState: context.userEmotionalState,
          urgency: context.urgency,
        },
        maxTokens
      );
      if (response.success) modelUsed = 'venice';
    } else if (preferredModel === 'xai' || preferredModel === 'grok') {
      // Pass model preference if needed, or rely on config
      response = await generateXAIResponse(
        augmentedMessage,
        {
          conversationHistory: boundedConversationHistory,
          userEmotionalState: context.userEmotionalState,
          urgency: context.urgency,
          userName: context.userName,
        } as XAIPersonalityContext,
        maxTokens
      );
      if (response.success) modelUsed = 'xai';
    }
  }

  // 0.5 Optional Ollama local-first mode
  if (
    !response.success &&
    config.localModel?.enabled &&
    config.localModel?.preferLocal
  ) {
    console.log('🤖 Ollama local-first mode enabled');
    const { offlineService } = await import('./offlineModelService');
    const localResponse = await offlineService.generateResponse(
      augmentedMessage,
      ''
    );
    if (localResponse.success) {
      response = { content: localResponse.content, success: true };
      modelUsed = 'ollama';
    }
  }

  // 0.75 Gemini
  if (
    !response.success &&
    !attemptedGemini &&
    isGeminiAvailable() &&
    hasApiKey(config.gemini?.apiKey)
  ) {
    console.log('Trying Gemini...');
    attemptedGemini = true;
    response = await generateGeminiResponse(augmentedMessage);
    if (!response.success && isGeminiQuotaError(response)) {
      markGeminiQuotaCooldown();
    }
    if (response.success) modelUsed = 'gemini';
  }

  // 1. xAI (primary fallback after Gemini)
  if (!response.success && hasApiKey(config.xai.apiKey)) {
    console.log('Trying xAI...');
    response = await generateXAIResponse(
      augmentedMessage,
        {
          conversationHistory: boundedConversationHistory,
          userEmotionalState: context.userEmotionalState,
        urgency: context.urgency,
        userName: context.userName,
      } as XAIPersonalityContext,
      maxTokens
    );
    if (response.success) modelUsed = 'xai';
  }

  // 2. OpenAI
  if (!response.success && hasApiKey(config.openai.apiKey)) {
    console.log('Trying OpenAI...');
    response = await generateOpenAIResponse(
      augmentedMessage,
        {
          conversationHistory: boundedConversationHistory,
          userName: context.userName,
        userEmotionalState: context.userEmotionalState,
        urgency: context.urgency,
      } as any,
      maxTokens || 1024
    );
    if (response.success) modelUsed = 'openai';
  }

  // 3. Anthropic
  if (!response.success && hasApiKey(config.anthropic?.apiKey)) {
    console.log('Trying Anthropic...');
      response = await generateAnthropicResponse(augmentedMessage, {
        conversationHistory: boundedConversationHistory,
        userEmotionalState: context.userEmotionalState,
        urgency: context.urgency,
        userName: context.userName,
    });
    if (response.success) modelUsed = 'anthropic';
  }

  // 4. Mistral
  if (!response.success && hasApiKey(config.mistral?.apiKey)) {
    console.log('Trying Mistral...');
      response = await generateMistralResponse(augmentedMessage, {
        conversationHistory: boundedConversationHistory,
        userEmotionalState: context.userEmotionalState,
        urgency: context.urgency,
        userName: context.userName,
    });
    if (response.success) modelUsed = 'mistral';
  }

  // 5. OpenRouter (only when direct providers are not configured)
  if (
    !response.success &&
    hasOpenRouterKeyConfigured() &&
    !hasDirectProviderConfigured()
  ) {
    console.log('Falling back to OpenRouter...');
    response = await generateOpenRouterResponse(
      augmentedMessage,
        {
          conversationHistory: boundedConversationHistory,
          userEmotionalState: context.userEmotionalState,
          urgency: context.urgency,
          userName: context.userName,
      } as OpenRouterContext,
      maxTokens
    );
    if (response.success) modelUsed = 'openrouter';
  } else if (
    !response.success &&
    hasOpenRouterKeyConfigured() &&
    hasDirectProviderConfigured()
  ) {
    console.log(
      'Skipping OpenRouter fallback because direct provider keys are configured.'
    );
  }

  // 6. Ollama final fallback
  if (!response.success && config.localModel?.enabled) {
    console.log('Trying Ollama final fallback...');
    const { offlineService } = await import('./offlineModelService');
    const localResponse = await offlineService.generateResponse(
      augmentedMessage,
      ''
    );
    if (localResponse.success) {
      response = { content: localResponse.content, success: true };
      modelUsed = 'ollama';
    }
  }

  // Track response and detect UI commands
  if (response.success) {
    trackResponseGeneration(xaiSessionId, modelUsed, undefined, undefined);
    addReasoningStep(
      xaiSessionId,
      'response',
      'Model Selected',
      `Responded using ${modelUsed}`
    );

    const uiCommand = detectUICommand(userMessage, response.content || '');
    if (uiCommand) {
      response.uiCommand = uiCommand;
      addReasoningStep(
        xaiSessionId,
        'response',
        'UI Command Detected',
        JSON.stringify(uiCommand)
      );
    }
  }

  response.xaiSessionId = xaiSessionId;
  responseCache.set(cacheKey, { response, timestamp: Date.now() });

  const duration = Date.now() - startTime;
  console.log(
    `🔍 [TRACE:${requestTraceId}] dispatchAIResponse - Completed in ${duration}ms. Model: ${modelUsed}`
  );

  return response;
}
