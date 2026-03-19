import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

import { MillaOrb } from '@/components/milla-orb';
import { ThemedText } from '@/components/themed-text';
import { useChat } from '@/hooks/use-chat';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Fonts } from '@/constants/theme';
import { millaApi } from '@/services/milla-api';

type SpeechModuleType = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
type SpeechSubscription = { remove(): void };
type SpeechOutputModuleType = typeof import('expo-speech');
type LocationModuleType = typeof import('expo-location');

interface LocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  label: string;
}

type VoiceRateMode = 'slow' | 'normal' | 'fast';

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/;

function parseImageMessage(content: string) {
  const match = content.match(MARKDOWN_IMAGE_PATTERN);
  if (!match) {
    return { text: content.trim(), imageUrl: null as string | null };
  }

  return {
    text: content.replace(MARKDOWN_IMAGE_PATTERN, '').trim(),
    imageUrl: match[1] || null,
  };
}

export default function ChatScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const {
    assistantMessageCount,
    apiBaseUrl,
    addTask,
    draftApiBaseUrl,
    error,
    generateImage,
    input,
    isAddingTask,
    isGeneratingImage,
    isLoading,
    isLoadingTasks,
    isRefreshing,
    listTasks,
    localModelEnabled,
    localModelError,
    localModelStatus,
    messages,
    refreshMessages,
    resetApiBaseUrl,
    saveApiBaseUrl,
    sendMessage,
    setDraftApiBaseUrl,
    setInput,
    setLocalModelEnabled,
    usingLocalModelFallback,
    usingOfflineFallback,
  } = useChat();
  const listRef = useRef<FlatList<(typeof messages)[number]> | null>(null);
  const speechModuleRef = useRef<SpeechModuleType | null>(null);
  const speechOutputModuleRef = useRef<SpeechOutputModuleType | null>(null);
  const speechSubscriptionsRef = useRef<SpeechSubscription[]>([]);
  const supportsOnDeviceRef = useRef(false);
  const locationModuleRef = useRef<LocationModuleType | null>(null);
  const [isSpeechAvailable, setIsSpeechAvailable] = useState(true);
  const [supportsOnDevice, setSupportsOnDevice] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(true);
  const [isSpeakingReply, setIsSpeakingReply] = useState(false);
  const [autoSendVoiceInput, setAutoSendVoiceInput] = useState(false);
  const [voiceRateMode, setVoiceRateMode] = useState<VoiceRateMode>('normal');
  const [chatToolsExpanded, setChatToolsExpanded] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSnapshot, setLocationSnapshot] = useState<LocationSnapshot | null>(null);
  const [isPreparingMic, setIsPreparingMic] = useState(false);
  const [isSavingEndpoint, setIsSavingEndpoint] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechStatus, setSpeechStatus] = useState('Tap Mic to enable voice input.');
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isCheckingGoogleAuth, setIsCheckingGoogleAuth] = useState(false);
  const [googleAuthenticated, setGoogleAuthenticated] = useState(false);

  const trust = useMemo(
    () =>
      Math.min(
        96,
        64 + assistantMessageCount * 4 + (isLoading ? 4 : 0) + (isListening ? 6 : 0)
      ),
    [assistantMessageCount, isListening, isLoading]
  );

  useEffect(() => {
    const scrollToLatest = () => {
      listRef.current?.scrollToEnd({ animated: true });
    };

    const frame = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frame);
  }, [isLoading, messages]);

  useEffect(() => {
    return () => {
      speechSubscriptionsRef.current.forEach((subscription) => subscription.remove());
      speechSubscriptionsRef.current = [];
      speechOutputModuleRef.current?.stop();
    };
  }, []);

  const syncSpeechStatus = (supportsOnDeviceRecognition: boolean) => {
    setSpeechStatus(
      supportsOnDeviceRecognition
        ? 'Offline voice ready.'
        : Platform.OS === 'android'
          ? 'Voice ready. Download the offline pack for full on-device mode.'
          : 'Voice ready.'
        );
  };

  const refreshGoogleAuthStatus = useCallback(async () => {
    setIsCheckingGoogleAuth(true);

    try {
      const result = await millaApi.getGoogleAuthStatus();
      setGoogleAuthenticated(Boolean(result.authenticated));
      return Boolean(result.authenticated);
    } catch {
      setGoogleAuthenticated(false);
      return false;
    } finally {
      setIsCheckingGoogleAuth(false);
    }
  }, []);

  useEffect(() => {
    void refreshGoogleAuthStatus();
  }, [refreshGoogleAuthStatus]);

  const getSpeechRate = () => {
    switch (voiceRateMode) {
      case 'slow':
        return 0.8;
      case 'fast':
        return 1.08;
      case 'normal':
      default:
        return 0.95;
    }
  };

  const ensureSpeechModule = async () => {
    if (speechModuleRef.current) {
      return speechModuleRef.current;
    }

    try {
      const speechPackage = await import('expo-speech-recognition');
      const speechModule = speechPackage.ExpoSpeechRecognitionModule;
      speechModuleRef.current = speechModule;

      const recognitionAvailable = speechModule.isRecognitionAvailable();
      const supportsOnDeviceRecognition = speechModule.supportsOnDeviceRecognition();
      supportsOnDeviceRef.current = supportsOnDeviceRecognition;

      setIsSpeechAvailable(recognitionAvailable);
      setSupportsOnDevice(supportsOnDeviceRecognition);
      setSpeechError(null);
      setSpeechStatus(
        recognitionAvailable
          ? supportsOnDeviceRecognition
            ? 'Offline voice ready.'
            : Platform.OS === 'android'
              ? 'Voice ready. Download the offline pack for full on-device mode.'
              : 'Voice ready.'
          : 'Speech recognition is unavailable on this device.'
      );

      speechSubscriptionsRef.current = [
        speechModule.addListener('start', () => {
          setIsListening(true);
          setSpeechError(null);
          setSpeechStatus('Listening...');
        }),
        speechModule.addListener('end', () => {
          setIsListening(false);
          syncSpeechStatus(supportsOnDeviceRef.current);
        }),
        speechModule.addListener(
          'result',
          (event: ExpoSpeechRecognitionResultEvent) => {
            const transcript = event.results[0]?.transcript?.trim();
            if (!transcript) {
              return;
            }

            setInput(transcript);
            if (event.isFinal && autoSendVoiceInput) {
              setSpeechStatus('Sending voice message...');
              void handleSendMessage(transcript);
              return;
            }

            setSpeechStatus(event.isFinal ? 'Transcript ready to send.' : 'Listening...');
          }
        ),
        speechModule.addListener(
          'error',
          (event: ExpoSpeechRecognitionErrorEvent) => {
            setIsListening(false);
            setSpeechError(event.message || 'Speech recognition failed.');
            setSpeechStatus('Voice input hit an error.');
          }
        ),
      ];

      return speechModule;
    } catch {
      setIsSpeechAvailable(false);
      setSpeechStatus('Voice input unavailable in this build.');
      setSpeechError(
        'Voice input is not available in the installed Android build yet. Rebuild the dev app with `npx expo run:android` to include the native speech module.'
      );
      return null;
    }
  };

  const ensureSpeechOutputModule = async () => {
    if (speechOutputModuleRef.current) {
      return speechOutputModuleRef.current;
    }

    try {
      const speechOutputModule = await import('expo-speech');
      speechOutputModuleRef.current = speechOutputModule;
      return speechOutputModule;
    } catch {
      setSpeechError('Spoken replies are unavailable in this build.');
      return null;
    }
  };

  const ensureLocationModule = async () => {
    if (locationModuleRef.current) {
      return locationModuleRef.current;
    }

    try {
      const locationModule = await import('expo-location');
      locationModuleRef.current = locationModule;
      return locationModule;
    } catch {
      setLocationError('Location is unavailable in this build.');
      return null;
    }
  };

  const refreshLocation = async () => {
    const locationModule = await ensureLocationModule();
    if (!locationModule) {
      return null;
    }

    setIsLocationLoading(true);
    setLocationError(null);

    try {
      const permissions = await locationModule.requestForegroundPermissionsAsync();
      if (!permissions.granted) {
        setLocationEnabled(false);
        setLocationSnapshot(null);
        setLocationError('Location permission was not granted.');
        return null;
      }

      const position = await locationModule.getCurrentPositionAsync({
        accuracy: locationModule.Accuracy.Balanced,
      });
      const [placemark] = await locationModule.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const labelParts = [
        placemark?.city,
        placemark?.region,
        placemark?.country,
      ].filter(Boolean);

      const nextSnapshot: LocationSnapshot = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy:
          typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
        label: labelParts.length > 0 ? labelParts.join(', ') : 'Current location ready',
      };

      setLocationSnapshot(nextSnapshot);
      setLocationEnabled(true);
      return nextSnapshot;
    } catch (error) {
      setLocationError(
        error instanceof Error ? error.message : 'Unable to refresh your location.'
      );
      return null;
    } finally {
      setIsLocationLoading(false);
    }
  };

  const buildLocationAwareMessage = (message: string, snapshot: LocationSnapshot) =>
    [
      'Use this optional live location context only if it helps:',
      `Location: ${snapshot.label}`,
      `Coordinates: ${snapshot.latitude.toFixed(5)}, ${snapshot.longitude.toFixed(5)}`,
      snapshot.accuracy ? `Accuracy: about ${Math.round(snapshot.accuracy)} meters` : null,
      '',
      `User message: ${message}`,
    ]
      .filter(Boolean)
      .join('\n');

  const stopSpeakingReply = () => {
    speechOutputModuleRef.current?.stop();
    setIsSpeakingReply(false);
  };

  const speakReply = async (text: string) => {
    if (!voiceRepliesEnabled || !text.trim()) {
      return;
    }

    const speechOutputModule = await ensureSpeechOutputModule();
    if (!speechOutputModule) {
      return;
    }

    stopSpeakingReply();
    setIsSpeakingReply(true);
    setSpeechStatus('Speaking Milla’s reply...');

    speechOutputModule.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: getSpeechRate(),
      onDone: () => {
        setIsSpeakingReply(false);
        syncSpeechStatus(supportsOnDeviceRef.current);
      },
      onStopped: () => {
        setIsSpeakingReply(false);
        syncSpeechStatus(supportsOnDeviceRef.current);
      },
      onError: () => {
        setIsSpeakingReply(false);
        setSpeechError('Unable to play Milla’s spoken reply.');
        setSpeechStatus('Spoken reply failed.');
      },
    });
  };

  const startListening = async () => {
    stopSpeakingReply();
    const speechModule = await ensureSpeechModule();
    if (!speechModule) {
      return;
    }

    if (!speechModule.isRecognitionAvailable()) {
      setSpeechError('Speech recognition is unavailable on this device.');
      return;
    }

    setIsPreparingMic(true);
    setSpeechError(null);

    try {
      const permissions = await speechModule.requestPermissionsAsync();
      if (!permissions.granted) {
        setSpeechError('Microphone and speech recognition permissions were not granted.');
        return;
      }

      speechModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: Platform.OS === 'android',
        addsPunctuation: true,
        requiresOnDeviceRecognition: supportsOnDeviceRef.current,
      });
    } catch (startError) {
      setSpeechError(
        startError instanceof Error
          ? startError.message
          : 'Unable to start voice input.'
      );
    } finally {
      setIsPreparingMic(false);
    }
  };

  const stopListening = () => {
    speechModuleRef.current?.stop();
  };

  const handleGoogleConnect = async () => {
    setIsConnectingGoogle(true);
    setSpeechError(null);

    try {
      const result = await millaApi.getGoogleAuthUrl();
      if (!result.url) {
        throw new Error('Google auth URL is unavailable.');
      }

      await openBrowserAsync(result.url, {
        presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
      });
      await refreshGoogleAuthStatus();
    } catch (authError) {
      setSpeechError(
        authError instanceof Error ? authError.message : 'Unable to open Google sign-in.'
      );
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleSendMessage = async (messageOverride?: string) => {
    stopSpeakingReply();
    const trimmedInput = (messageOverride ?? input).trim();
    if (!trimmedInput) {
      return;
    }

    let outboundMessage = trimmedInput;
    if (locationEnabled) {
      const snapshot = locationSnapshot || (await refreshLocation());
      if (snapshot) {
        outboundMessage = buildLocationAwareMessage(trimmedInput, snapshot);
      }
    }

    const assistantMessage = await sendMessage({
      visibleMessage: trimmedInput,
      outboundMessage,
    });

    if (assistantMessage?.role === 'assistant') {
      await speakReply(assistantMessage.content);
    }
  };

  const downloadOfflinePack = async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    const speechModule = await ensureSpeechModule();
    if (!speechModule) {
      return;
    }

    setSpeechError(null);
    try {
      const result = await speechModule.androidTriggerOfflineModelDownload({
        locale: 'en-US',
      });
      supportsOnDeviceRef.current = speechModule.supportsOnDeviceRecognition();
      setSupportsOnDevice(supportsOnDeviceRef.current);
      setSpeechStatus(result.message);
    } catch (downloadError) {
      setSpeechError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Unable to start the offline model download.'
      );
    }
  };

  const handleSaveEndpoint = async () => {
    setIsSavingEndpoint(true);
    try {
      await saveApiBaseUrl();
      setSpeechError(null);
    } catch (endpointError) {
      setSpeechError(
        endpointError instanceof Error
          ? endpointError.message
          : 'Unable to save the remote server URL.'
      );
    } finally {
      setIsSavingEndpoint(false);
    }
  };

  const handleResetEndpoint = async () => {
    setIsSavingEndpoint(true);
    try {
      await resetApiBaseUrl();
      setSpeechError(null);
    } catch (endpointError) {
      setSpeechError(
        endpointError instanceof Error
          ? endpointError.message
          : 'Unable to reset the server URL.'
      );
    } finally {
      setIsSavingEndpoint(false);
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: colorScheme === 'dark' ? '#050816' : '#eef8ff' },
      ]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 12}
        style={styles.flex}>
        <View style={styles.header}>
          <MillaOrb
            state={isListening ? 'listening' : isLoading ? 'thinking' : 'idle'}
            trust={trust}
          />
          <ThemedText type="title" style={styles.title}>
            Milla Deer
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {isListening
              ? 'Listening for your voice...'
              : isLoading
              ? 'Thinking through your last message...'
              : `Trust resonance ${trust}%`}
          </ThemedText>
          <ThemedText style={styles.meta}>
            {isSpeakingReply ? 'Speaking reply...' : speechStatus}
          </ThemedText>
          <ThemedText style={styles.endpointText}>Remote server: {apiBaseUrl}</ThemedText>
        </View>

        <FlatList
          ref={listRef}
          style={styles.messageList}
          data={messages}
          keyExtractor={(item, index) => `${item.role}-${index}-${item.content.slice(0, 24)}`}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            listRef.current?.scrollToEnd({ animated: true });
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void refreshMessages()}
              tintColor={palette.tint}
            />
          }
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            const parsedMessage = parseImageMessage(item.content);

            return (
              <View
                style={[
                  styles.messageRow,
                  isUser ? styles.userRow : styles.assistantRow,
                ]}>
                <View
                  style={[
                    styles.messageBubble,
                    isUser
                      ? styles.userBubble
                      : colorScheme === 'dark'
                        ? styles.assistantBubbleDark
                        : styles.assistantBubbleLight,
                  ]}>
                  <ThemedText
                    style={[
                      styles.messageRole,
                      { color: isUser ? '#082c38' : palette.icon },
                    ]}>
                    {isUser ? 'You' : 'Milla'}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.messageContent,
                      { color: isUser ? '#041821' : palette.text },
                    ]}>
                    {parsedMessage.text}
                  </ThemedText>
                  {parsedMessage.imageUrl ? (
                    <Image
                      source={{ uri: parsedMessage.imageUrl }}
                      style={styles.generatedImage}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={palette.tint} />
                <ThemedText style={styles.loadingText}>Milla is responding...</ThemedText>
              </View>
            ) : null
          }
        />

        <View
          style={[
            styles.composerCard,
            {
              backgroundColor:
                colorScheme === 'dark' ? 'rgba(14, 19, 35, 0.92)' : 'rgba(255, 255, 255, 0.95)',
              borderColor: colorScheme === 'dark' ? '#17324a' : '#cfe9f6',
            },
          ]}>
          {error ? (
            <ThemedText style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}

          {speechError ? <ThemedText style={styles.errorText}>{speechError}</ThemedText> : null}
          {locationError ? (
            <ThemedText style={styles.errorText}>{locationError}</ThemedText>
          ) : null}

          <Pressable
            onPress={() => setChatToolsExpanded((current) => !current)}
            style={({ pressed }) => [
              styles.toolsToggle,
              { opacity: pressed ? 0.82 : 1 },
            ]}>
            <ThemedText style={styles.toolsToggleLabel}>
              {chatToolsExpanded ? 'Hide chat tools' : 'Show chat tools'}
            </ThemedText>
            <ThemedText style={styles.toolsSummary}>
              Voice {voiceRepliesEnabled ? 'on' : 'off'} · Location {locationEnabled ? 'on' : 'off'}{' '}
              · Device model {localModelEnabled ? 'on' : 'off'}
            </ThemedText>
          </Pressable>

          {chatToolsExpanded ? (
            <ScrollView
              style={styles.toolsPanelScroll}
              contentContainerStyle={styles.toolsPanelContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled">
              <View style={styles.endpointCard}>
                <ThemedText style={styles.endpointLabel}>Server URL for away-from-home use</ThemedText>
                <TextInput
                  value={draftApiBaseUrl}
                  onChangeText={setDraftApiBaseUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="https://your-milla-host.example.com"
                  placeholderTextColor={colorScheme === 'dark' ? '#6f8aa0' : '#7a8c99'}
                  style={[
                    styles.endpointInput,
                    {
                      color: palette.text,
                      backgroundColor:
                        colorScheme === 'dark'
                          ? 'rgba(255,255,255,0.05)'
                          : 'rgba(2, 132, 199, 0.06)',
                    },
                  ]}
                />
                <View style={styles.endpointActions}>
                  <Pressable
                    onPress={() => void handleSaveEndpoint()}
                    disabled={isSavingEndpoint}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      { opacity: isSavingEndpoint ? 0.5 : pressed ? 0.82 : 1 },
                    ]}>
                    <ThemedText style={styles.secondaryActionLabel}>
                      {isSavingEndpoint ? 'Saving...' : 'Save URL'}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleResetEndpoint()}
                    disabled={isSavingEndpoint}
                    style={({ pressed }) => [
                      styles.ghostAction,
                      { opacity: isSavingEndpoint ? 0.5 : pressed ? 0.82 : 1 },
                    ]}>
                    <ThemedText style={styles.ghostActionLabel}>Reset</ThemedText>
                  </Pressable>
                </View>
                <ThemedText style={styles.endpointHint}>
                  Use a public HTTPS address here when you are away from your home network.
                  {usingLocalModelFallback
                    ? ' The app is currently answering through the on-device preview path.'
                    : usingOfflineFallback
                    ? ' The app is currently answering in offline fallback mode.'
                    : ' If the server cannot be reached, chat falls back locally.'}
                </ThemedText>
              </View>

              {Platform.OS === 'android' && isSpeechAvailable && !supportsOnDevice ? (
                <Pressable onPress={() => void downloadOfflinePack()} style={styles.secondaryAction}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    Download Android offline voice pack
                  </ThemedText>
                </Pressable>
              ) : null}

              <View style={styles.endpointActions}>
                <Pressable
                  onPress={() => void handleGoogleConnect()}
                  disabled={isConnectingGoogle}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    { opacity: isConnectingGoogle ? 0.5 : pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    {isConnectingGoogle ? 'Opening Google...' : 'Connect Google'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => void refreshGoogleAuthStatus()}
                  disabled={isCheckingGoogleAuth}
                  style={({ pressed }) => [
                    styles.ghostAction,
                    { opacity: isCheckingGoogleAuth ? 0.5 : pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.ghostActionLabel}>
                    {isCheckingGoogleAuth ? 'Checking...' : 'Refresh Google'}
                  </ThemedText>
                </Pressable>
              </View>

              <ThemedText style={styles.endpointHint}>
                {googleAuthenticated
                  ? 'Google sync is connected for this server session.'
                  : 'Google sync is not connected yet. Finish browser sign-in, then tap Refresh Google.'}
              </ThemedText>

              <View style={styles.endpointActions}>
                <Pressable
                  onPress={() => void setLocalModelEnabled(!localModelEnabled)}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    { opacity: pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    Device model: {localModelEnabled ? 'On' : 'Off'}
                  </ThemedText>
                </Pressable>
              </View>

              <ThemedText style={styles.endpointHint}>
                {localModelEnabled
                  ? localModelStatus === 'initializing'
                    ? 'Preparing the on-device preview path for remote failures.'
                    : localModelStatus === 'ready'
                    ? 'The Gemma/ExecuTorch preview path is ready to catch remote failures.'
                    : localModelStatus === 'error'
                    ? localModelError || 'The on-device preview path is unavailable.'
                    : 'The on-device preview path is standing by.'
                  : 'The on-device preview path stays off unless you enable it here.'}
              </ThemedText>

              <View style={styles.endpointActions}>
                <Pressable
                  onPress={() => {
                    if (locationEnabled) {
                      setLocationEnabled(false);
                      setLocationError(null);
                      return;
                    }

                    void refreshLocation();
                  }}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    { opacity: pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    Location assist: {locationEnabled ? 'On' : 'Off'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => void refreshLocation()}
                  disabled={isLocationLoading}
                  style={({ pressed }) => [
                    styles.ghostAction,
                    { opacity: isLocationLoading ? 0.5 : pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.ghostActionLabel}>
                    {isLocationLoading ? 'Refreshing...' : 'Refresh location'}
                  </ThemedText>
                </Pressable>
              </View>

              {locationEnabled ? (
                <ThemedText style={styles.endpointHint}>
                  {locationSnapshot
                    ? `Location attached to future messages: ${locationSnapshot.label}`
                    : 'Location assist is on. Refresh to attach your current location.'}
                </ThemedText>
              ) : (
                <ThemedText style={styles.endpointHint}>
                  Location assist stays off unless you enable it here. No background tracking.
                </ThemedText>
              )}

              <View style={styles.endpointActions}>
                <Pressable
                  onPress={() => setAutoSendVoiceInput((current) => !current)}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    { opacity: pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    Auto-send voice: {autoSendVoiceInput ? 'On' : 'Off'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setVoiceRateMode((current) =>
                      current === 'slow' ? 'normal' : current === 'normal' ? 'fast' : 'slow'
                    )
                  }
                  style={({ pressed }) => [
                    styles.ghostAction,
                    { opacity: pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.ghostActionLabel}>
                    Reply speed: {voiceRateMode}
                  </ThemedText>
                </Pressable>
              </View>

              <ThemedText style={styles.endpointHint}>
                Auto-send sends the final transcript immediately. Reply speed changes spoken output
                pace only.
              </ThemedText>

              <View style={styles.endpointActions}>
                <Pressable
                  onPress={() => void listTasks()}
                  disabled={isLoadingTasks}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    { opacity: isLoadingTasks ? 0.5 : pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    {isLoadingTasks ? 'Loading tasks...' : 'List tasks'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => void addTask(input)}
                  disabled={isAddingTask || !input.trim()}
                  style={({ pressed }) => [
                    styles.ghostAction,
                    {
                      opacity: isAddingTask || !input.trim() ? 0.5 : pressed ? 0.82 : 1,
                    },
                  ]}>
                  <ThemedText style={styles.ghostActionLabel}>
                    {isAddingTask ? 'Adding task...' : 'Add task'}
                  </ThemedText>
                </Pressable>
              </View>

              <View style={styles.endpointActions}>
                <Pressable
                  onPress={() => void generateImage(input)}
                  disabled={isGeneratingImage || !input.trim()}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    {
                      opacity: isGeneratingImage || !input.trim() ? 0.5 : pressed ? 0.82 : 1,
                    },
                  ]}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    {isGeneratingImage ? 'Generating image...' : 'Create image'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const nextValue = !voiceRepliesEnabled;
                    if (!nextValue) {
                      stopSpeakingReply();
                    }
                    setVoiceRepliesEnabled(nextValue);
                  }}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    { opacity: pressed ? 0.82 : 1 },
                  ]}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    Voice replies: {voiceRepliesEnabled ? 'On' : 'Off'}
                  </ThemedText>
                </Pressable>
                {isSpeakingReply ? (
                  <Pressable
                    onPress={stopSpeakingReply}
                    style={({ pressed }) => [
                      styles.ghostAction,
                      { opacity: pressed ? 0.82 : 1 },
                    ]}>
                    <ThemedText style={styles.ghostActionLabel}>Stop voice</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
          ) : null}

          <View style={styles.composerRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Message Milla..."
              placeholderTextColor={colorScheme === 'dark' ? '#6f8aa0' : '#7a8c99'}
              style={[
                styles.input,
                {
                  color: palette.text,
                  backgroundColor:
                    colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(2, 132, 199, 0.06)',
                },
              ]}
              multiline
              editable={!isLoading}
            />
            <Pressable
              onPress={isListening ? stopListening : () => void startListening()}
              disabled={isPreparingMic || !isSpeechAvailable}
              style={({ pressed }) => [
                styles.micButton,
                {
                  opacity:
                    isPreparingMic || !isSpeechAvailable ? 0.5 : pressed ? 0.82 : 1,
                },
              ]}>
              <ThemedText style={styles.micLabel}>
                {isPreparingMic ? '...' : isListening ? 'Stop' : 'Mic'}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => void handleSendMessage()}
              disabled={isLoading || !input.trim()}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  opacity: isLoading || !input.trim() ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}>
              <ThemedText style={styles.sendLabel}>Send</ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 34,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.88,
  },
  meta: {
    textAlign: 'center',
    opacity: 0.58,
    fontSize: 13,
    lineHeight: 18,
  },
  endpointText: {
    textAlign: 'center',
    opacity: 0.54,
    fontSize: 12,
    lineHeight: 17,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  messageList: {
    flex: 1,
  },
  messageRow: {
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  userBubble: {
    backgroundColor: '#7df9ff',
  },
  assistantBubbleDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.18)',
  },
  assistantBubbleLight: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d9edf8',
  },
  messageRole: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  messageContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  generatedImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  loadingText: {
    opacity: 0.7,
  },
  composerCard: {
    margin: 16,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  toolsPanelScroll: {
    maxHeight: 280,
  },
  toolsPanelContent: {
    gap: 10,
    paddingBottom: 2,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 132,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 21,
  },
  sendButton: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00f2ff',
  },
  sendLabel: {
    color: '#041821',
    fontWeight: '700',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#f59e0b',
  },
  endpointCard: {
    gap: 10,
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(125, 249, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.12)',
  },
  endpointLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  endpointInput: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
  },
  endpointActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  toolsToggle: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(125, 249, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.14)',
    gap: 4,
  },
  toolsToggleLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  toolsSummary: {
    fontSize: 12,
    lineHeight: 17,
    opacity: 0.72,
  },
  secondaryAction: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(125, 249, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.2)',
  },
  secondaryActionLabel: {
    color: '#7df9ff',
    fontSize: 13,
    fontWeight: '600',
  },
  ghostAction: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  ghostActionLabel: {
    color: '#dffcff',
    fontSize: 13,
    fontWeight: '600',
  },
  endpointHint: {
    fontSize: 12,
    lineHeight: 17,
    opacity: 0.7,
  },
  micButton: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#17324a',
  },
  micLabel: {
    color: '#dffcff',
    fontWeight: '700',
  },
});
