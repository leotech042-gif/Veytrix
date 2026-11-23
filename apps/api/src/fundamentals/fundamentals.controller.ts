import { Controller, Get, Inject, Query } from "@nestjs/common";
import { FundamentalsService } from "./fundamentals.service";
import { NewsIntelligenceService } from "./news-intelligence.service";

@Controller("fundamentals")
export class FundamentalsController {
  constructor(
    @Inject(FundamentalsService)
    private readonly fundamentals: FundamentalsService,
    @Inject(NewsIntelligenceService)
    private readonly news: NewsIntelligenceService,
  ) {}

  @Get("status")
  getStatus() {
    return this.fundamentals.getStatus();
  }

  @Get("news")
  getNews(@Query("from") from?: string, @Query("to") to?: string) {
    return this.news.getIntelligence(from, to);
  }

  @Get("calendar")
  getCalendar(@Query("from") from?: string, @Query("to") to?: string) {
    return this.fundamentals.getCalendar(from, to);
  }
}
