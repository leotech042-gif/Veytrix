import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  ChartTimeframe,
  EconomicEvent,
  MarketCandle,
  MarketInstrument,
  MarketQuote,
  SignalDirection,
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

function pipSize(instrument: string): number {
  const s = instrument.toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (s.startsWith("XAU")) return 0.1;
  if (s.startsWith("XAG")) return 0.01;
  if (s.includes("BTC") || s.includes("ETH")) return 1;
  return 0.0001;
}

function toPips(instrument: string, priceDiff: number): number {
  const pip = pipSize(instrument);
  return Math.round((Math.abs(priceDiff) / pip) * 10) / 10;
}

type CachedSignal = { at: number; signal: TradingSignal };
type StructureBias = SignalDirection;

interface SwingPoint {
  index: number;
  price: number;
  kind: "high" | "low";
}

interface Zone {
  top: number;
  bottom: number;
  mid: number;
  kind: "ob" | "fvg" | "sr" | "breaker" | "fib";
  direction: "bullish" | "bearish";
}

interface SetupResult {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskReward: number;
  riskPips: number;
  rewardPips: number;
  timeframe: ChartTimeframe;
  tags: string[];
}

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
        const cached = this.signalCache.get(symbol);
        if (cached && now - cached.at < this.signalCacheMs) {
          signals.push(cached.signal);
          continue;
        }

        const quote = quotes.find(
          (item) => item.instrument.toUpperCase() === symbol,
        );
        if (!quote || (quote.last === undefined && quote.bid === undefined)) {
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

    if (analysis.setup) {
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
        " structure bias · no confirmed M15 entry yet.",
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

  private structureBias(candles: MarketCandle[]): StructureBias | null {
    if (candles.length < 12) return null;
    const swings = this.findSwings(candles, 2);
    if (swings.length < 4) return this.biasFromCandles(candles);
    const highs = swings.filter((s) => s.kind === "high").slice(-3);
    const lows = swings.filter((s) => s.kind === "low").slice(-3);
    if (highs.length >= 2 && lows.length >= 2) {
      const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
      const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
      const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
      const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;
      if (hh && hl) return "bullish";
      if (lh && ll) return "bearish";
    }
    return this.biasFromCandles(candles);
  }

  private detectBosChoch(
    candles: MarketCandle[],
  ): { kind: "bos" | "choch"; direction: SignalDirection } | null {
    if (candles.length < 16) return null;
    const swings = this.findSwings(candles, 2);
    if (swings.length < 4) return null;
    const last = candles[candles.length - 1];
    const highs = swings.filter((s) => s.kind === "high");
    const lows = swings.filter((s) => s.kind === "low");
    if (highs.length < 2 || lows.length < 2) return null;
    const prevHigh = highs[highs.length - 2].price;
    const lastHigh = highs[highs.length - 1].price;
    const prevLow = lows[lows.length - 2].price;
    const lastLow = lows[lows.length - 1].price;
    const wasBull = lastHigh >= prevHigh && lastLow >= prevLow;
    const wasBear = lastHigh <= prevHigh && lastLow <= prevLow;
    if (wasBull && last.close < lastLow) return { kind: "choch", direction: "bearish" };
    if (wasBear && last.close > lastHigh) return { kind: "choch", direction: "bullish" };
    if (wasBull && last.close > lastHigh) return { kind: "bos", direction: "bullish" };
    if (wasBear && last.close < lastLow) return { kind: "bos", direction: "bearish" };
    return null;
  }

  private findSwings(candles: MarketCandle[], leftRight = 2): SwingPoint[] {
    const out: SwingPoint[] = [];
    for (let i = leftRight; i < candles.length - leftRight; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= leftRight; j++) {
        if (candles[i].high < candles[i - j].high || candles[i].high < candles[i + j].high) isHigh = false;
        if (candles[i].low > candles[i - j].low || candles[i].low > candles[i + j].low) isLow = false;
      }
      if (isHigh) out.push({ index: i, price: candles[i].high, kind: "high" });
      if (isLow) out.push({ index: i, price: candles[i].low, kind: "low" });
    }
    return out;
  }

  private findFvgZones(candles: MarketCandle[]): Zone[] {
    const zones: Zone[] = [];
    for (let i = 2; i < candles.length; i++) {
      const c0 = candles[i - 2];
      const c2 = candles[i];
      if (c0.high < c2.low) {
        zones.push({ top: c2.low, bottom: c0.high, mid: (c2.low + c0.high) / 2, kind: "fvg", direction: "bullish" });
      }
      if (c0.low > c2.high) {
        zones.push({ top: c0.low, bottom: c2.high, mid: (c0.low + c2.high) / 2, kind: "fvg", direction: "bearish" });
      }
    }
    return zones.slice(-6);
  }

  private findOrderBlocks(candles: MarketCandle[], bias: SignalDirection): Zone[] {
    if (bias === "neutral" || candles.length < 10) return [];
    const zones: Zone[] = [];
    const recent = candles.slice(-40);
    for (let i = 2; i < recent.length - 3; i++) {
      const c = recent[i];
      const next = recent[i + 1];
      const next2 = recent[i + 2];
      const bullImpulse = bias === "bullish" && c.close < c.open && next.close > c.high && next2.close > next.close;
      const bearImpulse = bias === "bearish" && c.close > c.open && next.close < c.low && next2.close < next.close;
      if (bullImpulse || bearImpulse) {
        zones.push({
          top: c.high,
          bottom: c.low,
          mid: (c.high + c.low) / 2,
          kind: "ob",
          direction: bias === "bullish" ? "bullish" : "bearish",
        });
      }
    }
    return zones.slice(-4);
  }

  private findSrZones(candles: MarketCandle[]): Zone[] {
    const swings = this.findSwings(candles, 2);
    const zones: Zone[] = [];
    const tol = this.avgRange(candles) * 0.35;
    for (const s of swings.slice(-10)) {
      const cluster = swings.filter((x) => Math.abs(x.price - s.price) <= tol && x.kind === s.kind);
      if (cluster.length >= 2) {
        const prices = cluster.map((c) => c.price);
        const top = Math.max(...prices);
        const bottom = Math.min(...prices);
        zones.push({
          top,
          bottom,
          mid: (top + bottom) / 2,
          kind: "sr",
          direction: s.kind === "low" ? "bullish" : "bearish",
        });
      }
    }
    return zones.slice(-5);
  }

  private detectLiquiditySweep(candles: MarketCandle[], bias: SignalDirection): boolean {
    if (candles.length < 8 || bias === "neutral") return false;
    const swings = this.findSwings(candles, 2);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (bias === "bullish") {
      const lows = swings.filter((s) => s.kind === "low").slice(-3);
      if (!lows.length) return false;
      const lvl = Math.min(...lows.map((l) => l.price));
      return prev.low < lvl && last.close > lvl;
    }
    const highs = swings.filter((s) => s.kind === "high").slice(-3);
    if (!highs.length) return false;
    const lvl = Math.max(...highs.map((h) => h.price));
    return prev.high > lvl && last.close < lvl;
  }

  private detectBreakRetest(candles: MarketCandle[], bias: SignalDirection): boolean {
    if (candles.length < 12 || bias === "neutral") return false;
    const swings = this.findSwings(candles, 2);
    const last = candles[candles.length - 1];
    if (bias === "bullish") {
      const highs = swings.filter((s) => s.kind === "high").slice(-2);
      if (highs.length < 1) return false;
      const lvl = highs[highs.length - 1].price;
      return last.close > lvl && last.low <= lvl * 1.001;
    }
    const lows = swings.filter((s) => s.kind === "low").slice(-2);
    if (lows.length < 1) return false;
    const lvl = lows[lows.length - 1].price;
    return last.close < lvl && last.high >= lvl * 0.999;
  }

  private fibLevels(
    candles: MarketCandle[],
    bias: SignalDirection,
  ): { entry: number; stop: number; ext: number } | null {
    if (candles.length < 20 || bias === "neutral") return null;
    const swing = candles.slice(-30);
    const hi = Math.max(...swing.map((c) => c.high));
    const lo = Math.min(...swing.map((c) => c.low));
    const range = hi - lo;
    if (range <= 0) return null;
    if (bias === "bullish") {
      return {
        entry: lo + range * 0.5,
        stop: lo - range * 0.1,
        ext: lo + range * 1.272,
      };
    }
    return {
      entry: hi - range * 0.5,
      stop: hi + range * 0.1,
      ext: hi - range * 1.272,
    };
  }

  private nextStructureTarget(
    candles: MarketCandle[],
    bias: SignalDirection,
    entry: number,
  ): number | null {
    const swings = this.findSwings(candles, 2);
    if (bias === "bullish") {
      const highs = swings.filter((s) => s.kind === "high" && s.price > entry);
      if (!highs.length) return null;
      return Math.min(...highs.map((h) => h.price));
    }
    const lows = swings.filter((s) => s.kind === "low" && s.price < entry);
    if (!lows.length) return null;
    return Math.max(...lows.map((l) => l.price));
  }

  private minRiskDistance(candles: MarketCandle[], mid: number): number {
    const atr = this.avgRange(candles.slice(-14));
    return Math.max(atr * 0.35, mid * 0.0004);
  }

  private buildConfluenceSetup(
    candles: MarketCandle[],
    bias: SignalDirection,
    mid: number,
    precision: number,
    timeframe: ChartTimeframe,
  ): SetupResult | null {
    if (bias === "neutral" || candles.length < 20 || mid <= 0) return null;

    const tags: string[] = [];
    const atr = this.avgRange(candles.slice(-14));
    if (atr <= 0) return null;

    const fvgs = this.findFvgZones(candles).filter((z) => z.direction === bias);
    const obs = this.findOrderBlocks(candles, bias);
    const srs = this.findSrZones(candles).filter((z) => z.direction === bias);
    const sweep = this.detectLiquiditySweep(candles, bias);
    const br = this.detectBreakRetest(candles, bias);
    const fib = this.fibLevels(candles, bias);
    const bos = this.detectBosChoch(candles);

    if (bos?.direction === bias) tags.push(bos.kind.toUpperCase());
    if (fvgs.length) tags.push("FVG");
    if (obs.length) tags.push("OB");
    if (srs.length) tags.push("S/R");
    if (sweep) tags.push("LiqSweep");
    if (br) tags.push("BreakRetest");
    if (fib) tags.push("Fib");

    if (tags.length < 2) return null;

    const candidates: Zone[] = [...obs, ...fvgs, ...srs];
    let zone: Zone | null = null;
    let bestDist = Infinity;
    for (const z of candidates) {
      const width = Math.abs(z.top - z.bottom);
      if (width < atr * 0.15) continue;
      const dist = Math.abs(z.mid - mid);
      if (dist < bestDist) {
        bestDist = dist;
        zone = z;
      }
    }

    const minRisk = this.minRiskDistance(candles, mid);
    let entry = mid;
    let stopLoss: number;

    if (zone) {
      if (bias === "bullish") {
        entry = +((zone.bottom + zone.mid) / 2).toFixed(precision);
        stopLoss = +(zone.bottom - Math.max(atr * 0.4, minRisk * 0.35)).toFixed(precision);
      } else {
        entry = +((zone.top + zone.mid) / 2).toFixed(precision);
        stopLoss = +(zone.top + Math.max(atr * 0.4, minRisk * 0.35)).toFixed(precision);
      }
    } else if (fib) {
      entry = +fib.entry.toFixed(precision);
      stopLoss = +fib.stop.toFixed(precision);
    } else {
      return null;
    }

    let risk = Math.abs(entry - stopLoss);
    if (risk < minRisk) {
      stopLoss =
        bias === "bullish"
          ? +(entry - minRisk).toFixed(precision)
          : +(entry + minRisk).toFixed(precision);
      risk = Math.abs(entry - stopLoss);
    }

    if (risk > mid * 0.025) return null;

    const r1 = 2;
    const r2 = 3.5;
    const r3 = 5;

    let takeProfit1 =
      bias === "bullish"
        ? +(entry + risk * r1).toFixed(precision)
        : +(entry - risk * r1).toFixed(precision);
    let takeProfit2 =
      bias === "bullish"
        ? +(entry + risk * r2).toFixed(precision)
        : +(entry - risk * r2).toFixed(precision);
    let takeProfit3 =
      bias === "bullish"
        ? +(entry + risk * r3).toFixed(precision)
        : +(entry - risk * r3).toFixed(precision);

    const structureTp = this.nextStructureTarget(candles, bias, entry);
    if (structureTp !== null) {
      const dist = Math.abs(structureTp - entry);
      const structRr = dist / risk;
      if (structRr >= 5) takeProfit3 = +structureTp.toFixed(precision);
      else if (structRr >= 3.5) takeProfit2 = +structureTp.toFixed(precision);
    }

    if (fib) {
      const dist = Math.abs(fib.ext - entry);
      const fibRr = dist / risk;
      if (fibRr >= 5) {
        takeProfit3 =
          bias === "bullish"
            ? +(entry + risk * Math.max(5, Math.min(8, fibRr))).toFixed(precision)
            : +(entry - risk * Math.max(5, Math.min(8, fibRr))).toFixed(precision);
      }
    }

    const finalRr =
      Math.round((Math.abs(takeProfit3 - entry) / Math.abs(entry - stopLoss)) * 10) / 10;
    if (finalRr < 5) return null;

    if (bias === "bullish" && (stopLoss >= entry || takeProfit3 <= entry)) return null;
    if (bias === "bearish" && (stopLoss <= entry || takeProfit3 >= entry)) return null;

    return {
      entry,
      stopLoss,
      takeProfit: takeProfit3,
      takeProfit1,
      takeProfit2,
      takeProfit3,
      riskReward: finalRr,
      riskPips: 0,
      rewardPips: 0,
      timeframe,
      tags,
    };
  }

  private avgRange(candles: MarketCandle[]): number {
    if (!candles.length) return 0;
    return candles.reduce((a, c) => a + (c.high - c.low), 0) / candles.length;
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

  private biasFromCandles(candles: MarketCandle[]): SignalDirection | null {
    if (candles.length < 8) return null;
    const recent = candles.slice(-8);
    const first = recent[0].close;
    const last = recent[recent.length - 1].close;
    if (!first || first <= 0) return null;
    const change = ((last - first) / first) * 100;
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);
    const hh = highs[highs.length - 1] > highs[0];
    const hl = lows[lows.length - 1] > lows[0];
    const lh = highs[highs.length - 1] < highs[0];
    const ll = lows[lows.length - 1] < lows[0];
    if (change > 0.15 && hh && hl) return "bullish";
    if (change < -0.15 && lh && ll) return "bearish";
    if (change > 0.3) return "bullish";
    if (change < -0.3) return "bearish";
    return "neutral";
  }

  private capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
