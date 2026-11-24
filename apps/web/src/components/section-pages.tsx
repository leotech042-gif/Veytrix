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
import { BacktestingRoom } from "./backtesting-room";

export function SectionPage({
  section,
  symbol = "",
}: {
  section: string;
  symbol?: string;
}) {
  const feed = useMarketFeed();

  if (section === "signals") return <SignalsPage />;
  if (section === "backtesting") return <BacktestingRoom />;
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

const CURRENCY_FLAG: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  NZD: "🇳🇿",
  CNY: "🇨🇳",
  SGD: "🇸🇬",
};

function flagFor(currency: string) {
  return CURRENCY_FLAG[currency.toUpperCase()] ?? "🌐";
}

function countdownLabel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = t - now;
  if (diff < -30 * 60_000) return "Done";
  if (diff < 0) return "Live";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
}

function FundamentalsPage() {
  const [status, setStatus] = useState<FundamentalsStatus | null>(null);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [impact, setImpact] = useState<"all" | "high" | "medium" | "low">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

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
    let list = events;
    if (impact !== "all") list = list.filter((e) => e.impact === impact);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.event.toLowerCase().includes(q) ||
          e.currency.toLowerCase().includes(q) ||
          e.country.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 120);
  }, [events, impact, query]);

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  const related = useMemo(() => {
    if (!selected) return [];
    return events
      .filter(
        (e) =>
          e.id !== selected.id &&
          (e.currency === selected.currency ||
            e.event.toLowerCase().includes(selected.event.slice(0, 8).toLowerCase())),
      )
      .slice(0, 5);
  }, [events, selected]);

  const groups = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const ev of filtered) {
      const key = new Date(ev.time).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  if (selected) {
    const when = new Date(selected.time);
    const cd = countdownLabel(selected.time, now);
    return (
      <div className="news-screen">
        <button
          type="button"
          className="news-back"
          onClick={() => setSelectedId(null)}
        >
          ← All events
        </button>

        <article className="news-detail-card">
          <div className="news-detail-chips">
            <span className="news-ccy">
              {flagFor(selected.currency)} {selected.currency}
            </span>
            <span className={`news-impact ${selected.impact}`}>
              {selected.impact} impact
            </span>
            {cd && <span className="news-countdown">{cd}</span>}
          </div>

          <h2 className="news-detail-title">{selected.event}</h2>
          <p className="news-detail-meta">
            Economic release ·{" "}
            {when.toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </p>

          <div className="news-metrics">
            <div>
              <span>Forecast</span>
              <strong>
                {selected.estimate != null ? selected.estimate : "—"}
              </strong>
            </div>
            <div>
              <span>Previous</span>
              <strong>
                {selected.previous != null ? selected.previous : "—"}
              </strong>
            </div>
            <div>
              <span>Actual</span>
              <strong>{selected.actual != null ? selected.actual : "—"}</strong>
            </div>
          </div>
        </article>

        <section className="news-block">
          <h3>Prediction & affected pairs</h3>
          <div className="news-bias-pill">
            Expected bias ·{" "}
            <strong>
              {selected.currencyBias
                ? selected.currencyBias.charAt(0).toUpperCase() +
                  selected.currencyBias.slice(1)
                : "Pending"}
            </strong>
          </div>
          {selected.affectedPairs?.length > 0 && (
            <div className="news-pair-list">
              {selected.affectedPairs.slice(0, 8).map((p) => (
                <div key={p.symbol} className="news-pair-row">
                  <strong>{p.symbol}</strong>
                  <span className={`news-pair-bias ${p.bias}`}>{p.bias}</span>
                  {p.note && <span className="news-pair-note">{p.note}</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="news-block">
          <h3>What it means</h3>
          <p className="news-means">
            {selected.analysis ||
              `${selected.event} (${selected.currency}) — ${selected.impact}-impact economic release. A stronger-than-forecast print tends to support ${selected.currency}; a weaker one tends to weigh on it.`}
          </p>
        </section>

        {related.length > 0 && (
          <section className="news-block">
            <h3>Related events</h3>
            <div className="news-related">
              {related.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="news-related-row"
                  onClick={() => setSelectedId(r.id)}
                >
                  <span>
                    <strong>{r.event}</strong>
                    <span>
                      {new Date(r.time).toLocaleString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      · {r.currency}
                    </span>
                  </span>
                  <span className="chevron">›</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="news-screen">
      <div className="news-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events…"
          aria-label="Search events"
        />
        <span className="news-count">
          {filtered.length} / {events.length} events
        </span>
      </div>

      <div className="sig-filters">
        {(["all", "high", "medium", "low"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`sig-filter${impact === v ? " on" : ""}`}
            onClick={() => setImpact(v)}
          >
            {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div className="home-empty">Loading calendar…</div>}

      {!loading && status?.state !== "connected" && (
        <div className="home-empty">
          {status?.message ??
            "Calendar offline — restart the API to load Forex Factory events"}
        </div>
      )}

      {!loading && status?.state === "connected" && filtered.length === 0 && (
        <div className="home-empty">No events in this window</div>
      )}

      {!loading &&
        groups.map(([day, list]) => (
          <div key={day} className="news-day-group">
            <div className="news-day-label">{day}</div>
            {list.map((ev) => {
              const time = new Date(ev.time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              const cd = countdownLabel(ev.time, now);
              return (
                <button
                  key={ev.id}
                  type="button"
                  className="news-row"
                  onClick={() => setSelectedId(ev.id)}
                >
                  <span className="news-row-time">{time}</span>
                  <span className="news-row-main">
                    <span className="news-row-top">
                      <span className="news-ccy sm">
                        {flagFor(ev.currency)} {ev.currency}
                      </span>
                      <span className={`news-impact ${ev.impact}`}>
                        {ev.impact}
                      </span>
                      {cd && <span className="news-countdown">{cd}</span>}
                    </span>
                    <strong>{ev.event}</strong>
                  </span>
                  <span className="chevron">›</span>
                </button>
              );
            })}
          </div>
        ))}
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
