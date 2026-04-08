import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Send, Loader2, ChevronDown, Zap } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface AgentCatalogEntry {
  id: string;
  name: string;
  description: string;
}

interface InvokeResult {
  output?: string;
  error?: string;
  [key: string]: unknown;
}

interface AgentCardState {
  open: boolean;
  prompt: string;
  loading: boolean;
  result: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchCatalog(): Promise<AgentCatalogEntry[]> {
  const res = await fetch('/api/agents-hub/catalog');
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  const data = (await res.json()) as { agents?: AgentCatalogEntry[] } | AgentCatalogEntry[];
  return Array.isArray(data) ? data : (data.agents ?? []);
}

async function invokeAgent(agentId: string, prompt: string): Promise<InvokeResult> {
  const res = await fetch('/api/agents-hub/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, prompt }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<InvokeResult>;
}

function formatResult(result: InvokeResult): string {
  if (result.error) return `Error: ${result.error}`;
  if (typeof result.output === 'string') return result.output;
  return JSON.stringify(result, null, 2);
}

// ─── AgentCard ──────────────────────────────────────────────────────────────

interface AgentCardProps {
  agent: AgentCatalogEntry;
}

function AgentCard({ agent }: AgentCardProps) {
  const [state, setState] = useState<AgentCardState>({
    open: false,
    prompt: '',
    loading: false,
    result: null,
  });
  const resultRef = useRef<HTMLPreElement>(null);

  const toggle = useCallback(() => {
    setState((s) => ({ ...s, open: !s.open, result: null, prompt: '' }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!state.prompt.trim() || state.loading) return;
    setState((s) => ({ ...s, loading: true, result: null }));
    try {
      const data = await invokeAgent(agent.id, state.prompt.trim());
      const text = formatResult(data);
      setState((s) => ({ ...s, loading: false, result: text }));
      setTimeout(() => resultRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, loading: false, result: `Error: ${msg}` }));
    }
  }, [agent.id, state.prompt, state.loading]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden flex flex-col">
      {/* Card header */}
      <div className="p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-violet-400 shrink-0" />
          <span className="font-semibold text-sm text-white truncate">{agent.name}</span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">{agent.description}</p>
      </div>

      {/* Invoke button */}
      <div className="px-4 pb-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 transition-colors text-xs font-medium text-white"
        >
          <Bot size={13} />
          Invoke
          <ChevronDown
            size={13}
            className={`transition-transform ${state.open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Inline prompt panel */}
      {state.open && (
        <div className="border-t border-zinc-700 p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={state.prompt}
              onChange={(e) => setState((s) => ({ ...s, prompt: e.target.value }))}
              onKeyDown={handleKey}
              placeholder="Enter prompt…"
              disabled={state.loading}
              className="flex-1 px-3 py-1.5 bg-zinc-700 rounded-lg text-sm border border-zinc-600 focus:border-violet-500 outline-none text-white placeholder-zinc-500 disabled:opacity-50"
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={!state.prompt.trim() || state.loading}
              className="p-2 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send"
            >
              {state.loading ? (
                <Loader2 size={14} className="animate-spin text-white" />
              ) : (
                <Send size={14} className="text-white" />
              )}
            </button>
          </div>

          {/* Result box */}
          {(state.result !== null || state.loading) && (
            <pre
              ref={resultRef}
              className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-200 font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto leading-relaxed"
            >
              {state.loading ? (
                <span className="text-zinc-400 animate-pulse">Running…</span>
              ) : (
                state.result
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AgentsPanel ────────────────────────────────────────────────────────────

export function AgentsPanel() {
  const [agents, setAgents] = useState<AgentCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog()
      .then(setAgents)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load agent catalog');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900 min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center gap-2 pb-1">
        <Bot className="text-violet-400" size={22} />
        <h1 className="text-lg font-semibold text-violet-300">Agent Hub</h1>
        {loading && <Loader2 className="ml-auto animate-spin text-violet-400" size={18} />}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && agents.length === 0 && (
        <div className="bg-zinc-800 rounded-xl p-6 text-center text-zinc-400 text-sm">
          No agents found. Ensure the agent server at <code className="text-violet-400">:7788</code> is running.
        </div>
      )}

      {/* Agent grid */}
      {agents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
