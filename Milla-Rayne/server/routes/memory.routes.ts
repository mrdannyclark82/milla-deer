import { Router, type Express, type Request } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { insertMessageSchema } from '@shared/schema';
import { validateSession } from '../authService';
import {
  searchKnowledge,
  updateMemories,
  searchMemoryCore,
  loadMemoryCore,
} from '../memoryService';
import {
  generateAIResponse,
  generateFollowUpMessages,
  shouldMillaRespond,
  generateProactiveRepositoryMessage,
} from '../services/chatOrchestrator.service';
import {
  trackUserActivity,
  generateProactiveMessage,
  checkMilestones,
  detectEnvironmentalContext,
  checkBreakReminders,
  checkPostBreakReachout,
} from '../proactiveService';
import { storeVisualMemory, getVisualMemories } from '../visualMemoryService';
import {
  trainRecognition,
  identifyPerson,
  getRecognitionInsights,
} from '../visualRecognitionService';
import { shouldSurfaceDailySuggestion } from '../dailySuggestionsService';
import { config } from '../config';
import { asyncHandler } from '../utils/routeHelpers';
import { syncReplycaSharedHistory } from '../replycaSocialBridgeService';

/**
 * Memory and Messaging Routes
 */
export function registerMemoryRoutes(app: Express) {
  const router = Router();

  const getSessionToken = (req: Request) => {
    const authHeader = req.get('authorization');
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      return token || undefined;
    }

    return req.cookies?.session_token;
  };

  const resolveUserId = async (sessionToken?: string) => {
    if (!sessionToken) return 'default-user';
    const sessionResult = await validateSession(sessionToken);
    if (sessionResult.valid && sessionResult.user?.id) {
      return sessionResult.user.id as string;
    }
    return 'default-user';
  };

  // Get all messages
  router.get(
    '/messages',
    asyncHandler(async (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const channel =
        typeof req.query.channel === 'string' ? req.query.channel.trim() : '';
      try {
        await syncReplycaSharedHistory();
      } catch (error) {
        console.warn('ReplycA social sync skipped during message fetch:', error);
      }
      const userId = await resolveUserId(getSessionToken(req));
      // Use getRecentMessages to avoid full-table decryption — only fetch what we need
      const messages = await storage.getRecentMessages(userId, limit, channel || undefined);

      if (messages && messages.length > 0) {
        return res.json(messages);
      }

      try {
        const memoryCore = await loadMemoryCore();
        if (memoryCore && memoryCore.entries && memoryCore.entries.length > 0) {
          const mapped = memoryCore.entries.slice(-limit).map((entry) => ({
            id: entry.id,
            content: entry.content,
            role: entry.speaker === 'milla' ? 'assistant' : 'user',
            timestamp: entry.timestamp,
          }));
          return res.json(mapped);
        }
      } catch (e) {}

      res.json([]);
    })
  );

  // Create a new message
  router.post(
    '/messages',
    asyncHandler(async (req, res) => {
      const {
        conversationHistory,
        userName: rawUserName,
        imageData,
        ...messageData
      } = req.body;
      const userName =
        typeof rawUserName === 'string' && rawUserName.length <= 128
          ? rawUserName
          : 'Danny Ray';

      const validatedData = insertMessageSchema.parse(messageData);
      const resolvedUserId =
        validatedData.userId || (await resolveUserId(getSessionToken(req)));
      const message = await storage.createMessage({
        ...validatedData,
        channel: validatedData.channel || 'web',
        sourcePlatform: validatedData.sourcePlatform || 'milla-hub',
        userId: resolvedUserId,
      });

      if (message.role === 'user') {
        await trackUserActivity();

        // Daily suggestions
        const shouldSurface = await shouldSurfaceDailySuggestion(
          message.content,
          conversationHistory
        );
        let dailySuggestionMessage = null;
        if (shouldSurface) {
          const { getOrCreateTodaySuggestion, markSuggestionDelivered } =
            await import('../dailySuggestionsService');
          const suggestion = await getOrCreateTodaySuggestion();
          if (suggestion && !suggestion.isDelivered) {
            dailySuggestionMessage = await storage.createMessage({
              content: `*shares a quick thought*

${suggestion.suggestionText}`,
              role: 'assistant',
              userId: message.userId,
              channel: message.channel || 'web',
              sourcePlatform: 'milla-hub',
            });
            await markSuggestionDelivered(suggestion.date);
          }
        }

        // Proactive repo message
        let proactiveRepoMessage = null;
        if (config.enableProactiveMessages) {
          const repoMessage = await generateProactiveRepositoryMessage();
          if (repoMessage) {
            proactiveRepoMessage = await storage.createMessage({
              content: repoMessage,
              role: 'assistant',
              userId: message.userId,
              channel: message.channel || 'web',
              sourcePlatform: 'milla-hub',
            });
          }
        }

        // Decision to respond
        const decision = await shouldMillaRespond(
          message.content,
          conversationHistory,
          userName
        );
        if (decision.shouldRespond) {
          const aiResponse = await generateAIResponse(
            message.content,
            conversationHistory,
            userName,
            imageData,
            message.userId || 'default-user'
          );
          const aiMessage = await storage.createMessage({
            content: aiResponse.content,
            role: 'assistant',
            userId: message.userId,
            channel: message.channel || 'web',
            sourcePlatform: 'milla-hub',
          });

          const followUp = await generateFollowUpMessages(
            aiResponse.content,
            message.content,
            conversationHistory,
            userName
          );
          const storedFollowUps = [];
          for (const content of followUp) {
            storedFollowUps.push(
              await storage.createMessage({
                content,
                role: 'assistant',
                userId: message.userId,
                channel: message.channel || 'web',
                sourcePlatform: 'milla-hub',
              })
            );
          }

          res.json({
            userMessage: message,
            aiMessage,
            followUpMessages: storedFollowUps,
            dailySuggestion: dailySuggestionMessage,
            proactiveRepoMessage,
            reasoning: aiResponse.reasoning,
          });
        } else {
          res.json({ userMessage: message, aiMessage: null });
        }
      } else {
        res.json({ message });
      }
    })
  );

  // Memory management
  router.get(
    '/memory',
    asyncHandler(async (req, res) => {
      const userId = (req as any).session?.userId || 'default-user';
      const messages = await storage.getMessages(userId);
      const content = messages
        .map(
          (msg) =>
            `[${msg.timestamp.toISOString()}] ${msg.role}: ${msg.content}`
        )
        .join('\n');
      res.json({ content, success: true });
    })
  );

  router.post(
    '/memory',
    asyncHandler(async (req, res) => {
      const { memory } = req.body;
      if (!memory)
        return res.status(400).json({ message: 'Memory content is required' });
      const result = await updateMemories(memory);
      res.json(result);
    })
  );

  router.get(
    '/memory-core',
    asyncHandler(async (req, res) => {
      const query = req.query.q as string;
      if (query) {
        const results = await searchMemoryCore(query, 10);
        res.json({ results, success: true, query });
      } else {
        const memoryCore = await loadMemoryCore();
        res.json(memoryCore);
      }
    })
  );

  router.get(
    '/knowledge',
    asyncHandler(async (req, res) => {
      const data = await searchKnowledge((req.query.q as string) || '');
      res.json({ items: data, success: true });
    })
  );

  // Visual memory
  router.get(
    '/visual-memory',
    asyncHandler(async (req, res) => {
      const memories = await getVisualMemories();
      res.json(memories);
    })
  );

  router.post(
    '/analyze-emotion',
    asyncHandler(async (req, res) => {
      const { imageData, timestamp } = req.body;
      const emotions = [
        'happy',
        'focused',
        'curious',
        'thoughtful',
        'relaxed',
        'engaged',
      ];
      const detectedEmotion =
        emotions[Math.floor(Math.random() * emotions.length)];

      await storeVisualMemory(imageData, detectedEmotion, timestamp);
      await trainRecognition(imageData, detectedEmotion);
      const identity = await identifyPerson(imageData);

      res.json({
        emotion: detectedEmotion,
        confidence: 0.8,
        timestamp,
        identity,
      });
    })
  );

  // Proactive engagement
  router.get(
    '/proactive-message',
    asyncHandler(async (req, res) => {
      const message = await generateProactiveMessage();
      const milestone = await checkMilestones();
      const environmental = detectEnvironmentalContext();
      const recognition = await getRecognitionInsights();
      const breakReminder = await checkBreakReminders();
      const postBreakReachout = await checkPostBreakReachout();

      res.json({
        message,
        milestone,
        environmental,
        recognition,
        breakReminder: breakReminder.shouldRemind
          ? breakReminder.message
          : null,
        postBreakReachout: postBreakReachout.shouldReachout
          ? postBreakReachout.message
          : null,
        timestamp: Date.now(),
      });
    })
  );

  // Mount routes
  app.use('/api', router);
}
