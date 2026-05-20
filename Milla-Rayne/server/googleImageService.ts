import { GoogleGenAI } from '@google/genai';
import { config } from './config';

export interface GoogleImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export async function generateImageWithGoogle(
  prompt: string,
  options: { aspectRatio?: string; numberOfImages?: number } = {}
): Promise<GoogleImageGenerationResult> {
  if (!config.google.genAiApiKey) {
    return {
      success: false,
      error:
        'Google image generation is not configured. Set GOOGLE_API_KEY or GEMINI_API_KEY.',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: config.google.genAiApiKey });
    const response = await ai.models.generateImages({
      model: config.google.imageModel,
      prompt,
      config: {
        numberOfImages: options.numberOfImages || 1,
        aspectRatio: options.aspectRatio || '1:1',
      },
    });

    const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) {
      return {
        success: false,
        error:
          'Google image generation did not return image bytes for this prompt.',
      };
    }

    return {
      success: true,
      imageUrl: `data:image/png;base64,${imageBytes}`,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during Google image generation.',
    };
  }
}
