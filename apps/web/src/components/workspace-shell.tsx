"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMarketStatus } from "@/lib/market-data-api";
import type { MarketDataStatus } from "@veytrix/shared";
import { ThemeToggle } from "./theme-toggle";
import { useHydrated } from "./theme-provider";
import {
  NotificationBell,
  NotificationsProvider,
} from "./notifications";

const desktopNav = [
  { href: "/", label: "Home", icon: "home", dock: "home" },
  { href: "/signals", label: "Signals", icon: "signals", dock: "signals" },
  { href: "/charts", label: "Chart", icon: "chart", dock: "chart" },
  { href: "/fundamentals", label: "News", icon: "news", dock: "news" },
  { href: "/markets", label: "Markets", icon: "markets", dock: "markets" },
  { href: "/settings", label: "Settings", icon: "settings", dock: "settings" },
  { href: "/faq", label: "FAQ", icon: "faq", dock: "faq" },
] as const;

const bottomNav = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/signals", label: "Signals", icon: "signals" },
  { href: "/charts", label: "Chart", icon: "chart" },
  { href: "/fundamentals", label: "News", icon: "news" },
  { href: "/settings", label: "More", icon: "settings" },
];

function NavIcon({ name, active }: { name: string; active?: boolean }) {
  const c = active ? "var(--accent)" : "currentColor";
  const s = 22;
  switch (name) {
    case "home":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z" strokeLinejoin="round" />
        </svg>
      );
    case "signals":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <path d="M4 19V12M9 19V5M14 19v-7M19 19V9" strokeLinecap="round" />
        </svg>
      );
    case "chart":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <path d="M4 19h16M6 16l3-5 3 3 4-7 2 3" strokeLinecap="round" strokeLinejoin="round" />
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
    case "markets":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
        </svg>
      );
    case "faq":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4" strokeLinecap="round" />
          <circle cx="12" cy="17" r="0.8" fill={c} stroke="none" />
        </svg>
      );
    default:
      return <span>•</span>;
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

type DockId = (typeof desktopNav)[number]["dock"];

function dockTitle(id: DockId | null): string {
  if (!id) return "";
  const item = desktopNav.find((n) => n.dock === id);
  return item?.label ?? "";
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const connection = useMarketConnection();
  const hydrated = useHydrated();
  const visibleConnection: StatusState = hydrated ? connection : { kind: "checking" };
  const isConnected =
    visibleConnection.kind === "ready" &&
    visibleConnection.status.state === "connected" &&
    !visibleConnection.status.delayed;

  const [dock, setDock] = useState<DockId | null>(null);

  useEffect(() => {
    // Keep dock in sync with route on first paint / navigation from links
    if (pathname.startsWith("/charts")) setDock((d) => d ?? "chart");
    else if (pathname.startsWith("/signals")) setDock((d) => d ?? "signals");
    else if (pathname.startsWith("/fundamentals")) setDock((d) => d ?? "news");
    else if (pathname.startsWith("/markets")) setDock((d) => d ?? "markets");
  }, [pathname]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  function onRailClick(item: (typeof desktopNav)[number]) {
    if (dock === item.dock) {
      // Toggle closed if same room already open
      setDock(null);
      return;
    }
    setDock(item.dock);
    router.push(item.href);
  }

  return (
    <div className={`app-shell tv-shell${dock ? " dock-open" : ""}`}>
      {/* Desktop: narrow icon rail (TradingView-style) */}
      <aside className="tv-rail desktop-only" aria-label="Workspace rail">
        <Link className="tv-rail-brand" href="/" aria-label="Veytrix home">
          <img src="/logo.svg" alt="" width={28} height={28} />
        </Link>
        <nav className="tv-rail-nav">
          {desktopNav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const docked = dock === item.dock;
            return (
              <button
                key={item.href}
                type="button"
                className={`tv-rail-btn${active || docked ? " active" : ""}`}
                title={item.label}
                aria-label={item.label}
                aria-pressed={docked}
                onClick={() => onRailClick(item)}
              >
                <NavIcon name={item.icon} active={active || docked} />
              </button>
            );
          })}
        </nav>
        <div className="tv-rail-foot">
          <span
            className={`state-dot${isConnected ? " connected" : ""}`}
            title={connectionLabel(visibleConnection)}
          />
          <ThemeToggle />
        </div>
      </aside>

      {/* Expandable left room / panel — can be closed */}
      {dock ? (
        <aside className="tv-dock desktop-only" aria-label={`${dockTitle(dock)} panel`}>
          <div className="tv-dock-head">
            <strong>{dockTitle(dock)}</strong>
            <button
              type="button"
              className="tv-dock-close"
              aria-label="Close panel"
              onClick={() => setDock(null)}
            >
              ✕
            </button>
          </div>
          <div className="tv-dock-body">
            <p className="tv-dock-hint">
              {dock === "chart"
                ? "Chart workspace — drawings stay on the chart. Use the main area for full tools."
                : dock === "markets"
                  ? "Watchlist & quotes open in the main view. Close this panel for a wider chart."
                  : dock === "signals"
                    ? "Setups and bias load in the main column."
                    : dock === "news"
                      ? "Calendar and headlines stay in-app in the main column."
                      : "Navigate from the rail. Close this panel anytime."}
            </p>
            <Link className="tv-dock-link" href={desktopNav.find((n) => n.dock === dock)?.href ?? "/"}>
              Open full {dockTitle(dock)} →
            </Link>
          </div>
        </aside>
      ) : null}

      <div className="workspace-main">
        <header className="topbar">
          <Link className="brand mobile-brand" href="/">
            <img src="/logo.svg" alt="" className="brand-logo" width={28} height={28} />
            <span>Veytrix</span>
          </Link>
          <div className="top-actions">
            <span className="market-state">
              <span className={`state-dot${isConnected ? " connected" : ""}`} />
              {connectionLabel(visibleConnection)}
            </span>
            <NotificationBell />
            <span className="mobile-only-inline">
              <ThemeToggle />
            </span>
          </div>
        </header>

        <main className="main-area">{children}</main>

        {/* Mobile: MT5-style bottom bar */}
        <nav className="mobile-bottom-nav mt5-nav" aria-label="Primary">
          {bottomNav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-bottom-item${active ? " active" : ""}`}
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
