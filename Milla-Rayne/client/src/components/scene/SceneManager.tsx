/**
 * SceneManager - Main adaptive scene orchestrator
 * Manages scene layers and applies theming based on context
 */

import React, { useEffect, useState } from 'react';
import { BackgroundLayer } from './BackgroundLayer';
import { AmbientGradientLayer } from './AmbientGradientLayer';
import { ParallaxLayer } from './ParallaxLayer';
import { WeatherLayer } from './WeatherLayer';
import { useSceneContext } from '@/contexts/SceneContext';
import {
  loadSceneSettings,
  onSettingsChange,
} from '@/utils/sceneSettingsStore';
import { getInteractiveRoomPanelCss } from '@/utils/interactiveRoomLayout';

interface SceneManagerProps {
  className?: string;
}

export function SceneManager({ className = '' }: SceneManagerProps) {
  const { theme, location } = useSceneContext();
  const [settings, setSettings] = useState(loadSceneSettings);

  useEffect(() => onSettingsChange(setSettings), []);

  const bedroomInteractive =
    location === 'bedroom' && (settings.interactiveRoomEnabled ?? true);
  const avatarMode = settings.interactiveRoomAvatarMode ?? true;

  if (bedroomInteractive && avatarMode) {
    return null;
  }

  const panelWidth = bedroomInteractive
    ? getInteractiveRoomPanelCss(settings)
    : '66.6667vw';

  return (
    <div
      className={`scene-manager ${className}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: panelWidth,
        height: '100vh',
        transition: 'width 0.35s ease',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden="true"
      role="presentation"
    >
      {/* Background image layer */}
      <BackgroundLayer />
      <AmbientGradientLayer theme={theme} />
      <ParallaxLayer intensity={0} />
      <WeatherLayer />
    </div>
  );
}
