import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FusionTelemetrySnapshot } from './dashboardTypes';

type NoticeTone = 'warning' | 'error' | 'info';

interface FusionMetricsPanelProps {
  formatTimestamp: (value: number | null) => string;
  fusionError: string | null;
  fusionSnapshot: FusionTelemetrySnapshot | null;
  isFusionLoading: boolean;
  refreshFusionSnapshot: () => Promise<void>;
  renderPanelNotice: (message: string, tone?: NoticeTone) => ReactNode;
}

export function FusionMetricsPanel({
  formatTimestamp,
  fusionError,
  fusionSnapshot,
  isFusionLoading,
  refreshFusionSnapshot,
  renderPanelNotice,
}: FusionMetricsPanelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(0,242,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">Fusion telemetry</h4>
          <p className="mt-2 text-sm text-white/65">
            Live browser/mobile handoff state, backend routing, and latency
            estimates.
          </p>
        </div>
        <button
          onClick={() => void refreshFusionSnapshot()}
          disabled={isFusionLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${isFusionLoading ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      {fusionError ? renderPanelNotice(fusionError, 'warning') : null}
      {!fusionSnapshot && isFusionLoading
        ? renderPanelNotice('Refreshing fusion telemetry...')
        : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Active devices
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {fusionSnapshot?.summary.activeDeviceCount ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Recent handoffs
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {fusionSnapshot?.summary.recentHandoffCount ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Avg latency
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {fusionSnapshot?.summary.averageEstimatedLatencyMs ?? 0}ms
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Last sync
          </div>
          <div className="mt-2 text-sm font-medium text-white/85">
            {formatTimestamp(fusionSnapshot?.generatedAt ?? null)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Active surfaces
          </div>
          <div className="mt-3 grid gap-2 text-sm text-white/80">
            <div>
              Web: {fusionSnapshot?.summary.surfaceBreakdown.web ?? 0}
            </div>
            <div>
              Mobile: {fusionSnapshot?.summary.surfaceBreakdown.mobile ?? 0}
            </div>
            <div>
              Server: {fusionSnapshot?.summary.surfaceBreakdown.server ?? 0}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Backend mix
          </div>
          <div className="mt-3 grid gap-2 text-sm text-white/80">
            {Object.entries(fusionSnapshot?.summary.backendBreakdown ?? {}).map(
              ([backend, count]) => (
                <div key={backend}>
                  {backend}: {count}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-4">
        <div className="text-xs uppercase tracking-[0.2em] text-white/45">
          Recent decisions
        </div>
        <div className="mt-3 space-y-3">
          {fusionSnapshot?.recentHandoffs.length ? (
            fusionSnapshot.recentHandoffs.slice(0, 4).map((handoff) => (
              <div
                key={handoff.handoffId}
                className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-white">
                    {handoff.currentSurface} {'->'} {handoff.targetSurface}
                  </div>
                  <div className="rounded-full border border-cyan-300/20 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">
                    {handoff.targetBackend}
                  </div>
                </div>
                <div className="mt-2 text-sm text-white/80">{handoff.reason}</div>
                <div className="mt-2 text-xs text-white/55">
                  {handoff.intent} • {handoff.estimatedLatencyMs}ms • confidence{' '}
                  {Math.round(handoff.confidence * 100)}%
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-white/60">
              No handoff decisions have been recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
