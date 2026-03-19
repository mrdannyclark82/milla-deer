import { describe, expect, it } from 'vitest';
import {
  CONTEXT_WINDOW_SETTINGS,
  boundConversationHistory,
  trimContextBlock,
} from '../contextWindowService';

describe('contextWindowService', () => {
  it('bounds conversation history by message count and char budget', () => {
    const bounded = boundConversationHistory(
      Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${index} ${'x'.repeat(180)}`,
      })),
      {
        maxMessages: CONTEXT_WINDOW_SETTINGS.routeHistoryMaxMessages,
        maxChars: CONTEXT_WINDOW_SETTINGS.routeHistoryMaxChars,
        stage: 'test-history',
      }
    );

    expect(bounded.length).toBeLessThanOrEqual(
      CONTEXT_WINDOW_SETTINGS.routeHistoryMaxMessages
    );
    expect(
      bounded.every(
        (message) =>
          message.content.length <= CONTEXT_WINDOW_SETTINGS.messageMaxChars + 3
      )
    ).toBe(true);
  });

  it('trims large context blocks at safe boundaries', () => {
    const trimmed = trimContextBlock(
      'Sentence one. Sentence two. Sentence three. Sentence four.',
      30
    );

    expect(trimmed.length).toBeLessThanOrEqual(33);
    expect(trimmed.endsWith('...')).toBe(true);
  });
});
