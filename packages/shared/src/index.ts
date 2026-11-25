export type MarketCategory =
  | "forex"
  | "metals"
  | "crypto"
  | "indices"
  | "energy"
  | "synthetic"
  | "other";

export type ChartTimeframe = "M1" | "M3" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1";

export interface MarketInstrument {
  symbol: string;
  displayName: string;
  category: MarketCategory;
  pricePrecision?: number;
  baseCurrency?: string;
  quoteCurrency?: string;
}

export interface MarketQuote {
  instrument: string;
  asOf: string;
  bid?: number;
  ask?: number;
  last?: number;
  spread?: number;
  change?: number;
  changePercent?: number;
  delayed?: boolean;
}

export interface MarketCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type MarketDataStatus = ProviderStatus & {
  delayed?: boolean;
};

export type FundamentalsStatus = ProviderStatus;
export type SignalProviderStatus = ProviderStatus;

export type ProviderStatus =
  | {
      state: "connected";
      provider: string;
      message: string;
      updatedAt: string;
      delayed?: boolean;
    }
  | {
      state: "unconfigured";
      provider: null;
      message: string;
    }
  | {
      state: "disconnected";
      provider: string;
      message: string;
    };

export type EconomicImpact = "high" | "medium" | "low" | "unknown";
export type FundDirection = "bullish" | "bearish" | "neutral" | "pending";

export interface AffectedPair {
  symbol: string;
  bias: FundDirection;
  note?: string;
}

export interface EconomicEvent {
  id: string;
  time: string;
  country: string;
  currency: string;
  event: string;
  impact: EconomicImpact;
  actual: number | null;
  estimate: number | null;
  previous: number | null;
  unit?: string;
  surprise: number | null;
  volatility: "highly_volatile" | "normal" | "low";
  analysis: string;
  currencyBias: FundDirection;
  affectedPairs: AffectedPair[];
}

export type SignalDirection = "bullish" | "bearish" | "neutral";

export interface TradingSignal {
  id: string;
  instrument: string;
  type: "setup" | "bias";
  direction: SignalDirection;
  confidence: number;
  timeframe: ChartTimeframe;
  title: string;
  summary: string;
  /** Technical structure and price-action context shown when bias is expanded. */
  technicalExplanation?: string;
  /** Recent released macro context for the instrument; not a price forecast. */
  fundamentalExplanation?: string;
  createdAt: string;
  entry?: number;
  stopLoss?: number;
  /** Primary / final target (usually TP3) */
  takeProfit?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  takeProfit3?: number;
  /** Overall R:R to the final opposing-liquidity target; no fixed minimum. */
  riskReward?: number;
  riskPips?: number;
  rewardPips?: number;
  tags?: string[];
  marketOpen?: boolean;
  leanScore?: number;
}
