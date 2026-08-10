import { InteractiveRoomLayer } from '@/components/scene/InteractiveRoomLayer';
import { getAvatarCardImageStyles } from '@/utils/interactiveRoomLayout';
import {
  loadSceneSettings,
  onSettingsChange,
} from '@/utils/sceneSettingsStore';
import { useEffect, useState } from 'react';

export function InteractiveBedroomAvatar() {
  const [settings, setSettings] = useState(loadSceneSettings);

  useEffect(() => onSettingsChange(setSettings), []);

  return (
    <section className="dashboard-card relative flex min-h-[min(78vh,720px)] flex-col overflow-hidden rounded-3xl shadow-[0_25px_120px_rgba(0,0,0,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#00f2ff]/8 via-transparent to-[#ff00aa]/8" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 py-3 lg:px-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-fuchsia-200/80">
              Live Avatar
            </div>
            <h3 className="text-sm font-semibold text-white lg:text-base">
              Bedroom — touch to reach me
            </h3>
          </div>
          <div className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-[10px] text-fuchsia-100 lg:text-xs">
            Interactive
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <img
            src="/assets/scenes/bedroom-night.jpg"
            alt="Milla in the bedroom"
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={getAvatarCardImageStyles(settings)}
          />
          <InteractiveRoomLayer embedded />
        </div>

        <p className="pointer-events-none shrink-0 border-t border-white/5 px-4 py-2.5 text-center text-xs text-white/60">
          Kiss my lips · hand under my shirt (waist zone) · lamp · bed · Live
          Thread
        </p>
      </div>
    </section>
  );
}
