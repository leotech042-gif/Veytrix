"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EconomicEvent, TradingSignal } from "@veytrix/shared";
import { getEconomicCalendar } from "@/lib/fundamentals-api";
import { getSignals } from "@/lib/market-data-api";
import { useMarketFavorites } from "./market-watch";

export type AlertKind = "setup" | "trigger" | "sl" | "tp" | "news";

export type AppNotification = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  href?: string;
  createdAt: number;
  read: boolean;
};

type NotificationsContextValue = {
  items: AppNotification[];
  unread: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  live: boolean;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

const STORAGE_KEY = "veytrix.notifications.v1";
const SEEN_KEY = "veytrix.notifications.seen.v1";

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
}

function wsAlertsUrl(): string {
  const base = apiBase().replace(/\/api\/?$/, "");
  if (base.startsWith("https://")) {
    return base.replace(/^https/, "wss") + "/ws/alerts";
  }
  return base.replace(/^http/, "ws") + "/ws/alerts";
}

function loadStored(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed.slice(0, 80) : [];
  } catch {
    return [];
  }
}

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    /* ignore */
  }
}

function kindLabel(kind: AlertKind): string {
  switch (kind) {
    case "setup":
      return "Setup";
    case "trigger":
      return "Trigger";
    case "sl":
      return "Stop loss";
    case "tp":
      return "Take profit";
    case "news":
      return "News";
  }
}

function isAlertKind(v: string): v is AlertKind {
  return (
    v === "setup" ||
    v === "trigger" ||
    v === "sl" ||
    v === "tp" ||
    v === "news"
  );
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { favorites } = useMarketFavorites();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [live, setLive] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setItems(loadStored());
    seenRef.current = loadSeen();
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 80)));
    } catch {
      /* ignore */
    }
  }, [items, hydrated]);

  const pushOne = useCallback((n: AppNotification) => {
    if (seenRef.current.has(n.id)) return;
    seenRef.current.add(n.id);
    saveSeen(seenRef.current);
    setItems((prev) => {
      if (prev.some((p) => p.id === n.id)) return prev;
      return [n, ...prev].slice(0, 80);
    });
  }, []);

  // WebSocket live channel
  useEffect(() => {
    if (!hydrated) return;

    let closed = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsAlertsUrl());
      } catch {
        setLive(false);
        scheduleRetry();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        setLive(true);
        pingTimer = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string;
            payload?: {
              id?: string;
              kind?: string;
              title?: string;
              body?: string;
              href?: string;
              createdAt?: number;
            };
          };
          if (msg.type !== "alert" || !msg.payload?.id || !msg.payload.kind)
            return;
          if (!isAlertKind(msg.payload.kind)) return;
          pushOne({
            id: msg.payload.id,
            kind: msg.payload.kind,
            title: msg.payload.title ?? "Alert",
            body: msg.payload.body ?? "",
            href: msg.payload.href,
            createdAt: msg.payload.createdAt ?? Date.now(),
            read: false,
          });
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        setLive(false);
        if (pingTimer !== undefined) window.clearInterval(pingTimer);
        scheduleRetry();
      };

      ws.onerror = () => {
        setLive(false);
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleRetry = () => {
      if (closed) return;
      attempt += 1;
      const delay = Math.min(30_000, 1500 * attempt);
      retryTimer = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (pingTimer !== undefined) window.clearInterval(pingTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [hydrated, pushOne]);

  // HTTP fallback poll when WS is down
  useEffect(() => {
    if (!hydrated || live) return;
    let cancelled = false;

    async function poll() {
      const pairs =
        favorites.length > 0
          ? favorites.map((s) => s.toUpperCase())
          : ["EURUSD", "GBPUSD", "XAUUSD", "USDJPY"];

      try {
        const signals = await getSignals({ favorites: pairs });
        if (!cancelled && Array.isArray(signals)) {
          for (const s of signals as TradingSignal[]) {
            if (s.type !== "setup") continue;
            const dir =
              s.direction === "bullish"
                ? "BUY"
                : s.direction === "bearish"
                  ? "SELL"
                  : "BIAS";
            pushOne({
              id: `setup:${s.id}`,
              kind: "setup",
              title: `Setup · ${s.instrument}`,
              body: `${dir} ${s.timeframe}${s.entry != null ? ` · entry ${s.entry}` : ""}`,
              href: "/signals",
              createdAt: Date.now(),
              read: false,
            });
          }
        }
      } catch {
        /* offline */
      }

      try {
        const events = await getEconomicCalendar();
        if (!cancelled && Array.isArray(events)) {
          const now = Date.now();
          for (const ev of events as EconomicEvent[]) {
            if (ev.impact !== "high") continue;
            const t = new Date(ev.time).getTime();
            if (Number.isNaN(t)) continue;
            if (t < now - 15 * 60_000 || t > now + 2 * 60 * 60_000) continue;
            const when = new Date(ev.time).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            pushOne({
              id: `news:${ev.id}`,
              kind: "news",
              title: `High impact · ${ev.currency ?? "Market"}`,
              body: `${ev.event} · ${when}`,
              href: "/fundamentals",
              createdAt: Date.now(),
              read: false,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [favorites, hydrated, live, pushOne]);

  const unread = useMemo(
    () => items.filter((i) => !i.read).length,
    [items],
  );

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, read: true } : i)),
    );
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const value: NotificationsContextValue = {
    items,
    unread,
    markAllRead,
    markRead,
    clearAll,
    open,
    setOpen,
    live,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}

export function NotificationBell() {
  const { unread, open, setOpen, items, markAllRead, markRead, clearAll, live } =
    useNotifications();

  return (
    <div className="notif-root">
      <button
        type="button"
        className="icon-button notif-bell"
        aria-label={unread ? `${unread} notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M6 9a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 21a2 2 0 004 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>
        )}
        {unread > 0 ? (
          <span
            className={`notif-live-dot${live ? " on" : ""}`}
            title={live ? "Live alerts" : "Alerts offline"}
          />
        ) : null}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="notif-backdrop"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="notif-panel" role="dialog" aria-label="Notifications">
            <div className="notif-panel-head">
              <strong>
                Alerts{" "}
                <span className={`notif-live-label${live ? " on" : ""}`}>
                  {live ? "· live" : "· offline"}
                </span>
              </strong>
              <div className="notif-panel-actions">
                <button type="button" className="text-button" onClick={markAllRead}>
                  Read all
                </button>
                <button type="button" className="text-button" onClick={clearAll}>
                  Clear
                </button>
              </div>
            </div>
            <div className="notif-list">
              {items.length === 0 && (
                <div className="notif-empty">No alerts yet</div>
              )}
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.href ?? "/signals"}
                  className={`notif-item${n.read ? "" : " unread"}`}
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                  }}
                >
                  <span className={`notif-kind notif-kind-${n.kind}`}>
                    {kindLabel(n.kind)}
                  </span>
                  <strong>{n.title}</strong>
                  <span className="notif-body">{n.body}</span>
                  <span className="notif-time">
                    {new Date(n.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
