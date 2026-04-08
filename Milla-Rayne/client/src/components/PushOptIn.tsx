import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

type Status = 'idle' | 'subscribed' | 'unsupported' | 'denied';

async function getVapidPublicKey(): Promise<string> {
  const res = await fetch('/api/push/vapid-public-key');
  if (!res.ok) throw new Error('Failed to fetch VAPID key');
  const { key } = await res.json() as { key: string };
  return key;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export default function PushOptIn() {
  const [status, setStatus] = useState<Status>('idle');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
    }
  }, []);

  const subscribe = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        setMessage('Permission denied.');
        return;
      }

      const vapidKey = await getVapidPublicKey();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subData = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subData),
      });

      if (!res.ok) throw new Error('Subscribe request failed');
      setStatus('subscribed');
      setMessage('Notifications enabled ✓');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to subscribe');
    } finally {
      setLoading(false);
    }
  }, []);

  if (status === 'unsupported') return null;

  return (
    <div className="flex items-center gap-2">
      {status === 'subscribed' ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Notifications enabled ✓</span>
        </div>
      ) : status === 'denied' ? (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <BellOff className="w-3.5 h-3.5" />
          <span>Notifications blocked</span>
        </div>
      ) : (
        <button
          onClick={subscribe}
          disabled={loading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            'bg-violet-700 hover:bg-violet-600 text-white',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <Bell className="w-3.5 h-3.5" />
          {loading ? 'Subscribing…' : 'Enable Notifications'}
        </button>
      )}
      {message && !['subscribed', 'denied'].includes(status) && (
        <span className="text-xs text-zinc-400">{message}</span>
      )}
    </div>
  );
}
