import { Module } from "@nestjs/common";
import { MarketDataModule } from "../market-data/market-data.module";
import { BacktestingController } from "./backtesting.controller";
import { BacktestingService } from "./backtesting.service";

@Module({
  imports: [MarketDataModule],
  controllers: [BacktestingController],
  providers: [BacktestingService],
})
export class BacktestingModule {}
