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
import { VeytrixLoader } from "./veytrix-loader";

const desktopNav = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/signals", label: "Signals", icon: "signals" },
  { href: "/charts", label: "Chart", icon: "chart" },
  { href: "/fundamentals", label: "News", icon: "news" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/markets", label: "Markets", icon: "markets" },
  { href: "/faq", label: "FAQ", icon: "faq" },
];

const bottomNav = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/signals", label: "Signals", icon: "signals" },
  { href: "/charts", label: "Chart", icon: "chart" },
  { href: "/fundamentals", label: "News", icon: "news" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function NavIcon({ name, active }: { name: string; active?: boolean }) {
  const c = active ? "var(--accent)" : "currentColor";
  const s = 22;
  switch (name) {
    case "home":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
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
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
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
          <path d="M3 17h18M5 17V9l4 3 3-6 3 4 4-5v12" strokeLinecap="round" strokeLinejoin="round" />
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
    let cancelled = false;
    void (async () => {
      try {
        const status = await getMarketStatus();
        if (!cancelled) setState({ kind: "ready", status });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function connectionLabel(state: StatusState): string {
  if (state.kind === "checking") return "Checking";
  if (state.kind === "error") return "Offline";
  if (state.status.state === "connected") {
    return state.status.delayed ? "Delayed" : "Live feed";
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

  const [navLoading, setNavLoading] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setNavLoading(true);
    const t = window.setTimeout(() => setNavLoading(false), 650);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="workspace">
      <aside className="sidebar desktop-only">
        <div className="brand-block">
          <span className="brand-mark">V</span>
          <div>
            <strong>Veytrix</strong>
            <span className="brand-sub">Workspace</span>
          </div>
        </div>
        <nav className="side-nav">
          {desktopNav.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "nav-link active" : "nav-link"}
              >
                <NavIcon name={item.icon} active={active} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className={`feed-dot${isConnected ? " on" : ""}`} />
          <span className="feed-label">{connectionLabel(visibleConnection)}</span>
          <ThemeToggle />
          <NotificationBell />
        </div>
      </aside>

      <div className="workspace-main">
        <header className="top-bar mobile-only">
          <strong>Veytrix</strong>
          <div className="top-bar-actions">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        <main className="main-area" style={{ position: "relative" }}>
          {children}
          {navLoading ? (
            <VeytrixLoader variant="overlay" label="Loading…" />
          ) : null}
          {!online ? (
            <VeytrixLoader
              variant="overlay"
              label="No internet · reconnecting…"
            />
          ) : null}
        </main>

        <nav className="bottom-nav mobile-only">
          {bottomNav.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "bottom-link active" : "bottom-link"}
              >
                <NavIcon name={item.icon} active={active} />
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
