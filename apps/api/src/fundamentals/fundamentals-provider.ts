import type { EconomicEvent, FundamentalsStatus } from "@veytrix/shared";

export const FUNDAMENTALS_PROVIDER = Symbol("FUNDAMENTALS_PROVIDER");

export interface FundamentalsProvider {
  getStatus(): FundamentalsStatus | Promise<FundamentalsStatus>;
  getCalendar(from?: string, to?: string): Promise<readonly EconomicEvent[]>;
}
