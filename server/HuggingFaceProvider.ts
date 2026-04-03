import { AIProvider, ProviderConfig, GenerationResponse } from './types';

export class HuggingFaceProvider implements AIProvider {
  name = 'huggingface';
  id = 'hf-inference';
  
  private apiKey: string;
  private baseUrl = 'https://api-inference.huggingface.co/models';
  private defaultModel = 'mistralai/Mistral-7B-Instruct-v0.3';

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey || process.env.HF_API_TOKEN || '';
  }

  async generate(
    prompt: string,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
    } = {}
  ): Promise<GenerationResponse> {
    const model = options.model || this.defaultModel;
    
    try {
      // Format for chat/instruction models
      const formattedPrompt = options.systemPrompt 
        ? `<s>[INST] ${options.systemPrompt}\n\n${prompt} [/INST]`
        : `<s>[INST] ${prompt} [/INST]`;

      const response = await axios.post(
        `${this.baseUrl}/${model}`,
        {
          inputs: formattedPrompt,
          parameters: {
            max_new_tokens: options.maxTokens || 1024,
            temperature: options.temperature || 0.7,
            do_sample: true,
            return_full_text: false
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Handle direct output or array
      const result = Array.isArray(response.data) 
        ? response.data[0]
        : response.data;

      return {
        content: result.generated_text?.trim() || result[0]?.generated_text?.trim(),
        model: model,
        usage: {
          estimatedTokens: Math.ceil(prompt.length / 4) + Math.ceil(result.length / 4)
        },
        provider: this.id
     
