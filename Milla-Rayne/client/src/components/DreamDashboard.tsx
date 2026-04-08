import { useState, useEffect, useCallback } from 'react';
import { Moon, Brain, Activity, RefreshCw, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NeuroState {
  dopamine: number;
  serotonin: number;
  cortisol: number;
  oxytocin: number;
  energy: number;
}

interface GimResponse {
  entries: string[];
  count: number;
}

interface StreamResponse {
  lines: string[];
  count: number;
}

// ─── Neuro gauge config ──────────────────────────────────────────────────────

const NEURO_KEYS: Array<{
  key: keyof NeuroState;
  label: string;
  color: string;
  barColor: string;
}> = [
  { key: 'dopamine',  label: 'Dopamine',  color: 'text-purple-400',  barColor: 'bg-purple-500'  },
  { key: 'serotonin', label: 'Serotonin', color: 'text-emerald-400', barColor: 'bg-emerald-500' },
  { key: 'cortisol',  label: 'Cortisol',  color: 'text-red-400',     barColor: 'bg-red-500'     },
  { key: 'oxytocin',  label: 'Oxytocin',  color: 'text-pink-400',    barColor: 'bg-pink-500'    },
  { key: 'energy',    label: 'Energy',    color: 'text-yellow-400',  barColor: 'bg-yellow-500'  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function NeuroBar({ neuro }: { neuro: NeuroState | null }) {
  return (
    <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Neuro State</span>
      </div>
      {NEURO_KEYS.map(({ key, label, color, barColor }) => {
        const value = neuro?.[key] ?? 0;
        return (
          <div key={key} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className={cn('text-xs font-medium', color)}>{label}</span>
              <span className="text-xs text-zinc-400">{(value * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-700', barColor)}
                style={{ width: `${value * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  onRefresh,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">{title}</span>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-40"
        aria-label={`Refresh ${title}`}
      >
        <RefreshCw className={cn('w-3.5 h-3.5 text-zinc-400', loading && 'animate-spin')} />
      </button>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function DreamDashboard() {
  const [neuro, setNeuro]             = useState<NeuroState | null>(null);
  const [gimEntries, setGimEntries]   = useState<string[]>([]);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [loadingGim, setLoadingGim]   = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);

  const fetchNeuro = useCallback(async () => {
    try {
      const res = await fetch('/api/dream/neuro');
      if (res.ok) setNeuro(await res.json() as NeuroState);
    } catch { /* silent */ }
  }, []);

  const fetchGim = useCallback(async () => {
    setLoadingGim(true);
    try {
      const res = await fetch('/api/dream/gim?limit=20');
      if (res.ok) {
        const data = await res.json() as GimResponse;
        setGimEntries(data.entries);
      }
    } catch { /* silent */ } finally {
      setLoadingGim(false);
    }
  }, []);

  const fetchStream = useCallback(async () => {
    setLoadingStream(true);
    try {
      const res = await fetch('/api/dream/stream?limit=30');
      if (res.ok) {
        const data = await res.json() as StreamResponse;
        setStreamLines(data.lines);
      }
    } catch { /* silent */ } finally {
      setLoadingStream(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchNeuro();
    void fetchGim();
    void fetchStream();
  }, [fetchNeuro, fetchGim, fetchStream]);

  // Poll neuro state every 10 seconds
  useEffect(() => {
    const id = setInterval(() => { void fetchNeuro(); }, 10_000);
    return () => clearInterval(id);
  }, [fetchNeuro]);

  return (
    <div className="min-h-screen bg-zinc-900 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-900/40 rounded-xl">
          <Moon className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Dream Cycle</h1>
          <p className="text-xs text-zinc-500">REM / Internal state monitor</p>
        </div>
      </div>

      {/* Layout */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left column: Neuro state */}
        <div className="md:w-64 shrink-0">
          <NeuroBar neuro={neuro} />
        </div>

        {/* Right column: Journal + Stream */}
        <div className="flex-1 flex flex-col gap-4">
          {/* GIM Journal */}
          <div className="bg-zinc-800 rounded-xl p-4">
            <SectionHeader
              icon={<Brain className="w-4 h-4 text-purple-400" />}
              title="Internal Monologue"
              onRefresh={fetchGim}
              loading={loadingGim}
            />
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-600">
              {gimEntries.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No GIM entries found.</p>
              ) : (
                gimEntries.map((entry, i) => (
                  <div key={i} className="bg-zinc-900 rounded-lg p-3 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {entry}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stream of Consciousness */}
          <div className="bg-zinc-800 rounded-xl p-4">
            <SectionHeader
              icon={<Zap className="w-4 h-4 text-yellow-400" />}
              title="Stream"
              onRefresh={fetchStream}
              loading={loadingStream}
            />
            <div className="max-h-56 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-600 font-mono space-y-1">
              {streamLines.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No stream entries found.</p>
              ) : (
                streamLines.map((line, i) => (
                  <div key={i} className="text-xs text-emerald-400 leading-relaxed">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
