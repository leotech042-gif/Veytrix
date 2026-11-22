"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SignalProviderStatus, TradingSignal } from "@veytrix/shared";
import { getSignalStatus, getSignals } from "@/lib/market-data-api";
import { useMarketFavorites } from "./market-watch";

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

export function SignalsPage() {
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

      {!loading && shown.length === 0 && (
        <div className="home-empty">
          {status?.state === "connected" ? "No setups right now" : "Engine offline"}
        </div>
      )}

      {shown.map((signal) => {
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

            <div className="vx-sig-grid">
              <div>
                <span>Confidence</span>
                <strong>{signal.confidence}%</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{signal.type}</strong>
              </div>
              <div>
                <span>Entry</span>
                <strong>{signal.entry != null ? signal.entry : "—"}</strong>
              </div>
              <div>
                <span>SL</span>
                <strong>{signal.stopLoss != null ? signal.stopLoss : "—"}</strong>
              </div>
              <div>
                <span>TP</span>
                <strong>{signal.takeProfit != null ? signal.takeProfit : "—"}</strong>
              </div>
              <div>
                <span>R:R</span>
                <strong>
                  {signal.riskReward != null ? `1:${signal.riskReward}` : "—"}
                </strong>
              </div>
            </div>
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
