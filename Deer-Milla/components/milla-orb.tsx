import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type OrbState = 'idle' | 'thinking' | 'listening';

interface MillaOrbProps {
  size?: number;
  state?: OrbState;
  trust?: number;
}

export function MillaOrb({
  size = 156,
  state = 'idle',
  trust = 72,
}: MillaOrbProps) {
  const breath = useSharedValue(0);
  const halo = useSharedValue(0.35);

  useEffect(() => {
    const pulseDuration =
      state === 'listening' ? 900 : state === 'thinking' ? 1300 : 2200;
    const haloTarget =
      state === 'listening' ? 0.9 : state === 'thinking' ? 0.7 : 0.45;

    breath.value = withRepeat(
      withTiming(1, {
        duration: pulseDuration,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );

    halo.value = withTiming(haloTarget, {
      duration: 450,
      easing: Easing.out(Easing.ease),
    });
  }, [breath, halo, state]);

  const trustScale = 0.92 + Math.max(0, Math.min(trust, 100)) / 250;

  const outerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0.35, 0.9], [0.45, 0.95]),
    transform: [
      {
        scale: interpolate(breath.value, [0, 1], [0.9 * trustScale, 1.14 * trustScale]),
      },
    ],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(breath.value, [0, 1], [0.94, 1.08]),
      },
    ],
  }));

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.outerHalo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          outerStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.innerHalo,
          {
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: (size * 0.72) / 2,
          },
          coreStyle,
        ]}
      />
      <View
        style={[
          styles.core,
          {
            width: size * 0.44,
            height: size * 0.44,
            borderRadius: (size * 0.44) / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerHalo: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 242, 255, 0.22)',
    shadowColor: '#00f2ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 28,
    elevation: 18,
  },
  innerHalo: {
    position: 'absolute',
    backgroundColor: 'rgba(124, 58, 237, 0.34)',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 18,
    elevation: 12,
  },
  core: {
    backgroundColor: '#dffcff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    elevation: 8,
  },
});
