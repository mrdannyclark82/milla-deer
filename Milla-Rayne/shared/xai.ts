export interface ReasoningStep {
  type: 'intent' | 'tools' | 'memory' | 'response';
  title: string;
  content: string | string[];
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface XAIData {
  commandIntent?: string;
  toolsSelected?: string[];
  memoryFragments?: Array<{ content: string; relevance: number }>;
  responseGeneration?: {
    model: string;
    tokensUsed?: number;
    processingTime?: number;
  };
  reasoning: ReasoningStep[];
}
