"use client";

import Link from "next/link";
import { usePreferences } from "./theme-provider";
import { MarketWatch, useMarketFeed } from "./market-watch";
import { TradingChart } from "./trading-chart";

function SummaryCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{note}</div>
    </article>
  );
}

export function Dashboard() {
  const feed = useMarketFeed();
  const { preferences } = usePreferences();
  const accountConnected = false;
  const preferredMainInstrument =
    feed.instruments.some((instrument) => instrument.symbol === "EURUSD")
      ? "EURUSD"
      : feed.instruments.some(
            (instrument) => instrument.symbol === preferences.defaultInstrument,
          )
        ? preferences.defaultInstrument
        : feed.instruments[0]?.symbol ?? "";

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR TRADING WORKSPACE</div>
          <h1>Dashboard</h1>
          <p className="subtitle">
            A clear view of connected market data. Account information appears
            only after a broker connection is implemented.
          </p>
        </div>
        <Link className="secondary-button" href="/markets">
          Explore markets
        </Link>
      </div>

      <section className="stats-grid" aria-label="Workspace status">
        <SummaryCard
          label="Market-data provider"
          value={
            feed.loading
              ? "Checking"
              : feed.status?.state === "connected"
                ? feed.status.provider
                : feed.status?.state === "disconnected"
                  ? "Disconnected"
                  : feed.error
                    ? "API unavailable"
                    : "Not configured"
          }
          note={
            feed.status?.state === "connected"
              ? feed.status.delayed
                ? "Provider reports delayed data"
                : "Provider connection reported"
              : "No live feed is available"
          }
        />
        <SummaryCard
          label="Supported instruments"
          value={
            feed.status?.state === "connected"
              ? String(feed.instruments.length)
              : "—"
          }
          note="Discovered from the connected provider"
        />
        <SummaryCard
          label="Live quotes"
          value={
            feed.status?.state === "connected" ? String(feed.quotes.length) : "—"
          }
          note={feed.quoteError ?? "Only provider quotes are shown"}
        />
        <SummaryCard
          label="Broker account"
          value={accountConnected ? "Connected" : "Not connected"}
          note="Balance and position data are unavailable"
        />
      </section>

      {feed.error && <div className="inline-error" role="alert">{feed.error}</div>}
      {feed.status?.state === "connected" && feed.status.delayed && (
        <div className="notice" role="status">
          <span aria-hidden="true">ⓘ</span>
          <span>
            <strong>Delayed data.</strong> The provider reports a delay. Confirm
            its timestamp and service terms before relying on market information.
          </span>
        </div>
      )}

      <div className="dashboard-grid">
        <TradingChart
          instruments={feed.instruments}
          initialInstrument={preferredMainInstrument}
          compact
        />
        <MarketWatch feed={feed} favoritesOnly compact />
      </div>

      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent trading activity</h2>
            <p className="panel-description">
              Account events are shown only when a broker integration is active.
            </p>
          </div>
          <Link className="text-button" href="/history">
            Trading history
          </Link>
        </div>
        <div className="empty-activity">
          <span className="activity-mark" aria-hidden="true">
            ◷
          </span>
          No broker account is connected. No trades or balances are being
          reported.
        </div>
      </section>
      <p className="footer-note">
        Market data is supplied by the configured provider and may be delayed.
        Veytrix does not currently place orders or provide investment advice.
      </p>
    </>
  );
}
