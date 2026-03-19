# Milla mobile companion

This Expo app is the mobile companion for Milla Deer. It currently supports live chat, remote server routing, and native voice input through `expo-speech-recognition`.

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

## Not implemented yet

- Mobile screen sharing / MediaProjection-based live share
- Full offline local inference packaging

## References

- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo Android device setup](https://docs.expo.dev/workflow/android-studio-emulator/)
