# Milla mobile companion

This Expo app is the mobile companion for Milla Deer. It currently supports live chat, remote server routing, native voice input through `expo-speech-recognition`, and Android on-device MediaPipe fallback through the local runtime bridge.

## Install

```bash
npm install
```

## Run on Android

Use the wrapped Android script so the build prefers JDK 17 when the machine default Java is too new for the React Native Gradle toolchain:

```bash
npm run android -- -d
```

If you want the raw Expo command without the JDK helper, use:

```bash
npm run android:raw -- -d
```

## Voice input note

The microphone flow needs a native development build. `Expo Go` is not enough for `expo-speech-recognition`.

Once the app is installed through `npm run android -- -d`, open the Chat tab and test the `Mic` button.

## Current mobile scope

- Chat with the existing Milla backend
- Save a remote server URL for away-from-home access
- Use native speech recognition in a dev build
- Use the Android local model bridge with either an imported MediaPipe `.task` file or a bundled `.task` asset shipped inside the app build

## Local model packaging notes

- Deer-Milla currently targets MediaPipe GenAI text `.task` models for Android offline fallback.
- If you ship a `.task` file under `android/app/src/main/assets/`, the native bridge can now use that bundled asset directly.
- Imported `.task` files still take precedence over bundled assets when both exist.
- `android/app/build.gradle` marks `.task` files as `noCompress` so packaged model assets survive intact.
- The app now exposes `Balanced` and `Fast` offline profiles. `Fast` is the low-latency local handoff mode for lightweight offline replies.
- When multiple bundled `.task` files exist, Deer-Milla now routes `Balanced` and `Fast` to different assets using filename heuristics like `fast` / `mini` / `lite` / `1b` versus `balanced` / `base` / `main` / `2b`.

## Not implemented yet

- Mobile screen sharing / MediaProjection-based live share
- Turnkey model download or fetch inside the app itself

## References

- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo Android device setup](https://docs.expo.dev/workflow/android-studio-emulator/)
