import { useState, useCallback } from 'react';
import { Network, Play, Loader2, CheckCircle2, Users } from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

type ModelOption = 'milla-rayne:latest' | 'gemma3:1b' | 'mistral' | 'grok-3-fast';

interface SwarmResult {
  timestamp: string;
  response: unknown;
  type: 'swarm' | 'consensus';
}

interface SkillExecuteBody {
  skillId: string;
  action: string;
  params: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function executeSkill(body: SkillExecuteBody): Promise<unknown> {
  const res = await fetch('/api/skills/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SwarmPanel() {
  const [task, setTask]           = useState('');
  const [model, setModel]         = useState<ModelOption>('milla-rayne:latest');
  const [agentCount, setAgentCount] = useState(3);
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState<SwarmResult[]>([]);
  const [error, setError]         = useState<string | null>(null);

  const addResult = useCallback((response: unknown, type: SwarmResult['type']) => {
    setResults(prev => [
      { timestamp: new Date().toLocaleTimeString(), response, type },
      ...prev,
    ].slice(0, 20));
  }, []);

  const runSwarm = useCallback(async () => {
    if (!task.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await executeSkill({
        skillId: 'swarm',
        action: 'run_swarm',
        params: { task: task.trim(), model, agent_count: agentCount },
      });
      addResult(response, 'swarm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [task, model, agentCount, addResult]);

  const getConsensus = useCallback(async () => {
    if (!task.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await executeSkill({
        skillId: 'consensus',
        action: 'get_consensus',
        params: { prompt: task.trim() },
      });
      addResult(response, 'consensus');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [task, addResult]);

  return (
    <div className="min-h-screen bg-zinc-900 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-violet-900/40 rounded-xl">
          <Network className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Swarm Control</h1>
          <p className="text-xs text-zinc-500">Multi-agent orchestration</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 max-w-3xl">
        {/* Task input */}
        <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Task / Prompt</label>
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            rows={4}
            placeholder="Describe the task for the swarm agents…"
            className="w-full bg-zinc-900 text-zinc-100 text-sm rounded-lg px-3 py-2.5 resize-none
                       border border-zinc-700 focus:outline-none focus:border-violet-500 placeholder:text-zinc-600"
          />

          <div className="flex flex-wrap gap-3">
            {/* Model selector */}
            <div className="flex flex-col gap-1 flex-1 min-w-36">
              <label className="text-xs text-zinc-500">Model</label>
              <select
                value={model}
                onChange={e => setModel(e.target.value as ModelOption)}
                className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-2 py-1.5
                           focus:outline-none focus:border-violet-500"
              >
                <option value="milla-rayne:latest">milla-rayne:latest</option>
                <option value="gemma3:1b">gemma3:1b</option>
                <option value="mistral">mistral</option>
                <option value="grok-3-fast">grok-3-fast</option>
              </select>
            </div>

            {/* Agent count */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500 flex items-center gap-1">
                <Users className="w-3 h-3" /> Agents
              </label>
              <select
                value={agentCount}
                onChange={e => setAgentCount(Number(e.target.value))}
                className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-2 py-1.5
                           focus:outline-none focus:border-violet-500"
              >
                {[2, 3, 4, 5, 6, 7, 8].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={runSwarm}
              disabled={loading || !task.trim()}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-violet-600 hover:bg-violet-500 text-white',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Launch Swarm
            </button>
            <button
              onClick={getConsensus}
              disabled={loading || !task.trim()}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-zinc-700 hover:bg-zinc-600 text-zinc-200',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              Get Consensus
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-zinc-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Results</p>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-600">
              {results.map((r, i) => (
                <div key={i} className="bg-zinc-900 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      r.type === 'swarm' ? 'bg-violet-900/60 text-violet-300' : 'bg-emerald-900/60 text-emerald-300',
                    )}>
                      {r.type}
                    </span>
                    <span className="text-[10px] text-zinc-500">{r.timestamp}</span>
                  </div>
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                    {typeof r.response === 'string'
                      ? r.response
                      : JSON.stringify(r.response, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
