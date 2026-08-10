import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RoomHotspot, RoomHotspotId, RoomState } from '@/types/room';
import {
  dispatchRoomChatMessage,
  loadRoomState,
  onRoomStateChange,
  updateRoomState,
} from '@/utils/roomStateStore';
import {
  loadSceneSettings,
  onSettingsChange,
  updateSceneSettings,
} from '@/utils/sceneSettingsStore';
import { useSceneContext } from '@/contexts/SceneContext';
import { getInteractiveRoomPanelCss } from '@/utils/interactiveRoomLayout';
import {
  loadRoomHotspots,
  onRoomHotspotsChange,
  resetRoomHotspots,
  saveRoomHotspot,
} from '@/utils/roomHotspotStore';
import { speakRoomLine } from '@/utils/roomVoice';

async function playRoomSfx(sfx?: string, sfxUrl?: string) {
  if (!sfx && !sfxUrl) return;
  const url = sfxUrl || (sfx ? `/api/milla/room/sfx/${sfx}` : null);
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.85;
    await audio.play();
  } catch (err) {
    console.warn('Room sfx playback failed:', err);
  }
}

function dispatchLightingMood(mood?: string) {
  if (!mood) return;
  window.dispatchEvent(
    new CustomEvent('millaLightingMood', { detail: { mood } })
  );
}

type EditorDrag = {
  id: RoomHotspotId;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
  origWidth: number;
  origHeight: number;
};

interface InteractiveRoomLayerProps {
  /** When true, fills the Live Avatar card instead of the full left viewport */
  embedded?: boolean;
}

export function InteractiveRoomLayer({
  embedded = false,
}: InteractiveRoomLayerProps) {
  const { location } = useSceneContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState(loadSceneSettings);
  const [hotspots, setHotspots] = useState(loadRoomHotspots);
  const [roomState, setRoomState] = useState<RoomState>(loadRoomState);
  const [hovered, setHovered] = useState<RoomHotspotId | null>(null);
  const [busy, setBusy] = useState<RoomHotspotId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editorDrag, setEditorDrag] = useState<EditorDrag | null>(null);
  const [editorDraft, setEditorDraft] = useState<RoomHotspot[] | null>(null);

  useEffect(() => onRoomStateChange(setRoomState), []);
  useEffect(() => onSettingsChange(setSettings), []);
  useEffect(() => onRoomHotspotsChange(setHotspots), []);

  const enabled = useMemo(
    () =>
      settings.enabled &&
      (settings.interactiveRoomEnabled ?? true) &&
      location === 'bedroom',
    [settings, location]
  );

  const avatarMode = settings.interactiveRoomAvatarMode ?? true;
  const isEmbedded = embedded || avatarMode;
  const editorMode =
    enabled && (settings.interactiveRoomHotspotEditor ?? false);
  const displayHotspots = editorDraft ?? hotspots;
  const panelWidth = getInteractiveRoomPanelCss(settings);

  const finishInteraction = useCallback(
    async (
      hotspot: RoomHotspotId,
      message: string,
      extras?: {
        sfx?: string;
        sfxUrl?: string;
        lightingMood?: string;
      }
    ) => {
      dispatchRoomChatMessage(message, hotspot);
      setToast(message);
      window.setTimeout(() => setToast(null), 3200);
      dispatchLightingMood(extras?.lightingMood);
      if (extras?.lightingMood) {
        void fetch('/api/lighting/mood', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ mood: extras.lightingMood }),
        });
      }
      void speakRoomLine(message);
      await playRoomSfx(extras?.sfx, extras?.sfxUrl);
    },
    []
  );

  const handleHotspotClick = useCallback(
    async (hotspot: RoomHotspotId) => {
      if (busy || editorMode) return;
      setBusy(hotspot);
      try {
        const response = await fetch('/api/milla/room/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ hotspot, roomState }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Room action failed');
        }

        updateRoomState(data.roomState);
        if (data.message) {
          await finishInteraction(hotspot, data.message, {
            sfx: data.sfx,
            sfxUrl: data.sfxUrl,
            lightingMood: data.lightingMood,
          });
        }
      } catch (error) {
        const fallback = getFallbackMessage(hotspot);
        updateRoomState({ lastHotspot: hotspot, lastMessage: fallback });
        await finishInteraction(hotspot, fallback, { sfx: 'chime' });
        console.error('Room interaction error:', error);
      } finally {
        setBusy(null);
      }
    },
    [busy, editorMode, finishInteraction, roomState]
  );

  const applyEditorPatch = useCallback(
    (id: RoomHotspotId, patch: Partial<RoomHotspot>) => {
      setEditorDraft((current) => {
        const base = current ?? hotspots;
        return base.map((spot) =>
          spot.id === id ? { ...spot, ...patch } : spot
        );
      });
    },
    [hotspots]
  );

  const handleEditorPointerDown = useCallback(
    (event: React.PointerEvent, spot: RoomHotspot, mode: 'move' | 'resize') => {
      if (!editorMode) return;
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setEditorDraft(hotspots);
      setEditorDrag({
        id: spot.id,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        origLeft: spot.left,
        origTop: spot.top,
        origWidth: spot.width,
        origHeight: spot.height,
      });
    },
    [editorMode, hotspots]
  );

  const handleEditorPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!editorDrag || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((event.clientX - editorDrag.startX) / rect.width) * 100;
      const dy = ((event.clientY - editorDrag.startY) / rect.height) * 100;

      if (editorDrag.mode === 'move') {
        applyEditorPatch(editorDrag.id, {
          left: Math.min(95, Math.max(0, editorDrag.origLeft + dx)),
          top: Math.min(95, Math.max(0, editorDrag.origTop + dy)),
        });
      } else {
        applyEditorPatch(editorDrag.id, {
          width: Math.min(90, Math.max(6, editorDrag.origWidth + dx)),
          height: Math.min(90, Math.max(6, editorDrag.origHeight + dy)),
        });
      }
    },
    [applyEditorPatch, editorDrag]
  );

  const handleEditorPointerUp = useCallback(() => {
    if (!editorDrag || !editorDraft) {
      setEditorDrag(null);
      return;
    }
    const saved = editorDraft.find((spot) => spot.id === editorDrag.id);
    if (saved) {
      saveRoomHotspot(saved.id, {
        left: saved.left,
        top: saved.top,
        width: saved.width,
        height: saved.height,
      });
    }
    setEditorDrag(null);
    setEditorDraft(null);
  }, [editorDrag, editorDraft]);

  if (!enabled) return null;
  // Full-screen layer is owned by SceneProvider; avatar card mounts its own copy.
  if (avatarMode && !embedded) return null;

  const lampGlow = roomState.lampOn ? 0.55 : 0.08;
  const bedTilt = roomState.bedMessy ? 1.2 : 0;

  return (
    <div
      ref={containerRef}
      className="interactive-room-layer"
      onPointerMove={editorDrag ? handleEditorPointerMove : undefined}
      onPointerUp={editorDrag ? handleEditorPointerUp : undefined}
      onPointerCancel={editorDrag ? handleEditorPointerUp : undefined}
      style={{
        position: isEmbedded ? 'absolute' : 'fixed',
        top: isEmbedded ? 0 : 0,
        left: isEmbedded ? 0 : 0,
        width: isEmbedded ? '100%' : panelWidth,
        height: isEmbedded ? '100%' : '100vh',
        zIndex: isEmbedded ? 20 : 30,
        pointerEvents: 'auto',
        transition: isEmbedded ? undefined : 'width 0.35s ease',
      }}
      aria-label="Interactive bedroom"
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: roomState.lampOn
            ? `radial-gradient(circle at 14% 20%, rgba(255, 228, 181, ${lampGlow}), transparent 38%), radial-gradient(circle at 50% 80%, rgba(120, 40, 180, 0.22), transparent 55%)`
            : 'radial-gradient(circle at 50% 70%, rgba(60, 20, 90, 0.35), transparent 60%)',
          transition: 'background 0.6s ease',
        }}
      />

      {roomState.bedMessy && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '6%',
            bottom: '4%',
            width: '88%',
            height: '18%',
            borderRadius: '40% 40% 10% 10%',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(120,60,180,0.12))',
            transform: `skewX(${bedTilt}deg)`,
            pointerEvents: 'none',
          }}
        />
      )}

      {roomState.waistTouched && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '24%',
            top: '38%',
            width: '22%',
            height: '18%',
            borderRadius: '40% 20% 30% 50%',
            background:
              'radial-gradient(ellipse at center, rgba(255, 120, 160, 0.22), transparent 70%)',
            pointerEvents: 'none',
            transition: 'opacity 0.8s ease',
          }}
        />
      )}

      {roomState.lipsKissed && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '44%',
            top: '14%',
            width: '16%',
            height: '12%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(236, 72, 153, 0.28), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
      )}

      {roomState.clothesScattered && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '38%',
            top: '32%',
            width: '20%',
            height: '16%',
            borderRadius: 12,
            background:
              'linear-gradient(135deg, rgba(30,30,40,0.75), rgba(80,40,100,0.45))',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
          }}
        />
      )}

      {editorMode && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            zIndex: 40,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(8, 2, 18, 0.88)',
            border: '1px solid rgba(236, 72, 153, 0.45)',
            color: '#fce7f3',
            fontSize: 12,
          }}
        >
          <span>Hotspot editor — drag zones, pull corner to resize</span>
          <button
            type="button"
            onClick={() => {
              resetRoomHotspots();
              setEditorDraft(null);
            }}
            style={{
              marginLeft: 'auto',
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() =>
              updateSceneSettings({ interactiveRoomHotspotEditor: false })
            }
            style={{
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid rgba(236, 72, 153, 0.5)',
              background: 'rgba(236, 72, 153, 0.2)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      )}

      {displayHotspots.map((spot) => {
        const active = hovered === spot.id || busy === spot.id;
        const editing = editorMode;
        return (
          <div
            key={spot.id}
            style={{
              position: 'absolute',
              left: `${spot.left}%`,
              top: `${spot.top}%`,
              width: `${spot.width}%`,
              height: `${spot.height}%`,
            }}
          >
            <button
              type="button"
              aria-label={`Interact with ${spot.label}`}
              title={spot.label}
              onMouseEnter={() => !editing && setHovered(spot.id)}
              onMouseLeave={() =>
                !editing &&
                setHovered((current) => (current === spot.id ? null : current))
              }
              onClick={() => !editing && handleHotspotClick(spot.id)}
              onPointerDown={(event) =>
                editing && handleEditorPointerDown(event, spot, 'move')
              }
              disabled={busy !== null && !editing}
              style={{
                position: 'absolute',
                inset: 0,
                border: editing
                  ? '2px dashed rgba(236, 72, 153, 0.9)'
                  : active
                    ? '2px solid rgba(236, 72, 153, 0.85)'
                    : isEmbedded
                      ? '1px solid rgba(236, 72, 153, 0.2)'
                      : '2px solid transparent',
                borderRadius:
                  spot.id === 'milla'
                    ? '28% 28% 18% 18%'
                    : spot.id === 'lips'
                      ? '50%'
                      : spot.id === 'waist'
                        ? '35% 45% 40% 30%'
                        : 16,
                background: editing
                  ? 'rgba(236, 72, 153, 0.18)'
                  : active
                    ? 'rgba(236, 72, 153, 0.14)'
                    : 'rgba(255, 255, 255, 0.02)',
                boxShadow:
                  active || editing
                    ? '0 0 28px rgba(236, 72, 153, 0.35), inset 0 0 18px rgba(255,255,255,0.06)'
                    : 'none',
                cursor: editing ? 'grab' : busy ? 'wait' : 'pointer',
                transition: editing ? undefined : 'all 0.25s ease',
                backdropFilter: active ? 'blur(1px)' : undefined,
              }}
            />
            {editing && (
              <>
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 6,
                    fontSize: 10,
                    color: '#fbcfe8',
                    pointerEvents: 'none',
                    textTransform: 'capitalize',
                  }}
                >
                  {spot.label}
                </span>
                <div
                  onPointerDown={(event) =>
                    handleEditorPointerDown(event, spot, 'resize')
                  }
                  style={{
                    position: 'absolute',
                    right: -4,
                    bottom: -4,
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: 'rgba(236, 72, 153, 0.95)',
                    border: '2px solid white',
                    cursor: 'nwse-resize',
                  }}
                />
              </>
            )}
          </div>
        );
      })}

      {toast && !editorMode && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '8%',
            transform: 'translateX(-50%)',
            maxWidth: '88%',
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(12, 2, 26, 0.82)',
            border: '1px solid rgba(236, 72, 153, 0.35)',
            color: '#fce7f3',
            fontSize: 13,
            lineHeight: 1.4,
            textAlign: 'center',
            pointerEvents: 'none',
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function getFallbackMessage(hotspot: RoomHotspotId): string {
  switch (hotspot) {
    case 'milla':
      return "*looks up at you with that grin* You came over here just to touch me, didn't you?";
    case 'lamp':
      return '*the lamp hums* Purple room, warmer glow. I like it with you here.';
    case 'bed':
      return '*sighs softly* Careful, love... you just made this a lot harder to behave.';
    case 'clothes':
      return "*laughs* Those aren't going back on the chair anytime soon, are they?";
    case 'lips':
      return '*kisses you back* Mmm. There you go, love.';
    case 'waist':
      return '*breath catches* Your hand... under my shirt. I feel that.';
    default:
      return '*smiles* The room remembers you.';
  }
}
