import { ExternalLink, Link2, RefreshCw, Unplug } from 'lucide-react';

interface GoogleSyncCardProps {
  googleActionError: string | null;
  handleGoogleConnect: () => void;
  handleGoogleDisconnect: () => void;
  isGoogleActionLoading: boolean;
  isGoogleConnected: boolean;
  logActivity: (message: string) => void;
  refreshGoogleConnectionState: () => void;
  renderPanelNotice: (
    message: string,
    tone?: 'warning' | 'error' | 'info'
  ) => React.ReactNode;
  setActiveSection: (section: string) => void;
}

export function GoogleSyncCard({
  googleActionError,
  handleGoogleConnect,
  handleGoogleDisconnect,
  isGoogleActionLoading,
  isGoogleConnected,
  logActivity,
  refreshGoogleConnectionState,
  renderPanelNotice,
  setActiveSection,
}: GoogleSyncCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(0,242,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">Google sync</h4>
          <p className="mt-2 text-sm text-white/65">
            Connect Google once to sync Gmail, Tasks, and YouTube features from
            the dashboard.
          </p>
        </div>
        <div
          className={`mt-1 h-3 w-3 rounded-full ${
            isGoogleConnected
              ? 'bg-[#00f2ff] shadow-[0_0_18px_rgba(0,242,255,0.95)]'
              : 'bg-white/20'
          }`}
          aria-hidden="true"
        />
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
        {isGoogleConnected
          ? 'Google is connected and ready to sync.'
          : 'Google is not connected yet.'}
      </div>

      {googleActionError ? renderPanelNotice(googleActionError, 'warning') : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={isGoogleConnected ? handleGoogleDisconnect : handleGoogleConnect}
          disabled={isGoogleActionLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-[#00f2ff]/30 bg-[#00f2ff]/10 px-4 py-2 text-sm font-medium text-[#b8f8ff] transition hover:bg-[#00f2ff]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGoogleConnected ? (
            <Unplug className="h-4 w-4" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          {isGoogleActionLoading
            ? 'Working...'
            : isGoogleConnected
              ? 'Disconnect Google'
              : 'Connect Google'}
        </button>

        <button
          onClick={refreshGoogleConnectionState}
          disabled={isGoogleActionLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${isGoogleActionLoading ? 'animate-spin' : ''}`}
          />
          Sync status
        </button>

        {isGoogleConnected ? (
          <button
            onClick={() => {
              setActiveSection('gmail');
              logActivity('Opened Gmail & Tasks');
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
          >
            <ExternalLink className="h-4 w-4" />
            Open Gmail & Tasks
          </button>
        ) : null}
      </div>
    </div>
  );
}
