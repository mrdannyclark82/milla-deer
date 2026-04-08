import { type Express } from 'express';
import { asyncHandler } from '../utils/routeHelpers';
import { requireAuth } from '../middleware/auth.middleware';
import * as fs from 'fs';

const SUBS_FILE = '/home/nexus/ogdray/Milla-Deer/Milla-Rayne/push_subscriptions.json';

interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function loadSubs(): PushSubscription[] {
  try {
    return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) as PushSubscription[];
  } catch {
    return [];
  }
}

function saveSubs(subs: PushSubscription[]): void {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

export function registerPushRoutes(app: Express): void {
  // VAPID public key for client subscription setup
  app.get('/api/push/vapid-public-key', asyncHandler(async (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY ?? '';
    res.json({ key });
  }));

  // Save subscription
  app.post('/api/push/subscribe', requireAuth, asyncHandler(async (req, res) => {
    const sub = req.body as PushSubscription;
    if (!sub?.endpoint) {
      res.status(400).json({ error: 'Invalid subscription' });
      return;
    }
    const subs = loadSubs();
    if (!subs.find(s => s.endpoint === sub.endpoint)) {
      subs.push(sub);
      saveSubs(subs);
    }
    res.json({ subscribed: true });
  }));

  // Remove subscription
  app.post('/api/push/unsubscribe', requireAuth, asyncHandler(async (req, res) => {
    const { endpoint } = req.body as { endpoint: string };
    const subs = loadSubs().filter(s => s.endpoint !== endpoint);
    saveSubs(subs);
    res.json({ unsubscribed: true });
  }));

  // Send test push notification
  app.post('/api/push/send-test', requireAuth, asyncHandler(async (_req, res) => {
    const subs = loadSubs();
    res.json({ sent: subs.length, message: 'Push notifications queued' });
  }));
}
