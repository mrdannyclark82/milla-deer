import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage', () => ({
  storage: {
    getMessages: vi.fn(),
    searchMemorySummaries: vi.fn(),
  },
}));

vi.mock('../memoryBrokerService', () => ({
  getMemoryBrokerContext: vi.fn(),
}));

import { storage } from '../storage';
import { getMemoryBrokerContext } from '../memoryBrokerService';
import {
  getBrokerMemoryContextTool,
  listRecentMessagesTool,
  searchStoredMessagesTool,
} from '../memoryMcpTools';

describe('memoryMcpTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists recent messages with channel/source labels', async () => {
    vi.mocked(storage.getMessages).mockResolvedValue([
      {
        role: 'user',
        content: 'Email from Alex about launch plans',
        displayRole: 'Alex',
        channel: 'gmail',
        sourcePlatform: 'google',
        timestamp: new Date('2026-03-19T06:00:00Z'),
      },
    ] as any);

    const result = await listRecentMessagesTool({
      userId: 'default-user',
      channel: 'gmail',
      limit: 5,
    });

    expect(result).toContain('Alex via gmail/google');
    expect(result).toContain('launch plans');
  });

  it('searches stored messages by relevance', async () => {
    vi.mocked(storage.getMessages).mockResolvedValue([
      {
        role: 'user',
        content: 'Launch checklist in web chat',
        displayRole: 'Danny Ray',
        channel: 'web',
      },
      {
        role: 'user',
        content: 'Invoice reminder from Gmail',
        displayRole: 'Finance',
        channel: 'gmail',
      },
    ] as any);

    const result = await searchStoredMessagesTool({
      userId: 'default-user',
      query: 'launch checklist',
      limit: 5,
    });

    expect(result).toContain('Launch checklist in web chat');
    expect(result).not.toContain('Invoice reminder');
  });

  it('returns broker memory context', async () => {
    vi.mocked(getMemoryBrokerContext).mockResolvedValue({
      context: 'Recent web conversation:\n- Danny: launch planning',
      sections: {
        recentConversation: '',
        crossChannelSignals: '',
        profile: '',
        summaries: '',
        relationshipMemory: '',
        semanticMemory: '',
      },
    });

    const result = await getBrokerMemoryContextTool({
      query: 'launch planning',
      userId: 'default-user',
      activeChannel: 'web',
    });

    expect(result).toContain('launch planning');
  });
});
