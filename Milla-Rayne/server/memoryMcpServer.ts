import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getBrokerMemoryContextTool,
  getMemorySummaryTool,
  listRecentMessagesTool,
  searchStoredMessagesTool,
} from './memoryMcpTools';

const server = new McpServer({
  name: 'milla-memory-mcp',
  version: '1.0.0',
});

server.registerTool(
  'getBrokerMemoryContext',
  {
    title: 'Get Broker Memory Context',
    description:
      'Retrieve broker-built memory context combining recent conversation, cross-channel history, summaries, profile, and semantic memory.',
    inputSchema: {
      query: z.string().describe('The question or topic to retrieve memory context for'),
      userId: z.string().optional().describe('User identifier (defaults to default-user)'),
      activeChannel: z
        .string()
        .optional()
        .describe('Preferred active channel context, such as web or gmail'),
    },
  },
  async (args) => ({
    content: [{ type: 'text', text: await getBrokerMemoryContextTool(args) }],
  })
);

server.registerTool(
  'searchStoredMessages',
  {
    title: 'Search Stored Messages',
    description:
      'Search canonical stored messages across channels using a simple relevance match.',
    inputSchema: {
      query: z.string().describe('Search query'),
      userId: z.string().optional().describe('User identifier (defaults to default-user)'),
      channel: z.string().optional().describe('Optional channel filter such as web or gmail'),
      limit: z.number().optional().describe('Maximum number of matches to return'),
    },
  },
  async (args) => ({
    content: [{ type: 'text', text: await searchStoredMessagesTool(args) }],
  })
);

server.registerTool(
  'listRecentMessages',
  {
    title: 'List Recent Messages',
    description:
      'List recent canonical messages, optionally scoped to a specific channel.',
    inputSchema: {
      userId: z.string().optional().describe('User identifier (defaults to default-user)'),
      channel: z.string().optional().describe('Optional channel filter such as web or gmail'),
      limit: z.number().optional().describe('Maximum number of recent messages to return'),
    },
  },
  async (args) => ({
    content: [{ type: 'text', text: await listRecentMessagesTool(args) }],
  })
);

server.registerTool(
  'searchMemorySummaries',
  {
    title: 'Search Memory Summaries',
    description:
      'Search saved memory summaries for higher-level recap information.',
    inputSchema: {
      query: z.string().describe('Search query for memory summaries'),
      userId: z.string().optional().describe('User identifier (defaults to default-user)'),
      limit: z.number().optional().describe('Maximum number of summaries to return'),
    },
  },
  async (args) => ({
    content: [{ type: 'text', text: await getMemorySummaryTool(args) }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
