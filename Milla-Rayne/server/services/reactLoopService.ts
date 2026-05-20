/**
 * ReAct Loop Service
 * Gemini-powered Reasoning + Acting loop for autonomous IoT decision making.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { haService } from './homeAssistantService';
import { mqttService } from './mqttBrokerService';
import { thermalMonitor } from './thermalMonitorService';

export interface ReactStep {
  thought: string;
  action: string;
  actionInput: unknown;
  observation: string;
}

export interface ReactContext {
  observation: string;
  availableTools: string[];
  history: ReactStep[];
  maxSteps: number;
}

interface ToolMap {
  [name: string]: (input: unknown) => Promise<string>;
}

const FLASH_MODEL = 'gemini-2.0-flash';
const DEEP_MODEL = 'gemini-2.5-flash';

export class ReactLoopService {
  private monitorTimer: ReturnType<typeof setInterval> | null = null;

  private buildTools(): ToolMap {
    return {
      ha_get_state: async (input) => {
        const entityId = (input as { entityId: string }).entityId;
        const state = haService.getState(entityId);
        return state ? JSON.stringify(state) : `No state found for ${entityId}`;
      },
      ha_call_service: async (input) => {
        const { domain, service, data } = input as { domain: string; service: string; data?: Record<string, unknown> };
        const result = await haService.callService(domain, service, data || {});
        return `Service called: ${domain}.${service} → ${JSON.stringify(result)}`;
      },
      ha_list_devices: async () => {
        const states = await haService.getStates();
        return states.map(s => `${s.entity_id}: ${s.state}`).join('\n');
      },
      mqtt_publish: async (input) => {
        const { topic, payload } = input as { topic: string; payload: string };
        await mqttService.publish(topic, payload, 1);
        return `Published to ${topic}`;
      },
      thermal_status: async () => {
        return JSON.stringify(thermalMonitor.getStatus());
      },
      thermal_set_threshold: async (input) => {
        const { threshold } = input as { threshold: number };
        thermalMonitor.setThreshold(threshold);
        return `Threshold set to ${threshold}°C`;
      },
    };
  }

  async reason(context: ReactContext, mode: 'flash' | 'deep'): Promise<ReactStep[]> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: mode === 'deep' ? DEEP_MODEL : FLASH_MODEL,
      generationConfig: {
        maxOutputTokens: mode === 'deep' ? 65536 : 8192,
        temperature: 0.2,
      },
    });

    const tools = this.buildTools();
    const steps: ReactStep[] = [...context.history];

    const systemPrompt = `You are an autonomous IoT agent using the ReAct (Reason + Act) framework.
Available tools: ${context.availableTools.join(', ')}
For each step, output JSON in this format:
{"thought": "<your reasoning>", "action": "<tool_name or FINISH>", "actionInput": <json_input>}
When done, use action "FINISH" with actionInput: {"answer": "<final answer>"}.`;

    let currentObservation = context.observation;

    for (let step = 0; step < context.maxSteps; step++) {
      const historyText = steps.map(s =>
        `Thought: ${s.thought}\nAction: ${s.action}(${JSON.stringify(s.actionInput)})\nObservation: ${s.observation}`
      ).join('\n');

      const prompt = `${systemPrompt}\n\nCurrent observation: ${currentObservation}\n${historyText}\n\nNext step:`;

      let responseText = '';
      try {
        const result = await model.generateContent(prompt);
        responseText = result.response.text().trim();
      } catch (err) {
        console.error('[ReAct] Gemini error:', err);
        break;
      }

      let parsed: { thought: string; action: string; actionInput: unknown };
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch?.[0] || responseText);
      } catch {
        console.error('[ReAct] Failed to parse response:', responseText);
        break;
      }

      if (parsed.action === 'FINISH') {
        steps.push({ thought: parsed.thought, action: 'FINISH', actionInput: parsed.actionInput, observation: 'Done' });
        break;
      }

      let observation = `Unknown tool: ${parsed.action}`;
      const toolFn = tools[parsed.action];
      if (toolFn) {
        try {
          observation = await toolFn(parsed.actionInput);
        } catch (err) {
          observation = `Tool error: ${(err as Error).message}`;
        }
      }

      const reactStep: ReactStep = {
        thought: parsed.thought,
        action: parsed.action,
        actionInput: parsed.actionInput,
        observation,
      };
      steps.push(reactStep);
      currentObservation = observation;
    }

    return steps;
  }

  startMonitoring(intervalMs: number): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = setInterval(async () => {
      try {
        const states = await haService.getStates();
        const thermalEntities = states.filter(s => /(temp|thermal|cpu)/i.test(s.entity_id));
        if (thermalEntities.length === 0) return;

        const observation = `Thermal readings: ${thermalEntities.map(s => `${s.entity_id}=${s.state}`).join(', ')}`;
        await this.reason(
          {
            observation,
            availableTools: ['ha_get_state', 'ha_call_service', 'thermal_status', 'thermal_set_threshold', 'mqtt_publish'],
            history: [],
            maxSteps: 3,
          },
          'flash'
        );
      } catch (err) {
        console.error('[ReAct] Monitoring cycle error:', err);
      }
    }, intervalMs);
    console.log(`[ReAct] Monitoring started (interval: ${intervalMs}ms)`);
  }

  stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      console.log('[ReAct] Monitoring stopped');
    }
  }
}

export const reactLoop = new ReactLoopService();
