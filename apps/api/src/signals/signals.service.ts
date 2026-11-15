import { Inject, Injectable } from "@nestjs/common";
import type { SignalProviderStatus, TradingSignal } from "@veytrix/shared";
import {
  SIGNAL_PROVIDER,
  type SignalProvider,
  type SignalQuery,
} from "./signal-provider";

@Injectable()
export class SignalsService {
  constructor(
    @Inject(SIGNAL_PROVIDER)
    private readonly provider: SignalProvider,
  ) {}

  getStatus(): SignalProviderStatus | Promise<SignalProviderStatus> {
    return this.provider.getStatus();
  }

  getSignals(query?: SignalQuery): Promise<readonly TradingSignal[]> {
    return this.provider.getSignals(query);
  }
}
