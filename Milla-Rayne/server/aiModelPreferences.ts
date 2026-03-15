export const CANONICAL_AI_MODELS = [
  'gemini',
  'minimax',
  'venice',
  'deepseek',
  'xai',
  'grok',
] as const;

export type CanonicalAIModel = (typeof CANONICAL_AI_MODELS)[number];

const MODEL_ALIASES: Record<string, CanonicalAIModel> = {
  gemini: 'gemini',
  'gemini-2-flash': 'gemini',
  'gemini-1.5-flash': 'gemini',
  minimax: 'minimax',
  venice: 'venice',
  'venice-uncensored': 'venice',
  deepseek: 'deepseek',
  'deepseek-coder': 'deepseek',
  xai: 'xai',
  'grok-2': 'xai',
  grok: 'grok',
};

export const DEFAULT_CHAT_MODEL: CanonicalAIModel = 'gemini';

export function normalizeAIModel(model: string | null | undefined) {
  if (!model) return null;
  return MODEL_ALIASES[model] ?? null;
}

export function isSupportedAIModel(model: string) {
  return normalizeAIModel(model) !== null;
}
