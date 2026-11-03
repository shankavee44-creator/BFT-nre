import type { Candle, AssetInfo } from '../types/index.ts';
import { normalizeAssetSymbol, findAssetBySymbol, DEFAULT_ASSETS } from './storage.ts';
import {
  setMarketBroadcastListener,
  appendLiveTick,
  setServerTimeOffset,
  getSynchronizedNowMs,
  syncAssetStoreWithServerTime,
} from './priceFeedEngine.ts';
import { safeJsonResponse } from './apiClient.ts';

export interface MarketTickPayload {
  symbol: string;
  price: number;
  prevPrice: number;
  timestamp: number;
  serverTime?: number;
  candle?: Candle;
}

export interface MarketSnapshot {
  symbol: string;
  lastPrice: number;
  prevPrice: number;
  updatedAt: number;
  serverTime?: number;
  activeCandle?: Candle;
  candles5s?: Candle[];
  candles?: Candle[];
}

export type MarketTickCallback = (payload: MarketTickPayload) => void;

export class SupabaseMarketSyncEngine {
  private listeners: Set<MarketTickCallback> = new Set();
  private lastBroadcastMs: Record<string, number> = {};
  private pollInterval: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initRealtimeChannel();
      setMarketBroadcastListener((payload) => this.broadcastTick(payload));
    }
  }

  /**
   * Initializes live server synchronization against `/api/market/live-prices` with `cache: 'no-store'`
   * and synchronizes the local clock offset with `serverTime`.
   */
  public initRealtimeChannel() {
    if (this.pollInterval || typeof window === 'undefined') return;

    const pollServerPrices = async () => {
      try {
        const res = await fetch(`/api/market/live-prices?_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await safeJsonResponse(res);
        if (data?.ok && data.prices && typeof data.prices === 'object') {
          if (data.serverTime || data.timestamp) {
            setServerTimeOffset(Number(data.serverTime || data.timestamp));
          }
          const now = getSynchronizedNowMs();
          Object.entries(data.prices).forEach(([symbol, priceVal]) => {
            const price = Number(priceVal);
            if (!Number.isNaN(price) && price > 0) {
              this.handleRemoteTick({
                symbol,
                price,
                prevPrice: price,
                timestamp: now,
                serverTime: data.serverTime || now,
              });
            }
          });
        }
      } catch {
        // Fail silently
      }
    };

    pollServerPrices();
    this.pollInterval = setInterval(pollServerPrices, 2000);
  }

  /**
   * Returns all 268+ synchronized OTC assets and primes their live prices from `/api/market/live-prices`.
   */
  public async fetchAllOtcAssets(): Promise<AssetInfo[]> {
    try {
      const res = await fetch(`/api/market/live-prices?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await safeJsonResponse(res);
        if (data?.ok && data.prices && typeof data.prices === 'object') {
          if (data.serverTime || data.timestamp) {
            setServerTimeOffset(Number(data.serverTime || data.timestamp));
          }
          const now = getSynchronizedNowMs();
          for (const asset of DEFAULT_ASSETS) {
            const canonical = normalizeAssetSymbol(asset.symbol);
            const livePrice = Number(data.prices[canonical] ?? data.prices[asset.symbol]);
            if (!Number.isNaN(livePrice) && livePrice > 0) {
              appendLiveTick(asset, livePrice, true, now);
            }
          }
        }
      }
    } catch {
      // Fallback to default assets
    }
    return DEFAULT_ASSETS;
  }

  /**
   * Synchronizes asset updates via live server state.
   */
  public initGlobalMarketSync(_onUpdate?: (asset: Partial<AssetInfo>) => void) {
    this.initRealtimeChannel();
  }

  /**
   * Register a subscriber callback for synchronized live market ticks
   */
  public subscribeTicks(callback: MarketTickCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Dispatches a live market price tick to local subscribers
   */
  public async broadcastTick(payload: MarketTickPayload): Promise<void> {
    const symKey = normalizeAssetSymbol(payload.symbol);
    const now = getSynchronizedNowMs();

    this.notifySubscribers(payload);
    this.lastBroadcastMs[symKey] = now;
  }

  /**
   * Handles incoming remote ticks from server sync
   */
  private handleRemoteTick(payload: MarketTickPayload) {
    if (!payload || !payload.symbol || typeof payload.price !== 'number') return;

    const canonical = normalizeAssetSymbol(payload.symbol);
    const asset = findAssetBySymbol(canonical);
    if (asset) {
      appendLiveTick(asset, payload.price, true, payload.timestamp);
    }

    this.notifySubscribers(payload);
  }

  private notifySubscribers(payload: MarketTickPayload) {
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch {
        // ignore listener error
      }
    });
  }

  /**
   * No-op or lightweight persistence
   */
  public async persistSnapshotToSupabase(_payload: MarketTickPayload): Promise<void> {
    // Handled by backend SQLite & server memory cache
  }

  /**
   * Fetches latest synchronized market state snapshot from `/api/market/snapshot` (with no-store cache)
   */
  public async fetchMarketSnapshot(symbol: string, timeframeSeconds: number = 60): Promise<MarketSnapshot | null> {
    const canonical = normalizeAssetSymbol(symbol);
    const asset = findAssetBySymbol(canonical);
    try {
      const res = await fetch(
        `/api/market/snapshot?symbol=${encodeURIComponent(canonical)}&timeframe=${encodeURIComponent(
          String(timeframeSeconds)
        )}&count=250&_t=${Date.now()}`,
        {
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const data = await safeJsonResponse(res);
        const price = Number(data?.price);
        if (!Number.isNaN(price) && price > 0) {
          if (data?.serverTime) {
            setServerTimeOffset(Number(data.serverTime));
          }
          const syncedCandles = syncAssetStoreWithServerTime(
            asset,
            timeframeSeconds,
            data?.serverTime,
            price
          );
          return {
            symbol: canonical,
            lastPrice: price,
            prevPrice: Number(data?.prevPrice) || price,
            updatedAt: getSynchronizedNowMs(),
            serverTime: Number(data?.serverTime) || getSynchronizedNowMs(),
            activeCandle: data?.activeCandle,
            candles: syncedCandles,
          };
        }
      }
    } catch {
      // Fallback
    }
    return null;
  }

  /**
   * Cleans up polling resources
   */
  public cleanup() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.listeners.clear();
  }
}

export const supabaseMarketSync = new SupabaseMarketSyncEngine();
