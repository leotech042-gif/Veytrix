"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMarketStatus } from "@/lib/market-data-api";
import type { MarketDataStatus } from "@veytrix/shared";
import { ThemeToggle } from "./theme-toggle";
import { useHydrated } from "./theme-provider";

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
    return state.status.delayed ? "Delayed" : "Live feed";
  }
  if (state.status.state === "disconnected") return "Disconnected";
  return "Not set";
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
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
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Veytrix home">
          <img src="/logo.svg" alt="" className="brand-logo" width={32} height={32} />
          Veytrix
        </Link>
        <nav className="desktop-nav" aria-label="Main">
          <p className="nav-label">Workspace</p>
          <div className="nav-list">
            {desktopNav.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  className={`nav-item${active ? " active" : ""}`}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="nav-icon">
                    <NavIcon name={item.icon} active={active} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="connection-title">
              <span className={`state-dot${isConnected ? " connected" : ""}`} />
              {connectionLabel(visibleConnection)}
            </div>
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <Link className="brand" href="/">
            <img src="/logo.svg" alt="" className="brand-logo" width={28} height={28} />
            Veytrix
          </Link>
          <div className="top-actions">
            <span className="market-state">
              <span className={`state-dot${isConnected ? " connected" : ""}`} />
              {connectionLabel(visibleConnection)}
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main className="main-area">{children}</main>

        <nav className="mobile-bottom-nav" aria-label="Primary">
          {bottomNav.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                className={`mobile-bottom-item${active ? " active" : ""}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
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

export function getOfficialSocialLinks() {
  const links = [
    {
      label: "X",
      url: process.env.NEXT_PUBLIC_SOCIAL_X_URL ?? "https://x.com/Veytrixofficial",
      host: "x.com",
    },
  ];
  return links.filter((link): link is typeof link & { url: string } => {
    if (!link.url) return false;
    try {
      const url = new URL(link.url);
      return url.protocol === "https:" && url.hostname.endsWith(link.host);
    } catch {
      return false;
    }
  });
}
