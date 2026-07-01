import { Link } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Linking from 'expo-linking';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useChat } from '@/hooks/use-chat';
import { millaApi } from '@/services/milla-api';
import type {
  AvailableModel,
  MonologueSnapshot,
  RemState,
} from '@/services/milla-api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/;
const DEFAULT_BACKGROUND_PROMPT =
  'Create a cinematic Deer-Milla phone background with a luminous feminine AI presence, soft cyber teal lighting, elegant deer motifs, and a calm futuristic atmosphere.';

function extractImageUrl(content: string) {
  return content.match(MARKDOWN_IMAGE_PATTERN)?.[1] || null;
}

function formatMegabytes(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`;
  }

  return `${Math.round(value)} MB`;
}

function describeRuntimeSource(
  activeModelSource: 'bundled-asset' | 'imported-model' | null | undefined
) {
  switch (activeModelSource) {
    case 'bundled-asset':
      return 'Bundled model';
    case 'imported-model':
      return 'Imported model';
    default:
      return null;
  }
}

function describeProfile(profile: 'balanced' | 'fast') {
  return profile === 'fast' ? 'Fast' : 'Balanced';
}

function trimAssetName(assetPath: string | null | undefined) {
  return assetPath?.split('/').pop() || null;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];
  const isDark = colorScheme === 'dark';
  const [toolInput, setToolInput] = useState('');
  const [toolFeedback, setToolFeedback] = useState<string | null>(null);
  const [toolImageUrl, setToolImageUrl] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [isSavingEndpoint, setIsSavingEndpoint] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isCheckingGoogleAuth, setIsCheckingGoogleAuth] = useState(false);
  const [googleAuthenticated, setGoogleAuthenticated] = useState(false);
  const videoViewRef = useRef<VideoView>(null);

  // REM / internal monologue state
  const [remState, setRemState] = useState<RemState | null>(null);
  const [monologue, setMonologue] = useState<MonologueSnapshot | null>(null);
  const [isLoadingRem, setIsLoadingRem] = useState(false);

  // AI model selector state
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [modelFeedback, setModelFeedback] = useState<string | null>(null);

  const {
    apiBaseUrl,
    draftApiBaseUrl,
    error,
    generateImage,
    listTasks,
    addTask,
    isAddingTask,
    isGeneratingImage,
    isImportingLocalModel,
    isClearingLocalModel,
    isLoadingTasks,
    importLocalModel,
    clearImportedLocalModel,
    localModelEnabled,
    localModelError,
    localModelProfile,
    localModelRuntimeDetails,
    localModelStatus,
    resetApiBaseUrl,
    saveApiBaseUrl,
    setDraftApiBaseUrl,
    setLocalModelEnabled,
    setLocalModelProfile,
    latestSwarmDecision,
    swarmSyncError,
    usingLocalModelFallback,
    usingOfflineFallback,
  } = useChat();

  const player = useVideoPlayer(
    require('@/assets/videos/milla_loop.mp4'),
    (videoPlayer) => {
      videoPlayer.loop = true;
      videoPlayer.muted = true;
      videoPlayer.play();
    }
  );

  const remoteSummary = useMemo(() => {
    if (usingLocalModelFallback) {
      return 'Remote server unavailable, using the Android on-device runtime.';
    }

    if (usingOfflineFallback) {
      return 'Remote server unavailable, using offline fallback replies.';
    }

    return `Connected to ${apiBaseUrl}`;
  }, [apiBaseUrl, usingLocalModelFallback, usingOfflineFallback]);

  const localRuntimeFootprint = useMemo(() => {
    if (!localModelRuntimeDetails) {
      return null;
    }

    const parts = [
      `Android ${localModelRuntimeDetails.androidSdkInt}`,
      `${localModelRuntimeDetails.manufacturer} ${localModelRuntimeDetails.deviceModel}`.trim(),
    ];

    const runtimeSource = describeRuntimeSource(
      localModelRuntimeDetails.activeModelSource
    );
    if (runtimeSource) {
      parts.push(runtimeSource);
    }

    parts.push(`${describeProfile(localModelProfile)} profile`);

    const totalRam = formatMegabytes(localModelRuntimeDetails.totalRamMb);
    if (totalRam) {
      parts.push(`${totalRam} RAM`);
    }

    const importedModelSize = formatMegabytes(
      localModelRuntimeDetails.importedModelSizeMb
    );
    if (localModelRuntimeDetails.hasImportedModel && importedModelSize) {
      parts.push(`model ${importedModelSize}`);
    }

    return parts.join(' • ');
  }, [localModelProfile, localModelRuntimeDetails]);

  const swarmSummary = useMemo(() => {
    if (!latestSwarmDecision) {
      return swarmSyncError
        ? `Profile sync warning: ${swarmSyncError}`
        : 'Routing profile synced. Waiting for the next handoff decision.';
    }

    return `${latestSwarmDecision.currentSurface} -> ${latestSwarmDecision.targetSurface} via ${latestSwarmDecision.targetBackend} (${latestSwarmDecision.estimatedLatencyMs}ms)`;
  }, [latestSwarmDecision, swarmSyncError]);

  const refreshRemState = useCallback(async () => {
    setIsLoadingRem(true);
    try {
      const [rem, mono] = await Promise.all([
        millaApi.getRemState(),
        millaApi.getMonologue(),
      ]);
      setRemState(rem);
      setMonologue(mono);
    } catch {
      // Non-critical — keep previous state
    } finally {
      setIsLoadingRem(false);
    }
  }, []);

  useEffect(() => {
    void refreshRemState();
    const interval = setInterval(() => void refreshRemState(), 30_000);
    return () => clearInterval(interval);
  }, [refreshRemState]);

  const loadAvailableModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const models = await millaApi.getAvailableModels();
      setAvailableModels(models);
    } catch {
      // Non-critical
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    void loadAvailableModels();
  }, [loadAvailableModels]);

  const handleSelectModel = useCallback(async (modelId: string) => {
    setIsSavingModel(true);
    setModelFeedback(null);
    try {
      await millaApi.setPreferredModel(modelId);
      setAvailableModels((prev) =>
        prev.map((m) => ({ ...m, current: m.id === modelId }))
      );
      setModelFeedback(`Switched to ${modelId}`);
    } catch (e) {
      setModelFeedback(
        e instanceof Error ? e.message : 'Unable to save model preference.'
      );
    } finally {
      setIsSavingModel(false);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = !videoMuted;
    player.muted = next;
    setVideoMuted(next);
  }, [videoMuted, player]);

  const handleTogglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  const handlePiP = useCallback(() => {
    try {
      videoViewRef.current?.startPictureInPicture?.();
    } catch {
      // PiP not available in this build
    }
  }, []);

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

  const handleGoogleConnect = useCallback(async () => {
    setIsConnectingGoogle(true);
    setToolFeedback(null);

    try {
      const redirectUrl = 'deer-milla://google-auth';
      const result = await millaApi.getGoogleAuthUrl({
        mobileRedirectUri: redirectUrl,
      });
      if (!result.url) {
        throw new Error('Google auth URL is unavailable.');
      }

      const normalizedAuthUrl = (() => {
        const authUrl = new URL(result.url);
        authUrl.searchParams.set(
          'redirect_uri',
          'http://localhost:5000/oauth/callback'
        );
        return authUrl.toString();
      })();

      const authResult = await openAuthSessionAsync(
        normalizedAuthUrl,
        redirectUrl
      );
      if (authResult.type === 'success' && authResult.url) {
        const parsedUrl = Linking.parse(authResult.url);
        const sessionToken = parsedUrl.queryParams?.session_token;
        const googleConnected = parsedUrl.queryParams?.googleConnected;

        if (typeof sessionToken === 'string' && sessionToken.trim()) {
          await millaApi.setSessionToken(sessionToken);
        }

        if (googleConnected === '1') {
          await refreshGoogleAuthStatus();
          setToolFeedback('Google Tasks is connected and ready.');
          return;
        }
      }

      await refreshGoogleAuthStatus();
      setToolFeedback(
        'Google sign-in finished. Tap Refresh Google if task sync still looks disconnected.'
      );
    } catch (authError) {
      setToolFeedback(
        authError instanceof Error
          ? authError.message
          : 'Unable to open Google sign-in.'
      );
    } finally {
      setIsConnectingGoogle(false);
    }
  }, [refreshGoogleAuthStatus]);

  const handleCreateBackground = useCallback(async () => {
    const result = await generateImage(
      toolInput.trim() || DEFAULT_BACKGROUND_PROMPT
    );
    if (!result) {
      return;
    }

    setToolFeedback(result.content);
    setToolImageUrl(extractImageUrl(result.content));
  }, [generateImage, toolInput]);

  const handleListTasks = useCallback(async () => {
    const result = await listTasks();
    if (!result) {
      return;
    }

    setToolFeedback(result.content);
    setToolImageUrl(null);
  }, [listTasks]);

  const handleAddTask = useCallback(async () => {
    const trimmedValue = toolInput.trim();
    if (!trimmedValue) {
      setToolFeedback('Type a task title first, then tap Add task.');
      return;
    }

    const result = await addTask(trimmedValue);
    if (!result) {
      return;
    }

    setToolFeedback(result.content);
    setToolImageUrl(null);
    setToolInput('');
  }, [addTask, toolInput]);

  const handleSaveEndpoint = useCallback(async () => {
    setIsSavingEndpoint(true);
    try {
      await saveApiBaseUrl();
      setToolFeedback(`Saved remote server: ${draftApiBaseUrl}`);
    } catch (endpointError) {
      setToolFeedback(
        endpointError instanceof Error
          ? endpointError.message
          : 'Unable to save the remote server URL.'
      );
    } finally {
      setIsSavingEndpoint(false);
    }
  }, [draftApiBaseUrl, saveApiBaseUrl]);

  const handleResetEndpoint = useCallback(async () => {
    setIsSavingEndpoint(true);
    try {
      const nextUrl = await resetApiBaseUrl();
      setToolFeedback(`Reset remote server to ${nextUrl}`);
    } catch (endpointError) {
      setToolFeedback(
        endpointError instanceof Error
          ? endpointError.message
          : 'Unable to reset the server URL.'
      );
    } finally {
      setIsSavingEndpoint(false);
    }
  }, [resetApiBaseUrl]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.statusPill}>
              <ThemedText style={styles.statusPillText}>
                Home dashboard
              </ThemedText>
            </View>

            <ThemedText type="title" style={styles.title}>
              Deer-Milla
            </ThemedText>

            <ThemedText style={styles.subtitle}>
              Media, setup, and quick actions live here now. Chat is reserved
              for the actual conversation.
            </ThemedText>

            <View style={styles.mediaFrame}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={styles.mediaFallback}
                contentFit="contain"
              />
              <VideoView
                ref={videoViewRef}
                player={player}
                style={styles.mediaVideo}
                contentFit="contain"
                nativeControls={false}
                allowsPictureInPicture
                useExoShutter={false}
                onFirstFrameRender={() => setVideoReady(true)}
              />
              {!videoReady ? (
                <View style={styles.mediaOverlay}>
                  <ThemedText style={styles.mediaOverlayText}>
                    Loading Milla loop...
                  </ThemedText>
                </View>
              ) : null}
              {/* PiP and video controls overlay */}
              <View style={styles.videoControls} pointerEvents="box-none">
                <View style={styles.videoControlsRow}>
                  <Pressable
                    onPress={handleTogglePlay}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={({ pressed }) => [
                      styles.videoCtrlBtn,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <ThemedText style={styles.videoCtrlIcon}>
                      {player.playing ? '⏸' : '▶'}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={handleToggleMute}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={({ pressed }) => [
                      styles.videoCtrlBtn,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <ThemedText style={styles.videoCtrlIcon}>
                      {videoMuted ? '🔇' : '🔊'}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={handlePiP}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={({ pressed }) => [
                      styles.videoCtrlBtn,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <ThemedText style={styles.videoCtrlIcon}>⧉</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.signalRow}>
              <View style={styles.signalCard}>
                <ThemedText style={styles.signalLabel}>Remote</ThemedText>
                <ThemedText style={styles.signalValue}>
                  {remoteSummary}
                </ThemedText>
              </View>
              <View style={styles.signalCard}>
                <ThemedText style={styles.signalLabel}>Google</ThemedText>
                <ThemedText style={styles.signalValue}>
                  {googleAuthenticated ? 'Tasks connected' : 'Needs sign-in'}
                </ThemedText>
              </View>
              <View style={styles.signalCard}>
                <ThemedText style={styles.signalLabel}>Device model</ThemedText>
                <ThemedText style={styles.signalValue}>
                  {localModelEnabled ? localModelStatus : 'Off'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.quickActionRow}>
              <Link href="/chat" style={[styles.primaryCta, styles.flexCta]}>
                <ThemedText style={styles.primaryCtaText}>Open chat</ThemedText>
              </Link>
              <Link
                href="/explore"
                style={[styles.secondaryCta, styles.flexCta]}
              >
                <ThemedText style={styles.secondaryCtaText}>System</ThemedText>
              </Link>
            </View>
          </View>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Remote server</ThemedText>
            <ThemedText style={styles.bodyText}>
              Current server: {apiBaseUrl}
            </ThemedText>
            <TextInput
              value={draftApiBaseUrl}
              onChangeText={setDraftApiBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://your-milla-host.example.com"
              placeholderTextColor={
                colorScheme === 'dark' ? '#6f8aa0' : '#7a8c99'
              }
              style={[
                styles.input,
                {
                  color: palette.text,
                  backgroundColor:
                    colorScheme === 'dark'
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(2, 132, 199, 0.06)',
                },
              ]}
            />
            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => void handleSaveEndpoint()}
                disabled={isSavingEndpoint}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { opacity: isSavingEndpoint ? 0.5 : pressed ? 0.82 : 1 },
                ]}
              >
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
                ]}
              >
                <ThemedText style={styles.ghostActionLabel}>Reset</ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Create & organize</ThemedText>
            <ThemedText style={styles.bodyText}>
              Use this field for a background prompt or a task title. If you
              leave it blank, Create background uses a built-in Deer-Milla
              wallpaper prompt.
            </ThemedText>
            <TextInput
              value={toolInput}
              onChangeText={setToolInput}
              placeholder="Describe a wallpaper or type a task title..."
              placeholderTextColor={
                colorScheme === 'dark' ? '#6f8aa0' : '#7a8c99'
              }
              style={[
                styles.input,
                styles.tallInput,
                {
                  color: palette.text,
                  backgroundColor:
                    colorScheme === 'dark'
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(2, 132, 199, 0.06)',
                },
              ]}
              multiline
            />
            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => void handleCreateBackground()}
                disabled={isGeneratingImage}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { opacity: isGeneratingImage ? 0.5 : pressed ? 0.82 : 1 },
                ]}
              >
                <ThemedText style={styles.secondaryActionLabel}>
                  {isGeneratingImage ? 'Generating...' : 'Create background'}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void handleListTasks()}
                disabled={isLoadingTasks}
                style={({ pressed }) => [
                  styles.ghostAction,
                  { opacity: isLoadingTasks ? 0.5 : pressed ? 0.82 : 1 },
                ]}
              >
                <ThemedText style={styles.ghostActionLabel}>
                  {isLoadingTasks ? 'Loading tasks...' : 'List tasks'}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void handleAddTask()}
                disabled={isAddingTask}
                style={({ pressed }) => [
                  styles.ghostAction,
                  { opacity: isAddingTask ? 0.5 : pressed ? 0.82 : 1 },
                ]}
              >
                <ThemedText style={styles.ghostActionLabel}>
                  {isAddingTask ? 'Adding task...' : 'Add task'}
                </ThemedText>
              </Pressable>
            </View>

            {toolImageUrl ? (
              <Image
                source={{ uri: toolImageUrl }}
                style={styles.generatedImage}
                contentFit="cover"
              />
            ) : null}

            {toolFeedback ? (
              <ThemedText style={styles.feedbackText}>
                {toolFeedback}
              </ThemedText>
            ) : null}
            {error ? (
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            ) : null}
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Google & device runtime</ThemedText>
            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => void handleGoogleConnect()}
                disabled={isConnectingGoogle}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { opacity: isConnectingGoogle ? 0.5 : pressed ? 0.82 : 1 },
                ]}
              >
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
                ]}
              >
                <ThemedText style={styles.ghostActionLabel}>
                  {isCheckingGoogleAuth ? 'Checking...' : 'Refresh Google'}
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText style={styles.bodyText}>
              {googleAuthenticated
                ? 'Google sync is connected for this server session.'
                : 'Google sync is not connected yet. Connect it here before listing or adding tasks.'}
            </ThemedText>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => void setLocalModelEnabled(!localModelEnabled)}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { opacity: pressed ? 0.82 : 1 },
                ]}
              >
                <ThemedText style={styles.secondaryActionLabel}>
                  Device model: {localModelEnabled ? 'On' : 'Off'}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void importLocalModel()}
                disabled={isImportingLocalModel || isClearingLocalModel}
                style={({ pressed }) => [
                  styles.ghostAction,
                  {
                    opacity:
                      isImportingLocalModel || isClearingLocalModel
                        ? 0.5
                        : pressed
                          ? 0.82
                          : 1,
                  },
                ]}
              >
                <ThemedText style={styles.ghostActionLabel}>
                  {isImportingLocalModel
                    ? 'Importing model...'
                    : 'Import GenAI .task'}
                </ThemedText>
              </Pressable>
              {localModelRuntimeDetails?.hasImportedModel ? (
                <Pressable
                  onPress={() => void clearImportedLocalModel()}
                  disabled={isImportingLocalModel || isClearingLocalModel}
                  style={({ pressed }) => [
                    styles.ghostAction,
                    {
                      opacity:
                        isImportingLocalModel || isClearingLocalModel
                          ? 0.5
                          : pressed
                            ? 0.82
                            : 1,
                    },
                  ]}
                >
                  <ThemedText style={styles.ghostActionLabel}>
                    {isClearingLocalModel ? 'Clearing...' : 'Clear model'}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.buttonRow}>
              <Pressable
                onPress={() =>
                  void setLocalModelProfile(
                    localModelProfile === 'balanced' ? 'fast' : 'balanced'
                  )
                }
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { opacity: pressed ? 0.82 : 1 },
                ]}
              >
                <ThemedText style={styles.secondaryActionLabel}>
                  Offline profile: {describeProfile(localModelProfile)}
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText style={styles.bodyText}>
              {localModelEnabled
                ? localModelStatus === 'error'
                  ? localModelError ||
                    'The Android on-device runtime is unavailable.'
                  : localModelRuntimeDetails?.summary ||
                    'The Android on-device runtime is standing by.'
                : localModelRuntimeDetails?.hasBundledModelAsset
                  ? 'A bundled MediaPipe GenAI model is present in this build. Turn Device model on when you want Deer-Milla to use it as the offline fallback.'
                  : 'The Android on-device runtime stays off unless you enable it here.'}
            </ThemedText>
            <ThemedText style={styles.bodyText}>
              {localModelRuntimeDetails?.activeModelSource === 'bundled-asset'
                ? 'This build already carries a compatible MediaPipe GenAI text `.task` asset, so Deer-Milla can fall back locally without a manual import.'
                : localModelRuntimeDetails?.hasImportedModel
                  ? 'Imported models live inside Deer-Milla app storage. Bigger models take more phone storage and can raise memory pressure during inference.'
                  : 'Bring a compatible MediaPipe GenAI text `.task` model onto the phone, then import it here for Android on-device fallback.'}
            </ThemedText>
            <ThemedText style={styles.bodyText}>
              {localModelProfile === 'fast'
                ? 'Fast profile trims offline replies for lower-latency local handoff behavior.'
                : 'Balanced profile keeps fuller local replies when the remote link drops.'}
            </ThemedText>
            <ThemedText style={styles.bodyText}>{swarmSummary}</ThemedText>
            {(localModelRuntimeDetails?.bundledModelAssetCount ?? 0) > 1 ? (
              <ThemedText style={styles.bodyText}>
                {`Profile routing: fast -> ${
                  trimAssetName(
                    localModelRuntimeDetails?.preferredFastModelAssetPath
                  ) || 'no match'
                }, balanced -> ${
                  trimAssetName(
                    localModelRuntimeDetails?.preferredBalancedModelAssetPath
                  ) || 'no match'
                }.`}
              </ThemedText>
            ) : null}
            {localRuntimeFootprint ? (
              <ThemedText style={styles.captionText}>
                {localRuntimeFootprint}
              </ThemedText>
            ) : null}
          </ThemedView>

          {/* AI Model Selector */}
          <ThemedView style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <ThemedText type="subtitle">AI model</ThemedText>
              <Pressable
                onPress={() => void loadAvailableModels()}
                disabled={isLoadingModels}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={({ pressed }) => ({
                  opacity: isLoadingModels ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                <ThemedText style={styles.refreshLabel}>Refresh</ThemedText>
              </Pressable>
            </View>
            <ThemedText style={styles.bodyText}>
              Select the active AI model. Cloud models require a server
              connection; local models run on-device.
            </ThemedText>

            {availableModels.length > 0 ? (
              <>
                <ThemedText style={styles.modelGroupLabel}>☁ Cloud</ThemedText>
                <View style={styles.modelChipRow}>
                  {availableModels
                    .filter((m) => m.type === 'cloud')
                    .map((model) => (
                      <Pressable
                        key={model.id}
                        onPress={() => void handleSelectModel(model.id)}
                        disabled={isSavingModel || !model.available}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        style={({ pressed }) => [
                          styles.modelChip,
                          model.current && styles.modelChipActive,
                          !model.available && styles.modelChipDisabled,
                          { opacity: isSavingModel ? 0.6 : pressed ? 0.75 : 1 },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.modelChipText,
                            model.current && styles.modelChipTextActive,
                          ]}
                        >
                          {model.name}
                        </ThemedText>
                      </Pressable>
                    ))}
                </View>
                <ThemedText style={styles.modelGroupLabel}>⚡ Local</ThemedText>
                <View style={styles.modelChipRow}>
                  {availableModels
                    .filter((m) => m.type === 'local')
                    .map((model) => (
                      <Pressable
                        key={model.id}
                        onPress={() => void handleSelectModel(model.id)}
                        disabled={isSavingModel || !model.available}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        style={({ pressed }) => [
                          styles.modelChip,
                          model.current && styles.modelChipActive,
                          !model.available && styles.modelChipDisabled,
                          { opacity: isSavingModel ? 0.6 : pressed ? 0.75 : 1 },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.modelChipText,
                            model.current && styles.modelChipTextActive,
                          ]}
                        >
                          {model.name}
                        </ThemedText>
                      </Pressable>
                    ))}
                </View>
              </>
            ) : (
              <ThemedText style={styles.bodyText}>
                {isLoadingModels
                  ? 'Loading models…'
                  : 'Model list unavailable. Server may be offline.'}
              </ThemedText>
            )}
            {modelFeedback ? (
              <ThemedText style={styles.feedbackText}>
                {modelFeedback}
              </ThemedText>
            ) : null}
          </ThemedView>

          {/* REM Cycle & Internal Monologue */}
          <ThemedView style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <ThemedText type="subtitle">REM Cycle & Monologue</ThemedText>
              <Pressable
                onPress={() => void refreshRemState()}
                disabled={isLoadingRem}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={({ pressed }) => ({
                  opacity: isLoadingRem ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                <ThemedText style={styles.refreshLabel}>
                  {isLoadingRem ? '…' : 'Sync'}
                </ThemedText>
              </Pressable>
            </View>

            {remState ? (
              <>
                <View style={styles.remRow}>
                  <View
                    style={[
                      styles.remPhaseTag,
                      {
                        backgroundColor: remPhaseColor(remState.phase) + '22',
                        borderColor: remPhaseColor(remState.phase) + '55',
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.remPhaseText,
                        { color: remPhaseColor(remState.phase) },
                      ]}
                    >
                      {remState.phase.toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={styles.remProgressTrack}>
                    <View
                      style={[
                        styles.remProgressFill,
                        {
                          width:
                            `${remState.cycleProgress * 100}%` as `${number}%`,
                          backgroundColor: remPhaseColor(remState.phase),
                        },
                      ]}
                    />
                  </View>
                  <ThemedText style={styles.remProgressLabel}>
                    {Math.round(remState.cycleProgress * 100)}%
                  </ThemedText>
                </View>
                <ThemedText style={styles.bodyText}>
                  {remState.memoriesProcessed} memor
                  {remState.memoriesProcessed !== 1 ? 'ies' : 'y'} processed
                  this cycle.
                  {remState.dreamContent
                    ? ` Dream: ${remState.dreamContent}`
                    : ''}
                </ThemedText>
              </>
            ) : (
              <ThemedText style={styles.bodyText}>
                {isLoadingRem
                  ? 'Syncing REM state…'
                  : 'REM cycle data unavailable. Server may be offline.'}
              </ThemedText>
            )}

            {monologue ? (
              <>
                <ThemedText style={styles.monologueLabel}>
                  Internal monologue
                </ThemedText>
                <View
                  style={[
                    styles.monologueCard,
                    isDark
                      ? styles.monologueCardDark
                      : styles.monologueCardLight,
                  ]}
                >
                  <ThemedText style={styles.monologueFocus}>
                    Focus: {monologue.currentFocus}
                  </ThemedText>
                  <ThemedText style={styles.monologueMood}>
                    Mood: {monologue.emotionalState}
                  </ThemedText>
                  {monologue.thoughts.slice(0, 2).map((thought, i) => (
                    <ThemedText key={i} style={styles.monologueThought}>
                      • {thought}
                    </ThemedText>
                  ))}
                </View>
              </>
            ) : null}
          </ThemedView>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

function remPhaseColor(phase: string) {
  switch (phase) {
    case 'rem':
      return '#a78bfa';
    case 'deep':
      return '#7df9ff';
    case 'light':
      return '#34d399';
    case 'wake':
      return '#fbbf24';
    default:
      return '#7df9ff';
  }
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
  captionText: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.7,
  },
  mediaFrame: {
    height: 320,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#08111f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mediaFallback: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.36,
  },
  mediaVideo: {
    flex: 1,
  },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    backgroundColor: 'rgba(8, 17, 31, 0.22)',
  },
  mediaOverlayText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
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
    backgroundColor: '#7df9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    color: '#06111f',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  secondaryCta: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(125, 249, 255, 0.24)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  card: {
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  bodyText: {
    lineHeight: 22,
    opacity: 0.78,
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 21,
  },
  tallInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
  generatedImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  feedbackText: {
    lineHeight: 22,
    opacity: 0.86,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#f59e0b',
  },
  // Video controls
  videoControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
  },
  videoControlsRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 10,
  },
  videoCtrlBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(125,249,255,0.25)',
  },
  videoCtrlIcon: {
    fontSize: 15,
  },
  // Card header row (shared)
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshLabel: {
    fontSize: 13,
    color: '#7df9ff',
    fontWeight: '600',
  },
  // AI model selector
  modelGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  modelChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modelChip: {
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(125,249,255,0.2)',
    backgroundColor: 'rgba(125,249,255,0.05)',
  },
  modelChipActive: {
    backgroundColor: '#7df9ff',
    borderColor: '#7df9ff',
  },
  modelChipDisabled: {
    opacity: 0.38,
  },
  modelChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modelChipTextActive: {
    color: '#04181f',
    fontWeight: '800',
  },
  // REM cycle
  remRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  remPhaseTag: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  remPhaseText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  remProgressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  remProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  remProgressLabel: {
    fontSize: 12,
    opacity: 0.65,
    minWidth: 32,
    textAlign: 'right',
  },
  // Monologue
  monologueLabel: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monologueCard: {
    borderRadius: 14,
    padding: 12,
    gap: 5,
    borderWidth: 1,
  },
  monologueCardDark: {
    backgroundColor: 'rgba(167,139,250,0.06)',
    borderColor: 'rgba(167,139,250,0.18)',
  },
  monologueCardLight: {
    backgroundColor: 'rgba(167,139,250,0.04)',
    borderColor: 'rgba(167,139,250,0.15)',
  },
  monologueFocus: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  monologueMood: {
    fontSize: 12,
    opacity: 0.72,
    lineHeight: 18,
  },
  monologueThought: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.78,
    fontStyle: 'italic',
  },
});
