import type {
  ChartTimeframe,
  MarketCandle,
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
} from "@veytrix/shared";

export const MARKET_DATA_PROVIDER = Symbol("MARKET_DATA_PROVIDER");

export interface MarketDataProvider {
  getStatus(): MarketDataStatus | Promise<MarketDataStatus>;
  getInstruments?(): Promise<readonly MarketInstrument[]>;
  getQuotes(): Promise<readonly MarketQuote[]>;
  getHistory?(
    instrument: string,
    timeframe: ChartTimeframe,
  ): Promise<readonly MarketCandle[]>;
}
