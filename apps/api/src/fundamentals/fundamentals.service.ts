import { Inject, Injectable } from "@nestjs/common";
import type { EconomicEvent, FundamentalNewsItem, FundamentalsStatus } from "@veytrix/shared";
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

  getNews(): Promise<readonly FundamentalNewsItem[]> {
    return this.provider.getNews();
  }
}
