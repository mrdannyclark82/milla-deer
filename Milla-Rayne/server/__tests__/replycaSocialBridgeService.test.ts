import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { storage } from '../storage';
import {
  getReplycaSocialStatus,
  syncReplycaSharedHistory,
} from '../replycaSocialBridgeService';

vi.mock('../storage', () => ({
  storage: {
    createMessage: vi.fn(),
  },
}));

vi.mock('../consciousnessScheduler', () => ({
  getConsciousnessSchedulerStatus: vi.fn(() => ({
    replycaRoot: null,
  })),
}));

describe('replycaSocialBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REPLYCA_ROOT;
    delete process.env.REPLYCA_SOCIAL_STATE_PATH;
    delete process.env.REPLYCA_SOCIAL_USER_ID;
  });

  it('imports ReplycA shared history into canonical messages', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'replyca-social-'));
    const memoryDir = path.join(root, 'core_os', 'memory');
    mkdirSync(memoryDir, { recursive: true });
    writeFileSync(
      path.join(memoryDir, 'shared_chat.jsonl'),
      [
        JSON.stringify({
          role: 'user',
          content: 'Telegram ping',
          source: 'telegram',
        }),
        JSON.stringify({
          role: 'assistant',
          content: 'Reply from Milla',
          source: 'email_tool',
        }),
        '{"broken":',
        JSON.stringify({
          role: 'user',
          content: 'Fallback channel note',
          source: 'manual_cycle',
        }),
      ].join('\n')
    );

    process.env.REPLYCA_ROOT = root;
    process.env.REPLYCA_SOCIAL_STATE_PATH = path.join(root, 'replyca-state.json');
    process.env.REPLYCA_SOCIAL_USER_ID = 'bridge-user';

    const result = await syncReplycaSharedHistory();

    expect(result.synced).toBe(true);
    expect(result.importedThisRun).toBe(3);
    expect(storage.createMessage).toHaveBeenCalledTimes(3);
    expect(storage.createMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 'bridge-user',
        role: 'user',
        channel: 'telegram',
        displayRole: 'Telegram Contact',
        sourcePlatform: 'replyca',
        externalMessageId: 'replyca-shared-line:1',
      })
    );
    expect(storage.createMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: 'assistant',
        channel: 'gmail',
        displayRole: 'ReplycA',
        externalMessageId: 'replyca-shared-line:2',
      })
    );
    expect(storage.createMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        role: 'user',
        channel: 'api',
        displayRole: 'ReplycA Contact',
        externalMessageId: 'replyca-shared-line:3',
      })
    );

    const status = await getReplycaSocialStatus();
    expect(status.sharedChatExists).toBe(true);
    expect(status.importedLineCount).toBe(3);
    expect(status.pendingLines).toBe(0);
    expect(status.importedMessages).toBe(3);
  });

  it('reports unsynced status when the shared history file is missing', async () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(31_000); // bypass 30s SYNC_COOLDOWN_MS
    const root = mkdtempSync(path.join(os.tmpdir(), 'replyca-social-empty-'));
    process.env.REPLYCA_ROOT = root;
    process.env.REPLYCA_SOCIAL_STATE_PATH = path.join(root, 'replyca-state.json');

    const result = await syncReplycaSharedHistory();
    vi.useRealTimers();

    expect(result.synced).toBe(false);
    expect(result.sharedChatExists).toBe(false);
    expect(result.importedThisRun).toBe(0);
    expect(storage.createMessage).not.toHaveBeenCalled();
  });
});
