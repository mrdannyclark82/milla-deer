import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { millaApi } from '@/services/milla-api';
import type {
  SwarmAskResponse,
  SwarmNode,
  SwarmStatusResponse,
} from '@/services/milla-api';
import { useChat } from '@/hooks/use-chat';

const FALLBACK_NODES: SwarmNode[] = [
  {
    id: 'mobile',
    label: 'Mobile Client',
    surface: 'mobile',
    backend: 'android-local',
    status: 'online',
    latencyMs: 12,
  },
  {
    id: 'server',
    label: 'Milla Server',
    surface: 'server',
    backend: 'remote-cloud',
    status: 'online',
    latencyMs: 45,
  },
  {
    id: 'web',
    label: 'Web Surface',
    surface: 'web',
    backend: 'remote-cloud',
    status: 'online',
    latencyMs: 68,
  },
];

const NODE_STATUS_COLOR: Record<string, string> = {
  online: '#34d399',
  degraded: '#fbbf24',
  offline: '#f87171',
};

const BACKEND_COLOR: Record<string, string> = {
  'android-npu': '#a78bfa',
  'android-local': '#7df9ff',
  'remote-cloud': '#34d399',
  'openai-edge-stub': '#fbbf24',
  'offline-fallback': '#9ca3af',
  'webgpu-browser': '#f472b6',
  'ollama-local': '#60a5fa',
};

interface SwarmMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  routedVia?: string;
  latencyMs?: number;
}

export default function SwarmScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const { latestSwarmDecision } = useChat();
  const [swarmStatus, setSwarmStatus] = useState<SwarmStatusResponse | null>(
    null
  );
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [messages, setMessages] = useState<SwarmMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const status = await millaApi.getSwarmStatus();
      setSwarmStatus(status);
    } catch {
      // Use fallback display
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleAsk = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isAsking) return;

    const userMsg: SwarmMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsAsking(true);
    setAskError(null);

    try {
      const result: SwarmAskResponse = await millaApi.askSwarm(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: result.response,
          routedVia: result.routedVia,
          latencyMs: result.latencyMs,
        },
      ]);
    } catch (e) {
      // Fallback to regular chat
      try {
        const fallback = await millaApi.sendMessage(trimmed);
        const content = fallback.response || fallback.content;
        if (content) {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content,
              routedVia: 'remote-cloud',
            },
          ]);
        } else {
          throw new Error('Empty response');
        }
      } catch (fallbackError) {
        setAskError(
          fallbackError instanceof Error
            ? fallbackError.message
            : 'Unable to reach swarm.'
        );
      }
    } finally {
      setIsAsking(false);
    }
  }, [input, isAsking]);

  const nodes = swarmStatus?.nodes ?? FALLBACK_NODES;

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
                ✦ Millanite Swarm
              </ThemedText>
            </View>
            <ThemedText type="title" style={styles.title}>
              Millanite Swarm
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Distributed AI network — intelligent routing across mobile,
              server, and edge nodes.
            </ThemedText>
          </View>

          {/* Network topology */}
          <ThemedView style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <ThemedText type="subtitle">Network topology</ThemedText>
              <Pressable
                onPress={() => void refreshStatus()}
                disabled={isLoadingStatus}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={({ pressed }) => ({
                  opacity: isLoadingStatus ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                {isLoadingStatus ? (
                  <ActivityIndicator size="small" color="#7df9ff" />
                ) : (
                  <ThemedText style={styles.refreshLabel}>Refresh</ThemedText>
                )}
              </Pressable>
            </View>

            <View style={styles.topoGrid}>
              {nodes.map((node) => {
                const dotColor = NODE_STATUS_COLOR[node.status] ?? '#9ca3af';
                const backColor = BACKEND_COLOR[node.backend] ?? '#7df9ff';
                return (
                  <View
                    key={node.id}
                    style={[
                      styles.topoNode,
                      isDark ? styles.topoNodeDark : styles.topoNodeLight,
                    ]}
                  >
                    <View style={styles.topoNodeHeader}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: dotColor },
                        ]}
                      />
                      <ThemedText style={styles.topoNodeLabel}>
                        {node.label}
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.backendTag,
                        {
                          backgroundColor: `${backColor}18`,
                          borderColor: `${backColor}35`,
                        },
                      ]}
                    >
                      <ThemedText
                        style={[styles.backendTagText, { color: backColor }]}
                      >
                        {node.backend}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.topoLatency}>
                      {node.latencyMs} ms
                    </ThemedText>
                  </View>
                );
              })}
            </View>

            {swarmStatus ? (
              <ThemedText style={styles.bodyText}>
                {swarmStatus.activeRoutes} active route
                {swarmStatus.activeRoutes !== 1 ? 's' : ''} ·{' '}
                {swarmStatus.totalRequests.toLocaleString()} total requests
              </ThemedText>
            ) : null}

            {latestSwarmDecision ? (
              <View
                style={[
                  styles.decisionCard,
                  isDark ? styles.decisionCardDark : styles.decisionCardLight,
                ]}
              >
                <ThemedText style={styles.decisionTitle}>
                  Latest routing decision
                </ThemedText>
                <ThemedText style={styles.decisionText}>
                  {latestSwarmDecision.currentSurface} →{' '}
                  {latestSwarmDecision.targetSurface} via{' '}
                  {latestSwarmDecision.targetBackend}
                </ThemedText>
                <ThemedText style={styles.decisionMeta}>
                  {latestSwarmDecision.estimatedLatencyMs} ms · confidence{' '}
                  {(latestSwarmDecision.confidence * 100).toFixed(0)}%
                </ThemedText>
                <ThemedText style={styles.decisionReason}>
                  {latestSwarmDecision.reason}
                </ThemedText>
              </View>
            ) : null}
          </ThemedView>

          {/* Ask Milla via Swarm */}
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Ask Milla via Swarm</ThemedText>
            <ThemedText style={styles.bodyText}>
              Messages are intelligently routed through the swarm — Milla picks
              the fastest, most capable node for your request.
            </ThemedText>

            {messages.length > 0 ? (
              <FlatList
                data={messages}
                scrollEnabled={false}
                keyExtractor={(m) => m.id}
                style={styles.chatList}
                contentContainerStyle={styles.chatListContent}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.msgRow,
                      item.role === 'user'
                        ? styles.msgRowUser
                        : styles.msgRowAssistant,
                    ]}
                  >
                    <View
                      style={[
                        styles.msgBubble,
                        item.role === 'user'
                          ? styles.msgBubbleUser
                          : isDark
                            ? styles.msgBubbleAssistantDark
                            : styles.msgBubbleAssistantLight,
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.msgText,
                          {
                            color:
                              item.role === 'user' ? '#04181f' : palette.text,
                          },
                        ]}
                      >
                        {item.content}
                      </ThemedText>
                      {item.routedVia ? (
                        <ThemedText style={styles.routeTag}>
                          via {item.routedVia}
                          {item.latencyMs ? ` · ${item.latencyMs}ms` : ''}
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>
                )}
              />
            ) : null}

            {isAsking ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#7df9ff" />
                <ThemedText style={styles.loadingText}>
                  Routing through swarm…
                </ThemedText>
              </View>
            ) : null}
            {askError ? (
              <ThemedText style={styles.errorText}>{askError}</ThemedText>
            ) : null}

            <View style={styles.composerRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask Milla through the swarm…"
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
                multiline
                editable={!isAsking}
              />
              <Pressable
                onPress={() => void handleAsk()}
                disabled={isAsking || !input.trim()}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    opacity:
                      isAsking || !input.trim() ? 0.4 : pressed ? 0.75 : 1,
                  },
                ]}
              >
                <ThemedText style={styles.sendBtnLabel}>↑</ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          {/* Swarm info */}
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">About Millanite Swarm</ThemedText>
            <ThemedText style={styles.bodyText}>
              Millanite Swarm is Milla's distributed intelligence layer. Rather
              than routing all requests through a single model, the swarm
              evaluates device capabilities, network conditions, latency
              budgets, and task complexity to select the optimal processing node
              in real time.
            </ThemedText>
            <ThemedText style={styles.bodyText}>
              Backends include on-device NPU/CPU (Android), local Ollama models,
              remote cloud APIs, and edge stubs — all managed transparently so
              you always get the fastest, most contextually aware response.
            </ThemedText>
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
  topoGrid: { gap: 8 },
  topoNode: {
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
  },
  topoNodeDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  topoNodeLight: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderColor: 'rgba(0,0,0,0.07)',
  },
  topoNodeHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  topoNodeLabel: { fontSize: 14, fontWeight: '700' },
  backendTag: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  backendTagText: { fontSize: 11, fontWeight: '700' },
  topoLatency: { fontSize: 12, opacity: 0.6 },
  decisionCard: {
    borderRadius: 14,
    padding: 12,
    gap: 4,
    borderWidth: 1,
  },
  decisionCardDark: {
    backgroundColor: 'rgba(125,249,255,0.05)',
    borderColor: 'rgba(125,249,255,0.15)',
  },
  decisionCardLight: {
    backgroundColor: 'rgba(0,180,220,0.04)',
    borderColor: 'rgba(0,180,220,0.15)',
  },
  decisionTitle: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  decisionText: { fontSize: 14, fontWeight: '700' },
  decisionMeta: { fontSize: 12, opacity: 0.65 },
  decisionReason: {
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.75,
    fontStyle: 'italic',
  },
  chatList: { maxHeight: 280 },
  chatListContent: { gap: 8 },
  msgRow: { flexDirection: 'row' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  msgBubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 3,
  },
  msgBubbleUser: { backgroundColor: '#7df9ff' },
  msgBubbleAssistantDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(125,249,255,0.15)',
  },
  msgBubbleAssistantLight: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d4eef8',
  },
  msgText: { fontSize: 14, lineHeight: 21 },
  routeTag: { fontSize: 10, opacity: 0.55, marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, opacity: 0.65 },
  errorText: { fontSize: 13, color: '#f87171', lineHeight: 19 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7df9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnLabel: { fontSize: 18, color: '#04181f', fontWeight: '800' },
});
