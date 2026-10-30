import type { Candle, AssetInfo } from '../types/index.ts';
import { OTC_ASSETS_CATALOG } from '../utils/otcAssetsCatalog.ts';
import { computeSynchronizedTickAtTime } from '../utils/priceFeedEngine.ts';
import { findAssetBySymbol } from '../utils/storage.ts';

export type MarketRegime =
  | 'bullish_trend'
  | 'bearish_trend'
  | 'consolidation'
  | 'volatile_breakout'
  | 'mean_reverting';

export interface MarketTickPayload {
  symbol: string;
  price: number;
  prevPrice: number;
  timestamp: number;
  candle?: Candle;
}

/**
 * Computes the synchronized market tick for any of the 268+ assets at timestamp `nowMs`.
 */
export function calculateMarketTick(asset: AssetInfo, nowMs: number = Date.now()): MarketTickPayload {
  const snap = computeSynchronizedTickAtTime(asset, nowMs);
  return {
    symbol: asset.symbol,
    price: snap.price,
    prevPrice: snap.open,
    timestamp: nowMs,
    candle: {
      time: snap.bucketTime,
      open: snap.open,
      high: snap.high,
      low: snap.low,
      close: snap.close,
      volume: 100,
    },
  };
}

export class BackendMarketEngine {
  private assets: AssetInfo[] = [...OTC_ASSETS_CATALOG];
  private tickInterval: NodeJS.Timeout | null = null;
  private currentPrices: Map<string, number> = new Map();
  private feedSource: string = 'synchronized_server_rest_engine';
  private forexRates: Record<string, number> = {
    EUR: 1.0845,
    GBP: 1.2921,
    JPY: 154.25,
    CHF: 0.8872,
    CAD: 1.3912,
    AUD: 0.6542,
    NZD: 0.5984,
    XAU: 2742.5,
    XAG: 31.85,
    WTI: 71.4,
  };

  constructor() {
    this.broadcastBatch();
  }

  private setSymbolPriceVariants(symbol: string, price: number) {
    this.currentPrices.set(symbol, price);
    const clean = symbol.replace(/\s*\(OTC\)/i, '').trim();
    this.currentPrices.set(clean, price);
    if (clean.endsWith('/USD')) {
      this.currentPrices.set(`${clean}T`, price);
    }
  }

  public async start() {
    this.broadcastBatch();
    this.tickInterval = setInterval(() => this.broadcastBatch(), 1000);
  }

  public getPrice(symbol: string): number | undefined {
    if (this.currentPrices.has(symbol)) return this.currentPrices.get(symbol);
    const matched = findAssetBySymbol(symbol);
    if (matched) {
      const snap = computeSynchronizedTickAtTime(matched, Date.now());
      this.setSymbolPriceVariants(matched.symbol, snap.price);
      return snap.price;
    }
    return undefined;
  }

  public getAllPrices(): Record<string, number> {
    this.broadcastBatch();
    const res: Record<string, number> = {};
    for (const [k, v] of this.currentPrices.entries()) {
      res[k] = v;
    }
    return res;
  }

  public getForexRates(): Record<string, number> {
    return { ...this.forexRates };
  }

  public getFeedSource(): string {
    return this.feedSource;
  }

  /**
   * Synchronizes all 268+ assets simultaneously every second using the deterministic UTC clock.
   */
  private broadcastBatch() {
    const now = Date.now();
    for (const asset of this.assets) {
      const snap = computeSynchronizedTickAtTime(asset, now);
      this.setSymbolPriceVariants(asset.symbol, snap.price);
    }
  }

  public stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }
}
