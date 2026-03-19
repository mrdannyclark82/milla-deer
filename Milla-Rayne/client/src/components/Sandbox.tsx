import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from 'react-simple-code-editor';
import { Highlight, themes } from 'prism-react-renderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X,
  Play,
  Code,
  Eye,
  Split,
  FolderTree,
  FileCode,
  Trash2,
  Plus,
  RefreshCw,
  Sparkles,
  MessageSquare,
  Wand2,
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  TerminalSquare,
  ServerCog,
  Smartphone,
  Network,
  Square,
} from 'lucide-react';

interface SandboxProps {
  initialCode?: string;
  isOpen: boolean;
  onClose: () => void;
  onDiscuss?: (code: string) => void;
  width?: number;
  embedded?: boolean;
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

interface GitHubNode {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubStatus {
  configured: boolean;
  valid: boolean | null;
  scopes: string[];
  error: string | null;
}

type ViewMode = 'code' | 'preview' | 'split';
type ConsoleTab = 'browser' | 'terminal' | 'mcp';
type BrowserFrameMode = 'preview' | 'live';

interface ShellRunRecord {
  runId: string;
  commandId: string;
  label: string;
  command: string;
  status:
    | 'queued'
    | 'running'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'timed_out'
    | 'cancelled'
    | 'rejected';
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

interface ShellStatusState {
  enabled: boolean;
  requiresAdminToken: boolean;
  activeRunId: string | null;
  queuedRunIds: string[];
  queueLength: number;
  activeRun: ShellRunRecord | null;
  queuedRuns: ShellRunRecord[];
  availableCommands: Array<{
    id: string;
    label: string;
    description: string;
    cwd: string;
  }>;
  recentRuns: ShellRunRecord[];
}

interface McpServerState {
  id: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  command: string | null;
  args: string[];
  transport: string;
  toolCount: number;
  tools: string[];
  lastError: string | null;
}

interface McpStatusState {
  enabled: boolean;
  initialized: boolean;
  initializedAt: number | null;
  connectedServerCount: number;
  servers: McpServerState[];
}

interface McpToolDescriptor {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

interface NetworkAccessState {
  port: number;
  privateIpv4Candidates: string[];
  recommendedUrl: string | null;
  loopbackUrl: string;
}

interface BrowserTarget {
  id: string;
  label: string;
  url: string;
  category: 'app' | 'remote' | 'system' | 'proactive';
  description: string;
}

const TABLET_COMMAND_IDS = [
  'adb-devices',
  'adb-device-info',
  'adb-network-info',
  'android-list',
] as const;

const HOST_NETWORK_COMMAND_IDS = [
  'host-network-interfaces',
  'host-network-routes',
  'host-listening-ports',
] as const;

const QUICK_MCP_PROMPTS = [
  'A neon cyber deer standing in a holographic forest at night',
  'Write a daily collaboration brief for Milla-Deer based on proactive discoveries',
  'Create a cinematic dashboard concept art image for Milla',
] as const;

function extractMcpContentBlocks(result: unknown): McpContentBlock[] {
  if (!result || typeof result !== 'object' || !('content' in result)) {
    return [];
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter(
    (block): block is McpContentBlock => Boolean(block) && typeof block === 'object'
  );
}

// Prettier for code formatting (loaded dynamically)
// Note: Module-level caching is intentional here - Prettier is a large library
// that should only be loaded once and shared across all Sandbox instances
let prettierLoaded = false;
let prettier: any = null;
let prettierPlugins: any = {};

async function loadPrettier() {
  if (prettierLoaded) return;
  try {
    prettier = await import('prettier/standalone');
    const parserBabel = await import('prettier/plugins/babel');
    const parserHtml = await import('prettier/plugins/html');
    const parserCss = await import('prettier/plugins/postcss');
    const parserEstree = await import('prettier/plugins/estree');
    prettierPlugins = {
      babel: parserBabel,
      html: parserHtml,
      postcss: parserCss,
      estree: parserEstree,
    };
    prettierLoaded = true;
  } catch (e) {
    console.warn('Failed to load Prettier:', e);
  }
}

export const Sandbox: React.FC<SandboxProps> = ({
  initialCode = '',
  isOpen,
  onClose,
  onDiscuss,
  width,
  embedded = false,
}) => {
  // Virtual file system
  const [files, setFiles] = useState<VirtualFile[]>([
    { name: 'index.html', content: getDefaultHtml(), language: 'html' },
    { name: 'style.css', content: getDefaultCss(), language: 'css' },
    {
      name: 'script.js',
      content: initialCode || getDefaultJs(),
      language: 'javascript',
    },
    { name: 'main.py', content: getDefaultPython(), language: 'python' },
    { name: 'app.ts', content: getDefaultTypeScript(), language: 'typescript' },
    { name: 'README.md', content: getDefaultMarkdown(), language: 'markdown' },
    { name: 'setup.sh', content: getDefaultShell(), language: 'bash' },
  ]);
  const [activeFileIndex, setActiveFileIndex] = useState(2); // Start on script.js

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  const [consoleHeight, setConsoleHeight] = useState(360);
  const [isResizingConsole, setIsResizingConsole] = useState(false);
  const [panelSize, setPanelSize] = useState(() => ({
    width: width ?? 1360,
    height: embedded ? 860 : 900,
  }));
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('terminal');
  const [shellStatus, setShellStatus] = useState<ShellStatusState | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const [isShellLoading, setIsShellLoading] = useState(false);
  const [selectedShellCommandId, setSelectedShellCommandId] =
    useState('workspace-check');
  const [isShellRunSubmitting, setIsShellRunSubmitting] = useState(false);
  const [isShellCancelSubmitting, setIsShellCancelSubmitting] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<McpStatusState | null>(null);
  const [mcpTools, setMcpTools] = useState<McpToolDescriptor[]>([]);
  const [selectedMcpToolKey, setSelectedMcpToolKey] = useState('');
  const [mcpArgsInput, setMcpArgsInput] = useState('{}');
  const [mcpCallResult, setMcpCallResult] = useState('');
  const [mcpCallPayload, setMcpCallPayload] = useState<unknown>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [isMcpLoading, setIsMcpLoading] = useState(false);
  const [isMcpCallSubmitting, setIsMcpCallSubmitting] = useState(false);
  const [quickToolPrompt, setQuickToolPrompt] = useState(QUICK_MCP_PROMPTS[0]);
  const [networkAccess, setNetworkAccess] = useState<NetworkAccessState | null>(null);
  const [networkAccessError, setNetworkAccessError] = useState<string | null>(null);
  const [browserTargets, setBrowserTargets] = useState<BrowserTarget[]>([]);
  const [browserTargetError, setBrowserTargetError] = useState<string | null>(null);
  const [isBrowserTargetsLoading, setIsBrowserTargetsLoading] = useState(false);
  const [browserUrlInput, setBrowserUrlInput] = useState('');
  const [browserFrameMode, setBrowserFrameMode] = useState<BrowserFrameMode>('preview');
  const [showMcpWorkspace, setShowMcpWorkspace] = useState(false);
  const [isMcpRegistryCollapsed, setIsMcpRegistryCollapsed] = useState(true);

  // GitHub repo browser
  const [repoUrl, setRepoUrl] = useState('');
  const [repoNodes, setRepoNodes] = useState<GitHubNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [githubStatus, setGitHubStatus] = useState<GitHubStatus | null>(null);

  // AI code generation
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);

  // New file modal state
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewKey = useRef(0);
  const consoleResizeRef = useRef<{ startY: number; startHeight: number } | null>(
    null
  );
  const panelResizeRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  // Load Prettier on mount
  useEffect(() => {
    loadPrettier();
  }, []);

  useEffect(() => {
    const loadGitHubStatus = async () => {
      try {
        const response = await fetch('/api/system/config-status');
        if (!response.ok) return;
        const data = await response.json();
        setGitHubStatus(data.integrationChecks?.github || null);
      } catch (error) {
        console.error('Failed to load GitHub status:', error);
      }
    };

    void loadGitHubStatus();
  }, []);

  useEffect(() => {
    if (!isResizingConsole) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = consoleResizeRef.current;
      if (!resizeState) {
        return;
      }

      const proposedHeight =
        resizeState.startHeight + (resizeState.startY - event.clientY);
      const minHeight = 220;
      const maxHeight = Math.max(
        minHeight,
        Math.min(window.innerHeight * (embedded ? 0.6 : 0.7), 720)
      );

      setConsoleHeight(Math.max(minHeight, Math.min(proposedHeight, maxHeight)));
    };

    const handlePointerUp = () => {
      consoleResizeRef.current = null;
      setIsResizingConsole(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [embedded, isResizingConsole]);

  useEffect(() => {
    if (!isResizingPanel) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = panelResizeRef.current;
      if (!resizeState) {
        return;
      }

      const minWidth = embedded ? 960 : 1100;
      const maxWidth = embedded
        ? Math.max(minWidth, window.innerWidth - 160)
        : Math.max(minWidth, window.innerWidth - 48);
      const minHeight = embedded ? 760 : 760;
      const maxHeight = embedded
        ? Math.max(minHeight, window.innerHeight - 160)
        : Math.max(minHeight, window.innerHeight - 32);

      const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);
      const nextHeight =
        resizeState.startHeight + (event.clientY - resizeState.startY);

      setPanelSize({
        width: Math.max(minWidth, Math.min(nextWidth, maxWidth)),
        height: Math.max(minHeight, Math.min(nextHeight, maxHeight)),
      });
    };

    const handlePointerUp = () => {
      panelResizeRef.current = null;
      setIsResizingPanel(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [embedded, isResizingPanel]);

  const fetchAdminJson = useCallback(async <T,>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> => {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data.message ||
          data.error ||
          `Request failed with status ${response.status}`
      );
    }
    return data;
  }, []);

  const formatMcpError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unable to invoke MCP tool.';

    if (message.includes('410')) {
      return `${message}. This usually means the configured Hugging Face model is retired or unavailable. The MCP runtime now prefers stabilityai/stable-diffusion-2-1; if this keeps happening, restart the server so the updated model setting is applied.`;
    }

    return message;
  }, []);

  const refreshShellStatus = useCallback(async () => {
    setIsShellLoading(true);
    setShellError(null);
    try {
      const data = await fetchAdminJson<ShellStatusState & { success: boolean }>(
        '/api/system/shell-status'
      );
      setShellStatus(data);
      if (!data.availableCommands.some((command) => command.id === selectedShellCommandId)) {
        setSelectedShellCommandId(data.availableCommands[0]?.id || 'workspace-check');
      }
    } catch (error) {
      setShellStatus(null);
      setShellError(
        error instanceof Error ? error.message : 'Unable to load shell status.'
      );
    } finally {
      setIsShellLoading(false);
    }
  }, [fetchAdminJson, selectedShellCommandId]);

  const refreshMcpData = useCallback(async () => {
    setIsMcpLoading(true);
    setMcpError(null);
    try {
      const statusResponse = await fetch('/api/system/mcp-status');
      if (!statusResponse.ok) {
        throw new Error('Unable to load MCP runtime status.');
      }
      const statusData = (await statusResponse.json()) as McpStatusState & {
        success: boolean;
      };
      const toolsData = await fetchAdminJson<{
        success: boolean;
        tools: McpToolDescriptor[];
      }>('/api/system/mcp-tools');

      setMcpStatus(statusData);
      setMcpTools(toolsData.tools || []);
      setSelectedMcpToolKey((current) => {
        if (current) {
          return current;
        }
        const firstTool = toolsData.tools?.[0];
        return firstTool ? `${firstTool.serverId}:${firstTool.name}` : '';
      });
    } catch (error) {
      setMcpStatus(null);
      setMcpTools([]);
      setSelectedMcpToolKey('');
      setMcpError(error instanceof Error ? error.message : 'Unable to load MCP.');
    } finally {
      setIsMcpLoading(false);
    }
  }, [fetchAdminJson]);

  const refreshNetworkAccess = useCallback(async () => {
    try {
      setNetworkAccessError(null);
      const data = await fetchAdminJson<NetworkAccessState & { success: boolean }>(
        '/api/system/network-access'
      );
      setNetworkAccess(data);
    } catch (error) {
      setNetworkAccess(null);
      setNetworkAccessError(
        error instanceof Error ? error.message : 'Unable to load network access details'
      );
    }
  }, [fetchAdminJson]);

  const refreshBrowserTargets = useCallback(async () => {
    setIsBrowserTargetsLoading(true);
    try {
      setBrowserTargetError(null);
      const data = await fetchAdminJson<{
        success: boolean;
        targets: BrowserTarget[];
      }>('/api/system/browser-targets');
      setBrowserTargets(data.targets || []);
      setBrowserUrlInput((current) => current || data.targets?.[0]?.url || '');
    } catch (error) {
      setBrowserTargets([]);
      setBrowserTargetError(
        error instanceof Error ? error.message : 'Unable to load browser targets'
      );
    } finally {
      setIsBrowserTargetsLoading(false);
    }
  }, [fetchAdminJson]);

  useEffect(() => {
    void refreshShellStatus();
    void refreshMcpData();
    void refreshNetworkAccess();
    void refreshBrowserTargets();
  }, [refreshBrowserTargets, refreshMcpData, refreshNetworkAccess, refreshShellStatus]);

  const queueSpecificShellCommand = async (commandId: string) => {
    setSelectedShellCommandId(commandId);
    setIsShellRunSubmitting(true);
    setShellError(null);
    try {
      await fetchAdminJson('/api/system/shell/run', {
        method: 'POST',
        body: JSON.stringify({ commandId }),
      });
      await refreshShellStatus();
    } catch (error) {
      setShellError(
        error instanceof Error ? error.message : 'Unable to queue shell command.'
      );
    } finally {
      setIsShellRunSubmitting(false);
    }
  };

  const cancelShellRun = async () => {
    setIsShellCancelSubmitting(true);
    setShellError(null);
    try {
      await fetchAdminJson('/api/system/shell/cancel', {
        method: 'POST',
        body: JSON.stringify(
          shellStatus?.activeRun?.runId ? { runId: shellStatus.activeRun.runId } : {}
        ),
      });
      await refreshShellStatus();
    } catch (error) {
      setShellError(
        error instanceof Error ? error.message : 'Unable to cancel shell command.'
      );
    } finally {
      setIsShellCancelSubmitting(false);
    }
  };

  const invokeMcpTool = useCallback(async () => {
    const selectedTool = mcpTools.find(
      (tool) => `${tool.serverId}:${tool.name}` === selectedMcpToolKey
    );
    if (!selectedTool) {
      setMcpError('Choose an MCP tool first.');
      return;
    }

    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(mcpArgsInput || '{}') as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('Arguments must be a JSON object.');
      }
      args = parsed as Record<string, unknown>;
    } catch (error) {
      setMcpError(error instanceof Error ? error.message : 'Arguments must be valid JSON.');
      return;
    }

    setIsMcpCallSubmitting(true);
    setMcpError(null);
    try {
      const data = await fetchAdminJson<{
        success: boolean;
        result: unknown;
      }>('/api/system/mcp-call', {
        method: 'POST',
        body: JSON.stringify({
          serverId: selectedTool.serverId,
          toolName: selectedTool.name,
          args,
        }),
      });
      setMcpCallPayload(data.result);
      setMcpCallResult(JSON.stringify(data.result, null, 2));
    } catch (error) {
      setMcpError(formatMcpError(error));
    } finally {
      setIsMcpCallSubmitting(false);
    }
  }, [fetchAdminJson, formatMcpError, mcpArgsInput, mcpTools, selectedMcpToolKey]);

  const runQuickMcpTool = useCallback(async (
    toolName: 'generate_image' | 'generate_story',
    args: Record<string, unknown>
  ) => {
    const tool = mcpTools.find(
      (candidate) =>
        candidate.serverId === 'huggingface' && candidate.name === toolName
    );

    if (!tool) {
      setMcpError(`The ${toolName} MCP tool is not currently available.`);
      return;
    }

    setSelectedMcpToolKey(`${tool.serverId}:${tool.name}`);
    setMcpArgsInput(JSON.stringify(args, null, 2));
    setIsMcpCallSubmitting(true);
    setMcpError(null);

    try {
      const data = await fetchAdminJson<{
        success: boolean;
        result: unknown;
      }>('/api/system/mcp-call', {
        method: 'POST',
        body: JSON.stringify({
          serverId: tool.serverId,
          toolName: tool.name,
          args,
        }),
      });
      setMcpCallPayload(data.result);
      setMcpCallResult(JSON.stringify(data.result, null, 2));
    } catch (error) {
      setMcpError(formatMcpError(error));
    } finally {
      setIsMcpCallSubmitting(false);
    }
  }, [fetchAdminJson, formatMcpError, mcpTools]);

  const handleQuickStoryFromFile = async () => {
    const fileContext = activeFile
      ? `Current file: ${activeFile.name} (${activeFile.language})\n\n${activeFile.content.slice(0, 5000)}`
      : '';
    const prompt = quickToolPrompt.trim() || 'Explain the current implementation in a concise way.';

    await runQuickMcpTool('generate_story', {
      prompt: `${prompt}\n\n${fileContext}`.trim(),
    });
  };

  const openBrowserUrl = useCallback((rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setBrowserTargetError('Enter a URL or choose a suggested target first.');
      return;
    }

    try {
      const resolved = new URL(trimmed, window.location.origin);
      if (!['http:', 'https:'].includes(resolved.protocol)) {
        throw new Error('Only http:// and https:// URLs are supported.');
      }

      setBrowserFrameMode('live');
      setBrowserTargetError(null);
      setBrowserUrlInput(resolved.toString());

      if (iframeRef.current) {
        iframeRef.current.srcdoc = '';
        iframeRef.current.src = resolved.toString();
      }
    } catch (error) {
      setBrowserTargetError(error instanceof Error ? error.message : 'Invalid browser URL.');
    }
  }, []);

  // Get current active file
  const activeFile = files[activeFileIndex];

  // Update file content
  const updateFileContent = useCallback(
    (content: string) => {
      setFiles((prev) =>
        prev.map((f, i) => (i === activeFileIndex ? { ...f, content } : f))
      );
    },
    [activeFileIndex]
  );

  // Add new file - opens inline input
  const addNewFile = () => {
    setShowNewFileInput(true);
    setNewFileName('');
  };

  // Confirm new file creation
  const confirmNewFile = () => {
    if (!newFileName.trim()) {
      setShowNewFileInput(false);
      return;
    }

    const extension = newFileName.split('.').pop()?.toLowerCase() || 'js';
    const languageMap: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      jsx: 'javascript',
      tsx: 'typescript',
      html: 'html',
      css: 'css',
      json: 'json',
      py: 'python',
      md: 'markdown',
      sh: 'bash',
      bash: 'bash',
      yaml: 'yaml',
      yml: 'yaml',
      sql: 'sql',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
    };

    setFiles((prev) => [
      ...prev,
      {
        name: newFileName.trim(),
        content: '',
        language: languageMap[extension] || 'javascript',
      },
    ]);
    setActiveFileIndex(files.length);
    setShowNewFileInput(false);
    setNewFileName('');
  };

  // Delete file
  const deleteFile = (index: number) => {
    if (files.length <= 1) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (activeFileIndex >= index && activeFileIndex > 0) {
      setActiveFileIndex(activeFileIndex - 1);
    }
  };

  // Format code with Prettier
  const formatCode = async () => {
    if (!prettierLoaded || !prettier) {
      console.warn('Prettier not loaded');
      return;
    }

    try {
      const file = files[activeFileIndex];
      let parser = 'babel';
      if (file.language === 'html') parser = 'html';
      else if (file.language === 'css') parser = 'css';
      else if (file.language === 'json') parser = 'json';

      const formatted = await prettier.format(file.content, {
        parser,
        plugins: Object.values(prettierPlugins),
        semi: true,
        singleQuote: true,
        tabWidth: 2,
      });

      updateFileContent(formatted);
    } catch (e) {
      console.error('Format error:', e);
    }
  };

  // Run the code in preview
  const runCode = useCallback(() => {
    previewKey.current++;
    setConsoleLogs([]);
    setBrowserFrameMode('preview');
    setBrowserTargetError(null);

    const htmlFile = files.find((f) => f.name.endsWith('.html'));
    const cssFile = files.find((f) => f.name.endsWith('.css'));
    const jsFiles = files.filter(
      (f) => f.name.endsWith('.js') || f.name.endsWith('.jsx')
    );

    // Build console interception script
    const consoleScript = `
      <script>
        (function() {
          const originalConsole = { ...console };
          ['log', 'error', 'warn', 'info'].forEach(level => {
            console[level] = (...args) => {
              originalConsole[level](...args);
              window.parent.postMessage({
                type: 'console',
                level,
                args: args.map(a => {
                  try { return JSON.stringify(a); }
                  catch { return String(a); }
                }),
                timestamp: new Date().toISOString()
              }, '*');
            };
          });
          window.onerror = (msg, url, line, col, error) => {
            window.parent.postMessage({
              type: 'console',
              level: 'error',
              args: [msg + ' at line ' + line + ':' + col],
              timestamp: new Date().toISOString()
            }, '*');
          };
        })();
      </script>
    `;

    // Combine all JS files
    const jsContent = jsFiles.map((f) => f.content).join('\n\n');

    // Build full HTML
    let fullHtml =
      htmlFile?.content ||
      `<!DOCTYPE html><html><head></head><body></body></html>`;

    // Inject CSS
    if (cssFile) {
      fullHtml = fullHtml.replace(
        '</head>',
        `<style>${cssFile.content}</style></head>`
      );
    }

    // Inject console interception + JS
    fullHtml = fullHtml.replace(
      '</body>',
      `${consoleScript}<script>${jsContent}</script></body>`
    );

    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank';
      iframeRef.current.srcdoc = fullHtml;
    }
  }, [files]);

  // Listen for console messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'console') {
        setConsoleLogs((prev) => [
          ...prev,
          {
            level: event.data.level,
            args: event.data.args,
            timestamp: event.data.timestamp,
          },
        ]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Fetch GitHub repo contents
  const fetchRepoContents = async (path = '') => {
    if (!repoUrl) return;

    // Parse owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/i);
    if (!match) {
      setRepoError('Invalid GitHub URL format');
      return;
    }

    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git$/, '');

    setLoadingRepo(true);
    setRepoError(null);

    try {
      const response = await fetch('/api/repo/contents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo: repoName, path }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const nodes: GitHubNode[] = await response.json();
      setRepoNodes(nodes);
    } catch (e) {
      setRepoError(e instanceof Error ? e.message : 'Failed to fetch repo');
    } finally {
      setLoadingRepo(false);
    }
  };

  // Fetch file content from GitHub
  const fetchFileContent = async (node: GitHubNode) => {
    if (node.type !== 'blob' || !node.url) return;

    try {
      const response = await fetch(node.url);
      if (!response.ok) throw new Error('Failed to fetch file');

      const content = await response.text();
      const extension = node.path.split('.').pop()?.toLowerCase() || 'txt';
      const languageMap: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        jsx: 'javascript',
        tsx: 'typescript',
        html: 'html',
        css: 'css',
        json: 'json',
        md: 'markdown',
        py: 'python',
      };

      // Add to files
      setFiles((prev) => [
        ...prev,
        {
          name: node.path.split('/').pop() || node.path,
          content,
          language: languageMap[extension] || 'plaintext',
        },
      ]);
      setActiveFileIndex(files.length);
    } catch (e) {
      console.error('Failed to fetch file:', e);
    }
  };

  // AI Code Generation
  const generateCode = async () => {
    if (!aiPrompt.trim()) return;

    setGeneratingCode(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Generate code for: ${aiPrompt}\n\nContext: Current file is ${activeFile.name} (${activeFile.language}). Respond with just the code, no explanations.`,
        }),
      });

      if (!response.ok) throw new Error('AI request failed');

      const data = await response.json();
      const generatedCode = data.response || '';

      // Extract code from markdown code blocks if present
      const codeMatch = generatedCode.match(/```[\w]*\n?([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[1].trim() : generatedCode.trim();

      if (code) {
        updateFileContent(activeFile.content + '\n\n' + code);
      }

      setAiPrompt('');
    } catch (e) {
      console.error('AI generation error:', e);
    } finally {
      setGeneratingCode(false);
    }
  };

  // Syntax highlighting for editor
  const highlightCode = (code: string) => {
    const language = activeFile?.language || 'javascript';
    return (
      <Highlight
        theme={themes.nightOwl}
        code={code}
        language={language === 'plaintext' ? 'javascript' : language}
      >
        {({ tokens, getLineProps, getTokenProps }) => (
          <>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </>
        )}
      </Highlight>
    );
  };

  // Discuss code with Milla
  const handleDiscuss = () => {
    if (onDiscuss && activeFile) {
      onDiscuss(activeFile.content);
    }
  };

  if (!isOpen) return null;

  const selectedMcpTool =
    mcpTools.find((tool) => `${tool.serverId}:${tool.name}` === selectedMcpToolKey) ??
    null;
  const mcpBlocks = extractMcpContentBlocks(mcpCallPayload);
  const mcpTextBlocks = mcpBlocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string);
  const mcpImageBlocks = mcpBlocks
    .filter(
      (block) =>
        block.type === 'image' &&
        typeof block.data === 'string' &&
        typeof block.mimeType === 'string'
    )
    .map((block) => `data:${block.mimeType};base64,${block.data}`);
  const mcpServers = mcpStatus?.servers ?? [];
  const configuredMcpServerCount = mcpServers.filter((server) => server.configured).length;
  const mcpWorkspaceContent = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 pr-3">
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">MCP server registry</div>
                <div className="text-[11px] text-white/60">
                  Shows every MCP slot, including connected, configured, and waiting-to-install servers.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <Badge className="border-violet-400/30 bg-violet-500/15 text-violet-100">
                  {mcpServers.length} total
                </Badge>
                <Badge className="border-emerald-400/30 bg-emerald-500/15 text-emerald-100">
                  {mcpStatus?.connectedServerCount ?? 0} connected
                </Badge>
                <Badge className="border-cyan-400/30 bg-cyan-500/15 text-cyan-100">
                  {configuredMcpServerCount} configured
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMcpRegistryCollapsed((current) => !current)}
                  className="h-7 px-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
                >
                  {isMcpRegistryCollapsed ? (
                    <ChevronRight className="mr-1 h-3 w-3" />
                  ) : (
                    <ChevronDown className="mr-1 h-3 w-3" />
                  )}
                  {isMcpRegistryCollapsed ? 'Expand registry' : 'Collapse registry'}
                </Button>
              </div>
            </div>
            {isMcpRegistryCollapsed ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/60">
                Registry collapsed to save space. Expand it to inspect individual MCP server status and tools.
              </div>
            ) : mcpServers.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {mcpServers.map((server) => {
                  const tone = server.connected
                    ? 'border-emerald-400/30 bg-emerald-500/10'
                    : server.configured
                      ? 'border-amber-400/30 bg-amber-500/10'
                      : 'border-white/10 bg-black/20';

                  return (
                    <div key={server.id} className={`rounded-md border p-3 ${tone}`}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-white">{server.name}</div>
                          <div className="text-[11px] text-white/50">{server.id}</div>
                        </div>
                        <Badge
                          className={
                            server.connected
                              ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'
                              : server.configured
                                ? 'border-amber-400/30 bg-amber-500/15 text-amber-100'
                                : 'border-white/10 bg-white/10 text-white/70'
                          }
                        >
                          {server.connected
                            ? 'connected'
                            : server.configured
                              ? 'configured'
                              : 'not installed'}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-[11px] text-white/70">
                        <div>Transport: {server.transport}</div>
                        <div>Tools: {server.toolCount}</div>
                        {server.command ? (
                          <div className="truncate">Command: {server.command}</div>
                        ) : null}
                        {server.tools.length ? (
                          <div className="text-white/60">Available: {server.tools.join(', ')}</div>
                        ) : null}
                        {server.lastError ? (
                          <div className="rounded border border-white/10 bg-black/20 px-2 py-1 text-white/60">
                            {server.lastError}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-xs text-white/60">No MCP servers reported yet.</div>
            )}
          </div>
          <div className="rounded-md border border-violet-400/20 bg-violet-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-violet-100">Quick MCP tools</div>
            <div className="text-[11px] text-violet-100/70">
              Run the most useful connected tools without hand-editing JSON.
            </div>
          </div>
          <Badge className="border-violet-400/30 bg-violet-500/15 text-violet-100">
            {mcpStatus?.connectedServerCount ?? 0} connected
          </Badge>
        </div>
        <Input
          value={quickToolPrompt}
          onChange={(event) => setQuickToolPrompt(event.target.value)}
          placeholder="Describe the image or story you want"
          className="mb-2 h-8 bg-black/40 text-xs text-white"
        />
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK_MCP_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setQuickToolPrompt(prompt)}
              className="rounded-md border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-100 hover:bg-violet-500/15"
            >
              {prompt.slice(0, 42)}
              {prompt.length > 42 ? '…' : ''}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void runQuickMcpTool('generate_image', {
                prompt: quickToolPrompt.trim() || QUICK_MCP_PROMPTS[0],
              })
            }
            disabled={isMcpCallSubmitting || !mcpTools.some((tool) => tool.name === 'generate_image')}
            className="h-7 px-3 text-xs text-violet-100 hover:bg-violet-500/15 disabled:opacity-40"
          >
            Generate image
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void runQuickMcpTool('generate_story', {
                prompt: quickToolPrompt.trim() || QUICK_MCP_PROMPTS[1],
              })
            }
            disabled={isMcpCallSubmitting || !mcpTools.some((tool) => tool.name === 'generate_story')}
            className="h-7 px-3 text-xs text-violet-100 hover:bg-violet-500/15 disabled:opacity-40"
          >
            Generate story
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleQuickStoryFromFile()}
            disabled={isMcpCallSubmitting || !activeFile}
            className="h-7 px-3 text-xs text-violet-100 hover:bg-violet-500/15 disabled:opacity-40"
          >
            Story from current file
          </Button>
        </div>
        {activeFile ? (
          <div className="mt-2 text-[11px] text-violet-100/70">
            Current file context: {activeFile.name} ({activeFile.language})
          </div>
        ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ServerCog className="h-4 w-4 text-violet-300" />
            <select
              value={selectedMcpToolKey}
              onChange={(event) => setSelectedMcpToolKey(event.target.value)}
              className="min-w-[220px] rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
            >
              {mcpTools.length ? (
                mcpTools.map((tool) => {
                  const key = `${tool.serverId}:${tool.name}`;
                  return (
                    <option key={key} value={key} className="bg-[#120520]">
                      {tool.serverName} · {tool.name}
                    </option>
                  );
                })
              ) : (
                <option value="" className="bg-[#120520]">
                  No MCP tools available
                </option>
              )}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void invokeMcpTool()}
              disabled={isMcpCallSubmitting || !selectedMcpToolKey}
              className="h-7 px-3 text-xs text-violet-200 hover:bg-violet-500/15 disabled:opacity-40"
            >
              {isMcpCallSubmitting ? 'Running…' : 'Invoke'}
            </Button>
          </div>
          <textarea
            value={mcpArgsInput}
            onChange={(event) => setMcpArgsInput(event.target.value)}
            className="h-16 rounded-md border border-white/10 bg-black/40 p-2 font-mono text-xs text-white outline-none"
          />
          {selectedMcpTool?.description ? (
            <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70">
              {selectedMcpTool.description}
            </div>
          ) : null}
          {mcpError ? (
            <div className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
              {mcpError}
            </div>
          ) : null}
          {mcpImageBlocks.length ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {mcpImageBlocks.map((src, index) => (
                <div
                  key={`${src}-${index}`}
                  className="overflow-hidden rounded-md border border-violet-400/20 bg-black/30"
                >
                  <img
                    src={src}
                    alt={`MCP generated ${index + 1}`}
                    className="h-40 w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}
          {mcpTextBlocks.length ? (
            <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs text-white/80">
              {mcpTextBlocks.map((block, index) => (
                <p key={`${block.slice(0, 24)}-${index}`} className="mb-2 last:mb-0">
                  {block}
                </p>
              ))}
            </div>
          ) : null}
          <div className="max-h-[320px] overflow-auto rounded-md border border-white/10 bg-[#050816] p-2">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-violet-100">
              {mcpCallResult ||
                `Connected servers: ${mcpStatus?.connectedServerCount ?? 0}\nChoose a tool and invoke it to see results here.`}
            </pre>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
  const quickShellCommands = [
    'workspace-check',
    ...TABLET_COMMAND_IDS,
    ...HOST_NETWORK_COMMAND_IDS,
  ].map((commandId) =>
    shellStatus?.availableCommands.find((command) => command.id === commandId)
  ).filter((command): command is NonNullable<typeof command> => Boolean(command));
  const latestTerminalOutput = shellStatus?.activeRun
    ? [
        shellStatus.activeRun.stdout,
        shellStatus.activeRun.stderr ? `\n${shellStatus.activeRun.stderr}` : '',
      ]
        .join('')
        .trim()
    : shellStatus?.recentRuns?.[0]
      ? [
          shellStatus.recentRuns[0].stdout,
          shellStatus.recentRuns[0].stderr
            ? `\n${shellStatus.recentRuns[0].stderr}`
            : '',
        ]
          .join('')
          .trim()
      : '';

  const handleCopyNetworkUrl = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setShellError(null);
    } catch (error) {
      setShellError(
        error instanceof Error ? error.message : 'Unable to copy the LAN address'
      );
    }
  };

  const startConsoleResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    consoleResizeRef.current = {
      startY: event.clientY,
      startHeight: consoleHeight,
    };
    setIsResizingConsole(true);
  };

  const startPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    panelResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: panelSize.width,
      startHeight: panelSize.height,
    };
    setIsResizingPanel(true);
  };

  const containerClasses = embedded
    ? 'relative mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-cyan-500/20 bg-[#0f0f1a]/98 shadow-2xl backdrop-blur-lg'
    : 'fixed left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-cyan-500/20 bg-[#0f0f1a]/98 shadow-2xl backdrop-blur-lg';

  return (
    <div
      className={containerClasses}
      style={{
        width: embedded ? '100%' : `${panelSize.width}px`,
        height: embedded ? '100%' : `${panelSize.height}px`,
        maxWidth: embedded ? '100%' : 'calc(100vw - 24px)',
        maxHeight: embedded ? '100%' : 'calc(100vh - 24px)',
        zIndex: embedded ? 1 : 300,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0a0a12]/60">
        <div className="flex items-center gap-3">
          <Code className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Code Sandbox</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Buttons */}
          <div className="flex items-center bg-black/40 rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('code')}
              className={`px-3 py-1 ${viewMode === 'code' ? 'bg-purple-500/20 text-purple-400' : 'text-white/60'}`}
            >
              <FileCode className="w-4 h-4 mr-1" />
              Code
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('split')}
              className={`px-3 py-1 ${viewMode === 'split' ? 'bg-purple-500/20 text-purple-400' : 'text-white/60'}`}
            >
              <Split className="w-4 h-4 mr-1" />
              Split
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1 ${viewMode === 'preview' ? 'bg-purple-500/20 text-purple-400' : 'text-white/60'}`}
            >
              <Eye className="w-4 h-4 mr-1" />
              Preview
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={runCode}
            className="text-green-400 hover:bg-green-500/20"
            title="Run code"
          >
            <Play className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={formatCode}
            className="text-blue-400 hover:bg-blue-500/20"
            title="Format code"
          >
            <Wand2 className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleDiscuss}
            className="text-purple-400 hover:bg-purple-500/20"
            title="Discuss with Milla"
          >
            <MessageSquare className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer Sidebar */}
        <div className="w-56 border-r border-white/10 bg-black/20 flex flex-col">
          {/* File tabs */}
          <div className="p-2 border-b border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/60 uppercase tracking-wider">
                Files
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={addNewFile}
                className="w-6 h-6 text-white/60 hover:text-white"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="h-32">
              {files.map((file, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer group ${
                    index === activeFileIndex
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'text-white/70 hover:bg-white/5'
                  }`}
                  onClick={() => setActiveFileIndex(index)}
                >
                  <div className="flex items-center gap-2">
                    <File className="w-4 h-4" />
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  {files.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(index);
                      }}
                      className="w-5 h-5 opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              {/* Inline new file input */}
              {showNewFileInput && (
                <div className="flex items-center gap-1 px-2 py-1">
                  <File className="w-4 h-4 text-green-400" />
                  <Input
                    autoFocus
                    placeholder="filename.js"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmNewFile();
                      if (e.key === 'Escape') setShowNewFileInput(false);
                    }}
                    onBlur={confirmNewFile}
                    className="h-6 text-xs bg-black/40 border-purple-500/50 text-white px-2"
                  />
                </div>
              )}
            </ScrollArea>
          </div>

          {/* GitHub Repo Browser */}
          <div className="flex-1 p-2 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <FolderTree className="w-4 h-4 text-white/60" />
              <span className="text-xs text-white/60 uppercase tracking-wider">
                GitHub
              </span>
            </div>

            <div className="flex gap-1 mb-2">
              <Input
                placeholder="github.com/user/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="text-xs h-7 bg-black/40 border-white/10 text-white"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchRepoContents()}
                disabled={loadingRepo}
                className="w-7 h-7 text-white/60 hover:text-white"
              >
                {loadingRepo ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </Button>
            </div>

            {githubStatus && (
              <div className="mb-2 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/70">
                GitHub: {githubStatus.valid ? 'connected' : githubStatus.configured ? 'token invalid' : 'not configured'}
                {githubStatus.scopes.length > 0
                  ? ` • ${githubStatus.scopes.slice(0, 3).join(', ')}`
                  : ''}
              </div>
            )}

            {repoError && (
              <p className="text-xs text-red-400 mb-2">{repoError}</p>
            )}

            <ScrollArea className="flex-1">
              {repoNodes.map((node) => (
                <div
                  key={node.sha}
                  className="flex items-center gap-2 px-2 py-1 text-sm text-white/70 hover:bg-white/5 rounded cursor-pointer"
                  onClick={() =>
                    node.type === 'blob'
                      ? fetchFileContent(node)
                      : fetchRepoContents(node.path)
                  }
                >
                  {node.type === 'tree' ? (
                    <Folder className="w-4 h-4 text-yellow-400" />
                  ) : (
                    <File className="w-4 h-4 text-blue-400" />
                  )}
                  <span className="truncate">{node.path.split('/').pop()}</span>
                </div>
              ))}
            </ScrollArea>
          </div>

          {/* AI Code Generation */}
          <div className="p-2 border-t border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-white/60 uppercase tracking-wider">
                AI Generate
              </span>
            </div>
            <div className="flex gap-1">
              <Input
                placeholder="Describe code to generate..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && generateCode()}
                className="text-xs h-7 bg-black/40 border-white/10 text-white"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={generateCode}
                disabled={generatingCode}
                className="w-7 h-7 text-purple-400 hover:bg-purple-500/20"
              >
                {generatingCode ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {showMcpWorkspace ? (
            <div className="flex min-h-0 flex-1 flex-col bg-[#0b0f1b]">
              <div className="flex items-center justify-between border-b border-violet-400/20 bg-violet-500/10 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-violet-100">MCP workspace</div>
                  <div className="text-xs text-violet-100/70">
                    Dedicated MCP panel with full-height scrolling and tool output.
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMcpWorkspace(false)}
                  className="h-7 px-3 text-xs text-violet-100 hover:bg-violet-500/15"
                >
                  Back to sandbox
                </Button>
              </div>
              {mcpWorkspaceContent}
            </div>
          ) : (
            <div
              className={`flex-1 flex ${viewMode === 'split' ? 'flex-row' : 'flex-col'} overflow-hidden`}
            >
              {(viewMode === 'code' || viewMode === 'split') && (
                <div
                  className={`${viewMode === 'split' ? 'w-1/2' : 'flex-1'} flex flex-col overflow-hidden border-r border-white/10`}
                >
                  <div className="px-3 py-2 border-b border-white/10 bg-black/20 flex items-center justify-between">
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {activeFile?.name}
                    </Badge>
                    <span className="text-xs text-white/40">
                      {activeFile?.language}
                    </span>
                  </div>
                  <ScrollArea className="flex-1">
                    <Editor
                      value={activeFile?.content || ''}
                      onValueChange={updateFileContent}
                      highlight={highlightCode}
                      padding={16}
                      style={{
                        fontFamily: '"Fira Code", "Fira Mono", monospace',
                        fontSize: 14,
                        minHeight: '100%',
                        backgroundColor: 'transparent',
                      }}
                      className="min-h-full text-white"
                    />
                  </ScrollArea>
                </div>
              )}

              {(viewMode === 'preview' || viewMode === 'split') && (
                <div
                  className={`${viewMode === 'split' ? 'w-1/2' : 'flex-1'} flex flex-col overflow-hidden`}
                >
                  <div className="px-3 py-2 border-b border-white/10 bg-black/20 flex items-center justify-between">
                    <span className="text-sm text-white/70">Preview</span>
                    <div className="flex items-center gap-2">
                      {browserFrameMode === 'live' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={runCode}
                          className="h-6 px-2 text-xs text-cyan-300 hover:bg-cyan-500/20"
                        >
                          Return to Preview
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={runCode}
                        className="h-6 px-2 text-xs text-green-400 hover:bg-green-500/20"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 bg-[#050816]">
                    <iframe
                      key={previewKey.current}
                      ref={iframeRef}
                      title="Preview"
                      className="w-full h-full border-0"
                      sandbox={
                        browserFrameMode === 'live'
                          ? 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals'
                          : 'allow-scripts allow-modals'
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Console */}
          {showConsole && !showMcpWorkspace && (
            <div
              className="shrink-0 border-t border-white/10 bg-black/40 flex flex-col"
              style={{ height: `${consoleHeight}px` }}
            >
              <div
                role="separator"
                aria-label="Resize console"
                aria-orientation="horizontal"
                onPointerDown={startConsoleResize}
                className={`flex h-3 shrink-0 cursor-row-resize items-center justify-center border-b border-white/10 transition ${
                  isResizingConsole ? 'bg-cyan-500/10' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="h-1 w-16 rounded-full bg-white/25" />
              </div>
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConsoleTab('browser')}
                    className={`rounded-md px-2 py-1 text-xs transition ${
                      consoleTab === 'browser'
                        ? 'bg-cyan-500/15 text-cyan-200'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Browser Console
                  </button>
                  <button
                    onClick={() => setConsoleTab('terminal')}
                    className={`rounded-md px-2 py-1 text-xs transition ${
                      consoleTab === 'terminal'
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Terminal
                  </button>
                  <button
                    onClick={() => setConsoleTab('mcp')}
                    className={`rounded-md px-2 py-1 text-xs transition ${
                      consoleTab === 'mcp'
                        ? 'bg-violet-500/15 text-violet-200'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    MCP
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {consoleTab === 'browser' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConsoleLogs([])}
                      className="h-6 px-2 text-xs text-white/60 hover:text-white"
                    >
                      Clear
                    </Button>
                  ) : null}
                  {consoleTab === 'terminal' ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void refreshShellStatus()}
                        className="h-6 px-2 text-xs text-white/60 hover:text-white"
                      >
                        <RefreshCw className={`mr-1 h-3 w-3 ${isShellLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void cancelShellRun()}
                        disabled={isShellCancelSubmitting || !shellStatus?.activeRun?.runId}
                        className="h-6 px-2 text-xs text-white/60 hover:text-white disabled:opacity-40"
                      >
                        <Square className="mr-1 h-3 w-3" />
                        Stop
                      </Button>
                    </>
                  ) : null}
                  {consoleTab === 'mcp' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void refreshMcpData()}
                      className="h-6 px-2 text-xs text-white/60 hover:text-white"
                    >
                      <RefreshCw className={`mr-1 h-3 w-3 ${isMcpLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  ) : null}
                  {consoleTab === 'mcp' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMcpWorkspace(true)}
                      className="h-6 px-2 text-xs text-violet-200 hover:bg-violet-500/15"
                    >
                      Open workspace
                    </Button>
                  ) : null}
                </div>
              </div>
              {consoleTab === 'browser' ? (
                <div className="flex flex-1 flex-col gap-3 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={browserUrlInput}
                      onChange={(event) => setBrowserUrlInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          openBrowserUrl(browserUrlInput);
                        }
                      }}
                      placeholder="http://127.0.0.1:5000"
                      className="h-8 min-w-[280px] flex-1 bg-black/40 text-xs text-white"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openBrowserUrl(browserUrlInput)}
                      className="h-8 px-3 text-xs text-cyan-200 hover:bg-cyan-500/15"
                    >
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void refreshBrowserTargets()}
                      className="h-8 px-3 text-xs text-white/70 hover:text-white"
                    >
                      <RefreshCw
                        className={`mr-1 h-3 w-3 ${isBrowserTargetsLoading ? 'animate-spin' : ''}`}
                      />
                      Refresh targets
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={runCode}
                      className={`rounded-md border px-2 py-1 text-[11px] transition ${
                        browserFrameMode === 'preview'
                          ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                          : 'border-white/10 bg-white/5 text-white/70'
                      }`}
                    >
                      <Play className="mr-1 inline h-3 w-3" />
                      Sandbox preview
                    </button>
                    {browserTargets.map((target) => (
                      <button
                        key={target.id}
                        onClick={() => openBrowserUrl(target.url)}
                        className="rounded-md border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-500/15"
                        title={target.description}
                      >
                        {target.label}
                      </button>
                    ))}
                  </div>
                  {browserTargets.length ? (
                    <div className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-xs text-white/70">
                      {browserTargets.map((target) => (
                        <div key={target.id} className="py-0.5">
                          <span className="font-medium text-white/85">{target.label}</span>
                          {` · ${target.category} · ${target.description}`}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {browserTargetError ? (
                    <div className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
                      {browserTargetError}
                    </div>
                  ) : null}
                  <ScrollArea className="flex-1 rounded-md border border-white/10 bg-[#050816] p-2">
                    {consoleLogs.map((log, i) => (
                      <div
                        key={i}
                        className={`font-mono text-xs py-0.5 ${
                          log.level === 'error'
                            ? 'text-red-400'
                            : log.level === 'warn'
                              ? 'text-yellow-400'
                              : log.level === 'info'
                                ? 'text-blue-400'
                                : 'text-white/80'
                        }`}
                      >
                        <span className="text-white/40 mr-2">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        {log.args.join(' ')}
                      </div>
                    ))}
                    {consoleLogs.length === 0 && (
                      <p className="text-white/40 text-xs">
                        {browserFrameMode === 'live'
                          ? 'Live browser targets are loaded in the preview pane above. Console capture remains available when you switch back to Sandbox preview.'
                          : 'Console output will appear here...'}
                      </p>
                    )}
                  </ScrollArea>
                </div>
              ) : null}
              {consoleTab === 'terminal' ? (
                <div className="flex flex-1 flex-col gap-3 p-3">
                  <div className="rounded-md border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-50">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-cyan-100">
                          Remote access
                        </div>
                        <div className="mt-1 text-cyan-100/80">
                          {networkAccess?.recommendedUrl
                            ? `Open this on your phone while both devices are on the same LAN: ${networkAccess.recommendedUrl}`
                            : 'No LAN URL detected yet.'}
                        </div>
                      </div>
                      {networkAccess?.recommendedUrl ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleCopyNetworkUrl(networkAccess.recommendedUrl!)}
                          className="h-7 px-3 text-xs text-cyan-100 hover:bg-cyan-500/15"
                        >
                          Copy URL
                        </Button>
                      ) : null}
                    </div>
                    {networkAccess?.privateIpv4Candidates?.length ? (
                      <div className="mt-2 text-[11px] text-cyan-100/70">
                        Host IPs: {networkAccess.privateIpv4Candidates.join(', ')}
                      </div>
                    ) : null}
                    {networkAccessError ? (
                      <div className="mt-2 text-[11px] text-amber-200">
                        {networkAccessError}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-emerald-300" />
                    <select
                      value={selectedShellCommandId}
                      onChange={(event) => setSelectedShellCommandId(event.target.value)}
                      className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                    >
                      {(shellStatus?.availableCommands ?? []).map((command) => (
                        <option key={command.id} value={command.id} className="bg-[#120520]">
                          {command.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void queueSpecificShellCommand(selectedShellCommandId)}
                      disabled={isShellRunSubmitting || !selectedShellCommandId}
                      className="h-7 px-3 text-xs text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40"
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Run
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickShellCommands.map((command) => {
                      const isTablet = TABLET_COMMAND_IDS.includes(
                        command.id as (typeof TABLET_COMMAND_IDS)[number]
                      );
                      return (
                        <button
                          key={command.id}
                          onClick={() => void queueSpecificShellCommand(command.id)}
                          className={`rounded-md border px-2 py-1 text-[11px] transition ${
                            isTablet
                              ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                              : 'border-violet-400/25 bg-violet-500/10 text-violet-100'
                          }`}
                        >
                          {isTablet ? (
                            <Smartphone className="mr-1 inline h-3 w-3" />
                          ) : (
                            <Network className="mr-1 inline h-3 w-3" />
                          )}
                          {command.label}
                        </button>
                      );
                    })}
                  </div>
                  {shellError ? (
                    <div className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
                      {shellError}
                    </div>
                  ) : null}
                  <ScrollArea className="flex-1 rounded-md border border-white/10 bg-[#050816] p-2">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-[#b8f8ff]">
                      {latestTerminalOutput || 'Run a shell, ADB, or network command to watch output here.'}
                    </pre>
                  </ScrollArea>
                </div>
              ) : null}
              {consoleTab === 'mcp' ? (
                mcpWorkspaceContent
              ) : null}
            </div>
          )}
        </div>
      </div>
      <div
        role="separator"
        aria-label="Resize sandbox"
        aria-orientation="both"
        onPointerDown={startPanelResize}
        className={`absolute bottom-0 right-0 z-20 flex h-6 w-6 cursor-nwse-resize items-end justify-end ${
          isResizingPanel ? 'text-cyan-300' : 'text-white/35 hover:text-cyan-200'
        }`}
      >
        <div className="mb-1 mr-1 h-3 w-3 rounded-sm border-b-2 border-r-2 border-current" />
      </div>
    </div>
  );
};

// Default file contents
function getDefaultHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sandbox</title>
</head>
<body>
  <div id="app">
    <h1>Hello, Milla!</h1>
    <p>Edit the code to see changes.</p>
  </div>
</body>
</html>`;
}

function getDefaultCss() {
  return `body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  padding: 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: white;
  min-height: 100vh;
}

#app {
  max-width: 800px;
  margin: 0 auto;
}

h1 {
  background: linear-gradient(90deg, #a855f7, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}`;
}

function getDefaultJs() {
  return `// Welcome to the Sandbox!
// Write your JavaScript code here

console.log('Hello from the Sandbox!');

// Example: Add interactivity
document.querySelector('h1').addEventListener('click', () => {
  console.log('Title clicked!');
  alert('You clicked the title!');
});`;
}

function getDefaultPython() {
  return `# Python Script
# Welcome to the Sandbox IDE!

def greet(name: str) -> str:
    """Return a greeting message."""
    return f"Hello, {name}! Welcome to Milla."

def main():
    print(greet("Developer"))
    
    # Example: List comprehension
    numbers = [1, 2, 3, 4, 5]
    squares = [n ** 2 for n in numbers]
    print(f"Squares: {squares}")

if __name__ == "__main__":
    main()
`;
}

function getDefaultTypeScript() {
  return `// TypeScript Application
// Type-safe code with modern features

interface User {
  id: number;
  name: string;
  email: string;
}

interface Message {
  content: string;
  timestamp: Date;
  sender: User;
}

function createMessage(content: string, sender: User): Message {
  return {
    content,
    timestamp: new Date(),
    sender,
  };
}

const user: User = {
  id: 1,
  name: "Developer",
  email: "dev@milla.ai",
};

const message = createMessage("Hello from TypeScript!", user);
console.log(message);
`;
}

function getDefaultMarkdown() {
  return `# Milla Rayne AI Companion

## Overview
This is the sandbox development environment for Milla Rayne.

## Features
- **AI Chat**: Intelligent conversation with context awareness
- **Voice Integration**: Speech-to-text and text-to-speech
- **Memory System**: Long-term memory and context retention

## Quick Start
\`\`\`bash
npm install
npm run dev
\`\`\`

## API Reference
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/chat | POST | Send a message |
| /api/memory | GET | Retrieve memories |

---
*Built with love by the Milla team*
`;
}

function getDefaultShell() {
  return `#!/bin/bash
# Setup script for Milla Rayne

echo "=== Milla Rayne Setup ==="

# Check Node.js version
if command -v node &> /dev/null; then
    echo "Node.js version: $(node --version)"
else
    echo "Error: Node.js is not installed"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the project
echo "Building project..."
npm run build

# Run tests
echo "Running tests..."
npm test

echo "=== Setup Complete ==="
`;
}

export default Sandbox;
