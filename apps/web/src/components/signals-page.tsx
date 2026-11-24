"use client";

import { useEffect, useState } from "react";
import type { SignalProviderStatus, TradingSignal } from "@veytrix/shared";
import { getSignalStatus, getSignals } from "@/lib/market-data-api";
import { useMarketFavorites } from "./market-watch";

const DEFAULT_PAIRS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAUUSD",
  "AUDUSD",
  "USDCAD",
  "XAGUSD",
  "GBPJPY",
];

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

function fmt(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return String(n);
}

export function SignalsPage() {
  const { favorites: marketFavorites } = useMarketFavorites();
  const [status, setStatus] = useState<SignalProviderStatus | null>(null);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "setup" | "bias">("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [expandedBiasIds, setExpandedBiasIds] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  async function load() {
    setRefreshing(true);
    setScanError(null);
    try {
      const st = await getSignalStatus();
      if (!isSignalStatus(st)) throw new Error("Invalid status");
      setStatus(st);
      if (st.state !== "connected") {
        setSignals([]);
        return;
      }
      const favs = marketFavorites.map((s) => s.toUpperCase());
      const pairs = favs.length > 0 ? favs : DEFAULT_PAIRS;
      const raw = await getSignals({ favorites: pairs });
      if (!Array.isArray(raw) || !raw.every(isTradingSignal)) {
        setSignals([]);
        return;
      }
      setSignals(sortSignals(raw));
    } catch (error) {
      setSignals([]);
      setScanError(
        error instanceof Error
          ? error.message
          : "Signal scan failed. Check that the Veytrix API is running.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [marketFavorites.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runSearch() {
    const s = query.trim().toUpperCase();
    if (!s) {
      void load();
      return;
    }
    setRefreshing(true);
    setScanError(null);
    try {
      const raw = await getSignals({ instrument: s });
      if (Array.isArray(raw) && raw.every(isTradingSignal)) {
        setSignals(sortSignals(raw));
      }
    } catch (error) {
      setScanError(
        error instanceof Error
          ? error.message
          : "The requested pair could not be analysed.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  const setups = signals.filter((s) => s.type === "setup");
  const biases = signals.filter((s) => s.type === "bias");
  const showSetups = filter === "all" || filter === "setup";
  const showBias = filter === "all" || filter === "bias";

  return (
    <div className="sig-screen">
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
          placeholder="Search a pair — e.g. XAUUSD"
          onKeyDown={(e) => e.key === "Enter" && void runSearch()}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={() => void runSearch()}
        >
          Get bias
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => void load()}
          disabled={refreshing}
        >
          {refreshing ? "…" : "Refresh"}
        </button>
      </div>

      {loading && <div className="home-empty">Loading…</div>}

      {scanError && <div className="home-empty">{scanError}</div>}

      {!loading && !scanError && setups.length === 0 && biases.length === 0 && (
        <div className="home-empty">
          {status?.state === "connected"
            ? "No valid setup or directional bias was returned. Check the pair scan and candle history."
            : status?.message ?? "Engine offline"}
        </div>
      )}

      {/* SETUP CARDS only */}
      {showSetups &&
        setups.map((signal) => {
          const isBuy = signal.direction === "bullish";
          const isSell = signal.direction === "bearish";
          const dir = isBuy ? "BUY" : isSell ? "SELL" : "BIAS";
          const closed =
            typeof signal.summary === "string" &&
            signal.summary.toLowerCase().includes("market closed");
          const tp1 = signal.takeProfit1 ?? signal.takeProfit;
          const tp2 = signal.takeProfit2;
          const tp3 = signal.takeProfit3 ?? signal.takeProfit;

          return (
            <article
              key={signal.id}
              className={`vx-sig-card ${isBuy ? "buy" : isSell ? "sell" : "neutral"}`}
            >
              <div className="vx-sig-head">
                <span className="vx-sig-kind">
                  <span className="vx-sig-dot" />
                  SETUP · {signal.timeframe}
                </span>
                <span className={`vx-sig-status${closed ? " closed" : ""}`}>
                  {closed ? "CLOSED" : "ACTIVE"}
                </span>
              </div>

              <div className="vx-sig-title">
                <strong>{signal.instrument}</strong>
                <span
                  className={`vx-sig-dir ${isBuy ? "buy" : isSell ? "sell" : "bias"}`}
                >
                  {isSell ? "↓ " : isBuy ? "↑ " : ""}
                  {dir}
                </span>
              </div>

              {signal.summary && (
                <p className="vx-sig-summary">{signal.summary}</p>
              )}

              <div className="vx-sig-grid">
                <div>
                  <span>Confidence</span>
                  <strong>{signal.confidence}%</strong>
                </div>
                <div>
                  <span>Entry</span>
                  <strong>{fmt(signal.entry)}</strong>
                </div>
                <div>
                  <span>SL</span>
                  <strong>{fmt(signal.stopLoss)}</strong>
                </div>
                <div>
                  <span>TP1</span>
                  <strong>{fmt(tp1)}</strong>
                </div>
                <div>
                  <span>TP2</span>
                  <strong>{fmt(tp2)}</strong>
                </div>
                <div>
                  <span>TP3</span>
                  <strong>{fmt(tp3)}</strong>
                </div>
                <div>
                  <span>R:R</span>
                  <strong>
                    {signal.riskReward != null
                      ? `1:${signal.riskReward}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Risk</span>
                  <strong>
                    {signal.riskPips != null ? `${signal.riskPips} pips` : "—"}
                  </strong>
                </div>
                <div>
                  <span>Reward</span>
                  <strong>
                    {signal.rewardPips != null
                      ? `${signal.rewardPips} pips`
                      : "—"}
                  </strong>
                </div>
              </div>
            </article>
          );
        })}

      {/* BIAS — separate rows, not setup cards */}
      {showBias && biases.length > 0 && (
        <div className="sig-bias-block">
          <h3>Bias only</h3>
          <p className="sig-bias-note">
            No valid entry yet — wait for confluence
          </p>
          {biases.map((b) => {
            const expanded = expandedBiasIds.includes(b.id);
            const detailsId = "bias-details-" + b.id.replace(/[^a-zA-Z0-9_-]/g, "-");
            return (
              <div className="sig-bias-item" key={b.id}>
                <button
                  type="button"
                  className="sig-bias-row"
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  onClick={() =>
                    setExpandedBiasIds((current) =>
                      expanded
                        ? current.filter((id) => id !== b.id)
                        : [...current, b.id],
                    )
                  }
                >
                  <span
                    className={`sig-bias-dot ${b.direction === "bullish" ? "up" : b.direction === "bearish" ? "down" : ""}`}
                  />
                  <span>
                    <strong>
                      {b.instrument} ·{" "}
                      {b.direction === "bullish"
                        ? "Bullish bias"
                        : b.direction === "bearish"
                          ? "Bearish bias"
                          : "Neutral bias"}{" "}
                      · {b.confidence}%
                    </strong>
                    <span>{b.summary}</span>
                  </span>
                  <span className={"chevron" + (expanded ? " expanded" : "")}>›</span>
                </button>
                <p className="sig-bias-note">
                  {b.technicalExplanation || b.summary}
                </p>
                {expanded ? (
                  <div className="sig-bias-expanded" id={detailsId}>
                    <div>
                      <strong>Technical</strong>
                      <p>{b.technicalExplanation || b.summary}</p>
                    </div>
                    <div>
                      <strong>Fundamental</strong>
                      <p>{b.fundamentalExplanation || "No confirmed recent fundamental direction is available for this pair."}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
