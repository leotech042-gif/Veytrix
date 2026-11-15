import { Controller, Get, Inject, Query } from "@nestjs/common";
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
  getNews() {
    return this.fundamentals.getNews();
  }
}
