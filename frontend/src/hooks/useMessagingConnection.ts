import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { MessagingConnection, probeMessagingConnection } from '../lib/messagingConnection';

export function useMessagingConnection() {
  const [connection, setConnection] = useState<MessagingConnection>({
    backend: 'checking', hardware: null, detail: 'Checking the messaging backend…',
  });
  const [checking, setChecking] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const check = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      setChecking(true);
      try {
        const result = await probeMessagingConnection(async (path, timeout) => {
          const response = await api.get(path, { timeout, signal: controller.signal });
          return response.data;
        });
        if (!disposed) setConnection(result);
      } finally {
        inFlight = false;
        if (!disposed) {
          setChecking(false);
          timer = setTimeout(check, 5000);
        }
      }
    };
    refreshRef.current = check;
    void check();
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      refreshRef.current = () => {};
    };
  }, []);

  return { connection, checking, refresh: useCallback(() => refreshRef.current(), []) };
}
