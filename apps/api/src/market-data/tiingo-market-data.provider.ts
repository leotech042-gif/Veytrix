import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  ChartTimeframe,
  MarketCandle,
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
} from "@veytrix/shared";
import type { MarketDataProvider } from "./market-data-provider";

type SymbolDef = {
  ticker: string;
  display: string;
  name: string;
  category: "forex" | "metals";
  precision: number;
};

@Injectable()
export class TiingoMarketDataProvider implements MarketDataProvider {
  private readonly logger = new Logger(TiingoMarketDataProvider.name);
  private readonly apiKey = process.env.TIINGO_API_KEY?.trim();
  private readonly baseUrl = "https://api.tiingo.com";
  private readonly quoteCacheDurationMs = 5 * 60_000;
  private cachedQuotes: MarketQuote[] = [];
  private quotesFetchedAt = 0;

  /** Simple in-memory history cache to protect free-tier limits */
  private readonly historyCache = new Map<
    string,
    { at: number; candles: MarketCandle[] }
  >();

  private readonly symbols: SymbolDef[] = [
    // Forex Majors
    {
      ticker: "eurusd",
      display: "EURUSD",
      name: "Euro / US Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "gbpusd",
      display: "GBPUSD",
      name: "British Pound / US Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "usdjpy",
      display: "USDJPY",
      name: "US Dollar / Japanese Yen",
      category: "forex",
      precision: 3,
    },
    {
      ticker: "usdchf",
      display: "USDCHF",
      name: "US Dollar / Swiss Franc",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "audusd",
      display: "AUDUSD",
      name: "Australian Dollar / US Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "usdcad",
      display: "USDCAD",
      name: "US Dollar / Canadian Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "nzdusd",
      display: "NZDUSD",
      name: "New Zealand Dollar / US Dollar",
      category: "forex",
      precision: 5,
    },

    // Forex Crosses
    {
      ticker: "eurgbp",
      display: "EURGBP",
      name: "Euro / British Pound",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "eurjpy",
      display: "EURJPY",
      name: "Euro / Japanese Yen",
      category: "forex",
      precision: 3,
    },
    {
      ticker: "gbpjpy",
      display: "GBPJPY",
      name: "British Pound / Japanese Yen",
      category: "forex",
      precision: 3,
    },
    {
      ticker: "eurchf",
      display: "EURCHF",
      name: "Euro / Swiss Franc",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "audjpy",
      display: "AUDJPY",
      name: "Australian Dollar / Japanese Yen",
      category: "forex",
      precision: 3,
    },
    {
      ticker: "cadjpy",
      display: "CADJPY",
      name: "Canadian Dollar / Japanese Yen",
      category: "forex",
      precision: 3,
    },
    {
      ticker: "chfjpy",
      display: "CHFJPY",
      name: "Swiss Franc / Japanese Yen",
      category: "forex",
      precision: 3,
    },
    {
      ticker: "euraud",
      display: "EURAUD",
      name: "Euro / Australian Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "eurcad",
      display: "EURCAD",
      name: "Euro / Canadian Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "gbpaud",
      display: "GBPAUD",
      name: "British Pound / Australian Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "gbpcad",
      display: "GBPCAD",
      name: "British Pound / Canadian Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "audcad",
      display: "AUDCAD",
      name: "Australian Dollar / Canadian Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "audnzd",
      display: "AUDNZD",
      name: "Australian Dollar / New Zealand Dollar",
      category: "forex",
      precision: 5,
    },
    {
      ticker: "nzdjpy",
      display: "NZDJPY",
      name: "New Zealand Dollar / Japanese Yen",
      category: "forex",
      precision: 3,
    },

    // Metals
    {
      ticker: "xauusd",
      display: "XAUUSD",
      name: "Gold / US Dollar",
      category: "metals",
      precision: 2,
    },
    {
      ticker: "xagusd",
      display: "XAGUSD",
      name: "Silver / US Dollar",
      category: "metals",
      precision: 3,
    },
  ];

  getStatus(): MarketDataStatus {
    if (!this.apiKey) {
      return {
        state: "unconfigured",
        provider: null,
        message: "TIINGO_API_KEY is missing in .env",
      };
    }

    return {
      state: "connected",
      provider: "Tiingo",
      message: "Live market data from Tiingo",
      updatedAt: new Date().toISOString(),
      delayed: false,
    };
  }

  async getInstruments(): Promise<readonly MarketInstrument[]> {
    return this.symbols.map((s) => ({
      symbol: s.display,
      displayName: s.name,
      category: s.category,
      pricePrecision: s.precision,
      baseCurrency: s.display.slice(0, 3),
      quoteCurrency: s.display.slice(3),
    }));
  }

  async getQuotes(): Promise<readonly MarketQuote[]> {
    if (!this.apiKey) return [];

    if (
      this.cachedQuotes.length > 0 &&
      Date.now() - this.quotesFetchedAt < this.quoteCacheDurationMs
    ) {
      return this.cachedQuotes;
    }

    const tickers = this.symbols.map((s) => s.ticker).join(",");
    const url = `${this.baseUrl}/tiingo/fx/top?tickers=${tickers}&token=${this.apiKey}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429 && this.cachedQuotes.length > 0) {
          this.logger.warn(
            "Tiingo HTTP 429 - serving cached quotes as delayed.",
          );
          return this.cachedQuotes.map((q) => ({ ...q, delayed: true }));
        }
        return this.useCachedQuotesOrThrow(
          `Tiingo quotes are currently unavailable (HTTP ${res.status}).`,
          res.status,
        );
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        return this.useCachedQuotesOrThrow(
          "Tiingo returned an invalid quote response.",
        );
      }

      const quotes: MarketQuote[] = [];

      for (const item of data) {
        const symbolInfo = this.symbols.find(
          (s) => s.ticker === item.ticker?.toLowerCase(),
        );
        if (!symbolInfo) continue;

        const mid = Number(item.midPrice ?? item.lastPrice);
        if (!Number.isFinite(mid) || mid <= 0) continue;

        const bidValue =
          item.bidPrice === undefined || item.bidPrice === null
            ? undefined
            : Number(item.bidPrice);
        const askValue =
          item.askPrice === undefined || item.askPrice === null
            ? undefined
            : Number(item.askPrice);
        const bid =
          bidValue !== undefined && Number.isFinite(bidValue) && bidValue > 0
            ? bidValue
            : undefined;
        const ask =
          askValue !== undefined && Number.isFinite(askValue) && askValue > 0
            ? askValue
            : undefined;
        if (bid !== undefined && ask !== undefined && bid > ask) continue;

        quotes.push({
          instrument: symbolInfo.display,
          asOf: item.quoteTimestamp || new Date().toISOString(),
          last: +Number(mid).toFixed(symbolInfo.precision),
          ...(bid !== undefined && {
            bid: +bid.toFixed(symbolInfo.precision),
          }),
          ...(ask !== undefined && {
            ask: +ask.toFixed(symbolInfo.precision),
          }),
          ...(bid !== undefined &&
            ask !== undefined && {
              spread: +(ask - bid).toFixed(symbolInfo.precision),
            }),
          change: undefined,
          changePercent: undefined,
          delayed: false,
        });
      }

      if (quotes.length === 0) {
        return this.useCachedQuotesOrThrow(
          "Tiingo did not return any current quotes.",
        );
      }

      this.cachedQuotes = quotes;
      this.quotesFetchedAt = Date.now();
      return quotes;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn("Tiingo quotes request could not be completed.");
      return this.useCachedQuotesOrThrow(
        "Tiingo quotes are currently unavailable. Try again later.",
      );
    }
  }

  private useCachedQuotesOrThrow(
    message: string,
    status?: number,
  ): readonly MarketQuote[] {
    if (this.cachedQuotes.length > 0) {
      this.logger.warn(
        `${message} Returning cached provider quotes as delayed.`,
      );
      return this.cachedQuotes.map((quote) => ({ ...quote, delayed: true }));
    }

    this.logger.warn(message);
    throw new ServiceUnavailableException({
      code: "MARKET_DATA_QUOTES_UNAVAILABLE",
      message,
      ...(status === 429 && { retryable: true }),
    });
  }

  /**
   * Real Tiingo FX history → MarketCandle[]
   * https://api.tiingo.com/tiingo/fx/{ticker}/prices
   */
  async getHistory(
    instrument: string,
    timeframe: ChartTimeframe,
  ): Promise<readonly MarketCandle[]> {
    if (!this.apiKey) return [];

    const symbolInfo = this.symbols.find(
      (s) => s.display === instrument || s.ticker === instrument.toLowerCase(),
    );
    if (!symbolInfo) return [];

    const cacheKey = `${symbolInfo.ticker}:${timeframe}`;
    const cached = this.historyCache.get(cacheKey);
    const cacheDuration: Record<ChartTimeframe, number> = {
      M1: 60_000,
      M3: 3 * 60_000,
      M5: 5 * 60_000,
      M15: 18 * 60_000,
      M30: 60 * 60_000,
      H1: 60 * 60_000,
      H4: 4 * 60 * 60_000,
      D1: 24 * 60 * 60_000,
      W1: 24 * 60 * 60_000,
    }[timeframe];
    if (cached && Date.now() - cached.at < cacheDuration) {
      return cached.candles;
    }

    const { resampleFreq, startDate } = this.historyParams(timeframe);
    const endDate = new Date().toISOString().slice(0, 10);

    const url =
      `${this.baseUrl}/tiingo/fx/${symbolInfo.ticker}/prices` +
      `?startDate=${startDate}&endDate=${endDate}` +
      `&resampleFreq=${resampleFreq}&token=${this.apiKey}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(
          `Tiingo history ${symbolInfo.ticker} ${timeframe} HTTP ${res.status}`,
        );
        return cached?.candles ?? [];
      }

      const data: unknown = await res.json();
      if (!Array.isArray(data)) return cached?.candles ?? [];

      const candles: MarketCandle[] = [];

      for (const row of data) {
        if (typeof row !== "object" || row === null) continue;
        const r = row as Record<string, unknown>;

        const open = Number(r.open);
        const high = Number(r.high);
        const low = Number(r.low);
        const close = Number(r.close);
        const dateRaw = r.date ?? r.timestamp;

        if (
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close) ||
          typeof dateRaw !== "string"
        ) {
          continue;
        }

        candles.push({
          time: dateRaw,
          open,
          high,
          low,
          close,
          ...(typeof r.volume === "number" && Number.isFinite(r.volume)
            ? { volume: r.volume }
            : {}),
        });
      }

      // Tiingo sometimes returns oldest→newest; ensure ascending
      candles.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );

      this.historyCache.set(cacheKey, { at: Date.now(), candles });
      return candles;
    } catch (err) {
      this.logger.warn(
        `Tiingo history failed for ${symbolInfo.ticker} ${timeframe}`,
        err instanceof Error ? err.message : err,
      );
      return cached?.candles ?? [];
    }
  }

  /** Map chart TF → Tiingo resampleFreq + lookback start */
  private historyParams(timeframe: ChartTimeframe): {
    resampleFreq: string;
    startDate: string;
  } {
    const daysBack = (n: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };

    switch (timeframe) {
      case "M1":
        return { resampleFreq: "1min", startDate: daysBack(2) };
      case "M3":
        return { resampleFreq: "3min", startDate: daysBack(3) };
      case "M5":
        return { resampleFreq: "5min", startDate: daysBack(5) };
      case "M15":
        return { resampleFreq: "15min", startDate: daysBack(10) };
      case "M30":
        return { resampleFreq: "30min", startDate: daysBack(14) };
      case "H1":
        return { resampleFreq: "1hour", startDate: daysBack(30) };
      case "H4":
        return { resampleFreq: "4hour", startDate: daysBack(60) };
      case "D1":
        // Daily bars for bias / % change
        return { resampleFreq: "1day", startDate: daysBack(120) };
      case "W1":
        return { resampleFreq: "1day", startDate: daysBack(400) };
      default:
        return { resampleFreq: "1hour", startDate: daysBack(30) };
    }
  }
}
