export enum PersonaMode {
  PROFESSIONAL = 'Professional',
  CASUAL = 'Casual',
  EMPATHETIC = 'Empathetic',
  HUMOROUS = 'Humorous',
  MOTIVATIONAL = 'Motivational',
  ADAPTIVE = 'Adaptive'
}

export enum ToolMode {
  CHAT = 'chat',
  SEARCH = 'search',
  MAPS = 'maps',
  IMAGE_GEN = 'image_gen',
  VIDEO_GEN = 'video_gen',
  SANDBOX = 'sandbox',
  CREATIVE = 'creative'
}

export interface Attachment {
  mimeType: string;
  data: string; // base64
  previewUri?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
  thinking?: boolean;
  thoughtProcess?: string;
  
  // Rich Content
  imageUri?: string;
  videoUri?: string;
  audioUri?: string;
  groundingSources?: GroundingSource[];
}

export interface DetailedMetrics {
  accuracy: number;
  empathy: number;
  speed: number;
  creativity: number;
  relevance: number;
  humor: number;
  proactivity: number;
  clarity: number;
  engagement: number;
  ethicalAlignment: number;
  memoryUsage: number;
  anticipation: number;
}

export interface IntegrationStatus {
  google: boolean;
  grok: boolean;
  github: boolean;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  isPlaying: boolean;
}

export interface GrowthEntry {
  id: string;
  type: 'learning' | 'upgrade' | 'audit' | 'proposal' | 'research';
  title: string;
  timestamp: number;
  details: string;
  technicalDetails?: string; // Implementation guide for proposals
  sources?: GroundingSource[]; // Web sources for research entries
}