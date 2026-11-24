/**
 * Pure PA + SMC post-processor. Flexible R:R, TP3, combined labels.
 * Does not touch market quotes.
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
  const reward = Math.abs(tp3 - entry);
  const rr = reward / risk;
  const r1 = Math.min(2, Math.max(1, rr * 0.4));
  const r2 = Math.min(3.5, Math.max(r1 + 0.3, rr * 0.7));
  const tp1 = setup.takeProfit1 ?? round(entry + sign * risk * r1);
  const tp2 = setup.takeProfit2 ?? round(entry + sign * risk * r2);

  const tags = Array.from(
    new Set([...(setup.tags ?? []), "PURE_PA_SMC_COMBINED"]),
  );

  const explanation =
    setup.explanation +
    ` Combined pure PA + SMC. R:R 1:${(Math.round(rr * 10) / 10).toFixed(1)} (flexible — structure may offer more or less). TP1/TP2 partials, TP3 opposing liquidity.`;

  return {
    ...result,
    technicalExplanation:
      (result.technicalExplanation ?? "") + " " + explanation,
    setup: {
      ...setup,
      takeProfit: tp3,
      takeProfit1: tp1,
      takeProfit2: tp2,
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
