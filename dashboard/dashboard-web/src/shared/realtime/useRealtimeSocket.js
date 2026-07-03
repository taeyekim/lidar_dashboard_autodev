import { useEffect, useRef, useState } from "react";

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

function nextDelay(attempt) {
  return RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
}

export function useRealtimeSocket({
  url,
  enabled = true,
  onMessage,
  onOpen,
  onClose,
  onError,
}) {
  const [status, setStatus] = useState(enabled ? "CONNECTING" : "DISABLED");
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const handlersRef = useRef({ onMessage, onOpen, onClose, onError });

  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose, onError };
  }, [onMessage, onOpen, onClose, onError]);

  useEffect(() => {
    if (!enabled || !url) {
      return undefined;
    }

    let stopped = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connect = () => {
      if (stopped) return;
      if (reconnectAttemptRef.current > 0) {
        setStatus("RECONNECTING");
      } else {
        setStatus("CONNECTING");
      }

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("CONNECTED");
        handlersRef.current.onOpen?.();
      };

      socket.onmessage = (event) => {
        try {
          handlersRef.current.onMessage?.(JSON.parse(event.data), event);
        } catch {
          // Ignore malformed realtime messages from proxies or stale clients.
        }
      };

      socket.onerror = (event) => {
        setStatus("ERROR");
        handlersRef.current.onError?.(event);
      };

      socket.onclose = (event) => {
        if (stopped) return;
        setStatus("DISCONNECTED");
        handlersRef.current.onClose?.(event);
        const delay = nextDelay(reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) {
        socketRef.current.close();
      }
      socketRef.current = null;
    };
  }, [enabled, url]);

  const effectiveStatus = enabled && url ? status : "DISABLED";
  return { status: effectiveStatus };
}
