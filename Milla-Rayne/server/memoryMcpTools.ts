import { storage } from './storage';
import { getMemoryBrokerContext } from './memoryBrokerService';
import { trimContextBlock } from './contextWindowService';

interface MemoryToolMessage {
  id?: string;
  role: string;
  content: string;
  displayRole?: string | null;
  channel?: string | null;
  sourcePlatform?: string | null;
  timestamp?: Date | string | null;
}

function normalizeLimit(limit: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.floor(limit as number)));
}

function formatMessage(message: MemoryToolMessage): string {
  const label =
    message.displayRole ||
    (message.role === 'assistant' ? 'Milla Rayne' : 'User');
  const channel = message.channel || 'web';
  const source = message.sourcePlatform ? `/${message.sourcePlatform}` : '';
  const timestamp = message.timestamp
    ? new Date(message.timestamp).toISOString()
    : 'unknown-time';

  return `[${timestamp}] ${label} via ${channel}${source}: ${message.content}`;
}

function scoreMessage(message: MemoryToolMessage, query: string): number {
  const normalizedQuery = query.toLowerCase();
  const searchable = [
    message.content,
    message.displayRole,
    message.channel,
    message.sourcePlatform,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!normalizedQuery.trim()) {
    return 0;
  }

  return normalizedQuery
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .reduce((score, term) => (searchable.includes(term) ? score + 1 : score), 0);
}

export async function listRecentMessagesTool(args: {
  userId?: string;
  channel?: string;
  limit?: number;
}): Promise<string> {
  const userId = args.userId || 'default-user';
  const channel = args.channel?.trim();
  const limit = normalizeLimit(args.limit, 10, 50);
  const messages = await storage.getMessages(userId);
  const filtered = channel
    ? messages.filter((message) => (message.channel || 'web') === channel)
    : messages;
  const selected = filtered.slice(-limit);

  if (selected.length === 0) {
    return channel
      ? `No recent messages found for channel "${channel}".`
      : 'No recent messages found.';
  }

  return selected.map(formatMessage).join('\n');
}

export async function searchStoredMessagesTool(args: {
  query: string;
  userId?: string;
  channel?: string;
  limit?: number;
}): Promise<string> {
  const userId = args.userId || 'default-user';
  const channel = args.channel?.trim();
  const limit = normalizeLimit(args.limit, 8, 25);
  const messages = await storage.getMessages(userId);
  const filtered = channel
    ? messages.filter((message) => (message.channel || 'web') === channel)
    : messages;

  const ranked = filtered
    .map((message) => ({
      message,
      score: scoreMessage(message, args.query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.message);

  if (ranked.length === 0) {
    return `No stored messages matched "${args.query}".`;
  }

  return ranked.map(formatMessage).join('\n');
}

export async function getBrokerMemoryContextTool(args: {
  query: string;
  userId?: string;
  activeChannel?: string;
}): Promise<string> {
  const result = await getMemoryBrokerContext(
    args.query,
    args.userId || 'default-user',
    { activeChannel: args.activeChannel?.trim() || 'web' }
  );

  return result.context || 'No broker memory context was available for that query.';
}

export async function getMemorySummaryTool(args: {
  query: string;
  userId?: string;
  limit?: number;
}): Promise<string> {
  const userId = args.userId || 'default-user';
  const limit = normalizeLimit(args.limit, 5, 20);
  const summaries = await storage.searchMemorySummaries(userId, args.query, limit);

  if (summaries.length === 0) {
    return `No memory summaries matched "${args.query}".`;
  }

  return summaries
    .map(
      (summary, index) =>
        `${index + 1}. ${summary.title}\n${trimContextBlock(summary.summaryText, 280)}`
    )
    .join('\n\n');
}
