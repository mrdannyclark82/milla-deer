import {
  BEDROOM_HOTSPOTS,
  type RoomHotspot,
  type RoomHotspotId,
} from '@/types/room';

const STORAGE_KEY = 'milla.room.hotspots.v2';
const LEGACY_STORAGE_KEY = 'milla.room.hotspots.v1';
const CALIBRATION_KEY = 'milla.room.hotspots.calibration';
const CALIBRATION_ID = 'peek2-touch-zones-v2';

type HotspotOverrides = Partial<
  Record<
    RoomHotspotId,
    Partial<Pick<RoomHotspot, 'left' | 'top' | 'width' | 'height'>>
  >
>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function loadRoomHotspots(): RoomHotspot[] {
  const defaults = BEDROOM_HOTSPOTS.map((spot) => ({ ...spot }));

  if (typeof window === 'undefined') {
    return defaults;
  }

  if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
  if (localStorage.getItem(CALIBRATION_KEY) !== CALIBRATION_ID) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(CALIBRATION_KEY, CALIBRATION_ID);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const overrides = JSON.parse(raw) as HotspotOverrides;

    return defaults.map((spot) => {
      const patch = overrides[spot.id];
      if (!patch) return spot;
      return {
        ...spot,
        left: clamp(patch.left ?? spot.left, 0, 95),
        top: clamp(patch.top ?? spot.top, 0, 95),
        width: clamp(patch.width ?? spot.width, 4, 90),
        height: clamp(patch.height ?? spot.height, 4, 90),
      };
    });
  } catch {
    return defaults;
  }
}

export function saveRoomHotspot(
  id: RoomHotspotId,
  patch: Partial<Pick<RoomHotspot, 'left' | 'top' | 'width' | 'height'>>
): RoomHotspot[] {
  if (typeof window === 'undefined') {
    return loadRoomHotspots();
  }

  const current = loadRoomHotspots();
  const existing = current.find((spot) => spot.id === id);
  const nextSpot = {
    ...existing!,
    ...patch,
    left: clamp(patch.left ?? existing!.left, 0, 95),
    top: clamp(patch.top ?? existing!.top, 0, 95),
    width: clamp(patch.width ?? existing!.width, 4, 90),
    height: clamp(patch.height ?? existing!.height, 4, 90),
  };

  let overrides: HotspotOverrides = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    overrides = raw ? (JSON.parse(raw) as HotspotOverrides) : {};
  } catch {
    overrides = {};
  }

  overrides[id] = {
    left: nextSpot.left,
    top: nextSpot.top,
    width: nextSpot.width,
    height: nextSpot.height,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  window.dispatchEvent(new CustomEvent('millaRoomHotspotsUpdated'));
  return loadRoomHotspots();
}

export function resetRoomHotspots(): RoomHotspot[] {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('millaRoomHotspotsUpdated'));
  }
  return BEDROOM_HOTSPOTS.map((spot) => ({ ...spot }));
}

export function onRoomHotspotsChange(
  callback: (hotspots: RoomHotspot[]) => void
) {
  if (typeof window === 'undefined') return () => {};

  const handler = () => callback(loadRoomHotspots());
  window.addEventListener('millaRoomHotspotsUpdated', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('millaRoomHotspotsUpdated', handler);
    window.removeEventListener('storage', handler);
  };
}
