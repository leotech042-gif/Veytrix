"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradingSignal } from "@veytrix/shared";
import { getSignals } from "@/lib/market-data-api";
import { PairLogo } from "./pair-logo";
import { MarketWatch, useMarketFeed, useMarketFavorites } from "./market-watch";

export function Dashboard() {
  const feed = useMarketFeed();
  const { favorites } = useMarketFavorites();
  const [signals, setSignals] = useState<TradingSignal[]>([]);

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
    void loadSignals();
  }, [loadSignals]);

  const biases = useMemo(
    () => signals.filter((s) => s.type === "bias" || s.type === "setup"),
    [signals],
  );
  const topBias = biases[0];



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
          <Link href="/signals" className="home-signal-card">
            <PairLogo symbol={topBias.instrument} size="sm" />
            <span className="home-signal-body">
              <strong>
                {topBias.instrument} ·{" "}
                {topBias.direction === "bullish"
                  ? "Bullish"
                  : topBias.direction === "bearish"
                    ? "Bearish"
                    : "Neutral"}
              </strong>
              <span>
                {topBias.timeframe}
                {topBias.type === "setup" && topBias.riskReward
                  ? ` · 1:${topBias.riskReward} RR`
                  : " · bias"}
              </span>
            </span>
            <span className="home-signal-chevron">›</span>
          </Link>
        ) : (
          <div className="home-empty">No bias right now</div>
        )}
      </section>
    </div>
  );
}
