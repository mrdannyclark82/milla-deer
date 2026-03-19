import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config, getGitHubToken } from './config';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

interface ManagedServerState {
  id: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  command: string | null;
  args: string[];
  transport: 'stdio';
  toolCount: number;
  tools: string[];
  lastError: string | null;
}

interface ManagedServerRuntime {
  state: ManagedServerState;
  env?: Record<string, string>;
  cwd?: string;
  client?: Client;
  transportHandle?: StdioClientTransport;
}

interface ManagedServerDefinition {
  id: string;
  name: string;
  binaryCandidates: string[];
  defaultArgs?: string[];
  resolveCommand?: () => {
    command: string | null;
    args: string[];
  };
  requiredEnv?: () => string | undefined;
  buildEnv?: () => Record<string, string>;
  missingRequirementMessage?: string;
  missingCommandMessage?: string;
}

export interface McpToolDescriptor {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolInvocationResult {
  serverId: string;
  toolName: string;
  result: unknown;
}

export interface McpRuntimeStatus {
  enabled: boolean;
  initialized: boolean;
  initializedAt: number | null;
  connectedServerCount: number;
  servers: ManagedServerState[];
}

const runtime = {
  initialized: false,
  initializedAt: null as number | null,
  servers: new Map<string, ManagedServerRuntime>(),
};

function resolveLocalBinary(binaryName: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules', '.bin', binaryName),
    path.resolve(process.cwd(), '..', 'node_modules', '.bin', binaryName),
    path.resolve(MODULE_DIR, '..', 'node_modules', '.bin', binaryName),
    path.resolve(MODULE_DIR, '..', '..', 'node_modules', '.bin', binaryName),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveLocalBinaryCandidate(binaryNames: string[]): string | null {
  for (const binaryName of binaryNames) {
    const resolved = resolveLocalBinary(binaryName);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function parseCommandArgs(value?: string): string[] {
  const normalized = value?.trim();
  if (!normalized) {
    return [];
  }

  if (normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed;
      }
    } catch {
      return [];
    }
  }

  return normalized.split(/\s+/).filter(Boolean);
}

function resolveServerCommand(definition: ManagedServerDefinition): {
  command: string | null;
  args: string[];
} {
  const envPrefix = `MCP_${definition.id.replace(/-/g, '_').toUpperCase()}`;
  const overrideCommand = process.env[`${envPrefix}_COMMAND`]?.trim();
  const overrideArgs = parseCommandArgs(process.env[`${envPrefix}_ARGS`]);

  if (overrideCommand) {
    return {
      command: overrideCommand,
      args: overrideArgs,
    };
  }

  const resolvedCommand = definition.resolveCommand?.();
  if (resolvedCommand) {
    return resolvedCommand;
  }

  const localBinary = resolveLocalBinaryCandidate(definition.binaryCandidates);
  if (!localBinary) {
    return {
      command: null,
      args: [],
    };
  }

  return {
    command: localBinary,
    args: definition.defaultArgs || [],
  };
}

function createServerStates(): ManagedServerRuntime[] {
  const definitions: ManagedServerDefinition[] = [
    {
      id: 'huggingface',
      name: 'Hugging Face MCP',
      binaryCandidates: ['huggingface-mcp-server'],
      defaultArgs: ['--transport', 'stdio'],
      requiredEnv: () => config.huggingface.apiKey,
      buildEnv: () => ({
        HUGGINGFACE_API_KEY: config.huggingface.apiKey || '',
        HUGGINGFACE_MODEL: config.huggingface.model || 'stabilityai/stable-diffusion-2-1',
      }),
      missingRequirementMessage: 'Hugging Face API key is not configured.',
      missingCommandMessage: 'huggingface-mcp-server binary is not installed locally.',
    },
    {
      id: 'playwright',
      name: 'Playwright MCP',
      binaryCandidates: ['mcp-server-playwright', '@automatalabs/mcp-server-playwright'],
      missingCommandMessage:
        'Playwright MCP is not installed locally. Set MCP_PLAYWRIGHT_COMMAND or install a Playwright MCP server.',
    },
    {
      id: 'code-review',
      name: 'Code Review MCP',
      binaryCandidates: ['code-review-mcp-server'],
      missingCommandMessage:
        'Code review MCP is not installed locally. Set MCP_CODE_REVIEW_COMMAND when you choose a review server package.',
    },
    {
      id: 'github',
      name: 'GitHub MCP',
      binaryCandidates: ['github-mcp-server-mcp', 'github-mcp-server'],
      requiredEnv: () => getGitHubToken(),
      buildEnv: () => {
        const token = getGitHubToken() || '';
        return {
          GITHUB_TOKEN: token,
          GITHUB_ACCESS_TOKEN: token,
        };
      },
      missingRequirementMessage: 'GitHub token is not configured.',
      missingCommandMessage:
        'GitHub MCP is not installed locally. Set MCP_GITHUB_COMMAND or install a GitHub MCP server.',
    },
    {
      id: 'filesystem',
      name: 'Filesystem/Search MCP',
      binaryCandidates: ['mcp-server-filesystem', 'server-filesystem'],
      defaultArgs: [process.cwd()],
      missingCommandMessage:
        'Filesystem MCP is not installed locally. Set MCP_FILESYSTEM_COMMAND or install a filesystem MCP server.',
    },
    {
      id: 'pollinations',
      name: 'Pollinations MCP',
      binaryCandidates: ['pollinations-mcp', 'pollinations-mcp-server'],
      missingCommandMessage:
        'Pollinations MCP is not installed locally. Set MCP_POLLINATIONS_COMMAND or install a Pollinations MCP server.',
    },
    {
      id: 'memory',
      name: 'Memory/RAG MCP',
      binaryCandidates: [],
      resolveCommand: () => {
        const builtServerPath = path.resolve(process.cwd(), 'dist', 'memoryMcpServer.js');
        if (existsSync(builtServerPath)) {
          return {
            command: process.execPath,
            args: [builtServerPath],
          };
        }

        const tsxBinary = resolveLocalBinary('tsx');
        const sourceServerPath = path.resolve(MODULE_DIR, 'memoryMcpServer.ts');
        if (tsxBinary && existsSync(sourceServerPath)) {
          return {
            command: tsxBinary,
            args: [sourceServerPath],
          };
        }

        return {
          command: null,
          args: [],
        };
      },
      missingCommandMessage:
        'Memory/RAG MCP local server could not be resolved. Ensure tsx is installed or build the server bundle first.',
    },
  ];

  return definitions.map((definition) => {
    const requirement = definition.requiredEnv?.();
    const { command, args } = resolveServerCommand(definition);
    const configured = Boolean(config.mcp.enabled && (!definition.requiredEnv || requirement) && command);

    return {
      state: {
        id: definition.id,
        name: definition.name,
        enabled: config.mcp.enabled,
        configured,
        connected: false,
        command,
        args,
        transport: 'stdio',
        toolCount: 0,
        tools: [],
        lastError: !config.mcp.enabled
          ? 'MCP runtime is disabled.'
          : definition.requiredEnv && !requirement
            ? definition.missingRequirementMessage || 'Required configuration is missing.'
            : !command
              ? definition.missingCommandMessage || 'MCP server command is not configured.'
              : null,
      },
      env: definition.buildEnv?.() || {},
      cwd: process.env[
        `MCP_${definition.id.replace(/-/g, '_').toUpperCase()}_CWD`
      ]?.trim() || process.cwd(),
      client: undefined,
      transportHandle: undefined,
    };
  });
}

export async function initializeMcpRuntime(): Promise<void> {
  runtime.servers.clear();

  const servers = createServerStates();
  for (const server of servers) {
    runtime.servers.set(server.state.id, server);
  }

  if (!config.mcp.enabled) {
    runtime.initialized = true;
    runtime.initializedAt = Date.now();
    return;
  }

  for (const server of servers) {
    if (!server.state.configured || !server.state.command) {
      continue;
    }

    const transport = new StdioClientTransport({
      command: server.state.command,
      args: server.state.args,
      env: {
        ...process.env,
        ...server.env,
      } as Record<string, string>,
      stderr: 'pipe',
      cwd: server.cwd || process.cwd(),
    });

    const client = new Client(
      { name: 'milla-rayne-mcp-runtime', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    try {
      await client.connect(transport);
      const listedTools = await client.listTools();

      server.client = client;
      server.transportHandle = transport;
      server.state.connected = true;
      server.state.toolCount = listedTools.tools.length;
      server.state.tools = listedTools.tools.map((tool) => tool.name);
      server.state.lastError = null;
    } catch (error) {
      server.state.connected = false;
      server.state.toolCount = 0;
      server.state.tools = [];
      server.state.lastError =
        error instanceof Error ? error.message : 'Unknown MCP initialization error.';

      try {
        await transport.close();
      } catch {
        // Ignore transport cleanup failures after initialization errors.
      }
    }
  }

  runtime.initialized = true;
  runtime.initializedAt = Date.now();
}

export function getMcpRuntimeStatus(): McpRuntimeStatus {
  const servers = Array.from(runtime.servers.values()).map(({ state }) => ({ ...state }));
  const connectedServerCount = servers.filter((server) => server.connected).length;

  return {
    enabled: config.mcp.enabled,
    initialized: runtime.initialized,
    initializedAt: runtime.initializedAt,
    connectedServerCount,
    servers,
  };
}

export async function listMcpTools(serverId?: string): Promise<McpToolDescriptor[]> {
  const runtimes = Array.from(runtime.servers.values()).filter(
    (server) =>
      server.state.connected &&
      server.client &&
      (!serverId || server.state.id === serverId)
  );

  const tools = await Promise.all(
    runtimes.map(async (server) => {
      const result = await server.client!.request(
        {
          method: 'tools/list',
          params: {},
        },
        ListToolsResultSchema
      );

      return result.tools.map((tool) => ({
        serverId: server.state.id,
        serverName: server.state.name,
        name: tool.name,
        description: tool.description,
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === 'object'
            ? (tool.inputSchema as Record<string, unknown>)
            : undefined,
      }));
    })
  );

  return tools.flat();
}

export async function invokeMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<McpToolInvocationResult> {
  const server = runtime.servers.get(serverId);
  if (!server?.state.connected || !server.client) {
    throw new Error(`MCP server "${serverId}" is not connected.`);
  }

  const result = await server.client.request(
    {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    },
    CallToolResultSchema
  );

  return {
    serverId,
    toolName,
    result,
  };
}
