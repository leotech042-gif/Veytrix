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

function formatPrice(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function formatReward(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `1:${value.toFixed(1)}`;
}

export function SignalsPage() {
  const { favorites: marketFavorites } = useMarketFavorites();
  const [status, setStatus] = useState<SignalProviderStatus | null>(null);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "setup" | "bias">("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [expandedBias, setExpandedBias] = useState<string[]>([]);

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
      const pairs = favs.length > 0 ? favs : DEFAULT_PAIRS;
      const raw = await getSignals({ favorites: pairs });
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
    // Auto refresh every 60s
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
  const shownSetups = filter === "bias" ? [] : setups;
  const shownBiases = filter === "setup" ? [] : biases;

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
        <button type="button" className="secondary-button" onClick={() => void runSearch()}>
          Get bias
        </button>
        <button type="button" className="text-button" onClick={() => void load()} disabled={refreshing}>
          {refreshing ? "…" : "Refresh"}
        </button>
      </div>

      {loading && <div className="home-empty">Loading…</div>}

      {!loading && shownSetups.length === 0 && shownBiases.length === 0 && (
        <div className="home-empty">
          {status?.state === "connected" ? "No setups right now" : "Engine offline"}
        </div>
      )}

      {shownSetups.map((signal) => {
        const isBuy = signal.direction === "bullish";
        const isSell = signal.direction === "bearish";
        const dir = isBuy ? "BUY" : isSell ? "SELL" : "BIAS";
        const closed =
          typeof signal.summary === "string" &&
          signal.summary.toLowerCase().includes("market closed");
        return (
          <article
            key={signal.id}
            className={`vx-sig-card ${isBuy ? "buy" : isSell ? "sell" : "neutral"}`}
          >
            <div className="vx-sig-head">
              <span className="vx-sig-kind">
                <span className="vx-sig-dot" />
                {signal.type === "setup" ? "SETUP" : "BIAS"} · {signal.timeframe}
              </span>
              <span className={`vx-sig-status${closed ? " closed" : ""}`}>
                {closed ? "CLOSED" : "ACTIVE"}
              </span>
            </div>

            <div className="vx-sig-title">
              <strong>{signal.instrument}</strong>
              <span className={`vx-sig-dir ${isBuy ? "buy" : isSell ? "sell" : "bias"}`}>
                {isSell ? "↓ " : isBuy ? "↑ " : ""}
                {dir}
              </span>
            </div>

            {signal.summary && <p className="vx-sig-summary">{signal.summary}</p>}

            {signal.type === "setup" && signal.tags && signal.tags.length > 0 && (
              <div className="sig-filters vx-sig-tags" aria-label="Strategy confirmations">
                {signal.tags.map((tag) => (
                  <span className="vx-sig-status" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="vx-sig-grid">
              <div>
                <span>Confidence</span>
                <strong>{signal.confidence}%</strong>
              </div>
              {signal.type === "setup" ? (
                <>
                  <div>
                    <span>Entry</span>
                    <strong>{formatPrice(signal.entry)}</strong>
                  </div>
                  <div>
                    <span>Stop Loss</span>
                    <strong>{formatPrice(signal.stopLoss)}</strong>
                  </div>
                  <div>
                    <span>Take Profit 1</span>
                    <strong>{formatPrice(signal.takeProfit1 ?? signal.takeProfit)}</strong>
                  </div>
                  <div>
                    <span>Take Profit 2</span>
                    <strong>{formatPrice(signal.takeProfit2)}</strong>
                  </div>
                  <div>
                    <span>Take Profit 3</span>
                    <strong>{formatPrice(signal.takeProfit3)}</strong>
                  </div>
                  <div>
                    <span>R:R at TP1</span>
                    <strong>{formatReward(signal.riskReward1)}</strong>
                  </div>
                  <div>
                    <span>R:R at TP2</span>
                    <strong>{formatReward(signal.riskReward2)}</strong>
                  </div>
                  <div>
                    <span>R:R at TP3</span>
                    <strong>{formatReward(signal.riskReward3 ?? signal.riskReward)}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>Signal</span>
                    <strong>Directional bias only</strong>
                  </div>
                  <div>
                    <span>Direction</span>
                    <strong>{dir}</strong>
                  </div>
                </>
              )}
            </div>
          </article>
        );
      })}

      {!loading && shownBiases.length > 0 && (
        <div className="sig-bias-block">
          <h3>Bias only</h3>
          <p className="sig-bias-note">Directional context only · no confirmed entry yet</p>
          {shownBiases.map((b) => {
            const expanded = expandedBias.includes(b.id);
            const biasLabel = b.direction === "bullish" ? "Bullish bias" : b.direction === "bearish" ? "Bearish bias" : "Neutral bias";
            const reasons = b.summary.split(".").map((reason) => reason.trim()).filter(Boolean);
            return (
              <div key={b.id} className={`sig-bias-item ${b.direction}`}>
                <button type="button" className="sig-bias-row" aria-expanded={expanded} aria-controls={`bias-details-${b.id}`}
                  onClick={() => setExpandedBias((current) => current.includes(b.id) ? current.filter((id) => id !== b.id) : [...current, b.id])}>
                  <span className="sig-bias-dot" />
                  <span><strong>{b.instrument} · {biasLabel}</strong><span>{b.summary}</span></span>
                  <span className={`chevron ${expanded ? "expanded" : ""}`} aria-hidden="true">⌄</span>
                </button>
                {expanded && (
                  <div className="sig-bias-details" id={`bias-details-${b.id}`}>
                    <section><h4>Technical explanation</h4>
                      {reasons.length > 0 ? <ul>{reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : <p>No technical explanation was supplied by the signal engine.</p>}
                      <p className="sig-bias-disclaimer">This is the engine’s current technical reasoning, not a guaranteed forecast.</p>
                    </section>
                    <section><h4>Fundamental context</h4>
                      <p>Fundamental event analysis is not currently attached to bias signals. Check the News page for the economic calendar before treating this bias as a complete technical and fundamental view.</p>
                    </section>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
