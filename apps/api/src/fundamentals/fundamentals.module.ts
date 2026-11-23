import { Module } from "@nestjs/common";
import { FundamentalsController } from "./fundamentals.controller";
import { FundamentalsService } from "./fundamentals.service";
import { FUNDAMENTALS_PROVIDER } from "./fundamentals-provider";
import { FinnhubFundamentalsProvider } from "./finnhub-fundamentals.provider";
import { FfCalendarFundamentalsProvider } from "./ff-calendar.provider";

/**
 * Default: free Forex Factory calendar (no key).
 * Set FUNDAMENTALS_PROVIDER=finnhub + FINNHUB_API_KEY to use Finnhub instead.
 */
const useFinnhub =
  process.env.FUNDAMENTALS_PROVIDER?.trim().toLowerCase() === "finnhub";

@Module({
  controllers: [FundamentalsController],
  providers: [
    FundamentalsService,
    FfCalendarFundamentalsProvider,
    FinnhubFundamentalsProvider,
    {
      provide: FUNDAMENTALS_PROVIDER,
      useExisting: useFinnhub
        ? FinnhubFundamentalsProvider
        : FfCalendarFundamentalsProvider,
    },
  ],
  exports: [FundamentalsService],
})
export class FundamentalsModule {}
