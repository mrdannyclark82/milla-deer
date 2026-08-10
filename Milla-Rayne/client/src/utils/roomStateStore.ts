import type { RoomHotspotId, RoomState } from '@/types/room';

const STORAGE_KEY = 'milla.room.state.v1';

export function getDefaultRoomState(): RoomState {
  return {
    lampOn: true,
    bedMessy: false,
    clothesScattered: false,
    millaEngaged: false,
    updatedAt: Date.now(),
  };
}

export function loadRoomState(): RoomState {
  if (typeof window === 'undefined') {
    return getDefaultRoomState();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultRoomState();
    const parsed = JSON.parse(raw) as Partial<RoomState>;
    return {
      ...getDefaultRoomState(),
      ...parsed,
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return getDefaultRoomState();
  }
}

export function saveRoomState(state: RoomState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function updateRoomState(partial: Partial<RoomState>): RoomState {
  const next = { ...loadRoomState(), ...partial, updatedAt: Date.now() };
  saveRoomState(next);
  window.dispatchEvent(
    new CustomEvent('millaRoomStateUpdated', { detail: next })
  );
  return next;
}

export function onRoomStateChange(
  callback: (state: RoomState) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    const custom = event as CustomEvent<RoomState>;
    callback(custom.detail ?? loadRoomState());
  };

  window.addEventListener('millaRoomStateUpdated', handler);
  window.addEventListener('storage', () => callback(loadRoomState()));
  return () => window.removeEventListener('millaRoomStateUpdated', handler);
}

export function dispatchRoomChatMessage(
  message: string,
  hotspot: RoomHotspotId
) {
  window.dispatchEvent(
    new CustomEvent('millaRoomInteraction', {
      detail: { message, hotspot, role: 'assistant' as const },
    })
  );
}
