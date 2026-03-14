# GEMINI.md - Elara AI Virtual Assistant

## Project Overview

This project is a sophisticated AI virtual assistant named "Elara". It's a web-based application built with React, TypeScript, and Vite. The UI is modern and feature-rich, including a 3D avatar, a dashboard for monitoring AI metrics, and a chat interface that supports various "tools".

Elara interacts with the Google Gemini API to provide its core functionality, which includes:

*   **Chat:** Standard conversational AI.
*   **Google Search:** Web search capabilities.
*   **Maps:** Integration with Google Maps.
*   **Imagine:** Image generation.
*   **Veo Video:** Video generation.

The application is structured with a clear separation of concerns, with components for the UI, services for interacting with the Gemini API, and type definitions for the data models.

**Key Technologies:**

*   **Frontend:** React, TypeScript
*   **Build Tool:** Vite
*   **3D Graphics:** @react-three/fiber, @react-three/drei, three
*   **AI:** @google/genai
*   **Charting:** recharts

## Building and Running

### Prerequisites

*   Node.js

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

Create a `.env` file in the root of the project and add your Gemini API key:

```
GEMINI_API_KEY=your_api_key_here
```

### 3. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Other Scripts

*   **Build for Production:** `npm run build`
*   **Preview Production Build:** `npm run preview`

## Development Conventions

### Project Structure

*   `src/components`: React components for the UI.
*   `src/services`: Modules for interacting with external APIs, primarily the Gemini API.
*   `src/types`: TypeScript type definitions.
*   `App.tsx`: The main application component.
*   `index.tsx`: The entry point of the application.

### Coding Style

*   The codebase is written in TypeScript and uses modern React features like hooks.
*   Styling is done using Tailwind CSS (inferred from class names like `h-screen`, `w-screen`, `flex`, etc., although not explicitly in `package.json`, the class names are a strong indicator).
*   State management is handled with a combination of `useState`, `useEffect`, and a custom `usePersistentState` hook for storing data in `localStorage`.

### Key Libraries and Patterns

*   **`@google/genai`:** The official Google Gemini API client for Node.js. The `geminiService.ts` file contains the logic for interacting with this library.
*   **`@react-three/fiber` & `@react-three/drei`:** Used for rendering the 3D avatar.
*   **`recharts`:** Used for the metrics dashboard.
*   **Vite:** The build tool, configured in `vite.config.ts`. It's set up to handle TypeScript and React, and to proxy the `GEMINI_API_KEY` to the client-side code.
*   **Persistent State:** The `usePersistentState` hook in `App.tsx` is used to persist chat history, knowledge base, and other application state to `localStorage`.
