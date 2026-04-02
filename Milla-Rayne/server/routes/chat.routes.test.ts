import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerChatRoutes } from './chat.routes';
import * as authService from '../authService';
import * as chatOrchestrator from '../services/chatOrchestrator.service';
import * as smartHomeService from '../smartHomeService';
import * as sceneDetectionService from '../sceneDetectionService';
import { storage } from '../storage';

vi.mock('../authService');
vi.mock('../services/chatOrchestrator.service');
vi.mock('../voiceAnalysisService');
vi.mock('../smartHomeService');
vi.mock('../sceneDetectionService');
vi.mock('../replycaSocialBridgeService', () => ({ appendToSharedChat: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/sessionPersistenceService', () => ({ recordTurn: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/ragAutoIndexer', () => ({ queueForIndexing: vi.fn() }));
vi.mock('../services/contextMerchService', () => ({ scanForMerchSignals: vi.fn() }));
vi.mock('../services/scene.service', () => ({
  sceneService: {
    getLocation: vi.fn().mockReturnValue('living room'),
    getSceneContext: vi.fn().mockReturnValue({}),
    updateScene: vi.fn(),
  },
}));

describe('Chat Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    registerChatRoutes(app);
    // Catch unhandled errors to expose 500 message in tests
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('[test-app-error]', err?.message ?? err);
      res.status(500).json({ error: err?.message ?? 'Internal error' });
    });
    vi.clearAllMocks();

    // Default mocks
    vi.spyOn(smartHomeService, 'getSmartHomeSensorData').mockResolvedValue({});
    vi.spyOn(sceneDetectionService, 'detectSceneContext').mockReturnValue({
      hasSceneChange: false,
      location: 'living room',
      mood: 'calm',
      timeOfDay: 'evening',
    } as any);
    vi.spyOn(storage, 'getMessages').mockResolvedValue([]);
    vi.spyOn(storage, 'getRecentMessages').mockResolvedValue([]);
    vi.spyOn(storage, 'createMessage').mockResolvedValue({} as any);
    // Default: unauthenticated session (routes that need auth will add their own mock)
    vi.spyOn(authService, 'validateSession').mockResolvedValue({ valid: false } as any);
    delete process.env.ADMIN_TOKEN;
  });

  describe('GET /api/ai-model/current', () => {
    it('should return default model if not authenticated', async () => {
      const response = await request(app).get('/api/ai-model/current');
      expect(response.status).toBe(200);
      expect(response.body.model).toBe('xai');
    });

    it('should return user model if authenticated', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue({
        valid: true,
        user: { id: 'user-1' } as any,
      });
      vi.spyOn(authService, 'getUserAIModel').mockResolvedValue({
        success: true,
        model: 'xai',
      });

      const response = await request(app)
        .get('/api/ai-model/current')
        .set('Cookie', ['session_token=valid-token']);

      expect(response.status).toBe(200);
      expect(response.body.model).toBe('xai');
    });

    it('should accept bearer authorization for authenticated model lookup', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue({
        valid: true,
        user: { id: 'user-2' } as any,
      });
      vi.spyOn(authService, 'getUserAIModel').mockResolvedValue({
        success: true,
        model: 'gemini',
      });

      const response = await request(app)
        .get('/api/ai-model/current')
        .set('Authorization', 'Bearer mobile-token');

      expect(response.status).toBe(200);
      expect(authService.validateSession).toHaveBeenCalledWith('mobile-token');
      expect(response.body.model).toBe('gemini');
    });
  });

  describe('POST /api/chat', () => {
    it('should return AI response for a message', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue({
        valid: true,
        user: { id: 'default-user', username: 'Danny Ray' } as any,
      });
      vi.spyOn(
        chatOrchestrator,
        'validateAndSanitizePrompt'
      ).mockImplementation((p) => p);
      vi.spyOn(chatOrchestrator, 'generateAIResponse').mockResolvedValue({
        content: 'Hello Danny!',
      });

      const response = await request(app)
        .post('/api/chat')
        .set('Cookie', ['session_token=valid-token'])
        .send({ message: 'Hi Milla' });

      expect(response.status).toBe(200);
      expect(response.body.response).toBe('Hello Danny!');
      expect(storage.getRecentMessages).toHaveBeenCalledWith('default-user', expect.any(Number), expect.any(String));
      expect(chatOrchestrator.generateAIResponse).toHaveBeenCalledWith(
        'Hi Milla',
        [],
        'Danny Ray',
        undefined,
        'default-user',
        undefined,
        false,
        { canRunShellCommands: true }
      );
      expect(storage.createMessage).toHaveBeenCalledTimes(2);
    });

    it('passes shell admin capability when the admin token header is valid', async () => {
      process.env.ADMIN_TOKEN = 'test-admin-token';
      vi.spyOn(authService, 'validateSession').mockResolvedValue({
        valid: true,
        user: { id: 'default-user', username: 'Danny Ray' } as any,
      });
      vi.spyOn(
        chatOrchestrator,
        'validateAndSanitizePrompt'
      ).mockImplementation((p) => p);
      vi.spyOn(chatOrchestrator, 'generateAIResponse').mockResolvedValue({
        content: 'Queued shell command',
      });

      const response = await request(app)
        .post('/api/chat')
        .set('Cookie', ['session_token=valid-token'])
        .set('x-admin-token', 'test-admin-token')
        .send({ message: 'run workspace check' });

      expect(response.status).toBe(200);
      expect(chatOrchestrator.generateAIResponse).toHaveBeenCalledWith(
        'run workspace check',
        [],
        'Danny Ray',
        undefined,
        'default-user',
        undefined,
        false,
        { canRunShellCommands: true }
      );
    });

    it('uses bearer authorization to resolve the chat user', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue({
        valid: true,
        user: { id: 'mobile-user' } as any,
      });
      vi.spyOn(
        chatOrchestrator,
        'validateAndSanitizePrompt'
      ).mockImplementation((p) => p);
      vi.spyOn(chatOrchestrator, 'generateAIResponse').mockResolvedValue({
        content: 'Synced mobile response',
      });

      const response = await request(app)
        .post('/api/chat')
        .set('Cookie', ['session_token=mobile-token'])
        .send({ message: 'Sync me up' });

      expect(response.status).toBe(200);
      expect(storage.getRecentMessages).toHaveBeenCalledWith('mobile-user', expect.any(Number), expect.any(String));
      expect(authService.validateSession).toHaveBeenCalledWith('mobile-token');
      expect(storage.createMessage).toHaveBeenCalledTimes(2);
    });

    it('should return 400 for empty message', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue({
        valid: true,
        user: { id: 'default-user', username: 'Danny Ray' } as any,
      });
      const response = await request(app)
        .post('/api/chat')
        .set('Cookie', ['session_token=valid-token'])
        .send({ message: '' });

      expect(response.status).toBe(400);
    });

    it('should bound stored conversation history before orchestrating', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue({
        valid: true,
        user: { id: 'default-user', username: 'Danny Ray' } as any,
      });
      vi.spyOn(
        chatOrchestrator,
        'validateAndSanitizePrompt'
      ).mockImplementation((p) => p);
      vi.spyOn(chatOrchestrator, 'generateAIResponse').mockResolvedValue({
        content: 'Trimmed history response',
      });
      vi.spyOn(storage, 'getMessages').mockResolvedValue(
        Array.from({ length: 12 }, (_, index) => ({
          id: `m-${index}`,
          userId: 'default-user',
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${index} ${'x'.repeat(180)}`,
        })) as any
      );
      vi.spyOn(storage, 'getRecentMessages').mockResolvedValue(
        Array.from({ length: 12 }, (_, index) => ({
          id: `m-${index}`,
          userId: 'default-user',
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${index} ${'x'.repeat(180)}`,
        })) as any
      );

      const response = await request(app)
        .post('/api/chat')
        .set('Cookie', ['session_token=valid-token'])
        .send({ message: 'Use recent context' });

      expect(response.status).toBe(200);
      const boundedHistory = vi.mocked(
        chatOrchestrator.generateAIResponse
      ).mock.calls[0][1];
      expect(boundedHistory.length).toBeLessThanOrEqual(8);
      expect(
        boundedHistory.every((message) => message.content.length <= 453)
      ).toBe(true);
    });
  });
});
