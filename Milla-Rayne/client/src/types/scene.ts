export type SceneMood =
  'calm' | 'energetic' | 'romantic' | 'mysterious' | 'playful';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type AvatarState = 'neutral' | 'thinking' | 'responding' | 'listening';
export type ParticleType =
  'stars' | 'sparkles' | 'hearts' | 'petals' | 'mist' | 'snowflakes';

// Role-play scene locations (Phase 3)
export type SceneLocation =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'front_door'
  | 'dining_room'
  | 'outdoor'
  | 'car'
  | 'unknown';

export interface SceneContext {
  mood: SceneMood;
  timeOfDay: TimeOfDay;
  avatarState: AvatarState;
  isActive: boolean;
  location?: SceneLocation; // Phase 3: RP scene location
}

export interface DeviceCapabilities {
  webGL: boolean;
  gpuTier: 'low' | 'medium' | 'high';
  prefersReducedMotion: boolean;
  screenSize: { width: number; height: number };
}

export interface SceneConfig {
  colors: string[];
  animations: string[];
  particles?: ParticleConfig;
  interactive: boolean;
}

export interface ParticleConfig {
  type: ParticleType;
  density: 'low' | 'medium' | 'high';
  speed: number;
}

export type BackgroundMode = 'css-animated' | 'static-image' | 'auto';
export type ChatPanelBackground = 'glass' | 'midnight' | 'nebula';

export interface SceneSettings {
  enabled: boolean;
  mood: SceneMood;
  enableParticles: boolean;
  enableParallax: boolean;
  dashboardAmbientLight?: number; // 0-100 dashboard shell lighting intensity
  parallaxIntensity: number; // 0-75
  particleDensity: 'off' | 'low' | 'medium' | 'high';
  animationSpeed: number; // 0.5-1.5 (50%-150%)
  devDebug: boolean;
  winterTheme?: boolean; // Force snowy night scene (overrides seasonal detection)
  sceneBackgroundFromRP?: boolean; // Phase 3: Mirror RP scene in background
  sceneRoomOverlaysEnabled?: boolean; // Room Overlays V1: Location silhouettes
  interactiveRoomEnabled?: boolean; // Clickable bedroom hotspots
  interactiveRoomPanelWidth?: number; // 40-72 vw — scene panel width in chat mode
  interactiveRoomZoom?: number; // 65-110 — photo scale percentage
  interactiveRoomImageOffsetY?: number; // 0-100 — vertical framing
  interactiveRoomVoiceEnabled?: boolean; // Speak lines on hotspot click
  interactiveRoomVoiceId?: string; // ElevenLabs voice ID (custom Milla clone)
  interactiveRoomHotspotEditor?: boolean; // Drag-to-place hotspot calibration
  interactiveRoomAvatarMode?: boolean; // Bedroom lives in hero avatar card, not full-screen
  backgroundMode?: BackgroundMode; // Background rendering mode: CSS animated, static image, or auto-detect
  chatPanelBackground?: ChatPanelBackground; // Saved visual treatment for the Live Thread
}
