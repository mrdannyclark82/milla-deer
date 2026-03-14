
import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Editor from 'react-simple-code-editor';
import { githubService, GitHubNode } from '../services/githubService';
import { geminiService } from '../services/geminiService';

interface SandboxProps {
  initialCode: string;
  isOpen: boolean;
  onClose: () => void;
  onDiscuss?: (code: string) => void;
  width?: number; // Controlled width from App
}

interface LogEntry {
  level: 'log' | 'error' | 'warn' | 'info';
  args: string[];
  timestamp: string;
}

interface VirtualFile {
  name: string;
  content: string;
  language: string;
}

const STORAGE_KEY = 'milla_sandbox_files';

// File Explorer Item Component
const FileItem: React.FC<{ 
  name: string, 
  isActive: boolean, 
  onClick: () => void,
  onDelete?: () => void,
  isRepo?: boolean 
}> = ({ name, isActive, onClick, onDelete, isRepo }) => (
  <div 
    onClick={onClick}
    className={`group flex items-center justify-between py-1.5 px-3 cursor-pointer text-xs font-mono transition-colors border-l-2 ${isActive ? 'bg-slate-800 border-milla-500 text-milla-300' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
  >
    <div className="flex items-center gap-2 truncate">
      <span>{getIcon(name)}</span>
      <span className="truncate">{name}</span>
    </div>
    {onDelete && !isRepo && (
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(); }} 
        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1"
      >
        ×
      </button>
    )}
  </div>
);

const getIcon = (name: string) => {
  if (name.endsWith('.html')) return '🌐';
  if (name.endsWith('.css')) return '🎨';
  if (name.endsWith('.js') || name.endsWith('.ts')) return '📜';
  if (name.endsWith('.json')) return '📦';
  return '📄';
};

const getLanguage = (name: string) => {
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.js')) return 'javascript';
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript';
  if (name.endsWith('.json')) return 'json';
  return 'text';
};

const Sandbox: React.FC<SandboxProps> = ({ initialCode, isOpen, onClose, onDiscuss, width }) => {
  // Virtual File System State
  const [files, setFiles] = useState<Record<string, VirtualFile>>({
    'index.html': { name: 'index.html', content: initialCode || '<!-- Start -->', language: 'html' },
    'style.css': { name: 'style.css', content: 'body { font-family: sans-serif; padding: 20px; color: #333; }', language: 'css' },
    'script.js': { name: 'script.js', content: 'console.log("Hello from Milla Sandbox!");', language: 'javascript' }
  });
  const [activeFile, setActiveFile] = useState('index.html');
  const [newFileName, setNewFileName] = useState('');
  const [isAddingFile, setIsAddingFile] = useState(false);

  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'split'>('split');
  const [key, setKey] = useState(0); 
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [debouncedPreviewCode, setDebouncedPreviewCode] = useState('');
  
  // GitHub State
  const [repoUrl, setRepoUrl] = useState('');
  const [currentRepo, setCurrentRepo] = useState<{owner: string, repo: string} | null>(null);
  const [fileTree, setFileTree] = useState<GitHubNode[]>([]);
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [ghToken, setGhToken] = useState('');
  
  // Commit State
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  // Console UI State
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Resize State
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [editorWidthPercentage, setEditorWidthPercentage] = useState(50);
  const [consoleHeight, setConsoleHeight] = useState(160);
  
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingConsole, setIsResizingConsole] = useState(false);
  const [isResizingSplit, setIsResizingSplit] = useState(false);

  // Generation State
  const [showGenerateInput, setShowGenerateInput] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Linting State
  const [lintError, setLintError] = useState<string | null>(null);

  // Initialization
  useEffect(() => {
    if (isOpen) {
      // Try load from local storage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFiles(parsed);
          // If initialCode changed significantly (e.g. from Discuss), overwrite index.html
          if (initialCode && initialCode !== '<!-- Start coding here -->') {
            setFiles(prev => ({
              ...prev,
              'index.html': { name: 'index.html', content: initialCode, language: 'html' }
            }));
            setActiveFile('index.html');
          }
        } catch (e) { console.error("FS Load Error", e); }
      } else if (initialCode) {
        setFiles(prev => ({ ...prev, 'index.html': { ...prev['index.html'], content: initialCode } }));
      }
      
      const t = githubService.getToken();
      if (t) setGhToken(t);
      if (window.innerWidth < 768) setActiveTab('code');
    }
  }, [isOpen, initialCode]);

  // Bundle Files for Preview
  const bundlePreview = () => {
    let html = files['index.html']?.content || '';
    const css = files['style.css']?.content || '';
    const js = files['script.js']?.content || '';

    // Inject CSS
    if (html.includes('</head>')) {
      html = html.replace('</head>', `<style>${css}</style></head>`);
    } else {
      html += `<style>${css}</style>`;
    }

    // Inject JS
    if (html.includes('</body>')) {
      html = html.replace('</body>', `<script>${js}</script></body>`);
    } else {
      html += `<script>${js}</script>`;
    }

    return getAugmentedCode(html);
  };

  // Debounce Preview Update
  useEffect(() => {
      const handler = setTimeout(() => {
          setDebouncedPreviewCode(bundlePreview());
      }, 800); 
      return () => clearTimeout(handler);
  }, [files]);

  // Auto-save local
  useEffect(() => {
    if (isOpen) {
       localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    }
  }, [files, isOpen]);

  const updateFileContent = (newContent: string) => {
    setFiles(prev => ({
      ...prev,
      [activeFile]: { ...prev[activeFile], content: newContent }
    }));
  };

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    const name = newFileName.trim();
    if (files[name]) {
      alert("File exists");
      return;
    }
    setFiles(prev => ({
      ...prev,
      [name]: { name, content: '', language: getLanguage(name) }
    }));
    setActiveFile(name);
    setNewFileName('');
    setIsAddingFile(false);
  };

  const handleDeleteFile = (name: string) => {
    if (name === 'index.html') return alert("Cannot delete entry file.");
    if (!confirm(`Delete ${name}?`)) return;
    
    setFiles(prev => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
    if (activeFile === name) setActiveFile('index.html');
  };

  // Listen for iframe logs
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === 'sandbox-console') {
        if (event.data.level === 'clear') {
            setLogs([]);
            return;
        }
        setLogs(prev => [...prev, {
          level: event.data.level,
          args: event.data.payload,
          timestamp: new Date().toLocaleTimeString()
        }]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Scroll logs
  useEffect(() => {
    if (isConsoleOpen) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isConsoleOpen]);

  // Real-time Linting
  useEffect(() => {
    const timer = setTimeout(async () => {
      const currentContent = files[activeFile]?.content;
      if (!currentContent?.trim()) {
          setLintError(null);
          return;
      }
      try {
        let parser = 'babel';
        if (activeFile.endsWith('.html')) parser = 'html';
        else if (activeFile.endsWith('.css')) parser = 'css';
        else if (activeFile.endsWith('.json')) parser = 'json';

        // @ts-ignore
        const prettier = await import('prettier');
        // @ts-ignore
        const parserBabel = await import('prettier/plugins/babel');
        // @ts-ignore
        const parserEstree = await import('prettier/plugins/estree');
        // @ts-ignore
        const parserHtml = await import('prettier/plugins/html');
        // @ts-ignore
        const parserPostcss = await import('prettier/plugins/postcss');

        await prettier.format(currentContent, {
            parser,
            plugins: [parserBabel, parserHtml, parserPostcss, parserEstree],
            singleQuote: true,
        });
        setLintError(null);
      } catch (e: any) {
        const msg = e.message ? e.message.split('\n')[0] : 'Syntax Error';
        setLintError(msg);
      }
    }, 1000); 
    return () => clearTimeout(timer);
  }, [files, activeFile]);

  // --- Resize Handlers ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        // Calculate offset based on Sandbox position (right side)
        // Since Sandbox is absolute or flexed to right, e.clientX is global.
        // We need sidebar relative to Sandbox container
        // Simplified: Just use movement
        setSidebarWidth(prev => Math.max(150, Math.min(400, prev + e.movementX)));
      }
      if (isResizingConsole) {
        const newHeight = window.innerHeight - e.clientY;
        setConsoleHeight(Math.max(32, Math.min(600, newHeight)));
      }
      if (isResizingSplit) {
          // Adjust based on movement for simpler relative sizing
          // This assumes split view is active
          setEditorWidthPercentage(prev => Math.max(20, Math.min(80, prev + (e.movementX / (width || window.innerWidth)) * 100)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingConsole(false);
      setIsResizingSplit(false);
    };

    if (isResizingSidebar || isResizingConsole || isResizingSplit) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isResizingSplit ? 'col-resize' : isResizingConsole ? 'row-resize' : isResizingSidebar ? 'col-resize' : 'default';
      const frames = document.querySelectorAll('iframe');
      frames.forEach(f => f.style.pointerEvents = 'none');
    } else {
        document.body.style.cursor = 'default';
        const frames = document.querySelectorAll('iframe');
        frames.forEach(f => f.style.pointerEvents = 'auto');
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingConsole, isResizingSplit, width]);


  // --- GitHub Logic ---
  const handleLoadRepo = async () => {
    const parsed = githubService.parseRepoString(repoUrl);
    if (!parsed) {
        alert("Invalid GitHub URL. Use format: owner/repo");
        return;
    }
    
    setIsLoadingRepo(true);
    try {
        const nodes = await githubService.fetchRepoContents(parsed.owner, parsed.repo);
        setFileTree(nodes);
        setCurrentRepo(parsed);
        setIsSidebarOpen(true); 
    } catch (e: any) {
        if (e.message.includes('not found') || e.message.includes('token')) {
            alert("Repository not found or private.\nPlease add a Personal Access Token below.");
            setShowTokenInput(true);
        } else {
            alert(e.message || "Failed to load repo.");
        }
    } finally {
        setIsLoadingRepo(false);
    }
  };

  const handleGitHubFileClick = async (node: GitHubNode) => {
    if (node.type === 'tree') {
        try {
            if (!currentRepo) return;
            const nodes = await githubService.fetchRepoContents(currentRepo.owner, currentRepo.repo, node.path);
            setFileTree(nodes);
        } catch (e) { console.error(e); }
    } else {
        try {
            const content = await githubService.fetchFileContent(node.url);
            // Add to local files for editing
            const name = node.path.split('/').pop() || node.path;
            setFiles(prev => ({
              ...prev,
              [name]: { name, content, language: getLanguage(name) }
            }));
            setActiveFile(name);
            if (activeTab === 'preview') setActiveTab('code');
        } catch (e) { console.error(e); }
    }
  };

  const saveToken = () => {
    githubService.initialize(ghToken);
    setShowTokenInput(false);
  };
  
  // --- Utility ---
  const handleRun = () => {
    setKey(prev => prev + 1);
    setDebouncedPreviewCode(bundlePreview());
    setLogs([]);
    if (activeTab === 'code') setActiveTab('preview');
  };

  const handleGenerateCode = async () => {
    if (!generatePrompt.trim()) return;
    setIsGenerating(true);
    setLogs(prev => [...prev, { level: 'info', args: [`Generating code for ${activeFile}...`], timestamp: new Date().toLocaleTimeString() }]);
    try {
        // Context aware generation
        const generated = await geminiService.generateCode(generatePrompt, getLanguage(activeFile));
        updateFileContent(generated);
        setLogs(prev => [...prev, { level: 'info', args: ['Generation complete.'], timestamp: new Date().toLocaleTimeString() }]);
        setShowGenerateInput(false);
        setGeneratePrompt('');
    } catch (e) {
        setLogs(prev => [...prev, { level: 'error', args: ['Code generation failed.'], timestamp: new Date().toLocaleTimeString() }]);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleFormat = async () => {
    const currentContent = files[activeFile]?.content;
    if (!currentContent) return;
    try {
      let parser = 'babel';
      if (activeFile.endsWith('.html')) parser = 'html';
      else if (activeFile.endsWith('.css')) parser = 'css';

      // @ts-ignore
      const prettier = await import('prettier');
      // @ts-ignore
      const parserBabel = await import('prettier/plugins/babel');
      // @ts-ignore
      const parserEstree = await import('prettier/plugins/estree');
      // @ts-ignore
      const parserHtml = await import('prettier/plugins/html');
      // @ts-ignore
      const parserPostcss = await import('prettier/plugins/postcss');

      const formatted = await prettier.format(currentContent, {
        parser,
        plugins: [parserBabel, parserHtml, parserPostcss, parserEstree],
        singleQuote: true,
        printWidth: 80,
      });
      updateFileContent(formatted);
      setLogs(prev => [...prev, { level: 'info', args: ['Code formatted.'], timestamp: new Date().toLocaleTimeString() }]);
    } catch (e: any) {
      setLogs(prev => [...prev, { level: 'error', args: ['Format Error:', e.message], timestamp: new Date().toLocaleTimeString() }]);
      setIsConsoleOpen(true);
    }
  };

  const getAugmentedCode = (originalCode: string) => {
    const script = `
      <script>
        (function() {
          const originalConsole = window.console;
          function send(level, args) {
            try {
              window.parent.postMessage({
                source: 'sandbox-console',
                level: level,
                payload: args.map(a => {
                   if (typeof a === 'object') {
                     try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
                   }
                   return String(a);
                })
              }, '*');
            } catch(e) { originalConsole.error(e); }
          }
          window.console = {
            ...originalConsole,
            log: (...args) => { originalConsole.log(...args); send('log', args); },
            error: (...args) => { originalConsole.error(...args); send('error', args); },
            warn: (...args) => { originalConsole.warn(...args); send('warn', args); },
            info: (...args) => { originalConsole.info(...args); send('info', args); },
            clear: () => { originalConsole.clear(); send('clear', []); }
          };
          window.onerror = function(msg, src, ln, col, err) { send('error', [\`Error: \${msg} (\${ln}:\${col})\`]); };
        })();
      </script>
    `;
    return script + originalCode;
  };

  const highlightCode = (c: string) => {
    // @ts-ignore
    if (window.Prism) {
        const lang = files[activeFile]?.language || 'text';
        // Map common names to Prism
        const prismLang = lang === 'html' ? 'markup' : lang;
        // @ts-ignore
        if (window.Prism.languages[prismLang]) {
            // @ts-ignore
            return window.Prism.highlight(c, window.Prism.languages[prismLang], prismLang);
        }
    }
    return c;
  };

  if (!isOpen) return null;

  return (
    <div 
      className="h-full flex flex-col bg-slate-900 border-l border-slate-800 shadow-2xl transition-none font-sans relative"
      style={{ width: width ? '100%' : 'auto' }}
    >
      {/* Top Toolbar */}
      <div className="flex flex-col border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-1.5 rounded hover:bg-slate-800 ${isSidebarOpen ? 'text-milla-400' : 'text-slate-500'}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                
                <div className="hidden md:flex p-0.5 bg-slate-800 rounded-md">
                    <button onClick={() => setActiveTab('split')} className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors ${activeTab === 'split' ? 'bg-milla-600 text-white' : 'text-slate-400 hover:text-white'}`}>Split</button>
                    <button onClick={() => setActiveTab('code')} className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors ${activeTab === 'code' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>Code</button>
                    <button onClick={() => setActiveTab('preview')} className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors ${activeTab === 'preview' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>View</button>
                </div>

                <div className="h-4 w-px bg-slate-700 mx-1"></div>

                <button onClick={handleRun} className="flex items-center gap-1 px-3 py-1 bg-green-900/20 text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded text-xs font-medium">
                    Run ▶
                </button>

                <button onClick={handleFormat} className="flex items-center gap-1 px-3 py-1 bg-indigo-900/20 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/30 rounded text-xs font-medium">
                    Format ✨
                </button>

                <button onClick={() => setShowGenerateInput(!showGenerateInput)} className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-all ${showGenerateInput ? 'bg-milla-600 text-white' : 'bg-milla-900/20 text-milla-400 hover:bg-milla-900/30'}`}>
                    AI Gen 🤖
                </button>

                {onDiscuss && (
                    <button onClick={() => onDiscuss(files[activeFile]?.content || '')} className="flex items-center gap-1 px-3 py-1 bg-blue-900/20 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded text-xs font-medium shadow-sm border border-blue-900/30">
                        Discuss 💬
                    </button>
                )}
            </div>

            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
                ✕
            </button>
        </div>

        {/* Generate Input */}
        {showGenerateInput && (
            <div className="p-2 bg-slate-800 border-t border-slate-700 flex gap-2 items-center">
                <input 
                    value={generatePrompt}
                    onChange={(e) => setGeneratePrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateCode()}
                    placeholder={`Generate code for ${activeFile}...`} 
                    className="flex-1 bg-slate-900 text-white text-xs px-2 py-1.5 rounded border border-slate-700 focus:border-milla-500 focus:outline-none"
                    disabled={isGenerating}
                />
                <button onClick={handleGenerateCode} disabled={isGenerating} className="bg-milla-600 hover:bg-milla-500 text-white px-3 py-1.5 rounded text-xs font-medium">
                    {isGenerating ? '...' : 'Go'}
                </button>
            </div>
        )}
      </div>

      {/* Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Sidebar */}
        <div 
          style={{ width: isSidebarOpen ? sidebarWidth : 0 }}
          className={`${isSidebarOpen ? 'opacity-100' : 'opacity-0 overflow-hidden'} bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 relative transition-none`}
        >
             <div className="p-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider bg-slate-950/50">Local Files</div>
             <div className="flex-1 overflow-y-auto">
                 {Object.keys(files).map(name => (
                     <FileItem 
                        key={name} 
                        name={name} 
                        isActive={activeFile === name} 
                        onClick={() => { setActiveFile(name); if(activeTab === 'preview') setActiveTab('code'); }}
                        onDelete={() => handleDeleteFile(name)}
                     />
                 ))}
                 
                 {isAddingFile ? (
                   <div className="p-2 flex gap-1">
                     <input 
                       autoFocus
                       value={newFileName} 
                       onChange={e => setNewFileName(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && handleCreateFile()}
                       onBlur={() => setIsAddingFile(false)}
                       className="w-full bg-slate-800 text-xs px-1 py-0.5 rounded border border-milla-500 text-white" 
                       placeholder="name.ext"
                     />
                   </div>
                 ) : (
                   <button onClick={() => setIsAddingFile(true)} className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-white hover:bg-slate-800 border-t border-slate-800">
                     + New File
                   </button>
                 )}
             </div>

             <div className="p-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider bg-slate-950/50 border-t border-slate-800">GitHub</div>
             <div className="p-2 border-b border-slate-800 space-y-2">
                 <div className="flex gap-1">
                     <input 
                       value={repoUrl}
                       onChange={e => setRepoUrl(e.target.value)}
                       placeholder="owner/repo"
                       className="w-full bg-slate-800 text-xs text-white px-2 py-1 rounded border border-slate-700"
                     />
                     <button onClick={handleLoadRepo} disabled={isLoadingRepo} className="bg-slate-700 text-white px-2 rounded text-xs">Go</button>
                 </div>
                 {showTokenInput && (
                     <div className="flex gap-1">
                         <input type="password" value={ghToken} onChange={e => setGhToken(e.target.value)} placeholder="ghp_token" className="flex-1 bg-slate-800 text-[10px] text-white px-1 py-1 rounded border border-slate-700" />
                         <button onClick={saveToken} className="bg-milla-600 text-white text-[10px] px-2 rounded">Save</button>
                     </div>
                 )}
             </div>
             <div className="flex-1 overflow-y-auto min-h-[100px]">
                 {fileTree.map((node) => (
                    <FileItem 
                        key={node.sha} 
                        name={node.path.split('/').pop() || node.path} 
                        isActive={false} 
                        isRepo={true}
                        onClick={() => handleGitHubFileClick(node)} 
                    />
                 ))}
             </div>
             
             {isSidebarOpen && <div onMouseDown={(e) => {e.preventDefault(); setIsResizingSidebar(true);}} className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-milla-500/50 z-20" />}
        </div>

        {/* Split Container */}
        <div className="flex-1 flex flex-col md:flex-row min-w-0 relative bg-slate-950">
             
             {/* Code Editor */}
             <div 
                className={`flex flex-col relative ${activeTab === 'split' ? '' : activeTab === 'code' ? 'w-full h-full' : 'hidden'}`}
                style={activeTab === 'split' ? { width: `${editorWidthPercentage}%` } : {}}
             >
                <div className="flex-1 overflow-auto custom-scrollbar bg-slate-950 relative flex">
                    {/* Line Numbers Column */}
                    <div className="code-line-numbers pt-5 min-h-full">
                        {files[activeFile]?.content.split('\n').map((_, i) => (
                            <div key={i}>{i + 1}</div>
                        ))}
                    </div>
                    {/* Editor */}
                    <div className="flex-1">
                        <Editor
                            value={files[activeFile]?.content || ''}
                            onValueChange={updateFileContent}
                            highlight={highlightCode}
                            padding={20}
                            className="font-mono text-sm min-h-full"
                            style={{ fontFamily: '"Fira Code", monospace', fontSize: 13, backgroundColor: 'transparent' }}
                        />
                    </div>
                </div>
                
                <div className="bg-slate-900 p-1 text-[10px] text-slate-500 border-t border-slate-800 flex justify-between items-center px-2 shrink-0">
                    <div className={lintError ? 'text-red-400' : 'text-green-500'}>
                        {lintError ? `❌ ${lintError}` : '✅ Valid'}
                    </div>
                    <div>{files[activeFile]?.language} | {files[activeFile]?.content.length} chars</div>
                </div>
             </div>

             {/* Split Drag Handle */}
             {activeTab === 'split' && (
                 <div onMouseDown={(e) => {e.preventDefault(); setIsResizingSplit(true);}} className="w-1 h-full bg-slate-800 hover:bg-milla-500 cursor-col-resize z-20 shrink-0 hidden md:block" />
             )}

             {/* Preview */}
             <div className={`flex flex-col relative bg-white ${activeTab === 'split' ? 'flex-1' : activeTab === 'preview' ? 'w-full h-full' : 'hidden'}`}>
                <div className="flex-1 relative">
                    <iframe
                        key={key}
                        title="Sandbox Preview"
                        srcDoc={debouncedPreviewCode} 
                        className="absolute inset-0 w-full h-full border-none"
                        sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
                    />
                </div>
                
                {/* Console */}
                <div 
                    style={{ height: isConsoleOpen ? consoleHeight : 28 }}
                    className={`border-t border-slate-300 bg-slate-900 flex flex-col relative shrink-0 text-slate-100`}
                >
                    <div onMouseDown={(e) => {e.preventDefault(); setIsResizingConsole(true);}} className="absolute top-0 left-0 w-full h-1 cursor-row-resize hover:bg-milla-500/50 z-20" />

                    <div onClick={() => setIsConsoleOpen(!isConsoleOpen)} className="flex items-center justify-between px-3 bg-slate-800 cursor-pointer select-none h-7 border-b border-slate-700">
                        <span className="text-[10px] font-mono text-slate-400 font-bold">CONSOLE</span>
                        <div className="flex items-center gap-2">
                             <button onClick={(e) => { e.stopPropagation(); setLogs([]); }} className="text-[10px] hover:text-white text-slate-500">CLEAR</button>
                             <span className={`text-[10px] text-slate-500 ${isConsoleOpen ? '' : 'rotate-180'}`}>▼</span>
                        </div>
                    </div>
                    {isConsoleOpen && (
                        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1 bg-slate-950">
                            {logs.map((l, i) => (
                                <div key={i} className={`flex gap-2 break-all border-b border-slate-800/50 pb-0.5 ${l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-slate-300'}`}>
                                    <span className="opacity-30 select-none">[{l.timestamp.split(' ')[0]}]</span>
                                    <span>{l.args.join(' ')}</span>
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </div>
             </div>
        </div>
      </div>
    </div>
  );
};

export default Sandbox;
