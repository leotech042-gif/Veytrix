"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradingSignal } from "@veytrix/shared";
import { getSignals } from "@/lib/market-data-api";
import { AiOrb } from "./ai-orb";
import { useMarketFeed } from "./market-watch";

const FLAG: Record<string, string> = {
  EURUSD: "EU", GBPUSD: "GB", USDJPY: "US", XAUUSD: "XA",
  AUDUSD: "AU", USDCAD: "CA", USDCHF: "CH", NZDUSD: "NZ",
};

function flagFor(symbol: string) {
  return FLAG[symbol] ?? symbol.slice(0, 2);
}

export function Dashboard() {
  const feed = useMarketFeed();
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanDone(false);
    try {
      const favs = feed.instruments.slice(0, 8).map((i) => i.symbol);
      const list = await getSignals({ favorites: favs.length ? favs : undefined });
      setSignals(list);
      setScanDone(true);
    } catch {
      setSignals([]);
    } finally {
      setScanning(false);
    }
  }, [feed.instruments]);

  useEffect(() => {
    if (feed.status?.state === "connected" && feed.instruments.length > 0) {
      void runScan();
    }
  }, [feed.status?.state, feed.instruments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setups = signals.filter((s) => s.type === "setup");
  const biases = signals.filter((s) => s.type === "bias");
  const latestSetup = setups[0];

  const watchRows = useMemo(() => {
    const bySym = new Map(feed.quotes.map((q) => [q.instrument, q]));
    const preferred = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"];
    const syms =
      preferred.filter((s) => bySym.has(s)).length > 0
        ? preferred.filter((s) => bySym.has(s) || feed.instruments.some((i) => i.symbol === s))
        : feed.instruments.slice(0, 4).map((i) => i.symbol);
    return syms.map((symbol) => {
      const q = bySym.get(symbol);
      const last = q?.last ?? q?.bid ?? q?.ask;
      const name = feed.instruments.find((i) => i.symbol === symbol)?.displayName ?? symbol;
      return { symbol, name, last, q };
    });
  }, [feed.quotes, feed.instruments]);

  const scanSummary = scanDone
    ? `${setups.length} setup · ${biases.length} bias only`
    : scanning
      ? "Scanning…"
      : "Tap to scan";

  return (
    <div className="home-screen">
      <section className="home-balance-card">
        <div className="home-balance-top">
          <div>
            <div className="home-balance-label">
              {feed.status?.state === "connected" ? "LIVE FEED" : "MARKET FEED"}
            </div>
            <div className="home-balance-value">
              {feed.loading
                ? "…"
                : feed.status?.state === "connected"
                  ? feed.status.provider
                  : "Not linked"}
            </div>
            <div className="home-balance-delta">
              {feed.status?.state === "connected"
                ? feed.status.delayed
                  ? "Delayed quotes"
                  : "Live · real data"
                : "Connect provider in API env"}
            </div>
          </div>
          <AiOrb
            variant={scanning ? "scanning" : feed.status?.state === "connected" ? "idle" : "loading"}
            size="md"
          />
        </div>
        <div className="home-balance-stats">
          <div>
            <span className="lbl">Pairs</span>
            <span className="val">{feed.status?.state === "connected" ? feed.instruments.length : "—"}</span>
          </div>
          <div>
            <span className="lbl">Quotes</span>
            <span className="val">{feed.status?.state === "connected" ? feed.quotes.length : "—"}</span>
          </div>
          <div>
            <span className="lbl">Mode</span>
            <span className="val">Live</span>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Veytrix scan</h2>
          {scanDone && <span className="pill-live">Live</span>}
        </div>
        <p className="home-section-sub">Watchlist · tap to inspect</p>
        <div className="home-scan-card">
          <div className="home-scan-row">
            <div className="home-scan-icon">
              <AiOrb variant={scanning ? "analyzing" : "idle"} size="sm" />
            </div>
            <div className="home-scan-copy">
              <strong>
                {scanDone
                  ? `${Math.max(watchRows.length, setups.length + biases.length)} markets reviewed`
                  : scanning
                    ? "Scanning markets…"
                    : "Ready to scan"}
              </strong>
              <span>{scanSummary}</span>
            </div>
          </div>
          <button
            type="button"
            className="home-scan-btn"
            onClick={() => void runScan()}
            disabled={scanning || feed.status?.state !== "connected"}
          >
            {scanning ? "Scanning…" : scanDone ? "Run scan again" : "Run scan"}
          </button>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Watchlist</h2>
          <Link href="/charts" className="home-link">Open chart</Link>
        </div>
        <div className="home-watch-list">
          {watchRows.length === 0 && <div className="home-empty">No quotes yet</div>}
          {watchRows.map((row) => (
            <Link key={row.symbol} href={`/charts?symbol=${encodeURIComponent(row.symbol)}`} className="home-watch-row">
              <span className="home-flag">{flagFor(row.symbol)}</span>
              <span className="home-watch-meta">
                <strong>{row.symbol}</strong>
                <span>{row.name}</span>
              </span>
              <span className="home-watch-px">
                <strong>
                  {row.last != null ? row.last.toLocaleString(undefined, { maximumFractionDigits: 5 }) : "—"}
                </strong>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Latest signal</h2>
          <Link href="/signals" className="home-link">Signal room</Link>
        </div>
        {latestSetup ? (
          <Link href="/signals" className="home-signal-card">
            <span className="home-signal-ico">↗</span>
            <span className="home-signal-body">
              <strong>
                {latestSetup.instrument} ·{" "}
                {latestSetup.direction === "bullish" ? "BUY" : latestSetup.direction === "bearish" ? "SELL" : "BIAS"}
              </strong>
              <span>
                {latestSetup.timeframe}
                {latestSetup.riskReward ? ` · 1:${latestSetup.riskReward} RR` : ""}
              </span>
            </span>
            <span className="home-signal-chevron">›</span>
          </Link>
        ) : (
          <div className="home-empty">
            {feed.status?.state === "connected" ? "No setup right now" : "Connect a provider"}
          </div>
        )}
      </section>
    </div>
  );
}
