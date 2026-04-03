import type { ReactNode } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { CollaborationSchedulerState } from './dashboardTypes';

type NoticeTone = 'warning' | 'error' | 'info';

interface CollaborationPanelProps {
  collaborationCronDraft: string;
  collaborationError: string | null;
  collaborationScheduler: CollaborationSchedulerState | null;
  formatTimestamp: (value: number | null) => string;
  isCollaborationLoading: boolean;
  refreshCollaborationScheduler: () => Promise<void>;
  renderPanelNotice: (message: string, tone?: NoticeTone) => ReactNode;
  setCollaborationCronDraft: (value: string) => void;
  triggerCollaborationCycleFromDashboard: () => Promise<void>;
  updateCollaborationScheduleFromDashboard: (input: {
    enabled?: boolean;
    cron?: string;
  }) => Promise<void>;
}

export function CollaborationPanel({
  collaborationCronDraft,
  collaborationError,
  collaborationScheduler,
  formatTimestamp,
  isCollaborationLoading,
  refreshCollaborationScheduler,
  renderPanelNotice,
  setCollaborationCronDraft,
  triggerCollaborationCycleFromDashboard,
  updateCollaborationScheduleFromDashboard,
}: CollaborationPanelProps) {
  const latestReport = collaborationScheduler?.latestReport;
  const topRecommendation = latestReport?.proactive.topRecommendations[0] || null;
  const plannerSuggestion = latestReport?.sarii.suggestion;
  const dailyReportTitle =
    plannerSuggestion?.feature_name || topRecommendation || 'Daily collaboration report';
  const dailyReportRecommendation =
    plannerSuggestion?.reasoning ||
    (topRecommendation
      ? `Keep proactive discovery running daily and review ${topRecommendation} as the next feature candidate.`
      : 'Keep proactive discovery running daily and review the top recommended feature for sandbox implementation.');
  const dailyReportAction = topRecommendation
    ? `Review ${topRecommendation} in the proactive workflow and decide whether it should move into a sandbox implementation run.`
    : 'Run the collaboration cycle again after proactive discovery has refreshed to generate the next recommended feature.';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(0,242,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">
            Collaboration cycle
          </h4>
          <p className="mt-2 text-sm text-white/65">
            SARIi planner + proactive repository discovery + coding-agent
            handoff on a cron schedule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void triggerCollaborationCycleFromDashboard()}
            disabled={isCollaborationLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#00f2ff]/30 bg-[#00f2ff]/10 px-3 py-2 text-xs font-medium text-[#b8f8ff] transition hover:bg-[#00f2ff]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {isCollaborationLoading ? 'Running...' : 'Run updates now'}
          </button>
          <button
            onClick={() => void refreshCollaborationScheduler()}
            disabled={isCollaborationLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isCollaborationLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {collaborationError ? renderPanelNotice(collaborationError, 'warning') : null}
      {!collaborationScheduler && isCollaborationLoading
        ? renderPanelNotice('Loading collaboration cycle status...')
        : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Schedule
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {collaborationScheduler?.isScheduled ? 'Scheduled' : 'Paused'}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {collaborationScheduler?.settings.timezone || 'America/Chicago'} •{' '}
            {collaborationScheduler?.settings.cron || collaborationCronDraft}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Latest run
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {collaborationScheduler?.lastSuccessAt ? 'Healthy' : 'Pending'}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {collaborationScheduler?.lastError ||
              `Last success ${formatTimestamp(collaborationScheduler?.lastSuccessAt ?? null)}`}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          value={collaborationCronDraft}
          onChange={(event) => setCollaborationCronDraft(event.target.value)}
          className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white outline-none transition focus:border-[#00f2ff]/30"
          placeholder="0 8 * * *"
        />
        <button
          onClick={() =>
            void updateCollaborationScheduleFromDashboard({
              enabled: true,
              cron: collaborationCronDraft,
            })
          }
          disabled={isCollaborationLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save cron
        </button>
        <button
          onClick={() =>
            void updateCollaborationScheduleFromDashboard({
              enabled: !(collaborationScheduler?.settings.enabled ?? true),
            })
          }
          disabled={isCollaborationLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {(collaborationScheduler?.settings.enabled ?? true)
            ? 'Pause cycle'
            : 'Resume cycle'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/80">
        <div className="text-xs uppercase tracking-[0.2em] text-white/45">
          Collaboration path
        </div>
        <div className="mt-2">
          This cycle uses proactive repository discovery first, then asks
          SARIi&apos;s planner for the next high-value idea. Approved follow-up
          work can be sent into the coding-agent sandbox flow.
        </div>
      </div>

      {collaborationScheduler?.latestReport ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/70">
                  Daily collaboration report
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {dailyReportTitle}
                </div>
              </div>
              <div className="rounded-full border border-cyan-300/20 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">
                {formatTimestamp(latestReport?.generatedAt ?? null)}
              </div>
            </div>

            <div className="mt-3 text-sm text-white/85">
              {dailyReportRecommendation}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                  Top recommendation
                </div>
                <div className="mt-2 text-sm font-medium text-white/90">
                  {topRecommendation || 'Waiting for proactive discovery output.'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                  Next action
                </div>
                <div className="mt-2 text-sm text-white/80">{dailyReportAction}</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-cyan-50/70">
              {latestReport?.sarii.syncedFeatureId
                ? `Planner recommendation synced as ${latestReport.sarii.syncedFeatureId}.`
                : latestReport?.sarii.success
                  ? 'Planner output is available for review and can be promoted into sandbox work.'
                  : 'Planner output is unavailable, so the report is using the proactive recommendation fallback.'}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              Proactive summary
            </div>
            <div className="mt-2 text-sm text-white/85">
              {collaborationScheduler.latestReport.proactive.discoveredCount}{' '}
              discovered •{' '}
              {collaborationScheduler.latestReport.proactive.recommendedCount}{' '}
              recommended
            </div>
            <div className="mt-2 text-xs text-white/45">
              {collaborationScheduler.latestReport.proactive.topRecommendations.join(
                ', '
              ) || 'No top recommendations yet.'}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              SARIi recommendation
            </div>
            <div className="mt-2 text-sm text-white/85">
              {collaborationScheduler.latestReport.sarii.suggestion?.feature_name ||
                'No recommendation generated yet.'}
            </div>
            <div className="mt-2 text-xs text-white/55">
              {collaborationScheduler.latestReport.sarii.suggestion?.reasoning ||
                collaborationScheduler.latestReport.sarii.error ||
                'Waiting for planner output.'}
            </div>
            <div className="mt-3 text-xs text-white/45">
              {collaborationScheduler.latestReport.sarii.syncedFeatureId
                ? `Synced into proactive discovery as ${collaborationScheduler.latestReport.sarii.syncedFeatureId}`
                : collaborationScheduler.latestReport.sarii.success
                  ? 'Planner output is advisory only until it is synced into proactive discovery.'
                  : 'Planner output could not be synced yet.'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
