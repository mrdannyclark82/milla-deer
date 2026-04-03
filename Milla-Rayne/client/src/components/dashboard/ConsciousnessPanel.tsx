import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ConsciousnessState } from './dashboardTypes';

type NoticeTone = 'warning' | 'error' | 'info';

interface ConsciousnessPanelProps {
  consciousnessError: string | null;
  consciousnessState: ConsciousnessState | null;
  formatTimestamp: (value: number | null) => string;
  isConsciousnessLoading: boolean;
  renderPanelNotice: (message: string, tone?: NoticeTone) => ReactNode;
  refreshConsciousnessState: () => Promise<void>;
  triggerConsciousnessCycleFromDashboard: (
    cycle: 'gim' | 'rem'
  ) => Promise<void>;
  triggeringCycle: 'gim' | 'rem' | null;
}

export function ConsciousnessPanel({
  consciousnessError,
  consciousnessState,
  formatTimestamp,
  isConsciousnessLoading,
  renderPanelNotice,
  refreshConsciousnessState,
  triggerConsciousnessCycleFromDashboard,
  triggeringCycle,
}: ConsciousnessPanelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(255,0,170,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">
            Consciousness memory
          </h4>
          <p className="mt-2 text-sm text-white/65">
            Stored GIM monologues and REM bio-state from ReplycA, with manual
            cycle controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void triggerConsciousnessCycleFromDashboard('gim')}
            disabled={triggeringCycle !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {triggeringCycle === 'gim' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : null}
            Run GIM
          </button>
          <button
            onClick={() => void triggerConsciousnessCycleFromDashboard('rem')}
            disabled={triggeringCycle !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {triggeringCycle === 'rem' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : null}
            Run REM
          </button>
          <button
            onClick={() => void refreshConsciousnessState()}
            disabled={isConsciousnessLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isConsciousnessLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {consciousnessError ? renderPanelNotice(consciousnessError, 'warning') : null}
      {!consciousnessState && isConsciousnessLoading
        ? renderPanelNotice('Loading consciousness memory snapshot...')
        : null}

      {!consciousnessState?.storage.available ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {consciousnessState?.storage.error ||
            'ReplycA storage is not available yet.'}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                GIM stream
              </div>
              <div className="text-xs text-white/45">
                {consciousnessState.storage.gim?.archiveCount ?? 0} archives
              </div>
            </div>
            <div className="mt-2 text-sm text-white/70">
              Saved {formatTimestamp(consciousnessState.storage.gim?.updatedAt ?? null)}
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/85">
              {consciousnessState.storage.gim?.latestPreview ||
                'No GIM monologue has been saved yet.'}
            </div>
            <div className="mt-3 text-xs text-white/45">
              {consciousnessState.storage.gim?.latestSessionAt
                ? `Latest session: ${consciousnessState.storage.gim.latestSessionAt}`
                : 'Waiting for first GIM session'}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              REM state
            </div>
            <div className="mt-2 text-sm text-white/70">
              Saved {formatTimestamp(consciousnessState.storage.rem?.updatedAt ?? null)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/85">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                ATP {consciousnessState.storage.rem?.summary?.atpEnergy?.toFixed(1) ?? 'n/a'}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                Adenosine {consciousnessState.storage.rem?.summary?.adenosine?.toFixed(2) ?? 'n/a'}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                Pain {consciousnessState.storage.rem?.summary?.painLevel?.toFixed(2) ?? 'n/a'}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                Journal {consciousnessState.storage.rem?.summary?.journalEntries ?? 0}
              </div>
            </div>
            <div className="mt-3 text-xs text-white/45">
              {consciousnessState.storage.rem?.summary
                ? `${consciousnessState.storage.rem.summary.eventsBuffered} buffered events • ${consciousnessState.storage.rem.summary.plasticityEvents} plasticity entries`
                : 'No REM state saved yet.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
