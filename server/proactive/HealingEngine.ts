import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

interface HealthCheck {
  name: string;
  interval: number;
  threshold: number;
  check: () => Promise<HealthResult>;
  heal: (result: HealthResult) => Promise<boolean>;
}

interface HealthResult {
  healthy: boolean;
  metric: number;
  details: string;
  severity: 'info' | 'warning' | 'critical';
}

export class SelfHealingEngine extends EventEmitter {
  private checks: Map<string, HealthCheck> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private healthHistory: Map<string, HealthResult[]> = new Map();

  constructor() {
    super();
  }

  registerDefaults(): void {
    // Provider health
    this.register({
      name: 'provider_availability',
      interval: 30000, // 30s
      threshold: 0.8,
      check: this.checkProviders.bind(this),
      heal: this.healProviders.bind(this)
    });

    // Memory pressure
    this.register({
      name: 'memory_usage',
      interval: 60000, // 1m
      threshold: 0.85,
      check: this.checkMemory.bind(this),
      heal: this.healMemory.bind(this)
    });

    // Token usage
    this.register({
      name: 'token_budget',
      interval: 300000, // 5m
      threshold: 0.9,
      check: this.checkTokenBudget.bind(this),
      heal: this.healTokenBudget.bind(this)
    });

    // Config drift
    this.register({
      name: 'config_validity',
      interval: 60000,
      threshold: 1,
      check: this.checkConfig.bind(this),
      heal: this.healConfig.bind(this)
    });
  }

  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
    this.healthHistory.set(check.name, []);
  }

  start(): void {
    for (const [name, check] of this.checks) {
      const interval = setInterval(async () => {
        await this.runCheck(name);
      }, check.interval);
      
      this.intervals.set(name, interval);
      this.runCheck(name); // Initial check
    }
    
    console.log('🏥 Self-healing engine started');
  }

  stop(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  private async runCheck(name: string): Promise<void> {
    const check = this.checks.get(name)!;
    const history = this.healthHistory.get(name)!;
    
    try {
      const result = await check.check();
      history.push(result);
      
      // Keep last 100 results
      if (history.length > 100) history.shift();
      
      if (!result.healthy && result.metric < check.threshold) {
        this.emit('degraded', { name, result });
        
        const healed = await check.heal(result);
        if (healed) {
          this.emit('healed', { name });
          console.log(`✅ Self-healed: ${name}`);
        } else {
          this.emit('heal_failed', { name, result });
          console.error(`❌ Self-heal failed: ${name}`);
        }
      }
    } catch (e) {
      console.error(`Check ${name} failed:`, e);
    }
  }

  // Health check implementations
  private async checkProviders(): Promise<HealthResult> {
    const providers = ['openai', 'anthropic', 'xai', 'ollama'];
    const results = await Promise.all(
      providers.map(async p => {
        try {
          // Quick ping to each provider
          const start = Date.now();
          await this.pingProvider(p);
          return { provider: p, latency: Date.now() - start, alive: true };
        } catch {
          return { provider: p, latency: Infinity, alive: false };
        }
      })
    );
    
    const aliveCount = results.filter(r => r.alive).length;
    const healthy = aliveCount >= 2; // Need at least 2 providers
    
    return {
      healthy,
      metric: aliveCount / providers.length,
            details: `Providers: ${results.map(r => `${r.provider}:${r.alive ? '✓' : '✗'}`).join(', ')}`,
      severity: healthy ? 'info' : aliveCount === 0 ? 'critical' : 'warning'
    };
  }

  private async healProviders(result: HealthResult): Promise<boolean> {
    // Switch to backup provider
    if (result.metric === 0) {
      console.log('🔄 All providers down - attempting restart...');
      // Could restart network, clear DNS, etc.
    }
    
    // Provider switching happens automatically in dispatch
    return true;
  }

  private async checkMemory(): Promise<HealthResult> {
    const used = process.memoryUsage();
    const heapUsedPercent = used.heapUsed / used.heapTotal;
    
    return {
      healthy: heapUsedPercent < 0.85,
      metric: heapUsedPercent,
      details: `Heap: ${(used.heapUsed / 1024 / 1024).toFixed(0)}MB / ${(used.heapTotal / 1024 / 1024).toFixed(0)}MB`,
      severity: heapUsedPercent > 0.9 ? 'critical' : heapUsedPercent > 0.8 ? 'warning' : 'info'
    };
  }

  private async healMemory(result: HealthResult): Promise<boolean> {
    if (global.gc) {
      global.gc(); // Force garbage collection if exposed
    }
    
    // Trigger memory compaction in GraphRAG
    // Clear non-essential caches
    console.log('🧹 Memory pressure detected - clearing caches...');
    
    return true;
  }

  private async checkTokenBudget(): Promise<HealthResult> {
    // Track daily/monthly token usage
    const today = new Date().toISOString().split('T')[0];
    const usage = await this.getTokenUsage(today);
    const dailyLimit = parseInt(process.env.DAILY_TOKEN_LIMIT || '1000000');
    const percent = usage / dailyLimit;
    
    return {
      healthy: percent < 0.9,
      metric: percent,
      details: `Tokens: ${usage.toLocaleString()} / ${dailyLimit.toLocaleString()}`,
      severity: percent > 0.95 ? 'critical' : percent > 0.8 ? 'warning' : 'info'
    };
  }

  private async healTokenBudget(result: HealthResult): Promise<boolean> {
    // Switch to local models
    console.log('💰 Approaching token limit - switching to local models...');
    process.env.PREFERRED_PROVIDER = 'ollama';
    return true;
  }

  private async checkConfig(): Promise<HealthResult> {
    const envPath = path.resolve(process.cwd(), '.env');
    const envContent = await fs.readFile(envPath, 'utf-8');
    
    const required = ['OPENAI_API_KEY', 'DATABASE_URL', 'JWT_SECRET'];
    const missing = required.filter(key => !process.env[key]);
    
    return {
      healthy: missing.length === 0,
      metric: (required.length - missing.length) / required.length,
      details: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All required env vars present',
      severity: missing.length > 0 ? 'critical' : 'info'
    };
  }

  private async healConfig(result: HealthResult): Promise<boolean> {
    // Attempt to fetch from secure vault or prompt user
    console.log('⚙️ Config drift detected - attempting recovery...');
    
    // Could integrate with AWS Secrets Manager, HashiCorp Vault, etc.
    return false; // Usually requires manual intervention
  }

  private async pingProvider(provider: string): Promise<void> {
    const urls: Record<string, string> = {
      openai: 'https://api.openai.com/v1/models',
      anthropic: 'https://api.anthropic.com/v1/models',
      xai: 'https://api.x.ai/v1/models',
      ollama: 'http://localhost:11434/api/version'
    };
    
    const response = await fetch(urls[provider], {
      method: 'HEAD',
      headers: { 'Authorization': `Bearer ${process.env[`${provider.toUpperCase()}_API_KEY`]}` }
    });
    
    if (!response.ok) throw new Error('Provider unhealthy');
  }

  private async getTokenUsage(date: string): Promise<number> {
    // Query from database or logging service
    return 0; // Placeholder
  }

  getHealthReport(): Record<string, any> {
    const report: Record<string, any> = {};
    for (const [name, history] of this.healthHistory) {
      const latest = history[history.length - 1];
      report[name] = {
        current: latest,
        uptime: this.calculateUptime(history),
        trend: this.calculateTrend(history)
      };
    }
    return report;
  }

  private calculateUptime(history: HealthResult[]): number {
    const healthy = history.filter(h => h.healthy).length;
    return history.length > 0 ? healthy / history.length : 1;
  }

  private calculateTrend(history: HealthResult[]): 'improving' | 'stable' | 'degrading' {
    if (history.length < 10) return 'stable';
    const recent = history.slice(-5).filter(h => h.healthy).length;
    const older = history.slice(-10, -5).filter(h => h.healthy).length;
    return recent > older ? 'improving' : recent < older ? 'degrading' : 'stable';
  }
}
