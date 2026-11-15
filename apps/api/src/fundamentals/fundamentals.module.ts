import { Module } from "@nestjs/common";
import { FundamentalsController } from "./fundamentals.controller";
import { FundamentalsService } from "./fundamentals.service";
import { FUNDAMENTALS_PROVIDER } from "./fundamentals-provider";
import { FinnhubFundamentalsProvider } from "./finnhub-fundamentals.provider";

@Module({
  controllers: [FundamentalsController],
  providers: [
    FundamentalsService,
    {
      provide: FUNDAMENTALS_PROVIDER,
      useClass: FinnhubFundamentalsProvider,
    },
  ],
  exports: [FundamentalsService],
})
export class FundamentalsModule {}
