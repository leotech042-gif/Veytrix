/**
 * Pure Price Action + SMC combined post-processor.
 * Wraps analysePriceAction: explicit TP3, combined explanation tags.
 * Does not change market quotes.
 */
import type {
  PriceActionAnalysis,
  PriceActionInput,
} from "./price-action-engine";
import { analysePriceAction as analyseCore } from "./price-action-engine";

function round(value: number, digits = 5): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function pipsFor(instrument: string, distance: number): number {
  const s = instrument.toUpperCase();
  const pip = s.includes("JPY")
    ? 0.01
    : s.startsWith("XAU")
      ? 0.1
      : s.startsWith("XAG")
        ? 0.01
        : 0.0001;
  return Math.round((Math.abs(distance) / pip) * 10) / 10;
}

export function analysePriceAction(
  input: PriceActionInput,
): PriceActionAnalysis {
  const result = analyseCore(input);
  if (!result.setup) return result;

  const setup = result.setup;
  const direction = result.direction;
  if (direction === "neutral") return result;

  const sign = direction === "bullish" ? 1 : -1;
  const entry = setup.entry;
  const stop = setup.stopLoss;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return result;

  const tp3 = setup.takeProfit3 ?? setup.takeProfit;
  const tp1 = round(entry + sign * risk * 2);
  const tp2 = round(entry + sign * risk * 3.5);
  const reward = Math.abs(tp3 - entry);
  const rr = reward / risk;

  const tags = Array.from(
    new Set([...(setup.tags ?? []), "PURE_PA_SMC_COMBINED"]),
  );

  const explanation =
    setup.explanation +
    " Combined pure PA + SMC: structure bias, liquidity sweep or break-retest, OB/FVG/breaker, premium/discount, rejection. TP1=2R TP2=3.5R TP3=opposing liquidity (min 1:5)." +
    (rr >= 5
      ? ""
      : " Measured RR under 1:5 — only kept if core engine already gated.");

  return {
    ...result,
    technicalExplanation:
      (result.technicalExplanation ?? "") + " " + explanation,
    setup: {
      ...setup,
      takeProfit: tp3,
      takeProfit1: setup.takeProfit1 ?? tp1,
      takeProfit2: setup.takeProfit2 ?? tp2,
      takeProfit3: tp3,
      riskReward: Math.round(rr * 10) / 10,
      riskPips: setup.riskPips ?? pipsFor(input.instrument, risk),
      rewardPips: setup.rewardPips ?? pipsFor(input.instrument, reward),
      explanation,
      tags,
    },
  };
}

export type {
  PriceActionAnalysis,
  PriceActionInput,
  PriceActionSetup,
} from "./price-action-engine";
