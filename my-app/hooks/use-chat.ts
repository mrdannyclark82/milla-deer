import { useCallback, useEffect, useMemo, useState } from 'react';

import { generateOfflineCompanionResponse } from '@/services/offline-companion';
import {
  getLocalModelEnabled,
  localModelService,
  setLocalModelEnabled as persistLocalModelEnabled,
  type LocalModelStatus,
} from '@/services/local-model-service';
import { ChatMessage, millaApi } from '@/services/milla-api';

const DEFAULT_GREETING: ChatMessage = {
  role: 'assistant',
  content: "Hey love, I'm here. Ask me anything and I'll stay with you.",
};

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  if (!messages.length) {
    return [DEFAULT_GREETING];
  }

  return messages;
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
  const [localModelError, setLocalModelError] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);

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

    void getLocalModelEnabled().then((enabled) => {
      if (!isMounted) {
        return;
      }

      setLocalModelEnabled(enabled);

      if (!enabled) {
        setLocalModelStatus('idle');
        setLocalModelError(null);
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
              : 'Unable to prepare the on-device preview model.'
          );
        });
    });

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
      return;
    }

    setLocalModelStatus('initializing');
    try {
      await localModelService.initialize();
      setLocalModelStatus(localModelService.getStatus());
      setLocalModelError(null);
    } catch (initializationError) {
      setLocalModelStatus('error');
      setLocalModelError(
        initializationError instanceof Error
          ? initializationError.message
          : 'Unable to prepare the on-device preview model.'
      );
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const nextMessages = await millaApi.getMessages();
      setUsingOfflineFallback(false);
      setMessages(normalizeMessages(nextMessages));
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
  }) => {
    const trimmedInput = input.trim();
    const visibleContent = options?.visibleMessage?.trim() || trimmedInput;
    const outboundContent = options?.outboundMessage?.trim() || trimmedInput;

    if (!trimmedInput || isLoading) {
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
      const response = await millaApi.sendMessage(outboundContent);
      const assistantContent = response.response || response.content;

      if (!assistantContent) {
        throw new Error(response.error || 'Milla sent an empty response.');
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistantContent,
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);
      setUsingLocalModelFallback(false);
      return assistantMessage;
    } catch (sendError) {
      if (localModelEnabled) {
        try {
          setLocalModelStatus('initializing');
          const localModelResponse = await localModelService.runInference(trimmedInput);
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
          setLocalModelError(null);
          setError(
            `Remote link unavailable at ${apiBaseUrl}. Switched to the on-device ${localModelResponse.backend === 'executorch-preview' ? 'ExecuTorch' : 'Gemma'} preview.`
          );
          return assistantMessage;
        } catch (localModelFailure) {
          setUsingLocalModelFallback(false);
          setLocalModelStatus('error');
          setLocalModelError(
            localModelFailure instanceof Error
              ? localModelFailure.message
              : 'The on-device preview model was unavailable.'
          );
        }
      }

      setUsingOfflineFallback(true);
      setError(`Remote link unavailable at ${apiBaseUrl}. Switched to offline fallback.`);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: generateOfflineCompanionResponse(trimmedInput),
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);
      return assistantMessage;
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, input, isLoading, localModelEnabled]);

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
        const assistantContent =
          result.response ||
          (result.imageUrl
            ? `🎨 Generated image for "${trimmedPrompt}"\n\n![Generated Image](${result.imageUrl})`
            : '');

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
      setError(taskError instanceof Error ? taskError.message : 'Unable to load tasks right now.');
      return null;
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
    setLocalModelEnabled: updateLocalModelEnabled,
    usingLocalModelFallback,
    usingOfflineFallback,
  };
}
