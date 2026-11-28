"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMarketStatus } from "@/lib/market-data-api";
import type { MarketDataStatus } from "@veytrix/shared";
import { ThemeToggle } from "./theme-toggle";
import { useHydrated } from "./theme-provider";
import {
  NotificationBell,
  NotificationsProvider,
} from "./notifications";

/** Chart first — core workspace */
const desktopNav = [
  { href: "/charts", label: "Chart", icon: "chart" },
  { href: "/signals", label: "Signals", icon: "signals" },
  { href: "/markets", label: "Markets", icon: "markets" },
  { href: "/fundamentals", label: "News", icon: "news" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/faq", label: "FAQ", icon: "faq" },
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
  const s = 22;
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

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const connection = useMarketConnection();
  const hydrated = useHydrated();
  const visibleConnection: StatusState = hydrated ? connection : { kind: "checking" };
  const isConnected =
    visibleConnection.kind === "ready" &&
    visibleConnection.status.state === "connected" &&
    !visibleConnection.status.delayed;

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell vx-shell">
      {/* Desktop left icon rail — navigate only, no fake dock panels */}
      <aside className="vx-rail" aria-label="Main">
        <Link className="vx-rail-logo" href="/charts" aria-label="Veytrix chart">
          <img src="/logo.svg" alt="" width={26} height={26} />
        </Link>
        <nav className="vx-rail-nav">
          {desktopNav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`vx-rail-link${active ? " active" : ""}`}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon name={item.icon} active={active} />
                <span className="vx-rail-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="vx-rail-foot">
          <span
            className={`state-dot${isConnected ? " connected" : ""}`}
            title={connectionLabel(visibleConnection)}
          />
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar vx-topbar">
          <div className="vx-top-left">
            <Link className="brand mobile-brand" href="/charts">
              <img src="/logo.svg" alt="" width={24} height={24} />
              <span>Veytrix</span>
            </Link>
            <span className="market-state">
              <span className={`state-dot${isConnected ? " connected" : ""}`} />
              {connectionLabel(visibleConnection)}
            </span>
          </div>
          <div className="top-actions">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        <main className="main-area">{children}</main>

        {/* Mobile MT5-style bottom — Chart is center core */}
        <nav className="mobile-bottom-nav mt5-nav" aria-label="Primary">
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
