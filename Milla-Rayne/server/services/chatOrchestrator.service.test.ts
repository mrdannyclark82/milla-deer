import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage', () => ({ storage: {} }));
vi.mock('../weatherService', () => ({
  getCurrentWeather: vi.fn(),
  formatWeatherResponse: vi.fn(),
}));
vi.mock('../searchService', () => ({
  performWebSearch: vi.fn(),
  shouldPerformSearch: vi.fn(() => false),
}));
vi.mock('../imageService', () => ({
  generateImage: vi.fn(),
  formatImageResponse: vi.fn(),
  extractImagePrompt: vi.fn(() => null),
}));
vi.mock('../veniceImageService', () => ({ generateImageWithVenice: vi.fn() }));
vi.mock('../memoryService', () => ({
  searchKnowledge: vi.fn(),
  updateMemories: vi.fn(),
}));
vi.mock('../memoryBrokerService', () => ({
  getMemoryBrokerContext: vi.fn(async () => ({
    context: 'Recent web conversation:\n- Danny: remembered context',
    sections: {
      recentConversation: '- Danny: remembered context',
      crossChannelSignals: '',
      profile: '',
      summaries: '',
      relationshipMemory: '',
      semanticMemory: '',
    },
  })),
}));
vi.mock('../visualMemoryService', () => ({
  getVisualMemories: vi.fn(),
  getEmotionalContext: vi.fn(),
}));
vi.mock('../proactiveService', () => ({
  detectEnvironmentalContext: vi.fn(),
}));
vi.mock('../aiDispatcherService', () => ({
  dispatchAIResponse: vi.fn(),
}));
vi.mock('../youtubeAnalysisService', () => ({
  analyzeYouTubeVideo: vi.fn(),
}));
vi.mock('../repositoryAnalysisService', () => ({
  parseGitHubUrl: vi.fn(),
  fetchRepositoryData: vi.fn(),
  generateRepositoryAnalysis: vi.fn(),
}));
vi.mock('../repositoryModificationService', () => ({
  generateRepositoryImprovements: vi.fn(),
  applyRepositoryImprovements: vi.fn(),
}));
vi.mock('../browserIntegrationService', () => ({
  detectBrowserToolRequest: vi.fn(),
  getBrowserToolInstructions: vi.fn(),
  addCalendarEvent: vi.fn(),
  getRecentEmails: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock('../openrouterCodeService', () => ({
  generateCodeWithQwen: vi.fn(),
  formatCodeResponse: vi.fn(),
  extractCodeRequest: vi.fn(() => null),
}));
vi.mock('./repositoryCache.service', () => ({
  repositoryCache: new Map(),
}));
vi.mock('../sanitization', () => ({
  sanitizePromptInput: vi.fn((value: string) => value),
}));
vi.mock('../profileService', () => ({
  getProfile: vi.fn(async () => null),
}));
vi.mock('../commandParser', () => ({
  parseCommand: vi.fn(async () => ({ service: null, action: null, entities: {} })),
}));
vi.mock('../googleTasksService', () => ({
  addNoteToGoogleTasks: vi.fn(),
  completeTask: vi.fn(),
  deleteTask: vi.fn(),
  listTasks: vi.fn(),
}));
vi.mock('../consciousnessScheduler', () => ({
  getConsciousnessSchedulerStatus: vi.fn(),
  triggerConsciousnessCycle: vi.fn(),
}));
vi.mock('../repositoryDiscoveryScheduler', () => ({
  getRepositoryDiscoverySchedulerStatus: vi.fn(),
  runRepositoryDiscoveryCycle: vi.fn(),
}));
vi.mock('../shellExecutionService', () => ({
  enqueueAllowedShellCommand: vi.fn(),
  cancelShellCommand: vi.fn(),
  getShellRunnerStatus: vi.fn(),
}));
vi.mock('../mcpRuntimeService', () => ({
  getMcpRuntimeStatus: vi.fn(),
  listMcpTools: vi.fn(),
  invokeMcpTool: vi.fn(),
}));

import { dispatchAIResponse } from '../aiDispatcherService';
import { parseCommand } from '../commandParser';
import { listTasks } from '../googleTasksService';
import { triggerConsciousnessCycle } from '../consciousnessScheduler';
import {
  enqueueAllowedShellCommand,
  getShellRunnerStatus,
} from '../shellExecutionService';
import {
  getMcpRuntimeStatus,
  invokeMcpTool,
  listMcpTools,
} from '../mcpRuntimeService';
import { generateAIResponse } from './chatOrchestrator.service';

describe('chatOrchestrator provider fallback handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.XAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('retries with stripped prompt before giving up when a provider is configured', async () => {
    vi.mocked(dispatchAIResponse)
      .mockResolvedValueOnce({
        success: false,
        content: '',
        error: 'Provider overload',
      })
      .mockResolvedValueOnce({
        success: true,
        content: 'Live provider reply',
      });

    const response = await generateAIResponse(
      'Hey Milla, tell me something nice',
      [],
      'Danny Ray',
      undefined,
      'default-user'
    );

    expect(response.content).toBe('Live provider reply');
    expect(dispatchAIResponse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dispatchAIResponse).mock.calls[1][0]).toBe(
      'Hey Milla, tell me something nice'
    );
  });

  it('returns a transparent provider error instead of memory fallback when configured providers fail', async () => {
    vi.mocked(dispatchAIResponse).mockResolvedValue({
      success: false,
      content: '',
      error: 'Provider unavailable',
    });

    const response = await generateAIResponse(
      'Tell me something interesting',
      [],
      'Danny Ray',
      undefined,
      'default-user'
    );

    expect(response.content).toContain('live AI provider');
    expect(response.content).not.toContain("That's interesting, Danny Ray");
    expect(dispatchAIResponse).toHaveBeenCalledTimes(2);
  });

  it('handles Google Tasks list requests through natural language parsing', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'tasks',
      action: 'list',
      entities: {},
    } as any);
    vi.mocked(listTasks).mockResolvedValue({
      success: true,
      message: 'ok',
      tasks: [{ title: 'Ship update', status: 'needsAction' }],
    } as any);

    const response = await generateAIResponse(
      'show my tasks',
      [],
      'Danny Ray',
      undefined,
      'default-user'
    );

    expect(response.content).toContain('Here are your current tasks');
    expect(response.content).toContain('Ship update');
  });

  it('triggers consciousness cycles from natural language commands', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'consciousness',
      action: 'trigger',
      entities: { cycle: 'gim' },
    } as any);
    vi.mocked(triggerConsciousnessCycle).mockResolvedValue(true);

    const response = await generateAIResponse(
      'run the gim cycle',
      [],
      'Danny Ray',
      undefined,
      'default-user'
    );

    expect(response.content).toContain('triggered the GIM cycle');
  });

  it('queues approved shell commands when admin capability is present', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'shell',
      action: 'run',
      entities: { commandId: 'workspace-check' },
    } as any);
    vi.mocked(enqueueAllowedShellCommand).mockResolvedValue({
      runId: 'run-1',
      commandId: 'workspace-check',
      label: 'Workspace check',
      command: 'npm run check',
      status: 'queued',
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
    });

    const response = await generateAIResponse(
      'run workspace check',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(enqueueAllowedShellCommand).toHaveBeenCalledWith('workspace-check');
    expect(response.content).toContain('Queued Workspace check');
  });

  it('queues adb devices through the approved shell runner', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'shell',
      action: 'run',
      entities: { commandId: 'adb-devices' },
    } as any);
    vi.mocked(enqueueAllowedShellCommand).mockResolvedValue({
      runId: 'run-adb',
      commandId: 'adb-devices',
      label: 'ADB devices',
      command: 'adb devices -l',
      status: 'queued',
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
    });

    const response = await generateAIResponse(
      'adb devices',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(enqueueAllowedShellCommand).toHaveBeenCalledWith('adb-devices');
    expect(response.content).toContain('Queued ADB devices');
  });

  it('blocks shell commands without admin capability', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'shell',
      action: 'run',
      entities: { commandId: 'workspace-check' },
    } as any);

    const response = await generateAIResponse(
      'run workspace check',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: false }
    );

    expect(response.content).toContain('admin-protected');
    expect(enqueueAllowedShellCommand).not.toHaveBeenCalled();
  });

  it('returns shell status when admin capability is present', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'shell',
      action: 'status',
      entities: {},
    } as any);
    vi.mocked(getShellRunnerStatus).mockReturnValue({
      enabled: true,
      requiresAdminToken: true,
      activeRunId: null,
      queuedRunIds: [],
      queueLength: 0,
      availableCommands: [],
      activeRun: null,
      queuedRuns: [],
      recentRuns: [],
    });

    const response = await generateAIResponse(
      'shell status',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(response.content).toContain('Shell runner: enabled');
  });

  it('returns MCP runtime status without invoking the model path', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'status',
      entities: {},
    } as any);
    vi.mocked(getMcpRuntimeStatus).mockReturnValue({
      enabled: true,
      initialized: true,
      initializedAt: Date.now(),
      connectedServerCount: 1,
      servers: [
        {
          id: 'huggingface',
          name: 'Hugging Face MCP',
          enabled: true,
          configured: true,
          connected: true,
          command: 'node',
          args: [],
          transport: 'stdio',
          toolCount: 2,
          tools: ['generate_image', 'generate_story'],
          lastError: null,
        },
      ],
    } as any);

    const response = await generateAIResponse(
      'mcp status',
      [],
      'Danny Ray',
      undefined,
      'default-user'
    );

    expect(response.content).toContain('MCP runtime: enabled');
    expect(response.content).toContain('Hugging Face MCP: connected');
  });

  it('lists MCP tools when admin capability is present', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'list',
      entities: {},
    } as any);
    vi.mocked(listMcpTools).mockResolvedValue([
      {
        serverId: 'huggingface',
        serverName: 'Hugging Face MCP',
        name: 'generate_story',
        description: 'Generate a story based on a prompt',
      },
    ] as any);

    const response = await generateAIResponse(
      'list mcp tools',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(listMcpTools).toHaveBeenCalled();
    expect(response.content).toContain('Here are the connected MCP tools');
    expect(response.content).toContain('generate_story');
  });

  it('blocks MCP tool listing without admin capability', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'list',
      entities: {},
    } as any);

    const response = await generateAIResponse(
      'list mcp tools',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: false }
    );

    expect(response.content).toContain('admin-protected');
    expect(listMcpTools).not.toHaveBeenCalled();
  });

  it('invokes the MCP story tool and returns text output', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'run',
      entities: {
        toolName: 'generate_story',
        prompt: 'a lunar deer colony',
      },
    } as any);
    vi.mocked(listMcpTools).mockResolvedValue([
      {
        serverId: 'huggingface',
        serverName: 'Hugging Face MCP',
        name: 'generate_story',
        description: 'Generate a story based on a prompt',
      },
    ] as any);
    vi.mocked(invokeMcpTool).mockResolvedValue({
      serverId: 'huggingface',
      toolName: 'generate_story',
      result: {
        content: [{ type: 'text', text: 'Once upon a time on the moon...' }],
      },
    } as any);

    const response = await generateAIResponse(
      'generate a story with mcp about a lunar deer colony',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(invokeMcpTool).toHaveBeenCalledWith(
      'huggingface',
      'generate_story',
      { prompt: 'a lunar deer colony' }
    );
    expect(response.content).toContain('I ran the MCP story tool for you.');
    expect(response.content).toContain('Once upon a time on the moon...');
  });

  it('invokes MCP browser navigation from natural-language routing', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'run',
      entities: {
        toolName: 'browser_navigate',
        url: 'https://github.com',
      },
    } as any);
    vi.mocked(listMcpTools).mockResolvedValue([
      {
        serverId: 'playwright',
        serverName: 'Playwright MCP',
        name: 'browser_navigate',
        description: 'Navigate to a URL',
      },
    ] as any);
    vi.mocked(invokeMcpTool).mockResolvedValue({
      serverId: 'playwright',
      toolName: 'browser_navigate',
      result: {
        content: [{ type: 'text', text: 'Navigated to https://github.com' }],
      },
    } as any);

    const response = await generateAIResponse(
      'open github.com in the browser',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(invokeMcpTool).toHaveBeenCalledWith('playwright', 'browser_navigate', {
      url: 'https://github.com',
    });
    expect(response.content).toContain('I ran the MCP tool "browser_navigate" for you.');
    expect(response.content).toContain('Navigated to https://github.com');
  });

  it('invokes MCP code review from natural-language routing', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'run',
      entities: {
        toolName: 'codeReview',
        baseBranch: 'main',
      },
    } as any);
    vi.mocked(listMcpTools).mockResolvedValue([
      {
        serverId: 'code-review',
        serverName: 'Code Review MCP',
        name: 'codeReview',
        description: 'Review local git diff',
      },
    ] as any);
    vi.mocked(invokeMcpTool).mockResolvedValue({
      serverId: 'code-review',
      toolName: 'codeReview',
      result: {
        content: [{ type: 'text', text: 'Reviewed diff against main.' }],
      },
    } as any);

    const response = await generateAIResponse(
      'review my changes',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(invokeMcpTool).toHaveBeenCalledWith('code-review', 'codeReview', {
      folderPath: process.cwd(),
      baseBranch: 'main',
    });
    expect(response.content).toContain('Reviewed diff against main.');
  });

  it('invokes MCP git status from natural-language routing', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'run',
      entities: {
        toolName: 'git-status',
      },
    } as any);
    vi.mocked(listMcpTools).mockResolvedValue([
      {
        serverId: 'github',
        serverName: 'GitHub MCP',
        name: 'git-status',
        description: 'Displays repository status',
      },
    ] as any);
    vi.mocked(invokeMcpTool).mockResolvedValue({
      serverId: 'github',
      toolName: 'git-status',
      result: {
        content: [{ type: 'text', text: 'Working tree clean.' }],
      },
    } as any);

    const response = await generateAIResponse(
      'check repository status',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(invokeMcpTool).toHaveBeenCalledWith('github', 'git-status', {
      directory: process.cwd(),
    });
    expect(response.content).toContain('Working tree clean.');
  });

  it('invokes MCP file writes from natural-language routing', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'run',
      entities: {
        toolName: 'write_file',
        path: 'notes.txt',
        content: 'hello world',
      },
    } as any);
    vi.mocked(listMcpTools).mockResolvedValue([
      {
        serverId: 'filesystem',
        serverName: 'Filesystem MCP',
        name: 'write_file',
        description: 'Write a file',
      },
    ] as any);
    vi.mocked(invokeMcpTool).mockResolvedValue({
      serverId: 'filesystem',
      toolName: 'write_file',
      result: {
        content: [{ type: 'text', text: 'Successfully wrote to notes.txt' }],
      },
    } as any);

    const response = await generateAIResponse(
      'create file notes.txt with content hello world',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(invokeMcpTool).toHaveBeenCalledWith('filesystem', 'write_file', {
      path: 'notes.txt',
      content: 'hello world',
    });
    expect(response.content).toContain('Successfully wrote to notes.txt');
  });

  it('invokes Pollinations text generation from natural-language routing', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      service: 'mcp',
      action: 'run',
      entities: {
        toolName: 'generateText',
        prompt: 'a glowing cyber forest',
      },
    } as any);
    vi.mocked(listMcpTools).mockResolvedValue([
      {
        serverId: 'pollinations',
        serverName: 'Pollinations MCP',
        name: 'generateText',
        description: 'Generate text from a prompt',
      },
    ] as any);
    vi.mocked(invokeMcpTool).mockResolvedValue({
      serverId: 'pollinations',
      toolName: 'generateText',
      result: {
        content: [{ type: 'text', text: 'The forest hummed with neon life.' }],
      },
    } as any);

    const response = await generateAIResponse(
      'generate text with pollinations about a glowing cyber forest',
      [],
      'Danny Ray',
      undefined,
      'default-user',
      undefined,
      false,
      { canRunShellCommands: true }
    );

    expect(invokeMcpTool).toHaveBeenCalledWith(
      'pollinations',
      'generateText',
      { prompt: 'a glowing cyber forest' }
    );
    expect(response.content).toContain('The forest hummed with neon life.');
  });

});
