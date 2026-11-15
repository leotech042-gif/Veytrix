import { Controller, Get, Inject, Query } from "@nestjs/common";
import { SignalsService } from "./signals.service";

@Controller("signals")
export class SignalsController {
  constructor(
    @Inject(SignalsService)
    private readonly signals: SignalsService,
  ) {}

  @Get("status")
  getStatus() {
    return this.signals.getStatus();
  }

  /**
   * GET /signals
   * GET /signals?instrument=XAUUSD
   * GET /signals?favorites=EURUSD,XAUUSD,GBPUSD
   */
  @Get()
  getSignals(
    @Query("instrument") instrument?: string,
    @Query("favorites") favorites?: string,
  ) {
    const favList = favorites
      ? favorites
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : undefined;

    return this.signals.getSignals({
      instrument: instrument?.trim().toUpperCase() || undefined,
      favorites: favList,
    });
  }
}
