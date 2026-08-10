/**
 * AIModelSelector - Easy AI Model Switching Component
 *
 * Allows users to easily swap between different AI models (MiniMax, Venice, DeepSeek, xAI)
 * Stores preference in backend and updates immediately
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Sparkles, Zap, Brain, Cpu, HardDrive } from 'lucide-react';

export type AIModel =
  'gemini' | 'minimax' | 'venice' | 'deepseek' | 'xai' | 'ollama-gemma';

interface AIModelOption {
  id: AIModel;
  name: string;
  description: string;
  icon: React.ReactNode;
  provider: string;
  features: string[];
}

const AI_MODELS: AIModelOption[] = [
  {
    id: 'gemini',
    name: 'Gemini Flash',
    description:
      'Google Gemini as the preferred chat provider for fast, balanced responses',
    icon: <Cpu className="w-5 h-5" />,
    provider: 'Google',
    features: ['Default provider', 'Fast responses', 'Strong general chat'],
  },
  {
    id: 'minimax',
    name: 'MiniMax M2',
    description: 'Fast, efficient, and free - great for everyday conversations',
    icon: <Zap className="w-5 h-5" />,
    provider: 'OpenRouter',
    features: ['Free tier', 'Fast responses', 'Good for general chat'],
  },
  {
    id: 'venice',
    name: 'Venice (Dolphin Mistral)',
    description: 'Privacy-focused and uncensored - respects your freedom',
    icon: <Brain className="w-5 h-5" />,
    provider: 'OpenRouter',
    features: ['Privacy-focused', 'Uncensored', 'Creative responses'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Chat',
    description: 'Advanced reasoning and analytical capabilities',
    icon: <Sparkles className="w-5 h-5" />,
    provider: 'OpenRouter',
    features: ['Strong reasoning', 'Detailed analysis', 'Technical tasks'],
  },
  {
    id: 'xai',
    name: 'Grok (xAI)',
    description: 'Cutting-edge AI with real-time knowledge',
    icon: <Bot className="w-5 h-5" />,
    provider: 'xAI',
    features: ['Real-time info', 'Innovative', 'Direct integration'],
  },
];

interface AIModelSelectorProps {
  currentModel?: AIModel;
  onModelChange?: (model: AIModel) => void;
}

export default function AIModelSelector({
  currentModel: externalModel,
  onModelChange,
}: AIModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState<AIModel>('gemini');
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [selectedLocalModel, setSelectedLocalModel] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Fetch current model preference on mount
  useEffect(() => {
    fetchCurrentModel();
    fetchLocalModels();
  }, []);

  // Update from external prop
  useEffect(() => {
    if (externalModel) {
      setSelectedModel(externalModel);
    }
  }, [externalModel]);

  const fetchCurrentModel = async () => {
    try {
      const response = await fetch('/api/ai-model/current');
      const data = await response.json();
      if (data.success && data.model) {
        setSelectedModel(data.model as AIModel);
      }
    } catch (error) {
      console.error('Error fetching current AI model:', error);
    }
  };

  const fetchLocalModels = async () => {
    try {
      const response = await fetch('/api/system/local-models');
      const data = await response.json();
      if (data.success && Array.isArray(data.models)) {
        setLocalModels(data.models);
        setSelectedLocalModel(
          typeof data.activeModel === 'string' ? data.activeModel : null
        );
      }
    } catch (error) {
      console.error('Error fetching local AI models:', error);
    }
  };

  const handleModelChange = async (model: AIModel) => {
    setIsLoading(true);
    setStatusMessage('');

    try {
      const response = await fetch('/api/ai-model/set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model }),
      });

      const data = await response.json();

      if (data.success) {
        setSelectedModel(model);
        setStatusMessage(
          `✓ Switched to ${AI_MODELS.find((m) => m.id === model)?.name}`
        );
        onModelChange?.(model);

        // Clear success message after 3 seconds
        setTimeout(() => setStatusMessage(''), 3000);
      } else {
        setStatusMessage(`✗ Failed to switch model: ${data.error}`);
      }
    } catch (error) {
      console.error('Error setting AI model:', error);
      setStatusMessage('✗ Connection error - please try again');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalModelChange = async (modelName: string) => {
    setIsLoading(true);
    setStatusMessage('');

    try {
      const response = await fetch('/api/system/local-models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to select the local model');
      }

      const preferenceResponse = await fetch('/api/ai-model/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'ollama-gemma' }),
      });
      const preferenceData = await preferenceResponse.json();
      if (!preferenceResponse.ok || !preferenceData.success) {
        throw new Error(
          preferenceData.error || 'Unable to make the local model active'
        );
      }

      setSelectedLocalModel(modelName);
      setSelectedModel('ollama-gemma');
      setStatusMessage(`Switched to local model: ${modelName}`);
      onModelChange?.('ollama-gemma');
      window.setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Connection error - please try again';
      console.error('Error selecting local AI model:', error);
      setStatusMessage(`Failed to switch local model: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-white/10 backdrop-blur-sm border border-white/20">
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center">
          <Bot className="w-5 h-5 mr-2 text-cyan-400" />
          AI Model Selection
        </CardTitle>
        <p className="text-xs text-white/60 mt-1">
          Choose which AI model powers Milla's responses
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status Message */}
        {statusMessage && (
          <div
            className={`text-sm p-2 rounded ${
              statusMessage.startsWith('✓') ||
              statusMessage.startsWith('Switched')
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}
          >
            {statusMessage}
          </div>
        )}

        {/* Model Options */}
        <div className="space-y-2">
          {AI_MODELS.map((model) => (
            <div
              key={model.id}
              className={`bg-white/5 p-3 rounded-lg border transition-all cursor-pointer ${
                selectedModel === model.id
                  ? 'border-cyan-400/50 bg-cyan-400/10'
                  : 'border-white/10 hover:border-white/30'
              }`}
              onClick={() => !isLoading && handleModelChange(model.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div
                    className={`p-2 rounded-lg ${
                      selectedModel === model.id
                        ? 'bg-cyan-400/20 text-cyan-300'
                        : 'bg-white/10 text-white/70'
                    }`}
                  >
                    {model.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-semibold text-white">
                        {model.name}
                      </h4>
                      {selectedModel === model.id && (
                        <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-400/50">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/60 mt-1">
                      {model.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {model.features.map((feature) => (
                        <span
                          key={feature}
                          className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-white/40 mt-1">
                      Provider: {model.provider}
                    </p>
                  </div>
                </div>
                {selectedModel === model.id && (
                  <i className="fas fa-check-circle text-cyan-400 ml-2"></i>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-white">Local models</h4>
              <p className="mt-1 text-xs text-white/60">
                Run privately through Ollama on this machine.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchLocalModels()}
              disabled={isLoading}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {localModels.length > 0 ? (
            localModels.map((modelName) => {
              const active =
                selectedModel === 'ollama-gemma' &&
                selectedLocalModel === modelName;
              return (
                <button
                  key={modelName}
                  type="button"
                  onClick={() => void handleLocalModelChange(modelName)}
                  disabled={isLoading}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                    active
                      ? 'border-cyan-400/50 bg-cyan-400/10'
                      : 'border-white/10 bg-white/5 hover:border-white/30'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span
                    className={`rounded-lg p-2 ${
                      active
                        ? 'bg-cyan-400/20 text-cyan-300'
                        : 'bg-white/10 text-white/70'
                    }`}
                  >
                    <HardDrive className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-white">
                      {modelName}
                    </span>
                    <span className="text-xs text-white/60">Ollama local</span>
                  </span>
                  {active ? (
                    <span className="rounded-full border border-cyan-400/50 bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-200">
                      Active
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 bg-black/10 p-3 text-xs text-white/55">
              No local models are available. Start Ollama and pull a model, then
              refresh.
            </p>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-cyan-900/20 p-3 rounded-lg border border-cyan-500/30 mt-3">
          <p className="text-xs text-cyan-300 flex items-start gap-2">
            <i className="fas fa-info-circle mt-0.5 flex-shrink-0"></i>
            <span>
              Model changes take effect immediately. Your conversation history
              and personality settings remain unchanged.
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
