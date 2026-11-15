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
    title: "Trading History",
    eyebrow: "ACCOUNT ACTIVITY",
    description:
      "Trading history requires an authenticated broker integration. No trades or account records are available.",
  },
  assistant: {
    title: "AI Assistant",
    eyebrow: "RESEARCH TOOLS",
    description:
      "An AI service is not configured. This page does not provide generated market analysis or trade recommendations.",
  },
  privacy: {
    title: "Privacy information",
    eyebrow: "LEGAL INFORMATION",
    description:
      "This project foundation does not implement user accounts or store broker credentials. Local interface preferences are saved in this browser.",
  },
  terms: {
    title: "Terms of use",
    eyebrow: "LEGAL INFORMATION",
    description:
      "This project is a development foundation, not a financial service. A reviewed, jurisdiction-specific terms document must be supplied before public launch.",
  },
  "risk-disclosure": {
    title: "Risk disclosure",
    eyebrow: "IMPORTANT INFORMATION",
    description:
      "Trading foreign exchange, CFDs, crypto assets, and leveraged products carries substantial risk. You may lose some or all of your invested capital.",
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
          eyebrow="PROVIDER-DISCOVERED INSTRUMENTS"
          title="Markets"
          description="Search and filter the instruments actually supported by your connected market-data provider."
        />
        <MarketWatch feed={feed} />
      </>
    );
  }

  if (section === "charts") {
    return (
      <>
        <PageHeading
          eyebrow="TECHNICAL ANALYSIS"
          title="Charts"
          description="Interactive charts with drawing tools and a theme that follows your workspace."
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
          eyebrow="PROFESSIONAL TRADING WORKSPACE"
          title="Trading terminal"
          description="Chart-led market workspace with instrument watchlist, technical tools and verified market data."
        />
        <section className="terminal-workspace" aria-label="Trading terminal workspace">
          <div className="terminal-workspace-chart">
            <TradingChart
              instruments={feed.instruments}
              initialInstrument={symbol || "XAUUSD"}
            />
          </div>
          <aside className="terminal-workspace-watch">
            <MarketWatch feed={feed} favoritesOnly compact />
          </aside>
        </section>
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
          <h2>Leveraged trading risk</h2>
          <p>
            Foreign exchange, contracts for difference, crypto assets, and other
            leveraged products can move rapidly. Leverage magnifies both gains
            and losses; losses may exceed your initial deposit depending on the
            product and jurisdiction.
          </p>
          <p>
            Market data may be delayed, incomplete, or unavailable. Verify data
            with your provider and understand the product terms before making
            financial decisions. Nothing on Veytrix is investment advice.
          </p>
          <p>
            This general notice is not a substitute for provider risk documents
            or jurisdiction-specific legal disclosures.
          </p>
        </section>
      )}
      {section === "privacy" && (
        <section className="panel information-panel">
          <h2>Current data handling</h2>
          <p>
            This workspace currently stores appearance, chart, and favourite
            instrument preferences in this browser. Those settings are not
            credentials.
          </p>
          <p>
            The project does not currently implement authentication, broker
            account storage, or a server-side user database. Provider
            credentials belong in server-side environment configuration and must
            never be placed in browser storage.
          </p>
          <p>
            A complete privacy policy must be reviewed and supplied before
            collecting personal or account information in production.
          </p>
        </section>
      )}
      {section === "terms" && (
        <section className="panel information-panel">
          <h2>Before public launch</h2>
          <p>
            This development foundation does not establish a customer
            relationship, offer brokerage services, or provide investment
            advice.
          </p>
          <p>
            Replace this notice with reviewed terms and jurisdiction-specific
            disclosures before offering the platform to users.
          </p>
        </section>
      )}
      {section !== "risk-disclosure" &&
        section !== "privacy" &&
        section !== "terms" && (
          <UnavailablePanel
            title="Integration not configured"
            description={info.description}
            href="/settings"
            linkLabel="Review available settings"
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
          setError(
            e instanceof Error ? e.message : "Fundamentals could not load.",
          );
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
        eyebrow="MARKET RESEARCH"
        title="Fundamental Analysis"
        description="Economic calendar from Finnhub · actual vs forecast · currency and pair bias"
      />

      {loading && (
        <div className="panel compact-empty" role="status">
          Loading economic calendar…
        </div>
      )}

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      {!loading && status?.state === "unconfigured" && (
        <UnavailablePanel
          title="Fundamentals not configured"
          description={status.message}
          href="/settings"
          linkLabel="Review settings"
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
                  {v === "all" ? "All impact" : v}
                </button>
              ))}
            </div>
            <p className="signal-engine-note">
              {status.provider}
              {status.updatedAt
                ? ` · ${new Date(status.updatedAt).toLocaleTimeString()}`
                : ""}
              {` · ${filtered.length} events`}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="panel empty-state compact-empty" role="status">
              No events in this window for the selected filter.
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

                    <p className="signal-summary">{ev.analysis}</p>

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
          throw new Error("The signal API returned an invalid status.");
        }
        if (active) {
          setSignalStatus(value);
          setStatusError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setStatusError(
            reason instanceof Error
              ? reason.message
              : "Signal-analysis status could not be loaded.",
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
        ? "Choose both dates to define the custom range."
        : startDate > endDate
          ? "The start date must be on or before the end date."
          : null;

  const statusMessage = statusError
    ? `Signal statistics unavailable: ${statusError}`
    : signalStatus?.state === "unconfigured"
      ? signalStatus.message
      : signalStatus?.state === "disconnected"
        ? signalStatus.message
        : signalStatus?.state === "connected"
          ? "Signal history, a persistent store, and verified historical candles are not configured. Performance cannot be calculated yet."
          : "Checking signal-analysis availability…";

  return (
    <section className="panel terminal-performance">
      <div className="panel-heading">
        <div>
          <h2>Signal performance</h2>
          <p className="panel-description">
            Closed signals only · returns shown in R-multiples
          </p>
        </div>
      </div>

      <div
        className="terminal-periods"
        role="group"
        aria-label="Signal performance date range"
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
              aria-label="Start date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="select-field">
            <span>To</span>
            <input
              aria-label="End date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
      )}

      {customRangeError && (
        <p className="terminal-range-error" role="status">
          {customRangeError}
        </p>
      )}

      <div
        className="terminal-stat-grid"
        aria-label="Signal performance statistics"
      >
        {[
          ["Win rate", "Closed winning signals ÷ closed signals"],
          ["Total profits", "Positive outcomes, measured in R"],
          ["Total loss", "Negative outcomes, measured in R"],
          ["Trading sessions", "Signals with verified outcomes"],
        ].map(([label, description]) => (
          <article className="stat-card terminal-stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value" aria-label={`${label} unavailable`}>
              —
            </div>
            <div className="stat-foot">{description}</div>
          </article>
        ))}
      </div>

      <div className="terminal-history-grid">
        <section
          className="terminal-history-panel"
          aria-labelledby="terminal-win-rate-title"
        >
          <div className="panel-heading">
            <div>
              <h3 id="terminal-win-rate-title">Historical win rate</h3>
              <p className="panel-description">
                Closed signals in the selected period
              </p>
            </div>
          </div>
          <div className="terminal-donut-wrap">
            <svg
              className="terminal-donut"
              viewBox="0 0 160 160"
              role="img"
              aria-label="Win rate chart unavailable because verified signal history is not configured"
            >
              <circle
                className="terminal-donut-track"
                cx="80"
                cy="80"
                r="62"
                fill="none"
                strokeWidth="14"
              />
            </svg>
            <div className="terminal-donut-label" aria-hidden="true">
              <strong>—</strong>
              <span>Win rate</span>
            </div>
          </div>
          <p className="terminal-chart-empty">
            No verified signal outcomes for this period.
          </p>
        </section>

        <section
          className="terminal-history-panel"
          aria-labelledby="terminal-pnl-title"
        >
          <div className="panel-heading">
            <div>
              <h3 id="terminal-pnl-title">Profit &amp; loss history</h3>
              <p className="panel-description">
                Realized signal outcomes · R-multiples
              </p>
            </div>
            <div className="terminal-chart-legend" aria-label="Chart legend">
              <span>
                <i className="terminal-legend-profit" /> Profit
              </span>
              <span>
                <i className="terminal-legend-loss" /> Loss
              </span>
            </div>
          </div>
          <div className="terminal-line-chart">
            <svg
              viewBox="0 0 640 220"
              preserveAspectRatio="none"
              role="img"
              aria-label="Profit and loss history chart unavailable because verified signal history is not configured"
            >
              <line
                x1="42"
                y1="24"
                x2="42"
                y2="184"
                className="terminal-chart-axis"
              />
              <line
                x1="42"
                y1="184"
                x2="620"
                y2="184"
                className="terminal-chart-axis"
              />
              <line
                x1="42"
                y1="64"
                x2="620"
                y2="64"
                className="terminal-chart-gridline"
              />
              <line
                x1="42"
                y1="104"
                x2="620"
                y2="104"
                className="terminal-chart-gridline"
              />
              <line
                x1="42"
                y1="144"
                x2="620"
                y2="144"
                className="terminal-chart-gridline"
              />
            </svg>
            <div className="terminal-line-chart-empty">
              No verified profit/loss history for this period.
            </div>
          </div>
          <div className="terminal-chart-axis-labels" aria-hidden="true">
            <span>Profit / loss (R)</span>
            <span>Signal date</span>
          </div>
        </section>
      </div>

      <div
        className={`terminal-performance-status${statusError ? " inline-error" : ""}`}
        role={statusError ? "alert" : "status"}
      >
        {statusMessage}
      </div>
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
        <p className="subtitle">{description}</p>
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
  const marketOpen = signal.marketOpen !== false;
  const isSetup = signal.type === "setup";

  return (
    <article className={`panel signal-card signal-${signal.direction}`}>
      <div className="signal-card-heading">
        <div className="signal-card-title-row">
          {marketOpen ? (
            <span
              className="signal-live-indicator"
              title="Market open · active"
              aria-hidden="true"
            />
          ) : (
            <span
              className="signal-closed-dot"
              title="Market closed"
              aria-hidden="true"
            />
          )}
          <span className="eyebrow">
            {signal.type.toUpperCase()} · {signal.timeframe}
          </span>
        </div>
        <span
          className={`market-session-badge ${marketOpen ? "open" : "closed"}`}
        >
          {marketOpen ? "OPEN" : "CLOSED"}
        </span>
      </div>

      <div className="signal-pair-row">
        <h2 className="signal-title">{signal.instrument}</h2>
        <span
          className={`signal-direction signal-direction-${signal.direction}`}
        >
          {isSetup
            ? signal.direction === "bullish"
              ? "↑ Buy"
              : "↓ Sell"
            : signal.direction === "bullish"
              ? "↑ Bullish"
              : signal.direction === "bearish"
                ? "↓ Bearish"
                : "→ Neutral"}
        </span>
      </div>

      <p className="signal-summary">{signal.summary}</p>

      <dl className="signal-details">
        <div>
          <dt>Confidence</dt>
          <dd>{signal.confidence}%</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{signal.type}</dd>
        </div>
        {signal.entry !== undefined && (
          <div>
            <dt>Entry</dt>
            <dd>{signal.entry}</dd>
          </div>
        )}
        {signal.stopLoss !== undefined && (
          <div>
            <dt>SL</dt>
            <dd>{signal.stopLoss}</dd>
          </div>
        )}
        {signal.takeProfit !== undefined && (
          <div>
            <dt>TP</dt>
            <dd>{signal.takeProfit}</dd>
          </div>
        )}
        {signal.riskReward !== undefined && (
          <div>
            <dt>R:R</dt>
            <dd>1:{signal.riskReward}</dd>
          </div>
        )}
      </dl>

      <div className="signal-card-footer">
        <time className="signal-time" dateTime={signal.createdAt}>
          {new Date(signal.createdAt).toLocaleString()}
        </time>
        <Link
          className="secondary-button signal-chart-link"
          href={`/charts?symbol=${encodeURIComponent(signal.instrument)}`}
        >
          Open chart
        </Link>
      </div>
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
      throw new Error("The signal API returned an invalid status.");
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
        throw new Error("The signal API returned invalid signal data.");
      }

      setSignals(sortSignals(providerSignals));
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Signal analysis could not be loaded.",
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
      setError("Type a pair, e.g. XAUUSD or EURUSD");
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

      const searchedRaw: unknown = await getSignals({ instrument: s });
      if (!Array.isArray(searchedRaw) || !searchedRaw.every(isTradingSignal)) {
        throw new Error("The signal API returned invalid signal data.");
      }

      const searched = searchedRaw as TradingSignal[];
      const favs = marketFavorites.map((s) => s.toUpperCase());
      setFavorites(favs);

      let merged: TradingSignal[] = searched;

      if (favs.length > 0) {
        const favRaw: unknown = await getSignals({ favorites: favs });
        if (Array.isArray(favRaw) && favRaw.every(isTradingSignal)) {
          const searchedSet = new Set(
            searched.map((x) => x.instrument.toUpperCase()),
          );
          const rest = (favRaw as TradingSignal[]).filter(
            (x) => !searchedSet.has(x.instrument.toUpperCase()),
          );
          merged = [...searched, ...rest];
        }
      }

      setSignals(sortSignals(merged));

      if (!searched.length) {
        setError(`No bias returned for ${s}`);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Signal analysis could not be loaded.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadFavoritesSignals();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketFavorites.join(",")]);

  const setupSignals = signals.filter((s) => s.type === "setup");
  const biasSignals = signals.filter((s) => s.type !== "setup");

  return (
    <>
      <PageHeading
        eyebrow="MARKET RESEARCH"
        title="Signal Room"
        description="All favourites · setups on top · search only if the pair is not favourited"
      />

      {!loading && status?.state === "connected" && (
        <div className="signal-toolbar">
          <div className="signal-search-row">
            <input
              className="signal-search-input"
              placeholder="Search a pair not in favourites — e.g. XAUUSD"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              aria-label="Search instrument for bias"
            />
            <button
              type="button"
              className="primary-button"
              onClick={() => void runSearch()}
              disabled={refreshing}
            >
              {refreshing ? "Scanning…" : "Get bias"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadFavoritesSignals(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Favourites"}
            </button>
          </div>
          <p className="signal-engine-note">
            Veytrix Technical Engine
            {status.updatedAt
              ? ` · ${new Date(status.updatedAt).toLocaleTimeString()}`
              : ""}
            {favorites.length > 0
              ? ` · favourites: ${favorites.join(", ")}`
              : " · no favourites yet — star pairs on Markets"}
          </p>
        </div>
      )}

      {loading && (
        <div className="panel compact-empty" role="status">
          Checking signal-analysis provider…
        </div>
      )}

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      {!loading && status?.state === "unconfigured" && (
        <UnavailablePanel
          title="Signal analysis not configured"
          description={status.message}
          href="/settings"
          linkLabel="Review available settings"
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
            {favorites.length === 0
              ? "Add favourite pairs on Markets, then open Signal Room — or search a pair above."
              : "Engine is active. No bias returned for favourites yet."}
          </div>
        )}

      {setupSignals.length > 0 && (
        <section className="signal-section" aria-label="Active setups">
          <div className="signal-section-header">
            <h2 className="signal-section-title">Setups</h2>
            <span className="signal-section-count">
              {setupSignals.length} active
            </span>
          </div>
          <div className="signal-grid">
            {setupSignals.map((raw) => (
              <SignalCard key={raw.id} signal={raw as SignalExtra} />
            ))}
          </div>
        </section>
      )}

      {biasSignals.length > 0 && (
        <section className="signal-section" aria-label="Directional bias">
          <div className="signal-section-header">
            <h2 className="signal-section-title">
              {setupSignals.length > 0 ? "Bias only" : "Directional bias"}
            </h2>
            <span className="signal-section-count">
              {biasSignals.length} pair
              {biasSignals.length === 1 ? "" : "s"}
            </span>
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
        eyebrow="WORKSPACE PREFERENCES"
        title="Settings"
        description="Personalize this browser's workspace. Secrets and broker credentials are never saved here."
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <h2>Appearance</h2>
          <p className="panel-description">
            Choose a theme or follow your operating system.
          </p>
          <div className="setting-control">
            <span className="setting-label">Color theme</span>
            <div
              className="segmented-control"
              role="group"
              aria-label="Color theme"
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
                    {theme[0].toLocaleUpperCase() + theme.slice(1)}
                  </button>
                ),
              )}
            </div>
          </div>
          <ColorSetting
            label="Accent color"
            value={hydrated ? preferences.accentColor : "#c6f36b"}
            onChange={(accentColor) => updatePreferences({ accentColor })}
          />
          <ColorSetting
            label="Chart background"
            value={hydrated ? preferences.chartBackground : "#0e141d"}
            onChange={(chartBackground) =>
              updatePreferences({ chartBackground })
            }
          />
          <ColorSetting
            label="Bullish candle"
            value={hydrated ? preferences.bullishColor : "#8bd878"}
            onChange={(bullishColor) => updatePreferences({ bullishColor })}
          />
          <ColorSetting
            label="Bearish candle"
            value={hydrated ? preferences.bearishColor : "#ed7777"}
            onChange={(bearishColor) => updatePreferences({ bearishColor })}
          />
        </section>

        <section className="panel settings-panel">
          <h2>Chart defaults</h2>
          <p className="panel-description">
            Saved locally in this browser and applied to the chart.
          </p>
          <label className="setting-control">
            <span className="setting-label">Default timeframe</span>
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
          </label>
          <label className="setting-control">
            <span className="setting-label">Default instrument</span>
            <select
              value={hydrated ? preferences.defaultInstrument : ""}
              onChange={(event) =>
                updatePreferences({ defaultInstrument: event.target.value })
              }
              disabled={feed.instruments.length === 0}
            >
              <option value="">
                {feed.instruments.length
                  ? "Choose an instrument"
                  : "No supported instruments available"}
              </option>
              {feed.instruments.map((instrument) => (
                <option value={instrument.symbol} key={instrument.symbol}>
                  {instrument.symbol} · {instrument.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-inline-status">
            {feed.status?.state === "connected"
              ? `Provider: ${feed.status.provider}`
              : (feed.error ?? "No provider is connected.")}
          </div>
        </section>

        <section className="panel settings-panel">
          <h2>Account and provider</h2>
          <p className="panel-description">
            Authentication and broker connections have not been implemented.
          </p>
          <div className="integration-callout">
            <strong>Keep provider secrets server-side</strong>
            <p>
              Select a licensed provider and configure its credentials in the
              API&apos;s local environment. Do not enter credentials in this
              page or browser storage. A provider connection test will be
              available only when a compatible adapter supports it.
            </p>
          </div>
          <p className="settings-inline-status">
            Account profile, sign-out, price alerts, and notification settings
            require additional integrations.
          </p>
        </section>

        <section className="panel settings-panel">
          <h2>Official social profiles</h2>
          <p className="panel-description">
            Only project-configured official URLs are displayed. Update public
            URL variables in the web app environment to change these links.
          </p>
          <div className="configured-social-links">
            {getOfficialSocialLinks().length > 0 ? (
              getOfficialSocialLinks().map((link) => (
                <a
                  className="secondary-button"
                  href={link.url}
                  key={link.label}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              ))
            ) : (
              <span className="settings-inline-status">
                No official social URLs are configured.
              </span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function ColorSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="setting-control">
      <span className="setting-label">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FaqPage() {
  const questions = [
    {
      q: "What is Veytrix?",
      a: "Veytrix is a trading-workspace foundation. Market prices, account information, research, and execution are available only when their respective real integrations are configured.",
    },
    {
      q: "Which markets are supported?",
      a: "The interface can display forex, metals, crypto, indices, energy, synthetic, and other instruments that a connected provider actually returns. No instrument is assumed to be available before provider discovery.",
    },
    {
      q: "Where does market data come from?",
      a: "Market quotes are requested from the server-side provider adapter currently configured in the API. Availability depends on its credentials and provider response.",
    },
    {
      q: "How do I use charts?",
      a: "Choose an instrument returned by the provider and a timeframe. Candles, optional volume, and SMA 20 / EMA 20 overlays use returned historical data. Pan, zoom, crosshair, and full-screen chart mode are supported. Drawing tools are not implemented.",
    },
    {
      q: "How do I configure a broker connection?",
      a: "Choose a compatible broker and confirm its authorization, region, licensing, and API requirements. Provider credentials must be configured on the server and never placed in frontend code or browser storage.",
    },
    {
      q: "How do technical indicators work?",
      a: "The chart offers 20-period simple and exponential moving averages calculated from the displayed real closes. Volume is shown only when the provider supplies volume values.",
    },
    {
      q: "How is my account secured?",
      a: "Authentication and broker account access are not implemented in this foundation. Do not use it to enter or store account credentials. Security controls must be completed before connecting real accounts.",
    },
    {
      q: "Which features need additional setup?",
      a: "Live instruments, quotes, history, account data, signals, fundamentals, AI features, alerts, and trading require their own compatible providers or services. Order execution is not enabled.",
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow="HELP CENTER"
        title="Frequently asked questions"
        description="Answers reflect the integrations currently present in this project."
      />
      <section className="panel faq-list">
        {questions.map(({ q, a }) => (
          <details className="faq-item" key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </>
  );
}
