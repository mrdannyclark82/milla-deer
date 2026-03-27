import type { Message } from '../shared/schema';
import { storage } from './storage';
import {
  getMemoryCoreContext,
  getSemanticMemoryContext,
} from './memoryService';
import { getProfile } from './profileService';
import {
  CONTEXT_WINDOW_SETTINGS,
  trimContextBlock,
} from './contextWindowService';
import { syncReplycaSharedHistory } from './replycaSocialBridgeService';
import { getLatestMonologue } from './consciousnessScheduler';
import {
  loadHotContext,
  getHotContextString,
} from './services/sessionPersistenceService';

export interface MemoryBrokerOptions {
  activeChannel?: string;
  recentLimit?: number;
  crossChannelLimit?: number;
}

export interface MemoryBrokerResult {
  context: string;
  sections: {
    recentConversation: string;
    crossChannelSignals: string;
    profile: string;
    summaries: string;
    relationshipMemory: string;
    semanticMemory: string;
  };
}

const DEFAULT_RECENT_LIMIT = 6;
const DEFAULT_CROSS_CHANNEL_LIMIT = 4;

function trimMessageContent(content: string, maxChars: number = 220): string {
  return trimContextBlock(content.replace(/\s+/g, ' ').trim(), maxChars);
}

function labelForMessage(message: Message): string {
  const sourceBits = [message.channel || 'web', message.sourcePlatform]
    .filter(Boolean)
    .join('/');
  const speaker =
    message.displayRole || (message.role === 'assistant' ? 'Milla' : 'User');
  return sourceBits ? `${speaker} via ${sourceBits}` : speaker;
}

function formatMessageList(messages: Message[]): string {
  if (messages.length === 0) {
    return '';
  }

  return messages
    .map(
      (message) =>
        `- ${labelForMessage(message)}: ${trimMessageContent(message.content)}`
    )
    .join('\n');
}

function extractQueryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

function scoreMessageRelevance(message: Message, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const searchableText = [
    message.content,
    message.displayRole,
    message.channel,
    message.sourcePlatform,
    JSON.stringify(message.metadata || {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return terms.reduce((score, term) => {
    if (searchableText.includes(term)) {
      return score + 1;
    }
    return score;
  }, 0);
}

function buildProfileContext(
  profile: Awaited<ReturnType<typeof getProfile>>
): string {
  if (!profile) {
    return '';
  }

  const parts: string[] = [];

  if (profile.name) {
    parts.push(`Name: ${profile.name}`);
  }
  if (profile.interests.length > 0) {
    parts.push(`Interests: ${profile.interests.join(', ')}`);
  }

  const preferenceEntries = Object.entries(profile.preferences || {}).slice(
    0,
    6
  );
  if (preferenceEntries.length > 0) {
    parts.push(
      `Preferences: ${preferenceEntries
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')}`
    );
  }

  return parts.join('\n');
}

export async function getMemoryBrokerContext(
  query: string,
  userId: string,
  options: MemoryBrokerOptions = {}
): Promise<MemoryBrokerResult> {
  try {
    await syncReplycaSharedHistory();
  } catch (error) {
    console.warn('ReplycA social sync skipped during broker load:', error);
  }

  const { activeChannel, recentLimit, crossChannelLimit } = options;
  const effectiveRecentLimit = Math.max(1, recentLimit || DEFAULT_RECENT_LIMIT);
  const effectiveCrossLimit = Math.max(
    1,
    crossChannelLimit || DEFAULT_CROSS_CHANNEL_LIMIT
  );
  const queryTerms = extractQueryTerms(query);

  // Fetch only what we need — no more full-table scans with per-row decryption
  const [recentConversationMessages, crossChannelPool] = await Promise.all([
    storage.getRecentMessages(userId, effectiveRecentLimit, activeChannel),
    activeChannel
      ? storage.getRecentMessages(userId, effectiveCrossLimit * 10)
      : Promise.resolve([] as Message[]),
  ]);

  const crossChannelCandidates = crossChannelPool
    .filter((message) => (message.channel || 'web') !== activeChannel)
    .map((message) => ({
      message,
      score: scoreMessageRelevance(message, queryTerms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, effectiveCrossLimit)
    .map((entry) => entry.message);

  const [profile, summaries, relationshipMemory, semanticMemory] =
    await Promise.all([
      getProfile(userId),
      storage.searchMemorySummaries(userId, query, 3),
      getMemoryCoreContext(query, userId),
      getSemanticMemoryContext(query, userId),
    ]);

  const recentConversation = formatMessageList(recentConversationMessages);
  const crossChannelSignals = formatMessageList(crossChannelCandidates);
  const profileContext = buildProfileContext(profile);
  const summaryContext =
    summaries.length > 0
      ? summaries
          .map(
            (summary) =>
              `- ${summary.title}: ${trimMessageContent(summary.summaryText, 260)}`
          )
          .join('\n')
      : '';

  const sections = {
    recentConversation,
    crossChannelSignals,
    profile: profileContext,
    summaries: summaryContext,
    relationshipMemory: trimContextBlock(
      relationshipMemory,
      Math.floor(CONTEXT_WINDOW_SETTINGS.memoryContextMaxChars * 0.6)
    ),
    semanticMemory: trimContextBlock(
      semanticMemory,
      Math.floor(CONTEXT_WINDOW_SETTINGS.semanticContextMaxChars * 0.6)
    ),
  };

  const contextParts = [
    sections.recentConversation
      ? `Recent ${activeChannel || 'active'} conversation:\n${sections.recentConversation}`
      : '',
    sections.crossChannelSignals
      ? `Relevant cross-channel signals:\n${sections.crossChannelSignals}`
      : '',
    sections.profile ? `Known user profile:\n${sections.profile}` : '',
    sections.summaries ? `Memory summaries:\n${sections.summaries}` : '',
    sections.relationshipMemory
      ? `Relationship memory:\n${sections.relationshipMemory}`
      : '',
    sections.semanticMemory ? sections.semanticMemory : '',
  ].filter(Boolean) as string[];

  // Inject GIM monologue as ambient self-context (capped at 400 chars)
  const monologue = getLatestMonologue(400);
  if (monologue) {
    contextParts.push(`Milla's recent internal monologue:\n${monologue}`);
  }

  // Inject hot session context (zero-latency — from in-memory snapshot)
  const hotCtx = getHotContextString();
  if (hotCtx) {
    contextParts.push(`Session continuity (hot context):\n${hotCtx}`);
  }

  return {
    context: trimContextBlock(
      contextParts.join('\n\n'),
      CONTEXT_WINDOW_SETTINGS.memoryContextMaxChars
    ),
    sections,
  };
}
