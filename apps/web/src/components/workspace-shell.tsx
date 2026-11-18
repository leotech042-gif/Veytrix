"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMarketStatus } from "@/lib/market-data-api";
import type { MarketDataStatus } from "@veytrix/shared";
import { ThemeToggle } from "./theme-toggle";
import { useHydrated } from "./theme-provider";

const desktopNav = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/signals", label: "Signals", icon: "⌖" },
  { href: "/charts", label: "Chart", icon: "⌁" },
  { href: "/fundamentals", label: "News", icon: "◉" },
  { href: "/settings", label: "Settings", icon: "⚙" },
  { href: "/markets", label: "Markets", icon: "◈" },
  { href: "/faq", label: "FAQ", icon: "?" },
];

const bottomNav = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/signals", label: "Signals", icon: "⌖" },
  { href: "/charts", label: "Chart", icon: "⌁" },
  { href: "/fundamentals", label: "News", icon: "◉" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

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
  if (state.kind === "checking") return "Checking feed";
  if (state.kind === "error") return "API unavailable";
  if (state.status.state === "connected") {
    return state.status.delayed ? "Delayed data" : "Live feed";
  }
  if (state.status.state === "disconnected") return "Disconnected";
  return "Not configured";
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const connection = useMarketConnection();
  const hydrated = useHydrated();
  const visibleConnection: StatusState = hydrated
    ? connection
    : { kind: "checking" };

  const isConnected =
    visibleConnection.kind === "ready" &&
    visibleConnection.status.state === "connected" &&
    !visibleConnection.status.delayed;

  const navigationLinks = desktopNav.map((item) => {
    const active =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return (
      <Link
        className={`nav-item${active ? " active" : ""}`}
        href={item.href}
        aria-current={active ? "page" : undefined}
        key={item.href}
      >
        <span className="nav-icon" aria-hidden="true">
          {item.icon}
        </span>
        {item.label}
      </Link>
    );
  });

  const marketStatusCopy =
    visibleConnection.kind === "error"
      ? "Start the API to check the provider connection."
      : visibleConnection.kind === "ready"
        ? visibleConnection.status.message
        : "Checking provider status…";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Veytrix home">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          Veytrix
        </Link>

        <nav className="desktop-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          <div className="nav-list">{navigationLinks}</div>
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="connection-title" aria-live="polite">
              <span className={`state-dot${isConnected ? " connected" : ""}`} />
              {connectionLabel(visibleConnection)}
            </div>
            <p className="connection-copy">{marketStatusCopy}</p>
          </div>
          <Link className="user-chip" href="/settings">
            <span className="avatar" aria-hidden="true">
              VX
            </span>
            <span>
              <span className="user-name">Local workspace</span>
              <span className="user-tier">Broker not connected</span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              V
            </span>
            Veytrix
          </Link>
          <div className="breadcrumb">
            Workspace <span aria-hidden="true">/</span>{" "}
            {desktopNav.find((item) =>
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
            )?.label ?? "Veytrix"}
          </div>
          <div className="top-actions">
            <span className="market-state" aria-live="polite">
              <span className={`state-dot${isConnected ? " connected" : ""}`} />
              {connectionLabel(visibleConnection)}
            </span>
            <ThemeToggle />
            <Link
              className="icon-button profile-button"
              href="/settings"
              aria-label="Settings"
              title="Settings"
            >
              VX
            </Link>
          </div>
        </header>

        <main className="main-area">{children}</main>

        <nav className="mobile-bottom-nav" aria-label="Primary navigation">
          {bottomNav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                className={`mobile-bottom-item${active ? " active" : ""}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
                key={item.href}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {pathname === "/" && <DashboardFooter />}
      </div>
    </div>
  );
}

function DashboardFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          Veytrix
        </Link>
        <p>Clarity before the candle. Real market data when a provider is configured.</p>
        <p className="risk-copy">
          Trading involves substantial risk of loss and is not suitable for every investor.
        </p>
      </div>
      <div className="footer-column">
        <h2>Platform</h2>
        <Link href="/signals">Signals</Link>
        <Link href="/charts">Charts</Link>
        <Link href="/fundamentals">News</Link>
        <Link href="/settings">Settings</Link>
      </div>
      <div className="footer-column">
        <h2>Information</h2>
        <Link href="/faq">FAQ</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/risk-disclosure">Risk disclosure</Link>
      </div>
      <SocialLinks />
      <div className="footer-bottom">
        © {new Date().getFullYear()} Veytrix. Market data appears only from a configured
        provider. Nothing here is investment advice.
      </div>
    </footer>
  );
}

export function getOfficialSocialLinks() {
  const links = [
    {
      label: "X",
      url:
        process.env.NEXT_PUBLIC_SOCIAL_X_URL ?? "https://x.com/Veytrixofficial",
      host: "x.com",
    },
    {
      label: "LinkedIn",
      url: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN_URL,
      host: "linkedin.com",
    },
    {
      label: "TikTok",
      url:
        process.env.NEXT_PUBLIC_SOCIAL_TIKTOK_URL ??
        "https://tiktok.com/@veytrixofficial",
      host: "tiktok.com",
    },
    {
      label: "Instagram",
      url:
        process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL ??
        "https://instagram.com/veytrixofficial",
      host: "instagram.com",
    },
    {
      label: "YouTube",
      url: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE_URL,
      host: "youtube.com",
    },
    {
      label: "GitHub",
      url: process.env.NEXT_PUBLIC_SOCIAL_GITHUB_URL,
      host: "github.com",
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

function SocialLinks() {
  const configured = getOfficialSocialLinks();
  if (configured.length === 0) return null;

  return (
    <div className="footer-column">
      <h2>Social</h2>
      {configured.map((link) => (
        <a
          href={link.url}
          key={link.label}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
