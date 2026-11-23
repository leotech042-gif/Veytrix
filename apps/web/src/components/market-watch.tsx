"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import type {
  MarketCategory,
  MarketCandle,
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
} from "@veytrix/shared";
import {
  getMarketHistory,
  getMarketInstruments,
  getMarketQuotes,
  getMarketStatus,
  MarketDataApiError,
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

type WatchTab = "watchlist" | "all" | "metals" | "forex";

const CURRENCY_FLAGS: Record<string, string> = {
  EUR: "🇪🇺",
  USD: "🇺🇸",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  NZD: "🇳🇿",
  CNY: "🇨🇳",
};

function WatchAssetMark({
  part,
  symbol,
}: {
  part: string;
  symbol: string;
}) {
  const flag = CURRENCY_FLAGS[part];
  let label = flag ?? part.slice(0, 3);
  let tone = "watch-asset--generic";
  if (part === "XAU") {
    label = "Au";
    tone = "watch-asset--gold";
  } else if (part === "XAG") {
    label = "Ag";
    tone = "watch-asset--silver";
  } else if (part === "BTC") {
    label = "₿";
    tone = "watch-asset--bitcoin";
  } else if (part === "ETH") {
    label = "◆";
    tone = "watch-asset--ethereum";
  } else if (flag) {
    tone = "watch-asset--flag";
  } else if (symbol.startsWith("US") && /[0-9]/.test(symbol)) {
    label = "🇺🇸";
    tone = "watch-asset--flag";
  }

  return (
    <span className={"watch-asset " + tone} aria-label={part}>
      {label}
    </span>
  );
}

function WatchPairMark({ instrument }: { instrument: MarketInstrument }) {
  const symbol = instrument.symbol.toUpperCase();
  const base = symbol.slice(0, 3);
  const quote = symbol.length >= 6 ? symbol.slice(3, 6) : "";
  const isIndex = instrument.category === "indices";
  return (
    <span className="watch-pair-mark" aria-hidden="true">
      <WatchAssetMark part={isIndex ? "USD" : base} symbol={symbol} />
      {isIndex ? (
        <span className="watch-asset watch-asset--generic">{symbol}</span>
      ) : quote ? (
        <WatchAssetMark part={quote} symbol={symbol} />
      ) : null}
    </span>
  );
}

function sparklinePath(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(Math.abs(max) * 0.00001, 1);
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 27 - ((value - min) / range) * 22;
      return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    })
    .join(" ");
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
  const [tab, setTab] = useState<WatchTab>(favoritesOnly ? "watchlist" : "watchlist");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [dailyHistory, setDailyHistory] = useState<Record<string, Pick<MarketCandle, "time" | "close">[]>>({});

  const quoteBySymbol = useMemo(
    () =>
      new Map(
        feed.quotes.map((quote) => [
          quote.instrument.toUpperCase(),
          quote,
        ]),
      ),
    [feed.quotes],
  );

  const counts = useMemo(() => {
    const symbols = new Set(feed.instruments.map((item) => item.symbol.toUpperCase()));
    return {
      watchlist: favorites.filter((item) => symbols.has(item.toUpperCase())).length,
      all: feed.instruments.length,
      metals: feed.instruments.filter((item) => item.category === "metals").length,
      forex: feed.instruments.filter((item) => item.category === "forex").length,
    };
  }, [favorites, feed.instruments]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return feed.instruments.filter((instrument) => {
      const isFavorite = favorites.includes(instrument.symbol);
      const matchesTab = favoritesOnly
        ? isFavorite
        : tab === "watchlist"
          ? isFavorite || query.length > 0
          : tab === "all"
            ? true
            : tab === "metals"
              ? instrument.category === "metals"
              : instrument.category === "forex";
      const matchesSearch =
        !query ||
        instrument.symbol.toLowerCase().includes(query) ||
        instrument.displayName.toLowerCase().includes(query);
      return matchesTab && matchesSearch;
    });
  }, [favorites, feed.instruments, search, tab]);

  useEffect(() => {
    if (feed.status?.state !== "connected" || filtered.length === 0) return;
    let active = true;
    const missing = filtered
      .slice(0, 16)
      .filter((instrument) => !dailyHistory[instrument.symbol.toUpperCase()]);
    if (missing.length === 0) return;

    void Promise.all(
      missing.map(async (instrument) => {
        try {
          const candles = await getMarketHistory(instrument.symbol, "D1");
          const values = candles
            .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
            .slice(-24)
            .map((candle) => ({ time: candle.time, close: candle.close }));
          return [instrument.symbol.toUpperCase(), values] as const;
        } catch {
          return [instrument.symbol.toUpperCase(), []] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setDailyHistory((current) => {
        const next = { ...current };
        for (const [symbol, values] of entries) next[symbol] = values;
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [dailyHistory, feed.status?.state, filtered]);

  const currentRows = filtered.slice(0, 40);
  const watchTitle = tab === "watchlist" ? "WATCHLIST" : tab === "all" ? "ALL MARKETS" : tab.toUpperCase();

  function changePercent(instrument: MarketInstrument): number | null {
    const quote = quoteBySymbol.get(instrument.symbol.toUpperCase());
    if (typeof quote?.changePercent === "number" && Number.isFinite(quote.changePercent)) {
      return quote.changePercent;
    }
    const candles = dailyHistory[instrument.symbol.toUpperCase()];
    if (!candles || candles.length < 2) return null;
    const lastCandle = candles[candles.length - 1];
    const lastDay = String(lastCandle.time).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const base =
      lastDay === today
        ? candles[candles.length - 2].close
        : lastCandle.close;
    const currentPrice = quote?.last ?? quote?.bid ?? quote?.ask ?? lastCandle.close;
    if (!Number.isFinite(currentPrice) || !Number.isFinite(base) || base <= 0) return null;
    return ((currentPrice - base) / base) * 100;
  }

  function formattedChange(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return "—";
    return (value > 0 ? "+" : "") + value.toFixed(2) + "%";
  }

  return (
    <section className={"watchlist-screen" + (compact ? " watchlist-compact" : "")}>
      <div className="watchlist-top">
        <label className="watchlist-search">
          <span aria-hidden="true">⌕</span>
          <span className="visually-hidden">Search symbol or name</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search symbol or name"
          />
          {search ? (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
              ×
            </button>
          ) : null}
        </label>

        <div className="watchlist-tabs" role="tablist" aria-label="Market categories">
          {([
            ["watchlist", "☆  Watchlist", counts.watchlist],
            ["all", "All", counts.all],
            ["metals", "Metals", counts.metals],
            ["forex", "Forex", counts.forex],
          ] as [WatchTab, string, number][]).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={"watchlist-tab" + (tab === value ? " active" : "")}
              onClick={() => setTab(value)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="watchlist-columns">
        <span>{watchTitle}</span>
        <span>LAST · CHG%</span>
      </div>

      {feed.error ? <div className="inline-error" role="alert">{feed.error}</div> : null}
      {feed.instrumentError ? (
        <div className="inline-error" role="alert">Instrument list unavailable: {feed.instrumentError}</div>
      ) : null}
      {feed.quoteError ? (
        <div className="inline-error" role="alert">Latest quotes unavailable: {feed.quoteError}</div>
      ) : null}

      {feed.status?.state === "unconfigured" ? (
        <div className="watchlist-empty" role="status">
          <strong>No market data provider connected</strong>
          <span>Connect a licensed provider to display real instruments and prices.</span>
          <Link href="/settings">Provider settings</Link>
        </div>
      ) : null}
      {feed.status?.state === "disconnected" ? (
        <div className="watchlist-empty" role="status">{feed.status.message}</div>
      ) : null}
      {feed.loading ? <div className="watchlist-empty" role="status">Loading market data…</div> : null}

      {!feed.loading && feed.status?.state === "connected" && currentRows.length === 0 ? (
        <div className="watchlist-empty" role="status">
          {search
            ? "No instruments match this search."
            : tab === "watchlist"
              ? "Your watchlist is empty. Add instruments with the star."
              : "No instruments are available in this category."}
        </div>
      ) : null}

      {currentRows.map((instrument) => {
        const symbol = instrument.symbol.toUpperCase();
        const quote = quoteBySymbol.get(symbol);
        const last = quote?.last ?? quote?.bid ?? quote?.ask;
        const values = (dailyHistory[symbol] ?? []).map((candle) => candle.close);
        const change = changePercent(instrument);
        const rising = values.length >= 2
          ? values[values.length - 1] >= values[0]
          : change !== null && change >= 0;
        const path = sparklinePath(values);
        const isFavorite = favorites.includes(instrument.symbol);
        const price = last === undefined
          ? "—"
          : formatPrice(last, instrument);

        return (
          <div
            key={instrument.symbol}
            className={"watchlist-row" + (selectedSymbol === symbol ? " selected" : "")}
          >
            <Link
              href={"/charts?symbol=" + encodeURIComponent(instrument.symbol)}
              className="watchlist-instrument"
              onClick={() => setSelectedSymbol(symbol)}
              aria-label={"Open " + instrument.symbol + " chart"}
            >
              <WatchPairMark instrument={instrument} />
              <span className="watchlist-instrument-copy">
                <strong>{instrument.symbol}</strong>
                <span>{instrument.displayName}</span>
              </span>
            </Link>

            <span className="watchlist-spark" aria-hidden="true">
              {path ? (
                <svg viewBox="0 0 100 32" preserveAspectRatio="none">
                  <path d={path} className={rising ? "up" : "down"} />
                </svg>
              ) : (
                <span className="watchlist-spark-empty">—</span>
              )}
            </span>

            <span className="watchlist-price">
              <strong>{price}</strong>
              <span className={"watchlist-change" + (change === null ? "" : change >= 0 ? " positive" : " negative")}>
                {formattedChange(change)}
              </span>
            </span>

            <button
              type="button"
              className={"watchlist-favorite" + (isFavorite ? " active" : "")}
              aria-label={(isFavorite ? "Remove " : "Add ") + instrument.symbol + " " + (isFavorite ? "from" : "to") + " watchlist"}
              aria-pressed={isFavorite}
              onClick={() => toggle(instrument.symbol)}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          </div>
        );
      })}

      {feed.status?.state === "connected" && feed.quotes.length > 0 ? (
        <p className="watchlist-data-note">
          Prices and candles are supplied by {feed.status.provider}.
          {feed.status.delayed ? " Quotes are delayed." : ""}
        </p>
      ) : null}
      <div className="watchlist-footer">
        <button type="button" onClick={feed.refresh} disabled={feed.refreshing}>
          {feed.refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <span>{feed.quotes.length} quotes · provider data only</span>
      </div>
    </section>
  );
}
