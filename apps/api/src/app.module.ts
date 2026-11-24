import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { HealthController } from "./health.controller";
import { MarketDataController } from "./market-data/market-data.controller";
import { MarketDataService } from "./market-data/market-data.service";
import { MARKET_DATA_PROVIDER } from "./market-data/market-data-provider";
import { TiingoMarketDataProvider } from "./market-data/tiingo-market-data.provider";
import { SignalsController } from "./signals/signals.controller";
import { SignalsService } from "./signals/signals.service";
import { SIGNAL_PROVIDER } from "./signals/signal-provider";
import { TechnicalSignalProvider } from "./signals/technical-signal.provider";
import { FundamentalsModule } from "./fundamentals/fundamentals.module";
import { AlertsHub } from "./alerts/alerts.hub";
import { AlertsScanner } from "./alerts/alerts.scanner";
import { BacktestingModule } from "./backtesting/backtesting.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    FundamentalsModule,
    BacktestingModule,
  ],
  controllers: [HealthController, MarketDataController, SignalsController],
  providers: [
    MarketDataService,
    SignalsService,
    {
      provide: MARKET_DATA_PROVIDER,
      useClass: TiingoMarketDataProvider,
    },
    TechnicalSignalProvider,
    {
      provide: SIGNAL_PROVIDER,
      useExisting: TechnicalSignalProvider,
    },
    AlertsHub,
    AlertsScanner,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
