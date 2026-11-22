"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradingSignal } from "@veytrix/shared";
import { getSignals } from "@/lib/market-data-api";
import { PairLogo } from "./pair-logo";
import { useMarketFeed } from "./market-watch";

export function Dashboard() {
  const feed = useMarketFeed();
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [watchQuery, setWatchQuery] = useState("");

  const loadSignals = useCallback(async () => {
    try {
      const favs = feed.instruments.slice(0, 12).map((i) => i.symbol);
      const list = await getSignals({
        favorites: favs.length ? favs : undefined,
      });
      setSignals(list);
    } catch {
      setSignals([]);
    }
  }, [feed.instruments]);

  useEffect(() => {
    if (feed.status?.state === "connected" && feed.instruments.length > 0) {
      void loadSignals();
    }
  }, [feed.status?.state, feed.instruments.length, loadSignals]);

  const biases = useMemo(
    () => signals.filter((s) => s.type === "bias" || s.type === "setup"),
    [signals],
  );
  const topBias = biases[0];

  const watchRows = useMemo(() => {
    const bySym = new Map(feed.quotes.map((q) => [q.instrument, q]));
    const q = watchQuery.trim().toUpperCase();
    let list = feed.instruments;
    if (q) {
      list = list.filter(
        (i) =>
          i.symbol.toUpperCase().includes(q) ||
          i.displayName.toUpperCase().includes(q),
      );
    } else {
      const preferred = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD", "USDCAD"];
      const preferredInst = preferred
        .map((s) => list.find((i) => i.symbol === s))
        .filter(Boolean) as typeof list;
      list = preferredInst.length > 0 ? preferredInst : list.slice(0, 8);
    }
    return list.slice(0, 20).map((instrument) => {
      const quote = bySym.get(instrument.symbol);
      const last = quote?.last ?? quote?.bid ?? quote?.ask;
      return { instrument, quote, last };
    });
  }, [feed.quotes, feed.instruments, watchQuery]);

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
                  ? feed.status.provider ?? "Live"
                  : "Not linked"}
            </div>
            <div className="home-balance-delta">
              {feed.status?.state === "connected"
                ? feed.status.delayed
                  ? "Delayed quotes"
                  : "Live · real data"
                : "Set TIINGO_API_KEY in API env"}
            </div>
          </div>
        </div>
        <div className="home-balance-stats">
          <div>
            <span className="lbl">Pairs</span>
            <span className="val">
              {feed.status?.state === "connected" ? feed.instruments.length : "—"}
            </span>
          </div>
          <div>
            <span className="lbl">Quotes</span>
            <span className="val">
              {feed.status?.state === "connected" ? feed.quotes.length : "—"}
            </span>
          </div>
          <div>
            <span className="lbl">Mode</span>
            <span className="val">Live</span>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Watchlist</h2>
          <Link href="/markets" className="home-link">
            All markets
          </Link>
        </div>
        <div className="home-watch-search">
          <input
            type="search"
            value={watchQuery}
            onChange={(e) => setWatchQuery(e.target.value)}
            placeholder="Search pair…"
            aria-label="Search pairs"
          />
        </div>
        <div className="home-watch-list">
          {watchRows.length === 0 && (
            <div className="home-empty">No pairs match</div>
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
          <div className="home-empty">
            {feed.status?.state === "connected"
              ? "No bias right now"
              : "Connect market data"}
          </div>
        )}
      </section>
    </div>
  );
}
