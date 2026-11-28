"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getMarketStatus } from "@/lib/market-data-api";
import type { MarketDataStatus } from "@veytrix/shared";
import { ThemeToggle } from "./theme-toggle";
import { useHydrated } from "./theme-provider";
import {
  NotificationBell,
  NotificationsProvider,
} from "./notifications";
import { TradingChart } from "./trading-chart";
import { useMarketFeed } from "./market-watch";
import { VeytrixLoader } from "./veytrix-loader";

const navItems = [
  { href: "/charts", label: "Chart" },
  { href: "/signals", label: "Signals" },
  { href: "/markets", label: "Markets" },
  { href: "/fundamentals", label: "News" },
  { href: "/settings", label: "Settings" },
  { href: "/faq", label: "FAQ" },
] as const;

const roomItems = [
  { href: "/charts", label: "Chart", icon: "◫" },
  { href: "/markets", label: "Markets", icon: "≋" },
  { href: "/signals", label: "Signals", icon: "⌁" },
  { href: "/fundamentals", label: "News & fundamentals", icon: "▤" },
  { href: "/faq", label: "Help", icon: "?" },
] as const;

const bottomNav = [
  { href: "/signals", label: "Signals", icon: "signals" },
  { href: "/markets", label: "Markets", icon: "markets" },
  { href: "/charts", label: "Chart", icon: "chart" },
  { href: "/fundamentals", label: "News", icon: "news" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

function NavIcon({ name, active }: { name: string; active?: boolean }) {
  const c = active ? "var(--accent)" : "currentColor";
  const s = 20;
  switch (name) {
    case "chart":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <path d="M4 19h16M6 16l3-5 3 3 4-7 2 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "signals":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <path d="M4 19V12M9 19V5M14 19v-7M19 19V9" strokeLinecap="round" />
        </svg>
      );
    case "markets":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
        </svg>
      );
    case "news":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8M8 13h5" strokeLinecap="round" />
        </svg>
      );
    case "settings":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

type StatusState =
  | { kind: "checking" }
  | { kind: "error" }
  | { kind: "ready"; status: MarketDataStatus };

function useMarketConnection(): StatusState {
  const [state, setState] = useState<StatusState>({ kind: "checking" });
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const check = async () => {
      try {
        const status = await getMarketStatus();
        if (active) setState({ kind: "ready", status });
      } catch {
        if (active) setState({ kind: "error" });
      } finally {
        if (active) timer = window.setTimeout(check, 30_000);
      }
    };
    void check();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return state;
}

function connectionLabel(state: StatusState): string {
  if (state.kind === "checking") return "Checking";
  if (state.kind === "error") return "Offline";
  if (state.status.state === "connected") {
    return state.status.delayed ? "Delayed" : "Live";
  }
  if (state.status.state === "disconnected") return "Disconnected";
  return "Not set";
}

/** Glowing loader on every route change (+ offline) */
function RouteGlowLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [offline, setOffline] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 700);
    return () => window.clearTimeout(t);
  }, [pathname]);

  if (!visible && !offline) return null;

  return (
    <VeytrixLoader
      variant="fullscreen"
      label={offline ? "No connection…" : "Loading…"}
    />
  );
}

function RoomDock({
  pathname,
  collapsed,
  onTogglePanel,
  onOpenRoom,
}: {
  pathname: string;
  collapsed: boolean;
  onTogglePanel: () => void;
  onOpenRoom: () => void;
}) {
  return (
    <aside className="vx-room-dock" aria-label="Chart rooms">
      <button
        type="button"
        className="vx-room-dock-toggle"
        onClick={onTogglePanel}
        aria-label={collapsed ? "Expand room panel" : "Collapse room panel"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand panel" : "Collapse panel"}
      >
        {collapsed ? "‹" : "›"}
      </button>
      <div className="vx-room-dock-items">
        {roomItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onOpenRoom}
              className={`vx-room-dock-item${active ? " active" : ""}`}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
            </Link>
          );
        })}
      </div>
      <Link
        href="/settings"
        className="vx-room-dock-settings"
        aria-label="Settings"
        title="Settings · full screen"
      >
        <NavIcon name="settings" active={pathname.startsWith("/settings")} />
      </Link>
    </aside>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const connection = useMarketConnection();
  const hydrated = useHydrated();
  const feed = useMarketFeed();
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const visibleConnection: StatusState = hydrated ? connection : { kind: "checking" };
  const isConnected =
    visibleConnection.kind === "ready" &&
    visibleConnection.status.state === "connected" &&
    !visibleConnection.status.delayed;
  const onChart = pathname.startsWith("/charts");
  const isSettings = pathname.startsWith("/settings");
  const showSideRoom = !onChart && !isSettings;

  useEffect(() => {
    setPanelCollapsed(onChart || isSettings);
  }, [pathname, onChart, isSettings]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell vx-shell">
      <RouteGlowLoader />
      <div className="workspace-main">
        <header className="topbar vx-topbar">
          <div className="vx-top-left">
            <Link className="brand" href="/charts">
              <img src="/logo.svg" alt="" width={24} height={24} />
              <span>Veytrix</span>
            </Link>
            <span className="market-state">
              <span className={`state-dot${isConnected ? " connected" : ""}`} />
              {connectionLabel(visibleConnection)}
            </span>
          </div>

          <div className="vx-top-right">
            <nav className="vx-top-nav" aria-label="Workspace">
              {navItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`vx-top-link${active ? " active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        <div
          className={`vx-body${showSideRoom ? " with-room" : ""}${panelCollapsed && showSideRoom ? " room-collapsed" : ""}${isSettings ? " settings-fullscreen" : ""}`}
        >
          {showSideRoom ? (
            <div className="vx-chart-pane desktop-pane">
              <TradingChart instruments={feed.instruments} compact />
            </div>
          ) : null}

          <main
            className={`main-area vx-room-pane${onChart ? " is-chart" : ""}${isSettings ? " is-settings" : ""}`}
          >
            {children}
          </main>

          {!isSettings ? (
            <RoomDock
              pathname={pathname}
              collapsed={panelCollapsed}
              onTogglePanel={() => {
                if (onChart) {
                  router.push("/markets");
                  return;
                }
                setPanelCollapsed((value) => !value);
              }}
              onOpenRoom={() => setPanelCollapsed(false)}
            />
          ) : null}
        </div>

        <nav className={`mobile-bottom-nav mt5-nav${isSettings ? " settings-hidden" : ""}`} aria-label="Primary">
          {bottomNav.map((item) => {
            const active = pathname.startsWith(item.href);
            const isChart = item.href === "/charts";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-bottom-item${active ? " active" : ""}${isChart ? " mt5-center" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="mt5-ico">
                  <NavIcon name={item.icon} active={active} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <ShellInner>{children}</ShellInner>
    </NotificationsProvider>
  );
}
