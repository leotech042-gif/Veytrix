import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  ChartTimeframe,
  EconomicEvent,
  MarketCandle,
  MarketInstrument,
  MarketQuote,
  SignalProviderStatus,
  TradingSignal,
} from "@veytrix/shared";
import type { SignalProvider, SignalQuery } from "./signal-provider";
import { FundamentalsService } from "../fundamentals/fundamentals.service";
import { analysePriceAction } from "./price-action-engine";
import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
} from "../market-data/market-data-provider";

/** Forex open roughly Sun 22:00 UTC → Fri 22:00 UTC */
function isForexMarketOpen(now = new Date()): boolean {
  const day = now.getUTCDay();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 6) return false;
  if (day === 5 && minutes >= 22 * 60) return false;
  if (day === 0 && minutes < 22 * 60) return false;
  return true;
}

type CachedSignal = { at: number; signal: TradingSignal };

@Injectable()
export class TechnicalSignalProvider implements SignalProvider {
  private readonly logger = new Logger(TechnicalSignalProvider.name);
  private readonly signalCache = new Map<string, CachedSignal>();
  private readonly signalCacheMs = 60_000;

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly marketData: MarketDataProvider,
    @Inject(FundamentalsService)
    private readonly fundamentals: FundamentalsService,
  ) {}

  async getStatus(): Promise<SignalProviderStatus> {
    const status = await this.marketData.getStatus();
    if (status.state === "unconfigured") {
      return {
        state: "unconfigured",
        provider: null,
        message: "Signal analysis is unavailable until a live market-data provider is configured.",
      };
    }
    if (status.state === "disconnected") {
      return {
        state: "disconnected",
        provider: "Veytrix Technical Engine",
        message: status.message,
      };
    }

    return {
      state: "connected",
      provider: "Veytrix Technical Engine",
      message: isForexMarketOpen()
        ? "Market data connected · multi-timeframe analysis"
        : "Market data connected · market session closed",
      updatedAt: new Date().toISOString(),
      delayed: status.delayed,
    };
  }

  async getSignals(query?: SignalQuery): Promise<readonly TradingSignal[]> {
    try {
      const marketStatus = await this.marketData.getStatus();
      if (marketStatus.state !== "connected") return [];

      const quotes = (await this.marketData.getQuotes()) as MarketQuote[];
      if (!quotes.length) return [];

      const instruments = this.marketData.getInstruments
        ? ((await this.marketData.getInstruments()) as MarketInstrument[])
        : [];

      const instrumentFilter = query?.instrument?.toUpperCase();
      const favorites = (query?.favorites ?? [])
        .map((symbol) => symbol.toUpperCase())
        .filter(Boolean);

      const symbols = instrumentFilter
        ? [instrumentFilter]
        : favorites.slice(0, 8);
      if (symbols.length === 0) return [];

      const now = Date.now();
      const events = await this.safeCalendar(
        new Date(now - 72 * 60 * 60_000).toISOString(),
        new Date(now + 24 * 60 * 60_000).toISOString(),
      );
      const marketOpen = isForexMarketOpen();
      const signals: TradingSignal[] = [];
      const deep = Boolean(instrumentFilter);

      for (const symbol of symbols) {
        const quote = quotes.find(
          (item) => item.instrument.toUpperCase() === symbol,
        );
        if (!quote || (quote.last === undefined && quote.bid === undefined)) {
          continue;
        }

        const cached = this.signalCache.get(symbol);
        const cacheStillValid =
          cached &&
          now - cached.at < this.signalCacheMs &&
          cached.signal.marketOpen === marketOpen &&
          !marketStatus.delayed &&
          !quote.delayed;
        if (cacheStillValid) {
          signals.push(cached.signal);
          continue;
        }

        const instrument =
          instruments.find((item) => item.symbol.toUpperCase() === symbol) ??
          ({
            symbol,
            displayName: symbol,
            category: "forex" as const,
            pricePrecision: 5,
          } satisfies MarketInstrument);

        const analysis = await this.analysePair(
          quote,
          instrument,
          marketOpen,
          marketOpen && !marketStatus.delayed && !quote.delayed,
          deep,
          events,
        );

        if (analysis) {
          this.signalCache.set(symbol, { at: now, signal: analysis });
          signals.push(analysis);
        }

        if (!instrumentFilter) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }

      return signals.sort((a, b) => {
        if (a.type === "setup" && b.type !== "setup") return -1;
        if (b.type === "setup" && a.type !== "setup") return 1;
        return b.confidence - a.confidence;
      });
    } catch (error) {
      this.logger.error("Signal scan failed", error);
      return [];
    }
  }

  private async analysePair(
    quote: MarketQuote,
    instrument: MarketInstrument,
    marketOpen: boolean,
    allowSetups: boolean,
    deep: boolean,
    events: readonly EconomicEvent[],
  ): Promise<TradingSignal | null> {
    const price =
      quote.last ??
      (quote.bid !== undefined && quote.ask !== undefined
        ? (quote.bid + quote.ask) / 2
        : quote.bid ?? quote.ask);
    if (price === undefined || !Number.isFinite(price) || price <= 0) return null;

    const spread =
      quote.spread ??
      (quote.bid !== undefined && quote.ask !== undefined
        ? Math.max(0, quote.ask - quote.bid)
        : 0);

    const [d1, h4, h1, m15, m5] = await Promise.all([
      this.safeHistory(instrument.symbol, "D1"),
      this.safeHistory(instrument.symbol, "H4"),
      this.safeHistory(instrument.symbol, "H1"),
      this.safeHistory(instrument.symbol, "M15"),
      deep ? this.safeHistory(instrument.symbol, "M5") : Promise.resolve([]),
    ]);

    const analysis = analysePriceAction({
      instrument: instrument.symbol,
      price,
      spread,
      d1,
      h4,
      h1,
      m15,
      m5,
    });
    const fundamentalExplanation = this.buildFundamentalExplanation(
      instrument.symbol,
      events,
    );
    const createdAt = new Date().toISOString();

    if (analysis.setup && allowSetups) {
      const setup = analysis.setup;
      return {
        id: instrument.symbol + "-setup-" + Date.now(),
        instrument: instrument.symbol,
        type: "setup",
        direction: analysis.direction,
        confidence: setup.confidence,
        timeframe: setup.timeframe,
        title:
          (analysis.direction === "bullish" ? "Buy" : "Sell") +
          " Setup – " +
          instrument.symbol,
        summary: setup.explanation,
        technicalExplanation: analysis.technicalExplanation,
        fundamentalExplanation,
        entry: setup.entry,
        stopLoss: setup.stopLoss,
        takeProfit: setup.takeProfit,
        takeProfit1: setup.takeProfit1,
        takeProfit2: setup.takeProfit2,
        takeProfit3: setup.takeProfit,
        riskReward: setup.riskReward,
        riskPips: setup.riskPips,
        rewardPips: setup.rewardPips,
        tags: setup.tags,
        createdAt,
        marketOpen,
      } satisfies TradingSignal;
    }

    const arrow =
      analysis.direction === "bullish"
        ? "↑"
        : analysis.direction === "bearish"
          ? "↓"
          : "→";
    const directionLabel =
      analysis.direction === "bullish"
        ? "Bullish"
        : analysis.direction === "bearish"
          ? "Bearish"
          : "Neutral";

    return {
      id: instrument.symbol + "-bias-" + Date.now(),
      instrument: instrument.symbol,
      type: "bias",
      direction: analysis.direction,
      confidence: analysis.confidence,
      timeframe: "H4",
      title: arrow + " " + directionLabel + " · " + instrument.symbol,
      summary:
        directionLabel +
        (marketOpen
          ? allowSetups
            ? " structure bias · no confirmed M15 entry yet."
            : " structure bias · quote data is delayed; no active setup."
          : " structure bias · market closed; no active setup."),
      technicalExplanation: analysis.technicalExplanation,
      fundamentalExplanation,
      createdAt,
      marketOpen,
    } satisfies TradingSignal;
  }

  private async safeCalendar(
    from: string,
    to: string,
  ): Promise<EconomicEvent[]> {
    try {
      return [...(await this.fundamentals.getCalendar(from, to))];
    } catch (error) {
      this.logger.warn(
        "Fundamental calendar unavailable for signal context",
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  }

  private buildFundamentalExplanation(
    instrument: string,
    events: readonly EconomicEvent[],
  ): string {
    const now = Date.now();
    const pairEvents = events.flatMap((event) => {
      const pair = event.affectedPairs?.find(
        (item) => item.symbol.toUpperCase() === instrument.toUpperCase(),
      );
      if (!pair) return [];

      const timestamp = Date.parse(event.time);
      if (!Number.isFinite(timestamp)) return [];

      return [{ event, pair, timestamp }];
    });

    const recent = pairEvents.filter(
      ({ event, pair, timestamp }) =>
        timestamp <= now &&
        now - timestamp <= 48 * 60 * 60_000 &&
        event.actual !== null &&
        event.estimate !== null &&
        pair.bias !== "pending" &&
        pair.bias !== "neutral",
    );

    let macroRead: string;
    if (recent.length === 0) {
      macroRead =
        "No recent released economic result provides a confirmed directional read for " +
        instrument +
        ".";
    } else {
      const score = recent.reduce((total, item) => {
        const weight =
          item.event.impact === "high"
            ? 3
            : item.event.impact === "medium"
              ? 2
              : 1;
        return total + (item.pair.bias === "bullish" ? weight : -weight);
      }, 0);
      const direction =
        score > 0
          ? "bullish"
          : score < 0
            ? "bearish"
            : "mixed";
      const names = recent
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 2)
        .map(({ event }) => event.currency + " " + event.event)
        .join("; ");
      macroRead =
        "Recent released calendar data is " +
        direction +
        " for " +
        instrument +
        " (" +
        names +
        ").";
    }

    const upcoming = pairEvents
      .filter(
        ({ event, timestamp }) =>
          timestamp > now &&
          timestamp - now <= 6 * 60 * 60_000 &&
          event.impact === "high",
      )
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (upcoming) {
      const minutes = Math.max(
        1,
        Math.round((upcoming.timestamp - now) / 60_000),
      );
      const timing =
        minutes >= 60
          ? Math.round(minutes / 60) + "h"
          : minutes + "m";
      macroRead +=
        " Upcoming high-impact " +
        upcoming.event.currency +
        " " +
        upcoming.event.event +
        " in " +
        timing +
        "; volatility risk may be elevated.";
    }

    return macroRead;
  }

  private async safeHistory(
    instrument: string,
    timeframe: ChartTimeframe,
  ): Promise<MarketCandle[]> {
    if (!this.marketData.getHistory) return [];
    try {
      const candles = await this.marketData.getHistory(instrument, timeframe);
      return Array.isArray(candles) ? [...candles] : [];
    } catch {
      return [];
    }
  }


}