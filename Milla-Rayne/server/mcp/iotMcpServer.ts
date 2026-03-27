/**
 * IoT MCP Server
 * Exposes Home Assistant, MQTT, and Thermal monitoring as MCP tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { captureToolEvent } from '../services/toolEventBag';
import { haService } from '../services/homeAssistantService';
import { mqttService } from '../services/mqttBrokerService';
import { thermalMonitor } from '../services/thermalMonitorService';

const server = new McpServer({
  name: 'milla-iot-mcp',
  version: '1.0.0',
});

server.registerTool(
  'ha_get_state',
  {
    title: 'Get HA Entity State',
    description: 'Retrieve the current state of a Home Assistant entity.',
    inputSchema: {
      entityId: z.string().describe('Entity ID, e.g. sensor.living_room_temp'),
    },
  },
  async (args) => {
    const t0 = Date.now();
    const state = haService.getState(args.entityId);
    const result = state ? JSON.stringify(state) : `No state found for ${args.entityId}`;
    captureToolEvent({
      name: 'ha_get_state',
      serverId: 'milla-iot-mcp',
      args: { entityId: args.entityId },
      result: result.slice(0, 400),
      durationMs: Date.now() - t0,
    });
    return { content: [{ type: 'text', text: result }] };
  }
);

server.registerTool(
  'ha_call_service',
  {
    title: 'Call HA Service',
    description: 'Call a Home Assistant service (e.g. light.turn_on, fan.turn_off).',
    inputSchema: {
      domain: z.string().describe('Service domain, e.g. light'),
      service: z.string().describe('Service name, e.g. turn_on'),
      data: z.record(z.string(), z.unknown()).optional().describe('Service data payload'),
    },
  },
  async (args) => {
    const t0 = Date.now();
    const serviceData = (args.data as Record<string, unknown>) ?? {};
    const res = await haService.callService(args.domain, args.service, serviceData);
    const result = `Called ${args.domain}.${args.service} → ${JSON.stringify(res)}`;
    captureToolEvent({
      name: 'ha_call_service',
      serverId: 'milla-iot-mcp',
      args: { domain: args.domain, service: args.service, data: serviceData },
      result: result.slice(0, 400),
      durationMs: Date.now() - t0,
    });
    return { content: [{ type: 'text', text: result }] };
  }
);

server.registerTool(
  'ha_list_devices',
  {
    title: 'List HA Devices',
    description: 'List all known Home Assistant entity states.',
    inputSchema: {
      filter: z.string().optional().describe('Optional substring filter on entity IDs'),
    },
  },
  async (args) => {
    const t0 = Date.now();
    const states = await haService.getStates();
    const filtered = args.filter
      ? states.filter(s => s.entity_id.includes(args.filter!))
      : states;
    const result = filtered.map(s => `${s.entity_id}: ${s.state}`).join('\n') || 'No entities found';
    captureToolEvent({
      name: 'ha_list_devices',
      serverId: 'milla-iot-mcp',
      args: { filter: args.filter },
      result: `${filtered.length} entities`,
      durationMs: Date.now() - t0,
    });
    return { content: [{ type: 'text', text: result }] };
  }
);

server.registerTool(
  'mqtt_publish',
  {
    title: 'MQTT Publish',
    description: 'Publish a message to an MQTT topic.',
    inputSchema: {
      topic: z.string().describe('MQTT topic'),
      payload: z.string().describe('Message payload (string or JSON)'),
      qos: z.number().int().min(0).max(2).optional().describe('QoS level (0, 1, or 2)'),
    },
  },
  async (args) => {
    const t0 = Date.now();
    const qos = (args.qos ?? 1) as 0 | 1 | 2;
    await mqttService.publish(args.topic, args.payload, qos);
    captureToolEvent({
      name: 'mqtt_publish',
      serverId: 'milla-iot-mcp',
      args: { topic: args.topic, payloadLen: args.payload.length },
      result: `Published to ${args.topic}`,
      durationMs: Date.now() - t0,
    });
    return { content: [{ type: 'text', text: `Published to ${args.topic}` }] };
  }
);

server.registerTool(
  'mqtt_subscribe_once',
  {
    title: 'MQTT Subscribe Once',
    description: 'Subscribe to an MQTT topic and return the first message received (timeout 10s).',
    inputSchema: {
      topic: z.string().describe('MQTT topic or pattern (supports wildcards)'),
    },
  },
  async (args) => {
    const t0 = Date.now();
    const message = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MQTT subscribe timeout')), 10_000);
      const unsub = mqttService.subscribePattern(args.topic, (_t, payload) => {
        clearTimeout(timeout);
        unsub();
        resolve(payload.toString());
      });
    }).catch(err => `Error: ${(err as Error).message}`);
    captureToolEvent({
      name: 'mqtt_subscribe_once',
      serverId: 'milla-iot-mcp',
      args: { topic: args.topic },
      result: message.slice(0, 400),
      durationMs: Date.now() - t0,
    });
    return { content: [{ type: 'text', text: message }] };
  }
);

server.registerTool(
  'thermal_status',
  {
    title: 'Thermal Status',
    description: 'Get current thermal readings from all monitored sensors.',
    inputSchema: {},
  },
  async () => {
    const t0 = Date.now();
    const status = thermalMonitor.getStatus();
    const result = JSON.stringify(status, null, 2);
    captureToolEvent({
      name: 'thermal_status',
      serverId: 'milla-iot-mcp',
      args: {},
      result: `${Object.keys(status).length} sensors`,
      durationMs: Date.now() - t0,
    });
    return { content: [{ type: 'text', text: result }] };
  }
);

server.registerTool(
  'thermal_set_threshold',
  {
    title: 'Set Thermal Threshold',
    description: 'Update the thermal alert threshold in degrees Celsius.',
    inputSchema: {
      threshold: z.number().min(20).max(120).describe('Temperature threshold in °C'),
    },
  },
  async (args) => {
    const t0 = Date.now();
    thermalMonitor.setThreshold(args.threshold);
    captureToolEvent({
      name: 'thermal_set_threshold',
      serverId: 'milla-iot-mcp',
      args: { threshold: args.threshold },
      result: `Threshold set to ${args.threshold}°C`,
      durationMs: Date.now() - t0,
    });
    return { content: [{ type: 'text', text: `Thermal threshold set to ${args.threshold}°C` }] };
  }
);

export async function startIotMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('[IoT MCP] Server started on stdio');
}

export function getIotTools(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
  return [
    {
      name: 'ha_get_state',
      description: 'Get the current state of a Home Assistant entity',
      parameters: { entityId: { type: 'string', description: 'Entity ID' } },
    },
    {
      name: 'ha_call_service',
      description: 'Call a Home Assistant service',
      parameters: {
        domain: { type: 'string' },
        service: { type: 'string' },
        data: { type: 'object', optional: true },
      },
    },
    {
      name: 'ha_list_devices',
      description: 'List all Home Assistant entities',
      parameters: { filter: { type: 'string', optional: true } },
    },
    {
      name: 'mqtt_publish',
      description: 'Publish a message to an MQTT topic',
      parameters: { topic: { type: 'string' }, payload: { type: 'string' }, qos: { type: 'number', optional: true } },
    },
    {
      name: 'mqtt_subscribe_once',
      description: 'Subscribe to an MQTT topic and return the first message (10s timeout)',
      parameters: { topic: { type: 'string' } },
    },
    {
      name: 'thermal_status',
      description: 'Get current thermal sensor readings',
      parameters: {},
    },
    {
      name: 'thermal_set_threshold',
      description: 'Set the thermal alert threshold in °C',
      parameters: { threshold: { type: 'number' } },
    },
  ];
}
