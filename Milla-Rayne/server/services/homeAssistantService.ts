/**
 * Home Assistant WebSocket Service
 * Persistent client with auto-reconnect, event subscriptions, and service calls.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface StateChangedEvent {
  entityId: string;
  newState: HaState | null;
  oldState: HaState | null;
  ts: string;
}

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

interface HaMessage {
  type: string;
  id?: number;
  [key: string]: unknown;
}

type EventCallback = (event: StateChangedEvent) => void;
type GenericEventCallback = (data: unknown) => void;

export class HomeAssistantService extends EventEmitter {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private authenticated = false;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private stateCache = new Map<string, HaState>();
  private eventSubscriptions = new Map<string, Set<GenericEventCallback>>();
  private stopped = false;

  private get haUrl(): string {
    const raw = process.env.HA_URL || 'ws://homeassistant.local:8123/api/websocket';
    // Normalise http(s) -> ws(s)
    return raw.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:').replace(/\/?$/, '').replace(/\/?api\/websocket$/, '') + '/api/websocket';
  }

  private get token(): string {
    return process.env.HA_TOKEN || '';
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stopped = false;
      this._connect(resolve, reject);
    });
  }

  private _connect(onReady?: (v: void) => void, onFail?: (e: Error) => void): void {
    if (this.ws) {
      try { this.ws.terminate(); } catch { /* ignore */ }
    }

    try {
      this.ws = new WebSocket(this.haUrl);
    } catch (err) {
      this._scheduleReconnect();
      return;
    }

    let resolved = false;
    const resolveOnce = () => { if (!resolved) { resolved = true; onReady?.(); } };
    const rejectOnce = (e: Error) => { if (!resolved) { resolved = true; onFail?.(e); } };

    this.ws.on('open', () => {
      console.log('[HA] WebSocket connected');
      this.reconnectDelay = 1000;
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      let msg: HaMessage;
      try { msg = JSON.parse(data.toString()) as HaMessage; } catch { return; }
      this._handleMessage(msg, resolveOnce, rejectOnce);
    });

    this.ws.on('close', () => {
      this.authenticated = false;
      console.log('[HA] Connection closed');
      this.emit('disconnected', { stateCache: Object.fromEntries(this.stateCache) });
      if (!this.stopped) this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[HA] WebSocket error:', err.message);
      rejectOnce(err as Error);
    });
  }

  private _handleMessage(msg: HaMessage, onReady: () => void, onFail: (e: Error) => void): void {
    switch (msg.type) {
      case 'auth_required':
        this._send({ type: 'auth', access_token: this.token });
        break;

      case 'auth_ok':
        this.authenticated = true;
        console.log('[HA] Authenticated');
        this._subscribeStateChanged();
        onReady();
        break;

      case 'auth_invalid':
        console.error('[HA] Authentication failed — check HA_TOKEN');
        onFail(new Error('HA auth invalid'));
        break;

      case 'event': {
        const eventType = (msg.event as Record<string, unknown>)?.event_type as string | undefined;
        const eventData = (msg.event as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        if (eventType === 'state_changed' && eventData) {
          const entityId = eventData.entity_id as string;
          const newState = (eventData.new_state as HaState) || null;
          const oldState = (eventData.old_state as HaState) || null;
          if (newState) this.stateCache.set(entityId, newState);
          const ev: StateChangedEvent = { entityId, newState, oldState, ts: new Date().toISOString() };
          this.emit('state_changed', ev);
        }
        // Generic event subscriptions
        if (eventType) {
          const subs = this.eventSubscriptions.get(eventType);
          if (subs) subs.forEach(cb => cb(eventData));
        }
        break;
      }

      case 'result': {
        const id = msg.id as number;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          if (msg.success) pending.resolve(msg.result);
          else pending.reject(new Error(JSON.stringify(msg.error)));
        }
        break;
      }
    }
  }

  private _subscribeStateChanged(): void {
    const id = this.msgId++;
    this._send({ id, type: 'subscribe_events', event_type: 'state_changed' });
    // Fetch initial states
    this._sendRequest({ type: 'get_states' }).then(states => {
      if (Array.isArray(states)) {
        (states as HaState[]).forEach(s => this.stateCache.set(s.entity_id, s));
      }
    }).catch(() => { /* non-fatal */ });
  }

  private _send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _sendRequest(msg: Omit<HaMessage, 'id'>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pendingRequests.set(id, { resolve, reject });
      this._send({ ...msg, id });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`HA request ${id} timed out`));
        }
      }, 10000);
    });
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log(`[HA] Reconnecting in ${this.reconnectDelay}ms…`);
      this._connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  callService(domain: string, service: string, data: Record<string, unknown> = {}): Promise<unknown> {
    return this._sendRequest({ type: 'call_service', domain, service, service_data: data });
  }

  async getStates(): Promise<HaState[]> {
    return Array.from(this.stateCache.values());
  }

  getState(entityId: string): HaState | undefined {
    return this.stateCache.get(entityId);
  }

  subscribeEvents(eventType: string, callback: GenericEventCallback): () => void {
    if (!this.eventSubscriptions.has(eventType)) {
      this.eventSubscriptions.set(eventType, new Set());
      if (this.authenticated) {
        this._send({ id: this.msgId++, type: 'subscribe_events', event_type: eventType });
      }
    }
    this.eventSubscriptions.get(eventType)!.add(callback);
    return () => this.eventSubscriptions.get(eventType)?.delete(callback);
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.terminate();
  }
}

export const haService = new HomeAssistantService();
