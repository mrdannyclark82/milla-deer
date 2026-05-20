import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';

export interface ScreenShareState {
  available: boolean;
  active: boolean;
  status: string | null;
  previewImageData: string | null;
}

interface ScreenShareNativeModule {
  getState(): Promise<ScreenShareState>;
  startScreenShare(): Promise<ScreenShareState>;
  captureCurrentScreen(): Promise<ScreenShareState>;
  stopScreenShare(): Promise<ScreenShareState>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const EVENT_NAME = 'screenShareStateChanged';
const nativeModule =
  Platform.OS === 'android'
    ? (NativeModules.ScreenShareModule as ScreenShareNativeModule | undefined)
    : undefined;
const eventEmitter = nativeModule ? new NativeEventEmitter(nativeModule as never) : null;

const unsupportedState: ScreenShareState = {
  available: false,
  active: false,
  status: 'Screen share is available in Android builds only.',
  previewImageData: null,
};

export function isScreenShareSupported() {
  return Boolean(nativeModule);
}

export async function getScreenShareState(): Promise<ScreenShareState> {
  if (!nativeModule) {
    return unsupportedState;
  }

  return nativeModule.getState();
}

export async function startScreenShare(): Promise<ScreenShareState> {
  if (!nativeModule) {
    return unsupportedState;
  }

  return nativeModule.startScreenShare();
}

export async function captureCurrentScreen(): Promise<ScreenShareState> {
  if (!nativeModule) {
    return unsupportedState;
  }

  return nativeModule.captureCurrentScreen();
}

export async function stopScreenShare(): Promise<ScreenShareState> {
  if (!nativeModule) {
    return unsupportedState;
  }

  return nativeModule.stopScreenShare();
}

export function addScreenShareStateListener(
  listener: (state: ScreenShareState) => void
): { remove(): void } {
  if (!eventEmitter) {
    return { remove() {} };
  }

  const subscription: EmitterSubscription = eventEmitter.addListener(EVENT_NAME, listener);
  return {
    remove() {
      subscription.remove();
    },
  };
}
