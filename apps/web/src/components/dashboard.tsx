"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TradingSignal } from "@veytrix/shared";
import { getSignals } from "@/lib/market-data-api";
import { MarketWatch, useMarketFeed, useMarketFavorites } from "./market-watch";

export function Dashboard() {
  const feed = useMarketFeed();
  const { favorites } = useMarketFavorites();
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [biasExpanded, setBiasExpanded] = useState(false);

  const loadSignals = useCallback(async () => {
    try {
      const pairs =
        favorites.length > 0
          ? favorites.map((s) => s.toUpperCase())
          : ["EURUSD", "GBPUSD", "XAUUSD"];
      const list = await getSignals({ favorites: pairs });
      setSignals(Array.isArray(list) ? list : []);
    } catch {
      setSignals([]);
    }
  }, [favorites]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSignals();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSignals]);

  const topBias =
    signals.find((signal) => signal.type === "bias") ?? signals[0];


  const connected = feed.status?.state === "connected";

  return (
    <div className="home-screen">
      <section className="feed-status-card">
        <div className="feed-status-main">
          <span className="feed-status-label">Market feed</span>
          <strong className="feed-status-value">
            {feed.loading
              ? "…"
              : connected
                ? (feed.status?.provider ?? "Live")
                : "Not linked"}
          </strong>
          <span className="feed-status-note">
            {connected
              ? feed.status?.delayed
                ? "Delayed quotes"
                : "Live · real data"
              : "Start API + set TIINGO_API_KEY"}
          </span>
        </div>
        <div className="feed-status-stats">
          <div>
            <span>Pairs</span>
            <strong>{connected ? feed.instruments.length : "—"}</strong>
          </div>
          <div>
            <span>Quotes</span>
            <strong>{connected ? feed.quotes.length : "—"}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>Live</strong>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Watchlist</h2>
          <Link href="/markets" className="home-link">
            Manage
          </Link>
        </div>
        <div className="home-watch-list">
          <MarketWatch feed={feed} favoritesOnly compact />
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Bias</h2>
          <Link href="/signals" className="home-link">
            View all
          </Link>
        </div>
        {topBias ? (
          <div className="sig-bias-item home-bias-item">
            <button
              type="button"
              className="sig-bias-row"
              aria-expanded={biasExpanded}
              aria-controls="home-bias-details"
              onClick={() => setBiasExpanded((value) => !value)}
            >
              <span
                className={"sig-bias-dot " + (topBias.direction === "bullish" ? "up" : topBias.direction === "bearish" ? "down" : "")}
              />
              <span>
                <strong>
                  {topBias.instrument} ·{" "}
                  {topBias.direction === "bullish"
                    ? "Bullish bias"
                    : topBias.direction === "bearish"
                      ? "Bearish bias"
                      : "Neutral bias"}{" "}
                  · {topBias.confidence}%
                </strong>
                <span>{topBias.summary}</span>
              </span>
              <span className={"chevron" + (biasExpanded ? " expanded" : "")}>›</span>
            </button>
            {biasExpanded ? (
              <div className="sig-bias-expanded" id="home-bias-details">
                <div>
                  <strong>Technical</strong>
                  <p>{topBias.technicalExplanation || topBias.summary}</p>
                </div>
                <div>
                  <strong>Fundamental</strong>
                  <p>{topBias.fundamentalExplanation || "No confirmed recent fundamental direction is available for this pair."}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="home-empty">No bias right now</div>
        )}
      </section>
    </div>
  );
}
