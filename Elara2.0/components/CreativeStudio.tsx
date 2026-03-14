import React, { useState, useEffect } from 'react';
import { geminiService } from '../services/geminiService';
import { MODELS } from '../constants';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  model: string;
  timestamp: number;
  type: 'image';
}

interface GeneratedVideo {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  type: 'video';
}

interface GeneratedCode {
  id: string;
  code: string;
  prompt: string;
  language: string;
  timestamp: number;
  type: 'code';
}

type GeneratedContent = GeneratedImage | GeneratedVideo | GeneratedCode;

interface CreativeStudioProps {
  isOpen: boolean;
  onClose: () => void;
  onSetBackground?: (url: string) => void;
}

const STORAGE_KEY = 'milla_creative_studio_images';

const CreativeStudio: React.FC<CreativeStudioProps> = ({ isOpen, onClose, onSetBackground }) => {
  const [content, setContent] = useState<GeneratedContent[]>([]);
  const [contentType, setContentType] = useState<'image' | 'video' | 'code'>('image');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedModel, setSelectedModel] = useState<string>(MODELS.PRO_IMAGE);
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedContent, setSelectedContent] = useState<GeneratedContent | null>(null);

  // Compare Mode
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  // Load from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setContent(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load content", e);
      }
    }
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  }, [content]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
        if (contentType === 'image') {
            const imageUrl = await geminiService.generateImage(prompt, aspectRatio, selectedModel);

            if (imageUrl) {
                const newImage: GeneratedImage = {
                    id: Date.now().toString(),
                    url: imageUrl,
                    prompt: prompt,
                    aspectRatio: aspectRatio,
                    model: selectedModel,
                    timestamp: Date.now(),
                    type: 'image'
                };
                setContent(prev => [newImage, ...prev]);
            } else {
                alert("Failed to generate image.");
            }
        } else if (contentType === 'video') {
            // For video, we'll need to call the video generation function
            // This will be implemented when we integrate video generation
            alert("Video generation coming soon!");
        } else if (contentType === 'code') {
            // For code, we'll need to call the code generation function
            // This will be implemented when we integrate code generation
            alert("Code generation coming soon!");
        }
    } catch (e) {
        console.error(e);
        alert("Generation failed. See console.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm("Delete this content?")) {
          setContent(prev => prev.filter(item => item.id !== id));
          if (selectedContent?.id === id) setSelectedContent(null);
          setCompareSelection(prev => prev.filter(sid => sid !== id));
      }
  };

  const handleDownload = (item: GeneratedContent) => {
      if (item.type === 'image') {
          const link = document.createElement('a');
          link.href = item.url;
          link.download = `milla-creation-${item.id}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } else if (item.type === 'video') {
          const link = document.createElement('a');
          link.href = item.url;
          link.download = `milla-video-${item.id}.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } else if (item.type === 'code') {
          const blob = new Blob([item.code], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `milla-code-${item.id}.${getFileExtension(item.language)}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
      }
  };

  const getFileExtension = (language: string): string => {
      const extensions: { [key: string]: string } = {
          'javascript': 'js',
          'typescript': 'ts',
          'python': 'py',
          'html': 'html',
          'css': 'css',
          'java': 'java',
          'cpp': 'cpp',
          'c': 'c',
          'go': 'go',
          'rust': 'rs'
      };
      return extensions[language.toLowerCase()] || 'txt';
  };

  const handleRemix = (img: GeneratedImage, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setPrompt(img.prompt);
      setAspectRatio(img.aspectRatio);
      setSelectedModel(img.model || MODELS.PRO_IMAGE);
      setSelectedImage(null); // Close lightbox if open
      // Optional: scroll to top logic here
  };

  const toggleCompareSelection = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setCompareSelection(prev => {
          if (prev.includes(id)) return prev.filter(sid => sid !== id);
          if (prev.length >= 2) return [prev[1], id]; // Keep last 2
          return [...prev, id];
      });
  };

  const getFilteredContent = () => {
      return content.filter(item => item.type === contentType);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 animate-in fade-in duration-300 font-sans">
      <div className="w-full h-full flex flex-col relative">
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                      <h1 className="text-xl font-bold text-white tracking-tight">Creative Studio</h1>
                      <p className="text-xs text-slate-400">Generative Art & Design</p>
                  </div>
              </div>
              
              <div className="flex items-center gap-4">
                  <button 
                    onClick={() => { setIsCompareMode(!isCompareMode); setCompareSelection([]); }} 
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${isCompareMode ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'text-slate-400 border-slate-700 hover:text-white'}`}
                  >
                      {isCompareMode ? 'Exit Compare' : 'Compare'}
                  </button>

                  {isCompareMode && compareSelection.length === 2 && (
                       <button onClick={() => setShowComparison(true)} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-full animate-in zoom-in">
                           Run Comparison
                       </button>
                  )}

                  <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
              </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              
              {/* Left: Input Panel */}
              <div className="w-full md:w-96 p-6 border-r border-slate-800 bg-slate-900/30 flex flex-col gap-6 overflow-y-auto shrink-0">
                  
                  <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">Prompt</label>
                      <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe your vision... (e.g., 'A cyberpunk city with neon rain')" 
                        className="w-full h-32 bg-slate-800 text-white p-4 rounded-xl border border-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none resize-none placeholder-slate-500 text-sm leading-relaxed"
                      />
                  </div>

                  <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">Model Provider</label>
                      <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSelectedModel(MODELS.PRO_IMAGE)}
                            className={`py-3 px-2 rounded-lg text-xs font-medium border transition-all flex flex-col items-center gap-1 ${selectedModel === MODELS.PRO_IMAGE ? 'bg-purple-900/30 border-purple-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                          >
                             <span className="font-bold">Gemini 3 Pro</span>
                             <span className="opacity-60 text-[10px]">High Fidelity</span>
                          </button>
                          <button
                            onClick={() => setSelectedModel('imagen-4.0-generate-001')}
                            className={`py-3 px-2 rounded-lg text-xs font-medium border transition-all flex flex-col items-center gap-1 ${selectedModel === 'imagen-4.0-generate-001' ? 'bg-cyan-900/30 border-cyan-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                          >
                             <span className="font-bold">Imagen 3</span>
                             <span className="opacity-60 text-[10px]">Photorealistic</span>
                          </button>
                      </div>
                  </div>

                  <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">Aspect Ratio</label>
                      <div className="grid grid-cols-3 gap-2">
                          {['1:1', '16:9', '9:16', '3:4', '4:3'].map(ratio => (
                              <button 
                                key={ratio}
                                onClick={() => setAspectRatio(ratio)}
                                className={`py-2 rounded-lg text-xs font-medium border transition-all ${aspectRatio === ratio ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/25' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}
                              >
                                  {ratio}
                              </button>
                          ))}
                      </div>
                  </div>

                  <button 
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className={`mt-auto w-full py-4 rounded-xl font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 ${isGenerating ? 'bg-slate-700 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:scale-[1.02] shadow-indigo-500/25'}`}
                  >
                      {isGenerating ? (
                          <>
                            <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            <span>Creating...</span>
                          </>
                      ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            <span>Generate Art</span>
                          </>
                      )}
                  </button>
              </div>

              {/* Right: Gallery Grid */}
              <div className="flex-1 p-6 overflow-y-auto bg-slate-950 relative">
                  {images.length === 0 ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <p className="text-lg font-medium">Your canvas is empty.</p>
                          <p className="text-sm">Start imagining something beautiful.</p>
                      </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {images.map(img => (
                            <div 
                                key={img.id} 
                                onClick={() => isCompareMode ? toggleCompareSelection(img.id, {} as any) : setSelectedImage(img)}
                                className={`group relative aspect-square rounded-xl overflow-hidden bg-slate-900 border cursor-pointer transition-all ${isCompareMode && compareSelection.includes(img.id) ? 'border-indigo-500 ring-2 ring-indigo-500 scale-95' : 'border-slate-800 hover:border-purple-500/50'}`}
                            >
                                <img src={img.url} alt={img.prompt} className={`w-full h-full object-cover transition-transform duration-500 ${!isCompareMode && 'group-hover:scale-110'}`} />
                                
                                {isCompareMode && (
                                     <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${compareSelection.includes(img.id) ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/50 bg-black/30'}`}>
                                         {compareSelection.includes(img.id) && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                     </div>
                                )}

                                {!isCompareMode && (
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                        <p className="text-xs text-white line-clamp-2 font-medium mb-2">{img.prompt}</p>
                                        <div className="flex justify-between items-center">
                                            <div className="flex gap-1">
                                                <span className="text-[10px] text-slate-400 bg-slate-900/50 px-2 py-1 rounded">{img.aspectRatio}</span>
                                                <span className="text-[10px] text-slate-400 bg-slate-900/50 px-2 py-1 rounded">{img.model?.includes('imagen') ? 'Img3' : 'Gem3'}</span>
                                            </div>
                                            
                                            <div className="flex gap-1">
                                                <button 
                                                    onClick={(e) => handleRemix(img, e)}
                                                    className="p-1.5 bg-slate-700 hover:bg-white hover:text-black rounded-lg transition-colors text-xs font-bold"
                                                    title="Remix"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                </button>
                                                <button 
                                                    onClick={(e) => handleDelete(img.id, e)}
                                                    className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                  )}
              </div>
          </div>

          {/* Lightbox / Full View */}
          {selectedImage && (
              <div className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center p-8 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
                  <img src={selectedImage.url} alt={selectedImage.prompt} className="max-w-full max-h-full rounded-lg shadow-2xl shadow-purple-900/20" onClick={e => e.stopPropagation()} />
                  
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleRemix(selectedImage)} className="bg-slate-800 border border-slate-700 text-white px-6 py-3 rounded-full font-bold hover:bg-white hover:text-black transition-colors flex items-center gap-2">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                         Remix
                      </button>
                      <button onClick={() => handleDownload(selectedImage)} className="bg-indigo-600 text-white px-6 py-3 rounded-full font-bold hover:bg-indigo-500 transition-transform flex items-center gap-2">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                         Download
                      </button>
                      {onSetBackground && (
                           <button onClick={() => { onSetBackground(selectedImage.url); onClose(); }} className="bg-pink-600 text-white px-6 py-3 rounded-full font-bold hover:bg-pink-500 transition-colors flex items-center gap-2">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                             Set Wallpaper
                           </button>
                      )}
                      <button onClick={() => setSelectedImage(null)} className="bg-slate-800 text-white px-6 py-3 rounded-full font-bold hover:bg-slate-700 transition-colors">
                          Close
                      </button>
                  </div>
              </div>
          )}

          {/* Comparison View */}
          {showComparison && compareSelection.length === 2 && (
             <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col animate-in fade-in slide-in-from-bottom-10">
                 <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
                     <h2 className="text-white font-bold">Image Comparison</h2>
                     <button onClick={() => setShowComparison(false)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-full">Close</button>
                 </div>
                 <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-800">
                     {compareSelection.map(id => {
                         const img = images.find(i => i.id === id);
                         if (!img) return null;
                         return (
                             <div key={id} className="flex-1 p-4 flex flex-col gap-4 bg-black/20">
                                 <div className="flex-1 relative min-h-0 flex items-center justify-center">
                                     <img src={img.url} className="max-w-full max-h-full object-contain shadow-lg" />
                                 </div>
                                 <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 text-sm space-y-2">
                                     <p className="text-slate-300 line-clamp-3 italic">"{img.prompt}"</p>
                                     <div className="flex gap-4 text-xs font-mono text-slate-500">
                                         <span>Model: {img.model?.includes('imagen') ? 'Imagen 3' : 'Gemini 3 Pro'}</span>
                                         <span>Ratio: {img.aspectRatio}</span>
                                     </div>
                                     <button onClick={() => { handleRemix(img); setShowComparison(false); setIsCompareMode(false); }} className="w-full py-2 bg-slate-800 hover:bg-white hover:text-black rounded text-xs font-bold transition-colors">Remix This</button>
                                 </div>
                             </div>
                         )
                     })}
                 </div>
             </div>
          )}

      </div>
    </div>
  );
};

export default CreativeStudio;