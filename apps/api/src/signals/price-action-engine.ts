import type {
  ChartTimeframe,
  MarketCandle,
  SignalDirection,
} from "@veytrix/shared";

type Direction = Exclude<SignalDirection, "neutral">;

interface Swing {
  index: number;
  price: number;
  kind: "high" | "low";
}

interface Structure {
  direction: SignalDirection;
  highs: Swing[];
  lows: Swing[];
}

interface Sweep {
  index: number;
  level: number;
  extreme: number;
  source: "EQUAL_LEVELS" | "SWING" | "ASIAN_RANGE";
}

interface EntryZone {
  top: number;
  bottom: number;
  mid: number;
  kind: "FVG" | "ORDER_BLOCK" | "BREAKER_BLOCK" | "RETEST";
  createdIndex: number;
  fill: number;
}

export interface PriceActionSetup {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  riskPips: number;
  rewardPips: number;
  timeframe: ChartTimeframe;
  confidence: number;
  explanation: string;
  tags: string[];
}

export interface PriceActionAnalysis {
  direction: SignalDirection;
  confidence: number;
  technicalExplanation: string;
  setup: PriceActionSetup | null;
}

export interface PriceActionInput {
  instrument: string;
  price: number;
  spread: number;
  d1: MarketCandle[];
  h4: MarketCandle[];
  h1: MarketCandle[];
  m15: MarketCandle[];
  m5?: MarketCandle[];
  now?: number;
}

const TIMEFRAME_MS: Record<ChartTimeframe, number> = {
  M1: 60_000,
  M5: 5 * 60_000,
  M15: 15 * 60_000,
  M30: 30 * 60_000,
  H1: 60 * 60_000,
  H4: 4 * 60 * 60_000,
  D1: 24 * 60 * 60_000,
  W1: 7 * 24 * 60 * 60_000,
};

function completedBars(
  candles: MarketCandle[],
  timeframe: ChartTimeframe,
  now: number,
): MarketCandle[] {
  const duration = TIMEFRAME_MS[timeframe];
  return candles.filter((candle) => {
    const openedAt = Date.parse(candle.time);
    return (
      Number.isFinite(openedAt) &&
      openedAt + duration <= now &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close) &&
      candle.high >= candle.low &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close)
    );
  });
}

function findSwings(candles: MarketCandle[], strength = 2): Swing[] {
  const swings: Swing[] = [];
  for (let index = strength; index < candles.length - strength; index += 1) {
    const current = candles[index];
    let isHigh = true;
    let isLow = true;

    for (let offset = 1; offset <= strength; offset += 1) {
      if (
        current.high <= candles[index - offset].high ||
        current.high < candles[index + offset].high
      ) {
        isHigh = false;
      }
      if (
        current.low >= candles[index - offset].low ||
        current.low > candles[index + offset].low
      ) {
        isLow = false;
      }
    }

    if (isHigh) swings.push({ index, price: current.high, kind: "high" });
    if (isLow) swings.push({ index, price: current.low, kind: "low" });
  }
  return swings.sort((a, b) => a.index - b.index);
}

function analyseStructure(candles: MarketCandle[]): Structure {
  const swings = findSwings(candles);
  const highs = swings.filter((swing) => swing.kind === "high").slice(-3);
  const lows = swings.filter((swing) => swing.kind === "low").slice(-3);
  if (highs.length < 2 || lows.length < 2) {
    return { direction: "neutral", highs, lows };
  }

  const higherHighs =
    highs[highs.length - 1].price > highs[highs.length - 2].price;
  const higherLows =
    lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lowerHighs =
    highs[highs.length - 1].price < highs[highs.length - 2].price;
  const lowerLows =
    lows[lows.length - 1].price < lows[lows.length - 2].price;

  if (higherHighs && higherLows) return { direction: "bullish", highs, lows };
  if (lowerHighs && lowerLows) return { direction: "bearish", highs, lows };
  return { direction: "neutral", highs, lows };
}

function averageRange(candles: MarketCandle[]): number {
  if (candles.length === 0) return 0;
  return (
    candles.reduce((total, candle) => total + candle.high - candle.low, 0) /
    candles.length
  );
}

function averageBody(candles: MarketCandle[]): number {
  if (candles.length === 0) return 0;
  return (
    candles.reduce(
      (total, candle) => total + Math.abs(candle.close - candle.open),
      0,
    ) / candles.length
  );
}

interface AsianRange {
  high: number;
  low: number;
  endIndex: number;
}

function findAsianRanges(candles: MarketCandle[]): AsianRange[] {
  const sessions = new Map<string, AsianRange & { count: number }>();
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const timestamp = Date.parse(candle.time);
    if (!Number.isFinite(timestamp)) continue;
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    // Fixed model window: 00:00–08:00 UTC. It is a liquidity reference, not an entry-time restriction.
    if (hour < 0 || hour >= 8) continue;
    const key = date.toISOString().slice(0, 10);
    const existing = sessions.get(key);
    if (existing) {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.endIndex = index;
      existing.count += 1;
    } else {
      sessions.set(key, {
        high: candle.high,
        low: candle.low,
        endIndex: index,
        count: 1,
      });
    }
  }
  return [...sessions.values()]
    .filter((session) => session.count >= 4)
    .sort((a, b) => a.endIndex - b.endIndex)
    .slice(-8);
}

function isDisplacement(
  candle: MarketCandle,
  history: MarketCandle[],
  direction: Direction,
): boolean {
  const sample = history.slice(-14);
  if (sample.length < 8) return false;

  const avgBody = averageBody(sample);
  const avgRange = averageRange(sample);
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  if (avgBody <= 0 || avgRange <= 0 || range <= 0) return false;

  const bullishClose = (candle.close - candle.low) / range >= 0.75;
  const bearishClose = (candle.high - candle.close) / range >= 0.75;
  return direction === "bullish"
    ? candle.close > candle.open &&
        body >= avgBody * 1.35 &&
        range >= avgRange * 1.15 &&
        bullishClose
    : candle.close < candle.open &&
        body >= avgBody * 1.35 &&
        range >= avgRange * 1.15 &&
        bearishClose;
}

function findSweep(
  candles: MarketCandle[],
  direction: Direction,
  atr: number,
): Sweep | null {
  if (candles.length < 24 || atr <= 0) return null;
  const start = Math.max(12, candles.length - 8);

  for (let index = candles.length - 1; index >= start; index -= 1) {
    const prior = candles.slice(0, index);
    const swings = findSwings(prior);
    const relevant = direction === "bullish"
      ? swings.filter((swing) => swing.kind === "low").slice(-5)
      : swings.filter((swing) => swing.kind === "high").slice(-5);
    const sessions = findAsianRanges(prior).slice(-3);
    const pools = [
      ...relevant.map((swing) => ({
        price: swing.price,
        index: swing.index,
        source: "SWING" as const,
      })),
      ...sessions.map((session) => ({
        price: direction === "bullish" ? session.low : session.high,
        index: session.endIndex,
        source: "ASIAN_RANGE" as const,
      })),
    ];
    if (pools.length === 0) continue;

    const tolerance = atr * 0.1;
    const clusters = pools
      .map((pool) => {
        const members = pools.filter(
          (candidate) => Math.abs(candidate.price - pool.price) <= tolerance,
        );
        return {
          members,
          latestIndex: Math.max(...members.map((member) => member.index)),
        };
      })
      .filter((cluster) => cluster.members.length >= 2)
      .sort((a, b) =>
        b.members.length - a.members.length ||
        b.latestIndex - a.latestIndex,
      );
    const cluster = clusters[0];
    const chosen = cluster
      ? {
          price:
            cluster.members.reduce((sum, member) => sum + member.price, 0) /
            cluster.members.length,
          source: "EQUAL_LEVELS" as const,
        }
      : pools.sort((a, b) => b.index - a.index)[0];
    const candle = candles[index];
    const wickTolerance = atr * 0.04;

    if (
      direction === "bullish" &&
      candle.low < chosen.price - wickTolerance &&
      candle.close > chosen.price &&
      candle.close > candle.open
    ) {
      return {
        index,
        level: chosen.price,
        extreme: candle.low,
        source: chosen.source,
      };
    }
    if (
      direction === "bearish" &&
      candle.high > chosen.price + wickTolerance &&
      candle.close < chosen.price &&
      candle.close < candle.open
    ) {
      return {
        index,
        level: chosen.price,
        extreme: candle.high,
        source: chosen.source,
      };
    }
  }
  return null;
}

function findPostSweepShift(
  candles: MarketCandle[],
  sweep: Sweep,
  direction: Direction,
): number | null {
  for (let index = sweep.index + 1; index < candles.length; index += 1) {
    const prior = candles.slice(0, index);
    const swings = findSwings(prior);
    const opposing = direction === "bullish"
      ? swings.filter((swing) => swing.kind === "high")
      : swings.filter((swing) => swing.kind === "low");
    if (opposing.length === 0) continue;

    const level = opposing[opposing.length - 1].price;
    const candle = candles[index];
    if (
      isDisplacement(candle, prior, direction) &&
      (direction === "bullish" ? candle.close > level : candle.close < level)
    ) {
      return index;
    }
  }
  return null;
}

function mitigationFill(
  candles: MarketCandle[],
  createdIndex: number,
  top: number,
  bottom: number,
  direction: Direction,
): number {
  const width = top - bottom;
  if (width <= 0) return 1;
  const later = candles.slice(createdIndex + 1);
  if (later.length === 0) return 0;

  const penetration =
    direction === "bullish"
      ? top - Math.min(...later.map((candle) => candle.low))
      : Math.max(...later.map((candle) => candle.high)) - bottom;
  return Math.max(0, Math.min(1, penetration / width));
}

function findFreshZones(
  candles: MarketCandle[],
  direction: Direction,
  shiftIndex: number,
  price: number,
  atr: number,
): EntryZone[] {
  const zones: EntryZone[] = [];
  const firstIndex = Math.max(2, shiftIndex);
  const tolerance = atr * 0.12;

  for (let index = firstIndex; index < candles.length; index += 1) {
    const first = candles[index - 2];
    const middle = candles[index - 1];
    const third = candles[index];
    const gap =
      direction === "bullish"
        ? first.high < third.low
        : first.low > third.high;
    if (!gap) continue;

    const impulse = isDisplacement(middle, candles.slice(0, index - 1), direction) ||
      isDisplacement(third, candles.slice(0, index), direction);
    if (!impulse) continue;

    const top = direction === "bullish" ? third.low : first.low;
    const bottom = direction === "bullish" ? first.high : third.high;
    const fill = mitigationFill(candles, index, top, bottom, direction);
    if (fill >= 0.5) continue;

    const touched =
      price >= bottom - tolerance &&
      price <= top + tolerance &&
      (direction === "bullish"
        ? candles[candles.length - 1].low <= top + tolerance
        : candles[candles.length - 1].high >= bottom - tolerance);
    if (touched) {
      zones.push({
        top,
        bottom,
        mid: (top + bottom) / 2,
        kind: "FVG",
        createdIndex: index,
        fill,
      });
    }
  }

  const searchStart = Math.max(0, shiftIndex - 5);
  for (let impulseIndex = shiftIndex; impulseIndex >= searchStart; impulseIndex -= 1) {
    const impulse = candles[impulseIndex];
    const history = candles.slice(0, impulseIndex);
    if (!isDisplacement(impulse, history, direction)) continue;

    for (let index = impulseIndex - 1; index >= Math.max(0, impulseIndex - 4); index -= 1) {
      const candle = candles[index];
      const opposing =
        direction === "bullish" ? candle.close < candle.open : candle.close > candle.open;
      if (!opposing) continue;

      const top = candle.high;
      const bottom = candle.low;
      const fill = mitigationFill(candles, index, top, bottom, direction);
      const touched =
        price >= bottom - tolerance &&
        price <= top + tolerance &&
        (direction === "bullish"
          ? candles[candles.length - 1].low <= top + tolerance
          : candles[candles.length - 1].high >= bottom - tolerance);
      if (fill < 0.5 && touched) {
        const brokenThrough = candles
          .slice(index + 1, candles.length - 1)
          .some((bar) =>
            direction === "bullish" ? bar.close > top : bar.close < bottom,
          );
        zones.push({
          top,
          bottom,
          mid: (top + bottom) / 2,
          kind: brokenThrough ? "BREAKER_BLOCK" : "ORDER_BLOCK",
          createdIndex: index,
          fill,
        });
      }
      break;
    }
  }

  return zones.sort(
    (a, b) =>
      Math.abs(a.mid - price) - Math.abs(b.mid - price) ||
      b.createdIndex - a.createdIndex,
  );
}

interface FlipLevel {
  level: number;
  bandTop: number;
  bandBottom: number;
  breakoutTime: string;
}

function findFlipLevel(
  candles: MarketCandle[],
  direction: Direction,
  atr: number,
  requireRetest: boolean,
  currentPrice: number,
): FlipLevel | null {
  if (candles.length < 32 || atr <= 0) return null;
  const swingKind = direction === "bullish" ? "high" : "low";
  const swings = findSwings(candles.slice(0, -1)).filter(
    (swing) => swing.kind === swingKind,
  );
  const tolerance = atr * 0.12;
  const candidates = swings
    .map((swing) => {
      const nearby = swings.filter(
        (candidate) => Math.abs(candidate.price - swing.price) <= tolerance,
      );
      return {
        level:
          nearby.reduce((sum, candidate) => sum + candidate.price, 0) /
          nearby.length,
        count: nearby.length,
        lastTouch: Math.max(...nearby.map((candidate) => candidate.index)),
      };
    })
    .filter((candidate) => candidate.count >= 3)
    .sort((a, b) => b.count - a.count || b.lastTouch - a.lastTouch);

  for (const candidate of candidates) {
    const bandBottom = candidate.level - tolerance;
    const bandTop = candidate.level + tolerance;
    const breakoutIndex = candles.findIndex((candle, index) => {
      if (index < Math.max(0, candles.length - 8)) return false;
      return direction === "bullish"
        ? candle.close > bandTop
        : candle.close < bandBottom;
    });
    if (breakoutIndex < 0) continue;

    const afterBreak = candles.slice(breakoutIndex + 1);
    if (
      afterBreak.some((candle) =>
        direction === "bullish"
          ? candle.close < bandBottom
          : candle.close > bandTop,
      )
    ) {
      continue;
    }

    if (
      requireRetest &&
      !(
        currentPrice >= bandBottom &&
        currentPrice <= bandTop &&
        (direction === "bullish"
          ? candles[candles.length - 1].low <= bandTop
          : candles[candles.length - 1].high >= bandBottom)
      )
    ) {
      continue;
    }

    return {
      level: candidate.level,
      bandTop,
      bandBottom,
      breakoutTime: candles[breakoutIndex].time,
    };
  }
  return null;
}

function hasWickOverlap(
  candle: MarketCandle,
  zoneBottom: number,
  zoneTop: number,
): boolean {
  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);
  const lowerOverlap =
    Math.min(bodyBottom, zoneTop) - Math.max(candle.low, zoneBottom);
  const upperOverlap =
    Math.min(candle.high, zoneTop) - Math.max(bodyTop, zoneBottom);
  return lowerOverlap > 0 || upperOverlap > 0;
}

function hasFlipType2(
  h4: MarketCandle[],
  d1: MarketCandle[],
  direction: Direction,
): boolean {
  const atr = averageRange(h4.slice(-14));
  const flip = findFlipLevel(h4, direction, atr, false, 0);
  if (!flip || d1.length < 2) return false;
  const breakoutTime = Date.parse(flip.breakoutTime);
  return d1.some(
    (candle) =>
      Date.parse(candle.time) > breakoutTime &&
      hasWickOverlap(candle, flip.bandBottom, flip.bandTop),
  );
}

function hasRecentStructureShift(
  candles: MarketCandle[],
  direction: Direction,
): boolean {
  if (candles.length < 24) return false;
  const start = Math.max(10, candles.length - 6);
  for (let index = candles.length - 1; index >= start; index -= 1) {
    const prior = candles.slice(0, index);
    const swings = findSwings(prior);
    const structural = swings.filter((swing) =>
      direction === "bullish"
        ? swing.kind === "high"
        : swing.kind === "low",
    );
    const level = structural[structural.length - 1]?.price;
    if (level === undefined) continue;
    if (
      isDisplacement(candles[index], prior, direction) &&
      (direction === "bullish"
        ? candles[index].close > level
        : candles[index].close < level)
    ) {
      return true;
    }
  }
  return false;
}

function isRejectionCandle(
  candle: MarketCandle,
  direction: Direction,
  previous?: MarketCandle,
): boolean {
  const range = candle.high - candle.low;
  const body = Math.abs(candle.close - candle.open);
  if (range <= 0 || body <= 0) return false;
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const bullishEngulfing = Boolean(
    previous &&
      previous.close < previous.open &&
      candle.close > candle.open &&
      candle.open <= previous.close &&
      candle.close >= previous.open,
  );
  const bearishEngulfing = Boolean(
    previous &&
      previous.close > previous.open &&
      candle.close < candle.open &&
      candle.open >= previous.close &&
      candle.close <= previous.open,
  );
  if (direction === "bullish") {
    return (
      (candle.close > candle.open &&
        lowerWick >= body * 1.5 &&
        candle.close > candle.low + range * 0.65) ||
      bullishEngulfing
    );
  }
  return (
    (candle.close < candle.open &&
      upperWick >= body * 1.5 &&
      candle.close < candle.high - range * 0.65) ||
    bearishEngulfing
  );
}

function findBreakRetest(
  candles: MarketCandle[],
  direction: Direction,
  atr: number,
): { level: number; index: number; touches: number } | null {
  if (candles.length < 24 || atr <= 0) return null;
  const last = candles[candles.length - 1];
  const tolerance = atr * 0.1;
  const start = Math.max(10, candles.length - 10);

  for (let index = candles.length - 2; index >= start; index -= 1) {
    const prior = candles.slice(0, index);
    const swings = findSwings(prior);
    const relevant = direction === "bullish"
      ? swings.filter((swing) => swing.kind === "high")
      : swings.filter((swing) => swing.kind === "low");
    if (relevant.length === 0) continue;

    const level = relevant[relevant.length - 1].price;
    const touches = prior
      .slice(-40)
      .filter((candle) =>
        Math.abs(
          (direction === "bullish" ? candle.high : candle.low) - level,
        ) <= tolerance,
      ).length;
    const broke = isDisplacement(candles[index], prior, direction) &&
      (direction === "bullish"
        ? candles[index].close > level
        : candles[index].close < level);
    if (!broke) continue;

    const retested = direction === "bullish"
      ? last.low <= level + tolerance && last.close > level
      : last.high >= level - tolerance && last.close < level;
    if (retested && isRejectionCandle(last, direction, candles[candles.length - 2])) {
      return { level, index, touches };
    }
  }
  return null;
}

function nearestOpposingLiquidity(
  candles: MarketCandle[][],
  d1: MarketCandle[],
  m15: MarketCandle[],
  direction: Direction,
  entry: number,
): number | null {
  const levels = candles.flatMap((series) =>
    findSwings(series)
      .filter((swing) =>
        direction === "bullish"
          ? swing.kind === "high" && swing.price > entry
          : swing.kind === "low" && swing.price < entry,
      )
      .map((swing) => swing.price),
  );

  // Previous completed daily range and prior-week extremes are objective external references.
  const previousDay = d1[d1.length - 1];
  if (previousDay) {
    levels.push(direction === "bullish" ? previousDay.high : previousDay.low);
  }
  if (d1.length > 5) {
    const thisMonday = new Date();
    const day = thisMonday.getUTCDay();
    thisMonday.setUTCHours(0, 0, 0, 0);
    thisMonday.setUTCDate(thisMonday.getUTCDate() - ((day + 6) % 7));
    const lastWeekStart = thisMonday.getTime() - 7 * 24 * 60 * 60_000;
    const thisWeekStart = thisMonday.getTime();
    const lastWeek = d1.filter((candle) => {
      const time = Date.parse(candle.time);
      return time >= lastWeekStart && time < thisWeekStart;
    });
    if (lastWeek.length > 0) {
      levels.push(
        direction === "bullish"
          ? Math.max(...lastWeek.map((candle) => candle.high))
          : Math.min(...lastWeek.map((candle) => candle.low)),
      );
    }
  }

  const asianRanges = findAsianRanges(m15);
  for (const session of asianRanges.slice(-5)) {
    levels.push(direction === "bullish" ? session.high : session.low);
  }

  const valid = levels.filter((level) =>
    Number.isFinite(level) &&
    (direction === "bullish" ? level > entry : level < entry),
  );
  if (valid.length === 0) return null;
  return direction === "bullish"
    ? Math.min(...valid)
    : Math.max(...valid);
}

function pipsFor(instrument: string, distance: number): number {
  const symbol = instrument.toUpperCase();
  const pip =
    symbol.includes("JPY") ? 0.01 :
    symbol.startsWith("XAU") ? 0.1 :
    symbol.startsWith("XAG") ? 0.01 :
    symbol.includes("BTC") || symbol.includes("ETH") ? 1 :
    0.0001;
  return Math.round((Math.abs(distance) / pip) * 10) / 10;
}

function describeStructure(
  h4: Structure,
  h1: Structure,
  d1: Structure,
): { direction: SignalDirection; confidence: number; explanation: string } {
  if (h4.direction !== "neutral" && h4.direction === h1.direction) {
    const direction = h4.direction;
    const dailyNote =
      d1.direction === direction
        ? " Daily structure agrees."
        : d1.direction === "neutral"
          ? " Daily structure is not decisive."
          : " Daily structure is opposing, so the bias is lower confidence.";
    return {
      direction,
      confidence: d1.direction === direction ? 82 : d1.direction === "neutral" ? 74 : 64,
      explanation:
        "H4 and H1 both show " +
        (direction === "bullish" ? "higher highs and higher lows." : "lower highs and lower lows.") +
        dailyNote,
    };
  }

  if (h4.direction !== "neutral" && h1.direction === "neutral") {
    return {
      direction: h4.direction,
      confidence: 56,
      explanation:
        "H4 structure leans " + h4.direction +
        ", but H1 has not confirmed the same swing sequence yet. Treat this as a developing bias, not an entry trigger.",
    };
  }

  if (h4.direction !== "neutral" && h1.direction !== "neutral") {
    return {
      direction: "neutral",
      confidence: 38,
      explanation:
        "H4 and H1 structure conflict. The market is transitional; wait for a clear realignment before looking for an entry.",
    };
  }

  return {
    direction: "neutral",
    confidence: 35,
    explanation:
      "There are not enough confirmed H4/H1 swing points to establish a directional structure bias.",
  };
}

export function analysePriceAction(
  input: PriceActionInput,
): PriceActionAnalysis {
  const now = input.now ?? Date.now();
  const d1 = completedBars(input.d1, "D1", now);
  const h4 = completedBars(input.h4, "H4", now);
  const h1 = completedBars(input.h1, "H1", now);
  const m15 = completedBars(input.m15, "M15", now);
  const m5 = completedBars(input.m5 ?? [], "M5", now);

  const d1Structure = analyseStructure(d1);
  const h4Structure = analyseStructure(h4);
  const h1Structure = analyseStructure(h1);
  const bias = describeStructure(h4Structure, h1Structure, d1Structure);

  if (
    bias.direction === "neutral" ||
    h4Structure.direction !== bias.direction ||
    h1Structure.direction !== bias.direction ||
    m15.length < 32 ||
    !Number.isFinite(input.price) ||
    input.price <= 0
  ) {
    return {
      direction: bias.direction,
      confidence: bias.confidence,
      technicalExplanation: bias.explanation,
      setup: null,
    };
  }

  const direction = bias.direction;
  const atr = averageRange(m15.slice(-14));
  if (atr <= 0) {
    return {
      direction,
      confidence: bias.confidence,
      technicalExplanation: bias.explanation,
      setup: null,
    };
  }

  const sweep = findSweep(m15, direction, atr);
  const shiftIndex = sweep
    ? findPostSweepShift(m15, sweep, direction)
    : null;
  const breakRetest = sweep
    ? null
    : findBreakRetest(m15, direction, atr);
  const triggerIndex = shiftIndex ?? breakRetest?.index ?? null;

  if (triggerIndex === null) {
    return {
      direction,
      confidence: bias.confidence,
      technicalExplanation: bias.explanation +
        " No confirmed M15 sweep-and-shift or break-and-retest trigger is present.",
      setup: null,
    };
  }

  const zones = findFreshZones(
    m15,
    direction,
    triggerIndex,
    input.price,
    atr,
  );
  const zone = zones[0] ??
    (breakRetest
      ? {
          top: breakRetest.level + atr * 0.06,
          bottom: breakRetest.level - atr * 0.06,
          mid: breakRetest.level,
          kind: "RETEST" as const,
          createdIndex: breakRetest.index,
          fill: 0,
        }
      : null);

  if (!zone || !isRejectionCandle(m15[m15.length - 1], direction, m15[m15.length - 2])) {
    return {
      direction,
      confidence: bias.confidence,
      technicalExplanation: bias.explanation +
        " M15 has not yet confirmed a rejection from a fresh, unconsumed entry area.",
      setup: null,
    };
  }

  const dealingRange = m15.slice(-48);
  const rangeHigh = Math.max(...dealingRange.map((candle) => candle.high));
  const rangeLow = Math.min(...dealingRange.map((candle) => candle.low));
  const equilibrium = (rangeHigh + rangeLow) / 2;
  const inCorrectHalf = direction === "bullish"
    ? input.price <= equilibrium
    : input.price >= equilibrium;
  if (!inCorrectHalf) {
    return {
      direction,
      confidence: bias.confidence,
      technicalExplanation: bias.explanation +
        " Price is not in the correct premium/discount half of the current dealing range.",
      setup: null,
    };
  }

  const fmd = sweep?.extreme ?? (
    direction === "bullish" ? zone.bottom : zone.top
  );
  const buffer = Math.max(atr * 0.12, input.spread * 1.5);
  const stopLoss = direction === "bullish" ? fmd - buffer : fmd + buffer;
  const risk = Math.abs(input.price - stopLoss);
  if (
    risk <= Math.max(input.spread * 2, atr * 0.1) ||
    risk > input.price * 0.025
  ) {
    return {
      direction,
      confidence: bias.confidence,
      technicalExplanation: bias.explanation +
        " The structural invalidation point does not produce a defensible stop distance at the current spread and volatility.",
      setup: null,
    };
  }

  const target = nearestOpposingLiquidity(
    [h1, h4],
    d1,
    m15,
    direction,
    input.price,
  );
  if (target === null) {
    return {
      direction,
      confidence: bias.confidence,
      technicalExplanation: bias.explanation +
        " No opposing higher-timeframe liquidity target is available.",
      setup: null,
    };
  }

  const reward = Math.abs(target - input.price);
  const riskReward = reward / risk;
  if (riskReward < 5) {
    return {
      direction,
      confidence: bias.confidence,
      technicalExplanation: bias.explanation +
        " The nearest opposing liquidity/first trouble area offers less than the required 1:5 reward-to-risk, so no setup is issued.",
      setup: null,
    };
  }

  const precision = input.instrument.toUpperCase().startsWith("XAU") ||
    input.instrument.toUpperCase().startsWith("XAG") ? 3 :
    input.instrument.toUpperCase().includes("JPY") ? 3 : 5;
  const round = (value: number) => Number(value.toFixed(precision));
  const sign = direction === "bullish" ? 1 : -1;
  const takeProfit1 = round(input.price + sign * risk * 2);
  const takeProfit2 = round(input.price + sign * risk * 3.5);
  const takeProfit = round(target);
  const h4Atr = averageRange(h4.slice(-14));
  const h1Atr = averageRange(h1.slice(-14));
  const h4Engineering = findSweep(h4, direction, h4Atr);
  const h1Engineering = findSweep(h1, direction, h1Atr);
  const flipType1 = findFlipLevel(h4, direction, h4Atr, true, input.price);
  const flipType2 = hasFlipType2(h4, d1, direction);
  const ftaShiftConfirmed =
    hasRecentStructureShift(h1, direction) &&
    h4Structure.direction === direction;
  const tags = [
    ...(sweep
      ? [
          "LIQUIDITY_SWEEP",
          "RECLAIM",
          "FMD_INVALIDATION",
          "LIQUIDITY_ENGINEERING",
          "SHIFT_ENTRY",
          ...(sweep.source === "EQUAL_LEVELS" ? ["EQUAL_HIGHS_OR_LOWS"] : []),
          ...(sweep.source === "ASIAN_RANGE" ? ["ASIAN_SESSION_LIQUIDITY"] : []),
          ...(h4Engineering && h1Engineering ? ["LIQUIDITY_ENGINEERING_MTF"] : []),
        ]
      : []),
    ...(shiftIndex !== null ? ["DISPLACEMENT", "MSS", "STRUCTURE_SHIFT"] : []),
    ...(zone.kind === "FVG" ? ["FVG", "AOL_RETEST"] : []),
    ...(zone.kind === "ORDER_BLOCK" ? ["ORDER_BLOCK", "MITIGATION_CHECK"] : []),
    ...(zone.kind === "BREAKER_BLOCK" ? ["BREAKER_BLOCK", "MITIGATION_CHECK"] : []),
    ...(zone.kind === "RETEST" ? ["PURE_PRICE_ACTION", "BREAK_RETEST"] : []),
    ...(flipType1 ? ["APA_FLIP_TYPE_1"] : []),
    ...(flipType2 ? ["APA_FLIP_TYPE_2_WICK_OVERLAP"] : []),
    ...(ftaShiftConfirmed ? ["APA_FTA_ENTRY_CONFIRMED"] : []),
    ...(zone.fill < 0.5 ? ["FRESH_ZONE_UNDER_50_PERCENT_MITIGATION"] : []),
    ...(inCorrectHalf ? [direction === "bullish" ? "DISCOUNT" : "PREMIUM"] : []),
    ...(direction === "bullish"
      ? (rangeHigh - input.price) / Math.max(rangeHigh - rangeLow, Number.EPSILON) >= 0.62 &&
        (rangeHigh - input.price) / Math.max(rangeHigh - rangeLow, Number.EPSILON) <= 0.79
        ? ["OTE"]
        : []
      : (input.price - rangeLow) / Math.max(rangeHigh - rangeLow, Number.EPSILON) >= 0.62 &&
        (input.price - rangeLow) / Math.max(rangeHigh - rangeLow, Number.EPSILON) <= 0.79
        ? ["OTE"]
        : []),
    ...(findSwings(m15.slice(0, zone.createdIndex + 1)).some(
      (swing) => Math.abs(swing.price - zone.mid) <= atr * 0.25,
    )
      ? ["AOL_CONFLUENCE"]
      : []),
    "FTA_TARGET",
    ...(m5.length >= 24 && analyseStructure(m5).direction === direction
      ? ["M5_REFINEMENT_AGREES"]
      : []),
  ];

  const confidence = Math.min(
    90,
    bias.confidence +
      (sweep ? 7 : 0) +
      (shiftIndex !== null ? 5 : 0) +
      (zone.kind !== "RETEST" ? 4 : 0) +
      (m5.length >= 24 && analyseStructure(m5).direction === direction ? 2 : 0),
  );
  const explanation =
    (sweep
      ? (direction === "bullish" ? "Sell-side liquidity was swept and reclaimed" : "Buy-side liquidity was swept and reclaimed") +
        (shiftIndex !== null ? ", displacement confirmed the structure shift" : "")
      : "Price broke structure and held the retest") +
    (zone.kind === "FVG"
      ? ", then returned to a fresh imbalance."
      : zone.kind === "ORDER_BLOCK"
        ? ", then returned to an unconsumed origin zone."
        : zone.kind === "BREAKER_BLOCK"
          ? ", then retested a failed block from the other side."
          : ", followed by a confirmed rejection.");

  return {
    direction,
    confidence,
    technicalExplanation: bias.explanation,
    setup: {
      entry: round(input.price),
      stopLoss: round(stopLoss),
      takeProfit,
      takeProfit1,
      takeProfit2,
      riskReward: Math.round(riskReward * 10) / 10,
      riskPips: pipsFor(input.instrument, risk),
      rewardPips: pipsFor(input.instrument, reward),
      timeframe: "M15",
      confidence,
      explanation,
      tags,
    },
  };
}
