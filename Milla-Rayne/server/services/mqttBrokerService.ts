/**
 * MQTT Broker Service
 * Persistent MQTT client with LWT, wildcard subscriptions, and TLS support.
 */

import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { EventEmitter } from 'events';

type MessageHandler = (topic: string, payload: Buffer) => void;

export class MqttBrokerService extends EventEmitter {
  private client: MqttClient | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private _connected = false;

  private get brokerUrl(): string {
    return process.env.MQTT_URL || 'mqtt://localhost:1883';
  }

  get isConnected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: IClientOptions = {
        clientId: process.env.MQTT_CLIENT_ID || `milla-rayne-${Math.random().toString(16).slice(2, 8)}`,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
        will: {
          topic: 'milla/status',
          payload: Buffer.from('offline'),
          qos: 1,
          retain: true,
        },
      };

      this.client = mqtt.connect(this.brokerUrl, options);

      const onConnect = () => {
        this._connected = true;
        console.log('[MQTT] Connected to', this.brokerUrl);
        this.client!.publish('milla/status', 'online', { qos: 1, retain: true });
        this.emit('connected');
        resolve();
      };

      const onError = (err: Error) => {
        console.error('[MQTT] Connection error:', err.message);
        reject(err);
        this.client!.removeListener('connect', onConnect);
      };

      this.client.once('connect', onConnect);
      this.client.once('error', onError);

      this.client.on('reconnect', () => console.log('[MQTT] Reconnecting…'));
      this.client.on('offline', () => {
        this._connected = false;
        this.emit('disconnected');
      });

      this.client.on('message', (topic: string, payload: Buffer) => {
        this._dispatch(topic, payload);
      });
    });
  }

  private _dispatch(topic: string, payload: Buffer): void {
    this.handlers.forEach((handlers, pattern) => {
      if (this._matches(pattern, topic)) {
        handlers.forEach(h => h(topic, payload));
      }
    });
  }

  private _matches(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;
    const patParts = pattern.split('/');
    const topParts = topic.split('/');
    for (let i = 0; i < patParts.length; i++) {
      if (patParts[i] === '#') return true;
      if (patParts[i] !== '+' && patParts[i] !== topParts[i]) return false;
    }
    return patParts.length === topParts.length;
  }

  publish(topic: string, payload: string | Buffer, qos: 0 | 1 | 2 = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('MQTT not connected'));
      this.client.publish(topic, payload, { qos }, (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  subscribe(topic: string, qos: 0 | 1 | 2, handler: MessageHandler): () => void {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
      this.client?.subscribe(topic, { qos });
    }
    this.handlers.get(topic)!.add(handler);
    return () => {
      this.handlers.get(topic)?.delete(handler);
      if (this.handlers.get(topic)?.size === 0) {
        this.handlers.delete(topic);
        this.client?.unsubscribe(topic);
      }
    };
  }

  subscribePattern(pattern: string, handler: MessageHandler): () => void {
    return this.subscribe(pattern, 1, handler);
  }

  disconnect(): Promise<void> {
    return new Promise(resolve => {
      if (!this.client) return resolve();
      this.client.publish('milla/status', 'offline', { qos: 1, retain: true }, () => {
        this.client!.end(false, {}, () => resolve());
      });
    });
  }
}

export const mqttService = new MqttBrokerService();
