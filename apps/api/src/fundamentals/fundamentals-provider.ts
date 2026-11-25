import type { EconomicEvent, FundamentalsStatus, MarketNewsArticle, MarketNewsCategory } from "@veytrix/shared";

export const FUNDAMENTALS_PROVIDER = Symbol("FUNDAMENTALS_PROVIDER");

export interface FundamentalsProvider {
  getStatus(): FundamentalsStatus | Promise<FundamentalsStatus>;
  getCalendar(from?: string, to?: string): Promise<readonly EconomicEvent[]>;
  getNews?(category: MarketNewsCategory): Promise<readonly MarketNewsArticle[]>;
}
