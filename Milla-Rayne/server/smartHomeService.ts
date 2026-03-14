import { config } from './config';
import { SceneLocation, TimeOfDay } from '../shared/sceneTypes';

export interface SmartHomeSensorData {
  timestamp: number;
  location: string;
  presence: boolean;
  motion: {
    detected: boolean;
    level: number;
  };
  lightLevel: 'dark' | 'dim' | 'normal' | 'bright';
  temperature: number; // in Celsius
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
  const date = new Date();
  const hour = date.getHours();
  const isNight = hour >= 20 || hour < 6;

  // Random location
  const locations = [
    'living_room',
    'bedroom',
    'kitchen',
    'workspace',
    'unknown',
  ];
  const location = locations[Math.floor(Math.random() * locations.length)];

  const motionDetected = Math.random() > 0.5;

  return {
    timestamp: date.getTime(),
    location: location,
    presence: Math.random() > 0.2, // 80% chance of presence
    motion: {
      detected: motionDetected,
      level: motionDetected ? Math.random() : 0,
    },
    lightLevel: isNight ? 'dark' : 'normal',
    temperature: 22, // degrees Celsius
  };
}

/**
 * Maps smart home sensor data to Milla's SceneContext.
 */
export function mapSensorDataToSceneContext(sensorData: SmartHomeSensorData): {
  location?: SceneLocation;
  timeOfDay?: TimeOfDay;
} {
  const mappedContext: { location?: SceneLocation; timeOfDay?: TimeOfDay } = {};

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
    console.log(
      'Motion detected in smart home, potentially indicating scene change.'
    );
  }

  return mappedContext;
}
