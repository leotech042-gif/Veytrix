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
  deriv: string;
  display: string;
  name: string;
  category: "forex" | "metals";
  precision: number;
};

const DEFAULT_APP_ID = "1089";

@Injectable()
export class DerivMarketDataProvider implements MarketDataProvider {
  private readonly logger = new Logger(DerivMarketDataProvider.name);
  private readonly appId =
    process.env.DERIV_APP_ID?.trim() || DEFAULT_APP_ID;
  private readonly wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`;

  private readonly quoteCacheDurationMs = 15_000;
  private cachedQuotes: MarketQuote[] = [];
  private quotesFetchedAt = 0;

  private readonly historyCache = new Map<
    string,
    { at: number; candles: MarketCandle[] }
  >();
  private readonly historyCacheMs = 10 * 60_000;

  private readonly symbols: SymbolDef[] = [
    { deriv: "frxEURUSD", display: "EURUSD", name: "Euro / US Dollar", category: "forex", precision: 5 },
    { deriv: "frxGBPUSD", display: "GBPUSD", name: "British Pound / US Dollar", category: "forex", precision: 5 },
    { deriv: "frxUSDJPY", display: "USDJPY", name: "US Dollar / Japanese Yen", category: "forex", precision: 3 },
    { deriv: "frxUSDCHF", display: "USDCHF", name: "US Dollar / Swiss Franc", category: "forex", precision: 5 },
    { deriv: "frxAUDUSD", display: "AUDUSD", name: "Australian Dollar / US Dollar", category: "forex", precision: 5 },
    { deriv: "frxUSDCAD", display: "USDCAD", name: "US Dollar / Canadian Dollar", category: "forex", precision: 5 },
    { deriv: "frxNZDUSD", display: "NZDUSD", name: "New Zealand Dollar / US Dollar", category: "forex", precision: 5 },
    { deriv: "frxEURGBP", display: "EURGBP", name: "Euro / British Pound", category: "forex", precision: 5 },
    { deriv: "frxEURJPY", display: "EURJPY", name: "Euro / Japanese Yen", category: "forex", precision: 3 },
    { deriv: "frxGBPJPY", display: "GBPJPY", name: "British Pound / Japanese Yen", category: "forex", precision: 3 },
    { deriv: "frxAUDJPY", display: "AUDJPY", name: "Australian Dollar / Japanese Yen", category: "forex", precision: 3 },
    { deriv: "frxEURAUD", display: "EURAUD", name: "Euro / Australian Dollar", category: "forex", precision: 5 },
    { deriv: "frxGBPAUD", display: "GBPAUD", name: "British Pound / Australian Dollar", category: "forex", precision: 5 },
    { deriv: "frxXAUUSD", display: "XAUUSD", name: "Gold / US Dollar", category: "metals", precision: 2 },
    { deriv: "frxXAGUSD", display: "XAGUSD", name: "Silver / US Dollar", category: "metals", precision: 3 },
  ];

  getStatus(): MarketDataStatus {
    return {
      state: "connected",
      provider: "Deriv",
      message: "Live market data from Deriv",
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
    if (
      this.cachedQuotes.length > 0 &&
      Date.now() - this.quotesFetchedAt < this.quoteCacheDurationMs
    ) {
      return this.cachedQuotes;
    }

    try {
      const quotes = await this.fetchQuotesBatch();
      if (quotes.length > 0) {
        this.cachedQuotes = quotes;
        this.quotesFetchedAt = Date.now();
      }
      return quotes.length > 0 ? quotes : this.cachedQuotes;
    } catch (err) {
      this.logger.warn(
        `Deriv quotes failed: ${err instanceof Error ? err.message : err}`,
      );
      if (this.cachedQuotes.length > 0) {
        return this.cachedQuotes.map((q) => ({ ...q, delayed: true }));
      }
      throw new ServiceUnavailableException(
        "Deriv market data is temporarily unavailable.",
      );
    }
  }

  async getHistory(
    instrument: string,
    timeframe: ChartTimeframe,
  ): Promise<readonly MarketCandle[]> {
    const def = this.symbols.find(
      (s) => s.display === instrument.toUpperCase(),
    );
    if (!def) return [];

    const key = `${def.display}:${timeframe}`;
    const cached = this.historyCache.get(key);
    if (cached && Date.now() - cached.at < this.historyCacheMs) {
      return cached.candles;
    }

    const granularity = this.toGranularity(timeframe);
    const count = timeframe === "D1" || timeframe === "W1" ? 200 : 300;

    try {
      const candles = await this.requestCandles(def.deriv, granularity, count);
      this.historyCache.set(key, { at: Date.now(), candles });
      return candles;
    } catch (err) {
      this.logger.warn(
        `Deriv history ${instrument} failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return cached?.candles ?? [];
    }
  }

  private toGranularity(tf: ChartTimeframe): number {
    switch (tf) {
      case "M1": return 60;
      case "M3": return 180;
      case "M5": return 300;
      case "M15": return 900;
      case "M30": return 1800;
      case "H1": return 3600;
      case "H4": return 14400;
      case "D1": return 86400;
      case "W1": return 604800;
      default: return 3600;
    }
  }

  private fetchQuotesBatch(): Promise<MarketQuote[]> {
    return new Promise((resolve, reject) => {
      const WebSocketCtor = this.getWebSocket();
      if (!WebSocketCtor) {
        reject(new Error("WebSocket not available"));
        return;
      }

      const ws = new WebSocketCtor(this.wsUrl);
      const results = new Map<string, MarketQuote>();
      let pending = this.symbols.length;
      let settled = false;
      const timer = setTimeout(() => {
        cleanup();
        if (results.size > 0) resolve([...results.values()]);
        else reject(new Error("Deriv quote timeout"));
      }, 12_000);

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
      };

      ws.onopen = () => {
        for (const s of this.symbols) {
          ws.send(
            JSON.stringify({
              ticks_history: s.deriv,
              end: "latest",
              count: 1,
              style: "ticks",
            }),
          );
        }
      };

      ws.onmessage = (event: { data: unknown }) => {
        try {
          const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (msg.error) {
            pending -= 1;
            if (pending <= 0) {
              cleanup();
              resolve([...results.values()]);
            }
            return;
          }
          if (msg.msg_type === "history" || msg.msg_type === "tick") {
            const history = msg.history as
              | { prices?: number[]; times?: number[] }
              | undefined;
            const tick = msg.tick as
              | { bid?: number; ask?: number; quote?: number; symbol?: string }
              | undefined;
            const echo = msg.echo_req as { ticks_history?: string } | undefined;
            const derivSym =
              tick?.symbol ??
              echo?.ticks_history ??
              (typeof msg.ticks_history === "string"
                ? msg.ticks_history
                : undefined);
            const def = this.symbols.find((s) => s.deriv === derivSym);
            if (def) {
              let last: number | undefined;
              if (history?.prices?.length) {
                last = history.prices[history.prices.length - 1];
              } else if (tick?.quote != null) {
                last = Number(tick.quote);
              } else if (tick?.bid != null && tick?.ask != null) {
                last = (Number(tick.bid) + Number(tick.ask)) / 2;
              }
              if (last != null && Number.isFinite(last)) {
                const bid = tick?.bid != null ? Number(tick.bid) : last;
                const ask = tick?.ask != null ? Number(tick.ask) : last;
                results.set(def.display, {
                  instrument: def.display,
                  asOf: new Date().toISOString(),
                  last,
                  bid,
                  ask,
                  spread:
                    ask != null && bid != null
                      ? Number((ask - bid).toFixed(def.precision + 1))
                      : undefined,
                  delayed: false,
                });
              }
            }
            pending -= 1;
            if (pending <= 0) {
              cleanup();
              resolve([...results.values()]);
            }
          }
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => {
        cleanup();
        if (results.size > 0) resolve([...results.values()]);
        else reject(new Error("Deriv WebSocket error"));
      };
    });
  }

  private requestCandles(
    derivSymbol: string,
    granularity: number,
    count: number,
  ): Promise<MarketCandle[]> {
    return new Promise((resolve, reject) => {
      const WebSocketCtor = this.getWebSocket();
      if (!WebSocketCtor) {
        reject(new Error("WebSocket not available"));
        return;
      }

      const ws = new WebSocketCtor(this.wsUrl);
      let settled = false;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Deriv history timeout"));
      }, 15_000);

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            ticks_history: derivSymbol,
            end: "latest",
            count,
            granularity,
            style: "candles",
            adjust_start_time: 1,
          }),
        );
      };

      ws.onmessage = (event: { data: unknown }) => {
        try {
          const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (msg.error) {
            cleanup();
            reject(
              new Error(
                String((msg.error as { message?: string }).message ?? "Deriv error"),
              ),
            );
            return;
          }
          if (msg.msg_type === "candles" || msg.candles) {
            const raw = (msg.candles as Array<Record<string, unknown>>) ?? [];
            const candles: MarketCandle[] = raw
              .map((c) => {
                const epoch = Number(c.epoch);
                return {
                  time: new Date(epoch * 1000).toISOString(),
                  open: Number(c.open),
                  high: Number(c.high),
                  low: Number(c.low),
                  close: Number(c.close),
                };
              })
              .filter(
                (c) =>
                  Number.isFinite(c.open) &&
                  Number.isFinite(c.high) &&
                  Number.isFinite(c.low) &&
                  Number.isFinite(c.close),
              );
            cleanup();
            resolve(candles);
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      ws.onerror = () => {
        cleanup();
        reject(new Error("Deriv history WebSocket error"));
      };
    });
  }

  private getWebSocket(): (typeof WebSocket) | null {
    if (typeof WebSocket !== "undefined") return WebSocket;
    const g = globalThis as { WebSocket?: typeof WebSocket };
    return g.WebSocket ?? null;
  }
}
