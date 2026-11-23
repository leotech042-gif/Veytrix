"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  EconomicEvent,
  FundamentalsStatus,
  NewsIntelligence,
} from "@veytrix/shared";
import {
  getEconomicCalendar,
  getFundamentalsStatus,
  getNewsIntelligence,
} from "@/lib/fundamentals-api";
import { MarketWatch, useMarketFeed } from "./market-watch";
import { TradingChart } from "./trading-chart";
import {
  useHydrated,
  usePreferences,
  type ThemePreference,
} from "./theme-provider";
import { SignalsPage } from "./signals-page";
import { PairLogo } from "./pair-logo";

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

function directionLabel(direction: EconomicEvent["currencyBias"]): string {
  if (direction === "bullish") return "Bullish";
  if (direction === "bearish") return "Bearish";
  if (direction === "neutral") return "Neutral";
  return "Pending";
}

function directionClass(direction: EconomicEvent["currencyBias"]): string {
  return direction === "bullish" ? "bullish" : direction === "bearish" ? "bearish" : direction === "neutral" ? "neutral" : "pending";
}

function fundamentalValue(value: number | null, unit?: string): string {
  if (value === null || !Number.isFinite(value)) return "Not supplied";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
}

function FundamentalsPage() {
  const [status, setStatus] = useState<FundamentalsStatus | null>(null);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [newsIntel, setNewsIntel] = useState<NewsIntelligence | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    let cancelled = false;
    void getNewsIntelligence()
      .then((value) => { if (!cancelled) setNewsIntel(value); })
      .catch(() => { if (!cancelled) setNewsIntel(null); })
      .finally(() => { if (!cancelled) setNewsLoading(false); });
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
        setError(null);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Fundamental data could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = impact === "all" ? events : events.filter((event) => event.impact === impact);
    return list.slice(0, 60);
  }, [events, impact]);

  return (
    <div className="news-screen fx-fundamentals">
      <div className="fx-fundamentals-intro">
        <div>
          <span className="mw-eyebrow">MACROECONOMIC INTELLIGENCE</span>
          <h2>Fundamental analysis</h2>
          <p>Economic releases, currency direction and affected-market bias.</p>
        </div>
        {status?.state === "connected" && <span className="fx-data-source">{status.provider}</span>}
      </div>

      {status?.state === "connected" && (
        <div className="fx-feed-note" role="status">
          {status.message}
          {" "}Pair directions are event-based context, not guaranteed forecasts.
        </div>
      )}

      <section className="fx-news-intelligence">
        <div className="fx-news-heading">
          <div>
            <span className="mw-eyebrow">LIVE GLOBAL HEADLINES</span>
            <h3>News intelligence</h3>
            <p>Macro headlines mapped to currency strength and relative pair bias.</p>
          </div>
          <span className={"fx-news-state " + (newsIntel?.state === "connected" ? "online" : "offline")}>
            {newsLoading ? "Updating…" : newsIntel?.state === "connected" ? "Live feed" : "Feed limited"}
          </span>
        </div>
        {newsLoading && <div className="home-empty">Scanning recent financial headlines…</div>}
        {!newsLoading && newsIntel && (
          <>
            <p className="fx-news-disclaimer">{newsIntel.note}</p>
            {newsIntel.pairBiases.length > 0 && (
              <div className="fx-news-pairs">
                {newsIntel.pairBiases.slice(0, 12).map((pair) => (
                  <div className="fx-news-pair" key={pair.symbol}>
                    <strong>{pair.symbol}</strong>
                    <span className={"fx-news-direction " + pair.bias}>{pair.bias}</span>
                    <span className="fx-news-score">{pair.score > 0 ? "+" : ""}{pair.score.toFixed(0)}</span>
                    <span className="fx-news-confidence">{pair.confidence}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="fx-news-articles">
              {newsIntel.articles.slice(0, 8).map((article) => (
                <article className="fx-news-article" key={article.id}>
                  <div className="fx-news-article-meta">
                    <span className={"news-impact " + article.impact}>{article.impact}</span>
                    <span>{article.source}</span>
                    <span>{new Date(article.publishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a>
                  <p>{article.summary}</p>
                  <div className="fx-news-tags">
                    {article.currencyImpacts.map((impact) => (
                      <span key={impact.currency} className={"fx-news-direction " + impact.bias}>
                        {impact.currency} · {impact.bias}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {newsIntel.articles.length === 0 && (
              <div className="home-empty">{newsIntel.note}</div>
            )}
          </>
        )}
        {!newsLoading && !newsIntel && (
          <div className="home-empty">News analysis is temporarily unavailable. No bias has been fabricated.</div>
        )}
      </section>

      <div className="sig-filters">
        {(["all", "high", "medium", "low"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`sig-filter${impact === value ? " on" : ""}`}
            onClick={() => setImpact(value)}
          >
            {value === "all" ? "All events" : `${value[0].toUpperCase()}${value.slice(1)} impact`}
          </button>
        ))}
      </div>

      {loading && <div className="home-empty">Loading macroeconomic data…</div>}
      {!loading && status?.state !== "connected" && (
        <div className="home-empty" role="status">
          {status?.message ?? error ?? "FXMacroData is not connected."}
        </div>
      )}
      {!loading && error && <div className="inline-error" role="alert">{error}</div>}
      {!loading && status?.state === "connected" && filtered.length === 0 && (
        <div className="home-empty">No economic events in this date window.</div>
      )}

      {!loading && filtered.map((event) => {
        const releaseDate = new Date(event.time);
        const validDate = Number.isFinite(releaseDate.getTime());
        const actualChange = event.actual !== null && event.previous !== null
          ? event.actual - event.previous
          : null;
        return (
          <article key={event.id} className="news-card fx-event-card">
            <div className="fx-event-header">
              <div className="fx-event-time">
                <strong>{validDate ? releaseDate.toLocaleDateString([], { day: "2-digit", month: "short" }) : "Date pending"}</strong>
                <span>{validDate ? releaseDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Time pending"}</span>
              </div>
              <div className="news-card-title">
                <strong>{event.event}</strong>
                <span>{event.currency} · {event.country}</span>
              </div>
              <span className={`news-impact ${event.impact}`}>{event.impact.toUpperCase()}</span>
            </div>

            <div className="fx-event-direction">
              <span>Currency bias</span>
              <strong className={`fx-bias-pill ${directionClass(event.currencyBias)}`}>
                {directionLabel(event.currencyBias)} {event.currency}
              </strong>
            </div>

            <div className="fx-event-values">
              <div><span>Actual</span><strong>{fundamentalValue(event.actual, event.unit)}</strong></div>
              <div><span>Previous</span><strong>{fundamentalValue(event.previous, event.unit)}</strong></div>
              <div><span>Forecast</span><strong>{fundamentalValue(event.estimate, event.unit)}</strong></div>
              <div><span>Change vs previous</span><strong>{actualChange === null ? "Not available" : `${actualChange > 0 ? "+" : ""}${actualChange.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}</strong></div>
            </div>

            {event.affectedPairs.length > 0 && (
              <div className="fx-affected-pairs">
                <div className="fx-subheading">
                  <strong>Affected pairs</strong>
                  <span>{event.affectedPairs.length} instruments</span>
                </div>
                <div className="fx-pair-grid">
                  {event.affectedPairs.map((pair) => (
                    <div className="fx-pair-row" key={`${event.id}-${pair.symbol}`}>
                      <PairLogo symbol={pair.symbol} size="sm" />
                      <strong>{pair.symbol}</strong>
                      <span className={`fx-bias-pill ${directionClass(pair.bias)}`}>
                        {directionLabel(pair.bias)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {event.analysis && <p className="news-note fx-event-analysis">{event.analysis}</p>}
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
