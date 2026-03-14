# Elara 3.0 - Android Application

<div align="center">
  <h1>🧠 Elara</h1>
  <p><strong>AI Virtual Assistant powered by Google Gemini</strong></p>
  <p>Version 3.0.0 | Android Native Application</p>
</div>

## 🚀 Overview

Elara is an advanced AI virtual assistant application built natively for Android using Kotlin and Jetpack Compose. It leverages Google's Gemini AI models to provide powerful conversational AI, image generation, code assistance, and more.

## ✨ Features

### Core AI Capabilities
- **💬 Chat**: Conversational AI with deep context understanding
- **🔍 Search**: Web search powered by Google integration
- **🗺️ Maps**: Location services and navigation guidance
- **🎨 Imagine**: AI image generation (Gemini Pro Image & Imagen)
- **🎬 Veo**: AI video generation
- **🎙️ Live Voice**: Real-time voice interaction with camera

### Development Tools
- **🛠️ Sandbox IDE**: Integrated code editor with:
  - Multi-file support (HTML, CSS, JS, TS, Kotlin, Python)
  - AI code generation
  - Live preview
  - Console output
  - GitHub integration

### Creative Suite
- **🎨 Creative Studio**: Art generation platform with:
  - Multiple model support (Gemini 3 Pro, Imagen 3)
  - Aspect ratio selection
  - Image gallery
  - Side-by-side comparison
  - Remix functionality

### Memory & Persistence
- **💾 Memory Database**: Room database for:
  - Conversation history
  - Generated images
  - Code files
  - User preferences
  - Growth journal

### Persona System
- **🎭 6 Persona Modes**:
  - Professional - Formal and precise
  - Casual - Friendly and relaxed
  - Empathetic - Supportive and understanding
  - Humorous - Light and entertaining
  - Motivational - Encouraging and inspiring
  - Adaptive - Automatically adjusts to context

### Dashboard
- **📊 Live Metrics**: Real-time performance tracking
- **🌱 Growth Journal**: Learning and improvement log
- **🔧 Module Status**: Active AI capabilities overview

## 📋 Requirements

- **Android Studio**: Iguana | 2023.2.1 or later
- **Gradle**: 8.5+
- **JDK**: 17
- **Android SDK**: 
  - Min SDK: 26 (Android 8.0)
  - Target SDK: 34 (Android 14)
  - Compile SDK: 34

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Language | Kotlin 1.9.22 |
| UI Framework | Jetpack Compose (BOM 2024.01.00) |
| Design System | Material 3 |
| Dependency Injection | Hilt 2.50 |
| Database | Room 2.6.1 |
| Networking | Retrofit 2.9.0 + OkHttp 4.12.0 |
| AI Integration | Google Generative AI SDK 0.9.0 |
| Image Loading | Coil 2.5.0 |
| Charts | Vico 1.13.1 |
| Async | Kotlin Coroutines 1.7.3 |

## 🚀 Building the Project

### Prerequisites

1. **Install Android Studio** (or use CLI with Gradle)
2. **Install JDK 17**
3. **Set ANDROID_HOME** environment variable

### Clone and Build

```bash
# Navigate to the project directory
cd /app/android/Elara

# Build debug APK
./gradlew assembleDebug

# Build release APK
./gradlew assembleRelease

# Run on connected device
./gradlew installDebug
```

### Build on Arch Linux

```bash
# Install required packages
sudo pacman -S jdk17-openjdk android-tools

# Set JAVA_HOME
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk

# Install Android SDK (via Android Studio or command line tools)
# Download from: https://developer.android.com/studio/command-line

# Set ANDROID_HOME
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Build
cd /app/android/Elara
./gradlew build
```

## 📁 Project Structure

```
Elara/
├── app/
│   ├── build.gradle.kts              # App-level build configuration
│   ├── proguard-rules.pro            # ProGuard rules
│   └── src/main/
│       ├── AndroidManifest.xml       # App manifest
│       ├── java/com/elara/app/
│       │   ├── MainActivity.kt       # Entry point
│       │   ├── ElaraApplication.kt   # Application class
│       │   ├── di/
│       │   │   └── AppModule.kt      # Hilt dependency injection
│       │   ├── data/
│       │   │   ├── database/         # Room database
│       │   │   │   ├── ElaraDatabase.kt
│       │   │   │   ├── Daos.kt
│       │   │   │   └── entities/
│       │   │   ├── models/           # Data models
│       │   │   └── repository/       # Data repository
│       │   ├── services/
│       │   │   ├── GeminiService.kt  # AI service
│       │   │   └── GitHubService.kt  # GitHub API
│       │   ├── viewmodel/
│       │   │   ├── ChatViewModel.kt
│       │   │   ├── CreativeStudioViewModel.kt
│       │   │   └── SandboxViewModel.kt
│       │   └── ui/
│       │       ├── theme/            # Material 3 theme
│       │       ├── navigation/       # Navigation graph
│       │       ├── components/       # Reusable composables
│       │       └── screens/          # App screens
│       └── res/
│           ├── values/               # Resources
│           ├── drawable/             # Vector drawables
│           ├── mipmap-*/             # App icons
│           └── xml/                  # Backup rules
├── build.gradle.kts                  # Project-level build
├── settings.gradle.kts               # Project settings
├── gradle.properties                 # Gradle properties
└── gradle/wrapper/                   # Gradle wrapper
```

## 🔑 API Configuration

The app uses Google Gemini API. The API key is configured in `app/build.gradle.kts`:

```kotlin
buildConfigField("String", "GEMINI_API_KEY", "\"YOUR_API_KEY\"")
```

**Important**: For production, move the API key to `local.properties` or use environment variables.

## 🎨 Theme

Elara uses a custom Material 3 dark theme with:

| Color | Hex | Usage |
|-------|-----|-------|
| Emerald | `#10B981` | Primary, Chat |
| Auburn | `#C04000` | Accent, Avatar |
| Purple | `#8B5CF6` | Secondary, Studio |
| Pink | `#EC4899` | Image Gen |
| Blue | `#3B82F6` | Search |
| Cyan | `#06B6D4` | Research |

## 📏 Screens

1. **ChatScreen** - Main conversation interface with avatar, tool selector, and thought logger
2. **DashboardScreen** - Metrics, persona matrix, growth journal
3. **CreativeStudioScreen** - Image generation with gallery
4. **SandboxScreen** - Code editor with preview and console
5. **SettingsScreen** - App configuration and data management

## 🔒 Permissions

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
```

## 🧪 Testing

```bash
# Run unit tests
./gradlew test

# Run instrumented tests
./gradlew connectedAndroidTest
```

## 📦 Dependencies

All dependencies are defined in `app/build.gradle.kts`. Key dependencies:

- **Google Generative AI SDK** - AI text and image generation
- **Jetpack Compose** - Modern declarative UI
- **Hilt** - Dependency injection
- **Room** - Local SQLite database
- **Retrofit** - REST API client
- **Coil** - Image loading

## 🚀 Features Roadmap

- [x] Chat with Gemini AI
- [x] Multiple tool modes (Chat, Search, Maps, Image, Video)
- [x] Creative Studio for image generation
- [x] Sandbox IDE with code generation
- [x] Memory database with Room
- [x] Persona system
- [x] Dashboard with metrics
- [ ] Voice input/output
- [ ] Camera integration for live sessions
- [ ] Full video generation with Veo API
- [ ] Export/Import data functionality

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Google Gemini AI
- Jetpack Compose
- Material Design 3
- Original Elara 3.0 Web Application

---

<div align="center">
  <p>Built with ❤️ using Google Gemini</p>
</div>
