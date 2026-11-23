import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  ChartTimeframe,
  MarketCandle,
  MarketInstrument,
  MarketQuote,
  SignalDirection,
  SignalProviderStatus,
  TradingSignal,
} from "@veytrix/shared";
import type { SignalProvider, SignalQuery } from "./signal-provider";
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
  kind: "ob" | "fvg" | "sr" | "breaker" | "fib" | "liquidity" | "supply" | "demand" | "trendline" | "channel" | "liquidity-sweep" ;
  direction: "bullish" | "bearish";
}

interface SetupResult {
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskReward: number;
  timeframe: ChartTimeframe;
  tags: string[];
}

@Injectable()
export class TechnicalSignalProvider implements SignalProvider {
  private readonly logger = new Logger(TechnicalSignalProvider.name);
  private readonly signalCache = new Map<string, CachedSignal>();
  private readonly signalCacheMs = 10 * 60_000;

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly marketData: MarketDataProvider,
  ) {}

  getStatus(): SignalProviderStatus {
    const open = isForexMarketOpen();
    return {
      state: "connected",
      provider: "Veytrix Technical Engine",
      message: open
        ? "Market open · multi-TF PA · setup on confluence"
        : "Market closed · last bias held",
      updatedAt: new Date().toISOString(),
    };
  }

  async getSignals(query?: SignalQuery): Promise<readonly TradingSignal[]> {
    try {
      const quotes = (await this.marketData.getQuotes()) as MarketQuote[];
      const instruments = this.marketData.getInstruments
        ? ((await this.marketData.getInstruments()) as MarketInstrument[])
        : [];

      if (!quotes.length && !query?.instrument) {
        this.logger.warn("No quotes available for signal scan.");
        return [];
      }

      const marketOpen = isForexMarketOpen();
      const instrumentFilter = query?.instrument?.toUpperCase();
      const favorites = (query?.favorites ?? [])
        .map((s) => s.toUpperCase())
        .filter(Boolean);

      let symbols: string[] = [];
      if (instrumentFilter) {
        symbols = [instrumentFilter];
      } else if (favorites.length > 0) {
        symbols = favorites.slice(0, 8);
      } else {
        return [];
      }

      const signals: TradingSignal[] = [];
      const deep = Boolean(instrumentFilter);

      for (const symbol of symbols) {
        const cached = this.signalCache.get(symbol);
        if (cached && Date.now() - cached.at < this.signalCacheMs) {
          signals.push(cached.signal);
          continue;
        }

        const quote =
          quotes.find((q) => q.instrument.toUpperCase() === symbol) ??
          ({
            instrument: symbol,
            asOf: new Date().toISOString(),
            last: undefined,
            delayed: true,
          } as MarketQuote);

        const instrument =
          instruments.find((i) => i.symbol.toUpperCase() === symbol) ??
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
        );

        if (analysis) {
          this.signalCache.set(symbol, { at: Date.now(), signal: analysis });
          signals.push(analysis);
        }

        if (!instrumentFilter) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }

      return signals.sort((a, b) => {
        if (a.type === "setup" && b.type !== "setup") return -1;
        if (b.type === "setup" && a.type !== "setup") return 1;
        return b.confidence - a.confidence;
      });
    } catch (err) {
      this.logger.error("Signal scan failed", err);
      return [];
    }
  }

  private async analysePair(
    quote: MarketQuote,
    instrument: MarketInstrument,
    marketOpen: boolean,
    deep: boolean,
  ): Promise<TradingSignal | null> {
    const mid =
      quote.last ??
      (quote.bid !== undefined && quote.ask !== undefined
        ? (quote.bid + quote.ask) / 2
        : undefined);

    const precision = instrument.pricePrecision ?? 5;
    const now = new Date().toISOString();
    const sessionNote = marketOpen ? "Market open." : "Market closed.";

    const d1 = await this.safeHistory(quote.instrument, "D1");
    const h4 = await this.safeHistory(quote.instrument, "H4");
    const h1 = await this.safeHistory(quote.instrument, "H1");
    const m15 = await this.safeHistory(quote.instrument, "M15");
    const m30 = await this.safeHistory(quote.instrument, "M30");
    const m5 = deep ? await this.safeHistory(quote.instrument, "M5") : [];

    let changePercent: number | null = null;
    let refLabel = "vs prior close";

    if (d1.length >= 1 && mid !== undefined && mid > 0) {
      const lastBar = d1[d1.length - 1];
      const lastBarDay = String(lastBar.time).slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const prevClose =
        lastBarDay === today && d1.length >= 2
          ? d1[d1.length - 2].close
          : lastBar.close;
      if (prevClose > 0) {
        changePercent = ((mid - prevClose) / prevClose) * 100;
      }
    }

    if (
      changePercent === null &&
      typeof quote.changePercent === "number" &&
      Number.isFinite(quote.changePercent)
    ) {
      changePercent = quote.changePercent;
      refLabel = "quote change%";
    }

    if ((mid === undefined || mid <= 0) && changePercent === null) {
      return null;
    }

    let direction: SignalDirection = "neutral";
    let confidence = 40;
    const reasons: string[] = [];

    if (changePercent !== null) {
      if (changePercent >= 0.12) {
        direction = "bullish";
        confidence = Math.min(88, 50 + Math.abs(changePercent) * 12);
        reasons.push(
          `D1 session bias bullish (+${changePercent.toFixed(2)}% ${refLabel})`,
        );
      } else if (changePercent <= -0.12) {
        direction = "bearish";
        confidence = Math.min(88, 50 + Math.abs(changePercent) * 12);
        reasons.push(
          `D1 session bias bearish (${changePercent.toFixed(2)}% ${refLabel})`,
        );
      } else {
        reasons.push(
          `D1 session flat (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}% ${refLabel})`,
        );
      }
    }

    const h4Struct = this.structureBias(h4);
    const h1Struct = this.structureBias(h1);
    const bosH1 = this.detectBosChoch(h1);

    if (h4Struct && h4Struct !== "neutral") {
      if (direction === "neutral") {
        direction = h4Struct;
        confidence = Math.min(72, confidence + 14);
        reasons.push(`H4 structure ${h4Struct}`);
      } else if (h4Struct === direction) {
        confidence = Math.min(94, confidence + 10);
        reasons.push(`H4 structure agrees (${h4Struct})`);
      } else {
        confidence = Math.max(32, confidence - 12);
        reasons.push(`H4 structure opposes (${h4Struct})`);
      }
    }

    if (h1Struct && h1Struct !== "neutral") {
      if (h1Struct === direction) {
        confidence = Math.min(95, confidence + 6);
        reasons.push(`H1 structure agrees`);
      } else if (direction !== "neutral") {
        confidence = Math.max(30, confidence - 8);
        reasons.push(`H1 leans ${h1Struct}`);
      }
    }

    if (bosH1) {
      if (bosH1.kind === "bos" && bosH1.direction === direction) {
        confidence = Math.min(96, confidence + 8);
        reasons.push(`H1 BOS ${bosH1.direction}`);
      } else if (bosH1.kind === "choch") {
        reasons.push(`H1 CHoCH → ${bosH1.direction}`);
        if (direction === "neutral") {
          direction = bosH1.direction;
          confidence = Math.min(70, confidence + 10);
        } else if (bosH1.direction === direction) {
          confidence = Math.min(94, confidence + 6);
        } else {
          confidence = Math.max(28, confidence - 10);
        }
      }
    }

    const price = mid ?? quote.last ?? 0;
    if (price <= 0 || direction === "neutral") {
      const arrow =
        direction === "bullish" ? "↑" : direction === "bearish" ? "↓" : "→";
      return {
        id: `${quote.instrument}-bias-${Date.now()}`,
        instrument: quote.instrument,
        type: "bias",
        direction,
        confidence: Math.round(confidence),
        timeframe: "D1",
        title: `${arrow} ${this.capitalize(direction)} · ${quote.instrument}`,
        summary: `${reasons.join(". ") || "No clear directional edge"}. ${sessionNote}`,
        createdAt: now,
        ...({ marketOpen } as object),
      } as TradingSignal;
    }

    const entryFrames = (
      [
        { tf: "M5" as ChartTimeframe, candles: m5 },
        { tf: "M15" as ChartTimeframe, candles: m15 },
        { tf: "M30" as ChartTimeframe, candles: m30 },
        { tf: "H1" as ChartTimeframe, candles: h1 },
      ] as const
    ).filter((x) => x.candles.length >= 20) as {
      tf: ChartTimeframe;
      candles: MarketCandle[];
    }[];

    let bestSetup: SetupResult | null = null;
    let bestScore = 0;

    for (const frame of entryFrames) {
      const setup = this.buildConfluenceSetup(
        frame.candles,
        direction,
        price,
        precision,
        frame.tf,
      );
      if (!setup) continue;
      const score =
        setup.tags.length * 10 +
        setup.riskReward * 5 +
        (frame.tf === "M5"
          ? 3
          : frame.tf === "M15"
            ? 2
            : frame.tf === "M30"
              ? 1
              : 0);
      if (score > bestScore) {
        bestScore = score;
        bestSetup = setup;
      }
    }

    if (
      bestSetup &&
      bestSetup.tags.length >= 2 &&
      bestSetup.riskReward >= 1.8 &&
      confidence >= 52
    ) {
      confidence = Math.min(
        96,
        confidence + bestSetup.tags.length * 3 + (bestSetup.riskReward - 2) * 5,
      );
      reasons.push(
        `Entry ${bestSetup.timeframe}: ${bestSetup.tags.join(" + ")}`,
      );
      reasons.push(`R:R 1:${bestSetup.riskReward}`);

      return {
        id: `${quote.instrument}-setup-${Date.now()}`,
        instrument: quote.instrument,
        type: "setup",
        direction,
        confidence: Math.round(confidence),
        timeframe: bestSetup.timeframe,
        title: `${direction === "bullish" ? "Buy" : "Sell"} Setup – ${quote.instrument}`,
        summary: `${reasons.join(". ")}. ${sessionNote}`,
        entry: bestSetup.entry,
        stopLoss: bestSetup.stopLoss,
        takeProfit1: bestSetup.takeProfit1,
        takeProfit2: bestSetup.takeProfit2,
        takeProfit3: bestSetup.takeProfit3,
        riskReward: bestSetup.riskReward,
        createdAt: now,
        ...({ marketOpen } as object),
      } as TradingSignal;
    }

    const arrow =
      direction === "bullish" ? "↑" : direction === "bearish" ? "↓" : "→";
    return {
      id: `${quote.instrument}-bias-${Date.now()}`,
      instrument: quote.instrument,
      type: "bias",
      direction,
      confidence: Math.round(confidence),
      timeframe: "D1",
      title: `${arrow} ${this.capitalize(direction)} · ${quote.instrument}`,
      summary: `${reasons.join(". ") || "Bias only — no entry confluence"}. ${sessionNote}`,
      createdAt: now,
      ...({ marketOpen } as object),
    } as TradingSignal;
  }

  // ─── Structure ───────────────────────────────────────────────────

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

    if (wasBull && last.close < lastLow) {
      return { kind: "choch", direction: "bearish" };
    }
    if (wasBear && last.close > lastHigh) {
      return { kind: "choch", direction: "bullish" };
    }
    if (wasBull && last.close > lastHigh) {
      return { kind: "bos", direction: "bullish" };
    }
    if (wasBear && last.close < lastLow) {
      return { kind: "bos", direction: "bearish" };
    }
    return null;
  }

  private findSwings(candles: MarketCandle[], leftRight = 2): SwingPoint[] {
    const out: SwingPoint[] = [];
    for (let i = leftRight; i < candles.length - leftRight; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= leftRight; j++) {
        if (
          candles[i].high < candles[i - j].high ||
          candles[i].high < candles[i + j].high
        ) {
          isHigh = false;
        }
        if (
          candles[i].low > candles[i - j].low ||
          candles[i].low > candles[i + j].low
        ) {
          isLow = false;
        }
      }
      if (isHigh) out.push({ index: i, price: candles[i].high, kind: "high" });
      if (isLow) out.push({ index: i, price: candles[i].low, kind: "low" });
    }
    return out;
  }

  // ─── Zones ───────────────────────────────────────────────────────

  private findFvgZones(candles: MarketCandle[]): Zone[] {
    const zones: Zone[] = [];
    for (let i = 2; i < candles.length; i++) {
      const c0 = candles[i - 2];
      const c2 = candles[i];
      if (c0.high < c2.low) {
        zones.push({
          top: c2.low,
          bottom: c0.high,
          mid: (c2.low + c0.high) / 2,
          kind: "fvg",
          direction: "bullish",
        });
      }
      if (c0.low > c2.high) {
        zones.push({
          top: c0.low,
          bottom: c2.high,
          mid: (c0.low + c2.high) / 2,
          kind: "fvg",
          direction: "bearish",
        });
      }
    }
    return zones.slice(-6);
  }

  private findOrderBlocks(
    candles: MarketCandle[],
    bias: SignalDirection,
  ): Zone[] {
    if (bias === "neutral" || candles.length < 10) return [];
    const zones: Zone[] = [];
    const recent = candles.slice(-40);

    for (let i = 2; i < recent.length - 3; i++) {
      const c = recent[i];
      const next = recent[i + 1];
      const next2 = recent[i + 2];

      const bullImpulse =
        bias === "bullish" &&
        c.close < c.open &&
        next.close > c.high &&
        next2.close > next.close;

      const bearImpulse =
        bias === "bearish" &&
        c.close > c.open &&
        next.close < c.low &&
        next2.close < next.close;

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
      const cluster = swings.filter(
        (x) => Math.abs(x.price - s.price) <= tol && x.kind === s.kind,
      );
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

  private detectLiquiditySweep(
    candles: MarketCandle[],
    bias: SignalDirection,
  ): boolean {
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

  private detectBreakRetest(
    candles: MarketCandle[],
    bias: SignalDirection,
  ): boolean {
    if (candles.length < 12 || bias === "neutral") return false;
    const swings = this.findSwings(candles, 2);
    const last = candles[candles.length - 1];

    if (bias === "bullish") {
      const highs = swings.filter((s) => s.kind === "high");
      if (highs.length < 2) return false;
      const broken = highs[highs.length - 2].price;
      const broke = candles.some(
        (c, i) => i > highs[highs.length - 2].index && c.close > broken,
      );
      return broke && last.low <= broken * 1.001 && last.close >= broken;
    }

    const lows = swings.filter((s) => s.kind === "low");
    if (lows.length < 2) return false;
    const broken = lows[lows.length - 2].price;
    const broke = candles.some(
      (c, i) => i > lows[lows.length - 2].index && c.close < broken,
    );
    return broke && last.high >= broken * 0.999 && last.close <= broken;
  }

  private fibLevels(
    candles: MarketCandle[],
    bias: SignalDirection,
  ): { entry: number; stop: number; ext: number } | null {
    if (candles.length < 15 || bias === "neutral") return null;
    const slice = candles.slice(-50);
    let swingHigh = -Infinity;
    let swingLow = Infinity;
    for (const c of slice) {
      swingHigh = Math.max(swingHigh, c.high);
      swingLow = Math.min(swingLow, c.low);
    }
    const range = swingHigh - swingLow;
    if (range <= 0 || range < this.avgRange(slice) * 2) return null;

    if (bias === "bullish") {
      return {
        entry: swingHigh - range * 0.618,
        stop: swingLow - range * 0.05,
        ext: swingHigh + range * 1.0,
      };
    }
    return {
      entry: swingLow + range * 0.618,
      stop: swingHigh + range * 0.05,
      ext: swingLow - range * 1.0,
    };
  }

  private minRiskDistance(candles: MarketCandle[], mid: number): number {
    const atr = this.avgRange(candles.slice(-14));
    const floor = mid * 0.0008;
    return Math.max(atr * 0.55, floor, atr * 0.35);
  }

  private nextStructureTarget(
    candles: MarketCandle[],
    bias: SignalDirection,
    entry: number,
  ): number | null {
    const swings = this.findSwings(candles, 2);
    if (bias === "bullish") {
      const highs = swings
        .filter((s) => s.kind === "high" && s.price > entry)
        .map((s) => s.price);
      if (highs.length) return Math.min(...highs);
      const slice = candles.slice(-30);
      return Math.max(...slice.map((c) => c.high));
    }
    const lows = swings
      .filter((s) => s.kind === "low" && s.price < entry)
      .map((s) => s.price);
    if (lows.length) return Math.max(...lows);
    const slice = candles.slice(-30);
    return Math.min(...slice.map((c) => c.low));
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
        stopLoss = +(zone.bottom - Math.max(atr * 0.4, minRisk * 0.35)).toFixed(
          precision,
        );
      } else {
        entry = +((zone.top + zone.mid) / 2).toFixed(precision);
        stopLoss = +(zone.top + Math.max(atr * 0.4, minRisk * 0.35)).toFixed(
          precision,
        );
      }
    } else if (fib) {
      entry = +fib.entry.toFixed(precision);
      stopLoss = +fib.stop.toFixed(precision);
    } else {
      return null;
    }

    let risk = Math.abs(entry - stopLoss);
    if (risk < minRisk) {
      if (bias === "bullish") {
        stopLoss = +(entry - minRisk).toFixed(precision);
      } else {
        stopLoss = +(entry + minRisk).toFixed(precision);
      }
      risk = Math.abs(entry - stopLoss);
    }

    if (risk > mid * 0.025) return null;

    let takeProfit: number;
    let rr: number;

    const structureTp = this.nextStructureTarget(candles, bias, entry);
    if (structureTp !== null) {
      const dist = Math.abs(structureTp - entry);
      rr = dist / risk;
      if (rr >= 1.8) {
        takeProfit = +structureTp.toFixed(precision);
        rr = Math.round(rr * 10) / 10;
      } else {
        rr = 2.2;
        takeProfit =
          bias === "bullish"
            ? +(entry + risk * rr).toFixed(precision)
            : +(entry - risk * rr).toFixed(precision);
      }
    } else if (fib) {
      const dist = Math.abs(fib.ext - entry);
      rr = Math.max(2, Math.min(4.5, dist / risk));
      rr = Math.round(rr * 10) / 10;
      takeProfit =
        bias === "bullish"
          ? +(entry + risk * rr).toFixed(precision)
          : +(entry - risk * rr).toFixed(precision);
    } else {
      rr = tags.includes("LiqSweep") || tags.includes("BOS") ? 2.8 : 2.2;
      takeProfit =
        bias === "bullish"
          ? +(entry + risk * rr).toFixed(precision)
          : +(entry - risk * rr).toFixed(precision);
    }

    if (bias === "bullish" && (stopLoss >= entry || takeProfit <= entry)) {
      return null;
    }
    if (bias === "bearish" && (stopLoss <= entry || takeProfit >= entry)) {
      return null;
    }

    if (Math.abs(mid - entry) > risk * 1.15) {
      if (
        zone &&
        mid <= zone.top + atr * 0.1 &&
        mid >= zone.bottom - atr * 0.1
      ) {
        entry = +mid.toFixed(precision);
        risk = Math.abs(entry - stopLoss);
        if (risk < minRisk) return null;
        takeProfit =
          bias === "bullish"
            ? +(entry + risk * rr).toFixed(precision)
            : +(entry - risk * rr).toFixed(precision);
      } else {
        return null;
      }
    }

    const finalRr =
      Math.round(
        (Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss)) * 10,
      ) / 10;
    if (finalRr < 1.8) return null;

    return {
      entry,
      stopLoss,
      takeProfit1: takeProfit,
      takeProfit2: takeProfit,
      takeProfit3: takeProfit,
      riskReward: finalRr,
      timeframe,
      tags,
    };
  }

  private avgRange(candles: MarketCandle[]): number {
    if (!candles.length) return 0;
    const sum = candles.reduce((a, c) => a + (c.high - c.low), 0);
    return sum / candles.length;
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
