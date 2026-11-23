import { Module } from "@nestjs/common";
import { FundamentalsController } from "./fundamentals.controller";
import { FundamentalsService } from "./fundamentals.service";
import { FUNDAMENTALS_PROVIDER } from "./fundamentals-provider";
import { FfCalendarFundamentalsProvider } from "./ff-calendar.provider";
import { NewsIntelligenceService } from "./news-intelligence.service";

@Module({
  controllers: [FundamentalsController],
  providers: [
    FundamentalsService,
    NewsIntelligenceService,
    FfCalendarFundamentalsProvider,
    {
      provide: FUNDAMENTALS_PROVIDER,
      useExisting: FfCalendarFundamentalsProvider,
    },
  ],
  exports: [FundamentalsService],
})
export class FundamentalsModule {}
