/**
 * Legacy reference only.
 *
 * This duplicate root-level MCP provider is not the active runtime path.
 * The working MCP integration lives in
 * `Milla-Rayne/server/mcpRuntimeService.ts`.
 *
 * It remains in the repository as historical code and should not be treated
 * as the source of truth for current MCP behavior.
 */
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Transport } from '@modelcontextprotocol/client/shared';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: z.ZodSchema<any>;
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  tools?: McpTool[];
}

export class McpProvider {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, Transport> = new Map();
  private servers: Map<string, McpServerConfig> = new Map();

  async initialize(): Promise<void> {
    const configs = await this.loadServerConfigs();
    for (const config of configs) {
      try {
        await this.connectServer(config);
      } catch (err) {
        console.warn(`Failed to load MCP server ${config.name}:`, err);
      }
    }
  }

  private async loadServerConfigs(): Promise<McpServerConfig[]> {
    return [
      {
        id: 'filesystem',
        name: 'File System Access',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
        tools: [
          {
            name: 'read_file',
            description: 'Read file contents',
            inputSchema: z.object({ path: z.string() })
          },
          {
            name: 'list_directory',
            description: 'List directory contents',
            inputSchema: z.object({ path: z.string() })
          }
        ]
      },
      {
        id: 'github',
        name: 'GitHub Integration',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN || '' }
      },
      {
        id: 'memory',
        name: 'Milla Knowledge Graph',
        command: 'node',
        args: ['./server/mcp/custom/graph-server.js']
      }
    ];
  }

  async connectServer(config: McpServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: config.env
    });

    const client = new Client(
      { name: 'milla-mcp-client', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    await client.connect(transport);
    
    this.clients.set(config.id, client);
    this.transports.set(config.id, transport);
    this.servers.set(config.id, config);

    console.log(`✅ MCP Server connected: ${config.name}`);
    
    const tools = await client.listTools();
    console.log(`   Available tools: ${tools.tools.map((t: any) => t.name).join(', ')}`);
  }

  async executeTool(
    serverId: string, 
    toolName: string, 
    args: Record<string, any>
  ): Promise<any> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    return await client.callTool({
      name: toolName,
      arguments: args
    });
  }

  async getAllTools(): Promise<Array<{ server: string; tool: any }>> {
    const results: Array<{ server: string; tool: any }> = [];
    
    for (const [id, client] of this.clients) {
      try {
        const response = await client.listTools();
        for (const tool of response.tools) {
          results.push({ server: id, tool });
        }
      } catch (e) {
        console.warn(`Failed to list tools for ${id}:`, e);
      }
    }
    
    return results;
  }

  async disconnectAll(): Promise<void> {
    for (const [id, client] of this.clients) {
      await client.close();
      this.clients.delete(id);
    }
  }

  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }
}
