import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage', () => ({
  storage: {
    getMessages: vi.fn(),
    searchMemorySummaries: vi.fn(),
  },
}));

vi.mock('../memoryService', () => ({
  getMemoryCoreContext: vi.fn(),
  getSemanticMemoryContext: vi.fn(),
}));

vi.mock('../profileService', () => ({
  getProfile: vi.fn(),
}));

import { storage } from '../storage';
import {
  getMemoryCoreContext,
  getSemanticMemoryContext,
} from '../memoryService';
import { getProfile } from '../profileService';
import { getMemoryBrokerContext } from '../memoryBrokerService';

describe('memoryBrokerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines recent channel messages with cross-channel context', async () => {
    vi.mocked(storage.getMessages).mockResolvedValue([
      {
        id: '1',
        role: 'user',
        content: 'Let us plan the launch email',
        displayRole: 'Danny Ray',
        channel: 'web',
        sourcePlatform: 'milla-hub',
        timestamp: new Date('2026-03-19T10:00:00Z'),
        userId: 'default-user',
      },
      {
        id: '2',
        role: 'assistant',
        content: 'I can draft that launch email for you.',
        displayRole: 'Milla Rayne',
        channel: 'web',
        sourcePlatform: 'milla-hub',
        timestamp: new Date('2026-03-19T10:01:00Z'),
        userId: 'default-user',
      },
      {
        id: '3',
        role: 'user',
        content: 'Email from Investor with subject "Launch timeline". Snippet: asking for dates.',
        displayRole: 'Investor',
        channel: 'gmail',
        sourcePlatform: 'google',
        timestamp: new Date('2026-03-19T09:00:00Z'),
        userId: 'default-user',
        metadata: { subject: 'Launch timeline' },
      },
    ] as any);
    vi.mocked(storage.searchMemorySummaries).mockResolvedValue([
      {
        id: 'summary-1',
        title: 'Launch planning',
        summaryText: 'Danny and Milla discussed a launch checklist and outreach.',
      },
    ] as any);
    vi.mocked(getProfile).mockResolvedValue({
      id: 'default-user',
      name: 'Danny Ray',
      interests: ['AI', 'product launches'],
      preferences: { tone: 'warm' },
    });
    vi.mocked(getMemoryCoreContext).mockResolvedValue(
      'Relevant Memory Context:\n[Danny]: We discussed launch messaging before.'
    );
    vi.mocked(getSemanticMemoryContext).mockResolvedValue(
      'Relevant memories:\nMemory 1:\nLaunch messaging and outreach timing.'
    );

    const result = await getMemoryBrokerContext(
      'help me answer the launch email',
      'default-user',
      { activeChannel: 'web' }
    );

    expect(result.context).toContain('Recent web conversation');
    expect(result.context).toContain('Relevant cross-channel signals');
    expect(result.context).toContain('Investor via gmail/google');
    expect(result.context).toContain('Known user profile');
    expect(result.context).toContain('Memory summaries');
    expect(result.context).toContain('Relationship memory');
  });
});
