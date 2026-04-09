import { useState, useCallback, useEffect } from 'react';
import { Network, Play, Loader2, CheckCircle2, Users, Bot, Send, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SwarmResult {
  timestamp: string;
  response: unknown;
  type: 'swarm' | 'consensus' | 'milla';
}

interface SkillExecuteBody {
  skillId: string;
  action: string;
  params: Record<string, unknown>;
}

interface OllamaModel {
  name: string;
  size: number;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface ChatMsg {
  role: 'user' | 'milla';
  text: string;
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

function fmtSize(bytes: number) {
  return bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)}GB` : `${(bytes / 1e6).toFixed(0)}MB`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SwarmPanel() {
  const [task, setTask]             = useState('');
  const [model, setModel]           = useState('milla-rayne:latest');
  const [agentCount, setAgentCount] = useState(3);
  const [loading, setLoading]       = useState(false);
  const [results, setResults]       = useState<SwarmResult[]>([]);
  const [error, setError]           = useState<string | null>(null);

  // Ollama models
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);

  // Skills catalog
  const [skills, setSkills]         = useState<Skill[]>([]);
  const [showSkills, setShowSkills] = useState(false);

  // Ask-Milla chat
  const [chatInput, setChatInput]   = useState('');
  const [chatMsgs, setChatMsgs]     = useState<ChatMsg[]>([
    { role: 'milla', text: "Hi! I'm Milla. I can run swarm tasks, get multi-agent consensus, or explain any of my capabilities. What would you like to do?" }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetch('/api/ollama/models')
      .then(r => r.json())
      .then((d: { models: OllamaModel[] }) => setOllamaModels(d.models ?? []))
      .catch(() => {});
    fetch('/api/skills')
      .then(r => r.json())
      .then((d: { skills: Skill[] }) => setSkills(d.skills ?? []))
      .catch(() => {});
  }, []);

  const addResult = useCallback((response: unknown, type: SwarmResult['type']) => {
    setResults(prev => [
      { timestamp: new Date().toLocaleTimeString(), response, type },
      ...prev,
    ].slice(0, 20));
  }, []);

  const runSwarm = useCallback(async () => {
    if (!task.trim()) return;
    setLoading(true); setError(null);
    try {
      const response = await executeSkill({ skillId: 'swarm', action: 'run_swarm', params: { task: task.trim(), model, agent_count: agentCount } });
      addResult(response, 'swarm');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setLoading(false); }
  }, [task, model, agentCount, addResult]);

  const getConsensus = useCallback(async () => {
    if (!task.trim()) return;
    setLoading(true); setError(null);
    try {
      const response = await executeSkill({ skillId: 'consensus', action: 'get_consensus', params: { prompt: task.trim() } });
      addResult(response, 'consensus');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setLoading(false); }
  }, [task, addResult]);

  const askMilla = useCallback(async () => {
    const q = chatInput.trim();
    if (!q) return;
    setChatInput('');
    setChatMsgs(prev => [...prev, { role: 'user', text: q }]);
    setChatLoading(true);

    // Build skills context
    const catalog = skills.map(s => `- **${s.name}** (${s.id}): ${s.description}`).join('\n');
    const systemCtx = `You are Milla-Rayne. You have access to the Swarm Protocol with these capabilities:\n${catalog}\n\nSwarm runs ${agentCount} parallel agents using model "${model}". You can launch swarms, get consensus, or explain any skill. Be concise and helpful.`;

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, systemPrompt: systemCtx, model: 'milla-rayne:latest' }),
      });
      const data = await res.json() as { response?: string; message?: string };
      const reply = data.response ?? data.message ?? 'No response received.';
      setChatMsgs(prev => [...prev, { role: 'milla', text: reply }]);
    } catch {
      setChatMsgs(prev => [...prev, { role: 'milla', text: 'I had trouble connecting. Try again in a moment.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, skills, agentCount, model]);

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

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: controls */}
        <div className="flex-1 flex flex-col gap-4 max-w-2xl">
          {/* Task input */}
          <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Task / Prompt</label>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              rows={4}
              placeholder="Describe the task for the swarm agents…"
              className="w-full bg-zinc-900 text-zinc-100 text-sm rounded-lg px-3 py-2.5 resize-none border border-zinc-700 focus:outline-none focus:border-violet-500 placeholder:text-zinc-600"
            />

            <div className="flex flex-wrap gap-3">
              {/* Model selector — Ollama models */}
              <div className="flex flex-col gap-1 flex-1 min-w-44">
                <label className="text-xs text-zinc-500">Model</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500"
                >
                  {ollamaModels.length > 0
                    ? ollamaModels.map(m => (
                        <option key={m.name} value={m.name}>{m.name} ({fmtSize(m.size)})</option>
                      ))
                    : <option value="milla-rayne:latest">milla-rayne:latest</option>
                  }
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
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500"
                >
                  {[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={runSwarm} disabled={loading || !task.trim()}
                className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed')}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Launch Swarm
              </button>
              <button onClick={getConsensus} disabled={loading || !task.trim()}
                className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed')}>
                <CheckCircle2 className="w-4 h-4" /> Get Consensus
              </button>
            </div>
          </div>

          {/* Skills catalog toggle */}
          <div className="bg-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowSkills(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-700/50 transition-colors"
            >
              <span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-violet-400" /> Available Skills ({skills.length})</span>
              {showSkills ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {showSkills && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 max-h-72 overflow-y-auto">
                {skills.map(s => (
                  <div key={s.id} className="bg-zinc-900 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-violet-300">{s.name}</span>
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{s.category}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{s.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {results.length > 0 && (
            <div className="bg-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Results</p>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {results.map((r, i) => (
                  <div key={i} className="bg-zinc-900 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        r.type === 'swarm' ? 'bg-violet-900/60 text-violet-300' : r.type === 'consensus' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-blue-900/60 text-blue-300')}>
                        {r.type}
                      </span>
                      <span className="text-[10px] text-zinc-500">{r.timestamp}</span>
                    </div>
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                      {typeof r.response === 'string' ? r.response : JSON.stringify(r.response, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Ask Milla */}
        <div className="lg:w-80 bg-zinc-800 rounded-xl flex flex-col" style={{ minHeight: 420 }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700">
            <Bot className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-zinc-300">Ask Milla</span>
            <span className="ml-auto text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-full">Swarm-aware</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMsgs.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
                  m.role === 'user' ? 'bg-violet-600/40 text-zinc-100' : 'bg-zinc-900 text-zinc-300')}>
                  {m.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 rounded-xl px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-zinc-700 flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && askMilla()}
              placeholder="Ask about swarm capabilities…"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
            <button onClick={askMilla} disabled={chatLoading || !chatInput.trim()}
              className="p-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed">
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
