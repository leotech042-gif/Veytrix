import { Injectable } from "@nestjs/common";
import type {
  ChartTimeframe,
  MarketCandle,
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
} from "@veytrix/shared";
import type { MarketDataProvider } from "./market-data-provider";

@Injectable()
export class MockMarketDataProvider implements MarketDataProvider {
  private readonly instruments: MarketInstrument[] = [
    {
      symbol: "EURUSD",
      displayName: "Euro / US Dollar",
      category: "forex",
      pricePrecision: 5,
      baseCurrency: "EUR",
      quoteCurrency: "USD",
    },
    {
      symbol: "GBPUSD",
      displayName: "British Pound / US Dollar",
      category: "forex",
      pricePrecision: 5,
      baseCurrency: "GBP",
      quoteCurrency: "USD",
    },
    {
      symbol: "USDJPY",
      displayName: "US Dollar / Japanese Yen",
      category: "forex",
      pricePrecision: 3,
      baseCurrency: "USD",
      quoteCurrency: "JPY",
    },
    {
      symbol: "XAUUSD",
      displayName: "Gold / US Dollar",
      category: "metals",
      pricePrecision: 2,
      baseCurrency: "XAU",
      quoteCurrency: "USD",
    },
    {
      symbol: "BTCUSD",
      displayName: "Bitcoin / US Dollar",
      category: "crypto",
      pricePrecision: 2,
      baseCurrency: "BTC",
      quoteCurrency: "USD",
    },
  ];

  getStatus(): MarketDataStatus {
    return {
      state: "connected",
      provider: "MockMarketDataProvider",
      message: "Mock feed is active (development only)",
      updatedAt: new Date().toISOString(),
      delayed: false,
    };
  }

  async getInstruments(): Promise<readonly MarketInstrument[]> {
    return this.instruments;
  }

  async getQuotes(): Promise<readonly MarketQuote[]> {
    const now = new Date().toISOString();

    return this.instruments.map((inst) => {
      const mid = this.randomMid(inst.symbol);
      const spread =
        inst.symbol.includes("JPY") || inst.symbol.startsWith("XAU")
          ? 0.02
          : 0.00015;
      const precision = inst.pricePrecision ?? 5;

      return {
        instrument: inst.symbol,
        asOf: now,
        bid: +(mid - spread / 2).toFixed(precision),
        ask: +(mid + spread / 2).toFixed(precision),
        last: +mid.toFixed(precision),
        spread: +spread.toFixed(precision),
        change: +(Math.random() * 0.002 - 0.001).toFixed(5),
        changePercent: +(Math.random() * 0.2 - 0.1).toFixed(3),
        delayed: false,
      };
    });
  }

  async getHistory(
    instrument: string,
    timeframe: ChartTimeframe,
  ): Promise<readonly MarketCandle[]> {
    const inst = this.instruments.find(
      (i) => i.symbol.toUpperCase() === instrument.toUpperCase(),
    );
    if (!inst) return [];

    const candles: MarketCandle[] = [];
    const now = Date.now();
    const intervalMs = this.timeframeToMs(timeframe);
    let price = this.randomMid(instrument);
    const precision = inst.pricePrecision ?? 5;

    // Generate 300 candles so the chart has enough data
    for (let i = 299; i >= 0; i--) {
      const time = new Date(now - i * intervalMs).toISOString();
      const open = price;
      const change = (Math.random() - 0.48) * this.volatility(instrument);
      const close = open + change;
      const high =
        Math.max(open, close) + Math.random() * Math.abs(change) * 0.6;
      const low =
        Math.min(open, close) - Math.random() * Math.abs(change) * 0.6;
      const volume = Math.floor(Math.random() * 800) + 50;

      candles.push({
        time,
        open: +open.toFixed(precision),
        high: +high.toFixed(precision),
        low: +low.toFixed(precision),
        close: +close.toFixed(precision),
        volume,
      });

      price = close;
    }

    return candles;
  }

  private randomMid(symbol: string): number {
    const map: Record<string, number> = {
      EURUSD: 1.085,
      GBPUSD: 1.265,
      USDJPY: 149.5,
      XAUUSD: 2650,
      BTCUSD: 67500,
    };
    const base = map[symbol.toUpperCase()] ?? 1.1;
    return base + (Math.random() - 0.5) * base * 0.002;
  }

  private volatility(symbol: string): number {
    if (symbol.includes("JPY")) return 0.15;
    if (symbol.startsWith("XAU")) return 8;
    if (symbol.startsWith("BTC")) return 400;
    return 0.0015;
  }

  private timeframeToMs(tf: ChartTimeframe): number {
    const map: Record<ChartTimeframe, number> = {
      M1: 60_000,
      M5: 5 * 60_000,
      M15: 15 * 60_000,
      M30: 30 * 60_000,
      H1: 60 * 60_000,
      H4: 4 * 60 * 60_000,
      D1: 24 * 60 * 60_000,
      W1: 7 * 24 * 60 * 60_000,
    };
    return map[tf] ?? 60_000;
  }
}
