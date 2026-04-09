import { useState, useEffect, useCallback } from 'react';
import { FlaskConical, Send, Loader2, Bot, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

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

export default function DeerFlowPanel() {
  const [query, setQuery]     = useState('');
  const [result, setResult]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [skills, setSkills]         = useState<Skill[]>([]);
  const [showSkills, setShowSkills] = useState(false);

  const [chatInput, setChatInput]   = useState('');
  const [chatMsgs, setChatMsgs]     = useState<ChatMsg[]>([
    { role: 'milla', text: "I'm Milla, integrated with the DeerFlow LangGraph research agent. I can run deep multi-step research queries, or explain how any of my skills work. What would you like to explore?" }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetch('/api/skills')
      .then(r => r.json())
      .then((d: { skills: Skill[] }) => setSkills(d.skills ?? []))
      .catch(() => {});
  }, []);

  const handleResearch = useCallback(async () => {
    if (!query.trim() || loading) return;
    setLoading(true); setError(''); setResult('');
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
    } finally { setLoading(false); }
  }, [query, loading]);

  const askMilla = useCallback(async () => {
    const q = chatInput.trim();
    if (!q) return;
    setChatInput('');
    setChatMsgs(prev => [...prev, { role: 'user', text: q }]);
    setChatLoading(true);

    const catalog = skills.map(s => `- **${s.name}** (${s.id}): ${s.description}`).join('\n');
    const systemCtx = `You are Milla-Rayne. You are integrated with DeerFlow — a LangGraph-powered deep research agent that can perform multi-step web research, analysis, and synthesis.\n\nYour full skill catalog:\n${catalog}\n\nHelp the user understand DeerFlow's capabilities or any other skill. Be concise and informative.`;

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, systemPrompt: systemCtx, model: 'milla-rayne:latest' }),
      });
      const data = await res.json() as { response?: string; message?: string };
      setChatMsgs(prev => [...prev, { role: 'milla', text: data.response ?? data.message ?? 'No response.' }]);
    } catch {
      setChatMsgs(prev => [...prev, { role: 'milla', text: 'Connection issue. Try again.' }]);
    } finally { setChatLoading(false); }
  }, [chatInput, skills]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 bg-[#0c021a]/90 min-h-screen">
      {/* Left: research */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-6 h-6 text-[#00f2ff]" />
          <h2 className="text-xl font-semibold text-white">DeerFlow Research</h2>
          <span className="ml-auto text-xs text-white/40 border border-white/10 rounded-full px-2 py-0.5">LangGraph Agent</span>
        </div>

        <div className="flex gap-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleResearch()}
            placeholder="Enter a research query…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#00f2ff]/50 text-sm"
          />
          <button
            onClick={handleResearch}
            disabled={loading || !query.trim()}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#00f2ff]/20 to-[#ff00aa]/20 border border-[#00f2ff]/30 text-[#00f2ff] text-sm font-medium hover:from-[#00f2ff]/30 hover:to-[#ff00aa]/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Researching…' : 'Research'}
          </button>
        </div>

        {error && <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl p-4">{error}</div>}
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

        {/* Skills catalog toggle */}
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowSkills(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-[#00f2ff]" /> Milla's Skill Catalog ({skills.length})</span>
            {showSkills ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showSkills && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 max-h-72 overflow-y-auto">
              {skills.map(s => (
                <div key={s.id} className="bg-white/5 border border-white/10 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-[#00f2ff]">{s.name}</span>
                    <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{s.category}</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed">{s.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Ask Milla */}
      <div className="lg:w-80 border border-white/10 rounded-2xl flex flex-col bg-white/2" style={{ minHeight: 420 }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <Bot className="w-4 h-4 text-[#00f2ff]" />
          <span className="text-sm font-semibold text-white/80">Ask Milla</span>
          <span className="ml-auto text-[10px] text-white/30 border border-white/10 rounded-full px-2 py-0.5">Research-aware</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {chatMsgs.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
                m.role === 'user' ? 'bg-[#00f2ff]/20 text-white' : 'bg-white/5 text-white/70')}>
                {m.text}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-white/5 rounded-xl px-3 py-2">
                <Loader2 className="w-3.5 h-3.5 text-[#00f2ff] animate-spin" />
              </div>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-white/10 flex gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && askMilla()}
            placeholder="Ask about DeerFlow or any skill…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#00f2ff]/50"
          />
          <button onClick={askMilla} disabled={chatLoading || !chatInput.trim()}
            className="p-2 rounded-lg bg-[#00f2ff]/20 hover:bg-[#00f2ff]/30 text-[#00f2ff] border border-[#00f2ff]/30 disabled:opacity-40 disabled:cursor-not-allowed">
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
