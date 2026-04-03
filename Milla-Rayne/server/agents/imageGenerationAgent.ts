import { BaseAgent } from './base';
import { config } from '../config';
import { InferenceClient } from '@huggingface/inference';

class ImageGenerationAgent extends BaseAgent {
  private hf: InferenceClient | null;

  constructor() {
    super('image', 'An agent that can generate images from a text prompt.');
    this.hf = config.huggingface.apiKey
      ? new InferenceClient(config.huggingface.apiKey)
      : null;
  }

  protected async executeInternal(task: string): Promise<string> {
    this.log(`ImageGenerationAgent received task: ${task}`);
    try {
      if (!this.hf) {
        return 'I was unable to generate the image because Hugging Face is not configured.';
      }
      const response = await this.hf.textToImage({
        model: config.huggingface.model || 'stabilityai/stable-diffusion-2-1',
        inputs: task,
      });
      // The response is a Blob, we need to convert it to a data URL
      if (typeof response === 'string') {
        // Some HF clients return a string (already a URL or base64) — return as-is
        return response;
      }

      if (response && typeof (response as any).arrayBuffer === 'function') {
        const arrayBuffer = await (response as any).arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        return dataUrl;
      }

      // Fallback: stringify response
      return String(response);
    } catch (error) {
      console.error('Error generating image:', error);
      return 'I was unable to generate the image.';
    }
  }
}

export const imageGenerationAgent = new ImageGenerationAgent();
