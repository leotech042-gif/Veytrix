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
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
} from "@veytrix/shared";
import {
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

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
  const [category, setCategory] = useState<MarketCategory | "all">("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const isSearching = query.length > 0;

    return feed.instruments.filter((instrument) => {
      const matchesQuery =
        !query ||
        instrument.symbol.toLocaleLowerCase().includes(query) ||
        instrument.displayName.toLocaleLowerCase().includes(query);

      const matchesCategory =
        category === "all" || instrument.category === category;

      const matchesFavorite =
        isSearching || favorites.includes(instrument.symbol);

      return matchesQuery && matchesCategory && matchesFavorite;
    });
  }, [category, favorites, feed.instruments, search]);

  const quoteBySymbol = useMemo(
    () =>
      new Map(
        feed.quotes.map((quote) => [
          quote.instrument.toLocaleUpperCase(),
          quote,
        ]),
      ),
    [feed.quotes],
  );

  return (
    <section className={`panel${compact ? " compact-panel" : ""}`}>
      <div className="panel-heading">
        <div>
          <h2>
            {favoritesOnly ? "Favourite markets" : "Quotes & market watch"}
          </h2>
          <p className="panel-description">
            Broker-independent quotes and instruments from the configured
            market-data provider.
          </p>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={feed.refresh}
          disabled={feed.refreshing}
        >
          {feed.refreshing ? "Checking…" : "Refresh"}
        </button>
      </div>

      {feed.status?.state === "connected" && (
        <p className="market-feed-status" role="status">
          Market data from <strong>{feed.status.provider}</strong>
          {feed.status.updatedAt
            ? ` · connection checked ${formatTime(feed.status.updatedAt)}`
            : ""}
          {feed.status.delayed ? " · delayed" : ""}
        </p>
      )}

      {feed.status?.state === "connected" && (
        <div className="market-filters">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <span className="visually-hidden">Search instruments</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search any pair to add to favourites…"
            />
          </label>

          {!favoritesOnly && (
            <label className="select-field">
              <span className="visually-hidden">Filter by market category</span>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as MarketCategory | "all")
                }
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}

        </div>
      )}

      {feed.error && (
        <div className="inline-error" role="alert">
          {feed.error}
        </div>
      )}

      {feed.status?.state === "unconfigured" && (
        <div className="empty-state" role="status">
          <span className="empty-state-icon" aria-hidden="true">
            ◈
          </span>
          <h3>No market provider connected</h3>
          <p>
            Instruments are discovered from your provider. Configure a licensed
            market-data feed in the API to populate this list.
          </p>
          <Link className="secondary-button" href="/settings">
            View connection settings
          </Link>
        </div>
      )}

      {feed.status?.state === "disconnected" && (
        <div className="inline-error" role="status">
          {feed.status.message}
        </div>
      )}

      {feed.instrumentError && (
        <div className="inline-error" role="alert">
          Instrument list unavailable: {feed.instrumentError}
        </div>
      )}

      {feed.quoteError && (
        <div className="inline-error" role="alert">
          Latest quotes unavailable: {feed.quoteError}
        </div>
      )}

      {feed.loading && (
        <div className="empty-state compact-empty" role="status">
          Checking provider instruments…
        </div>
      )}

      {!feed.loading &&
        feed.status?.state === "connected" &&
        !feed.instrumentError &&
        filtered.length === 0 && (
          <div className="empty-state compact-empty" role="status">
            {feed.instruments.length === 0
              ? "The connected provider has not returned any supported instruments."
              : favorites.length === 0 && !search
                ? "No favourites yet. Type a pair name above and click the star to add it."
                : "No favourite instruments match this search."}
          </div>
        )}

      {filtered.length > 0 && (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead>
              <tr>
                <th scope="col">Instrument</th>
                <th scope="col">Bid</th>
                <th scope="col">Ask</th>
                <th scope="col">Last</th>
                <th scope="col">Spread</th>
                <th scope="col">Change</th>
                <th scope="col">Updated</th>
                <th scope="col">
                  <span className="visually-hidden">Favourite</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((instrument) => {
                const quote = quoteBySymbol.get(
                  instrument.symbol.toLocaleUpperCase(),
                );
                const spread =
                  quote?.spread ??
                  (quote?.bid !== undefined && quote.ask !== undefined
                    ? quote.ask - quote.bid
                    : undefined);
                const change =
                  quote?.change === undefined
                    ? null
                    : formatPrice(quote.change, instrument);
                const changePercent =
                  quote?.changePercent === undefined
                    ? null
                    : `${quote.changePercent > 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`;

                return (
                  <tr key={instrument.symbol}>
                    <th scope="row">
                      <Link
                        href={`/charts?symbol=${instrument.symbol}`}
                        className="instrument-link"
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          display: "block",
                        }}
                      >
                        <span className="instrument-pair">
                          {instrument.symbol}
                        </span>
                        <span className="instrument-name">
                          {instrument.displayName}
                        </span>
                      </Link>
                    </th>
                    <td>
                      {quote?.bid === undefined
                        ? "—"
                        : formatPrice(quote.bid, instrument)}
                    </td>
                    <td>
                      {quote?.ask === undefined
                        ? "—"
                        : formatPrice(quote.ask, instrument)}
                    </td>
                    <td>
                      {quote?.last === undefined
                        ? "—"
                        : formatPrice(quote.last, instrument)}
                    </td>
                    <td>
                      {spread === undefined
                        ? "—"
                        : formatPrice(spread, instrument)}
                    </td>
                    <td>
                      {change || changePercent
                        ? [change, changePercent].filter(Boolean).join(" · ")
                        : "—"}
                    </td>
                    <td>
                      {quote ? (
                        <time dateTime={quote.asOf}>
                          {formatTime(quote.asOf)}
                        </time>
                      ) : (
                        <span className="instrument-state">
                          Quote unavailable
                        </span>
                      )}
                      {quote?.delayed && (
                        <span className="instrument-state">Delayed</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={`favorite-button${
                          favorites.includes(instrument.symbol)
                            ? " selected"
                            : ""
                        }`}
                        type="button"
                        aria-label={`${
                          favorites.includes(instrument.symbol)
                            ? "Remove"
                            : "Add"
                        } ${instrument.symbol} ${
                          favorites.includes(instrument.symbol) ? "from" : "to"
                        } favourites`}
                        aria-pressed={favorites.includes(instrument.symbol)}
                        onClick={() => toggle(instrument.symbol)}
                      >
                        {favorites.includes(instrument.symbol) ? "★" : "☆"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="market-cards">
          {filtered.map((instrument) => {
            const quote = quoteBySymbol.get(
              instrument.symbol.toLocaleUpperCase(),
            );
            const spread =
              quote?.spread ??
              (quote?.bid !== undefined && quote.ask !== undefined
                ? quote.ask - quote.bid
                : undefined);
            const isFavorite = favorites.includes(instrument.symbol);

            return (
              <article className="quote-card" key={instrument.symbol}>
                <div className="quote-card-heading">
                  <div>
                    <Link
                      href={`/charts?symbol=${instrument.symbol}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <strong>{instrument.symbol}</strong>
                      <span>{instrument.displayName}</span>
                    </Link>
                  </div>
                  <button
                    className={`favorite-button${isFavorite ? " selected" : ""}`}
                    type="button"
                    aria-label={`${
                      isFavorite ? "Remove" : "Add"
                    } ${instrument.symbol} ${
                      isFavorite ? "from" : "to"
                    } favourites`}
                    aria-pressed={isFavorite}
                    onClick={() => toggle(instrument.symbol)}
                  >
                    {isFavorite ? "★" : "☆"}
                  </button>
                </div>
                <div className="quote-card-prices">
                  <div>
                    <span>Bid</span>
                    <strong>
                      {quote?.bid === undefined
                        ? "—"
                        : formatPrice(quote.bid, instrument)}
                    </strong>
                  </div>
                  <div>
                    <span>Ask</span>
                    <strong>
                      {quote?.ask === undefined
                        ? "—"
                        : formatPrice(quote.ask, instrument)}
                    </strong>
                  </div>
                  <div>
                    <span>Last</span>
                    <strong>
                      {quote?.last === undefined
                        ? "—"
                        : formatPrice(quote.last, instrument)}
                    </strong>
                  </div>
                </div>
                <div className="quote-card-meta">
                  <span>
                    Spread{" "}
                    {spread === undefined
                      ? "—"
                      : formatPrice(spread, instrument)}
                  </span>
                  <span>
                    Change{" "}
                    {quote?.change === undefined
                      ? "—"
                      : formatPrice(quote.change, instrument)}
                    {quote?.changePercent === undefined
                      ? ""
                      : ` · ${quote.changePercent > 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`}
                  </span>
                </div>
                <div className="quote-card-time">
                  {quote ? (
                    <>
                      <time dateTime={quote.asOf}>
                        {formatTime(quote.asOf)}
                      </time>
                      {quote.delayed && <span>Delayed</span>}
                    </>
                  ) : (
                    <span>Quote unavailable</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {feed.status?.state === "connected" && feed.quotes.length > 0 && (
        <p className="market-data-note">
          Quote timestamps are supplied by the provider. Refreshing
          automatically every 30 seconds; provider delays are shown when
          reported.
        </p>
      )}
    </section>
  );
}
