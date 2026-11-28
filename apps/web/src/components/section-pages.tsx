"use client";

import { useState } from "react";
import type { ThemePreference } from "./theme-provider";
import { useHydrated, usePreferences } from "./theme-provider";
import { MarketWatch, useMarketFeed } from "./market-watch";
import { TradingChart } from "./trading-chart";
import { SignalsPage } from "./signals-page";
import { FundamentalsPage } from "./fundamentals-page";
import { Dashboard } from "./dashboard";

export function SectionPage({
  section,
  symbol = "",
}: {
  section: string;
  symbol?: string;
}) {
  if (section === "markets") return <MarketWatch />;
  if (section === "charts") {
    return <ChartsSection symbol={symbol} />;
  }
  if (section === "signals") return <SignalsPage />;
  if (section === "fundamentals") return <FundamentalsPage />;
  if (section === "settings") return <SettingsPage />;
  if (section === "faq") return <FaqPage />;
  if (section === "privacy" || section === "terms" || section === "risk-disclosure") {
    return (
      <div className="page-heading">
        <h1>{section}</h1>
        <p className="home-empty">Legal copy is managed separately.</p>
      </div>
    );
  }
  return <Dashboard />;
}

function ChartsSection({ symbol }: { symbol: string }) {
  const feed = useMarketFeed();
  return (
    <TradingChart
      instruments={feed.instruments}
      initialInstrument={symbol}
    />
  );
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
            <strong>App theme</strong>
            <span>Shell only — does not change chart</span>
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
          <span className="set-ico">▣</span>
          <div className="set-body">
            <strong>Chart color</strong>
            <span>Independent of app theme</span>
          </div>
          <div className="segmented-control" role="group">
            <button
              type="button"
              className={
                (hydrated ? preferences.chartBackground : "#ffffff") ===
                "#ffffff"
                  ? "selected"
                  : ""
              }
              onClick={() => updatePreferences({ chartBackground: "#ffffff" })}
            >
              White
            </button>
            <button
              type="button"
              className={
                (hydrated ? preferences.chartBackground : "#ffffff") ===
                "#0e141d"
                  ? "selected"
                  : ""
              }
              onClick={() => updatePreferences({ chartBackground: "#0e141d" })}
            >
              Dark
            </button>
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
  return (
    <div className="page-heading">
      <h1>FAQ</h1>
      <div className="set-card">
        <p>
          <strong>Does Veytrix place trades?</strong>
          <br />
          No. Signals and charts are for analysis only.
        </p>
        <p>
          <strong>Where does market data come from?</strong>
          <br />
          From the linked Veytrix API / provider status on Settings.
        </p>
      </div>
    </div>
  );
}
