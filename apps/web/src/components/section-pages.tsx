"use client";

import { useState } from "react";
import { MarketWatch, useMarketFeed } from "./market-watch";
import { TradingChart } from "./trading-chart";
import {
  useHydrated,
  usePreferences,
  type ThemePreference,
} from "./theme-provider";
import { SignalsPage } from "./signals-page";
import { FundamentalsPage } from "./fundamentals-page";

export function SectionPage({
  section,
  symbol = "",
}: {
  section: string;
  symbol?: string;
}) {
  const feed = useMarketFeed();

  if (section === "signals") return <SignalsPage />;
  if (section === "fundamentals") return <FundamentalsPage />;
  if (section === "settings") return <SettingsPage />;
  if (section === "faq") return <FaqPage />;

  if (section === "markets") {
    return <MarketWatch feed={feed} />;
  }

  if (section === "charts") {
    return (
      <TradingChart instruments={feed.instruments} initialInstrument={symbol} />
    );
  }

  if (section === "terminal") {
    return <div className="home-empty">No closed history yet</div>;
  }

  return <div className="home-empty">Not configured</div>;
}

function SettingsPage() {
  const { preferences, updatePreferences } = usePreferences();
  const feed = useMarketFeed();
  const hydrated = useHydrated();
  const [paper, setPaper] = useState(true);
  const [risk, setRisk] = useState("1");
  const [notif, setNotif] = useState(true);
  const [newsAlert, setNewsAlert] = useState(true);

  return (
    <div className="set-screen">
      <h2 className="set-group-title">Broker connection</h2>
      <div className="set-card">
        <div className="set-row">
          <span className="set-ico link">⛓</span>
          <div className="set-body">
            <strong>MetaTrader 5</strong>
            <span>No credentials stored here</span>
          </div>
          <span className="badge-status off">Not connected</span>
        </div>
        <p className="set-hint">
          Broker linking is not live yet. App does not send orders.
        </p>
      </div>

      <h2 className="set-group-title">Trading preferences</h2>
      <div className="set-card">
        <div className="set-row">
          <span className="set-ico">🛡</span>
          <div className="set-body">
            <strong>Account mode</strong>
            <span>Paper · no live balance</span>
          </div>
          <button
            type="button"
            className={`toggle${paper ? " on" : ""}`}
            aria-pressed={paper}
            onClick={() => setPaper((v) => !v)}
          />
        </div>
        <div className="set-row">
          <span className="set-ico">%</span>
          <div className="set-body">
            <strong>Risk per setup</strong>
            <span>Preference only</span>
          </div>
        </div>
        <div className="set-risk-pills">
          {["0.5", "1", "2"].map((r) => (
            <button
              key={r}
              type="button"
              className={`sig-filter${risk === r ? " on" : ""}`}
              onClick={() => setRisk(r)}
            >
              {r}%
            </button>
          ))}
        </div>
        <div className="set-row">
          <span className="set-ico">🔔</span>
          <div className="set-body">
            <strong>Signal notifications</strong>
            <span>Preference only</span>
          </div>
          <button
            type="button"
            className={`toggle${notif ? " on" : ""}`}
            aria-pressed={notif}
            onClick={() => setNotif((v) => !v)}
          />
        </div>
        <div className="set-row">
          <span className="set-ico">📅</span>
          <div className="set-body">
            <strong>High-impact news alerts</strong>
            <span>Watchlist currency events</span>
          </div>
          <button
            type="button"
            className={`toggle${newsAlert ? " on" : ""}`}
            aria-pressed={newsAlert}
            onClick={() => setNewsAlert((v) => !v)}
          />
        </div>
      </div>

      <h2 className="set-group-title">Appearance</h2>
      <div className="set-card">
        <div className="set-row">
          <span className="set-ico">◐</span>
          <div className="set-body">
            <strong>Theme</strong>
            <span>Light / dark / system</span>
          </div>
          <div className="segmented-control" role="group">
            {(["light", "dark", "system"] as ThemePreference[]).map((theme) => (
              <button
                type="button"
                key={theme}
                className={
                  (hydrated ? preferences.theme : "system") === theme
                    ? "selected"
                    : ""
                }
                onClick={() => updatePreferences({ theme })}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="set-row">
          <span className="set-ico">◈</span>
          <div className="set-body">
            <strong>Market feed</strong>
            <span>
              {feed.status?.state === "connected"
                ? feed.status.provider
                : "Not linked"}
            </span>
          </div>
          <span
            className={`badge-status ${
              feed.status?.state === "connected" ? "on" : "off"
            }`}
          >
            {feed.status?.state === "connected" ? "On" : "Off"}
          </span>
        </div>
      </div>
    </div>
  );
}

function FaqPage() {
  const items = [
    {
      q: "Where do quotes come from?",
      a: "From the configured market-data provider on the API (e.g. Tiingo).",
    },
    {
      q: "Does Veytrix place trades?",
      a: "No. It shows research and signals only. No broker credentials are collected for order routing.",
    },
    {
      q: "Why is a setup CLOSED?",
      a: "When the market session is closed or the engine marks the setup inactive.",
    },
  ];
  return (
    <section className="faq-list">
      {items.map((item) => (
        <details key={item.q}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </section>
  );
}
