import { Ollama } from 'ollama';
import { config } from './config';

const DEFAULT_MODEL = 'gemma3:1b'; // Smallest Gemma model (815MB)

interface LocalModelResponse {
  content: string;
  success: boolean;
  usedLocal: boolean;
}

export interface LocalModelRuntimeStatus {
  enabled: boolean;
  preferLocal: boolean;
  configured: boolean;
  host: string;
  requestedModel: string;
  available: boolean;
  activeModel: string | null;
}

/**
 * Offline Model Service
 * Handles interaction with local LLMs via Ollama.
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. Install Ollama:
 *    macOS: https://ollama.com/download/Ollama.dmg
 *    Windows: https://ollama.com/download/OllamaSetup.exe
 *    Linux: curl -fsSL https://ollama.com/install.sh | sh
 *
 * 2. Download a model (pick one based on your RAM):
 *    Small (815MB, 1GB RAM):  ollama pull gemma3:1b
 *    Medium (3.3GB, 8GB RAM): ollama pull gemma3
 *    Large (8.1GB, 16GB RAM): ollama pull gemma3:12b
 *
 * 3. Start Ollama (usually starts automatically):
 *    ollama serve
 *
 * 4. Enable in Milla-Rayne:
 *    Edit .env: ENABLE_LOCAL_MODEL=true
 *               OLLAMA_CHAT_MODEL=gemma3:1b
 *               PREFER_LOCAL_MODEL=true  (optional local-first mode)
 *
 * That's it! Ollama can run either as your local-first model or as the final fallback.
 */
export class OfflineModelService {
  private isModelAvailable: boolean = false;
  private ollama: Ollama | null = null;
  private availableModel: string | null = null;
  private readonly ollamaHost = config.localModel?.host || 'http://localhost:11434';
  private readonly preferredModel =
    config.localModel?.model || DEFAULT_MODEL;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      console.log('[OfflineModel] 🔍 Checking for Ollama...');

      // Initialize Ollama client
      this.ollama = new Ollama({ host: this.ollamaHost });

      // Check if Ollama is running and get available models
      try {
        const models = await this.ollama.list();

        if (models.models && models.models.length > 0) {
          const configuredModel = models.models.find(
            (model) => model.name === this.preferredModel
          );
          const gemmaModel = models.models.find((m) =>
            m.name.includes('gemma')
          );
          const anyModel = models.models[0];

          this.availableModel = (
            configuredModel ||
            gemmaModel ||
            anyModel
          ).name;
          this.isModelAvailable = true;

          console.log(`[OfflineModel] ✅ Ollama is running!`);
          console.log(`[OfflineModel] 🌐 Host: ${this.ollamaHost}`);
          console.log(
            `[OfflineModel] 📦 Available models: ${models.models.length}`
          );
          console.log(`[OfflineModel] 🤖 Using model: ${this.availableModel}`);
          console.log(
            `[OfflineModel] 🔒 Local inference enabled - chats are private!`
          );
          return;
        }

        // Ollama is running but no models installed
        console.log('[OfflineModel] ⚠️  Ollama is running but no models found');
        console.log('[OfflineModel] 📥 Download a model:');
        console.log('[OfflineModel]    ollama pull gemma3:1b  (small, 815MB)');
        console.log('[OfflineModel]    ollama pull gemma3     (medium, 3.3GB)');
        console.log(
          '[OfflineModel]    ollama pull llama3.2:1b (alternative, 1.3GB)'
        );
        this.isModelAvailable = false;
      } catch (apiError: any) {
        // Ollama is not running
        console.log('[OfflineModel] ⚠️  Ollama is not running');
        console.log('[OfflineModel]');
        console.log('[OfflineModel] 🚀 Quick Setup:');
        console.log('[OfflineModel]');
        console.log('[OfflineModel] 1. Install Ollama:');
        console.log(
          '[OfflineModel]    • macOS:   https://ollama.com/download/Ollama.dmg'
        );
        console.log(
          '[OfflineModel]    • Windows: https://ollama.com/download/OllamaSetup.exe'
        );
        console.log(
          '[OfflineModel]    • Linux:   curl -fsSL https://ollama.com/install.sh | sh'
        );
        console.log('[OfflineModel]');
        console.log('[OfflineModel] 2. Download a model:');
        console.log(
          `[OfflineModel]    ollama pull ${this.preferredModel || DEFAULT_MODEL}`
        );
        console.log('[OfflineModel]');
        console.log('[OfflineModel] 3. Restart Milla-Rayne');
        console.log('[OfflineModel]');
        console.log('[OfflineModel] 💡 Benefits:');
        console.log(
          '[OfflineModel]    • Complete privacy - no data sent to cloud'
        );
        console.log('[OfflineModel]    • No API costs');
        console.log('[OfflineModel]    • Works offline');
        console.log('[OfflineModel]    • Fast responses');
        console.log('[OfflineModel]');
        console.log('[OfflineModel] For now, will use cloud AI services');
        this.isModelAvailable = false;
      }
    } catch (error) {
      console.log(
        '[OfflineModel] ❌ Error initializing:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.isModelAvailable = false;
    }
  }

  public async refreshStatus(): Promise<LocalModelRuntimeStatus> {
    await this.initialize();
    return this.getRuntimeStatus();
  }

  public getRuntimeStatus(): LocalModelRuntimeStatus {
    return {
      enabled: Boolean(config.localModel?.enabled),
      preferLocal: Boolean(config.localModel?.preferLocal),
      configured: Boolean(this.ollamaHost && this.preferredModel),
      host: this.ollamaHost,
      requestedModel: this.preferredModel,
      available: this.isModelAvailable,
      activeModel: this.availableModel,
    };
  }

  /**
   * Generate response using Ollama local model
   */
  public async generateResponse(
    prompt: string,
    systemContext: string = ''
  ): Promise<LocalModelResponse> {
    if (!this.isModelAvailable || !this.ollama || !this.availableModel) {
      return { content: '', success: false, usedLocal: false };
    }

    try {
      console.log(
        `[OfflineModel] 🤖 Generating response with ${this.availableModel}...`
      );

      const startTime = Date.now();

      // Generate response using Ollama
      const response = await this.ollama.generate({
        model: this.availableModel,
        prompt: systemContext
          ? `${systemContext}\n\nUser: ${prompt}\n\nAssistant:`
          : prompt,
        stream: false,
        options: {
          temperature: 0.8,
          top_k: 40,
          top_p: 0.9,
          num_predict: 512, // Max tokens to generate
        },
      });

      const duration = Date.now() - startTime;

      if (!response.response || response.response.trim().length === 0) {
        console.log('[OfflineModel] ⚠️  Empty response from model');
        return { content: '', success: false, usedLocal: true };
      }

      console.log(`[OfflineModel] ✅ Response generated in ${duration}ms`);
      return {
        content: response.response.trim(),
        success: true,
        usedLocal: true,
      };
    } catch (error) {
      console.error('[OfflineModel] ❌ Inference error:', error);
      return { content: '', success: false, usedLocal: true };
    }
  }

  /**
   * Check if local model is available
   */
  public isAvailable(): boolean {
    return this.isModelAvailable;
  }

  /**
   * Get information about the current model
   */
  public getModelInfo(): { name: string; available: boolean } | null {
    if (!this.isModelAvailable || !this.availableModel) {
      return null;
    }
    return {
      name: this.availableModel,
      available: true,
    };
  }

  /**
   * Clean up resources
   */
  public async dispose() {
    this.ollama = null;
    this.isModelAvailable = false;
    console.log('[OfflineModel] Service disposed');
  }
}

export const offlineService = new OfflineModelService();
