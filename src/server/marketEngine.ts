import type { Candle, AssetInfo } from '../types/index.ts';
import { OTC_ASSETS_CATALOG } from '../utils/otcAssetsCatalog.ts';
import {
  computeSynchronizedTickAtTime,
  computeDeterministicCandleForBucket,
  getAssetTimeOffsetMs,
} from '../utils/priceFeedEngine.ts';
import { findAssetBySymbol, normalizeAssetSymbol } from '../utils/storage.ts';

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

export interface ServerMarketSnapshot {
  ok: true;
  serverTime: number;
  symbol: string;
  timeframeSeconds: number;
  price: number;
  prevPrice: number;
  activeCandle: Candle;
  candles: Candle[];
  source: string;
}

export type ServerBatchTickListener = (payload: {
  serverTime: number;
  prices: Record<string, number>;
}) => void;

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
  private prevPrices: Map<string, number> = new Map();
  private listeners: Set<ServerBatchTickListener> = new Set();
  private feedSource: string = 'synchronized_global_realtime_engine';
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

  private setSymbolPriceVariants(symbol: string, price: number, prevPrice: number) {
    this.currentPrices.set(symbol, price);
    this.prevPrices.set(symbol, prevPrice);
    const clean = symbol.replace(/\s*\(OTC\)/i, '').trim();
    this.currentPrices.set(clean, price);
    this.prevPrices.set(clean, prevPrice);
    if (clean.endsWith('/USD')) {
      this.currentPrices.set(`${clean}T`, price);
      this.prevPrices.set(`${clean}T`, prevPrice);
    }
  }

  public async start() {
    this.broadcastBatch();
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => this.broadcastBatch(), 250);
  }

  public subscribe(listener: ServerBatchTickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getPrice(symbol: string): number | undefined {
    const now = Date.now();
    const matched = findAssetBySymbol(symbol);
    if (matched) {
      const snap = computeSynchronizedTickAtTime(matched, now);
      this.setSymbolPriceVariants(matched.symbol, snap.price, snap.open);
      return snap.price;
    }
    if (this.currentPrices.has(symbol)) return this.currentPrices.get(symbol);
    return undefined;
  }

  public getMarketSnapshot(
    symbol: string,
    timeframeSeconds: number = 60,
    count: number = 250
  ): ServerMarketSnapshot {
    const now = Date.now();
    const canonical = normalizeAssetSymbol(symbol);
    const asset = findAssetBySymbol(canonical);
    const tf = Math.max(5, Number(timeframeSeconds) || 60);
    const tfMs = tf * 1000;
    const safeCount = Math.max(10, Math.min(1500, Number(count) || 250));

    const snap5s = computeSynchronizedTickAtTime(asset, now);
    this.setSymbolPriceVariants(asset.symbol, snap5s.price, snap5s.open);

    const offsetMs = getAssetTimeOffsetMs(canonical, tf);
    const currentBucketTime = Math.floor((now + offsetMs) / tfMs) * tfMs - offsetMs;
    const startBucketTime = currentBucketTime - (safeCount - 1) * tfMs;

    const candles: Candle[] = new Array(safeCount);
    for (let i = 0; i < safeCount; i++) {
      const bTime = startBucketTime + i * tfMs;
      const isLast = i === safeCount - 1;
      candles[i] = computeDeterministicCandleForBucket(
        asset,
        tf,
        bTime,
        isLast,
        isLast ? snap5s.price : undefined,
        now
      );
    }

    const activeCandle = candles[candles.length - 1];

    return {
      ok: true,
      serverTime: now,
      symbol: asset.symbol,
      timeframeSeconds: tf,
      price: snap5s.price,
      prevPrice: activeCandle.open,
      activeCandle,
      candles,
      source: this.feedSource,
    };
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
   * Synchronizes all 268+ assets simultaneously using the authoritative server UTC clock.
   */
  private broadcastBatch() {
    const now = Date.now();
    for (const asset of this.assets) {
      const snap = computeSynchronizedTickAtTime(asset, now);
      this.setSymbolPriceVariants(asset.symbol, snap.price, snap.open);
    }

    if (this.listeners.size > 0) {
      const snapshotPrices: Record<string, number> = {};
      for (const [k, v] of this.currentPrices.entries()) {
        snapshotPrices[k] = v;
      }
      for (const listener of this.listeners) {
        try {
          listener({ serverTime: now, prices: snapshotPrices });
        } catch {
          // ignore listener error
        }
      }
    }
  }

  public stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.listeners.clear();
  }
}
