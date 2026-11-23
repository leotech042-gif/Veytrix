import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { TradingSignal } from "@veytrix/shared";
import { FundamentalsService } from "../fundamentals/fundamentals.service";
import { MarketDataService } from "../market-data/market-data.service";
import { SignalsService } from "../signals/signals.service";
import { AlertsHub } from "./alerts.hub";
import type { AlertEvent } from "./alerts.types";

type TrackedSetup = {
  signalId: string;
  instrument: string;
  direction: "bullish" | "bearish" | "neutral";
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  entryHit: boolean;
  slHit: boolean;
  tpHit: boolean;
};

@Injectable()
export class AlertsScanner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsScanner.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly emitted = new Set<string>();
  private readonly tracked = new Map<string, TrackedSetup>();
  private readonly defaultPairs = [
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "XAUUSD",
    "AUDUSD",
    "USDCAD",
  ];

  constructor(
    private readonly hub: AlertsHub,
    private readonly signals: SignalsService,
    private readonly fundamentals: FundamentalsService,
    private readonly marketData: MarketDataService,
  ) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 20_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(alert: AlertEvent) {
    if (this.emitted.has(alert.id)) return;
    this.emitted.add(alert.id);
    // keep set bounded
    if (this.emitted.size > 500) {
      const first = this.emitted.values().next().value;
      if (first) this.emitted.delete(first);
    }
    this.hub.broadcast(alert);
  }

  private async tick() {
    try {
      await this.scanSignals();
    } catch (err) {
      this.logger.debug(`Signal scan skipped: ${String(err)}`);
    }

    try {
      await this.scanQuotes();
    } catch (err) {
      this.logger.debug(`Quote scan skipped: ${String(err)}`);
    }

    try {
      await this.scanNews();
    } catch (err) {
      this.logger.debug(`News scan skipped: ${String(err)}`);
    }
  }

  private async scanSignals() {
    const list = (await this.signals.getSignals({
      favorites: this.defaultPairs,
    })) as TradingSignal[];

    for (const s of list) {
      if (s.type !== "setup") continue;

      const setupId = `setup:${s.id}`;
      if (!this.emitted.has(setupId)) {
        const dir =
          s.direction === "bullish"
            ? "BUY"
            : s.direction === "bearish"
              ? "SELL"
              : "BIAS";
        this.emit({
          id: setupId,
          kind: "setup",
          title: `Setup · ${s.instrument}`,
          body: `${dir} ${s.timeframe}${s.entry != null ? ` · entry ${s.entry}` : ""}`,
          href: "/signals",
          createdAt: Date.now(),
          instrument: s.instrument,
        });
      }

      this.tracked.set(s.id, {
        signalId: s.id,
        instrument: s.instrument,
        direction: s.direction,
        entry: s.entry,
        stopLoss: s.stopLoss,
        takeProfit: s.takeProfit,
        entryHit: this.tracked.get(s.id)?.entryHit ?? false,
        slHit: this.tracked.get(s.id)?.slHit ?? false,
        tpHit: this.tracked.get(s.id)?.tpHit ?? false,
      });
    }
  }

  private async scanQuotes() {
    if (this.tracked.size === 0) return;
    const quotes = await this.marketData.getQuotes();
    const bySym = new Map(
      quotes.map((q) => [q.instrument.toUpperCase(), q] as const),
    );

    for (const setup of this.tracked.values()) {
      const q = bySym.get(setup.instrument.toUpperCase());
      if (!q) continue;
      const price = q.last ?? q.bid ?? q.ask;
      if (price == null || Number.isNaN(price)) continue;

      // Entry trigger
      if (setup.entry != null && !setup.entryHit) {
        const tol = Math.abs(setup.entry) * 0.00015 || 0.0001;
        if (Math.abs(price - setup.entry) <= tol) {
          setup.entryHit = true;
          this.emit({
            id: `trigger:${setup.signalId}`,
            kind: "trigger",
            title: `Price trigger · ${setup.instrument}`,
            body: `Price near entry ${setup.entry}`,
            href: `/charts?symbol=${encodeURIComponent(setup.instrument)}`,
            createdAt: Date.now(),
            instrument: setup.instrument,
          });
        }
      }

      // SL taken
      if (setup.stopLoss != null && !setup.slHit && setup.entryHit) {
        const hit =
          setup.direction === "bullish"
            ? price <= setup.stopLoss
            : setup.direction === "bearish"
              ? price >= setup.stopLoss
              : false;
        if (hit) {
          setup.slHit = true;
          this.emit({
            id: `sl:${setup.signalId}`,
            kind: "sl",
            title: `SL taken · ${setup.instrument}`,
            body: `Price ${price} hit stop ${setup.stopLoss}`,
            href: "/signals",
            createdAt: Date.now(),
            instrument: setup.instrument,
          });
        }
      }

      // TP taken
      if (setup.takeProfit != null && !setup.tpHit && setup.entryHit) {
        const hit =
          setup.direction === "bullish"
            ? price >= setup.takeProfit
            : setup.direction === "bearish"
              ? price <= setup.takeProfit
              : false;
        if (hit) {
          setup.tpHit = true;
          this.emit({
            id: `tp:${setup.signalId}`,
            kind: "tp",
            title: `TP taken · ${setup.instrument}`,
            body: `Price ${price} hit target ${setup.takeProfit}`,
            href: "/signals",
            createdAt: Date.now(),
            instrument: setup.instrument,
          });
        }
      }
    }
  }

  private async scanNews() {
    const events = await this.fundamentals.getCalendar();
    const now = Date.now();
    for (const ev of events) {
      if (ev.impact !== "high") continue;
      const t = new Date(ev.time).getTime();
      if (Number.isNaN(t)) continue;
      // Within next 2 hours or just released (past 15 min)
      if (t < now - 15 * 60_000 || t > now + 2 * 60 * 60_000) continue;

      const when = new Date(ev.time).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      this.emit({
        id: `news:${ev.id}`,
        kind: "news",
        title: `High impact · ${ev.currency ?? "Market"}`,
        body: `${ev.event} · ${when} — expect volatility`,
        href: "/fundamentals",
        createdAt: Date.now(),
      });
    }
  }
}
