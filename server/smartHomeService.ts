import { config } from './config';
import { SceneLocationKey, TimeOfDay } from '../shared/sceneTypes';

export interface SmartHomeSensorData {
  lightLevel: 'dark' | 'dim' | 'normal' | 'bright';
  temperature: number; // in Celsius
  motion: {
    detected: boolean;
    level: number; // 0.0 to 1.0
  };
  location: SceneLocationKey;
  presence: boolean;
  timestamp: number;
}

/**
 * Fetches mock smart home sensor data.
 * In a real implementation, this would connect to a smart home API.
 */
export async function getSmartHomeSensorData(): Promise<SmartHomeSensorData | null> {
  if (!config.smartHome.enableIntegration) {
    return null;
  }

  // For now, return mock data
  const hour = new Date().getHours();
  const isNight = hour >= 20 || hour < 6;
  // 'office' was in my previous list but is not in SceneLocationKey ('workspace' is).
  // Checking shared/sceneTypes.ts:
  // export type SceneLocationKey = 'front_door' | 'living_room' | 'kitchen' | 'dining_room' | 'bedroom' | 'bathroom' | 'workspace' | 'guest_room' | 'outdoor';
  const locations: SceneLocationKey[] = ['living_room', 'bedroom', 'kitchen', 'bathroom', 'workspace', 'outdoor'];
  const randomLocation = locations[Math.floor(Math.random() * locations.length)];
  const motionLevel = Math.random();

  return {
    lightLevel: isNight ? 'dark' : 'normal',
    temperature: 22, // degrees Celsius
    motion: {
      detected: motionLevel > 0.1,
      level: motionLevel
    },
    location: randomLocation,
    presence: true, // Mock assumption user is home
    timestamp: Date.now()
  };
}

/**
 * Maps smart home sensor data to Milla's SceneContext.
 */
export function mapSensorDataToSceneContext(sensorData: SmartHomeSensorData): {
  location?: SceneLocationKey;
  timeOfDay?: TimeOfDay;
} {
  const mappedContext: { location?: SceneLocationKey; timeOfDay?: TimeOfDay } = {};

  // Map light level to time of day
  if (sensorData.lightLevel === 'dark') {
    mappedContext.timeOfDay = 'night';
  } else if (sensorData.lightLevel === 'dim') {
    mappedContext.timeOfDay = 'dusk';
  } else if (sensorData.lightLevel === 'bright') {
    mappedContext.timeOfDay = 'day';
  }

  // Example: Map motion detection to a potential location change (simplified)
  if (sensorData.motion.detected) {
    // In a real scenario, this would be more sophisticated, e.g., motion in kitchen -> kitchen scene
    // For now, we'll just log it.
    // console.log(
    //   'Motion detected in smart home, potentially indicating scene change.'
    // );
  }

  if (sensorData.location) {
      mappedContext.location = sensorData.location;
  }

  return mappedContext;
}
