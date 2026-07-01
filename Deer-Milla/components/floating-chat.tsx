import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { millaApi } from '@/services/milla-api';
import { ThemedText } from '@/components/themed-text';

interface QuickMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

export function FloatingChat() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (expanded) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    }
  }, [messages, expanded]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: QuickMessage = {
      role: 'user',
      content: trimmed,
      id: `u-${Date.now()}`,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await millaApi.sendMessage(trimmed);
      const content = response.response || response.content;
      if (!content) throw new Error(response.error || 'Empty response');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content, id: `a-${Date.now()}` },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reach Milla.');
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading]);

  const isDark = colorScheme === 'dark';
  const fabBottom = insets.bottom + 72;

  if (!expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        style={[styles.fab, { bottom: fabBottom }]}
      >
        <View style={styles.fabInner}>
          <ThemedText style={styles.fabIcon}>✦</ThemedText>
        </View>
      </Pressable>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.panel, { bottom: fabBottom - 8 }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.panelCard,
          {
            backgroundColor: isDark
              ? 'rgba(8, 15, 30, 0.97)'
              : 'rgba(248, 252, 255, 0.97)',
            borderColor: isDark
              ? 'rgba(125, 249, 255, 0.2)'
              : 'rgba(0, 180, 220, 0.25)',
          },
        ]}
      >
        <View style={styles.panelHeader}>
          <View style={styles.panelTitleRow}>
            <View style={styles.statusDot} />
            <ThemedText style={styles.panelTitle}>Quick Ask Milla</ThemedText>
          </View>
          <Pressable
            onPress={() => setExpanded(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.closeBtn}
          >
            <ThemedText style={styles.closeBtnLabel}>✕</ThemedText>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <ThemedText style={styles.emptyHint}>
              Ask anything — this floats across every tab.
            </ThemedText>
          ) : null}
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.msgRow,
                msg.role === 'user'
                  ? styles.msgRowUser
                  : styles.msgRowAssistant,
              ]}
            >
              <View
                style={[
                  styles.msgBubble,
                  msg.role === 'user'
                    ? styles.msgBubbleUser
                    : isDark
                      ? styles.msgBubbleAssistantDark
                      : styles.msgBubbleAssistantLight,
                ]}
              >
                <ThemedText
                  style={[
                    styles.msgText,
                    { color: msg.role === 'user' ? '#04181f' : palette.text },
                  ]}
                >
                  {msg.content}
                </ThemedText>
              </View>
            </View>
          ))}
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#7df9ff" />
              <ThemedText style={styles.loadingText}>
                Milla is thinking…
              </ThemedText>
            </View>
          ) : null}
          {error ? (
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          ) : null}
        </ScrollView>

        <View style={styles.composerRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Milla anything..."
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
            editable={!isLoading}
            onSubmitEditing={() => void handleSend()}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => void handleSend()}
            disabled={isLoading || !input.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                opacity: isLoading || !input.trim() ? 0.4 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <ThemedText style={styles.sendBtnLabel}>↑</ThemedText>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    zIndex: 999,
  },
  fabInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#7df9ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7df9ff',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabIcon: {
    fontSize: 22,
    color: '#05131f',
    fontWeight: '800',
  },
  panel: {
    position: 'absolute',
    right: 14,
    left: 14,
    zIndex: 999,
  },
  panelCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 360,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125, 249, 255, 0.12)',
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#7df9ff',
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnLabel: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.7,
  },
  messageList: {
    maxHeight: 200,
  },
  messageListContent: {
    padding: 12,
    gap: 8,
  },
  emptyHint: {
    fontSize: 13,
    opacity: 0.5,
    textAlign: 'center',
    paddingVertical: 12,
  },
  msgRow: {
    flexDirection: 'row',
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAssistant: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '85%',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  msgBubbleUser: {
    backgroundColor: '#7df9ff',
  },
  msgBubbleAssistantDark: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(125,249,255,0.15)',
  },
  msgBubbleAssistantLight: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#cce8f4',
  },
  msgText: {
    fontSize: 13,
    lineHeight: 19,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 12,
    opacity: 0.6,
  },
  errorText: {
    fontSize: 12,
    color: '#ff6b6b',
    lineHeight: 17,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(125,249,255,0.1)',
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 80,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 19,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#7df9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnLabel: {
    fontSize: 16,
    color: '#04181f',
    fontWeight: '800',
  },
});
