import { Link } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useChat } from '@/hooks/use-chat';

export default function SystemScreen() {
  const {
    apiBaseUrl,
    localModelEnabled,
    localModelError,
    localModelRuntimeDetails,
    localModelStatus,
    usingLocalModelFallback,
    usingOfflineFallback,
  } = useChat();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="title">System</ThemedText>
            <ThemedText style={styles.subtitle}>
              This tab is now the practical setup/status screen for Deer-Milla instead of the default Expo starter content.
            </ThemedText>
          </View>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Current connection</ThemedText>
            <ThemedText style={styles.bodyText}>Remote server: {apiBaseUrl}</ThemedText>
            <ThemedText style={styles.bodyText}>
              {usingLocalModelFallback
                ? 'Chat is currently answering through the Android on-device runtime.'
                : usingOfflineFallback
                ? 'Chat is currently in offline fallback mode.'
                : 'Remote chat is active when the backend is up.'}
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">On-device model</ThemedText>
            <ThemedText style={styles.bodyText}>
              {localModelEnabled
                ? localModelStatus === 'error'
                  ? localModelError || 'The Android runtime is unavailable.'
                  : localModelRuntimeDetails?.summary || 'The Android runtime is standing by.'
                : 'The Android runtime is off. Turn it on from Home when you want local fallback.'}
            </ThemedText>
            <ThemedText style={styles.bodyText}>
              Compatible imports for the current build are MediaPipe `.task` model files, and a
              bundled `.task` asset now counts as a ready offline source when the build ships one.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Google Tasks troubleshooting</ThemedText>
            <ThemedText style={styles.bodyText}>
              If List Tasks says it cannot access Google Tasks, reconnect Google from Home and make sure your Google Tasks account actually has a task list available.
            </ThemedText>
            <ThemedText style={styles.bodyText}>
              The app now shows friendly guidance instead of surfacing raw `NO_TASK_LIST` codes.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">What each tab is for now</ThemedText>
            <ThemedText style={styles.bodyText}>
              Home: media, server setup, Google sync, task actions, background generation, local-model controls.{'\n'}
              Chat: the actual conversation view with mic + send.{'\n'}
              System: current status, model guidance, and troubleshooting notes.
            </ThemedText>
            <View style={styles.linkRow}>
              <Link href="/" style={styles.linkButton}>
                <ThemedText style={styles.linkLabel}>Back to Home</ThemedText>
              </Link>
              <Link href="/chat" style={styles.linkButtonSecondary}>
                <ThemedText style={styles.linkLabelSecondary}>Open Chat</ThemedText>
              </Link>
            </View>
          </ThemedView>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 18,
  },
  header: {
    gap: 10,
  },
  subtitle: {
    lineHeight: 22,
    opacity: 0.78,
  },
  card: {
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  bodyText: {
    lineHeight: 22,
    opacity: 0.8,
  },
  linkRow: {
    flexDirection: 'row',
    gap: 12,
  },
  linkButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#7df9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonSecondary: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.24)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkLabel: {
    color: '#041821',
    fontWeight: '800',
  },
  linkLabelSecondary: {
    fontWeight: '700',
  },
});
