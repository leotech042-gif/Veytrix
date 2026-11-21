"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  EconomicEvent,
  FundamentalsStatus,
  SignalProviderStatus,
  TradingSignal,
} from "@veytrix/shared";
import {
  getEconomicCalendar,
  getFundamentalsStatus,
} from "@/lib/fundamentals-api";
import { getSignalStatus, getSignals } from "@/lib/market-data-api";
import { MarketWatch, useMarketFeed, useMarketFavorites } from "./market-watch";
import { TradingChart } from "./trading-chart";
import {
  useHydrated,
  usePreferences,
  type ThemePreference,
} from "./theme-provider";
import { AiOrb } from "./ai-orb";

function PageHeading({ title }: { title: string }) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
    </div>
  );
}

function isSignalStatus(value: unknown): value is SignalProviderStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Record<string, unknown>;
  return (
    typeof status.message === "string" &&
    ((status.state === "unconfigured" && status.provider === null) ||
      (status.state === "connected" && typeof status.provider === "string") ||
      (status.state === "disconnected" && typeof status.provider === "string"))
  );
}

function isTradingSignal(value: unknown): value is TradingSignal {
  if (typeof value !== "object" || value === null) return false;
  const signal = value as Record<string, unknown>;
  return (
    typeof signal.id === "string" &&
    typeof signal.instrument === "string" &&
    (signal.type === "setup" || signal.type === "bias") &&
    (signal.direction === "bullish" ||
      signal.direction === "bearish" ||
      signal.direction === "neutral") &&
    typeof signal.confidence === "number" &&
    typeof signal.timeframe === "string" &&
    typeof signal.summary === "string"
  );
}

function sortSignals(list: TradingSignal[]): TradingSignal[] {
  return [...list].sort((a, b) => {
    if (a.type === "setup" && b.type !== "setup") return -1;
    if (b.type === "setup" && a.type !== "setup") return 1;
    return b.confidence - a.confidence;
  });
}

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
    return (
      <>
        <PageHeading title="Markets" />
        <MarketWatch feed={feed} />
      </>
    );
  }

  if (section === "charts") {
    return (
      <>
        <PageHeading title="Chart" />
        <TradingChart instruments={feed.instruments} initialInstrument={symbol} />
      </>
    );
  }

  if (section === "terminal") {
    return (
      <>
        <PageHeading title="Terminal" />
        <div className="home-empty">No closed history yet</div>
      </>
    );
  }

  return (
    <>
      <PageHeading title={section} />
      <div className="home-empty">Not configured</div>
    </>
  );
}

function SignalsPage() {
  const { favorites: marketFavorites } = useMarketFavorites();
  const [status, setStatus] = useState<SignalProviderStatus | null>(null);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "setup" | "bias">("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const st = await getSignalStatus();
      if (!isSignalStatus(st)) throw new Error("Invalid status");
      setStatus(st);
      if (st.state !== "connected") {
        setSignals([]);
        return;
      }
      const favs = marketFavorites.map((s) => s.toUpperCase());
      const raw = await getSignals(favs.length ? { favorites: favs } : undefined);
      if (!Array.isArray(raw) || !raw.every(isTradingSignal)) {
        setSignals([]);
        return;
      }
      setSignals(sortSignals(raw));
    } catch {
      setSignals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, [marketFavorites.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runSearch() {
    const s = query.trim().toUpperCase();
    if (!s) return;
    setRefreshing(true);
    try {
      const raw = await getSignals({ instrument: s });
      if (Array.isArray(raw) && raw.every(isTradingSignal)) {
        setSignals(sortSignals(raw));
      }
    } finally {
      setRefreshing(false);
    }
  }

  const setups = signals.filter((s) => s.type === "setup");
  const biases = signals.filter((s) => s.type === "bias");
  const shown =
    filter === "setup" ? setups : filter === "bias" ? biases : signals;

  return (
    <div className="sig-screen">
      <PageHeading title="Signal room" />

      <div className="sig-filters">
        {(["all", "setup", "bias"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`sig-filter${filter === f ? " on" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "setup" ? "Setups" : "Bias only"}
          </button>
        ))}
      </div>

      <div className="sig-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="EURUSD"
          onKeyDown={(e) => e.key === "Enter" && void runSearch()}
        />
        <button type="button" className="secondary-button" onClick={() => void runSearch()}>
          Search
        </button>
        <button type="button" className="text-button" onClick={() => void load()} disabled={refreshing}>
          {refreshing ? "…" : "Refresh"}
        </button>
      </div>

      {loading && (
        <div className="orb-loading">
          <AiOrb variant="loading" size="md" />
          <span>Loading…</span>
        </div>
      )}

      {!loading && shown.length === 0 && (
        <div className="home-empty">
          {status?.state === "connected" ? "No setups right now" : "Engine offline"}
        </div>
      )}

      {shown.map((signal) => {
        const isBuy = signal.direction === "bullish";
        const isSell = signal.direction === "bearish";
        const dir = isBuy ? "BUY" : isSell ? "SELL" : "BIAS";
        const tags = [
          isBuy ? "Bullish bias" : isSell ? "Bearish bias" : "Neutral",
          signal.timeframe,
          `${signal.confidence}%`,
        ];
        return (
          <article
            key={signal.id}
            className={`sig-card ${isBuy ? "buy" : isSell ? "sell" : ""}`}
          >
            <div className="sig-card-top">
              <div>
                <h2>
                  {signal.instrument}{" "}
                  <span className={`sig-dir ${isBuy ? "buy" : isSell ? "sell" : "bias"}`}>
                    {dir}
                  </span>
                </h2>
                <p className="sig-sub">
                  {signal.timeframe}
                  {signal.riskReward ? ` · 1:${signal.riskReward} RR` : ""}
                </p>
              </div>
              {signal.riskReward != null && (
                <span className="sig-rr">1:{signal.riskReward} RR</span>
              )}
            </div>

            <div className="sig-tags">
              {tags.map((t) => (
                <span key={t} className="sig-tag">
                  {t}
                </span>
              ))}
            </div>

            {signal.entry != null && (
              <div className="sig-levels">
                <div>
                  <span>ENTRY</span>
                  <strong>{signal.entry}</strong>
                </div>
                <div>
                  <span>STOP</span>
                  <strong className="stop">{signal.stopLoss ?? "—"}</strong>
                </div>
                <div>
                  <span>TARGET</span>
                  <strong className="tp">{signal.takeProfit ?? "—"}</strong>
                </div>
              </div>
            )}

            {signal.summary && (
              <div className="sig-why">
                <span className="sig-why-ico">?</span>
                <p>
                  <strong>Why this setup:</strong> {signal.summary}
                </p>
              </div>
            )}

            {signal.entry != null && signal.stopLoss != null && signal.takeProfit != null && (
              <div className="sig-metrics">
                <div>
                  <span>Risk</span>
                  <strong>{Math.abs(signal.entry - signal.stopLoss).toFixed(5)}</strong>
                </div>
                <div>
                  <span>Potential</span>
                  <strong>{Math.abs(signal.takeProfit - signal.entry).toFixed(5)}</strong>
                </div>
                <div>
                  <span>R:R</span>
                  <strong>{signal.riskReward != null ? `1:${signal.riskReward}` : "—"}</strong>
                </div>
              </div>
            )}
          </article>
        );
      })}

      {!loading && biases.length > 0 && filter === "all" && (
        <div className="sig-bias-block">
          <h3>Bias only</h3>
          <p className="sig-bias-note">No valid entry yet — wait for confirmation</p>
          {biases.map((b) => (
            <Link key={b.id} href={`/charts?symbol=${b.instrument}`} className="sig-bias-row">
              <span className="sig-bias-dot" />
              <span>
                <strong>
                  {b.instrument} ·{" "}
                  {b.direction === "bullish"
                    ? "Bullish bias"
                    : b.direction === "bearish"
                      ? "Bearish bias"
                      : "Neutral bias"}
                </strong>
                <span>{b.summary}</span>
              </span>
              <span className="chevron">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
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
      <PageHeading title="Fundamentals" />
      <p className="news-sub">Events that may move your pairs</p>

      <div className="news-watch-banner">
        <span className="news-watch-ico">⚠</span>
        <div>
          <strong>High-impact watch</strong>
          <p>Live calendar when Finnhub key is set. Verify times before trading.</p>
        </div>
      </div>

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

      {loading && (
        <div className="orb-loading">
          <AiOrb variant="loading" size="md" />
          <span>Loading…</span>
        </div>
      )}

      {!loading && status?.state !== "connected" && (
        <div className="home-empty">
          {status?.message ?? "Set FINNHUB_API_KEY on the API to load the calendar"}
        </div>
      )}

      {!loading && status?.state === "connected" && filtered.length === 0 && (
        <div className="home-empty">No events in this window</div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div className="news-day-head">
            <div>
              <h2>Today</h2>
              <span>Economic calendar</span>
            </div>
          </div>
          {filtered.map((ev) => {
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
        </>
      )}
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
      <PageHeading title="Settings" />

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

      <h2 className="set-group-title">App & privacy</h2>
      <div className="set-card">
        <Link href="/privacy" className="set-row link-row">
          <span className="set-ico">🔒</span>
          <div className="set-body">
            <strong>Privacy & data</strong>
            <span>No broker secrets stored</span>
          </div>
          <span className="chevron">›</span>
        </Link>
        <Link href="/risk-disclosure" className="set-row link-row">
          <span className="set-ico">ℹ</span>
          <div className="set-body">
            <strong>Risk disclosure</strong>
            <span>Trading carries risk</span>
          </div>
          <span className="chevron">›</span>
        </Link>
        <div className="set-row">
          <span className="set-ico">ⓘ</span>
          <div className="set-body">
            <strong>About Veytrix</strong>
            <span>Version 0.1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FaqPage() {
  const items = [
    { q: "Is this live trading?", a: "No. Quotes and signals only. No order routing." },
    { q: "Where do signals come from?", a: "Your connected data + the technical engine." },
    { q: "Can I link MT5?", a: "Not yet. Status shows in Settings." },
  ];
  return (
    <>
      <PageHeading title="FAQ" />
      <section className="faq-list">
        {items.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </section>
    </>
  );
}
