"use client";

import { useEffect, useState } from "react";
import type { SignalProviderStatus, TradingSignal } from "@veytrix/shared";
import { getSignalStatus, getSignals } from "@/lib/market-data-api";
import { useMarketFavorites } from "./market-watch";

const DEFAULT_PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD", "USDCAD", "XAGUSD", "GBPJPY",
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

function extraField(signal: TradingSignal, key: string): string | undefined {
  const v = (signal as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
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
      const pairs =
        marketFavorites.length > 0 ? marketFavorites : DEFAULT_PAIRS;
      const raw = await getSignals({ favorites: pairs });
      if (!Array.isArray(raw) || !raw.every(isTradingSignal)) {
        setSignals([]);
        return;
      }
      setSignals(sortSignals(raw));
    } catch (e) {
      setSignals([]);
      setScanError(
        e instanceof Error
          ? e.message
          : "Signal scan failed. Check that the Veytrix API is running.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scanOne(s: string) {
    setRefreshing(true);
    setScanError(null);
    try {
      const raw = await getSignals({ instrument: s });
      if (Array.isArray(raw) && raw.every(isTradingSignal)) {
        setSignals(sortSignals(raw));
      }
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setRefreshing(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = signals.filter((s) => {
    if (filter === "setup" && s.type !== "setup") return false;
    if (filter === "bias" && s.type !== "bias") return false;
    if (!q) return true;
    return (
      s.instrument.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q)
    );
  });
  const setups = filtered.filter((s) => s.type === "setup");
  const biases = filtered.filter((s) => s.type === "bias");
  const showSetups = filter === "all" || filter === "setup";
  const showBias = filter === "all" || filter === "bias";

  return (
    <div className="sig-screen">
      <div className="sig-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pair or text…"
          aria-label="Search signals"
        />
        <button
          type="button"
          className="secondary-button"
          disabled={refreshing}
          onClick={() => void load()}
        >
          {refreshing ? "Scanning…" : "Rescan"}
        </button>
      </div>

      <div className="sig-filters">
        {(["all", "setup", "bias"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`sig-filter${filter === f ? " on" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "setup" ? "Setups" : "Bias"}
          </button>
        ))}
      </div>

      <div className="sig-scan-row">
        <input
          type="text"
          placeholder="Scan one pair e.g. EURUSD"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim().toUpperCase();
              if (v) void scanOne(v);
            }
          }}
          aria-label="Scan one instrument"
        />
      </div>

      {status && status.state !== "connected" && (
        <div className="home-empty">{status.message}</div>
      )}
      {loading && <div className="home-empty">Loading signals…</div>}
      {scanError && <div className="home-empty">{scanError}</div>}

      {!loading && !scanError && setups.length === 0 && biases.length === 0 && (
        <div className="home-empty">
          No valid setup or directional bias was returned. Check the pair scan and candle history.
        </div>
      )}

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
          const tech = extraField(signal, "technicalExplanation") ?? extraField(signal, "explanation");
          const fund = extraField(signal, "fundamentalExplanation");

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
                <span className={`vx-sig-dir ${isBuy ? "buy" : isSell ? "sell" : "bias"}`}>
                  {isSell ? "↓ " : isBuy ? "↑ " : ""}
                  {dir}
                </span>
              </div>

              {signal.summary && <p className="vx-sig-summary">{signal.summary}</p>}
              {tech && tech !== signal.summary && (
                <p className="vx-sig-explain">{tech}</p>
              )}
              {fund && <p className="vx-sig-explain fund">Fund: {fund}</p>}

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
                    {signal.riskReward != null ? `1:${signal.riskReward}` : "—"}
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
                    {signal.rewardPips != null ? `${signal.rewardPips} pips` : "—"}
                  </strong>
                </div>
              </div>
            </article>
          );
        })}

      {showBias && biases.length > 0 && (
        <div className="sig-bias-block">
          <p className="sig-bias-note">Directional bias (structure + context)</p>
          {biases.map((b) => {
            const open = expandedBiasIds.includes(b.id);
            const tech = extraField(b, "technicalExplanation") ?? extraField(b, "explanation");
            const fund = extraField(b, "fundamentalExplanation");
            return (
              <div key={b.id} className="sig-bias-row">
                <button
                  type="button"
                  className="sig-bias-toggle"
                  onClick={() =>
                    setExpandedBiasIds((ids) =>
                      open ? ids.filter((x) => x !== b.id) : [...ids, b.id],
                    )
                  }
                >
                  <strong>{b.instrument}</strong>
                  <span className={`news-pair-bias ${b.direction}`}>{b.direction}</span>
                  <span>{b.confidence}%</span>
                  <span>{open ? "▾" : "›"}</span>
                </button>
                {open && (
                  <div className="sig-bias-body">
                    <p>{b.summary}</p>
                    {tech && <p className="vx-sig-explain">{tech}</p>}
                    {fund && <p className="vx-sig-explain fund">Fund: {fund}</p>}
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
