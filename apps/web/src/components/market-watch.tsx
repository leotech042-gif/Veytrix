"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { PairLogo } from "./pair-logo";
import type {
  MarketCategory,
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
} from "@veytrix/shared";
import {
  getMarketInstruments,
  getMarketQuotes,
  getMarketStatus,
  MarketDataApiError,
  getMarketHistory,
} from "@/lib/market-data-api";

const categories: { value: MarketCategory | "all"; label: string }[] = [
  { value: "all", label: "All markets" },
  { value: "forex", label: "Forex" },
  { value: "metals", label: "Metals" },
  { value: "crypto", label: "Crypto" },
  { value: "indices", label: "Indices" },
  { value: "energy", label: "Energy" },
  { value: "synthetic", label: "Synthetic" },
  { value: "other", label: "Other" },
];

export interface MarketFeed {
  status: MarketDataStatus | null;
  instruments: MarketInstrument[];
  quotes: MarketQuote[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  instrumentError: string | null;
  quoteError: string | null;
  refresh: () => void;
}

function isInstrument(value: unknown): value is MarketInstrument {
  if (typeof value !== "object" || value === null) return false;
  const instrument = value as Record<string, unknown>;
  return (
    typeof instrument.symbol === "string" &&
    typeof instrument.displayName === "string" &&
    categories.some((category) => category.value === instrument.category) &&
    (instrument.pricePrecision === undefined ||
      (typeof instrument.pricePrecision === "number" &&
        Number.isInteger(instrument.pricePrecision) &&
        instrument.pricePrecision >= 0 &&
        instrument.pricePrecision <= 12))
  );
}

function isQuote(value: unknown): value is MarketQuote {
  if (typeof value !== "object" || value === null) return false;
  const quote = value as Record<string, unknown>;
  return (
    typeof quote.instrument === "string" &&
    (quote.bid === undefined ||
      (typeof quote.bid === "number" && Number.isFinite(quote.bid))) &&
    (quote.ask === undefined ||
      (typeof quote.ask === "number" && Number.isFinite(quote.ask))) &&
    (quote.last === undefined ||
      (typeof quote.last === "number" && Number.isFinite(quote.last))) &&
    (quote.bid !== undefined ||
      quote.ask !== undefined ||
      quote.last !== undefined) &&
    (quote.bid === undefined ||
      quote.ask === undefined ||
      quote.ask >= quote.bid) &&
    typeof quote.asOf === "string" &&
    Number.isFinite(Date.parse(quote.asOf)) &&
    ["spread", "change", "changePercent"].every(
      (field) =>
        quote[field] === undefined ||
        (typeof quote[field] === "number" && Number.isFinite(quote[field])),
    ) &&
    (quote.delayed === undefined || typeof quote.delayed === "boolean")
  );
}

export function useMarketFeed(): MarketFeed {
  const [status, setStatus] = useState<MarketDataStatus | null>(null);
  const [instruments, setInstruments] = useState<MarketInstrument[]>([]);
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instrumentError, setInstrumentError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const currentStatus = await getMarketStatus();
      setStatus(currentStatus);
      setError(null);

      if (currentStatus.state !== "connected") {
        setInstruments([]);
        setQuotes([]);
        setInstrumentError(null);
        setQuoteError(null);
        return;
      }

      const [instrumentResult, quoteResult] = await Promise.allSettled([
        getMarketInstruments(),
        getMarketQuotes(),
      ]);

      if (instrumentResult.status === "fulfilled") {
        if (!instrumentResult.value.every(isInstrument)) {
          setInstrumentError(
            "The provider returned an invalid instrument list.",
          );
          setInstruments([]);
        } else {
          setInstruments(instrumentResult.value);
          setInstrumentError(null);
        }
      } else {
        setInstruments([]);
        setInstrumentError(
          instrumentResult.reason instanceof Error
            ? instrumentResult.reason.message
            : "Instrument discovery failed.",
        );
      }

      if (quoteResult.status === "fulfilled") {
        if (!quoteResult.value.every(isQuote)) {
          setQuoteError("The provider returned invalid quote data.");
        } else if (quoteResult.value.length === 0) {
          setQuoteError("The provider returned no current quotes.");
        } else {
          setQuotes(quoteResult.value);
          setQuoteError(null);
        }
      } else {
        setQuoteError(
          quoteResult.reason instanceof Error
            ? quoteResult.reason.message
            : "Quote refresh failed.",
        );
      }
    } catch (reason) {
      setStatus(null);
      setInstruments([]);
      setQuotes([]);
      setInstrumentError(null);
      setQuoteError(null);
      setError(
        reason instanceof MarketDataApiError
          ? reason.message
          : "The market-data API could not be reached.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      if (active) await refresh();
      if (active) timer = window.setTimeout(poll, 30_000);
    };

    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refresh]);

  return {
    status,
    instruments,
    quotes,
    loading,
    refreshing,
    error,
    instrumentError,
    quoteError,
    refresh: () => void refresh(),
  };
}

const favoritesKey = "veytrix.market-favorites.v1";
const favoritesEvent = "veytrix-market-favorites-change";
let favoritesRaw: string | null | undefined;
let cachedFavorites: string[] = [];
const emptyFavorites: string[] = [];

function getFavoritesSnapshot(): string[] {
  try {
    const raw = localStorage.getItem(favoritesKey);
    if (raw === favoritesRaw) return cachedFavorites;
    favoritesRaw = raw;
    const value: unknown = raw ? JSON.parse(raw) : [];
    cachedFavorites =
      Array.isArray(value) && value.every((item) => typeof item === "string")
        ? value
        : [];
  } catch (error) {
    console.warn("Unable to read saved market favourites.", error);
  }
  return cachedFavorites;
}

export function useMarketFavorites() {
  const favorites = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(favoritesEvent, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(favoritesEvent, onChange);
      };
    },
    getFavoritesSnapshot,
    () => emptyFavorites,
  );

  const toggle = (symbol: string) => {
    const next = favorites.includes(symbol)
      ? favorites.filter((favorite) => favorite !== symbol)
      : [...favorites, symbol];
    cachedFavorites = next;
    try {
      const raw = JSON.stringify(next);
      localStorage.setItem(favoritesKey, raw);
      favoritesRaw = raw;
    } catch (error) {
      console.warn("Unable to save market favourites.", error);
    }
    window.dispatchEvent(new Event(favoritesEvent));
  };

  return { favorites, toggle };
}

function formatPrice(value: number, instrument: MarketInstrument): string {
  const digits = instrument.pricePrecision ?? 8;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

function Sparkline({ values }: { values: number[] | undefined }) {
  if (!values || values.length < 2) {
    return <span className="mw-spark-empty" aria-label="Historical trend unavailable">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 26 - ((value - min) / range) * 22;
      return `${x},${y}`;
    })
    .join(" ");
  const rising = values[values.length - 1] >= values[0];

  return (
    <svg className={`mw-sparkline ${rising ? "is-up" : "is-down"}`} viewBox="0 0 100 30" role="img" aria-label={rising ? "Historical price trend rising" : "Historical price trend falling"}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarketWatch({
  feed,
  favoritesOnly = false,
  compact = false,
}: {
  feed: MarketFeed;
  favoritesOnly?: boolean;
  compact?: boolean;
}) {
  const { favorites, toggle } = useMarketFavorites();
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<"watchlist" | "all" | MarketCategory>("watchlist");
  const [historyBySymbol, setHistoryBySymbol] = useState<Record<string, number[]>>({});

  const activeFilter = !favoritesOnly && marketFilter === "watchlist" && favorites.length === 0
    ? "all"
    : marketFilter;

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return feed.instruments.filter((instrument) => {
      const matchesQuery =
        !query ||
        instrument.symbol.toLocaleLowerCase().includes(query) ||
        instrument.displayName.toLocaleLowerCase().includes(query);
      const matchesFavorite = favoritesOnly || activeFilter !== "watchlist"
        ? (!favoritesOnly || favorites.includes(instrument.symbol))
        : favorites.includes(instrument.symbol);
      const matchesFilter =
        activeFilter === "all" || activeFilter === "watchlist" ||
        instrument.category === activeFilter;
      return matchesQuery && matchesFavorite && matchesFilter;
    });
  }, [activeFilter, favorites, favoritesOnly, feed.instruments, search]);

  const visibleInstruments = useMemo(
    () => (compact ? filtered.slice(0, 8) : filtered),
    [compact, filtered],
  );
  const historySymbols = useMemo(
    () => visibleInstruments.slice(0, 12).map((item) => item.symbol),
    [visibleInstruments],
  );
  const historyKey = historySymbols.join("|");

  useEffect(() => {
    if (feed.status?.state !== "connected" || historySymbols.length === 0) {
      setHistoryBySymbol({});
      return;
    }
    let active = true;
    Promise.all(
      historySymbols.map(async (symbol) => {
        try {
          const candles = await getMarketHistory(symbol, "H1");
          const closes = candles
            .filter((candle) => Number.isFinite(candle.close))
            .slice(-24)
            .map((candle) => candle.close);
          return [symbol, closes] as const;
        } catch {
          return [symbol, []] as const;
        }
      }),
    ).then((entries) => {
      if (active) setHistoryBySymbol(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [feed.status?.state, historyKey, historySymbols]);

  const quoteBySymbol = useMemo(
    () => new Map(feed.quotes.map((quote) => [quote.instrument.toLocaleUpperCase(), quote])),
    [feed.quotes],
  );

  const categoriesToShow = categories.filter(
    (item) => item.value === "all" ||
      item.value !== "synthetic" ||
      feed.instruments.some((instrument) => instrument.category === "synthetic"),
  );
  const countFor = (value: MarketCategory | "all" | "watchlist") => {
    if (value === "watchlist") return favorites.length;
    if (value === "all") return feed.instruments.length;
    return feed.instruments.filter((instrument) => instrument.category === value).length;
  };

  return (
    <section className={`panel mw-panel mw-market-watchlist${compact ? " compact-panel mw-compact" : ""}`}>
      <div className="mw-header">
        <div>
          <div className="mw-eyebrow">VEYTRIX MARKETS</div>
          <h2>{favoritesOnly ? "Your watchlist" : "Market watch"}</h2>
          {!compact && <p className="mw-subtitle">Live instruments and pricing from your connected market-data provider.</p>}
        </div>
        <div className="mw-header-actions">
          <span className="mw-count">{filtered.length} markets</span>
          <button className="mw-refresh" type="button" onClick={feed.refresh} disabled={feed.refreshing}>
            <span aria-hidden="true">↻</span> {feed.refreshing ? "Updating" : "Refresh"}
          </button>
        </div>
      </div>

      {feed.status?.state === "connected" && (
        <>
          <div className="mw-toolbar">
            <label className="mw-search">
              <span aria-hidden="true">⌕</span>
              <span className="visually-hidden">Search instruments</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search symbol or name"
              />
            </label>
          </div>
          {!favoritesOnly && (
            <div className="mw-category-list" aria-label="Market categories">
              <button
                className={`mw-category-chip mw-watchlist-chip${activeFilter === "watchlist" ? " active" : ""}`}
                type="button"
                onClick={() => setMarketFilter("watchlist")}
                aria-pressed={activeFilter === "watchlist"}
              >☆ Watchlist <strong>{countFor("watchlist")}</strong></button>
              <button
                className={`mw-category-chip${activeFilter === "all" ? " active" : ""}`}
                type="button"
                onClick={() => setMarketFilter("all")}
                aria-pressed={activeFilter === "all"}
              >All <strong>{countFor("all")}</strong></button>
              {categoriesToShow.filter((item) => item.value !== "all").map((item) => (
                <button
                  key={item.value}
                  className={`mw-category-chip${activeFilter === item.value ? " active" : ""}`}
                  type="button"
                  onClick={() => setMarketFilter(item.value)}
                  aria-pressed={activeFilter === item.value}
                >{item.label} <strong>{countFor(item.value)}</strong></button>
              ))}
            </div>
          )}
        </>
      )}

      {feed.error && <div className="inline-error" role="alert">{feed.error}</div>}
      {feed.status?.state === "unconfigured" && (
        <div className="empty-state" role="status">
          <span className="empty-state-icon" aria-hidden="true">◈</span>
          <h3>No market provider connected</h3>
          <p>Instruments are discovered from your provider. Configure a licensed market-data feed in the API to populate this list.</p>
          <Link className="secondary-button" href="/settings">View connection settings</Link>
        </div>
      )}
      {feed.status?.state === "disconnected" && <div className="inline-error" role="status">{feed.status.message}</div>}
      {feed.instrumentError && <div className="inline-error" role="alert">Instrument list unavailable: {feed.instrumentError}</div>}
      {feed.quoteError && <div className="inline-error" role="alert">Latest quotes unavailable: {feed.quoteError}</div>}
      {feed.loading && <div className="mw-loading" role="status"><span className="mw-loading-pulse" /> Loading provider instruments and quotes…</div>}

      {!feed.loading && feed.status?.state === "connected" && visibleInstruments.length === 0 && (
        <div className="mw-empty" role="status">
          <span aria-hidden="true">⌕</span>
          <strong>{favoritesOnly || activeFilter === "watchlist" ? "Your watchlist is empty" : "No instruments found"}</strong>
          <p>{favoritesOnly || activeFilter === "watchlist" ? "Save markets with the star to build your watchlist." : "Try another symbol or market category."}</p>
        </div>
      )}

      {visibleInstruments.length > 0 && (
        <div className="mw-market-list">
          <div className="mw-list-head">
            <span>{favoritesOnly || activeFilter === "watchlist" ? "WATCHLIST" : activeFilter === "all" ? "ALL MARKETS" : String(activeFilter).toUpperCase()}</span>
            <span>LAST · CHG%</span>
          </div>
          {visibleInstruments.map((instrument) => {
            const quote = quoteBySymbol.get(instrument.symbol.toLocaleUpperCase());
            const price = quote?.last ?? quote?.bid ?? quote?.ask;
            const change = quote?.changePercent;
            const positive = change !== undefined && change >= 0;
            const isFavorite = favorites.includes(instrument.symbol);
            const cleanSymbol = instrument.symbol.toUpperCase().replace(/[^A-Z]/g, "");
            const base = instrument.baseCurrency ?? cleanSymbol.slice(0, 3);
            const quoteCurrency = instrument.quoteCurrency ?? cleanSymbol.slice(-3);
            const pairName = instrument.category === "forex"
              ? `${base}/${quoteCurrency}`
              : instrument.category === "metals"
                ? `${base}/${quoteCurrency} ${base === "XAU" ? "Gold" : base === "XAG" ? "Silver" : instrument.displayName}`
                : instrument.category === "crypto"
                  ? `${base}/${quoteCurrency}`
                  : instrument.displayName;

            return (
              <article className="mw-market-row" key={instrument.symbol}>
                <Link href={`/charts?symbol=${encodeURIComponent(instrument.symbol)}`} className="mw-market-identity">
                  <PairLogo symbol={instrument.symbol} size="md" />
                  <span className="mw-instrument-copy">
                    <strong className="mw-symbol">{instrument.symbol}</strong>
                    <span className="mw-instrument-name">{pairName}</span>
                  </span>
                </Link>
                <div className="mw-row-spark" aria-label={`Recent ${instrument.symbol} price trend`}>
                  <Sparkline values={historyBySymbol[instrument.symbol]} />
                </div>
                <div className="mw-row-quote">
                  <div className="mw-quote-stack">
                    <strong className="mw-quote-price">{price === undefined ? "—" : formatPrice(price, instrument)}</strong>
                    {change === undefined ? (
                      <span className="mw-change unavailable">—</span>
                    ) : (
                      <span className={`mw-change ${positive ? "positive" : "negative"}`}>
                        {positive ? "+" : ""}{change.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className={`mw-star${isFavorite ? " selected" : ""}`}
                  type="button"
                  aria-label={`${isFavorite ? "Remove" : "Add"} ${instrument.symbol} ${isFavorite ? "from" : "to"} favourites`}
                  aria-pressed={isFavorite}
                  onClick={() => toggle(instrument.symbol)}
                >☆</button>
              </article>
            );
          })}
        </div>
      )}

      {feed.status?.state === "connected" && feed.quotes.length > 0 && (
        <p className="mw-footnote">Prices and timestamps are supplied by {feed.status.provider}. Quotes refresh automatically every 30 seconds. Sparklines use real provider candle history; unavailable history is never simulated.</p>
      )}
    </section>
  );
}
