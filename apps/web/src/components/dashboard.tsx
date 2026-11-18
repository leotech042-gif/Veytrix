"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TradingSignal } from "@veytrix/shared";
import { getSignals } from "@/lib/market-data-api";
import { AiOrb } from "./ai-orb";
import { MarketWatch, useMarketFeed } from "./market-watch";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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
      const favs = feed.instruments.slice(0, 6).map((i) => i.symbol);
      const list = await getSignals({ favorites: favs });
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

  const latestSetup = signals.find((s) => s.type === "setup");
  const setups = signals.filter((s) => s.type === "setup").length;
  const biases = signals.filter((s) => s.type === "bias").length;

  const providerLabel =
    feed.loading
      ? "Checking…"
      : feed.status?.state === "connected"
        ? feed.status.provider
        : feed.status?.state === "disconnected"
          ? "Disconnected"
          : feed.error
            ? "Offline"
            : "Not set";

  return (
    <>
      <p className="greeting">{greeting()}</p>

      <section className="hero-card mb-4">
        <div className="flex-between">
          <div>
            <div className="balance-label">Feed</div>
            <div className="balance-value" style={{ fontSize: 22 }}>
              {providerLabel}
            </div>
            <div className="balance-delta">
              {feed.status?.state === "connected"
                ? feed.status.delayed
                  ? "Delayed"
                  : "Live"
                : "No provider"}
            </div>
          </div>
          <AiOrb
            variant={
              scanning
                ? "scanning"
                : feed.status?.state === "connected"
                  ? "idle"
                  : "loading"
            }
            size="md"
          />
        </div>
        <div className="balance-meta">
          <div className="meta-item">
            <span className="label">Pairs</span>
            <span className="value">
              {feed.status?.state === "connected" ? feed.instruments.length : "—"}
            </span>
          </div>
          <div className="meta-item">
            <span className="label">Quotes</span>
            <span className="value">
              {feed.status?.state === "connected" ? feed.quotes.length : "—"}
            </span>
          </div>
          <div className="meta-item">
            <span className="label">Broker</span>
            <span className="value">Off</span>
          </div>
        </div>
      </section>

      {feed.error && (
        <div className="inline-error" role="alert">
          {feed.error}
        </div>
      )}

      <section className="scan-card mb-4">
        <AiOrb
          variant={scanning ? "analyzing" : scanDone ? "idle" : "loading"}
          size="sm"
        />
        <div className="scan-info">
          <p className="scan-title">Scan</p>
          <p className="scan-sub">
            {scanning
              ? "Reading structure…"
              : scanDone
                ? `${setups} setup · ${biases} bias`
                : "Tap to scan"}
          </p>
        </div>
        {scanDone && !scanning && <span className="scan-badge">Live</span>}
      </section>

      <button
        type="button"
        className="primary-button btn-full mb-4"
        onClick={() => void runScan()}
        disabled={scanning || feed.status?.state !== "connected"}
      >
        {scanning ? "Scanning…" : scanDone ? "Scan again" : "Scan"}
      </button>

      <section className="panel mb-4">
        <div className="panel-heading">
          <div>
            <h2>Watchlist</h2>
          </div>
          <Link className="text-button" href="/markets">
            All
          </Link>
        </div>
        <MarketWatch feed={feed} favoritesOnly compact />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Signal</h2>
          </div>
          <Link className="text-button" href="/signals">
            Room
          </Link>
        </div>

        {latestSetup ? (
          <article
            className="signal-card"
            style={{ marginBottom: 0, border: "none", padding: 0 }}
          >
            <div className="signal-header">
              <span className="signal-pair">{latestSetup.instrument}</span>
              <span
                className={`signal-dir ${
                  latestSetup.direction === "bullish"
                    ? "buy"
                    : latestSetup.direction === "bearish"
                      ? "sell"
                      : "bias"
                }`}
              >
                {latestSetup.direction === "bullish"
                  ? "BUY"
                  : latestSetup.direction === "bearish"
                    ? "SELL"
                    : "BIAS"}
              </span>
            </div>
            <p className="signal-meta">
              {latestSetup.timeframe} · {latestSetup.confidence}%
              {latestSetup.riskReward ? ` · 1:${latestSetup.riskReward}` : ""}
            </p>
            {latestSetup.entry != null && (
              <div className="signal-levels">
                <div className="level">
                  <span className="lbl">Entry</span>
                  <span className="val">{latestSetup.entry}</span>
                </div>
                <div className="level">
                  <span className="lbl">Stop</span>
                  <span className="val">{latestSetup.stopLoss ?? "—"}</span>
                </div>
                <div className="level">
                  <span className="lbl">Target</span>
                  <span className="val">{latestSetup.takeProfit ?? "—"}</span>
                </div>
              </div>
            )}
            {latestSetup.summary ? (
              <p className="signal-reason">{latestSetup.summary}</p>
            ) : null}
          </article>
        ) : (
          <div className="empty-state">
            <div className="mark">⌖</div>
            <p>
              {feed.status?.state === "connected"
                ? "No setup right now"
                : "Connect a provider"}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
