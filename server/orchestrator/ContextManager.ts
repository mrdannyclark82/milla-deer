import { OpenAI } from 'openai';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: any[];
}

export interface CompressionStrategy {
  type: 'summarize' | 'truncate' | 'semantic_merge';
  preserveRecent: number;
  targetRatio: number;
}

export class ContextWindowManager {
  private tokenizer: any; // Use tiktoken or gpt-tokenizer
  private maxTokens: number;
  private openai: OpenAI;

  constructor(maxTokens: number = 128000) {
    this.maxTokens = maxTokens;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async optimizeContext(
    messages: Message[],
    strategy: CompressionStrategy = {
      type: 'summarize',
      preserveRecent: 6,
      targetRatio: 0.5
    }
  ): Promise<Message[]> {
    const currentTokens = await this.estimateTokens(messages);
    
    if (currentTokens < this.maxTokens * 0.8) {
      return messages; // No compression needed
    }

    // Always preserve recent messages
    const preserved = messages.slice(-strategy.preserveRecent);
    const toCompress = messages.slice(0, -strategy.preserveRecent);

    let compressed: Message[];

    switch (strategy.type) {
      case 'summarize':
        compressed = await this.summarizeMessages(toCompress);
        break;
      case 'semantic_merge':
        compressed = await this.semanticMerge(toCompress);
        break;
      case 'truncate':
        compressed = this.truncateOldest(toCompress, strategy.targetRatio);
        break;
      default:
        compressed = toCompress;
    }

    return [...compressed, ...preserved];
  }

  private async summarizeMessages(messages: Message[]): Promise<Message[]> {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    const summary = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Summarize this conversation into key facts, decisions, and context. 
        Preserve: user preferences, explicit instructions, error messages, tool results.
        Format: bullet points of distilled information.`
      }, {
        role: 'user',
        content: conversationText
      }],
      temperature: 0.3,
      max_tokens: 500
    });

    return [{
      role: 'system',
      content: `[Prior Context Summary]\n${summary.choices[0].message.content}`
    }];
  }

  private async semanticMerge(messages: Message[]): Promise<Message[]> {
    // Group similar messages using embeddings
    const embeddings = await this.getEmbeddings(
      messages.map(m => m.content)
    );
    
    const clusters = this.clusterMessages(messages, embeddings);
    
    const merged = await Promise.all(
      clusters.map(async cluster => {
        if (cluster.length === 1) return cluster[0];
        
        const mergedContent = await this.mergeCluster(cluster);
        return {
          role: 'system',
          content: `[Consolidated] ${mergedContent}`
        };
      })
    );

    return merged;
  }

  private truncateOldest(messages: Message[], ratio: number): Message[] {
    const keepCount = Math.ceil(messages.length * ratio);
    const recent = messages.slice(-keepCount);
    
    return [{
      role: 'system',
      content: `[${messages.length - keepCount} older messages truncated for token efficiency]`
    }, ...recent];
  }

  private async estimateTokens(messages: Message[]): Promise<number> {
    // Approximation: 1 token ~= 4 characters for English
    const text = JSON.stringify(messages);
    return Math.ceil(text.length / 4);
  }

  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts
    });
    return response.data.map(d => d.embedding);
  }

  private clusterMessages(
    messages: Message[], 
    embeddings: number[][],
    threshold: number = 0.85
  ): Message[][] {
    const clusters: Message[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < messages.length; i++) {
      if (assigned.has(i)) continue;
      
      const cluster: Message[] = [messages[i]];
      assigned.add(i);

      for (let j = i + 1; j < messages.length; j++) {
        if (assigned.has(j)) continue;
        
        const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);
        if (similarity > threshold) {
          cluster.push(messages[j]);
          assigned.add(j);
        }
      }
      
      clusters.push(cluster);
    }

    return clusters;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (magA * magB);
  }

  private async mergeCluster(cluster: Message[]): Promise<string> {
    const combined = cluster.map(m => m.content).join(' | ');
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Merge these related messages into one concise statement preserving all key information.'
      }, {
        role: 'user',
        content: combined
      }],
      temperature: 0.3,
      max_tokens: 200
    });

    return response.choices[0].message.content || combined;
  }
}
