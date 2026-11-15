import {
  Inject,
  Injectable,
  NotImplementedException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  ChartTimeframe,
  MarketCandle,
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
} from "@veytrix/shared";
import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
} from "./market-data-provider";

@Injectable()
export class MarketDataService {
  constructor(
    @Optional()
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider?: MarketDataProvider,
  ) {}

  async getStatus(): Promise<MarketDataStatus> {
    if (this.provider) {
      return this.provider.getStatus();
    }

    return {
      state: "unconfigured",
      provider: null,
      message:
        "No market-data provider is configured. Select and authorize a provider to enable quotes.",
    };
  }

  async getQuotes(): Promise<readonly MarketQuote[]> {
    if (!this.provider) {
      throw new ServiceUnavailableException({
        code: "MARKET_DATA_UNCONFIGURED",
        message:
          "No market-data provider is configured. Quotes are unavailable until a provider is integrated.",
      });
    }

    return this.provider.getQuotes();
  }

  async getInstruments(): Promise<readonly MarketInstrument[]> {
    if (!this.provider) {
      throw new ServiceUnavailableException({
        code: "MARKET_DATA_UNCONFIGURED",
        message:
          "Instrument discovery is unavailable until a market-data provider is configured.",
      });
    }

    if (!this.provider.getInstruments) {
      throw new NotImplementedException({
        code: "INSTRUMENT_DISCOVERY_UNSUPPORTED",
        message: "The configured provider does not support instrument discovery.",
      });
    }

    return this.provider.getInstruments();
  }

  async getHistory(
    instrument: string,
    timeframe: ChartTimeframe,
  ): Promise<readonly MarketCandle[]> {
    if (!this.provider) {
      throw new ServiceUnavailableException({
        code: "MARKET_DATA_UNCONFIGURED",
        message:
          "Historical candles are unavailable until a market-data provider is configured.",
      });
    }

    if (!this.provider.getHistory) {
      throw new NotImplementedException({
        code: "HISTORICAL_DATA_UNSUPPORTED",
        message: "The configured provider does not support historical candles.",
      });
    }

    return this.provider.getHistory(instrument, timeframe);
  }
}
