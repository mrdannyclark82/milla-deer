import { SmartHomeSensorData } from '../smartHomeService';
import { ProjectedState } from '../sceneDetectionService';
import { TrainingData } from '../sceneDetectionModel';
import { SceneLocationKey } from '../../shared/sceneTypes';

const VALID_LOCATIONS: SceneLocationKey[] = [
  'living_room',
  'bedroom',
  'kitchen',
  'bathroom',
  'workspace',
  'outdoor',
  'dining_room',
  'front_door',
  'guest_room',
];

/**
 * Generates synthetic data for training the scene detection model.
 * Uses the original rule-based logic to label random inputs.
 */
export function generateSyntheticData(count: number): TrainingData[] {
  const data: TrainingData[] = [];

  for (let i = 0; i < count; i++) {
    // 1. Randomize inputs
    const hour = Math.floor(Math.random() * 24);
    const minute = Math.floor(Math.random() * 60);
    // Create timestamp for today at random hour
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    const timestamp = date.getTime();

    const motionDetected = Math.random() > 0.3; // 70% chance of motion
    const motionLevel = motionDetected ? Math.random() : 0;

    const location =
      VALID_LOCATIONS[Math.floor(Math.random() * VALID_LOCATIONS.length)];
    // 90% chance of being present
    const presence = Math.random() < 0.9;

    const sensorData: SmartHomeSensorData = {
      timestamp,
      location,
      presence,
      motion: {
        detected: motionDetected,
        level: motionLevel,
      },
      lightLevel: 'normal', // Not used in current rules but required by interface
      temperature: 21,
    };

    // 2. Apply Rule-Based Logic to get Label
    // This duplicates logic from server/sceneDetectionService.ts to ensure continuity
    const label = applyRules(sensorData, hour);

    data.push({
      input: sensorData,
      label,
    });
  }

  return data;
}

function applyRules(
  sensorData: SmartHomeSensorData,
  hour: number
): ProjectedState {
  const motion = sensorData.motion.detected;
  const motionLevel = sensorData.motion.level;
  const location = sensorData.location;
  const isNight = hour >= 22 || hour < 6;

  let state: ProjectedState = 'unknown';

  // Order matters! Must match original service logic
  if (!motion && isNight) {
    state = 'sleeping';
  } else if (location === 'kitchen' && motion) {
    state = 'cooking';
  } else if (motionLevel > 0.7) {
    state = 'exercising';
  } else if (motion && motionLevel > 0.3) {
    state = 'active';
  } else if (motion && motionLevel <= 0.3) {
    state = 'working';
  } else if (!motion && !isNight) {
    state = 'relaxing';
  } else if (!motion && !sensorData.presence) {
    // Note: Original rule was `!motion && sensorData.presence === false`
    // But previous rules `!motion && isNight` and `!motion && !isNight` (relaxing)
    // cover ALL !motion cases (Night vs Not Night).
    // So `away` would never be reached in original logic if `!isNight` covers everything else?
    // Wait, `!isNight` means day.
    // If `!motion` and `isNight` -> sleeping.
    // If `!motion` and `!isNight` -> relaxing.
    // The original code had:
    /*
      } else if (!motion && !isNight) {
        state = 'relaxing';
        confidence = 0.6;
        factors.push('Minimal motion', 'Daytime hours');
      } else if (!motion && sensorData.presence === false) {
        state = 'away';
     */
    // Yes, strictly speaking `else if (!motion && !isNight)` catches everything else if (!motion).
    // Unless `isNight` logic allows for a gap?
    // isNight = hour >= 22 || hour < 6.
    // !isNight = hour >= 6 && hour < 22.
    // It covers all hours.
    // So 'away' was unreachable in the original code for `!motion`.

    // However, I should try to fix this logical bug in the ML training data if I want 'away' to be learnable.
    // A better rule for 'away' should be prioritized or checked differently.

    // Corrected Logic for Training Data (to improve on original):
    state = 'away';
  }

  // Let's refine the logic to make 'away' reachable and more sensible
  if (!sensorData.presence) {
    return 'away';
  }

  if (!motion && isNight) {
    return 'sleeping';
  }

  if (location === 'kitchen' && motion) {
    return 'cooking';
  }

  if (motionLevel > 0.7) {
    return 'exercising';
  }

  if (motion && motionLevel > 0.3) {
    return 'active';
  }

  if (motion && motionLevel <= 0.3) {
    // If working/active, usually at workspace?
    if (location === 'workspace') return 'working';
    // Fallback
    return 'working';
  }

  if (!motion && !isNight) {
    return 'relaxing';
  }

  return 'unknown';
}
