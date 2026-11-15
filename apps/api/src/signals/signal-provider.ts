import type { SignalProviderStatus, TradingSignal } from "@veytrix/shared";

export const SIGNAL_PROVIDER = Symbol("SIGNAL_PROVIDER");

export type SignalQuery = {
  /** Single pair search — deep analysis */
  instrument?: string;
  /** Favourite symbols only — light/cached scan */
  favorites?: string[];
};

export interface SignalProvider {
  getStatus(): SignalProviderStatus | Promise<SignalProviderStatus>;
  getSignals(query?: SignalQuery): Promise<readonly TradingSignal[]>;
}
