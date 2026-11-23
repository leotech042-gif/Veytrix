export type AlertKind = "setup" | "trigger" | "sl" | "tp" | "news";

export type AlertEvent = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  href?: string;
  createdAt: number;
  instrument?: string;
};

export type WsServerMessage =
  | { type: "alert"; payload: AlertEvent }
  | { type: "hello"; serverTime: number }
  | { type: "pong"; serverTime: number };

export type WsClientMessage =
  | { type: "ping" }
  | { type: "subscribe"; pairs?: string[] };
