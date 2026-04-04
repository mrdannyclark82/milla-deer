/**
 * Computer Use MCP Server
 *
 * Exposes computer use tools (screenshot, navigate, click, type, key press,
 * scroll, mouse move, find element, analyze screen) as MCP tools over stdio.
 *
 * Usage:
 *   tsx server/mcp/custom/computerUse-server.ts
 *   # or after build:
 *   node dist/computerUseMcpServer.js
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  screenshot,
  navigate,
  click,
  typeText,
  pressKey,
  scroll,
  moveMouse,
  findElement,
  analyzeScreen,
  getPageInfo,
  closeBrowser,
} from '../../services/computerUseService.js';

const server = new Server(
  { name: 'computer-use', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'screenshot',
      description: 'Take a screenshot of the current browser page or a given URL.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Optional URL to navigate to before screenshotting' },
        },
      },
    },
    {
      name: 'navigate',
      description: 'Navigate the managed browser to a URL.',
      inputSchema: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'URL to open' },
        },
      },
    },
    {
      name: 'click',
      description: 'Click at pixel coordinates or a CSS selector.',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate (used when selector is not provided)' },
          y: { type: 'number', description: 'Y coordinate (used when selector is not provided)' },
          selector: { type: 'string', description: 'CSS selector to click' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button' },
        },
      },
    },
    {
      name: 'type_text',
      description: 'Type text into the focused element or a CSS selector.',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to type' },
          selector: { type: 'string', description: 'Optional CSS selector to focus first' },
          clearFirst: { type: 'boolean', description: 'Clear the field before typing' },
        },
      },
    },
    {
      name: 'press_key',
      description: 'Press a keyboard key (e.g. "Enter", "Tab", "Escape", "Control+a").',
      inputSchema: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: 'Key name or combo (Playwright key syntax)' },
        },
      },
    },
    {
      name: 'scroll',
      description: 'Scroll the page or an element.',
      inputSchema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
          amount: { type: 'number', description: 'Scroll amount in pixels (default 300)' },
          selector: { type: 'string', description: 'CSS selector of element to scroll' },
        },
      },
    },
    {
      name: 'move_mouse',
      description: 'Move the mouse cursor to a pixel coordinate.',
      inputSchema: {
        type: 'object',
        required: ['x', 'y'],
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
      },
    },
    {
      name: 'find_element',
      description: 'Locate a DOM element by CSS selector and return its bounding box.',
      inputSchema: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
        },
      },
    },
    {
      name: 'analyze_screen',
      description: 'Take a screenshot and return an AI-generated description of the visible content.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Optional URL to navigate to first' },
        },
      },
    },
    {
      name: 'get_page_info',
      description: 'Get the current page URL and title.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'close_browser',
      description: 'Close the managed browser session.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {
    case 'screenshot': {
      const result = await screenshot((args as { url?: string }).url);
      return {
        content: [
          { type: 'text', text: result.success ? `Screenshot captured (${result.width}x${result.height})` : result.error ?? 'Failed' },
          ...(result.dataUrl ? [{ type: 'image', data: result.dataUrl.replace(/^data:[^;]+;base64,/, ''), mimeType: 'image/png' }] : []),
        ],
      };
    }

    case 'navigate': {
      const result = await navigate((args as { url: string }).url);
      return { content: [{ type: 'text', text: result.success ? `Navigated to: ${result.url} — "${result.title}"` : result.error ?? 'Failed' }] };
    }

    case 'click': {
      const a = args as { x?: number; y?: number; selector?: string; button?: 'left' | 'right' | 'middle' };
      const result = typeof a.selector === 'string'
        ? await click(a.selector, undefined, a.button)
        : await click(a.x ?? 0, a.y ?? 0, a.button);
      return { content: [{ type: 'text', text: result.success ? 'Click successful' : result.error ?? 'Failed' }] };
    }

    case 'type_text': {
      const a = args as { text: string; selector?: string; clearFirst?: boolean };
      const result = await typeText(a.text, a.selector, a.clearFirst);
      return { content: [{ type: 'text', text: result.success ? `Typed: "${result.text}"` : result.error ?? 'Failed' }] };
    }

    case 'press_key': {
      const result = await pressKey((args as { key: string }).key);
      return { content: [{ type: 'text', text: result.success ? 'Key pressed' : result.error ?? 'Failed' }] };
    }

    case 'scroll': {
      const a = args as { direction?: 'up' | 'down' | 'left' | 'right'; amount?: number; selector?: string };
      const result = await scroll(a.direction, a.amount, a.selector);
      return { content: [{ type: 'text', text: result.success ? `Scrolled ${result.direction} ${result.amount}px` : result.error ?? 'Failed' }] };
    }

    case 'move_mouse': {
      const a = args as { x: number; y: number };
      const result = await moveMouse(a.x, a.y);
      return { content: [{ type: 'text', text: result.success ? `Mouse moved to (${result.x}, ${result.y})` : result.error ?? 'Failed' }] };
    }

    case 'find_element': {
      const result = await findElement((args as { selector: string }).selector);
      const box = result.boundingBox;
      const boxStr = box ? ` at (${box.x}, ${box.y}) ${box.width}x${box.height}` : '';
      return { content: [{ type: 'text', text: result.success ? (result.found ? `Found${boxStr}` : 'Not found') : result.error ?? 'Failed' }] };
    }

    case 'analyze_screen': {
      const result = await analyzeScreen((args as { url?: string }).url);
      return {
        content: [
          { type: 'text', text: result.description ?? result.error ?? 'No description' },
          ...(result.screenshot ? [{ type: 'image', data: result.screenshot.replace(/^data:[^;]+;base64,/, ''), mimeType: 'image/png' }] : []),
        ],
      };
    }

    case 'get_page_info': {
      const result = await getPageInfo();
      return { content: [{ type: 'text', text: result.success ? `URL: ${result.url}\nTitle: ${result.title}` : result.error ?? 'Failed' }] };
    }

    case 'close_browser': {
      await closeBrowser();
      return { content: [{ type: 'text', text: 'Browser closed' }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
