import React, { useState, useEffect, useRef } from 'react';
import Dashboard from './components/Dashboard';
import Avatar3D from './components/Avatar3D';
import YouTubePlayer from './components/YouTubePlayer';
import LiveSession from './components/LiveSession';
import Sandbox from './components/Sandbox';
import CreativeStudio from './components/CreativeStudio';
import ThoughtLogger from './components/ThoughtLogger';
import { 
  initGemini, 
  processUserRequest,
  evaluateInteraction, 
  acquireKnowledge, 
  generateFeatureProposal, 
  performEthicalAudit,
  proactiveWebResearch,
  geminiService
} from './services/geminiService';
import { 
  initMemoryDB, 
  storeMemory, 
  queryMemories, 
  searchMemories, 
  getMemoryStats,
  getUserProfile,
  saveUserProfile,
  exportMemoryData,
  importMemoryData,
  pruneMemories,
  type MemoryEntry,
  type UserProfile
} from './services/memoryDatabase';
import { Message, PersonaMode, DetailedMetrics, IntegrationStatus, YouTubeVideo, GrowthEntry, ToolMode, Attachment } from './types';

const DEMO_API_KEY = process.env.API_KEY || '';

// Hook for Persistent State
function usePersistentState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.warn(`Error saving localStorage key "${key}":`, error);
    }
  }, [key, state]);

  return [state, setState];
}

const App: React.FC = () => {
  // Persistent Chat State
  const [messages, setMessages] = usePersistentState<Message[]>('elara_messages', [
    { id: '1', role: 'model', content: "Systems Online. Neural Toolkit Active. I can search, generate images, create videos, code with you in the Sandbox, and create art. How can I help?", timestamp: Date.now() }
  ]);
  
  // Persistent Advanced State
  const [knowledgeBase, setKnowledgeBase] = usePersistentState<string[]>('elara_kb', []);
  const [growthLog, setGrowthLog] = usePersistentState<GrowthEntry[]>('elara_growth', []);
  const [metrics, setMetrics] = usePersistentState<DetailedMetrics>('elara_metrics', {
    accuracy: 85, empathy: 80, speed: 90, creativity: 75,
    relevance: 88, humor: 60, proactivity: 70, clarity: 92,
    engagement: 85, ethicalAlignment: 100, memoryUsage: 45, anticipation: 65
  });
    const [persona, setPersona] = usePersistentState<PersonaMode>('elara_persona', PersonaMode.ADAPTIVE);
    const [lastAuditTimestamp, setLastAuditTimestamp] = usePersistentState<number>('elara_last_audit', 0);
    const [lastResearchTimestamp, setLastResearchTimestamp] = usePersistentState<number>('elara_last_research', 0);
    const [backgroundImage, setBackgroundImage] = usePersistentState<string>('elara_background', '');
  
    // Transient State
    const [inputValue, setInputValue] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [thoughtProcess, setThoughtProcess] = useState('');
    const [memoryStats, setMemoryStats] = useState<any>(null);
    const [memoryDBReady, setMemoryDBReady] = useState(false);
    const [selectedTool, setSelectedTool] = useState<ToolMode>(ToolMode.CHAT);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [liveSessionActive, setLiveSessionActive] = useState(false);
    const [coachingMode, setCoachingMode] = useState(false);
    const [integrations] = useState<IntegrationStatus>({ google: true, grok: true, github: true });
    const [activeVideo, setActiveVideo] = useState<YouTubeVideo | null>(null);
    
    // New Feature States
    const [sandboxOpen, setSandboxOpen] = useState(false);
    const [sandboxCode, setSandboxCode] = useState('<!-- Start coding here -->');
    const [creativeStudioOpen, setCreativeStudioOpen] = useState(false);
    const [screenShareActive, setScreenShareActive] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
  
    useEffect(() => {
      if (DEMO_API_KEY) {
         initGemini(DEMO_API_KEY);
      }
      
      // Initialize Memory Database
      initMemoryDB().then(() => {
        setMemoryDBReady(true);
        refreshMemoryStats();
        console.log('✅ External Memory Database initialized');
      }).catch(err => {
        console.error('Failed to initialize Memory DB:', err);
      });

      // Listen for memory import events
      const handleMemoryImport = async (e: Event) => {
        const customEvent = e as CustomEvent;
        try {
          await importMemoryData(customEvent.detail);
          await refreshMemoryStats();
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            content: '📥 Memory database imported successfully.',
            timestamp: Date.now()
          }]);
        } catch (err) {
          console.error('Import failed:', err);
        }
      };

      window.addEventListener('memoryImport', handleMemoryImport);
      return () => window.removeEventListener('memoryImport', handleMemoryImport);
    }, [persona, knowledgeBase]);
    
    const refreshMemoryStats = async () => {
      try {
        const stats = await getMemoryStats();
        setMemoryStats(stats);
      } catch (err) {
        console.error('Error fetching memory stats:', err);
      }
    };
  
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
  
    // Proactive Background Generation (every 10 minutes if enabled)
    useEffect(() => {
      if (!DEMO_API_KEY) return;
      
      const interval = setInterval(async () => {
        const bgUrl = await geminiService.generateBackgroundImage();
        if (bgUrl) {
          setBackgroundImage(bgUrl);
          addGrowthEntry('learning', 'Background Generated', 'Proactively created a new ambient background');
        }
      }, 600000); // 10 minutes
      
      return () => clearInterval(interval);
    }, []);
    
    // Adaptive Persona - Analyze conversation patterns
    useEffect(() => {
      if (persona !== PersonaMode.ADAPTIVE || messages.length < 10) return;
      
      const analyzeConversation = async () => {
        const recentMessages = messages.slice(-10);
        const userMessages = recentMessages.filter(m => m.role === 'user').map(m => m.content).join(' ');
        
        // Simple heuristics for persona adaptation
        if (userMessages.match(/lol|haha|funny|joke/gi)) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'system',
            content: '🎭 Adapting to Humorous mode',
            timestamp: Date.now()
          }]);
        } else if (userMessages.match(/help|please|worried|concerned/gi)) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'system',
            content: '🎭 Adapting to Empathetic mode',
            timestamp: Date.now()
          }]);
        }
      };
      
      const timer = setTimeout(analyzeConversation, 5000);
      return () => clearTimeout(timer);
    }, [messages, persona]);
  
    // Periodic Events Logic (Commented out to avoid API quota issues)
    /*useEffect(() => {
      if (!DEMO_API_KEY) return;
  
      // 1. Feature Proposals: Keep running frequently as requested (approx every 60s)
      const featureInterval = setInterval(async () => {
          const proposal = await generateFeatureProposal();
          addGrowthEntry('proposal', proposal.title, proposal.description, proposal.technicalDetails);
      }, 60000);
  
      // 2. Ethical Audit: Run Weekly (Check every hour if a week has passed)
      const runAuditCheck = async () => {
          const now = Date.now();
          const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  
          // If it's been more than a week OR it's the very first run (0)
          if (now - lastAuditTimestamp > oneWeekMs || lastAuditTimestamp === 0) {
              const audit = await performEthicalAudit();
              addGrowthEntry('audit', 'Weekly Ethical Audit', audit);
              setLastAuditTimestamp(now);
          }
      };

      // 3. Proactive Web Research: Run every 2 hours
      const runResearchCheck = async () => {
          const now = Date.now();
          const twoHoursMs = 2 * 60 * 60 * 1000;

          if (now - lastResearchTimestamp > twoHoursMs || lastResearchTimestamp === 0) {
              const research = await proactiveWebResearch();
              addGrowthEntry('research', research.title, research.findings, undefined, research.sources);
              setLastResearchTimestamp(now);
          }
      };
  
      // Run checks immediately on mount, then set intervals
      runAuditCheck();
      runResearchCheck();
      const auditInterval = setInterval(runAuditCheck, 3600000); // Check every hour
      const researchInterval = setInterval(runResearchCheck, 3600000); // Check every hour
  
      return () => { 
          clearInterval(featureInterval); 
          clearInterval(auditInterval); 
          clearInterval(researchInterval); 
      };
    }, [lastAuditTimestamp, lastResearchTimestamp]);*/
  
    const addGrowthEntry = (type: GrowthEntry['type'], title: string, details: string, technicalDetails?: string, sources?: Array<{ title: string; uri: string }>) => {
      setGrowthLog(prev => [...prev, {
          id: Date.now().toString(),
          type,
          title,
          timestamp: Date.now(),
          details,
          technicalDetails,
          sources
      }]);
    };
  
    const handleGrowthEntryClick = (entry: GrowthEntry) => {
        if (entry.type === 'proposal' && entry.technicalDetails) {
            // If the user clicks a proposal, Elara explains how to implement it
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                content: `### 🛠️ Implementing: ${entry.title}\n\n**Concept:** ${entry.details}\n\n**Technical Guide:**\n${entry.technicalDetails}\n\n*Would you like me to generate the boilerplate code for this?*`,
                timestamp: Date.now()
            }]);
        } else if (entry.type === 'audit') {
             setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                content: `### ⚖️ Ethical Audit Report\n\n${entry.details}\n\n*Status: Verified and Compliant.*`,
                timestamp: Date.now()
            }]);
        } else if (entry.type === 'research') {
             setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                content: `### 🔍 ${entry.title}\n\n${entry.details}\n\n*Discovered through proactive web browsing.*`,
                timestamp: Date.now(),
                groundingSources: entry.sources
            }]);
        }
    };
  const handleClearMemory = () => {
    if (window.confirm("Are you sure you want to purge all memory? This cannot be undone.")) {
      localStorage.clear();
      window.location.reload();
    }
  };
  
  const handleExportMemory = async () => {
    try {
      const data = await exportMemoryData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elara-memory-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        content: '💾 Memory database exported successfully.',
        timestamp: Date.now()
      }]);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };
  
  const handleImportMemory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      await importMemoryData(text);
      await refreshMemoryStats();
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        content: '📥 Memory database imported successfully.',
        timestamp: Date.now()
      }]);
    } catch (err) {
      console.error('Import failed:', err);
    }
  };
  
  const handlePruneMemories = async () => {
    if (window.confirm('Remove memories older than 90 days with importance < 5?')) {
      try {
        const deleted = await pruneMemories(90, 5);
        await refreshMemoryStats();
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          content: `🧹 Pruned ${deleted} old memories from database.`,
          timestamp: Date.now()
        }]);
      } catch (err) {
        console.error('Prune failed:', err);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          const preview = reader.result as string;
          setAttachments(prev => [...prev, { 
              mimeType: file.type, 
              data: base64String,
              previewUri: file.type.startsWith('image/') ? preview : undefined 
          }]);
      };
      reader.readAsDataURL(file);
  };
  
  const handleScreenShare = async () => {
    if (screenShareActive && screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      setScreenShareActive(false);
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { mediaSource: 'screen' } 
      });
      setScreenStream(stream);
      setScreenShareActive(true);
      
      // Capture screenshot for analysis
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/png').split(',')[1];
        
        // Analyze with Gemini
        setIsThinking(true);
        geminiService.analyzeScreenShare(imageData).then(analysis => {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            content: `📺 Screen Analysis:\n\n${analysis}`,
            timestamp: Date.now()
          }]);
          setIsThinking(false);
        });
      }, 1000);
      
    } catch (err) {
      console.error('Screen share error:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && attachments.length === 0) return;

    const userText = inputValue;
    const currentTool = selectedTool;
    const currentAttachments = [...attachments];
    
    setInputValue('');
    setAttachments([]); // Clear attachments after sending
    
    // Tool-specific shortcuts
    if (userText.toLowerCase() === 'open sandbox') {
      setSandboxOpen(true);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'user', 
        content: userText, 
        timestamp: Date.now() 
      }, { 
        id: (Date.now()+1).toString(), 
        role: 'model', 
        content: "🛠️ Sandbox IDE opened. Let's build something together!", 
        timestamp: Date.now() 
      }]);
      return;
    }
    
    if (userText.toLowerCase() === 'open studio') {
      setCreativeStudioOpen(true);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'user', 
        content: userText, 
        timestamp: Date.now() 
      }, { 
        id: (Date.now()+1).toString(), 
        role: 'model', 
        content: "🎨 Creative Studio opened. Let's create some art!", 
        timestamp: Date.now() 
      }]);
      return;
    }
    
    // Coaching Mode Trap
    if (userText.toLowerCase() === 'upgrade me') {
        setCoachingMode(true);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userText, timestamp: Date.now() }, { id: (Date.now()+1).toString(), role: 'model', content: "Protocol initiated. Teach me something.", timestamp: Date.now() }]);
        return;
    }
    if (coachingMode) {
        setCoachingMode(false);
        setKnowledgeBase(prev => [...prev, userText]);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userText, timestamp: Date.now() }, { id: (Date.now()+1).toString(), role: 'model', content: "Learned.", timestamp: Date.now() }]);
        return;
    }

    // Add User Message
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText, timestamp: Date.now() };
    if (currentAttachments.length > 0) {
        // Just show the first attachment preview in chat for now
        userMsg.imageUri = currentAttachments[0].previewUri; 
        userMsg.content += ` [Attached ${currentAttachments.length} file(s)]`;
    }
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setThoughtProcess('Analyzing request and context...');

    // Process Request
    try {
        // Simulate thought process
        setTimeout(() => setThoughtProcess('Selecting optimal model and tools...'), 500);
        setTimeout(() => setThoughtProcess('Generating response with context awareness...'), 1000);
        
        const result = await processUserRequest(userText, currentTool, currentAttachments, persona, knowledgeBase);
        
        // Add thought process to result
        const finalMessage = { 
          ...result, 
          id: Date.now().toString(),
          thoughtProcess: thoughtProcess 
        } as Message;
        
        setMessages(prev => [...prev, finalMessage]);
        setThoughtProcess('');

        // Store in External Memory Database
        if (memoryDBReady && result.content) {
            // Store user message
            await storeMemory({
                type: 'conversation',
                content: userText,
                metadata: {
                    timestamp: Date.now(),
                    importance: 5,
                    tags: [currentTool, 'user-message'],
                    source: 'user-input'
                }
            });
            
            // Store assistant response
            await storeMemory({
                type: 'conversation',
                content: result.content,
                metadata: {
                    timestamp: Date.now(),
                    importance: 6,
                    tags: [currentTool, 'assistant-response'],
                    source: 'gemini-api'
                }
            });
            
            refreshMemoryStats();
        }

        // Self Monitoring & Learning
        if (DEMO_API_KEY && result.content) {
            evaluateInteraction(userText, result.content).then(async (newMetrics) => {
                if (newMetrics.accuracy && newMetrics.accuracy < 90) {
                     acquireKnowledge(userText).then(async (summary) => {
                         setKnowledgeBase(prev => [...prev, summary]);
                         addGrowthEntry('learning', 'Gap Detected', `Learned: ${summary}`);
                         
                         // Store knowledge in external DB
                         if (memoryDBReady) {
                             await storeMemory({
                                 type: 'knowledge',
                                 content: summary,
                                 metadata: {
                                     timestamp: Date.now(),
                                     importance: 8,
                                     tags: ['learning', 'knowledge-gap'],
                                     source: 'self-learning'
                                 }
                             });
                         }
                     });
                }
                setMetrics(prev => ({ ...prev, ...newMetrics }));
            });
        }
    } catch (error) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: "System Error.", timestamp: Date.now() }]);
    } finally {
        setIsThinking(false);
    }
  };

  if (!DEMO_API_KEY) {
    return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-emerald-500">API_KEY Required</div>;
  }

  return (
    <div className="h-screen w-screen bg-black flex overflow-hidden font-sans text-slate-200">
      {/* Live Session Overlay */}
      {liveSessionActive && (
          <LiveSession 
             apiKey={DEMO_API_KEY} 
             onClose={() => setLiveSessionActive(false)} 
             systemInstruction={`You are Elara. ${persona} mode.`}
          />
      )}

      {/* Left Panel */}
      <div className="w-96 flex-shrink-0 hidden lg:block h-full z-10 border-r border-slate-800">
        <Dashboard 
          metrics={metrics} 
          integrations={integrations} 
          currentPersona={persona} 
          onPersonaChange={setPersona} 
          growthLog={growthLog}
          onClearMemory={handleClearMemory}
          onEntryClick={handleGrowthEntryClick}
          memoryStats={memoryStats}
          onExportMemory={handleExportMemory}
          onPruneMemories={handlePruneMemories}
        />
      </div>

      {/* Main Interface */}
      <div className="flex-1 relative flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black">
        {backgroundImage && (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-20 pointer-events-none transition-opacity duration-1000"
            style={{ backgroundImage: `url(${backgroundImage})` }}
          />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/10 via-slate-950/50 to-black pointer-events-none"></div>
        
        {/* Avatar Area - HEIGHT KEPT REDUCED */}
        <div className="w-full h-[35%] md:h-[35%] relative z-0">
          <Avatar3D isSpeaking={isThinking} mood={isThinking ? 'thinking' : 'neutral'} />
        </div>

        {/* Chat Area - HEIGHT KEPT INCREASED */}
        <div className="w-full max-w-4xl px-4 pb-6 z-10 flex flex-col h-[65%] md:h-[65%] transition-all duration-500 bg-gradient-to-t from-black via-slate-950/90 to-transparent pt-4">
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-6 pr-3 custom-scrollbar">
                {/* Thought Logger */}
                {isThinking && thoughtProcess && (
                    <ThoughtLogger thoughtText={thoughtProcess} isThinking={isThinking} />
                )}
                
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-5 rounded-3xl backdrop-blur-xl border shadow-lg ${
                            msg.role === 'user' ? 'bg-slate-700/80 border-slate-600 text-white rounded-br-none' : 
                            'bg-emerald-950/80 border-emerald-500/30 text-emerald-50 rounded-bl-none'
                        }`}>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                            
                            {/* Rich Content Rendering */}
                            {msg.imageUri && (
                                <div className="mt-3 rounded-xl overflow-hidden border border-slate-700">
                                    <img src={msg.imageUri} alt="Generated" className="w-full h-auto" />
                                </div>
                            )}
                            {msg.videoUri && (
                                <div className="mt-3 rounded-xl overflow-hidden border border-slate-700">
                                    <video controls src={msg.videoUri} className="w-full h-auto" />
                                </div>
                            )}
                            {msg.groundingSources && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {msg.groundingSources.map((src, i) => (
                                        <a key={i} href={src.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] bg-slate-900 px-2 py-1 rounded border border-slate-700 hover:border-emerald-500 transition-colors">
                                            <i className="fas fa-external-link-alt text-emerald-500"></i>
                                            {src.title}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Attachments Preview */}
            {attachments.length > 0 && (
                <div className="flex gap-2 mb-2 px-2 overflow-x-auto">
                    {attachments.map((att, i) => (
                        <div key={i} className="relative w-16 h-16 bg-slate-800 rounded border border-slate-600 flex items-center justify-center overflow-hidden">
                             {att.previewUri ? <img src={att.previewUri} className="w-full h-full object-cover" /> : <i className="fas fa-file text-slate-400"></i>}
                             <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px]">×</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Input & Toolkit */}
            <div className="flex flex-col gap-2">
                {/* Tool Selector */}
                <div className="flex gap-2 px-1">
                    {[
                        { id: ToolMode.CHAT, icon: 'fa-brain', label: 'Chat' },
                        { id: ToolMode.SEARCH, icon: 'fa-search', label: 'Search' },
                        { id: ToolMode.MAPS, icon: 'fa-map-marker-alt', label: 'Maps' },
                        { id: ToolMode.IMAGE_GEN, icon: 'fa-image', label: 'Imagine' },
                        { id: ToolMode.VIDEO_GEN, icon: 'fa-video', label: 'Veo' },
                    ].map(tool => (
                        <button
                            key={tool.id}
                            onClick={() => setSelectedTool(tool.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all border ${
                                selectedTool === tool.id 
                                ? 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-[0_0_10px_rgba(16,185,129,0.4)]' 
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
                            }`}
                        >
                            <i className={`fas ${tool.icon}`}></i> {tool.label}
                        </button>
                    ))}
                </div>

                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 to-purple-600 rounded-lg blur opacity-30 group-hover:opacity-60 transition duration-1000"></div>
                    <div className="relative flex items-center bg-slate-900 rounded-lg border border-slate-700">
                         {/* File Upload */}
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,video/*" />
                        <button onClick={() => fileInputRef.current?.click()} className="pl-3 pr-2 text-slate-400 hover:text-white transition-colors">
                            <i className="fas fa-paperclip"></i>
                        </button>

                        <input 
                            type="text" 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder={
                                selectedTool === ToolMode.IMAGE_GEN ? "Describe the image to generate..." :
                                selectedTool === ToolMode.VIDEO_GEN ? "Describe the video (attach image for reference)..." :
                                "Message Elara..."
                            }
                            className="flex-1 bg-transparent border-none outline-none text-white px-2 py-3 text-sm placeholder-slate-500"
                        />
                        
                        <div className="flex items-center gap-2 pr-3 border-l border-slate-800 pl-3">
                            <button 
                                onClick={() => setSandboxOpen(true)} 
                                className="text-purple-400 hover:text-purple-300 transition-colors" 
                                title="Open Sandbox IDE"
                            >
                                <i className="fas fa-code"></i>
                            </button>
                            <button 
                                onClick={() => setCreativeStudioOpen(true)} 
                                className="text-pink-400 hover:text-pink-300 transition-colors" 
                                title="Open Creative Studio"
                            >
                                <i className="fas fa-palette"></i>
                            </button>
                            <button 
                                onClick={handleScreenShare} 
                                className={`${screenShareActive ? 'text-green-400 animate-pulse' : 'text-blue-400'} hover:text-blue-300 transition-colors`} 
                                title={screenShareActive ? "Stop Screen Share" : "Share Screen"}
                            >
                                <i className="fas fa-desktop"></i>
                            </button>
                            <button onClick={() => setLiveSessionActive(true)} className="text-red-400 hover:text-red-300 transition-colors animate-pulse" title="Start Live Voice Session">
                                <i className="fas fa-microphone-lines"></i>
                            </button>
                            <button 
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() && attachments.length === 0 || isThinking}
                                className={`p-2 rounded-md transition-all ${
                                    inputValue.trim() || attachments.length > 0 ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-700 text-slate-500'
                                }`}
                            >
                                <i className="fas fa-arrow-up"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
      
      {/* Sandbox IDE */}
      {sandboxOpen && (
        <div className="fixed inset-0 z-50">
          <Sandbox 
            isOpen={sandboxOpen}
            onClose={() => setSandboxOpen(false)}
            initialCode={sandboxCode}
            onDiscuss={(code) => {
              setSandboxCode(code);
              setSandboxOpen(false);
              setInputValue(`Review this code:\n\`\`\`\n${code}\n\`\`\``);
            }}
          />
        </div>
      )}
      
      {/* Creative Studio */}
      <CreativeStudio 
        isOpen={creativeStudioOpen}
        onClose={() => setCreativeStudioOpen(false)}
        onSetBackground={(url) => setBackgroundImage(url)}
      />
      
      <YouTubePlayer video={activeVideo} onClose={() => setActiveVideo(null)} />
    </div>
  );
};

export default App;