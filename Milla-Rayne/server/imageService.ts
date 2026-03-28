import nodeFetch from 'node-fetch';
import { InferenceClient } from '@huggingface/inference';
import { getHuggingFaceMCPService } from './huggingfaceMcpService.ts';
import { config } from './config';
import { generateImageWithXAI } from './xaiImageService';
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
  reason?: string
): Promise<ImageGenerationResult> {
  if (config.venice.apiKey) {
    const veniceResult = await generateImageWithVenice(prompt);
    if (veniceResult.success) return veniceResult;
    console.warn('Venice image fallback failed:', veniceResult.error);
  }

  const pollinationsResult = await generateImageWithPollinations(prompt, {
    width: 1024,
    height: 1024,
    model: 'flux',
  });

  if (pollinationsResult.success) return pollinationsResult;

  return {
    success: false,
    error: pollinationsResult.error || reason || 'All configured image backends failed.',
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
  // 1. xAI Aurora (primary)
  if (process.env.XAI_API_KEY) {
    const xaiResult = await generateImageWithXAI(prompt);
    if (xaiResult.success) return xaiResult;
    console.warn('[imageService] xAI Aurora failed:', xaiResult.error);
  }

  // 2. HuggingFace (secondary)
  const huggingFaceApiKey = config.huggingface.apiKey;
  if (huggingFaceApiKey) {
    const mcpService = getHuggingFaceMCPService();
    if (mcpService) {
      try {
        const mcpResult = await mcpService.generateImage(prompt, {
          numInferenceSteps: 30,
          guidanceScale: 7.5,
        });
        if (mcpResult.success && mcpResult.imageUrl) return { success: true, imageUrl: mcpResult.imageUrl };
        if (isHuggingFaceAuthError(mcpResult.error)) return generateFallbackImage(prompt, 'HuggingFace auth failed.');
        console.warn('[imageService] MCP failed, trying direct HF:', mcpResult.error);
      } catch (mcpError) {
        const msg = mcpError instanceof Error ? mcpError.message : String(mcpError);
        if (isHuggingFaceAuthError(msg)) return generateFallbackImage(prompt, 'HuggingFace auth failed.');
        console.warn('[imageService] MCP error:', mcpError);
      }
    }

    const model = config.huggingface.model || 'stabilityai/stable-diffusion-2-1';
    if (!isLikelyUnsupportedHuggingFaceImageModel(model)) {
      const client = new InferenceClient(huggingFaceApiKey);
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await client.textToImage({
            model,
            inputs: prompt,
            parameters: { num_inference_steps: 30, guidance_scale: 7.5 },
          });
          const imageBlob = response as unknown as Blob;
          const buffer = Buffer.from(await imageBlob.arrayBuffer());
          return { success: true, imageUrl: `data:image/png;base64,${buffer.toString('base64')}` };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (isHuggingFaceAuthError(msg)) return generateFallbackImage(prompt, 'HuggingFace auth failed.');
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  // 3. Venice → Pollinations
  return generateFallbackImage(prompt, 'xAI and HuggingFace unavailable.');
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
