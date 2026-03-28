import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { SystemConfigStatus } from './dashboardTypes';

type NoticeTone = 'warning' | 'error' | 'info';

interface IntegrationHealthCardProps {
  isSystemConfigLoading: boolean;
  refreshSystemConfigStatus: () => Promise<void>;
  renderPanelNotice: (message: string, tone?: NoticeTone) => ReactNode;
  systemConfigError: string | null;
  systemConfigStatus: SystemConfigStatus | null;
}

export function IntegrationHealthCard({
  isSystemConfigLoading,
  refreshSystemConfigStatus,
  renderPanelNotice,
  systemConfigError,
  systemConfigStatus,
}: IntegrationHealthCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(255,0,170,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">
            Integration health
          </h4>
          <p className="mt-2 text-sm text-white/65">
            Runtime status for GitHub, desktop-local AI, proactive services,
            and self-healing config warnings.
          </p>
        </div>
        <button
          onClick={() => void refreshSystemConfigStatus()}
          disabled={isSystemConfigLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10"
        >
          <RefreshCw
            className={`h-4 w-4 ${isSystemConfigLoading ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      {systemConfigError ? renderPanelNotice(systemConfigError, 'warning') : null}
      {!systemConfigStatus && isSystemConfigLoading
        ? renderPanelNotice('Loading integration health...')
        : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Desktop local AI
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {systemConfigStatus?.integrationChecks?.localModel?.enabled
              ? systemConfigStatus?.integrationChecks?.localModel?.available
                ? systemConfigStatus?.integrationChecks?.localModel?.preferLocal
                  ? 'Local-first'
                  : 'Fallback ready'
                : 'Setup needed'
              : 'Disabled'}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {systemConfigStatus?.integrationChecks?.localModel?.available
              ? `${systemConfigStatus.integrationChecks.localModel.activeModel || systemConfigStatus.integrationChecks.localModel.requestedModel} • ${systemConfigStatus.integrationChecks.localModel.host}`
              : systemConfigStatus?.integrationChecks?.localModel?.enabled
                ? `${systemConfigStatus.integrationChecks.localModel.requestedModel} • ${systemConfigStatus.integrationChecks.localModel.host}`
                : 'Enable local model support to use Ollama-backed desktop inference'}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            GitHub
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {systemConfigStatus?.integrationChecks?.github?.valid
              ? 'Connected'
              : systemConfigStatus?.integrationChecks?.github?.configured
                ? 'Needs attention'
                : 'Not configured'}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {systemConfigStatus?.integrationChecks?.github?.error ||
              systemConfigStatus?.integrationChecks?.github?.scopes
                ?.slice(0, 3)
                .join(', ') ||
              'No GitHub scopes detected'}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Proactive
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {systemConfigStatus?.integrationChecks?.proactive?.reachable
              ? 'Reachable'
              : 'Unavailable'}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {systemConfigStatus?.integrationChecks?.proactive?.error ||
              systemConfigStatus?.integrations?.proactiveBaseUrl ||
              'Proactive base URL unavailable'}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Consciousness
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {systemConfigStatus?.integrationChecks?.consciousness?.replycaResolved
              ? 'Scheduled'
              : 'Blocked'}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {systemConfigStatus?.integrationChecks?.consciousness?.cycles?.gim
              ?.lastError ||
              systemConfigStatus?.integrationChecks?.consciousness?.cycles?.rem
                ?.lastError ||
              `GIM ${systemConfigStatus?.integrationChecks?.consciousness?.gimCron || 'n/a'} • REM ${systemConfigStatus?.integrationChecks?.consciousness?.remCron || 'n/a'}`}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <div className="text-xs uppercase tracking-[0.2em] text-white/45">
          Repo discovery
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {systemConfigStatus?.integrationChecks?.repositoryDiscovery?.isScheduled
            ? 'Scheduled'
            : 'Idle'}
        </div>
        <div className="mt-2 text-xs text-white/45">
          {systemConfigStatus?.integrationChecks?.repositoryDiscovery?.lastError ||
            `${systemConfigStatus?.integrationChecks?.repositoryDiscovery?.cron || 'n/a'} • ${systemConfigStatus?.integrationChecks?.repositoryDiscovery?.maxReposPerCycle || 0} repos/cycle`}
        </div>
      </div>

      {systemConfigStatus?.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {systemConfigStatus.warnings.slice(0, 4).map((warning) => (
            <div
              key={warning}
              className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
            >
              {warning}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
