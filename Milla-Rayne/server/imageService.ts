import nodeFetch from 'node-fetch';
import { InferenceClient } from '@huggingface/inference';
import { getHuggingFaceMCPService } from './huggingfaceMcpService.ts';
import { config } from './config';
import { generateImageWithGoogle } from './googleImageService';
import { generateImageWithVenice } from './veniceImageService';
import { generateImageWithPollinations } from './pollinationsImageService';
globalThis.fetch = nodeFetch as unknown as typeof fetch;

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export function isLikelyUnsupportedHuggingFaceImageModel(model: string): boolean {
  return /(lora|adapter)\b/i.test(model);
}

function isHuggingFaceAuthError(error?: string): boolean {
  if (!error) return false;

  return /invalid username or password|unauthorized|authentication|invalid token|401|403/i.test(
    error
  );
}

async function generateFallbackImage(
  prompt: string,
  reason?: string,
  attemptedGoogleResult?: ImageGenerationResult
): Promise<ImageGenerationResult> {
  const googleResult =
    attemptedGoogleResult ?? (await generateImageWithGoogle(prompt));
  if (googleResult.success) {
    return googleResult;
  }
  console.warn('Google image fallback failed:', googleResult.error);

  if (config.venice.apiKey) {
    const veniceResult = await generateImageWithVenice(prompt);
    if (veniceResult.success) {
      return veniceResult;
    }
    console.warn('Venice image fallback failed:', veniceResult.error);
  }

  const pollinationsResult = await generateImageWithPollinations(prompt, {
    width: 1024,
    height: 1024,
    model: 'flux',
  });

  if (pollinationsResult.success) {
    return pollinationsResult;
  }

  return {
    success: false,
    error:
      pollinationsResult.error ||
      reason ||
      'All configured image backends failed.',
  };
}

/**
 * Generate an image using Hugging Face Inference API with MCP integration
 * Model: philipp-zettl/UnfilteredAI-NSFW-gen-v2
 * @param prompt - Text description of the image to generate
 * @returns ImageGenerationResult with base64 encoded image or error
 */
export async function generateImage(
  prompt: string
): Promise<ImageGenerationResult> {
  const googleResult = await generateImageWithGoogle(prompt);
  if (googleResult.success) {
    return googleResult;
  }

  const huggingFaceApiKey = config.huggingface.apiKey;
  if (!huggingFaceApiKey) {
    return generateFallbackImage(
      prompt,
      googleResult.error ||
        'Hugging Face API key is not configured and no alternate backend succeeded.',
      googleResult
    );
  }

  // Try using MCP service first
  const mcpService = getHuggingFaceMCPService();
  if (mcpService) {
    try {
      const mcpResult = await mcpService.generateImage(prompt, {
        numInferenceSteps: 30,
        guidanceScale: 7.5,
      });

      if (mcpResult.success && mcpResult.imageUrl) {
        return {
          success: true,
          imageUrl: mcpResult.imageUrl,
        };
      }
      if (isHuggingFaceAuthError(mcpResult.error)) {
        return generateFallbackImage(
          prompt,
          'Hugging Face authentication failed and fallback backends were unavailable.',
          googleResult
        );
      }
      // If MCP fails, fall back to direct API
      console.warn(
        'MCP generation failed, falling back to direct API:',
        mcpResult.error
      );
    } catch (mcpError) {
      const errorMessage =
        mcpError instanceof Error ? mcpError.message : String(mcpError);
      if (isHuggingFaceAuthError(errorMessage)) {
        return generateFallbackImage(
          prompt,
          'Hugging Face authentication failed and fallback backends were unavailable.',
          googleResult
        );
      }
      console.warn('MCP service error, falling back to direct API:', mcpError);
    }
  }

  // Fallback to direct API implementation
  try {
    const model =
      config.huggingface.model || 'stabilityai/stable-diffusion-2-1';

    if (isLikelyUnsupportedHuggingFaceImageModel(model)) {
      return generateFallbackImage(
        prompt,
        `Hugging Face model "${model}" looks like a LoRA or adapter, not a standalone text-to-image inference model.`,
        googleResult
      );
    }

    const maxAttempts = 3;
    let lastError: string | undefined;
    const client = new InferenceClient(huggingFaceApiKey);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await client.textToImage({
          model,
          inputs: prompt,
          parameters: {
            num_inference_steps: 30,
            guidance_scale: 7.5,
          },
        });

        const imageBlob = response as unknown as Blob;
        const arrayBuffer = await imageBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const imageUrl = `data:image/png;base64,${buffer.toString('base64')}`;

        return { success: true, imageUrl };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (isHuggingFaceAuthError(lastError)) {
          return generateFallbackImage(
            prompt,
            'Hugging Face authentication failed and fallback backends were unavailable.',
            googleResult
          );
        }
        if (/loading/i.test(lastError)) {
          lastError = 'Model is currently loading. Please try again in a moment.';
        }
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    return generateFallbackImage(
      prompt,
      lastError || 'Failed to generate image with Hugging Face.',
      googleResult
    );
  } catch (error) {
    return generateFallbackImage(
      prompt,
      error instanceof Error
        ? error.message
        : 'Unknown error during image generation.',
      googleResult
    );
  }
}

export function extractImagePrompt(userMessage: string): string | null {
  const message = userMessage.toLowerCase();

  // Match patterns like "create an image of..." or "draw a picture of..."
  const patterns = [
    /create an image of\s+(.+)/i,
    /draw a picture of\s+(.+)/i,
    /generate an image of\s+(.+)/i,
    /make an image of\s+(.+)/i,
    /draw\s+(.+)/i,
    /create\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Format the image generation response with Milla's personality
 * @param prompt - The user's image prompt
 * @param success - Whether image generation succeeded
 * @param imageUrl - Base64 encoded image URL
 * @param error - Error message if generation failed
 * @returns Formatted response string
 */
export function formatImageResponse(
  prompt: string,
  success: boolean,
  imageUrl?: string,
  error?: string
): string {
  if (success && imageUrl) {
    return `🎨 I've created an image based on your prompt: "${prompt}"\n\n![Generated Image](${imageUrl})\n\nThe image has been generated and should match your description. If you'd like me to create a variation or adjust anything, just let me know!`;
  } else {
    return `I'd love to create an image of "${prompt}" for you, babe, but image generation isn't available right now. ${error ? `Error: ${error}` : 'However, I can help you brainstorm ideas, describe what the image might look like, or suggest other creative approaches! What would you like to explore instead?'}`;
  }
}
