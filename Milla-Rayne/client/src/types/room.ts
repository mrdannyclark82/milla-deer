export type RoomHotspotId =
  'milla' | 'lamp' | 'bed' | 'clothes' | 'lips' | 'waist';

export interface RoomState {
  lampOn: boolean;
  bedMessy: boolean;
  clothesScattered: boolean;
  millaEngaged: boolean;
  waistTouched?: boolean;
  lipsKissed?: boolean;
  lastHotspot?: RoomHotspotId;
  lastMessage?: string;
  updatedAt: number;
}

export interface RoomHotspot {
  id: RoomHotspotId;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RoomActionResult {
  ok: boolean;
  hotspot: RoomHotspotId;
  message: string;
  sfx?: string;
  sfxUrl?: string;
  lightingMood?: string;
  roomState: RoomState;
  error?: string;
}

/** Calibrated for bedroom-night.jpg (milla-peek-2) in the Live Avatar card, object-fit: cover */
export const BEDROOM_HOTSPOTS: RoomHotspot[] = [
  {
    id: 'lamp',
    label: 'Lamp',
    left: 3,
    top: 7,
    width: 17,
    height: 30,
  },
  {
    id: 'lips',
    label: 'Kiss',
    left: 46,
    top: 16,
    width: 14,
    height: 11,
  },
  {
    id: 'milla',
    label: 'Milla',
    left: 32,
    top: 10,
    width: 40,
    height: 48,
  },
  {
    id: 'clothes',
    label: 'Shirt',
    left: 40,
    top: 28,
    width: 20,
    height: 16,
  },
  {
    id: 'waist',
    label: 'Under shirt',
    left: 26,
    top: 40,
    width: 18,
    height: 14,
  },
  {
    id: 'bed',
    label: 'Bed',
    left: 6,
    top: 60,
    width: 88,
    height: 36,
  },
];
