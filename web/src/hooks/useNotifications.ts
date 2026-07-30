import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchNotificationSummary,
  NotificationSummary,
  openNotificationStream,
} from '../api';

const EMPTY: NotificationSummary = {
  demandes_en_attente: 0,
  alertes_nouvelles: 0,
  total: 0,
  items: [],
};

/**
 * Notifications portail — SSE + poll + refresh manuel (compteurs exacts).
 */
export function useNotifications(token: string | null) {
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY);
  const [connected, setConnected] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const apply = useCallback((next: NotificationSummary) => {
    // Remplace toujours par les compteurs serveur (source de vérité).
    setSummary({
      demandes_en_attente: next.demandes_en_attente,
      alertes_nouvelles: next.alertes_nouvelles,
      total: next.demandes_en_attente + next.alertes_nouvelles,
      items: next.items,
    });
    const incoming = new Set<string>();
    for (const item of next.items) {
      const key = `${item.kind}:${item.id}`;
      if (!seenRef.current.has(key)) {
        incoming.add(key);
        seenRef.current.add(key);
      }
    }
    if (incoming.size) {
      setFreshIds((prev) => new Set([...prev, ...incoming]));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const s = await fetchNotificationSummary(token);
      apply(s);
    } catch {
      /* silencieux — SSE / poll reprendront */
    }
  }, [token, apply]);

  const markSeen = useCallback((kind: string, id: string) => {
    const key = `${kind}:${id}`;
    setFreshIds((prev) => {
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
  }, []);

  const clearFresh = useCallback(() => setFreshIds(new Set()), []);

  useEffect(() => {
    if (!token) {
      setSummary(EMPTY);
      setConnected(false);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();

    void refresh();

    const stopStream = openNotificationStream(
      token,
      (s) => {
        if (!cancelled) {
          setConnected(true);
          apply(s);
        }
      },
      () => {
        if (!cancelled) setConnected(false);
      },
      ac.signal,
    );

    const poll = window.setInterval(() => {
      void refresh();
    }, 8000);

    const onManual = () => {
      void refresh();
    };
    window.addEventListener('pigap-notif-refresh', onManual);

    return () => {
      cancelled = true;
      ac.abort();
      stopStream();
      window.clearInterval(poll);
      window.removeEventListener('pigap-notif-refresh', onManual);
    };
  }, [token, apply, refresh]);

  return { summary, connected, freshIds, markSeen, clearFresh, refresh };
}
