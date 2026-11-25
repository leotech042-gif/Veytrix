import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { EconomicEvent, FundamentalsStatus, MarketNewsArticle, MarketNewsCategory } from "@veytrix/shared";
import {
  FUNDAMENTALS_PROVIDER,
  type FundamentalsProvider,
} from "./fundamentals-provider";

@Injectable()
export class FundamentalsService {
  constructor(
    @Inject(FUNDAMENTALS_PROVIDER)
    private readonly provider: FundamentalsProvider,
  ) {}

  getStatus(): FundamentalsStatus | Promise<FundamentalsStatus> {
    return this.provider.getStatus();
  }

  getCalendar(from?: string, to?: string): Promise<readonly EconomicEvent[]> {
    return this.provider.getCalendar(from, to);
  }

  getNews(category: MarketNewsCategory): Promise<readonly MarketNewsArticle[]> {
    if (!this.provider.getNews) {
      throw new ServiceUnavailableException({
        code: "FUNDAMENTALS_NEWS_UNAVAILABLE",
        message: "The configured fundamentals provider does not support market news. Set FUNDAMENTALS_PROVIDER=finnhub.",
      });
    }
    return this.provider.getNews(category);
  }
}
