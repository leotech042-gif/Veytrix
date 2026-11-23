import { Module } from "@nestjs/common";
import { FundamentalsController } from "./fundamentals.controller";
import { FundamentalsService } from "./fundamentals.service";
import { FUNDAMENTALS_PROVIDER } from "./fundamentals-provider";
import { FxMacroDataFundamentalsProvider } from "./fxmacrodata-fundamentals.provider";

@Module({
  controllers: [FundamentalsController],
  providers: [
    FundamentalsService,
    {
      provide: FUNDAMENTALS_PROVIDER,
      useClass: FxMacroDataFundamentalsProvider,
    },
  ],
  exports: [FundamentalsService],
})
export class FundamentalsModule {}
