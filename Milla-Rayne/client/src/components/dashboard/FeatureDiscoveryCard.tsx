import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ProactiveFeature } from './dashboardTypes';

interface FeatureDiscoveryCardProps {
  discoveredFeatures: ProactiveFeature[];
  featureDiscoveryError: string | null;
  formatFeatureSource: (source: ProactiveFeature['source']) => string;
  formatFeatureStatus: (status: ProactiveFeature['status']) => string;
  isFeatureDiscoveryLoading: boolean;
  recommendedFeatures: ProactiveFeature[];
  refreshFeatureDiscovery: () => Promise<void>;
  renderFeatureActions: (
    feature: ProactiveFeature,
    accent: 'pink' | 'cyan'
  ) => ReactNode;
}

export function FeatureDiscoveryCard({
  discoveredFeatures,
  featureDiscoveryError,
  formatFeatureSource,
  formatFeatureStatus,
  isFeatureDiscoveryLoading,
  recommendedFeatures,
  refreshFeatureDiscovery,
  renderFeatureActions,
}: FeatureDiscoveryCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(255,0,170,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">
            Feature discovery
          </h4>
          <p className="mt-2 text-sm text-white/65">
            See what the proactive system pulled in from GitHub and which
            features it currently recommends.
          </p>
        </div>
        <button
          onClick={() => void refreshFeatureDiscovery()}
          disabled={isFeatureDiscoveryLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              isFeatureDiscoveryLoading ? 'animate-spin' : ''
            }`}
          />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Discovered
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {discoveredFeatures.length}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Recommended
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {recommendedFeatures.length}
          </div>
        </div>
      </div>

      {featureDiscoveryError ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {featureDiscoveryError}
        </div>
      ) : null}

      <div className="mt-5 space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-white/85">
              Top recommendations
            </h5>
            <span className="text-xs text-white/40">Ready to review</span>
          </div>

          <div className="mt-3 space-y-3">
            {recommendedFeatures.length > 0 ? (
              recommendedFeatures.map((feature) => (
                <div
                  key={`recommended-${feature.id}`}
                  className="rounded-xl border border-[#ff00aa]/15 bg-[#ff00aa]/5 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {feature.name}
                    </span>
                    <span className="rounded-full border border-[#ff00aa]/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#ff9dda]">
                      {formatFeatureStatus(feature.status)}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55">
                      {formatFeatureSource(feature.source)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-white/70">
                    {feature.description}
                  </p>
                  <div className="mt-2 text-xs text-white/45">
                    Relevance {feature.relevance}/10 · Value{' '}
                    {feature.estimatedValue}/10
                    {feature.repositoryExample
                      ? ` · Inspired by ${feature.repositoryExample}`
                      : ''}
                  </div>
                  {renderFeatureActions(feature, 'pink')}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
                No recommended features yet.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-white/85">
              Recently discovered
            </h5>
            <span className="text-xs text-white/40">Showing top 5</span>
          </div>

          <div className="mt-3 space-y-3">
            {discoveredFeatures.slice(0, 5).map((feature) => (
              <div
                key={`discovered-${feature.id}`}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {feature.name}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55">
                    {formatFeatureStatus(feature.status)}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55">
                    {feature.implementationComplexity}
                  </span>
                </div>
                <div className="mt-2 text-xs text-white/45">
                  Popularity {feature.popularity}/10 · Relevance{' '}
                  {feature.relevance}/10
                  {feature.repositoryExample
                    ? ` · ${feature.repositoryExample}`
                    : ''}
                </div>
                {feature.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {feature.tags.map((tag) => (
                      <span
                        key={`${feature.id}-${tag}`}
                        className="rounded-full border border-[#00f2ff]/20 bg-[#00f2ff]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#9ef6ff]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {renderFeatureActions(feature, 'cyan')}
              </div>
            ))}

            {discoveredFeatures.length === 0 &&
            !isFeatureDiscoveryLoading &&
            !featureDiscoveryError ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
                No discovered features are stored yet.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
