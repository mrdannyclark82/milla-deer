import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  NeuralNetworkLegend,
  NeuralNetworkMap,
} from '@/components/neural-network-map';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { millaApi } from '@/services/milla-api';
import type { MemoryGraph } from '@/services/milla-api';

const STAT_COLOR: Record<string, string> = {
  episodic: '#7df9ff',
  semantic: '#a78bfa',
  procedural: '#34d399',
  working: '#fbbf24',
};

export default function MemoryScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const [memoryGraph, setMemoryGraph] = useState<MemoryGraph | null>(null);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [uploadContent, setUploadContent] = useState('');
  const [uploadSource, setUploadSource] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mapWidth, setMapWidth] = useState(320);

  const refreshGraph = useCallback(async () => {
    setIsLoadingGraph(true);
    try {
      const graph = await millaApi.getMemoryGraph();
      setMemoryGraph(graph);
    } catch {
      // Keep null — map shows default visualization
    } finally {
      setIsLoadingGraph(false);
    }
  }, []);

  useEffect(() => {
    void refreshGraph();
  }, [refreshGraph]);

  const handleUpload = useCallback(async () => {
    const content = uploadContent.trim();
    const source = uploadSource.trim() || 'manual-import';
    if (!content || isUploading) return;

    setIsUploading(true);
    setUploadFeedback(null);
    setUploadError(null);

    try {
      const result = await millaApi.uploadMemory(content, source);
      setUploadFeedback(
        result.message ||
          `Added ${result.memoriesAdded} memory node${result.memoriesAdded !== 1 ? 's' : ''}.`
      );
      setUploadContent('');
      setUploadSource('');
      void refreshGraph();
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : 'Unable to upload memory.'
      );
    } finally {
      setIsUploading(false);
    }
  }, [uploadContent, uploadSource, isUploading, refreshGraph]);

  const stats = memoryGraph ?? {
    totalMemories: 0,
    episodicCount: 0,
    semanticCount: 0,
    proceduralCount: 0,
    workingCount: 0,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerPill}>
              <ThemedText style={styles.headerPillText}>
                Memory & Data Storage
              </ThemedText>
            </View>
            <ThemedText type="title" style={styles.title}>
              Memory Graph
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Milla's distributed memory architecture — episodic, semantic,
              procedural, and working memory nodes visualised in real time.
            </ThemedText>
          </View>

          {/* Neural Network Map */}
          <ThemedView style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <ThemedText type="subtitle">Neural distribution map</ThemedText>
              <Pressable
                onPress={() => void refreshGraph()}
                disabled={isLoadingGraph}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={({ pressed }) => ({
                  opacity: isLoadingGraph ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                {isLoadingGraph ? (
                  <ActivityIndicator size="small" color="#7df9ff" />
                ) : (
                  <ThemedText style={styles.refreshLabel}>Refresh</ThemedText>
                )}
              </Pressable>
            </View>

            <View
              style={styles.mapContainer}
              onLayout={(e) => setMapWidth(e.nativeEvent.layout.width - 2)}
            >
              <NeuralNetworkMap
                graph={memoryGraph}
                width={mapWidth}
                height={200}
              />
            </View>
            <NeuralNetworkLegend />
          </ThemedView>

          {/* Stats */}
          <View style={styles.statsGrid}>
            <View
              style={[
                styles.statCard,
                isDark ? styles.statCardDark : styles.statCardLight,
              ]}
            >
              <ThemedText style={styles.statValue}>
                {stats.totalMemories.toLocaleString()}
              </ThemedText>
              <ThemedText style={styles.statLabel}>Total</ThemedText>
            </View>
            {[
              {
                key: 'episodic',
                label: 'Episodic',
                count: stats.episodicCount,
              },
              {
                key: 'semantic',
                label: 'Semantic',
                count: stats.semanticCount,
              },
              {
                key: 'procedural',
                label: 'Procedural',
                count: stats.proceduralCount,
              },
              { key: 'working', label: 'Working', count: stats.workingCount },
            ].map(({ key, label, count }) => (
              <View
                key={key}
                style={[
                  styles.statCard,
                  isDark ? styles.statCardDark : styles.statCardLight,
                ]}
              >
                <ThemedText
                  style={[styles.statValue, { color: STAT_COLOR[key] }]}
                >
                  {count.toLocaleString()}
                </ThemedText>
                <ThemedText style={styles.statLabel}>{label}</ThemedText>
              </View>
            ))}
          </View>

          {/* Upload from external sources */}
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Upload from external source</ThemedText>
            <ThemedText style={styles.bodyText}>
              Inject memories directly into Milla's knowledge graph. Paste
              notes, journal entries, documents, or any structured knowledge you
              want her to remember.
            </ThemedText>

            <TextInput
              value={uploadSource}
              onChangeText={setUploadSource}
              placeholder="Source label (e.g. Journal · Notion · Manual)"
              placeholderTextColor={isDark ? '#4d7080' : '#7a8c99'}
              style={[
                styles.input,
                {
                  color: palette.text,
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,150,200,0.06)',
                },
              ]}
            />

            <TextInput
              value={uploadContent}
              onChangeText={setUploadContent}
              placeholder="Paste memory content here…"
              placeholderTextColor={isDark ? '#4d7080' : '#7a8c99'}
              style={[
                styles.input,
                styles.inputTall,
                {
                  color: palette.text,
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,150,200,0.06)',
                },
              ]}
              multiline
              textAlignVertical="top"
              editable={!isUploading}
            />

            <Pressable
              onPress={() => void handleUpload()}
              disabled={isUploading || !uploadContent.trim()}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  opacity:
                    isUploading || !uploadContent.trim()
                      ? 0.45
                      : pressed
                        ? 0.8
                        : 1,
                },
              ]}
            >
              <ThemedText style={styles.primaryBtnLabel}>
                {isUploading ? 'Uploading…' : 'Upload to memory'}
              </ThemedText>
            </Pressable>

            {uploadFeedback ? (
              <ThemedText style={styles.feedbackText}>
                {uploadFeedback}
              </ThemedText>
            ) : null}
            {uploadError ? (
              <ThemedText style={styles.errorText}>{uploadError}</ThemedText>
            ) : null}
          </ThemedView>

          {/* Storage info */}
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Storage architecture</ThemedText>
            <View style={styles.storageRow}>
              <View
                style={[
                  styles.storageBadge,
                  { borderColor: '#7df9ff40', backgroundColor: '#7df9ff12' },
                ]}
              >
                <ThemedText
                  style={[styles.storageBadgeTitle, { color: '#7df9ff' }]}
                >
                  SQLite
                </ThemedText>
                <ThemedText style={styles.storageBadgeDesc}>
                  Primary store · Fast local reads
                </ThemedText>
              </View>
              <View
                style={[
                  styles.storageBadge,
                  { borderColor: '#a78bfa40', backgroundColor: '#a78bfa12' },
                ]}
              >
                <ThemedText
                  style={[styles.storageBadgeTitle, { color: '#a78bfa' }]}
                >
                  Vector DB
                </ThemedText>
                <ThemedText style={styles.storageBadgeDesc}>
                  Semantic embeddings · Similarity search
                </ThemedText>
              </View>
              <View
                style={[
                  styles.storageBadge,
                  { borderColor: '#34d39940', backgroundColor: '#34d39912' },
                ]}
              >
                <ThemedText
                  style={[styles.storageBadgeTitle, { color: '#34d399' }]}
                >
                  Encrypted
                </ThemedText>
                <ThemedText style={styles.storageBadgeDesc}>
                  Homomorphic encryption on sensitive fields
                </ThemedText>
              </View>
            </View>
          </ThemedView>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 120,
    gap: 14,
  },
  header: { gap: 8, paddingBottom: 4 },
  headerPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: 'rgba(125, 249, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.22)',
  },
  headerPillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  title: { textAlign: 'left' },
  subtitle: { lineHeight: 22, opacity: 0.75 },
  card: { borderRadius: 22, padding: 16, gap: 10 },
  bodyText: { lineHeight: 21, opacity: 0.78, fontSize: 14 },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshLabel: { fontSize: 13, color: '#7df9ff', fontWeight: '600' },
  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 10, 25, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    borderRadius: 16,
    padding: 12,
    gap: 3,
    alignItems: 'center',
    borderWidth: 1,
    minWidth: '30%',
    flex: 1,
  },
  statCardDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statCardLight: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderColor: 'rgba(0,0,0,0.07)',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  inputTall: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#7df9ff',
    alignItems: 'center',
  },
  primaryBtnLabel: {
    color: '#04181f',
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackText: {
    fontSize: 13,
    color: '#34d399',
    lineHeight: 19,
  },
  errorText: {
    fontSize: 13,
    color: '#f87171',
    lineHeight: 19,
  },
  storageRow: { gap: 8 },
  storageBadge: {
    borderRadius: 14,
    padding: 12,
    gap: 4,
    borderWidth: 1,
  },
  storageBadgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  storageBadgeDesc: {
    fontSize: 12,
    opacity: 0.65,
    lineHeight: 18,
  },
});
