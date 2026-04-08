import { useCallback, useEffect, useMemo, useState } from 'react';
import { Directory, EncodingType, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { generateOfflineCompanionResponse } from '@/services/offline-companion';
import { gemma4Bridge } from '@/services/gemma4-bridge';
import { liteRTLMService } from '@/services/litert-lm-service';
import {
  getLocalModelEnabled,
  getLocalModelProfile,
  localModelService,
  setLocalModelEnabled as persistLocalModelEnabled,
  setLocalModelProfile as persistLocalModelProfile,
  type LocalModelProfile,
  type LocalModelRuntimeDetails,
  type LocalModelStatus,
} from '@/services/local-model-service';
import {
  ChatMessage,
  getDeviceSessionId,
  millaApi,
  type SwarmHandoffDecision,
} from '@/services/milla-api';
import {
  buildMobileCapabilityProfile,
  buildMobileHandoffRequest,
  describeSwarmDecision,
  shouldUseLocalRoute,
} from '@/services/swarm-routing';

const DEFAULT_GREETING: ChatMessage = {
  role: 'assistant',
  content: "Hey love, I'm here. Ask me anything and I'll stay with you.",
};
const DATA_IMAGE_URL_PATTERN = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/;
const GENERATED_IMAGE_CACHE_DIRECTORY = 'generated-images';

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  if (!messages.length) {
    return [DEFAULT_GREETING];
  }

  return messages;
}

function describeTaskFailure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to reach your task list right now.';

  if (message.includes("couldn't access your Google Tasks")) {
    return 'Google Tasks is connected, but no task list is available yet. Open Home, connect Google again if needed, and make sure your Tasks list exists in Google Tasks.';
  }

  if (message.includes('connect your Google account first')) {
    return 'Connect Google from Home before using task sync.';
  }

  return message;
}

function getImageFileExtension(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/png':
    default:
      return 'png';
  }
}

function describeLocalModelSource(runtimeDetails: LocalModelRuntimeDetails | null) {
  switch (runtimeDetails?.activeModelSource) {
    case 'bundled-asset':
      return 'the bundled MediaPipe runtime asset';
    case 'imported-model':
      return 'your imported MediaPipe model';
    default:
      return 'the Android on-device runtime';
  }
}

function describeLocalModelProfile(profile: LocalModelProfile) {
  return profile === 'fast' ? 'the fast offline profile' : 'the balanced offline profile';
}

async function materializeAndroidImageUrl(imageUrl: string, cacheKey: string) {
  if (Platform.OS !== 'android') {
    return imageUrl;
  }

  const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return imageUrl;
  }

  const [, mimeType, base64Payload] = match;
  const extension = getImageFileExtension(mimeType);
  const cacheDirectory = new Directory(Paths.cache, GENERATED_IMAGE_CACHE_DIRECTORY);

  try {
    if (!cacheDirectory.exists) {
      cacheDirectory.create({ idempotent: true, intermediates: true });
    }

    const imageFile = new File(cacheDirectory, `${cacheKey}.${extension}`);
    imageFile.create({ overwrite: true, intermediates: true });
    imageFile.write(base64Payload, { encoding: EncodingType.Base64 });
    return imageFile.uri;
  } catch (error) {
    console.warn('Unable to cache Android image payload locally.', error);
    return imageUrl;
  }
}

async function materializeMessageContent(content: string, cacheKey: string) {
  if (Platform.OS !== 'android') {
    return content;
  }

  const match = content.match(DATA_IMAGE_URL_PATTERN);
  if (!match) {
    return content;
  }

  const [inlineImageUrl] = match;
  const cachedImageUrl = await materializeAndroidImageUrl(inlineImageUrl, cacheKey);
  return content.replace(inlineImageUrl, cachedImageUrl);
}

async function materializeMessage(message: ChatMessage, cacheKey: string) {
  const nextContent = await materializeMessageContent(message.content, cacheKey);
  if (nextContent === message.content) {
    return message;
  }

  return {
    ...message,
    content: nextContent,
  };
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_GREETING]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(millaApi.defaultBaseUrl);
  const [draftApiBaseUrl, setDraftApiBaseUrl] = useState(millaApi.defaultBaseUrl);
  const [usingOfflineFallback, setUsingOfflineFallback] = useState(false);
  const [usingLocalModelFallback, setUsingLocalModelFallback] = useState(false);
  const [localModelEnabled, setLocalModelEnabled] = useState(false);
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus>('idle');
  const [localModelProfile, setLocalModelProfile] = useState<LocalModelProfile>('balanced');
  const [localModelError, setLocalModelError] = useState<string | null>(null);
  const [localModelRuntimeDetails, setLocalModelRuntimeDetails] =
    useState<LocalModelRuntimeDetails | null>(null);
  const [isImportingLocalModel, setIsImportingLocalModel] = useState(false);
  const [isClearingLocalModel, setIsClearingLocalModel] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [latestSwarmDecision, setLatestSwarmDecision] =
    useState<SwarmHandoffDecision | null>(null);
  const [swarmSyncError, setSwarmSyncError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void millaApi.getApiBaseUrl().then((resolvedBaseUrl) => {
      if (!isMounted) {
        return;
      }

      setApiBaseUrl(resolvedBaseUrl);
      setDraftApiBaseUrl(resolvedBaseUrl);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    void buildMobileCapabilityProfile({
      localModelEnabled,
      localModelProfile,
      localModelRuntimeDetails,
    })
      .then((profile) => millaApi.registerDeviceProfile(profile))
      .then(() => {
        if (isMounted) {
          setSwarmSyncError(null);
        }
      })
      .catch((syncError) => {
        if (isMounted) {
          setSwarmSyncError(
            syncError instanceof Error
              ? syncError.message
              : 'Unable to sync the device routing profile.'
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [localModelEnabled, localModelProfile, localModelRuntimeDetails]);

  useEffect(() => {
    let isMounted = true;

    void Promise.all([getLocalModelEnabled(), getLocalModelProfile()]).then(
      async ([enabled, profile]) => {
      try {
        const runtimeDetails = await localModelService.getLatestRuntimeDetails();
        if (isMounted) {
          setLocalModelRuntimeDetails(runtimeDetails);
        }
      } catch {
        if (isMounted) {
          setLocalModelRuntimeDetails(localModelService.getRuntimeDetails());
        }
      }

      if (!isMounted) {
        return;
      }

      setLocalModelEnabled(enabled);
      setLocalModelProfile(profile);

      if (!enabled) {
        setLocalModelStatus('idle');
        setLocalModelError(null);
        setLocalModelRuntimeDetails(localModelService.getRuntimeDetails());
        return;
      }

      setLocalModelStatus('initializing');
      void localModelService
        .initialize()
        .then(() => {
          if (!isMounted) {
            return;
          }

          setLocalModelStatus(localModelService.getStatus());
          setLocalModelRuntimeDetails(localModelService.getRuntimeDetails());
          setLocalModelError(null);
        })
        .catch((initializationError) => {
          if (!isMounted) {
            return;
          }

          setLocalModelStatus('error');
          setLocalModelError(
            initializationError instanceof Error
              ? initializationError.message
              : 'Unable to prepare the Android on-device runtime.'
          );
        });
      }
    );

    return () => {
      isMounted = false;
    };
  }, []);

  const updateLocalModelEnabled = useCallback(async (enabled: boolean) => {
    await persistLocalModelEnabled(enabled);
    setLocalModelEnabled(enabled);

    if (!enabled) {
      setUsingLocalModelFallback(false);
      setLocalModelStatus('idle');
      setLocalModelError(null);
      setLocalModelRuntimeDetails(localModelService.getRuntimeDetails());
      return;
    }

    setLocalModelStatus('initializing');
    try {
      await localModelService.initialize();
      setLocalModelStatus(localModelService.getStatus());
      setLocalModelRuntimeDetails(localModelService.getRuntimeDetails());
      setLocalModelError(null);
    } catch (initializationError) {
      setLocalModelStatus('error');
      setLocalModelError(
        initializationError instanceof Error
          ? initializationError.message
          : 'Unable to prepare the Android on-device runtime.'
      );
    }
  }, []);

  const updateLocalModelProfile = useCallback(async (profile: LocalModelProfile) => {
    await persistLocalModelProfile(profile);
    setLocalModelProfile(profile);
  }, []);

  const importLocalModel = useCallback(async () => {
    setIsImportingLocalModel(true);
    try {
      const runtimeDetails = await localModelService.importModelFromPicker();
      setLocalModelRuntimeDetails(runtimeDetails);
      setLocalModelStatus(runtimeDetails.isConfigured ? 'ready' : 'error');
      setLocalModelError(runtimeDetails.isConfigured ? null : runtimeDetails.summary);
      return runtimeDetails;
    } catch (importError) {
      setLocalModelStatus('error');
      setLocalModelError(
        importError instanceof Error
          ? importError.message
          : 'Unable to import the on-device GenAI model.'
      );
      throw importError;
    } finally {
      setIsImportingLocalModel(false);
    }
  }, []);

  const clearImportedLocalModel = useCallback(async () => {
    setIsClearingLocalModel(true);
    try {
      const runtimeDetails = await localModelService.clearImportedModel();
      setUsingLocalModelFallback(false);
      setLocalModelRuntimeDetails(runtimeDetails);
      setLocalModelStatus(runtimeDetails.isConfigured ? 'ready' : 'idle');
      setLocalModelError(null);
      return runtimeDetails;
    } catch (clearError) {
      setLocalModelStatus('error');
      setLocalModelError(
        clearError instanceof Error ? clearError.message : 'Unable to clear the imported model.'
      );
      throw clearError;
    } finally {
      setIsClearingLocalModel(false);
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const nextMessages = await millaApi.getMessages();
      const optimizedMessages = await Promise.all(
        nextMessages.map((message, index) => materializeMessage(message, `history-${index}`))
      );
      setUsingOfflineFallback(false);
      setMessages(normalizeMessages(optimizedMessages));
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to refresh the conversation.'
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

  const sendMessage = useCallback(async (options?: {
    outboundMessage?: string;
    visibleMessage?: string;
    imageData?: string;
  }) => {
    const trimmedInput = input.trim();
    const outboundContent = options?.outboundMessage?.trim() || trimmedInput;
    const visibleContent = options?.visibleMessage?.trim() || outboundContent;
    if (!outboundContent || isLoading) {
      return null;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: visibleContent,
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setUsingOfflineFallback(false);

    try {
      const sessionId = await getDeviceSessionId();
      const handoffIntent = options?.imageData ? 'vision' : 'chat';
      let handoffDecision: SwarmHandoffDecision | null = null;

      try {
        const handoffResponse = await millaApi.requestHandoffDecision(
          buildMobileHandoffRequest({
            sessionId,
            intent: handoffIntent,
            localModelEnabled,
            requiresVision: Boolean(options?.imageData),
          })
        );
        handoffDecision = handoffResponse.decision;
        setLatestSwarmDecision(handoffDecision);
      } catch {
        handoffDecision = null;
      }

      if (shouldUseLocalRoute(handoffDecision, localModelEnabled) && !options?.imageData) {
        setLocalModelStatus('initializing');
        const localModelResponse = await localModelService.runInference(
          outboundContent,
          localModelProfile
        );
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: localModelResponse.text,
        };

        setMessages((currentMessages) => [...currentMessages, assistantMessage]);
        setUsingLocalModelFallback(true);
        setUsingOfflineFallback(false);
        setLocalModelStatus('ready');
        setLocalModelRuntimeDetails(localModelService.getRuntimeDetails());
        setLocalModelError(null);
        setError(
          `Swarm routed this turn locally. ${describeSwarmDecision(handoffDecision) || ''}`.trim()
        );
        return assistantMessage;
      }

      const response = await millaApi.sendMessage(outboundContent, {
        imageData: options?.imageData,
        handoffDecision,
      });
      const assistantContent = response.response || response.content;

      if (!assistantContent) {
        throw new Error(response.error || 'Milla sent an empty response.');
      }

      const optimizedAssistantContent = await materializeMessageContent(
        assistantContent,
        `chat-${Date.now()}`
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: optimizedAssistantContent,
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);
      setUsingLocalModelFallback(false);
      return assistantMessage;
    } catch (sendError) {
        // ── Fallback 1: Gemma 4 on-device (E2B NPU or E4B CPU) ──────────────
        // Tried before localModelService because Gemma 4 is the newer capable
        // runtime; localModelService covers the legacy MediaPipe bundled asset.
        try {
          const gemma4Result = await gemma4Bridge.generate(
            outboundContent,
            options?.imageData
          );
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: gemma4Result.text,
          };
          setMessages((currentMessages) => [...currentMessages, assistantMessage]);
          setUsingLocalModelFallback(true);
          setUsingOfflineFallback(false);
          setLocalModelError(null);
          setError(
            `Cloud unavailable at ${apiBaseUrl}. Running on-device via Gemma 4 (${gemma4Result.variant}).`
          );
          return assistantMessage;
        } catch {
          // Gemma 4 native module not present in this build — try LiteRT-LM.
        }

        // ── Fallback 2: LiteRT-LM (react-native-litert-lm, Gemma 3n E2B) ─────
        // Newer Google LiteRT runtime with GPU/NPU acceleration and streaming.
        // Downloads Gemma 3n E2B INT4 (~650 MB) on first use.
        try {
          const liteRTResult = await liteRTLMService.generate(
            outboundContent,
            options?.imageData ? undefined : undefined // image path support added when we have a local path
          );
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: liteRTResult.text,
          };
          setMessages((currentMessages) => [...currentMessages, assistantMessage]);
          setUsingLocalModelFallback(true);
          setUsingOfflineFallback(false);
          setLocalModelError(null);
          setError(
            `Cloud unavailable. Running on-device via LiteRT-LM (${liteRTResult.backend.toUpperCase()}, ${liteRTResult.modelId}).`
          );
          return assistantMessage;
        } catch {
          // LiteRT-LM unavailable (model not downloaded yet or not supported) — try legacy.
        }

        // ── Fallback 3: Legacy MediaPipe / LocalModelModule ──────────────────
        if (localModelEnabled && !options?.imageData) {
          try {
            setLocalModelStatus('initializing');
            const localModelResponse = await localModelService.runInference(
              outboundContent,
              localModelProfile
            );
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: localModelResponse.text,
          };

          setMessages((currentMessages) => [
            ...currentMessages,
            assistantMessage,
          ]);
           setUsingLocalModelFallback(true);
           setUsingOfflineFallback(false);
           setLocalModelStatus('ready');
           setLocalModelRuntimeDetails(localModelService.getRuntimeDetails());
            setLocalModelError(null);
            setError(
              `Remote link unavailable at ${apiBaseUrl}. Switched to ${describeLocalModelSource(
                localModelService.getRuntimeDetails()
              )} with ${describeLocalModelProfile(localModelResponse.profile)}.${
                latestSwarmDecision
                  ? ` Last route: ${describeSwarmDecision(latestSwarmDecision)}.`
                  : ''
              }`
            );
            return assistantMessage;
        } catch (localModelFailure) {
          setUsingLocalModelFallback(false);
          setLocalModelStatus('error');
          setLocalModelRuntimeDetails(localModelService.getRuntimeDetails());
          setLocalModelError(
            localModelFailure instanceof Error
              ? localModelFailure.message
              : 'The Android on-device runtime was unavailable.'
          );
        }
      }

        // ── Fallback 4: Offline companion text ───────────────────────────────
      setUsingOfflineFallback(true);
      setError(`Remote link unavailable at ${apiBaseUrl}. All on-device runtimes unavailable. Switched to offline fallback.`);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: options?.imageData
          ? "I captured your screen, but I can't inspect it while the remote link is unavailable. Reconnect me and capture the screen again so I can help with what's visible."
          : generateOfflineCompanionResponse(outboundContent),
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);
      return assistantMessage;
    } finally {
      setIsLoading(false);
    }
  }, [
    apiBaseUrl,
    input,
    isLoading,
    latestSwarmDecision,
    localModelEnabled,
    localModelProfile,
    localModelRuntimeDetails,
  ]);

  const saveApiBaseUrl = useCallback(async () => {
    const normalizedBaseUrl = await millaApi.setApiBaseUrl(draftApiBaseUrl);
    setApiBaseUrl(normalizedBaseUrl);
    setDraftApiBaseUrl(normalizedBaseUrl);
    setError(null);
    return normalizedBaseUrl;
  }, [draftApiBaseUrl]);

  const resetApiBaseUrl = useCallback(async () => {
    const nextBaseUrl = await millaApi.resetApiBaseUrl();
    setApiBaseUrl(nextBaseUrl);
    setDraftApiBaseUrl(nextBaseUrl);
    setError(null);
    return nextBaseUrl;
  }, []);

  const assistantMessageCount = useMemo(
    () => messages.filter((message) => message.role === 'assistant').length,
    [messages]
  );

  const generateImage = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt || isGeneratingImage) {
        return null;
      }

      const userMessage: ChatMessage = {
        role: 'user',
        content: `Create an image: ${trimmedPrompt}`,
      };

      setMessages((currentMessages) => [...currentMessages, userMessage]);
      setInput('');
      setIsGeneratingImage(true);
      setError(null);

      try {
        const result = await millaApi.generateImage(trimmedPrompt);
        const cacheKey = `generated-${Date.now()}`;
        const optimizedImageUrl = result.imageUrl
          ? await materializeAndroidImageUrl(result.imageUrl, cacheKey)
          : null;
        const assistantContent = optimizedImageUrl
          ? `🎨 Generated image for "${trimmedPrompt}"\n\n![Generated Image](${optimizedImageUrl})`
          : await materializeMessageContent(result.response || '', cacheKey);

        if (!result.success || !assistantContent) {
          throw new Error(result.error || 'Image generation did not return a result.');
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: assistantContent,
        };

        setMessages((currentMessages) => [...currentMessages, assistantMessage]);
        return assistantMessage;
      } catch (generationError) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: generateOfflineCompanionResponse(`image request: ${trimmedPrompt}`),
        };

        setMessages((currentMessages) => [...currentMessages, assistantMessage]);
        setError(
          generationError instanceof Error
            ? generationError.message
            : 'Unable to generate an image right now.'
        );
        return assistantMessage;
      } finally {
        setIsGeneratingImage(false);
      }
    },
    [isGeneratingImage]
  );

  const listTasks = useCallback(async () => {
    if (isLoadingTasks) {
      return null;
    }

    setIsLoadingTasks(true);
    setError(null);

    try {
      const result = await millaApi.getTasks();
      const taskLines =
        result.tasks?.map((task, index) => {
          const status = task.status === 'completed' ? 'completed' : 'open';
          return `${index + 1}. ${task.title || '(Untitled task)'} — ${status}`;
        }) || [];

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content:
          taskLines.length > 0
            ? `Here are your current tasks:\n\n${taskLines.join('\n')}`
            : result.message || "You don't have any open tasks right now.",
      };

      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
      return assistantMessage;
    } catch (taskError) {
      const failureMessage = describeTaskFailure(taskError);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: failureMessage,
      };

      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
      setError(failureMessage);
      return assistantMessage;
    } finally {
      setIsLoadingTasks(false);
    }
  }, [isLoadingTasks]);

  const addTask = useCallback(
    async (title: string) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle || isAddingTask) {
        return null;
      }

      const userMessage: ChatMessage = {
        role: 'user',
        content: `Add task: ${trimmedTitle}`,
      };

      setMessages((currentMessages) => [...currentMessages, userMessage]);
      setInput('');
      setIsAddingTask(true);
      setError(null);

      try {
        const result = await millaApi.addTask(trimmedTitle);
        if (!result.success) {
          throw new Error(result.message || result.error || 'Task creation failed.');
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: result.message || `Added "${trimmedTitle}" to your tasks.`,
        };

        setMessages((currentMessages) => [...currentMessages, assistantMessage]);
        return assistantMessage;
      } catch (taskError) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content:
            taskError instanceof Error
              ? taskError.message
              : 'Unable to add that task right now.',
        };

        setMessages((currentMessages) => [...currentMessages, assistantMessage]);
        setError(
          taskError instanceof Error ? taskError.message : 'Unable to add that task right now.'
        );
        return assistantMessage;
      } finally {
        setIsAddingTask(false);
      }
    },
    [isAddingTask]
  );

  return {
    addTask,
    assistantMessageCount,
    apiBaseUrl,
    clearImportedLocalModel,
    draftApiBaseUrl,
    error,
    generateImage,
    importLocalModel,
    input,
    isAddingTask,
    isClearingLocalModel,
    isGeneratingImage,
    isImportingLocalModel,
    isLoading,
    isLoadingTasks,
    isRefreshing,
    listTasks,
    localModelEnabled,
    localModelError,
    localModelProfile,
    localModelRuntimeDetails,
    localModelStatus,
    messages,
    latestSwarmDecision,
    refreshMessages,
    resetApiBaseUrl,
    saveApiBaseUrl,
    sendMessage,
    setDraftApiBaseUrl,
    setInput,
    setLocalModelEnabled: updateLocalModelEnabled,
    setLocalModelProfile: updateLocalModelProfile,
    usingLocalModelFallback,
    usingOfflineFallback,
    swarmSyncError,
  };
}
