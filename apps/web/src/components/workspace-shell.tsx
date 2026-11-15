"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMarketStatus } from "@/lib/market-data-api";
import type { MarketDataStatus } from "@veytrix/shared";
import { ThemeToggle } from "./theme-toggle";
import { useHydrated } from "./theme-provider";

const navigation = [
  { href: "/", label: "Dashboard", icon: "⌂" },
  { href: "/markets", label: "Markets", icon: "◈" },
  { href: "/terminal", label: "Trading Terminal", icon: "▦" },
  { href: "/charts", label: "Charts", icon: "⌁" },
  { href: "/signals", label: "Signal Room", icon: "⌖" },
  { href: "/fundamentals", label: "Fundamental Analysis", icon: "◉" },
  { href: "/history", label: "Trading History", icon: "◷" },
  { href: "/assistant", label: "AI Assistant", icon: "✳" },
  { href: "/settings", label: "Settings", icon: "⚙" },
  { href: "/faq", label: "FAQ", icon: "?" },
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
  if (state.kind === "checking") return "Checking market feed";
  if (state.kind === "error") return "Market API unavailable";
  if (state.status.state === "connected") {
    return state.status.delayed
      ? "Delayed market data"
      : "Market feed connected";
  }
  if (state.status.state === "disconnected") return "Market feed disconnected";
  return "Market feed not configured";
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
  const connection = useMarketConnection();
  const hydrated = useHydrated();
  const mobileMenuOpen = openMenuPath === pathname;
  const visibleConnection: StatusState = hydrated
    ? connection
    : { kind: "checking" };

  const navigationLinks = navigation.map((item) => {
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
      ? "Start the API to check the current provider connection."
      : visibleConnection.kind === "ready"
        ? visibleConnection.status.message
        : "Checking the configured provider status.";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Veytrix dashboard">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" role="img">
              <path d="M5 21.5 11.2 8l4.1 9 4.2-9L27 21.5" />
              <path d="M9 24h14" />
              <circle cx="16" cy="5.5" r="1.5" />
            </svg>
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
              <span
                className={`state-dot${visibleConnection.kind === "ready" && visibleConnection.status.state === "connected" && !visibleConnection.status.delayed ? " connected" : ""}`}
              />
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
              <span className="user-tier">Profile not connected</span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() =>
              setOpenMenuPath((openPath) =>
                openPath === pathname ? null : pathname,
              )
            }
          >
            <span aria-hidden="true">{mobileMenuOpen ? "×" : "☰"}</span>
            <span className="visually-hidden">
              {mobileMenuOpen ? "Close navigation" : "Open navigation"}
            </span>
          </button>
          <div className="breadcrumb">
            Workspace <span aria-hidden="true">/</span>{" "}
            {navigation.find((item) =>
              item.href === "/" ? pathname === "/" : item.href === pathname,
            )?.label ?? "Veytrix"}
          </div>
          <div className="top-actions">
            <span className="market-state" aria-live="polite">
              <span
                className={`state-dot${visibleConnection.kind === "ready" && visibleConnection.status.state === "connected" && !visibleConnection.status.delayed ? " connected" : ""}`}
              />
              {connectionLabel(visibleConnection)}
            </span>
            <ThemeToggle />
            <Link
              className="icon-button profile-button"
              href="/settings"
              aria-label="Profile and settings"
              title="Profile and settings"
            >
              VX
            </Link>
          </div>
        </header>

        {mobileMenuOpen && (
          <nav
            className="mobile-navigation"
            id="mobile-navigation"
            aria-label="Mobile navigation"
          >
            {navigationLinks}
          </nav>
        )}

        <main className="main-area">{children}</main>

        <nav
          className="mobile-bottom-nav"
          aria-label="Mobile primary navigation"
        >
          {navigation
            .filter((item) =>
              ["/", "/markets", "/terminal", "/charts"].includes(item.href),
            )
            .map((item) => {
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
                  {item.label === "Trading Terminal" ? "Terminal" : item.label}
                </Link>
              );
            })}
          <button
            className={`mobile-bottom-item${mobileMenuOpen ? " active" : ""}`}
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() =>
              setOpenMenuPath((openPath) =>
                openPath === pathname ? null : pathname,
              )
            }
          >
            <span aria-hidden="true">•••</span>
            More
          </button>
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
            <svg viewBox="0 0 32 32" role="img">
              <path d="M5 21.5 11.2 8l4.1 9 4.2-9L27 21.5" />
              <path d="M9 24h14" />
              <circle cx="16" cy="5.5" r="1.5" />
            </svg>
          </span>
          Veytrix
        </Link>
        <p>Market tools with transparent data status.</p>
        <p className="risk-copy">
          Trading forex, CFDs, crypto and other leveraged products involves
          substantial risk and may not be suitable for all investors.
        </p>
      </div>
      <div className="footer-column">
        <h2>Platform</h2>
        <Link href="/markets">Markets</Link>
        <Link href="/terminal">Trading terminal</Link>
        <Link href="/charts">Charts</Link>
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
        Copyright Veytrix. Market data is unavailable until a provider is
        configured. Nothing on this platform is investment advice.
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
      label: "Tiktok",
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
      return url.protocol === "https:" && url.hostname === link.host;
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
