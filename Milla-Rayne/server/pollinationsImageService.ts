/**
 * Pollinations.AI Image Generation Service
 * Free, unlimited image generation without API keys
 * https://pollinations.ai/
 */

export interface PollinationsImageResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

const POLLINATIONS_TIMEOUT_MS = 25000;

function sanitizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim();
}

async function requestPollinationsImage(
  prompt: string,
  options: {
    width: number;
    height: number;
    seed?: number;
    model: 'flux' | 'flux-realism' | 'flux-anime' | 'flux-3d' | 'turbo';
    nologo: boolean;
    private: boolean;
  }
): Promise<PollinationsImageResult> {
  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams();
  params.set('width', options.width.toString());
  params.set('height', options.height.toString());
  params.set('model', options.model);
  if (options.nologo) params.set('nologo', 'true');
  if (options.private) params.set('private', 'true');
  if (options.seed) params.set('seed', options.seed.toString());

  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`;

  console.log('[Pollinations.AI] Generating image:', imageUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), POLLINATIONS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        Accept: 'image/*,application/json;q=0.9,text/plain;q=0.8',
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: `Pollinations timed out after ${POLLINATIONS_TIMEOUT_MS / 1000}s.`,
      };
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get('content-type') || '';

  if (response.ok && contentType.startsWith('image/')) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    return {
      success: true,
      imageUrl: `data:${contentType};base64,${base64Image}`,
    };
  }

  const errorText = await response.text();
  let parsedError = errorText;

  try {
    const errorJson = JSON.parse(errorText);
    parsedError = errorJson.message || errorJson.error || errorText;
  } catch {
    // Keep raw text when response is not JSON.
  }

  return {
    success: false,
    error: `Pollinations returned ${response.status} ${contentType || 'unknown content'}: ${parsedError}`.trim(),
  };
}

/**
 * Generate an image using Pollinations.AI
 * This service is completely free and requires no API key
 * @param prompt - Text description of the image to generate
 * @param options - Optional generation parameters
 * @returns PollinationsImageResult with image URL or error
 */
export async function generateImageWithPollinations(
  prompt: string,
  options: {
    width?: number;
    height?: number;
    seed?: number;
    model?: 'flux' | 'flux-realism' | 'flux-anime' | 'flux-3d' | 'turbo';
    nologo?: boolean;
    private?: boolean;
  } = {}
): Promise<PollinationsImageResult> {
  try {
    const {
      width = 1024,
      height = 1024,
      model = 'flux',
      nologo = true,
      private: isPrivate = true,
      seed,
    } = options;
    const cleanedPrompt = sanitizePrompt(prompt);
    if (!cleanedPrompt) {
      return {
        success: false,
        error: 'Prompt is empty after sanitization.',
      };
    }

    const primaryAttempt = await requestPollinationsImage(cleanedPrompt, {
      width,
      height,
      model,
      nologo,
      private: isPrivate,
      seed,
    });

    if (primaryAttempt.success || model === 'flux') {
      return primaryAttempt;
    }

    console.warn(
      `[Pollinations.AI] ${model} failed, retrying with flux:`,
      primaryAttempt.error
    );

    return await requestPollinationsImage(cleanedPrompt, {
      width,
      height,
      model: 'flux',
      nologo,
      private: isPrivate,
      seed,
    });
  } catch (error) {
    console.error('[Pollinations.AI] Error:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during image generation',
    };
  }
}

/**
 * Format the image generation response with Milla's personality
 */
export function formatPollinationsImageResponse(
  prompt: string,
  success: boolean,
  imageUrl?: string,
  error?: string
): string {
  if (success && imageUrl) {
    return `🎨 I've created an image based on your prompt: "${prompt}"\n\n![Generated Image](${imageUrl})\n\nThe image has been generated, babe. If you'd like me to create a variation or adjust anything, just let me know!`;
  } else {
    return `I'd love to create an image of "${prompt}" for you, but something went wrong. ${error ? `Error: ${error}` : 'However, I can help you brainstorm ideas or describe what the image might look like! What would you like to explore instead?'}`;
  }
}
