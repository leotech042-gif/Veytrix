"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import {
  getSignalStatus,
  getSignals,
} from "@/lib/market-data-api";
import { MarketWatch, useMarketFeed, useMarketFavorites } from "./market-watch";
import { TradingChart } from "./trading-chart";
import {
  useHydrated,
  usePreferences,
  type ThemePreference,
} from "./theme-provider";
import { getOfficialSocialLinks } from "./workspace-shell";

const routeInfo: Record<
  string,
  { title: string; eyebrow: string; description: string }
> = {
  history: {
    title: "History",
    eyebrow: "ACCOUNT",
    description: "No broker linked.",
  },
  assistant: {
    title: "Assistant",
    eyebrow: "AI",
    description: "Not configured.",
  },
  privacy: {
    title: "Privacy",
    eyebrow: "LEGAL",
    description: "No accounts. Prefs stay in this browser.",
  },
  terms: {
    title: "Terms",
    eyebrow: "LEGAL",
    description: "Dev foundation. Not a live broker service.",
  },
  "risk-disclosure": {
    title: "Risk",
    eyebrow: "IMPORTANT",
    description: "Leveraged trading can wipe capital.",
  },
};

type TerminalPeriod = "1w" | "3w" | "1m" | "3m" | "1y" | "custom";

const terminalPeriods: { value: TerminalPeriod; label: string }[] = [
  { value: "1w", label: "1 week" },
  { value: "3w", label: "3 weeks" },
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "1y", label: "1 year" },
  { value: "custom", label: "Custom" },
];

type SignalExtra = TradingSignal & {
  leanScore?: number;
  marketOpen?: boolean;
};

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

  if (section === "markets") {
    return (
      <>
        <PageHeading
          eyebrow="FEED"
          title="Markets"
          description="Live pairs"
        />
        <MarketWatch feed={feed} />
      </>
    );
  }

  if (section === "charts") {
    return (
      <>
        <PageHeading
          eyebrow="CHART"
          title="Chart"
          description="Tools · indicators · full screen"
        />
        <TradingChart
          instruments={feed.instruments}
          initialInstrument={symbol}
        />
      </>
    );
  }

  if (section === "terminal") {
    return (
      <>
        <PageHeading
          eyebrow="SIGNALS"
          title="Track record"
          description="R-multiples from closed setups"
        />
        <TerminalPerformance />
      </>
    );
  }

  if (section === "settings") return <SettingsPage />;
  if (section === "faq") return <FaqPage />;

  const info = routeInfo[section];
  if (!info) return null;

  return (
    <>
      <PageHeading
        eyebrow={info.eyebrow}
        title={info.title}
        description={info.description}
      />
      {section === "risk-disclosure" && (
        <section className="panel information-panel">
          <h2>Risk</h2>
          <p>Leverage cuts both ways. You can lose more than you put in.</p>
        </section>
      )}
      {section === "privacy" && (
        <section className="panel information-panel">
          <h2>Privacy</h2>
          <p>Prefs stay in this browser. No accounts stored here.</p>
        </section>
      )}
      {section === "terms" && (
        <section className="panel information-panel">
          <h2>Terms</h2>
          <p>Dev build. Not a live broker product.</p>
        </section>
      )}
      {section !== "risk-disclosure" &&
        section !== "privacy" &&
        section !== "terms" && (
          <UnavailablePanel
            title="Not set up"
            description={info.description}
            href="/settings"
            linkLabel="Settings"
          />
        )}
    </>
  );
}

function FundamentalsPage() {
  const [status, setStatus] = useState<FundamentalsStatus | null>(null);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impactFilter, setImpactFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");

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
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    impactFilter === "all"
      ? events
      : events.filter((e) => e.impact === impactFilter);

  return (
    <>
      <PageHeading
        eyebrow="NEWS"
        title="Calendar"
        description="High impact events"
      />

      {loading && (
        <div className="panel compact-empty" role="status">
          Loading…
        </div>
      )}

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      {!loading && status?.state === "unconfigured" && (
        <UnavailablePanel
          title="Not configured"
          description={status.message}
          href="/settings"
          linkLabel="Settings"
        />
      )}

      {!loading && status?.state === "disconnected" && (
        <div className="inline-error" role="status">
          {status.message}
        </div>
      )}

      {!loading && status?.state === "connected" && (
        <>
          <div className="signal-toolbar">
            <div
              className="terminal-periods"
              role="group"
              aria-label="Impact filter"
            >
              {(["all", "high", "medium", "low"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`timeframe-button${impactFilter === v ? " active" : ""}`}
                  aria-pressed={impactFilter === v}
                  onClick={() => setImpactFilter(v)}
                >
                  {v === "all" ? "All" : v}
                </button>
              ))}
            </div>
            <p className="signal-engine-note">
              {status.provider}
              {status.updatedAt
                ? ` · ${new Date(status.updatedAt).toLocaleTimeString()}`
                : ""}
              {` · ${filtered.length}`}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="panel empty-state compact-empty" role="status">
              No events
            </div>
          ) : (
            <section className="signal-grid" aria-label="Economic events">
              {filtered.map((ev) => {
                const dirClass =
                  ev.currencyBias === "bullish"
                    ? "bullish"
                    : ev.currencyBias === "bearish"
                      ? "bearish"
                      : "neutral";
                return (
                  <article
                    key={ev.id}
                    className={`panel signal-card signal-${dirClass}`}
                  >
                    <div className="signal-card-heading">
                      <span className="eyebrow">
                        {ev.impact.toUpperCase()} · {ev.currency}
                      </span>
                      <span
                        className={`market-session-badge ${
                          ev.volatility === "highly_volatile"
                            ? "open"
                            : "closed"
                        }`}
                      >
                        {ev.volatility === "highly_volatile"
                          ? "HIGH VOL"
                          : ev.volatility === "normal"
                            ? "NORMAL"
                            : "LOW"}
                      </span>
                    </div>

                    <div className="signal-pair-row">
                      <h2 className="signal-title">{ev.event}</h2>
                      <span
                        className={`signal-direction signal-direction-${
                          ev.currencyBias === "pending"
                            ? "neutral"
                            : ev.currencyBias
                        }`}
                      >
                        {ev.currencyBias === "bullish"
                          ? `↑ ${ev.currency}`
                          : ev.currencyBias === "bearish"
                            ? `↓ ${ev.currency}`
                            : ev.currencyBias === "pending"
                              ? "Pending"
                              : "→ Neutral"}
                      </span>
                    </div>

                    <dl className="signal-details">
                      <div>
                        <dt>Actual</dt>
                        <dd>{ev.actual ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Forecast</dt>
                        <dd>{ev.estimate ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Previous</dt>
                        <dd>{ev.previous ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Surprise</dt>
                        <dd>
                          {ev.surprise === null || ev.surprise === undefined
                            ? "—"
                            : `${ev.surprise > 0 ? "+" : ""}${ev.surprise}`}
                        </dd>
                      </div>
                    </dl>

                    {ev.affectedPairs.length > 0 && (
                      <div
                        className="quote-card-meta"
                        style={{ marginTop: "0.75rem" }}
                      >
                        {ev.affectedPairs.slice(0, 6).map((p) => (
                          <span
                            key={p.symbol}
                            style={{ marginRight: "0.75rem" }}
                          >
                            {p.symbol}{" "}
                            <strong>
                              {p.bias === "bullish"
                                ? "↑"
                                : p.bias === "bearish"
                                  ? "↓"
                                  : p.bias === "pending"
                                    ? "…"
                                    : "→"}
                            </strong>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="signal-card-footer">
                      <time className="signal-time" dateTime={ev.time}>
                        {new Date(ev.time).toLocaleString()}
                      </time>
                      <span className="eyebrow">{ev.country}</span>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
    </>
  );
}

function TerminalPerformance() {
  const [period, setPeriod] = useState<TerminalPeriod>("1w");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [signalStatus, setSignalStatus] = useState<SignalProviderStatus | null>(
    null,
  );
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSignalStatus()
      .then((value: unknown) => {
        if (!isSignalStatus(value)) {
          throw new Error("Invalid status");
        }
        if (active) {
          setSignalStatus(value);
          setStatusError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setStatusError(
            reason instanceof Error ? reason.message : "Could not load",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const customRangeError =
    period !== "custom"
      ? null
      : !startDate || !endDate
        ? "Pick both dates"
        : startDate > endDate
          ? "Start must be before end"
          : null;

  const statusMessage = statusError
    ? statusError
    : signalStatus?.state === "unconfigured"
      ? signalStatus.message
      : signalStatus?.state === "disconnected"
        ? signalStatus.message
        : signalStatus?.state === "connected"
          ? "No closed history yet"
          : "Checking…";

  return (
    <section className="panel terminal-performance">
      <div className="panel-heading">
        <div>
          <h2>Performance</h2>
        </div>
      </div>

      <div
        className="terminal-periods"
        role="group"
        aria-label="Range"
      >
        {terminalPeriods.map((option) => (
          <button
            className={`timeframe-button${period === option.value ? " active" : ""}`}
            type="button"
            key={option.value}
            aria-pressed={period === option.value}
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="terminal-custom-range">
          <label className="select-field">
            <span>From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="select-field">
            <span>To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
      )}

      {customRangeError && (
        <div className="inline-error">{customRangeError}</div>
      )}

      <div className="empty-state compact-empty">{statusMessage}</div>
    </section>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description ? <p className="subtitle">{description}</p> : null}
      </div>
    </div>
  );
}

function isSignalStatus(value: unknown): value is SignalProviderStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Record<string, unknown>;
  return (
    typeof status.message === "string" &&
    ((status.state === "unconfigured" && status.provider === null) ||
      (status.state === "connected" &&
        typeof status.provider === "string" &&
        typeof status.updatedAt === "string") ||
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
    Number.isFinite(signal.confidence) &&
    signal.confidence >= 0 &&
    signal.confidence <= 100 &&
    typeof signal.timeframe === "string" &&
    typeof signal.title === "string" &&
    typeof signal.summary === "string" &&
    typeof signal.createdAt === "string" &&
    Number.isFinite(Date.parse(signal.createdAt)) &&
    ["entry", "stopLoss", "takeProfit", "riskReward"].every(
      (field) =>
        signal[field] === undefined ||
        (typeof signal[field] === "number" && Number.isFinite(signal[field])),
    )
  );
}

function sortSignals(list: TradingSignal[]): TradingSignal[] {
  return [...list].sort((a, b) => {
    if (a.type === "setup" && b.type !== "setup") return -1;
    if (b.type === "setup" && a.type !== "setup") return 1;
    return b.confidence - a.confidence;
  });
}

function SignalCard({ signal }: { signal: SignalExtra }) {
  const isSetup = signal.type === "setup";
  return (
    <article className={`panel signal-card signal-${signal.direction}`}>
      <div className="signal-header">
        <span className="signal-pair">{signal.instrument}</span>
        <span
          className={`signal-dir ${
            signal.direction === "bullish"
              ? "buy"
              : signal.direction === "bearish"
                ? "sell"
                : "bias"
          }`}
        >
          {signal.direction === "bullish"
            ? "BUY"
            : signal.direction === "bearish"
              ? "SELL"
              : "BIAS"}
        </span>
      </div>
      <p className="signal-meta">
        {signal.timeframe} · {signal.confidence}%
        {signal.riskReward ? ` · 1:${signal.riskReward}` : ""}
        {isSetup ? " · setup" : " · bias"}
      </p>
      {signal.entry != null && (
        <div className="signal-levels">
          <div className="level">
            <span className="lbl">Entry</span>
            <span className="val">{signal.entry}</span>
          </div>
          <div className="level">
            <span className="lbl">Stop</span>
            <span className="val">{signal.stopLoss ?? "—"}</span>
          </div>
          <div className="level">
            <span className="lbl">Target</span>
            <span className="val">{signal.takeProfit ?? "—"}</span>
          </div>
        </div>
      )}
    </article>
  );
}

function SignalsPage() {
  const { favorites: marketFavorites } = useMarketFavorites();

  const [status, setStatus] = useState<SignalProviderStatus | null>(null);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);

  async function loadStatus() {
    const providerStatus: unknown = await getSignalStatus();
    if (!isSignalStatus(providerStatus)) {
      throw new Error("Invalid status");
    }
    setStatus(providerStatus);
    return providerStatus;
  }

  async function loadFavoritesSignals(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const providerStatus = await loadStatus();
      if (providerStatus.state !== "connected") {
        setSignals([]);
        setError(null);
        return;
      }

      const favs = marketFavorites.map((s) => s.toUpperCase());
      setFavorites(favs);

      if (favs.length === 0) {
        setSignals([]);
        setError(null);
        return;
      }

      const providerSignals: unknown = await getSignals({ favorites: favs });
      if (
        !Array.isArray(providerSignals) ||
        !providerSignals.every(isTradingSignal)
      ) {
        throw new Error("Invalid signals");
      }

      setSignals(sortSignals(providerSignals));
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load",
      );
      setSignals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function runSearch(symbol?: string) {
    const s = (symbol ?? query).trim().toUpperCase();
    if (!s) {
      setError("Type a pair");
      return;
    }

    setRefreshing(true);
    setError(null);

    try {
      const providerStatus = await loadStatus();
      if (providerStatus.state !== "connected") {
        setSignals([]);
        return;
      }

      const providerSignals: unknown = await getSignals({ instrument: s });
      if (
        !Array.isArray(providerSignals) ||
        !providerSignals.every(isTradingSignal)
      ) {
        throw new Error("Invalid signals");
      }

      setSignals(sortSignals(providerSignals));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load",
      );
      setSignals([]);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadFavoritesSignals();
  }, [marketFavorites.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const setupSignals = signals.filter((s) => s.type === "setup");
  const biasSignals = signals.filter((s) => s.type === "bias");

  return (
    <>
      <PageHeading
        eyebrow="SIGNALS"
        title="Signal room"
        description="Setups first · bias below"
      />

      <div className="market-filters mb-3">
        <label className="search-field">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="EURUSD"
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void runSearch()}
          disabled={refreshing}
        >
          Search
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => void loadFavoritesSignals(true)}
          disabled={refreshing}
        >
          {refreshing ? "…" : "Refresh"}
        </button>
      </div>

      {loading && (
        <div className="panel compact-empty" role="status">
          Loading…
        </div>
      )}

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      {!loading && status?.state === "unconfigured" && (
        <UnavailablePanel
          title="Not configured"
          description={status.message}
          href="/settings"
          linkLabel="Settings"
        />
      )}

      {!loading && status?.state === "disconnected" && (
        <div className="inline-error" role="status">
          {status.message}
        </div>
      )}

      {!loading &&
        status?.state === "connected" &&
        signals.length === 0 &&
        !error && (
          <div className="panel empty-state compact-empty" role="status">
            {favorites.length === 0 ? "Star pairs on Markets first" : "No setups right now"}
          </div>
        )}

      {setupSignals.length > 0 && (
        <section className="signal-section" aria-label="Setups">
          <div className="signal-section-header">
            <h2 className="signal-section-title">Setups</h2>
            <span className="signal-section-count">{setupSignals.length}</span>
          </div>
          <div className="signal-grid">
            {setupSignals.map((raw) => (
              <SignalCard key={raw.id} signal={raw as SignalExtra} />
            ))}
          </div>
        </section>
      )}

      {biasSignals.length > 0 && (
        <section className="signal-section" aria-label="Bias">
          <div className="signal-section-header">
            <h2 className="signal-section-title">Bias</h2>
            <span className="signal-section-count">{biasSignals.length}</span>
          </div>
          <div className="signal-grid">
            {biasSignals.map((raw) => (
              <SignalCard key={raw.id} signal={raw as SignalExtra} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function UnavailablePanel({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <section className="panel unavailable-panel">
      <div className="empty-state-icon" aria-hidden="true">
        ◌
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="secondary-button" href={href}>
        {linkLabel}
      </Link>
    </section>
  );
}

function SettingsPage() {
  const { preferences, updatePreferences } = usePreferences();
  const feed = useMarketFeed();
  const hydrated = useHydrated();

  return (
    <>
      <PageHeading
        eyebrow="SETTINGS"
        title="Settings"
        description="Theme · chart · broker"
      />
      <div className="settings-group">
        <h2>Look</h2>
        <div className="setting-row">
          <div className="icon">◐</div>
          <div className="setting-body">
            <p className="setting-title">Theme</p>
            <p className="setting-desc">Light / dark / system</p>
          </div>
          <div
            className="segmented-control"
            role="group"
            aria-label="Theme"
          >
            {(["light", "dark", "system"] as ThemePreference[]).map(
              (theme) => (
                <button
                  type="button"
                  key={theme}
                  className={
                    (hydrated ? preferences.theme : "system") === theme
                      ? "selected"
                      : ""
                  }
                  aria-pressed={
                    (hydrated ? preferences.theme : "system") === theme
                  }
                  onClick={() => updatePreferences({ theme })}
                >
                  {theme[0].toUpperCase() + theme.slice(1)}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h2>Chart</h2>
        <div className="setting-row">
          <div className="icon">⌁</div>
          <div className="setting-body">
            <p className="setting-title">Default TF</p>
            <p className="setting-desc">Used on Chart open</p>
          </div>
          <select
            value={hydrated ? preferences.defaultTimeframe : "H1"}
            onChange={(event) =>
              updatePreferences({
                defaultTimeframe: event.target
                  .value as typeof preferences.defaultTimeframe,
              })
            }
          >
            {["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"].map(
              (timeframe) => (
                <option value={timeframe} key={timeframe}>
                  {timeframe}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <div className="settings-group">
        <h2>Feed</h2>
        <div className="setting-row">
          <div className="icon">◈</div>
          <div className="setting-body">
            <p className="setting-title">Provider</p>
            <p className="setting-desc">
              {feed.status?.state === "connected"
                ? feed.status.provider
                : "Not linked"}
            </p>
          </div>
          <span
            className={`badge-status ${
              feed.status?.state === "connected" ? "on" : "off"
            }`}
          >
            {feed.status?.state === "connected" ? "On" : "Off"}
          </span>
        </div>
        <div className="setting-row">
          <div className="icon">⚙</div>
          <div className="setting-body">
            <p className="setting-title">Broker</p>
            <p className="setting-desc">MT5 not linked</p>
          </div>
          <span className="badge-status off">Off</span>
        </div>
      </div>
    </>
  );
}

function FaqPage() {
  const items = [
    {
      q: "Is this live trading?",
      a: "No. Quotes and signals only. No order routing.",
    },
    {
      q: "Where do signals come from?",
      a: "Your connected data + the technical engine.",
    },
    {
      q: "Can I link MT5?",
      a: "Not yet. Status shows in Settings.",
    },
  ];

  return (
    <>
      <PageHeading eyebrow="HELP" title="FAQ" description="" />
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
