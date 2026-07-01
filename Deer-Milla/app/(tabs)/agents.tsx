import { useCallback, useState } from 'react';
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
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { millaApi } from '@/services/milla-api';
import type { Agent, SkillExecutionResponse } from '@/services/milla-api';

const FALLBACK_AGENTS: Agent[] = [
  {
    id: 'milla-core',
    name: 'Milla Core',
    description: 'Primary orchestrator — routing, memory, persona management.',
    status: 'active',
    capabilities: ['chat', 'memory', 'routing', 'persona'],
  },
  {
    id: 'coding-agent',
    name: 'Coding Agent',
    description: 'Writes, reviews, and debugs code across multiple languages.',
    status: 'idle',
    capabilities: ['code-gen', 'code-review', 'debug'],
  },
  {
    id: 'image-agent',
    name: 'Image Agent',
    description: 'Generates, edits, and analyzes images via Flux/Imagen.',
    status: 'idle',
    capabilities: ['image-gen', 'image-edit', 'vision'],
  },
  {
    id: 'calendar-agent',
    name: 'Calendar Agent',
    description: 'Manages events, reminders, and Google Tasks integration.',
    status: 'idle',
    capabilities: ['calendar', 'tasks', 'reminders'],
  },
  {
    id: 'search-agent',
    name: 'Search Agent',
    description: 'Real-time web search, news, and fact verification.',
    status: 'idle',
    capabilities: ['web-search', 'news', 'fact-check'],
  },
  {
    id: 'email-agent',
    name: 'Email Agent',
    description: 'Reads, drafts, and sends emails via connected account.',
    status: 'idle',
    capabilities: ['email-read', 'email-draft', 'email-send'],
  },
];

const STATUS_COLOR: Record<string, string> = {
  active: '#34d399',
  idle: '#7df9ff',
  busy: '#fbbf24',
  error: '#f87171',
};

function AgentCard({ agent }: { agent: Agent }) {
  const colorScheme = useColorScheme() ?? 'dark';
  const isDark = colorScheme === 'dark';
  const dotColor = STATUS_COLOR[agent.status] ?? '#7df9ff';

  return (
    <View
      style={[
        styles.agentCard,
        isDark ? styles.agentCardDark : styles.agentCardLight,
      ]}
    >
      <View style={styles.agentCardHeader}>
        <View style={styles.agentNameRow}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <ThemedText style={styles.agentName}>{agent.name}</ThemedText>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: `${dotColor}20`, borderColor: `${dotColor}40` },
          ]}
        >
          <ThemedText style={[styles.statusBadgeText, { color: dotColor }]}>
            {agent.status}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={styles.agentDesc}>{agent.description}</ThemedText>
      <View style={styles.capsRow}>
        {agent.capabilities.map((cap) => (
          <View key={cap} style={styles.capBadge}>
            <ThemedText style={styles.capText}>{cap}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function AgentsScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const [agents, setAgents] = useState<Agent[]>(FALLBACK_AGENTS);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [nlQuery, setNlQuery] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [skillResult, setSkillResult] = useState<SkillExecutionResponse | null>(
    null
  );
  const [skillError, setSkillError] = useState<string | null>(null);

  const refreshAgents = useCallback(async () => {
    setIsLoadingAgents(true);
    try {
      const result = await millaApi.getAgents();
      if (result?.length) setAgents(result);
    } catch {
      // Keep fallback agents
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  const executeSkill = useCallback(async () => {
    const query = nlQuery.trim();
    if (!query || isExecuting) return;

    setIsExecuting(true);
    setSkillResult(null);
    setSkillError(null);

    try {
      const result = await millaApi.executeSkillNL(query);
      setSkillResult(result);
    } catch (e) {
      setSkillError(
        e instanceof Error ? e.message : 'Unable to execute skill.'
      );
    } finally {
      setIsExecuting(false);
    }
  }, [nlQuery, isExecuting]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerPill}>
              <ThemedText style={styles.headerPillText}>Agent Hub</ThemedText>
            </View>
            <ThemedText type="title" style={styles.title}>
              Milla Agents
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Autonomous agents coordinated by Milla Core. Each agent handles a
              specialised domain.
            </ThemedText>
          </View>

          {/* Intelligent Tool Delegation */}
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Intelligent Tool Delegation</ThemedText>
            <ThemedText style={styles.bodyText}>
              Describe what you need in plain language. Milla picks the best
              tool and agent automatically.
            </ThemedText>
            <TextInput
              value={nlQuery}
              onChangeText={setNlQuery}
              placeholder="e.g. Set a reminder for my meeting tomorrow at 3pm…"
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
              editable={!isExecuting}
            />
            <Pressable
              onPress={() => void executeSkill()}
              disabled={isExecuting || !nlQuery.trim()}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  opacity:
                    isExecuting || !nlQuery.trim() ? 0.45 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <ThemedText style={styles.primaryBtnLabel}>
                {isExecuting ? 'Delegating…' : 'Ask Milla to handle it'}
              </ThemedText>
            </Pressable>

            {isExecuting ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#7df9ff" />
                <ThemedText style={styles.loadingText}>
                  Selecting best tool…
                </ThemedText>
              </View>
            ) : null}

            {skillResult ? (
              <View
                style={[
                  styles.resultCard,
                  isDark ? styles.resultCardDark : styles.resultCardLight,
                ]}
              >
                <View style={styles.delegationRow}>
                  <ThemedText style={styles.delegationLabel}>
                    Tool selected:
                  </ThemedText>
                  <View style={styles.toolBadge}>
                    <ThemedText style={styles.toolBadgeText}>
                      {skillResult.toolUsed}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.delegationReason}>
                  {skillResult.toolReason}
                </ThemedText>
                <ThemedText style={styles.resultText}>
                  {skillResult.result}
                </ThemedText>
              </View>
            ) : null}

            {skillError ? (
              <ThemedText style={styles.errorText}>{skillError}</ThemedText>
            ) : null}
          </ThemedView>

          {/* Agent list */}
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Active agents</ThemedText>
            <Pressable
              onPress={() => void refreshAgents()}
              disabled={isLoadingAgents}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => ({
                opacity: isLoadingAgents ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              {isLoadingAgents ? (
                <ActivityIndicator size="small" color="#7df9ff" />
              ) : (
                <ThemedText style={styles.refreshLabel}>Refresh</ThemedText>
              )}
            </Pressable>
          </View>

          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">MCP / Skills</ThemedText>
            <ThemedText style={styles.bodyText}>
              Milla has access to the Model Context Protocol tool registry.
              Tools are automatically selected based on your request using
              semantic intent matching — no need to know tool names.
            </ThemedText>
            <ThemedText style={styles.bodyText}>
              To invoke any tool directly, just describe what you need in the
              input above. Examples:
            </ThemedText>
            {[
              'Search the web for the latest news about React Native',
              'Add "Buy groceries" to my Google Tasks list',
              'Generate an image of a futuristic cityscape at night',
              "What's on my calendar today?",
            ].map((example) => (
              <Pressable
                key={example}
                onPress={() => setNlQuery(example)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                style={({ pressed }) => [
                  styles.exampleChip,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <ThemedText style={styles.exampleChipText}>
                  "{example}"
                </ThemedText>
              </Pressable>
            ))}
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
  header: {
    gap: 8,
    paddingBottom: 4,
  },
  headerPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: 'rgba(125, 249, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.22)',
  },
  headerPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  title: { textAlign: 'left' },
  subtitle: { lineHeight: 22, opacity: 0.75 },
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  bodyText: { lineHeight: 21, opacity: 0.78, fontSize: 14 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: { fontSize: 13, opacity: 0.65 },
  resultCard: {
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
  },
  resultCardDark: {
    backgroundColor: 'rgba(125, 249, 255, 0.05)',
    borderColor: 'rgba(125, 249, 255, 0.18)',
  },
  resultCardLight: {
    backgroundColor: 'rgba(0, 180, 220, 0.05)',
    borderColor: 'rgba(0, 180, 220, 0.2)',
  },
  delegationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  delegationLabel: {
    fontSize: 12,
    opacity: 0.65,
    fontWeight: '600',
  },
  toolBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
  },
  toolBadgeText: {
    fontSize: 12,
    color: '#34d399',
    fontWeight: '700',
  },
  delegationReason: {
    fontSize: 12,
    opacity: 0.65,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  resultText: {
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    fontSize: 13,
    color: '#f87171',
    lineHeight: 19,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingTop: 4,
  },
  refreshLabel: {
    fontSize: 13,
    color: '#7df9ff',
    fontWeight: '600',
  },
  agentCard: {
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
  },
  agentCardDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  agentCardLight: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderColor: 'rgba(0,0,0,0.08)',
  },
  agentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  agentName: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  agentDesc: {
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.72,
  },
  capsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  capBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(125, 249, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.16)',
  },
  capText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  exampleChip: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(125, 249, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.14)',
  },
  exampleChipText: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.8,
  },
});
