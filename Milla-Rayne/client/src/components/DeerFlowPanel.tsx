import { useState } from 'react';
import { FlaskConical, Send, Loader2 } from 'lucide-react';

export default function DeerFlowPanel() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleResearch = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/deerflow/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data.result ?? JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 bg-[#0c021a]/90 border border-white/10 rounded-2xl min-h-[400px]">
      <div className="flex items-center gap-3">
        <FlaskConical className="w-6 h-6 text-[#00f2ff]" />
        <h2 className="text-xl font-semibold text-white">DeerFlow Research</h2>
        <span className="ml-auto text-xs text-white/40 border border-white/10 rounded-full px-2 py-0.5">LangGraph Agent</span>
      </div>
      <div className="flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
          placeholder="Enter a research query..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#00f2ff]/50 text-sm"
        />
        <button
          onClick={handleResearch}
          disabled={loading || !query.trim()}
          className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#00f2ff]/20 to-[#ff00aa]/20 border border-[#00f2ff]/30 text-[#00f2ff] text-sm font-medium hover:from-[#00f2ff]/30 hover:to-[#ff00aa]/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {loading ? 'Researching...' : 'Research'}
        </button>
      </div>
      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl p-4">{error}</div>
      )}
      {result && (
        <div className="flex-1 overflow-auto bg-white/5 border border-white/10 rounded-xl p-4">
          <pre className="text-white/80 text-sm whitespace-pre-wrap font-mono leading-relaxed">{result}</pre>
        </div>
      )}
      {!result && !error && !loading && (
        <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
          Enter a query to start deep research with the DeerFlow LangGraph agent
        </div>
      )}
    </div>
  );
}
