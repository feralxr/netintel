import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";

let wss: WebSocketServer | null = null;

export function attachWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "hello", message: "netintel live feed connected" }));
  });
}

export function broadcast(event: { type: string; payload: unknown }): void {
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients as Set<WebSocket>) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}
