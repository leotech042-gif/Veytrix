import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from "@nestjs/common";
import type { ChartTimeframe } from "@veytrix/shared";
import { MarketDataService } from "./market-data.service";

const timeframes = new Set<string>([
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
  "W1",
]);

function isChartTimeframe(value: string | undefined): value is ChartTimeframe {
  return value !== undefined && timeframes.has(value);
}

@Controller("market-data")
export class MarketDataController {
  constructor(
    @Inject(MarketDataService)
    private readonly marketData: MarketDataService,
  ) {}

  @Get("status")
  getStatus() {
    return this.marketData.getStatus();
  }

  @Get("instruments")
  getInstruments() {
    return this.marketData.getInstruments();
  }

  @Get("quotes")
  getQuotes() {
    return this.marketData.getQuotes();
  }

  @Get("history")
  getHistory(
    @Query("instrument") instrument: string | undefined,
    @Query("timeframe") timeframe: string | undefined,
  ) {
    if (
      !instrument ||
      !/^[A-Za-z0-9._/-]{3,30}$/.test(instrument) ||
      !isChartTimeframe(timeframe)
    ) {
      throw new BadRequestException({
        code: "INVALID_HISTORY_QUERY",
        message:
          "Provide a valid instrument symbol and timeframe (M1, M5, M15, M30, H1, H4, D1, or W1).",
      });
    }

    return this.marketData.getHistory(instrument, timeframe);
  }
}
