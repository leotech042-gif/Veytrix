import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import type { AlertEvent, WsClientMessage, WsServerMessage } from "./alerts.types";

@Injectable()
export class AlertsHub implements OnModuleDestroy {
  private readonly logger = new Logger(AlertsHub.name);
  private wss: WebSocketServer | null = null;
  private readonly clients = new Set<WebSocket>();

  attach(server: HttpServer) {
    if (this.wss) return;

    this.wss = new WebSocketServer({ server, path: "/ws/alerts" });
    this.wss.on("connection", (socket) => {
      this.clients.add(socket);
      this.send(socket, { type: "hello", serverTime: Date.now() });
      this.logger.log(`Alert client connected (${this.clients.size})`);

      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as WsClientMessage;
          if (msg?.type === "ping") {
            this.send(socket, { type: "pong", serverTime: Date.now() });
          }
        } catch {
          /* ignore bad client payload */
        }
      });

      socket.on("close", () => {
        this.clients.delete(socket);
      });

      socket.on("error", () => {
        this.clients.delete(socket);
      });
    });

    this.logger.log("WebSocket alerts hub attached at /ws/alerts");
  }

  broadcast(alert: AlertEvent) {
    const message: WsServerMessage = { type: "alert", payload: alert };
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  }

  private send(socket: WebSocket, message: WsServerMessage) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  onModuleDestroy() {
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }
}
