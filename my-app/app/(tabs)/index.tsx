import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { millaApi } from '@/services/milla-api';

export default function HomeScreen() {
  const [loopVideoUrl, setLoopVideoUrl] = useState(
    `${millaApi.defaultBaseUrl}/api/assets/loop-video`
  );
  const player = useVideoPlayer(loopVideoUrl, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  useEffect(() => {
    let isMounted = true;

    void millaApi.buildAssetUrl('/api/assets/loop-video').then((resolvedUrl) => {
      if (isMounted) {
        setLoopVideoUrl(resolvedUrl);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.statusPill}>
              <ThemedText style={styles.statusPillText}>Mobile companion online</ThemedText>
            </View>

            <ThemedText type="title" style={styles.title}>
              Milla Deer
            </ThemedText>

            <ThemedText style={styles.subtitle}>
              A calmer home screen with quick launch controls, voice status, and room for richer
              avatar visuals beyond the breathing orb.
            </ThemedText>

            <View style={styles.videoFrame}>
              <VideoView
                style={styles.video}
                player={player}
                nativeControls={false}
                allowsFullscreen={false}
                allowsPictureInPicture={false}
                contentFit="cover"
              />
            </View>

            <View style={styles.signalRow}>
              <View style={styles.signalCard}>
                <ThemedText style={styles.signalLabel}>Voice</ThemedText>
                <ThemedText style={styles.signalValue}>Mic + spoken replies</ThemedText>
              </View>
              <View style={styles.signalCard}>
                <ThemedText style={styles.signalLabel}>Fallback</ThemedText>
                <ThemedText style={styles.signalValue}>
                  {'Remote -> device -> offline'}
                </ThemedText>
              </View>
              <View style={styles.signalCard}>
                <ThemedText style={styles.signalLabel}>Chat</ThemedText>
                <ThemedText style={styles.signalValue}>Keyboard-safe composer</ThemedText>
              </View>
            </View>

            <View style={styles.quickActionRow}>
              <Link href="/chat" style={[styles.primaryCta, styles.flexCta]}>
                <ThemedText style={styles.primaryCtaText}>Open live chat</ThemedText>
              </Link>
              <Link href="/explore" style={[styles.secondaryCta, styles.flexCta]}>
                <ThemedText style={styles.secondaryCtaText}>Explore tools</ThemedText>
              </Link>
            </View>
          </View>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Beyond the breathing orb</ThemedText>
            <ThemedText style={styles.bodyText}>
              Yes. This home tab can become a portrait card, looping video hero, studio panel, or a
              more dashboard-like presence screen. For now I’ve shifted it toward a companion
              dashboard so it already feels less like a single animated orb screen.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Current voice options</ThemedText>
            <ThemedText style={styles.bodyText}>
              • Speech-to-text mic input in the Chat tab{'\n'}• Spoken replies using the device TTS
              voice{'\n'}• Android offline speech-pack download for on-device recognition{'\n'}•
              Device-model preview fallback when the remote link is down
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Good next voice upgrades</ThemedText>
            <ThemedText style={styles.bodyText}>
              We can add a voice picker, slower/faster reply styles, auto-send after final
              transcript, push-to-talk, or connect cloud voices like ElevenLabs or Coqui for a more
              custom personality.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Build notes</ThemedText>
            <ThemedText style={styles.bodyText}>
              Voice input still needs the native dev build, not Expo Go. The chat screen now uses
              active keyboard avoidance on Android so your composer should stay visible while
              typing.
            </ThemedText>
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
  heroCard: {
    borderRadius: 28,
    padding: 20,
    gap: 16,
    backgroundColor: 'rgba(0, 242, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 255, 0.16)',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(125, 249, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.22)',
  },
  statusPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  title: {
    textAlign: 'left',
  },
  subtitle: {
    lineHeight: 22,
    opacity: 0.8,
  },
  videoFrame: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  video: {
    width: '100%',
    aspectRatio: 9 / 16,
  },
  signalRow: {
    gap: 10,
  },
  signalCard: {
    borderRadius: 18,
    padding: 14,
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  signalLabel: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.68,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  signalValue: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  flexCta: {
    flex: 1,
  },
  primaryCta: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00f2ff',
  },
  primaryCtaText: {
    color: '#041821',
    fontWeight: '700',
  },
  secondaryCta: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  secondaryCtaText: {
    fontWeight: '700',
  },
  card: {
    borderRadius: 20,
    padding: 18,
    gap: 10,
    backgroundColor: 'rgba(0, 242, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 255, 0.14)',
  },
  bodyText: {
    lineHeight: 23,
    opacity: 0.82,
  },
});
