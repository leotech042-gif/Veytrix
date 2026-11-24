import { Module } from "@nestjs/common";
import { MarketDataService } from "./market-data.service";
import { MARKET_DATA_PROVIDER } from "./market-data-provider";
import { TiingoMarketDataProvider } from "./tiingo-market-data.provider";

@Module({
  providers: [
    MarketDataService,
    {
      provide: MARKET_DATA_PROVIDER,
      useClass: TiingoMarketDataProvider,
    },
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
