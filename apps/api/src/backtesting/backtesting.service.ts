import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ChartTimeframe, MarketCandle } from "@veytrix/shared";
import { MarketDataService } from "../market-data/market-data.service";
import { analysePriceAction } from "../signals/price-action-engine";

type Outcome = "win" | "loss" | "open";
type TestTrade = {
  id: string;
  direction: "bullish" | "bearish";
  timeframe: ChartTimeframe;
  entryTime: string;
  exitTime: string | null;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  realizedR: number | null;
  outcome: Outcome;
  tags: string[];
  annotations: import("../signals/price-action-engine").PriceActionAnnotation[];
  explanation: string;
  entryIndex: number;
  exitIndex: number | null;
};
type TestSummary = {
  trades: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number;
  netR: number;
  averageR: number;
  maxDrawdownR: number;
};
type TestSegment = { trades: TestTrade[]; summary: TestSummary };

const TF_MS: Record<ChartTimeframe, number> = {
  M1: 60_000, M5: 300_000, M15: 900_000, M30: 1_800_000,
  H1: 3_600_000, H4: 14_400_000, D1: 86_400_000, W1: 604_800_000,
};

@Injectable()
export class BacktestingService {
  constructor(
    @Inject(MarketDataService) private readonly marketData: MarketDataService,
  ) {}

  async run(instrumentRaw: string, fromRaw: string, toRaw: string) {
    const instrument = instrumentRaw.trim().toUpperCase();
    const from = Date.parse(fromRaw);
    const to = Date.parse(toRaw);
    if (!/^[A-Z0-9._/-]{3,30}$/.test(instrument) ||
        !Number.isFinite(from) || !Number.isFinite(to) || from >= to ||
        to - from > 10 * 86_400_000) {
      throw new BadRequestException({
        code: "INVALID_BACKTEST_RANGE",
        message: "Choose a valid instrument and a date range of up to 10 days.",
      });
    }

    const instruments = await this.marketData.getInstruments();
    if (!instruments.some((item) =>
      item.symbol.toUpperCase() === instrument &&
      (item.category === "forex" || item.category === "metals"))) {
      throw new BadRequestException({
        code: "UNSUPPORTED_BACKTEST_INSTRUMENT",
        message: "Backtesting currently supports the available forex pairs and XAUUSD/XAGUSD.",
      });
    }

    const [m15Raw, h1Raw, h4Raw, d1Raw, quotes] = await Promise.all([
      this.marketData.getHistory(instrument, "M15"),
      this.marketData.getHistory(instrument, "H1"),
      this.marketData.getHistory(instrument, "H4"),
      this.marketData.getHistory(instrument, "D1"),
      this.marketData.getQuotes(),
    ]);
    const candles = [...m15Raw].filter((c) => {
      const t = Date.parse(c.time);
      return Number.isFinite(t) && t >= from && t <= to;
    });
    if (candles.length < 80) {
      throw new ServiceUnavailableException({
        code: "INSUFFICIENT_BACKTEST_HISTORY",
        message: "Tiingo returned fewer than 80 M15 candles for this period. Choose a period inside the available history or try again later.",
      });
    }

    const quote = quotes.find((item) => item.instrument.toUpperCase() === instrument);
    const spread = quote?.spread && Number.isFinite(quote.spread) ? quote.spread : 0;
    const split = Math.max(40, Math.min(candles.length - 20, Math.floor(candles.length * 0.8)));
    const backtest = this.testSegment(
      instrument, candles, [...m15Raw], [...h1Raw], [...h4Raw], [...d1Raw],
      40, split, spread,
    );
    const forward = this.testSegment(
      instrument, candles, [...m15Raw], [...h1Raw], [...h4Raw], [...d1Raw],
      split, candles.length, spread,
    );

    return {
      instrument,
      entryTimeframe: "M15" as const,
      analysisTimeframes: ["D1", "H4", "H1", "M15"],
      period: { from: candles[0].time, to: candles[candles.length - 1].time },
      data: candles,
      backtest,
      forward,
      limitations: [
        "The strategy currently confirms entries on M15 after D1/H4/H1 top-down alignment; it does not select a lower entry timeframe.",
        "Tiingo currently supplies up to 10 days of M15 history to this application.",
        "Historical bid/ask spread is not available from the current provider. The simulation uses the latest available quote spread as a proxy, or zero if unavailable.",
        "A candle that touches both stop loss and take profit is counted as a loss (conservative ordering).",
        "This is a paper simulation only; no broker orders are placed.",
      ],
    };
  }

  private testSegment(
    instrument: string,
    candles: MarketCandle[],
    m15History: MarketCandle[],
    h1: MarketCandle[],
    h4: MarketCandle[],
    d1: MarketCandle[],
    start: number,
    end: number,
    spread: number,
  ): TestSegment {
    const trades: TestTrade[] = [];
    let index = start;
    while (index < end - 1) {
      const current = candles[index];
      const decisionTime = Date.parse(current.time) + TF_MS.M15;
      const analysis = analysePriceAction({
        instrument,
        price: current.close,
        spread,
        d1: d1.filter((c) => Date.parse(c.time) + TF_MS.D1 <= decisionTime),
        h4: h4.filter((c) => Date.parse(c.time) + TF_MS.H4 <= decisionTime),
        h1: h1.filter((c) => Date.parse(c.time) + TF_MS.H1 <= decisionTime),
        m15: m15History.filter((c) => Date.parse(c.time) + TF_MS.M15 <= decisionTime),
        m5: [],
        now: decisionTime,
      });
      const setup = analysis.setup;
      if (!setup || (analysis.direction !== "bullish" && analysis.direction !== "bearish")) {
        index += 1;
        continue;
      }

      // Signal is confirmed at candle close; execute at the next candle open.
      const entryBarIndex = index + 1;
      const entryBar = candles[entryBarIndex];
      const halfSpread = Math.max(0, spread) / 2;
      const direction = analysis.direction;
      const entry = entryBar.open + (direction === "bullish" ? halfSpread : -halfSpread);
      const risk = direction === "bullish" ? entry - setup.stopLoss : setup.stopLoss - entry;
      const reward = direction === "bullish" ? setup.takeProfit - entry : entry - setup.takeProfit;
      const actualRiskReward = risk > 0 && reward > 0 ? reward / risk : 0;

      // Reject a gap that invalidates the setup or reduces executable R:R below 1:5.
      if (risk <= 0 || reward <= 0 || actualRiskReward < 5) {
        index += 1;
        continue;
      }

      let exitIndex: number | null = null;
      let outcome: Outcome = "open";
      let realizedR: number | null = null;
      for (let future = entryBarIndex; future < end; future += 1) {
        const bar = candles[future];
        const stopHit = direction === "bullish"
          ? bar.low - halfSpread <= setup.stopLoss
          : bar.high + halfSpread >= setup.stopLoss;
        const targetHit = direction === "bullish"
          ? bar.high - halfSpread >= setup.takeProfit
          : bar.low + halfSpread <= setup.takeProfit;
        if (stopHit) {
          exitIndex = future;
          outcome = "loss";
          realizedR = -1;
          break;
        }
        if (targetHit) {
          exitIndex = future;
          outcome = "win";
          realizedR = Number(actualRiskReward.toFixed(2));
          break;
        }
      }

      trades.push({
        id: instrument + "-" + index,
        direction,
        timeframe: setup.timeframe,
        entryTime: entryBar.time,
        exitTime: exitIndex === null ? null : candles[exitIndex].time,
        entry,
        stopLoss: setup.stopLoss,
        takeProfit: setup.takeProfit,
        riskReward: Number(actualRiskReward.toFixed(2)),
        realizedR,
        outcome,
        tags: setup.tags,
        annotations: setup.annotations,
        explanation: setup.explanation,
        entryIndex: entryBarIndex,
        exitIndex,
      });
      index = exitIndex === null ? end : exitIndex + 1;
    }
    return { trades, summary: this.summarize(trades) };
  }

  private summarize(trades: TestTrade[]): TestSummary {
    const wins = trades.filter((trade) => trade.outcome === "win").length;
    const losses = trades.filter((trade) => trade.outcome === "loss").length;
    const open = trades.filter((trade) => trade.outcome === "open").length;
    const closed = trades.filter((trade) => trade.realizedR !== null);
    let equity = 0;
    let peak = 0;
    let maxDrawdownR = 0;
    for (const trade of closed) {
      equity += trade.realizedR ?? 0;
      peak = Math.max(peak, equity);
      maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
    }
    const netR = closed.reduce((sum, trade) => sum + (trade.realizedR ?? 0), 0);
    return {
      trades: trades.length,
      wins,
      losses,
      open,
      winRate: wins + losses ? Number((wins / (wins + losses) * 100).toFixed(1)) : 0,
      netR: Number(netR.toFixed(2)),
      averageR: closed.length ? Number((netR / closed.length).toFixed(2)) : 0,
      maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    };
  }
}
