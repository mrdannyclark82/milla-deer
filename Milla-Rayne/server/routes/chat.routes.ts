import { Router, type Express, type Request } from 'express';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { config } from '../config';
import {
  validateSession,
  getUserAIModel,
  updateUserAIModel,
} from '../authService';
import {
  CANONICAL_AI_MODELS,
  DEFAULT_CHAT_MODEL,
  isSupportedAIModel,
  normalizeAIModel,
} from '../aiModelPreferences';
import {
  generateAIResponse,
  validateAndSanitizePrompt,
} from '../services/chatOrchestrator.service';
import { appendToSharedChat } from '../replycaSocialBridgeService';
import { analyzeVoiceInput } from '../voiceAnalysisService';
import { getSmartHomeSensorData } from '../smartHomeService';
import { detectSceneContext } from '../sceneDetectionService';
import { sceneService } from '../services/scene.service';
import { upload } from '../middleware/upload.middleware';
import { asyncHandler } from '../utils/routeHelpers';
import { storage } from '../storage';
import {
  CONTEXT_WINDOW_SETTINGS,
  boundConversationHistory,
} from '../contextWindowService';

async function resolveChatUserId(sessionToken?: string): Promise<string> {
  if (!sessionToken) {
    return 'default-user';
  }

  const sessionResult = await validateSession(sessionToken);
  if (sessionResult.valid && sessionResult.user?.id) {
    return sessionResult.user.id;
  }

  return 'default-user';
}

function getSessionToken(req: Request): string | undefined {
  const authHeader = req.get('authorization');
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return token || undefined;
  }

  return req.cookies.session_token;
}

async function getRecentConversationHistory(
  userId: string,
  channel: string = 'web'
) {
  const messages = await storage.getRecentMessages(
    userId,
    CONTEXT_WINDOW_SETTINGS.routeHistoryMaxMessages * 2,
    channel
  );

  return boundConversationHistory(
    messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      maxMessages: CONTEXT_WINDOW_SETTINGS.routeHistoryMaxMessages,
      maxChars: CONTEXT_WINDOW_SETTINGS.routeHistoryMaxChars,
      stage: 'route-history',
    }
  );
}

async function persistConversationTurn(
  userId: string,
  userMessage: string,
  assistantMessage: string,
  channel: 'web' | 'gmail' | 'telegram' | 'api' | 'system' | 'mobile' = 'web'
) {
  await Promise.all([
    storage.createMessage({
      userId,
      role: 'user',
      content: userMessage,
      displayRole: 'Danny Ray',
      channel,
      sourcePlatform: 'milla-hub',
    }),
    storage.createMessage({
      userId,
      role: 'assistant',
      content: assistantMessage,
      displayRole: 'Milla Rayne',
      channel,
      sourcePlatform: 'milla-hub',
    }),
  ]);

  // Outbound sync to ReplycA shared_chat.jsonl (fire-and-forget)
  appendToSharedChat('user', userMessage, channel).catch(() => {});
  appendToSharedChat('assistant', assistantMessage, channel).catch(() => {});
}

/**
 * Chat and AI Routes
 */
export function registerChatRoutes(app: Express) {
  const router = Router();

  // Get current AI model preference
  router.get(
    '/ai-model/current',
    asyncHandler(async (req, res) => {
      const sessionToken = getSessionToken(req);

      if (!sessionToken) {
        return res.json({ success: true, model: DEFAULT_CHAT_MODEL });
      }

      const sessionResult = await validateSession(sessionToken);
      if (!sessionResult.valid || !sessionResult.user) {
        return res.json({ success: true, model: DEFAULT_CHAT_MODEL });
      }

      const result = await getUserAIModel(sessionResult.user.id as string);
      res.json(result);
    })
  );

  // Set AI model preference
  router.post(
    '/ai-model/set',
    asyncHandler(async (req, res) => {
      const { model } = req.body;
      const sessionToken = getSessionToken(req);

      if (!model) {
        return res
          .status(400)
          .json({ success: false, error: 'Model is required' });
      }

      if (!isSupportedAIModel(model)) {
        return res.status(400).json({
          success: false,
          error: `Invalid model. Must be one of: ${CANONICAL_AI_MODELS.join(', ')}`,
        });
      }

      const normalizedModel = normalizeAIModel(model) || DEFAULT_CHAT_MODEL;

      if (!sessionToken) {
        return res.json({ success: true, model: normalizedModel });
      }

      const sessionResult = await validateSession(sessionToken);
      if (!sessionResult.valid || !sessionResult.user) {
        return res.json({ success: true, model: normalizedModel });
      }

      const result = await updateUserAIModel(
        sessionResult.user.id as string,
        normalizedModel
      );
      res.json({ ...result, model: normalizedModel });
    })
  );

  // Chat/Audio endpoint
  router.post(
    '/chat/audio',
    upload.single('audio'),
    asyncHandler(async (req, res) => {
      const shouldStubAudio = process.env.ENABLE_AUDIO_STUB !== 'false';

      if (shouldStubAudio) {
        return res.status(200).json({
          success: true,
          response: 'This is a test AI response',
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      const audioFile = fs.createReadStream(req.file.path);
      const formData = new FormData();
      formData.append('file', audioFile, {
        filename: req.file.filename,
        contentType: req.file.mimetype,
      });
      formData.append('model', 'whisper-1');

      const response = await fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.openai.apiKey}`,
            ...formData.getHeaders(),
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Whisper API error: ${response.statusText}`);
      }

      const data: any = await response.json();
      const imageData =
        typeof req.body?.imageData === 'string'
          ? req.body.imageData
          : undefined;
      const userId = await resolveChatUserId(getSessionToken(req));
      const conversationHistory = await getRecentConversationHistory(
        userId,
        'web'
      );
      const aiResponse = await generateAIResponse(
        data.text,
        conversationHistory,
        'Danny Ray',
        imageData,
        userId,
        undefined,
        false,
        { canRunShellCommands: true }
      );

      await persistConversationTurn(
        userId,
        data.text,
        aiResponse.content,
        'web'
      );

      res.json({
        response: aiResponse.content,
        success: true,
      });
    })
  );

  // Chat endpoint
  router.post(
    '/chat',
    asyncHandler(async (req, res) => {
      let { message } = req.body;
      const { audioData, audioMimeType, imageData } = req.body;
      let userEmotionalState: any;

      if (audioData && audioMimeType) {
        const audioBuffer = Buffer.from(audioData, 'base64');
        const voiceAnalysis = await analyzeVoiceInput(
          audioBuffer,
          audioMimeType
        );

        if (voiceAnalysis.success) {
          message = voiceAnalysis.text;
          userEmotionalState = voiceAnalysis.emotionalTone;
        } else {
          return res.status(500).json({ error: voiceAnalysis.error });
        }
      }

      if (
        !message ||
        typeof message !== 'string' ||
        message.trim().length === 0
      ) {
        return res.status(400).json({ error: 'Message is required' });
      }

      message = validateAndSanitizePrompt(message);

      const userId = await resolveChatUserId(getSessionToken(req));

      const bypassFunctionCalls = message.trim().startsWith('##');
      const processedMessage = bypassFunctionCalls
        ? message.trim().substring(2).trim()
        : message;
      const [conversationHistory, sensorData] = await Promise.all([
        getRecentConversationHistory(userId, 'web'),
        getSmartHomeSensorData(),
      ]);

      // Handle Scene Context
      const sceneContext = detectSceneContext(
        processedMessage,
        sceneService.getLocation() as any,
        sensorData || undefined
      );

      if (sceneContext.hasSceneChange) {
        sceneService.updateScene(
          sceneContext.location as any,
          sceneContext.mood
        );
      }

      // Generate AI Response
      const aiResponse = await generateAIResponse(
        processedMessage,
        conversationHistory,
        'Danny Ray',
        imageData,
        userId,
        userEmotionalState,
        bypassFunctionCalls,
        { canRunShellCommands: true }
      );

      await persistConversationTurn(
        userId,
        processedMessage,
        aiResponse.content,
        'web'
      );

      res.json({
        response: aiResponse.content,
        ...aiResponse, // Include imageUrl, youtube_play, etc.
        sceneContext: sceneService.getSceneContext(),
      });
    })
  );

  // Mount routes
  app.use('/api', router);
}
