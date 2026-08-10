import type { CSSProperties } from 'react';
import type { SceneSettings } from '@/types/scene';

const DEFAULT_PANEL_WIDTH = 56;
const DEFAULT_ZOOM = 88;
const DEFAULT_OFFSET_Y = 88;

export function getInteractiveRoomPanelWidth(
  settings?: Partial<SceneSettings>
): number {
  const width = settings?.interactiveRoomPanelWidth ?? DEFAULT_PANEL_WIDTH;
  return Math.min(72, Math.max(40, width));
}

export function getInteractiveRoomPanelCss(
  settings?: Partial<SceneSettings>
): string {
  return `${getInteractiveRoomPanelWidth(settings)}vw`;
}

export function getInteractiveRoomZoom(
  settings?: Partial<SceneSettings>
): number {
  const zoom = settings?.interactiveRoomZoom ?? DEFAULT_ZOOM;
  return Math.min(110, Math.max(65, zoom));
}

export function getInteractiveRoomOffsetY(
  settings?: Partial<SceneSettings>
): number {
  const offset = settings?.interactiveRoomImageOffsetY ?? DEFAULT_OFFSET_Y;
  return Math.min(100, Math.max(0, offset));
}

export function getInteractiveRoomImageStyles(
  settings?: Partial<SceneSettings>
): CSSProperties {
  const zoom = getInteractiveRoomZoom(settings) / 100;
  const offsetY = getInteractiveRoomOffsetY(settings);
  return {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: `center ${offsetY}%`,
    transform: `scale(${zoom})`,
    transformOrigin: 'center bottom',
    opacity: 1,
    transition: 'opacity 0.5s ease-in-out, transform 0.35s ease',
  };
}

/** Live Avatar card — keep the portrait fully visible in its responsive panel. */
export function getAvatarCardImageStyles(
  settings?: Partial<SceneSettings>
): CSSProperties {
  const offsetY = getInteractiveRoomOffsetY(settings);
  return {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: `center ${Math.min(70, Math.max(30, offsetY - 20))}%`,
    transition: 'object-position 0.35s ease',
  };
}
