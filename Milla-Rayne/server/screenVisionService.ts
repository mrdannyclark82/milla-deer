import { config } from './config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { analyzeWithClip2 } from './vision/fg-clip2-bridge';

export interface ScreenVisionResult {
  success: boolean;
  content?: string;
  provider?: 'openrouter' | 'xai' | 'gemini';
  error?: string;
}

const DEFAULT_OPENROUTER_VISION_MODEL = 'google/gemini-2.0-flash-001';
const DEFAULT_XAI_VISION_MODEL = 'grok-2-vision-1212';
const DEFAULT_GEMINI_VISION_MODEL = 'gemini-2.5-flash';
const GEMINI_VISION_MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

// Multi-key rotation — ported from aetherboot-ai geminiService.ts
let currentGeminiKeyIndex = 0;

function getGeminiApiKeys(): string[] {
  const keys = [
    config.gemini.apiKey,
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter((k): k is string => typeof k === 'string' && k.trim().length > 0);
  return [...new Set(keys)];
}

function rotateGeminiKey(): void {
  const keys = getGeminiApiKeys();
  if (keys.length > 1) {
    currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % keys.length;
    console.log(`[screenVision] Rotated to Gemini key index ${currentGeminiKeyIndex}`);
  }
}

function isQuotaOrAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /401|403|429|quota|rate.?limit/i.test(error.message);
}

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

function parseImageDataUrl(
  imageData: string
): { mimeType: string; data: string } | null {
  const match = imageData.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/
  );
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
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
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

  const requestedModel = process.env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_VISION_MODEL;
  const models = [...new Set([requestedModel, ...GEMINI_VISION_MODEL_FALLBACKS])];
  const maxAttempts = models.length * keys.length;
  let lastError: string = 'Gemini vision request failed.';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = keys[currentGeminiKeyIndex % keys.length];
    const model = models[attempt % models.length];
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const generativeModel = genAI.getGenerativeModel({ model });
      const result = await generativeModel.generateContent([
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

      return { success: true, content, provider: 'gemini' };
    } catch (error) {
      lastError =
        error instanceof Error
          ? `Gemini vision request failed: ${error.message}`
          : 'Gemini vision request failed.';
      console.warn(`[screenVision] Gemini attempt ${attempt + 1}/${maxAttempts} failed (key=${currentGeminiKeyIndex}, model=${model}):`, lastError);
      if (isQuotaOrAuthError(error)) {
        rotateGeminiKey();
      }
    }
  }

  return { success: false, error: lastError };
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

  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Milla Rayne Screen Vision',
        },
        body: JSON.stringify({
          model:
            config.openrouter.geminiFlashModel || DEFAULT_OPENROUTER_VISION_MODEL,
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
      }
    );

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
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error
        ? `OpenRouter vision request failed: ${error.message}`
        : 'OpenRouter vision request failed.',
    };
  }
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

  try {
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
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error
        ? `xAI vision request failed: ${error.message}`
        : 'xAI vision request failed.',
    };
  }
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

  // FG-CLIP2 / Ollama VLM — fastest, zero cloud dependency
  const clip2Result = await analyzeWithClip2(userMessage, normalizedImageData, userName);
  if (clip2Result.success) {
    return clip2Result;
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
    error: [openRouterResult.error, xaiResult.error]
      .filter(Boolean)
      .join(' | '),
  };
}

// ── Pixel-level grounding via Qwen-2.5-VL (OpenRouter) ───────────────────────

export interface GroundingResult {
  success: boolean;
  description?: string;
  boxes?: Array<{
    label: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  error?: string;
}

const GROUNDING_MODEL = 'qwen/qwen-2.5-vl-72b-instruct';
const GROUNDING_MODEL_FALLBACK = 'qwen/qwen-2-vl-72b-instruct';

/**
 * Parses Qwen-2.5-VL bounding box tokens.
 * Format: <|box_start|>(x1,y1),(x2,y2)<|box_end|>
 * Coordinates are 0-1000 normalized — we return them as fractions (0-1).
 */
function parseGroundingBoxes(
  text: string,
  label: string
): Array<{ label: string; x1: number; y1: number; x2: number; y2: number }> {
  const boxes: Array<{
    label: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }> = [];
  const re = /\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*,\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    boxes.push({
      label,
      x1: parseInt(m[1]) / 1000,
      y1: parseInt(m[2]) / 1000,
      x2: parseInt(m[3]) / 1000,
      y2: parseInt(m[4]) / 1000,
    });
  }
  return boxes;
}

/**
 * Ground a natural-language query against a screenshot.
 * Returns pixel-level bounding boxes for the described element.
 * Uses Qwen-2.5-VL via OpenRouter (best open-source grounding model as of 2026).
 */
export async function groundElement(
  imageData: string,
  query: string
): Promise<GroundingResult> {
  const apiKey =
    config.openrouter?.geminiFlashApiKey || config.openrouter?.apiKey;
  if (!apiKey) {
    return { success: false, error: 'OpenRouter API key not configured.' };
  }

  const parsed = parseImageDataUrl(imageData);
  if (!parsed) {
    return { success: false, error: 'Invalid image data URL.' };
  }

  const groundingPrompt = `Locate: "${query}"\nReturn the bounding box coordinates in the format (x1,y1),(x2,y2) where values are 0-1000 normalized. Output ONLY the coordinates, nothing else.`;

  for (const model of [GROUNDING_MODEL, GROUNDING_MODEL_FALLBACK]) {
    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${parsed.mimeType};base64,${parsed.data}`,
                    },
                  },
                  { type: 'text', text: groundingPrompt },
                ],
              },
            ],
            max_tokens: 128,
          }),
        }
      );

      if (!response.ok) continue;

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const raw = normalizeVisionTextContent(
        json.choices?.[0]?.message?.content
      );
      if (!raw) continue;

      const boxes = parseGroundingBoxes(raw, query);
      return { success: true, description: raw, boxes };
    } catch {
      continue;
    }
  }

  return { success: false, error: 'Grounding failed on all models.' };
}
