import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import { BacktestingService } from "./backtesting.service";

@Controller("backtesting")
export class BacktestingController {
  constructor(
    @Inject(BacktestingService) private readonly backtesting: BacktestingService,
  ) {}

  @Get("run")
  run(
    @Query("instrument") instrument?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    if (!instrument || !from || !to) {
      throw new BadRequestException({
        code: "MISSING_BACKTEST_PARAMETERS",
        message: "Provide instrument, from and to.",
      });
    }
    return this.backtesting.run(instrument, from, to);
  }
}
