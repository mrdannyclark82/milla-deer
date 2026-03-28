import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

import { ThemedText } from '@/components/themed-text';
import { useChat } from '@/hooks/use-chat';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type SpeechModuleType = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
type SpeechSubscription = { remove(): void };
type SpeechOutputModuleType = typeof import('expo-speech');
type LocationModuleType = typeof import('expo-location');
type ScreenShareServiceModuleType = typeof import('@/services/screen-share');
type ScreenShareState = import('@/services/screen-share').ScreenShareState;

interface LocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  label: string;
}

type VoiceRateMode = 'slow' | 'normal' | 'fast';

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/;
const DEFAULT_SCREEN_SHARE_PROMPT =
  "I'm sharing my current screen. Tell me what you can infer from it and help me with anything relevant on display.";

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
    error,
    input,
    isLoading,
    isRefreshing,
    messages,
    refreshMessages,
    sendMessage,
    setInput,
  } = useChat();
  const listRef = useRef<FlatList<(typeof messages)[number]> | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const speechModuleRef = useRef<SpeechModuleType | null>(null);
  const speechOutputModuleRef = useRef<SpeechOutputModuleType | null>(null);
  const speechSubscriptionsRef = useRef<SpeechSubscription[]>([]);
  const supportsOnDeviceRef = useRef(false);
  const locationModuleRef = useRef<LocationModuleType | null>(null);
  const screenShareModuleRef = useRef<ScreenShareServiceModuleType | null>(null);
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
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [, setSpeechStatus] = useState('Tap Mic to enable voice input.');
  const [screenShareAvailable, setScreenShareAvailable] = useState(Platform.OS === 'android');
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [screenShareStatus, setScreenShareStatus] = useState<string | null>(
    Platform.OS === 'android' ? 'Screen share is ready when you need it.' : null
  );
  const [screenSharePreview, setScreenSharePreview] = useState<string | null>(null);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);
  const [isCapturingScreenShare, setIsCapturingScreenShare] = useState(false);

  const scrollToLatest = useCallback((animated = true) => {
    listRef.current?.scrollToEnd({ animated });
  }, []);

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      shouldAutoScrollRef.current = distanceFromBottom < 120;
    },
    []
  );

  const applyScreenShareState = useCallback((state: ScreenShareState) => {
    setScreenShareAvailable(state.available);
    setScreenShareActive(state.active);
    setScreenShareStatus(state.status);
    setScreenSharePreview(state.previewImageData);
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollToLatest(messages.length > 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [isLoading, messages, scrollToLatest]);

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

  const ensureScreenShareModule = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setScreenShareAvailable(false);
      setScreenShareStatus('Screen share is available in Android builds only.');
      return null;
    }

    if (screenShareModuleRef.current) {
      return screenShareModuleRef.current;
    }

    try {
      const screenShareModule = await import('@/services/screen-share');
      screenShareModuleRef.current = screenShareModule;
      setScreenShareAvailable(screenShareModule.isScreenShareSupported());
      if (!screenShareModule.isScreenShareSupported()) {
        setScreenShareStatus(
          'Screen share is not available in this Android build yet. Rebuild with `npm run android`.'
        );
        return null;
      }
      return screenShareModule;
    } catch {
      setScreenShareAvailable(false);
      setScreenShareStatus(
        'Screen share is not available in this Android build yet. Rebuild with `npm run android`.'
      );
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let subscription: { remove(): void } | null = null;

    void (async () => {
      const screenShareModule = await ensureScreenShareModule();
      if (!screenShareModule || !isMounted) {
        return;
      }

      applyScreenShareState(await screenShareModule.getScreenShareState());
      subscription = screenShareModule.addScreenShareStateListener((state) => {
        if (isMounted) {
          applyScreenShareState(state);
        }
      });
    })();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [applyScreenShareState, ensureScreenShareModule]);

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

  const handleScreenCaptureResult = async (state: ScreenShareState) => {
    applyScreenShareState(state);
    if (!state.previewImageData) {
      return;
    }

    const trimmedPrompt = input.trim();
    const assistantMessage = await sendMessage({
      visibleMessage: trimmedPrompt || 'Shared current screen for analysis.',
      outboundMessage: trimmedPrompt || DEFAULT_SCREEN_SHARE_PROMPT,
      imageData: state.previewImageData,
    });

    if (assistantMessage?.role === 'assistant') {
      await speakReply(assistantMessage.content);
    }
  };

  const handleStartScreenShare = async () => {
    const screenShareModule = await ensureScreenShareModule();
    if (!screenShareModule) {
      return;
    }

    setIsStartingScreenShare(true);
    try {
      const state = await screenShareModule.startScreenShare();
      await handleScreenCaptureResult(state);
    } finally {
      setIsStartingScreenShare(false);
    }
  };

  const handleCaptureCurrentScreen = async () => {
    const screenShareModule = await ensureScreenShareModule();
    if (!screenShareModule) {
      return;
    }

    setIsCapturingScreenShare(true);
    try {
      const state = await screenShareModule.captureCurrentScreen();
      await handleScreenCaptureResult(state);
    } finally {
      setIsCapturingScreenShare(false);
    }
  };

  const handleStopScreenShare = async () => {
    const screenShareModule = await ensureScreenShareModule();
    if (!screenShareModule) {
      return;
    }

    applyScreenShareState(await screenShareModule.stopScreenShare());
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

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: colorScheme === 'dark' ? '#050816' : '#eef8ff' },
      ]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        style={styles.flex}>
        <FlatList
          ref={listRef}
          style={styles.messageList}
          data={messages}
          keyExtractor={(item, index) => `${item.role}-${index}-${item.content.slice(0, 24)}`}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 16 + Math.max(insets.bottom, 12) },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={handleListScroll}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (shouldAutoScrollRef.current) {
              scrollToLatest(messages.length > 0);
            }
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
              marginBottom: Math.max(insets.bottom, 12),
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
              {chatToolsExpanded ? 'Hide conversation tools' : 'Show conversation tools'}
            </ThemedText>
            <ThemedText style={styles.toolsSummary}>
              Voice replies {voiceRepliesEnabled ? 'on' : 'off'} · Auto-send{' '}
              {autoSendVoiceInput ? 'on' : 'off'} · Location {locationEnabled ? 'on' : 'off'} ·
              Screen {screenShareActive ? 'on' : 'off'}
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
                <ThemedText style={styles.endpointLabel}>Chat stays focused now</ThemedText>
                <ThemedText style={styles.endpointHint}>
                  Home now handles server setup, Google sync, task actions, image generation, and
                  local model imports so this tab can stay centered on the actual conversation.
                </ThemedText>
              </View>

              {Platform.OS === 'android' && isSpeechAvailable && !supportsOnDevice ? (
                <Pressable onPress={() => void downloadOfflinePack()} style={styles.secondaryAction}>
                  <ThemedText style={styles.secondaryActionLabel}>
                    Download Android offline voice pack
                  </ThemedText>
                </Pressable>
              ) : null}

              {Platform.OS === 'android' ? (
                <>
                  <View style={styles.endpointActions}>
                    <Pressable
                      onPress={() =>
                        screenShareActive
                          ? void handleCaptureCurrentScreen()
                          : void handleStartScreenShare()
                      }
                      disabled={isStartingScreenShare || isCapturingScreenShare || isLoading}
                      style={({ pressed }) => [
                        styles.secondaryAction,
                        {
                          opacity:
                            isStartingScreenShare || isCapturingScreenShare || isLoading
                              ? 0.5
                              : pressed
                                ? 0.82
                                : 1,
                        },
                      ]}>
                      <ThemedText style={styles.secondaryActionLabel}>
                        {screenShareActive
                          ? isCapturingScreenShare
                            ? 'Capturing screen...'
                            : 'Capture current screen'
                          : isStartingScreenShare
                            ? 'Starting screen share...'
                            : 'Enable screen share'}
                      </ThemedText>
                    </Pressable>
                    {screenShareActive ? (
                      <Pressable
                        onPress={() => void handleStopScreenShare()}
                        style={({ pressed }) => [
                          styles.ghostAction,
                          { opacity: pressed ? 0.82 : 1 },
                        ]}>
                        <ThemedText style={styles.ghostActionLabel}>Stop screen share</ThemedText>
                      </Pressable>
                    ) : null}
                  </View>

                  <ThemedText style={styles.endpointHint}>
                    {screenShareAvailable
                      ? screenShareStatus ||
                        'Enable screen share, then capture the current screen when you want Milla to inspect it.'
                      : 'Screen share needs a rebuilt Android dev app with the native module included.'}
                  </ThemedText>

                  {screenSharePreview ? (
                    <Image
                      source={{ uri: screenSharePreview }}
                      style={styles.screenSharePreview}
                      resizeMode="cover"
                    />
                  ) : null}
                </>
              ) : null}

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

              <ThemedText style={styles.endpointHint}>
                Need backgrounds, tasks, server setup, or model tools? Head back to Home for those
                controls.
              </ThemedText>
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
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
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
    textAlignVertical: 'top',
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
  screenSharePreview: {
    width: '100%',
    aspectRatio: 0.58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
