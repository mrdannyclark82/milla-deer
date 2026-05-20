export interface ContextWindowMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ContextWindowSettings {
  routeHistoryMaxMessages: number;
  routeHistoryMaxChars: number;
  dispatcherHistoryMaxMessages: number;
  dispatcherHistoryMaxChars: number;
  messageMaxChars: number;
  memoryContextMaxChars: number;
  semanticContextMaxChars: number;
}

interface ContextWindowUsage {
  stage: string;
  originalMessages: number;
  boundedMessages: number;
  originalChars: number;
  boundedChars: number;
  timestamp: number;
}

export const CONTEXT_WINDOW_SETTINGS: ContextWindowSettings = {
  routeHistoryMaxMessages: 8,
  routeHistoryMaxChars: 2400,
  dispatcherHistoryMaxMessages: 6,
  dispatcherHistoryMaxChars: 1800,
  messageMaxChars: 450,
  memoryContextMaxChars: 1200,
  semanticContextMaxChars: 1200,
};

let lastContextWindowUsage: ContextWindowUsage | null = null;

function trimAtBoundary(content: string, maxChars: number): string {
  const normalized = content.trim();
  if (!normalized || normalized.length <= maxChars) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxChars);
  const boundary = Math.max(
    sliced.lastIndexOf('\n'),
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('! '),
    sliced.lastIndexOf('? '),
    sliced.lastIndexOf(' ')
  );

  const safeSlice = boundary > maxChars * 0.6 ? sliced.slice(0, boundary) : sliced;
  return `${safeSlice.trim()}...`;
}

export function trimContextBlock(content: string, maxChars: number): string {
  return trimAtBoundary(content, maxChars);
}

export function boundConversationHistory(
  messages: ContextWindowMessage[],
  options: { maxMessages: number; maxChars: number; stage?: string }
): ContextWindowMessage[] {
  const nonEmptyMessages = messages.filter((message) => message.content?.trim());
  const originalChars = nonEmptyMessages.reduce(
    (sum, message) => sum + message.content.trim().length,
    0
  );

  const bounded: ContextWindowMessage[] = [];
  let remainingChars = options.maxChars;

  for (let index = nonEmptyMessages.length - 1; index >= 0; index -= 1) {
    if (bounded.length >= options.maxMessages || remainingChars <= 0) {
      break;
    }

    const message = nonEmptyMessages[index];
    const trimmedContent = trimAtBoundary(
      message.content,
      Math.min(CONTEXT_WINDOW_SETTINGS.messageMaxChars, remainingChars)
    );

    if (!trimmedContent) {
      continue;
    }

    bounded.unshift({
      role: message.role,
      content: trimmedContent,
    });
    remainingChars -= trimmedContent.length;
  }

  lastContextWindowUsage = {
    stage: options.stage || 'unknown',
    originalMessages: nonEmptyMessages.length,
    boundedMessages: bounded.length,
    originalChars,
    boundedChars: bounded.reduce((sum, message) => sum + message.content.length, 0),
    timestamp: Date.now(),
  };

  return bounded;
}

export function getContextWindowStatus() {
  return {
    settings: CONTEXT_WINDOW_SETTINGS,
    lastUsage: lastContextWindowUsage,
  };
}
