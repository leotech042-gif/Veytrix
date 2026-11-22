"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradingSignal } from "@veytrix/shared";
import { getSignals } from "@/lib/market-data-api";
import { PairLogo } from "./pair-logo";
import { useMarketFeed, useMarketFavorites } from "./market-watch";

export function Dashboard() {
  const feed = useMarketFeed();
  const { favorites } = useMarketFavorites();
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [watchQuery, setWatchQuery] = useState("");

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

  const watchRows = useMemo(() => {
    const bySym = new Map(feed.quotes.map((q) => [q.instrument, q]));
    const favSet = new Set(favorites.map((s) => s.toUpperCase()));
    let list = feed.instruments.filter((i) => favSet.has(i.symbol.toUpperCase()));

    const q = watchQuery.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.symbol.toUpperCase().includes(q) ||
          i.displayName.toUpperCase().includes(q),
      );
    }

    return list.map((instrument) => {
      const quote = bySym.get(instrument.symbol);
      const last = quote?.last ?? quote?.bid ?? quote?.ask;
      return { instrument, quote, last };
    });
  }, [feed.quotes, feed.instruments, favorites, watchQuery]);

  return (
    <div className="home-screen">
      <section className="home-section">
        <div className="home-section-head">
          <h2>Watchlist</h2>
          <Link href="/markets" className="home-link">
            Manage
          </Link>
        </div>
        <div className="home-watch-search">
          <input
            type="search"
            value={watchQuery}
            onChange={(e) => setWatchQuery(e.target.value)}
            placeholder="Search favourites…"
            aria-label="Search favourites"
          />
        </div>
        <div className="home-watch-list">
          {watchRows.length === 0 && (
            <div className="home-empty">
              {favorites.length === 0
                ? "Star pairs in Markets to build your watchlist"
                : "No pairs match"}
            </div>
          )}
          {watchRows.map(({ instrument, quote, last }) => (
            <div key={instrument.symbol} className="home-watch-row">
              <PairLogo symbol={instrument.symbol} size="sm" />
              <span className="home-watch-meta">
                <strong>{instrument.symbol}</strong>
                <span>{instrument.displayName}</span>
              </span>
              <span className="home-watch-px">
                <strong>
                  {last != null
                    ? last.toLocaleString(undefined, {
                        maximumFractionDigits: 5,
                      })
                    : "—"}
                </strong>
                {quote?.bid != null && quote?.ask != null && (
                  <span className="home-watch-ba">
                    {quote.bid.toLocaleString(undefined, {
                      maximumFractionDigits: 5,
                    })}{" "}
                    /{" "}
                    {quote.ask.toLocaleString(undefined, {
                      maximumFractionDigits: 5,
                    })}
                  </span>
                )}
              </span>
            </div>
          ))}
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
