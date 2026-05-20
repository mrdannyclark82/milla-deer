import { generateImage, formatImageResponse } from './imageService';
import { storage } from './storage';

export function queueBackgroundImageGeneration(
  userId: string,
  prompt: string
): void {
  void (async () => {
    try {
      const imageResult = await generateImage(prompt);
      await storage.createMessage({
        userId,
        role: 'assistant',
        content: formatImageResponse(
          prompt,
          imageResult.success,
          imageResult.imageUrl,
          imageResult.error
        ),
        displayRole: 'Milla Rayne',
      });
    } catch (error) {
      await storage.createMessage({
        userId,
        role: 'assistant',
        content: `I tried to generate "${prompt}" in the background, but it failed. ${error instanceof Error ? error.message : 'Unknown error.'}`,
        displayRole: 'Milla Rayne',
      });
    }
  })();
}
