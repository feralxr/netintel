import { useEffect, useRef, useState } from "react";
import type { Notification } from "@netintel/shared";

export function useLiveFeed() {
  const [connected, setConnected] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState<Notification[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notification") {
          setLiveNotifications((prev) => [data.payload, ...prev].slice(0, 50));
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => socket.close();
  }, []);

  return { connected, liveNotifications };
}
