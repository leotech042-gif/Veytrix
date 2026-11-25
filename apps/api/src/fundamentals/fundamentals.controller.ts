import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import type { MarketNewsCategory } from "@veytrix/shared";
import { FundamentalsService } from "./fundamentals.service";

@Controller("fundamentals")
export class FundamentalsController {
  constructor(
    @Inject(FundamentalsService)
    private readonly fundamentals: FundamentalsService,
  ) {}

  @Get("status")
  getStatus() {
    return this.fundamentals.getStatus();
  }

  @Get("calendar")
  getCalendar(@Query("from") from?: string, @Query("to") to?: string) {
    return this.fundamentals.getCalendar(from, to);
  }

  @Get("news")
  getNews(@Query("category") category = "forex") {
    if (category !== "forex" && category !== "general") {
      throw new BadRequestException({
        code: "INVALID_NEWS_CATEGORY",
        message: "Category must be forex or general.",
      });
    }
    return this.fundamentals.getNews(category as MarketNewsCategory);
  }
}
