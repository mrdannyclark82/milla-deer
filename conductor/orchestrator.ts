/**
 * Orchestrator for Conductor System
 * Coordinates multiple AI models, services, and workflows
 * Intelligent routing, health scoring, and real API dispatch
 */

interface OrchestratorConfig {
  defaultModel: string;
  fallbackChain: string[];
  enableCaching: boolean;
  maxConcurrentRequests: number;
}

interface Task {
  id: string;
  type: string;
  input: any;
  priority: number;
  timestamp: number;
  /** Optional: route to a specific project context */
  project?: 'milla-rayne' | 'deer-milla' | 'elara' | 'sarii' | string;
}

interface TaskResult {
  taskId: string;
  success: boolean;
  result: any;
  model: string;
  latencyMs: number;
  error?: string;
}

// ── Live API invokers ──────────────────────────────────────────────────────────

async function callGeminiFlash(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) throw new Error(`Gemini Flash ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callGeminiPro(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!res.ok) throw new Error(`Gemini Pro ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callXAI(prompt: string): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('XAI_API_KEY not set');
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`xAI Grok ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? '';
}

async function callLocalGemma3(prompt: string): Promise<string> {
  const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const res = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'milla-rayne:latest', prompt, stream: false }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.response ?? '';
}

// ── Project routing helpers ────────────────────────────────────────────────────

/** Returns a system preamble injected into the prompt based on project context */
function projectPreamble(project?: string): string {
  const map: Record<string, string> = {
    'milla-rayne':
      'You are operating within the Milla-Rayne core assistant context. Prioritize personal interaction, memory, and voice.',
    'deer-milla':
      'You are operating within Deer-Milla, the secondary Milla variant. Focus on lightweight responses.',
    elara:
      'You are operating within Elara 2.0, a 3D-avatar AI assistant context.',
    sarii: 'You are operating within SARIi, the Python audio-synthesis context.',
  };
  return map[project ?? ''] ?? '';
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private taskQueue: Task[] = [];
  private activeRequests: number = 0;
  private resultCache: Map<string, any> = new Map();
  private modelHealth: Map<string, number> = new Map();

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      defaultModel: 'gemini-flash',
      fallbackChain: ['gemini-flash', 'gemini-pro', 'grok-3', 'local-gemma3'],
      enableCaching: true,
      maxConcurrentRequests: 5,
      ...config,
    };

    this.config.fallbackChain.forEach((model) => {
      this.modelHealth.set(model, 1.0);
    });
  }

  async initialize(): Promise<void> {
    console.log('[Orchestrator] Initializing...');
    console.log('[Orchestrator] Default model:', this.config.defaultModel);
    console.log('[Orchestrator] Fallback chain:', this.config.fallbackChain.join(' → '));
  }

  async execute(task: Omit<Task, 'id' | 'timestamp'>): Promise<TaskResult> {
    const fullTask: Task = {
      ...task,
      id: this.generateTaskId(),
      timestamp: Date.now(),
    };

    if (this.config.enableCaching) {
      const cached = this.checkCache(fullTask);
      if (cached) return cached;
    }

    await this.waitForSlot();
    this.activeRequests++;

    try {
      const result = await this.executeWithFallback(fullTask);
      if (this.config.enableCaching && result.success) {
        this.cacheResult(fullTask, result);
      }
      return result;
    } finally {
      this.activeRequests--;
    }
  }

  private async executeWithFallback(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    const preamble = projectPreamble(task.project);
    const prompt = preamble
      ? `${preamble}\n\n${JSON.stringify(task.input)}`
      : JSON.stringify(task.input);

    for (const model of this.config.fallbackChain) {
      const health = this.modelHealth.get(model) || 0;
      if (health < 0.3) {
        console.log(`[Orchestrator] Skipping unhealthy model ${model} (health: ${health.toFixed(2)})`);
        continue;
      }

      try {
        console.log(`[Orchestrator] Attempting ${model} for task ${task.id} (project: ${task.project ?? 'default'})`);
        const result = await this.invokeModel(model, prompt);
        this.updateModelHealth(model, true);
        return { taskId: task.id, success: true, result, model, latencyMs: Date.now() - startTime };
      } catch (error: any) {
        console.warn(`[Orchestrator] Model ${model} failed:`, error.message);
        this.updateModelHealth(model, false);
      }
    }

    return {
      taskId: task.id,
      success: false,
      result: null,
      model: 'none',
      latencyMs: Date.now() - startTime,
      error: 'All models in fallback chain failed',
    };
  }

  private async invokeModel(model: string, prompt: string): Promise<any> {
    switch (model) {
      case 'gemini-flash': return { response: await callGeminiFlash(prompt) };
      case 'gemini-pro':   return { response: await callGeminiPro(prompt) };
      case 'grok-3':       return { response: await callXAI(prompt) };
      case 'local-gemma3': return { response: await callLocalGemma3(prompt) };
      default: throw new Error(`Unknown model: ${model}`);
    }
  }

  private updateModelHealth(model: string, success: boolean): void {
    const current = this.modelHealth.get(model) || 1.0;
    this.modelHealth.set(model, success
      ? Math.min(1.0, current + 0.1)
      : Math.max(0.0, current - 0.3));
  }

  private async waitForSlot(): Promise<void> {
    while (this.activeRequests >= this.config.maxConcurrentRequests) {
      await this.delay(100);
    }
  }

  private checkCache(task: Task): TaskResult | null {
    return this.resultCache.get(this.getCacheKey(task)) || null;
  }

  private cacheResult(task: Task, result: TaskResult): void {
    const key = this.getCacheKey(task);
    this.resultCache.set(key, result);
    if (this.resultCache.size > 1000) {
      const first = this.resultCache.keys().next().value;
      this.resultCache.delete(first);
    }
  }

  private getCacheKey(task: Task): string {
    return `${task.project ?? 'default'}:${task.type}:${JSON.stringify(task.input)}`;
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      activeRequests: this.activeRequests,
      cachedResults: this.resultCache.size,
      modelHealth: Object.fromEntries(this.modelHealth),
      queueLength: this.taskQueue.length,
    };
  }

  clearCache(): void {
    this.resultCache.clear();
    console.log('[Orchestrator] Cache cleared');
  }
}

export const orchestrator = new Orchestrator();


interface OrchestratorConfig {
  defaultModel: string;
  fallbackChain: string[];
  enableCaching: boolean;
  maxConcurrentRequests: number;
}

interface Task {
  id: string;
  type: string;
  input: any;
  priority: number;
  timestamp: number;
}

interface TaskResult {
  taskId: string;
  success: boolean;
  result: any;
  model: string;
  latencyMs: number;
  error?: string;
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private taskQueue: Task[] = [];
  private activeRequests: number = 0;
  private resultCache: Map<string, any> = new Map();
  private modelHealth: Map<string, number> = new Map();

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      defaultModel: 'gemini-flash',
      fallbackChain: ['gemini-flash', 'gemini-pro', 'grok-4', 'local-gemma3'],
      enableCaching: true,
      maxConcurrentRequests: 5,
      ...config,
    };

    // Initialize model health scores
    this.config.fallbackChain.forEach((model) => {
      this.modelHealth.set(model, 1.0);
    });
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    console.log('[Orchestrator] Initializing...');
    console.log('[Orchestrator] Default model:', this.config.defaultModel);
    console.log(
      '[Orchestrator] Fallback chain:',
      this.config.fallbackChain.join(' → ')
    );
  }

  /**
   * Execute a task with intelligent routing
   */
  async execute(task: Omit<Task, 'id' | 'timestamp'>): Promise<TaskResult> {
    const fullTask: Task = {
      ...task,
      id: this.generateTaskId(),
      timestamp: Date.now(),
    };

    console.log(
      `[Orchestrator] Executing task ${fullTask.id} of type ${fullTask.type}`
    );

    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.checkCache(fullTask);
      if (cached) {
        console.log(`[Orchestrator] Cache hit for task ${fullTask.id}`);
        return cached;
      }
    }

    // Wait if too many concurrent requests
    await this.waitForSlot();

    this.activeRequests++;

    try {
      const result = await this.executeWithFallback(fullTask);

      // Cache the result
      if (this.config.enableCaching && result.success) {
        this.cacheResult(fullTask, result);
      }

      return result;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Execute with automatic fallback
   */
  private async executeWithFallback(task: Task): Promise<TaskResult> {
    const startTime = Date.now();

    for (const model of this.config.fallbackChain) {
      // Skip unhealthy models
      const health = this.modelHealth.get(model) || 0;
      if (health < 0.3) {
        console.log(
          `[Orchestrator] Skipping unhealthy model ${model} (health: ${health.toFixed(2)})`
        );
        continue;
      }

      try {
        console.log(`[Orchestrator] Attempting ${model} for task ${task.id}`);

        const result = await this.invokeModel(model, task);
        const latencyMs = Date.now() - startTime;

        // Update model health (success)
        this.updateModelHealth(model, true);

        return {
          taskId: task.id,
          success: true,
          result,
          model,
          latencyMs,
        };
      } catch (error: any) {
        console.warn(`[Orchestrator] Model ${model} failed:`, error.message);

        // Update model health (failure)
        this.updateModelHealth(model, false);

        // Continue to next fallback
        continue;
      }
    }

    // All models failed
    const latencyMs = Date.now() - startTime;
    return {
      taskId: task.id,
      success: false,
      result: null,
      model: 'none',
      latencyMs,
      error: 'All models in fallback chain failed',
    };
  }

  /**
   * Invoke a specific model
   */
  private async invokeModel(model: string, task: Task): Promise<any> {
    // Mock implementation - replace with actual model invocation
    switch (model) {
      case 'gemini-flash':
        return this.mockGeminiFlash(task);
      case 'gemini-pro':
        return this.mockGeminiPro(task);
      case 'grok-4':
        return this.mockGrok4(task);
      case 'local-gemma3':
        return this.mockLocalGemma3(task);
      default:
        throw new Error(`Unknown model: ${model}`);
    }
  }

  /**
   * Mock model invocations (replace with actual API calls)
   */
  private async mockGeminiFlash(task: Task): Promise<any> {
    await this.delay(100);
    if (Math.random() > 0.9) throw new Error('Gemini Flash failed');
    return { response: `Gemini Flash response for ${task.type}` };
  }

  private async mockGeminiPro(task: Task): Promise<any> {
    await this.delay(200);
    if (Math.random() > 0.85) throw new Error('Gemini Pro failed');
    return { response: `Gemini Pro response for ${task.type}` };
  }

  private async mockGrok4(task: Task): Promise<any> {
    await this.delay(150);
    if (Math.random() > 0.8) throw new Error('Grok-4 failed');
    return { response: `Grok-4 response for ${task.type}` };
  }

  private async mockLocalGemma3(task: Task): Promise<any> {
    await this.delay(300);
    // Local model is most reliable
    return { response: `Local Gemma3 response for ${task.type}` };
  }

  /**
   * Update model health score
   */
  private updateModelHealth(model: string, success: boolean): void {
    const currentHealth = this.modelHealth.get(model) || 1.0;

    if (success) {
      // Slowly increase health
      this.modelHealth.set(model, Math.min(1.0, currentHealth + 0.1));
    } else {
      // Quickly decrease health
      this.modelHealth.set(model, Math.max(0.0, currentHealth - 0.3));
    }
  }

  /**
   * Wait for available request slot
   */
  private async waitForSlot(): Promise<void> {
    while (this.activeRequests >= this.config.maxConcurrentRequests) {
      await this.delay(100);
    }
  }

  /**
   * Check result cache
   */
  private checkCache(task: Task): TaskResult | null {
    const cacheKey = this.getCacheKey(task);
    return this.resultCache.get(cacheKey) || null;
  }

  /**
   * Cache a result
   */
  private cacheResult(task: Task, result: TaskResult): void {
    const cacheKey = this.getCacheKey(task);
    this.resultCache.set(cacheKey, result);

    // Limit cache size
    if (this.resultCache.size > 1000) {
      const firstKey = this.resultCache.keys().next().value;
      this.resultCache.delete(firstKey);
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(task: Task): string {
    return `${task.type}_${JSON.stringify(task.input)}`;
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    return {
      activeRequests: this.activeRequests,
      cachedResults: this.resultCache.size,
      modelHealth: Object.fromEntries(this.modelHealth),
      queueLength: this.taskQueue.length,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.resultCache.clear();
    console.log('[Orchestrator] Cache cleared');
  }
}

// Export singleton instance
export const orchestrator = new Orchestrator();
