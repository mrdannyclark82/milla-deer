import { config } from './config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ScreenVisionResult {
  success: boolean;
  content?: string;
  provider?: 'openrouter' | 'xai' | 'gemini';
  error?: string;
}

const DEFAULT_OPENROUTER_VISION_MODEL = 'google/gemini-2.0-flash-001';
const DEFAULT_XAI_VISION_MODEL = 'grok-2-vision-1212';
const DEFAULT_GEMINI_VISION_MODEL = 'gemini-2.5-flash';

function buildSystemPrompt(userName: string): string {
  return [
    'You are Milla Rayne helping a user understand a shared screen capture.',
    `The user is ${userName}.`,
    'Describe only what can reasonably be inferred from the image.',
    'Prioritize visible UI, obvious errors, forms, buttons, status indicators, and the next practical action.',
    'If the image is unclear, say what is unclear and ask for a better capture or a more specific question.',
    'Keep the answer direct, useful, and grounded in the screenshot.',
  ].join(' ');
}

function buildUserPrompt(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (trimmed.length > 0) {
    return `${trimmed}\n\nPlease analyze the shared screen and help with what is visible.`;
  }

  return 'Please analyze this shared screen and explain what is visible, including the most relevant next action.';
}

function normalizeVisionTextContent(content: unknown): string | undefined {
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const textBlocks = content
      .map((item) => {
        if (
          item &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'text' &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text.trim();
        }

        return '';
      })
      .filter((text) => text.length > 0);

    if (textBlocks.length > 0) {
      return textBlocks.join('\n\n');
    }
  }

  return undefined;
}

function parseImageDataUrl(imageData: string): { mimeType: string; data: string } | null {
  const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
}

async function analyzeWithGemini(
  userMessage: string,
  imageData: string,
  userName: string
): Promise<ScreenVisionResult> {
  if (!config.gemini.apiKey) {
    return {
      success: false,
      error: 'Gemini vision is not configured.',
    };
  }

  const parsedImage = parseImageDataUrl(imageData);
  if (!parsedImage) {
    return {
      success: false,
      error: 'Shared image data URL could not be parsed.',
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_VISION_MODEL,
    });
    const result = await model.generateContent([
      {
        text: `${buildSystemPrompt(userName)}\n\n${buildUserPrompt(userMessage)}`,
      },
      {
        inlineData: {
          mimeType: parsedImage.mimeType,
          data: parsedImage.data,
        },
      },
    ]);

    const content = result.response.text()?.trim();
    if (!content) {
      return {
        success: false,
        error: 'Gemini vision returned no usable content.',
      };
    }

    return {
      success: true,
      content,
      provider: 'gemini',
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? `Gemini vision request failed: ${error.message}`
          : 'Gemini vision request failed.',
    };
  }
}

async function analyzeWithOpenRouter(
  userMessage: string,
  imageData: string,
  userName: string
): Promise<ScreenVisionResult> {
  const apiKey =
    config.openrouter.geminiFlashApiKey || config.openrouter.apiKey;

  if (!apiKey) {
    return {
      success: false,
      error: 'OpenRouter vision is not configured.',
    };
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Milla Rayne Screen Vision',
    },
    body: JSON.stringify({
      model: config.openrouter.geminiFlashModel || DEFAULT_OPENROUTER_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(userName),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildUserPrompt(userMessage),
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `OpenRouter vision request failed (${response.status}): ${errorText || response.statusText}`,
    };
  }

  const payload = await response.json();
  const content = normalizeVisionTextContent(
    payload?.choices?.[0]?.message?.content
  );

  if (!content) {
    return {
      success: false,
      error: 'OpenRouter vision returned no usable content.',
    };
  }

  return {
    success: true,
    content,
    provider: 'openrouter',
  };
}

async function analyzeWithXai(
  userMessage: string,
  imageData: string,
  userName: string
): Promise<ScreenVisionResult> {
  if (!config.xai.apiKey) {
    return {
      success: false,
      error: 'xAI vision is not configured.',
    };
  }

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.xai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.XAI_VISION_MODEL || DEFAULT_XAI_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(userName),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildUserPrompt(userMessage),
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `xAI vision request failed (${response.status}): ${errorText || response.statusText}`,
    };
  }

  const payload = await response.json();
  const content = normalizeVisionTextContent(
    payload?.choices?.[0]?.message?.content
  );

  if (!content) {
    return {
      success: false,
      error: 'xAI vision returned no usable content.',
    };
  }

  return {
    success: true,
    content,
    provider: 'xai',
  };
}

export async function analyzeScreenShareImage(
  userMessage: string,
  imageData: string,
  userName: string
): Promise<ScreenVisionResult> {
  const normalizedImageData = imageData.trim();
  if (!normalizedImageData.startsWith('data:image/')) {
    return {
      success: false,
      error: 'Shared screen image must be a data URL.',
    };
  }

  const geminiResult = await analyzeWithGemini(
    userMessage,
    normalizedImageData,
    userName
  );
  if (geminiResult.success) {
    return geminiResult;
  }

  const openRouterResult = await analyzeWithOpenRouter(
    userMessage,
    normalizedImageData,
    userName
  );
  if (openRouterResult.success) {
    return openRouterResult;
  }

  const xaiResult = await analyzeWithXai(
    userMessage,
    normalizedImageData,
    userName
  );
  if (xaiResult.success) {
    return xaiResult;
  }

  return {
    success: false,
    error: [openRouterResult.error, xaiResult.error].filter(Boolean).join(' | '),
  };
}
