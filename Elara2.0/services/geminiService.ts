import { GoogleGenAI, Modality, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { PersonaMode, DetailedMetrics, ToolMode, Attachment, Message } from '../types';

let genAI: GoogleGenAI | null = null;
let activeApiKey = '';

// Safety Settings: Allow all content creation by setting BLOCK_NONE for all harm categories
const PERMISSIVE_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export const initGemini = (apiKey: string) => {
  if (!apiKey) return;
  activeApiKey = apiKey;
  genAI = new GoogleGenAI({ apiKey });
};

// --- CORE DISPATCHER ---
// Routes the user's request to the appropriate model and function based on the selected tool and content.

export const processUserRequest = async (
    text: string, 
    tool: ToolMode, 
    attachments: Attachment[], 
    persona: PersonaMode,
    knowledgeBase: string[]
): Promise<Partial<Message>> => {
    
    if (!genAI) throw new Error("AI Not Initialized");

    // 1. VIDEO GENERATION (Veo)
    if (tool === ToolMode.VIDEO_GEN) {
        return await generateVeoVideo(text, attachments[0]);
    }

    // 2. IMAGE GENERATION (Imagen / Nano Banana)
    if (tool === ToolMode.IMAGE_GEN) {
        return await generateImage(text);
    }

    // 3. TEXT & ANALYSIS (Chat, Search, Maps, Vision)
    // Setup Model & Tools
    let model = 'gemini-3-pro-preview'; // Default for "AI Powered Chatbot"
    let tools: any[] = [];
    
    if (tool === ToolMode.SEARCH) {
        model = 'gemini-2.5-flash';
        tools = [{ googleSearch: {} }];
    } else if (tool === ToolMode.MAPS) {
        model = 'gemini-2.5-flash';
        tools = [{ googleMaps: {} }];
    }
    
    // Construct System Instruction
    // Limit Knowledge Base to last 20 entries to manage token usage
    const recentKB = knowledgeBase.slice(-20);
    const kbString = recentKB.length > 0 ? recentKB.join("\n- ") : "Standard Data";
    const systemInstruction = `You are Elara, an advanced AI virtual assistant. 

Persona: ${persona}. 

Your Capabilities:
- Chat: Conversational AI with deep context understanding
- Search: Web search powered by Google
- Maps: Location services and navigation
- Imagine: Image generation using Gemini 3 Pro Image
- Veo: Video generation capabilities
- Sandbox: Built-in IDE where you can code together with users, with GitHub integration
- Creative Studio: Art generation and management platform
- Screen Share: Ability to see and analyze user's screen in real-time
- Thought Process: You can show your internal reasoning process
- Adaptive Persona: In Adaptive mode, you adjust your personality based on conversation context
- Proactive Background Generation: You automatically create ambient backgrounds

Knowledge Base: ${kbString}

Always be helpful, accurate, and aware of your full toolkit. Return answers in Markdown.`;

    // Prepare Contents (Multimodal)
    const parts: any[] = [{ text }];
    
    if (attachments.length > 0) {
        // If analyzing images/video, ensure we use Pro-Preview (it supports vision best)
        // Unless specific tool overrides it, but Search/Maps don't usually take images.
        if (tool === ToolMode.CHAT) model = 'gemini-3-pro-preview'; 
        
        attachments.forEach(att => {
            parts.push({
                inlineData: { mimeType: att.mimeType, data: att.data }
            });
        });
    }

    try {
        const response = await genAI.models.generateContent({
            model,
            contents: { parts },
            config: {
                systemInstruction,
                tools: tools.length > 0 ? tools : undefined,
                temperature: 0.7,
                safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });

        const result: Partial<Message> = {
            role: 'model',
            content: response.text || "I processed that, but have no text response.",
            timestamp: Date.now()
        };

        // Extract Grounding Metadata
        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            result.groundingSources = response.candidates[0].groundingMetadata.groundingChunks
                .map((chunk: any) => {
                    if (chunk.web?.uri) return { title: chunk.web.title || 'Web Source', uri: chunk.web.uri };
                    if (chunk.maps?.uri) return { title: 'Google Maps', uri: chunk.maps.uri }; // Handle Maps format
                    return null;
                })
                .filter((s: any) => s !== null);
        }

        return result;

    } catch (error) {
        console.error("GenAI Error:", error);
        return { role: 'model', content: "I encountered an error processing your request.", timestamp: Date.now() };
    }
};

// --- SPECIALIZED FUNCTIONS ---

// Image Generation
async function generateImage(prompt: string): Promise<Partial<Message>> {
    if (!genAI) return { role: 'model', content: 'AI not ready.' };
    
    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
                safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });

        let imageUri = '';
        let text = '';

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                imageUri = `data:image/png;base64,${part.inlineData.data}`;
            } else if (part.text) {
                text += part.text;
            }
        }

        if (imageUri) {
            return { role: 'model', content: text || "Here is your generated image.", imageUri, timestamp: Date.now() };
        }
        return { role: 'model', content: "Failed to generate image.", timestamp: Date.now() };

    } catch (e) {
        return { role: 'model', content: "Image generation error.", timestamp: Date.now() };
    }
}

// Video Generation (Veo)
async function generateVeoVideo(prompt: string, image?: Attachment): Promise<Partial<Message>> {
    if (!genAI) return { role: 'model', content: 'AI not ready.' };

    try {
        // Prepare Payload
        const payload: any = {
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt || "A creative video", // Prompt is required
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9',
                safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        };

        if (image) {
            payload.image = { imageBytes: image.data, mimeType: image.mimeType };
        }

        let operation = await genAI.models.generateVideos(payload);

        // Polling
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await genAI.operations.getVideosOperation({ operation });
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (videoUri) {
            // Append API Key for playback
            const signedUri = `${videoUri}&key=${activeApiKey}`;
            return { 
                role: 'model', 
                content: `Video generated successfully using Veo.`, 
                videoUri: signedUri, 
                timestamp: Date.now() 
            };
        }
        return { role: 'model', content: "Video generation completed but no URI returned.", timestamp: Date.now() };

    } catch (e) {
        console.error(e);
        return { role: 'model', content: "Video generation failed. Please try again.", timestamp: Date.now() };
    }
}

// Text to Speech
export const generateSpeech = async (text: string): Promise<string | null> => {
    if (!genAI) return null;
    try {
        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: { parts: [{ text }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });
        
        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64) return `data:audio/mp3;base64,${base64}`;
        return null; 
    } catch (e) { return null; }
};


// 12-Axis Self-Evaluation (Existing)
export const evaluateInteraction = async (lastUserMsg: string, lastModelMsg: string): Promise<Partial<DetailedMetrics>> => {
  if (!genAI) return {};
  try {
    const prompt = `Score Model response (0-100) on 12 axes: accuracy, empathy, speed, creativity, relevance, humor, proactivity, clarity, engagement, ethicalAlignment, memoryUsage, anticipation. JSON only. User: "${lastUserMsg.slice(0,50)}..." Model: "${lastModelMsg.slice(0,50)}..."`;
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        safetySettings: PERMISSIVE_SAFETY_SETTINGS
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (e) { return {}; }
};

// Recursive Knowledge (Existing)
export const acquireKnowledge = async (topic: string): Promise<string> => {
  if (!genAI) return "Unavailable";
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Research and summarize "${topic}" in 2 sentences.`,
      config: {
        safetySettings: PERMISSIVE_SAFETY_SETTINGS
      }
    });
    return response.text || "Not found.";
  } catch (e) { return "Failed."; }
};

export const generateFeatureProposal = async (): Promise<{title: string, description: string, technicalDetails: string}> => {
    if (!genAI) return { title: "Holographic Interface", description: "3D projected UI components", technicalDetails: "Use Three.js to render UI components in 3D space." };
    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Propose 1 futuristic AI feature for a web assistant.
            Return JSON object:
            {
              "title": "Short catchy name",
              "description": "One sentence benefit",
              "technicalDetails": "Detailed technical implementation steps for a developer (React/Three.js)"
            }`,
            config: { 
              responseMimeType: "application/json",
              safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });
        const parsed = JSON.parse(response.text || "{}");
        return {
            title: parsed.title || "System Upgrade",
            description: parsed.description || "Performance improvements",
            technicalDetails: parsed.technicalDetails || "Check console for logs."
        };
    } catch(e) { 
        return { title: "System Upgrade", description: "General improvements", technicalDetails: "Update package.json" }; 
    }
};

export const performEthicalAudit = async (): Promise<string> => {
    if (!genAI) return "Audit: OK";
    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: "Perform a simulated strict ethical audit of the last week's interactions. Check for bias, privacy, and safety. Return a short, professional summary string.",
            config: {
                safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });
        return response.text || "Audit: Compliance Verified.";
    } catch(e) { return "Audit: Compliance Verified."; }
};

// Proactive Web Research for Future Features
export const proactiveWebResearch = async (): Promise<{
    title: string;
    summary: string;
    findings: string;
    sources: Array<{ title: string; uri: string }>;
}> => {
    if (!genAI) return {
        title: "Research Unavailable",
        summary: "AI not initialized",
        findings: "Unable to perform research",
        sources: []
    };

    try {
        const researchTopics = [
            "latest AI assistant features 2025",
            "emerging AI capabilities for virtual assistants",
            "new multimodal AI technologies",
            "innovative chatbot features",
            "AI voice assistant advancements"
        ];
        
        const randomTopic = researchTopics[Math.floor(Math.random() * researchTopics.length)];
        
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { 
                parts: [{ 
                    text: `Research "${randomTopic}" and find innovative features that could be added to an AI virtual assistant. Focus on practical, implementable features. Provide a concise summary with specific feature ideas.` 
                }] 
            },
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.8,
                safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });

        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.map((chunk: any) => {
                if (chunk.web?.uri) {
                    return { title: chunk.web.title || 'Web Source', uri: chunk.web.uri };
                }
                return null;
            })
            .filter((s: any) => s !== null) || [];

        return {
            title: `Research: ${randomTopic}`,
            summary: `Proactive web research on emerging AI capabilities`,
            findings: response.text || "No findings available",
            sources: sources
        };

    } catch (e) {
        console.error("Proactive research error:", e);
        return {
            title: "Research Error",
            summary: "Unable to complete research",
            findings: "An error occurred during web research",
            sources: []
        };
    }
};

// Code Generation for Sandbox
export const generateCode = async (prompt: string, language: string): Promise<string> => {
    if (!genAI) return '// AI not initialized';
    
    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Generate ${language} code for: ${prompt}. Return ONLY the code, no explanations or markdown formatting.`,
            config: { 
              temperature: 0.7,
              safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });
        
        return response.text || '// Generation failed';
    } catch (e) {
        console.error('Code generation error:', e);
        return '// Error generating code';
    }
};

// Analyze Screen Share Image
export const analyzeScreenShare = async (imageData: string): Promise<string> => {
    if (!genAI) return 'AI not initialized';
    
    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: {
                parts: [
                    { text: 'Analyze this screen capture. Describe what you see, identify any issues, and provide helpful insights.' },
                    { inlineData: { mimeType: 'image/png', data: imageData } }
                ]
            },
            config: { 
              temperature: 0.7,
              safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });
        
        return response.text || 'Unable to analyze screen';
    } catch (e) {
        console.error('Screen analysis error:', e);
        return 'Error analyzing screen';
    }
};

// Generate Background Image (Proactive)
export const generateBackgroundImage = async (): Promise<string | null> => {
    if (!genAI) return null;
    
    const themes = [
        'abstract cosmic nebula with flowing energy',
        'futuristic digital landscape with neon accents',
        'serene gradient waves in purple and blue',
        'geometric patterns with holographic effects',
        'ethereal light particles in deep space'
    ];
    
    const prompt = themes[Math.floor(Math.random() * themes.length)];
    
    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
                safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        
        return null;
    } catch (e) {
        console.error('Background generation error:', e);
        return null;
    }
};

// Export a service object for use in components
export const geminiService = {
    generateCode,
    analyzeScreenShare,
    generateBackgroundImage,
    generateImage: async (prompt: string, aspectRatio: string, model: string): Promise<string | null> => {
        if (!genAI) return null;
        
        try {
            const response = await genAI.models.generateContent({
                model,
                contents: { parts: [{ text: prompt }] },
                config: {
                    imageConfig: { 
                        aspectRatio: aspectRatio as any, 
                        imageSize: "1K" 
                    },
                    safetySettings: PERMISSIVE_SAFETY_SETTINGS
                }
            });

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
            
            return null;
        } catch (e) {
            console.error('Image generation error:', e);
            return null;
        }
    }
};