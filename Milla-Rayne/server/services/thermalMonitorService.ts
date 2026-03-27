/**
 * Thermal Monitor Service
 * Watches Home Assistant temperature sensors, triggers cooling actions, escalates via MQTT.
 */

import { EventEmitter } from 'events';
import { haService, StateChangedEvent } from './homeAssistantService';
import { mqttService } from './mqttBrokerService';

export interface ThermalEvent {
  entityId: string;
  temp: number;
  threshold: number;
  action: string;
  ts: string;
}

interface ThermalReading {
  entityId: string;
  temp: number;
  lastAction?: string;
  verifyCount: number;
  baseline?: number;
}

const THERMAL_ENTITY_PATTERN = /(temp|thermal|cpu)/i;
const VERIFY_CHECKS = 5;

export class ThermalMonitorService extends EventEmitter {
  private threshold: number;
  private readings = new Map<string, ThermalReading>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribe?: () => void;

  constructor() {
    super();
    this.threshold = parseInt(process.env.THERMAL_THRESHOLD_C || '80', 10);
  }

  initialize(): void {
    this.unsubscribe = haService.on('state_changed', (ev: StateChangedEvent) => {
      if (THERMAL_ENTITY_PATTERN.test(ev.entityId)) {
        this._handleStateChange(ev);
      }
    }) as unknown as () => void;

    // Also subscribe using EventEmitter-based approach
    haService.on('state_changed', (ev: StateChangedEvent) => {
      if (THERMAL_ENTITY_PATTERN.test(ev.entityId)) {
        this._handleStateChange(ev);
      }
    });

    this.checkInterval = setInterval(() => this._periodicCheck(), 30_000);
    console.log(`[Thermal] Monitor initialized (threshold: ${this.threshold}°C)`);
  }

  private _handleStateChange(ev: StateChangedEvent): void {
    if (!ev.newState) return;
    const temp = parseFloat(ev.newState.state);
    if (isNaN(temp)) return;

    const reading = this.readings.get(ev.entityId) || { entityId: ev.entityId, temp: 0, verifyCount: 0 };
    reading.temp = temp;
    this.readings.set(ev.entityId, reading);

    if (temp >= this.threshold) {
      this._triggerCooling(ev.entityId, temp, reading);
    } else if (reading.verifyCount > 0) {
      reading.verifyCount++;
      if (reading.verifyCount >= VERIFY_CHECKS) {
        console.log(`[Thermal] ${ev.entityId} cooled down to ${temp}°C`);
        reading.verifyCount = 0;
        reading.baseline = undefined;
      }
    }
  }

  private async _triggerCooling(entityId: string, temp: number, reading: ThermalReading): Promise<void> {
    console.warn(`[Thermal] ⚠️ ${entityId} at ${temp}°C (threshold: ${this.threshold}°C)`);

    if (reading.verifyCount === 0) {
      reading.baseline = temp;
      reading.verifyCount = 1;
    } else {
      reading.verifyCount++;
    }

    const event: ThermalEvent = {
      entityId,
      temp,
      threshold: this.threshold,
      action: 'cooling_triggered',
      ts: new Date().toISOString(),
    };
    this.emit('thermal_alert', event);

    // MQTT cooling command
    await mqttService.publish(
      'home/server_room/cooling/set',
      JSON.stringify({ state: 'ON', target_temp: this.threshold - 5, source: entityId }),
      1
    ).catch(err => console.error('[Thermal] MQTT publish failed:', err));

    // HA service calls for cooling entities
    await haService.callService('fan', 'turn_on', { entity_id: 'fan.server_room_fan' })
      .catch(() => { /* entity may not exist */ });
    await haService.callService('switch', 'turn_on', { entity_id: 'switch.server_room_cooling' })
      .catch(() => { /* entity may not exist */ });

    // Escalate if temp hasn't dropped after VERIFY_CHECKS
    if (reading.verifyCount >= VERIFY_CHECKS) {
      const dropped = reading.baseline !== undefined && temp < reading.baseline - 1;
      if (!dropped) {
        await this._escalate(entityId, temp);
        reading.verifyCount = 0;
      }
    }
  }

  private async _escalate(entityId: string, temp: number): Promise<void> {
    console.error(`[Thermal] 🔥 CRITICAL: ${entityId} still at ${temp}°C after ${VERIFY_CHECKS} checks`);
    await mqttService.publish(
      'milla/alerts/thermal',
      JSON.stringify({
        severity: 'CRITICAL',
        entityId,
        temp,
        threshold: this.threshold,
        message: `Temperature not declining after cooling attempt`,
        ts: new Date().toISOString(),
      }),
      1
    ).catch(err => console.error('[Thermal] Escalation publish failed:', err));
  }

  private _periodicCheck(): void {
    this.readings.forEach((reading) => {
      if (reading.temp >= this.threshold) {
        console.warn(`[Thermal] Periodic: ${reading.entityId} still at ${reading.temp}°C`);
      }
    });
  }

  setThreshold(celsius: number): void {
    this.threshold = celsius;
    console.log(`[Thermal] Threshold updated to ${celsius}°C`);
  }

  getStatus(): Record<string, ThermalReading> {
    return Object.fromEntries(this.readings);
  }

  shutdown(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
  }
}

export const thermalMonitor = new ThermalMonitorService();
