import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerMemoryRoutes } from './memory.routes';
import { storage } from '../storage';
import * as memoryService from '../memoryService';
import * as replycaSocialBridgeService from '../replycaSocialBridgeService';
import * as authService from '../authService';

vi.mock('../storage');
vi.mock('../memoryService');
vi.mock('../replycaSocialBridgeService');
vi.mock('../authService');
vi.mock('../services/chatOrchestrator.service');
vi.mock('../proactiveService');
vi.mock('../visualMemoryService');
vi.mock('../visualRecognitionService');
vi.mock('../dailySuggestionsService');

describe('Memory Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    registerMemoryRoutes(app);
    vi.clearAllMocks();
    // Default: valid session so requireAuth passes
    vi.spyOn(authService, 'validateSession').mockResolvedValue({
      valid: true,
      user: { id: 'default-user', username: 'Danny Ray' } as any,
    });
    vi.spyOn(
      replycaSocialBridgeService,
      'syncReplycaSharedHistory'
    ).mockResolvedValue({
      replycaRoot: null,
      sharedChatPath: null,
      statePath: '/tmp/replyca-social.json',
      sharedChatExists: false,
      totalLines: 0,
      importedLineCount: 0,
      pendingLines: 0,
      importedMessages: 0,
      lastSyncedAt: null,
      synced: false,
      importedThisRun: 0,
    });
  });

  describe('GET /api/messages', () => {
    it('should return messages from storage', async () => {
      vi.spyOn(storage, 'getRecentMessages').mockResolvedValue([
        { id: '1', content: 'hello' } as any,
      ]);
      const response = await request(app)
        .get('/api/messages')
        .set('Cookie', ['session_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].content).toBe('hello');
      expect(replycaSocialBridgeService.syncReplycaSharedHistory).toHaveBeenCalled();
    });

    it('should filter messages by channel when requested', async () => {
      vi.spyOn(storage, 'getRecentMessages').mockResolvedValue([
        { id: '2', content: 'gmail message', channel: 'gmail' } as any,
      ]);

      const response = await request(app)
        .get('/api/messages?channel=gmail')
        .set('Cookie', ['session_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].content).toBe('gmail message');
    });

    it('should accept bearer authorization when resolving message history', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue({
        valid: true,
        user: { id: 'mobile-user' } as any,
      });
      vi.spyOn(storage, 'getRecentMessages').mockResolvedValue([
        { id: '1', content: 'mobile hello', userId: 'mobile-user' } as any,
      ]);

      const response = await request(app)
        .get('/api/messages')
        .set('Cookie', ['session_token=mobile-token']);

      expect(response.status).toBe(200);
      expect(authService.validateSession).toHaveBeenCalledWith('mobile-token');
      expect(storage.getRecentMessages).toHaveBeenCalledWith('mobile-user', 50, undefined);
      expect(response.body[0].content).toBe('mobile hello');
    });
  });

  describe('GET /api/knowledge', () => {
    it('should return knowledge items', async () => {
      vi.spyOn(memoryService, 'searchKnowledge').mockResolvedValue([
        { topic: 'test' } as any,
      ]);
      const response = await request(app)
        .get('/api/knowledge')
        .set('Cookie', ['session_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
    });
  });
});
