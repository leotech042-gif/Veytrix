"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

const STORAGE_KEY = "veytrix.notifications.v1";
const SEEN_KEY = "veytrix.notifications.seen.v1";

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
    localStorage.setItem(
      SEEN_KEY,
      JSON.stringify([...seen].slice(-200)),
    );
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

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { favorites } = useMarketFavorites();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadStored());
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

  const pushMany = useCallback((incoming: AppNotification[]) => {
    if (incoming.length === 0) return;
    setItems((prev) => {
      const ids = new Set(prev.map((p) => p.id));
      const next = [...incoming.filter((n) => !ids.has(n.id)), ...prev];
      return next.slice(0, 80);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function poll() {
      const seen = loadSeen();
      const fresh: AppNotification[] = [];
      const pairs =
        favorites.length > 0
          ? favorites.map((s) => s.toUpperCase())
          : ["EURUSD", "GBPUSD", "XAUUSD", "USDJPY"];

      try {
        const signals = await getSignals({ favorites: pairs });
        if (!cancelled && Array.isArray(signals)) {
          for (const s of signals as TradingSignal[]) {
            if (s.type !== "setup") continue;

            const setupId = `setup:${s.id}`;
            if (!seen.has(setupId)) {
              seen.add(setupId);
              const dir =
                s.direction === "bullish"
                  ? "BUY"
                  : s.direction === "bearish"
                    ? "SELL"
                    : "BIAS";
              fresh.push({
                id: setupId,
                kind: "setup",
                title: `Setup · ${s.instrument}`,
                body: `${dir} ${s.timeframe}${s.entry != null ? ` · entry ${s.entry}` : ""}`,
                href: "/signals",
                createdAt: Date.now(),
                read: false,
              });
            }

            if (s.entry != null) {
              const tid = `trigger:${s.id}`;
              if (!seen.has(tid)) {
                seen.add(tid);
                fresh.push({
                  id: tid,
                  kind: "trigger",
                  title: `Price trigger · ${s.instrument}`,
                  body: `Watch entry near ${s.entry}`,
                  href: `/charts?symbol=${encodeURIComponent(s.instrument)}`,
                  createdAt: Date.now(),
                  read: false,
                });
              }
            }

            const closed =
              typeof s.summary === "string" &&
              s.summary.toLowerCase().includes("market closed");

            if (!closed && s.stopLoss != null && s.confidence >= 65) {
              const sid = `sl-watch:${s.id}`;
              if (!seen.has(sid)) {
                seen.add(sid);
                fresh.push({
                  id: sid,
                  kind: "sl",
                  title: `SL level · ${s.instrument}`,
                  body: `Stop set at ${s.stopLoss}`,
                  href: "/signals",
                  createdAt: Date.now(),
                  read: false,
                });
              }
            }

            if (!closed && s.takeProfit != null && s.confidence >= 65) {
              const pid = `tp-watch:${s.id}`;
              if (!seen.has(pid)) {
                seen.add(pid);
                fresh.push({
                  id: pid,
                  kind: "tp",
                  title: `TP level · ${s.instrument}`,
                  body: `Target at ${s.takeProfit}`,
                  href: "/signals",
                  createdAt: Date.now(),
                  read: false,
                });
              }
            }
          }
        }
      } catch {
        /* API offline */
      }

      try {
        const events = await getEconomicCalendar();
        if (!cancelled && Array.isArray(events)) {
          const now = Date.now();
          for (const ev of events as EconomicEvent[]) {
            if (ev.impact !== "high") continue;
            const t = new Date(ev.time).getTime();
            if (Number.isNaN(t)) continue;
            if (t < now - 60_000 || t > now + 24 * 60 * 60 * 1000) continue;
            const id = `news:${ev.id}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const when = new Date(ev.time).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            fresh.push({
              id,
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

      saveSeen(seen);
      if (fresh.length) pushMany(fresh);
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [favorites, hydrated, pushMany]);

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
  const { unread, open, setOpen, items, markAllRead, markRead, clearAll } =
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
              <strong>Alerts</strong>
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
