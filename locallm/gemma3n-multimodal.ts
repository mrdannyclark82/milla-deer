import { LlmInference } from '@mediapipe/tasks-genai';

export const gemma3nInfer = async (prompt: string, image?: Uint8Array, audio?: Blob) => {
  const llm = await LlmInference.createFromOptions({
    modelPath: 'models/gemma-3n-E2B-it-int4.task',
    options: { maxTokens: 512, npu: true, multimodal: true }
  });
  return await llm.generateResponse(prompt, { image, audio });
};