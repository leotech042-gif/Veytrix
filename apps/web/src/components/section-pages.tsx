"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  EconomicEvent,
  FundamentalsStatus,
} from "@veytrix/shared";
import {
  getEconomicCalendar,
  getFundamentalsStatus,
} from "@/lib/fundamentals-api";
import { MarketWatch, useMarketFeed } from "./market-watch";
import { TradingChart } from "./trading-chart";
import {
  useHydrated,
  usePreferences,
  type ThemePreference,
} from "./theme-provider";
import { SignalsPage } from "./signals-page";

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

function FundamentalsPage() {
  const [status, setStatus] = useState<FundamentalsStatus | null>(null);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [impact, setImpact] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const st = await getFundamentalsStatus();
        if (cancelled) return;
        setStatus(st);
        if (st.state !== "connected") {
          setLoading(false);
          return;
        }
        const cal = await getEconomicCalendar();
        if (cancelled) return;
        setEvents(Array.isArray(cal) ? cal : []);
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = impact === "all" ? events : events.filter((e) => e.impact === impact);
    return list.slice(0, 40);
  }, [events, impact]);

  const today = new Date().toDateString();

  return (
    <div className="news-screen">
      <div className="sig-filters">
        {(["all", "high", "medium", "low"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`sig-filter${impact === v ? " on" : ""}`}
            onClick={() => setImpact(v)}
          >
            {v === "all" ? "All" : v}
          </button>
        ))}
      </div>

      {loading && <div className="home-empty">Loading…</div>}

      {!loading && status?.state !== "connected" && (
        <div className="home-empty">
          {status?.message ?? "Set FINNHUB_API_KEY on the API to load the calendar"}
        </div>
      )}

      {!loading && status?.state === "connected" && filtered.length === 0 && (
        <div className="home-empty">No events in this window</div>
      )}

      {!loading &&
        filtered.map((ev) => {
          const isToday = new Date(ev.time).toDateString() === today;
          const time = new Date(ev.time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <article key={ev.id} className="news-card">
              <div className="news-card-top">
                <span className="news-time">{isToday ? time : "Later"}</span>
                <div className="news-card-title">
                  <strong>{ev.event}</strong>
                  <span>
                    {ev.currency} · {ev.country}
                  </span>
                </div>
                <span className={`news-impact ${ev.impact}`}>{ev.impact.toUpperCase()}</span>
              </div>
              {ev.affectedPairs?.length > 0 && (
                <div className="news-pairs">
                  <span className="lbl">AFFECTED</span>
                  <span>
                    {ev.affectedPairs
                      .slice(0, 4)
                      .map((p) => p.symbol)
                      .join(" · ")}
                  </span>
                </div>
              )}
              {ev.analysis && <p className="news-note">{ev.analysis}</p>}
            </article>
          );
        })}
    </div>
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
        <p className="set-hint">Broker linking is not live yet. App does not send orders.</p>
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
                className={(hydrated ? preferences.theme : "system") === theme ? "selected" : ""}
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
              {feed.status?.state === "connected" ? feed.status.provider : "Not linked"}
            </span>
          </div>
          <span
            className={`badge-status ${feed.status?.state === "connected" ? "on" : "off"}`}
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
