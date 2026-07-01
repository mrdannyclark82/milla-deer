import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight =
    (Platform.OS === 'ios' ? 50 : 54) + Math.max(insets.bottom, 6);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 5,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: {
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat Hub',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="message.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: 'Agents',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="cpu" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="swarm"
        options={{
          title: 'Swarm',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={24}
              name="antenna.radiowaves.left.and.right"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Memory',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="brain" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
