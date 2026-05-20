/**
 * IoT Security Service
 * RBAC, topic access control, sandbox execution, and TLS configuration.
 */

import fs from 'fs';

export type IotRole = 'admin' | 'operator' | 'monitor';

interface Permission {
  actions: string[];
  topicPatterns: string[];
  allowHaCalls: boolean;
}

const ROLE_PERMISSIONS: Record<IotRole, Permission> = {
  admin: {
    actions: ['*'],
    topicPatterns: ['#'],
    allowHaCalls: true,
  },
  operator: {
    actions: ['ha_call_service', 'ha_get_state', 'ha_list_devices', 'mqtt_publish', 'mqtt_subscribe_once', 'thermal_status', 'thermal_set_threshold'],
    topicPatterns: ['home/#', 'milla/status', 'milla/alerts/#'],
    allowHaCalls: true,
  },
  monitor: {
    actions: ['ha_get_state', 'ha_list_devices', 'mqtt_subscribe_once', 'thermal_status'],
    topicPatterns: ['home/#', 'milla/status'],
    allowHaCalls: false,
  },
};

const BLOCKED_TOPIC_PATTERNS_FOR_NON_ADMIN = [
  /^milla\/admin\//,
  /^rdma\//,
];

export class IotSecurityService {
  checkPermission(role: IotRole, action: string, resource: string): boolean {
    const perms = ROLE_PERMISSIONS[role];
    const allowed = perms.actions.includes('*') || perms.actions.includes(action);
    console.log(`[IoT Security] role=${role} action=${action} resource=${resource} → ${allowed ? 'ALLOW' : 'DENY'}`);
    return allowed;
  }

  validateTopicAccess(role: IotRole, topic: string): boolean {
    if (role !== 'admin') {
      for (const pattern of BLOCKED_TOPIC_PATTERNS_FOR_NON_ADMIN) {
        if (pattern.test(topic)) {
          console.log(`[IoT Security] topic=${topic} role=${role} → DENY (blocked pattern)`);
          return false;
        }
      }
    }

    const perms = ROLE_PERMISSIONS[role];
    const allowed = perms.topicPatterns.some(pattern => this._topicMatches(pattern, topic));
    console.log(`[IoT Security] topic=${topic} role=${role} → ${allowed ? 'ALLOW' : 'DENY'}`);
    return allowed;
  }

  private _topicMatches(pattern: string, topic: string): boolean {
    if (pattern === '#') return true;
    const patParts = pattern.split('/');
    const topParts = topic.split('/');
    for (let i = 0; i < patParts.length; i++) {
      if (patParts[i] === '#') return true;
      if (patParts[i] !== '+' && patParts[i] !== topParts[i]) return false;
    }
    return patParts.length === topParts.length;
  }

  async wrapWithSandbox(code: string): Promise<string> {
    const escaped = code.replace(/"/g, '\\"');
    return `docker run --rm --network none alpine sh -c "${escaped}"`;
  }

  getMqttTlsOptions(): Record<string, Buffer | undefined> {
    const readOptional = (envVar: string): Buffer | undefined => {
      const path = process.env[envVar];
      if (!path) return undefined;
      try { return fs.readFileSync(path); } catch { return undefined; }
    };

    return {
      ca: readOptional('MQTT_CA_CERT'),
      cert: readOptional('MQTT_CLIENT_CERT'),
      key: readOptional('MQTT_CLIENT_KEY'),
    };
  }
}

export const iotSecurity = new IotSecurityService();
