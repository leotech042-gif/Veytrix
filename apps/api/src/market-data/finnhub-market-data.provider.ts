import { Injectable, Logger } from "@nestjs/common";
import type {
  ChartTimeframe,
  MarketCandle,
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
} from "@veytrix/shared";
import type { MarketDataProvider } from "./market-data-provider";

@Injectable()
export class FinnhubMarketDataProvider implements MarketDataProvider {
  private readonly logger = new Logger(FinnhubMarketDataProvider.name);
  private readonly apiKey = process.env.FINNHUB_API_KEY?.trim();
  private readonly baseUrl = "https://finnhub.io/api/v1";

  // Symbols that work best on free tier
  private readonly symbols = [
    // ===== FOREX MAJORS =====
    {
      symbol: "EURUSD",
      display: "EURUSD",
      name: "Euro / US Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "GBPUSD",
      display: "GBPUSD",
      name: "British Pound / US Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "USDJPY",
      display: "USDJPY",
      name: "US Dollar / Japanese Yen",
      category: "forex" as const,
      precision: 3,
    },
    {
      symbol: "USDCHF",
      display: "USDCHF",
      name: "US Dollar / Swiss Franc",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "AUDUSD",
      display: "AUDUSD",
      name: "Australian Dollar / US Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "USDCAD",
      display: "USDCAD",
      name: "US Dollar / Canadian Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "NZDUSD",
      display: "NZDUSD",
      name: "New Zealand Dollar / US Dollar",
      category: "forex" as const,
      precision: 5,
    },

    // ===== FOREX MINORS / CROSSES =====
    {
      symbol: "EURGBP",
      display: "EURGBP",
      name: "Euro / British Pound",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "EURJPY",
      display: "EURJPY",
      name: "Euro / Japanese Yen",
      category: "forex" as const,
      precision: 3,
    },
    {
      symbol: "GBPJPY",
      display: "GBPJPY",
      name: "British Pound / Japanese Yen",
      category: "forex" as const,
      precision: 3,
    },
    {
      symbol: "EURCHF",
      display: "EURCHF",
      name: "Euro / Swiss Franc",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "AUDJPY",
      display: "AUDJPY",
      name: "Australian Dollar / Japanese Yen",
      category: "forex" as const,
      precision: 3,
    },
    {
      symbol: "CADJPY",
      display: "CADJPY",
      name: "Canadian Dollar / Japanese Yen",
      category: "forex" as const,
      precision: 3,
    },
    {
      symbol: "CHFJPY",
      display: "CHFJPY",
      name: "Swiss Franc / Japanese Yen",
      category: "forex" as const,
      precision: 3,
    },
    {
      symbol: "EURAUD",
      display: "EURAUD",
      name: "Euro / Australian Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "EURCAD",
      display: "EURCAD",
      name: "Euro / Canadian Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "GBPAUD",
      display: "GBPAUD",
      name: "British Pound / Australian Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "GBPCAD",
      display: "GBPCAD",
      name: "British Pound / Canadian Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "AUDCAD",
      display: "AUDCAD",
      name: "Australian Dollar / Canadian Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "AUDNZD",
      display: "AUDNZD",
      name: "Australian Dollar / New Zealand Dollar",
      category: "forex" as const,
      precision: 5,
    },
    {
      symbol: "NZDJPY",
      display: "NZDJPY",
      name: "New Zealand Dollar / Japanese Yen",
      category: "forex" as const,
      precision: 3,
    },

    // ===== METALS =====
    {
      symbol: "XAUUSD",
      display: "XAUUSD",
      name: "Gold / US Dollar",
      category: "metals" as const,
      precision: 2,
    },
    {
      symbol: "XAGUSD",
      display: "XAGUSD",
      name: "Silver / US Dollar",
      category: "metals" as const,
      precision: 3,
    },
    {
      symbol: "XPTUSD",
      display: "XPTUSD",
      name: "Platinum / US Dollar",
      category: "metals" as const,
      precision: 2,
    },
    {
      symbol: "XPDUSD",
      display: "XPDUSD",
      name: "Palladium / US Dollar",
      category: "metals" as const,
      precision: 2,
    },

    // ===== CRYPTO =====
    {
      symbol: "BINANCE:BTCUSDT",
      display: "BTCUSD",
      name: "Bitcoin / US Dollar",
      category: "crypto" as const,
      precision: 2,
    },
    {
      symbol: "BINANCE:ETHUSDT",
      display: "ETHUSD",
      name: "Ethereum / US Dollar",
      category: "crypto" as const,
      precision: 2,
    },
    {
      symbol: "BINANCE:BNBUSDT",
      display: "BNBUSD",
      name: "BNB / US Dollar",
      category: "crypto" as const,
      precision: 2,
    },
    {
      symbol: "BINANCE:XRPUSDT",
      display: "XRPUSD",
      name: "XRP / US Dollar",
      category: "crypto" as const,
      precision: 4,
    },
    {
      symbol: "BINANCE:SOLUSDT",
      display: "SOLUSD",
      name: "Solana / US Dollar",
      category: "crypto" as const,
      precision: 2,
    },
    {
      symbol: "BINANCE:ADAUSDT",
      display: "ADAUSD",
      name: "Cardano / US Dollar",
      category: "crypto" as const,
      precision: 4,
    },
    {
      symbol: "BINANCE:DOGEUSDT",
      display: "DOGEUSD",
      name: "Dogecoin / US Dollar",
      category: "crypto" as const,
      precision: 5,
    },
    {
      symbol: "BINANCE:DOTUSDT",
      display: "DOTUSD",
      name: "Polkadot / US Dollar",
      category: "crypto" as const,
      precision: 3,
    },
    {
      symbol: "BINANCE:AVAXUSDT",
      display: "AVAXUSD",
      name: "Avalanche / US Dollar",
      category: "crypto" as const,
      precision: 2,
    },
    {
      symbol: "BINANCE:LINKUSDT",
      display: "LINKUSD",
      name: "Chainlink / US Dollar",
      category: "crypto" as const,
      precision: 3,
    },

    // ===== INDICES =====
    {
      symbol: "FOREXCOM:SPXUSD",
      display: "US500",
      name: "S&P 500",
      category: "indices" as const,
      precision: 1,
    },
    {
      symbol: "FOREXCOM:NSXUSD",
      display: "US100",
      name: "Nasdaq 100",
      category: "indices" as const,
      precision: 1,
    },
    {
      symbol: "FOREXCOM:DJI",
      display: "US30",
      name: "Dow Jones 30",
      category: "indices" as const,
      precision: 1,
    },
    {
      symbol: "FOREXCOM:UKXGBP",
      display: "UK100",
      name: "FTSE 100",
      category: "indices" as const,
      precision: 1,
    },
    {
      symbol: "FOREXCOM:GER40",
      display: "GER40",
      name: "DAX 40",
      category: "indices" as const,
      precision: 1,
    },
    {
      symbol: "FOREXCOM:JPN225",
      display: "JP225",
      name: "Nikkei 225",
      category: "indices" as const,
      precision: 1,
    },
    {
      symbol: "TVC:HSI",
      display: "HK50",
      name: "Hang Seng",
      category: "indices" as const,
      precision: 1,
    },
    {
      symbol: "TVC:AU200",
      display: "AUS200",
      name: "ASX 200",
      category: "indices" as const,
      precision: 1,
    },

    // ===== STOCKS (popular) =====
    {
      symbol: "AAPL",
      display: "AAPL",
      name: "Apple Inc.",
      category: "other" as const,
      precision: 2,
    },
    {
      symbol: "MSFT",
      display: "MSFT",
      name: "Microsoft",
      category: "other" as const,
      precision: 2,
    },
    {
      symbol: "GOOGL",
      display: "GOOGL",
      name: "Alphabet",
      category: "other" as const,
      precision: 2,
    },
    {
      symbol: "AMZN",
      display: "AMZN",
      name: "Amazon",
      category: "other" as const,
      precision: 2,
    },
    {
      symbol: "TSLA",
      display: "TSLA",
      name: "Tesla",
      category: "other" as const,
      precision: 2,
    },
    {
      symbol: "NVDA",
      display: "NVDA",
      name: "NVIDIA",
      category: "other" as const,
      precision: 2,
    },
    {
      symbol: "META",
      display: "META",
      name: "Meta Platforms",
      category: "other" as const,
      precision: 2,
    },
    {
      symbol: "NFLX",
      display: "NFLX",
      name: "Netflix",
      category: "other" as const,
      precision: 2,
    },
  ];

  getStatus(): MarketDataStatus {
    if (!this.apiKey) {
      return {
        state: "unconfigured",
        provider: null,
        message: "FINNHUB_API_KEY is missing in .env",
      };
    }

    return {
      state: "connected",
      provider: "Finnhub",
      message: "Live market data from Finnhub (free tier)",
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

    const results = await Promise.allSettled(
      this.symbols.map(async (s) => {
        const candidates = [s.symbol, `OANDA:${s.display}`, s.display];

        for (const sym of candidates) {
          try {
            const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(sym)}&token=${this.apiKey}`;
            const res = await fetch(url);
            if (!res.ok) {
              this.logger.warn(
                `Finnhub quote request failed for ${sym}: ${res.status}`,
              );
              continue;
            }

            const data = await res.json();
            const last = Number(data.c);
            if (!Number.isFinite(last) || last <= 0) continue;

            const change =
              data.d === undefined || data.d === null
                ? undefined
                : Number(data.d);
            const changePercent =
              data.dp === undefined || data.dp === null
                ? undefined
                : Number(data.dp);
            const timestamp = Number(data.t);
            if (!Number.isFinite(timestamp) || timestamp <= 0) continue;

            return {
              instrument: s.display,
              asOf: new Date(timestamp * 1000).toISOString(),
              last: +last.toFixed(s.precision),
              ...(change !== undefined && Number.isFinite(change) && {
                change: +change.toFixed(s.precision + 1),
              }),
              ...(changePercent !== undefined &&
                Number.isFinite(changePercent) && {
                changePercent: +changePercent.toFixed(3),
              }),
              delayed: false,
            } satisfies MarketQuote;
          } catch (error) {
            this.logger.warn(
              `Finnhub quote request failed for ${sym}: ${
                error instanceof Error ? error.message : "unknown error"
              }`,
            );
          }
        }

        return undefined;
      }),
    );

    const quotes: MarketQuote[] = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== undefined) {
        quotes.push(result.value);
      } else if (result.status === "rejected") {
        this.logger.warn("Finnhub quote lookup failed", result.reason);
      }
    }
    return quotes;
  }

  async getHistory(
    instrument: string,
    timeframe: ChartTimeframe,
  ): Promise<readonly MarketCandle[]> {
    if (!this.apiKey) return [];

    const symbolInfo = this.symbols.find(
      (s) => s.display.toUpperCase() === instrument.toUpperCase(),
    );
    if (!symbolInfo) return [];

    const resolutionMap: Record<ChartTimeframe, string> = {
      M1: "1",
      M3: "3",
      M5: "5",
      M15: "15",
      M30: "30",
      H1: "60",
      H4: "240",
      D1: "D",
      W1: "W",
    };

    const resolution = resolutionMap[timeframe];
    const to = Math.floor(Date.now() / 1000);
    const from = to - 300 * this.timeframeToSeconds(timeframe);

    // Try forex candle first
    const urls = [
      `${this.baseUrl}/forex/candle?symbol=OANDA:${symbolInfo.display.slice(0, 3)}_${symbolInfo.display.slice(3)}&resolution=${resolution}&from=${from}&to=${to}&token=${this.apiKey}`,
      `${this.baseUrl}/forex/candle?symbol=${symbolInfo.symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${this.apiKey}`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.status === 403) {
          this.logger.warn(
            `Finnhub history 403 for ${instrument} (free tier limitation)`,
          );
          break; // no point trying more
        }
        if (!res.ok) continue;

        const data = await res.json();
        if (
          data.s !== "ok" ||
          !Array.isArray(data.t) ||
          !Array.isArray(data.o) ||
          !Array.isArray(data.h) ||
          !Array.isArray(data.l) ||
          !Array.isArray(data.c) ||
          !data.t.length ||
          data.o.length !== data.t.length ||
          data.h.length !== data.t.length ||
          data.l.length !== data.t.length ||
          data.c.length !== data.t.length
        ) {
          continue;
        }

        const candles: MarketCandle[] = [];
        for (let i = 0; i < data.t.length; i++) {
          const timestamp = Number(data.t[i]);
          const open = Number(data.o[i]);
          const high = Number(data.h[i]);
          const low = Number(data.l[i]);
          const close = Number(data.c[i]);
          if (
            !Number.isFinite(timestamp) ||
            ![open, high, low, close].every(Number.isFinite) ||
            high < Math.max(open, close, low) ||
            low > Math.min(open, close, high)
          ) {
            continue;
          }
          candles.push({
            time: new Date(timestamp * 1000).toISOString(),
            open: +open.toFixed(symbolInfo.precision),
            high: +high.toFixed(symbolInfo.precision),
            low: +low.toFixed(symbolInfo.precision),
            close: +close.toFixed(symbolInfo.precision),
            volume:
              Array.isArray(data.v) && Number.isFinite(Number(data.v[i]))
                ? Number(data.v[i])
                : undefined,
          });
        }
        if (candles.length > 0) return candles;
      } catch (err) {
        this.logger.warn(`Finnhub history error for ${instrument}`, err);
      }
    }

    return [];
  }

  // ---------- helpers ----------

  private timeframeToSeconds(tf: ChartTimeframe): number {
    const map: Record<ChartTimeframe, number> = {
      M1: 60,
      M3: 180,
      M5: 300,
      M15: 900,
      M30: 1800,
      H1: 3600,
      H4: 14400,
      D1: 86400,
      W1: 604800,
    };
    return map[tf] ?? 3600;
  }
}
