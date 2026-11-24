import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { HealthController } from "./health.controller";
import { MarketDataController } from "./market-data/market-data.controller";
import { SignalsController } from "./signals/signals.controller";
import { SignalsService } from "./signals/signals.service";
import { SIGNAL_PROVIDER } from "./signals/signal-provider";
import { TechnicalSignalProvider } from "./signals/technical-signal.provider";
import { FundamentalsModule } from "./fundamentals/fundamentals.module";
import { AlertsHub } from "./alerts/alerts.hub";
import { AlertsScanner } from "./alerts/alerts.scanner";
import { BacktestingModule } from "./backtesting/backtesting.module";
import { MarketDataModule } from "./market-data/market-data.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    FundamentalsModule,
    MarketDataModule,
    BacktestingModule,
  ],
  controllers: [HealthController, MarketDataController, SignalsController],
  providers: [
    SignalsService,
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
