import { supabase } from './supabase';
import { Candle, AssetInfo, AssetCategory } from '../types';
import { normalizeAssetSymbol, findAssetBySymbol, DEFAULT_ASSETS } from './storage';
import { getOrCreateMasterHistory, setMarketBroadcastListener, appendLiveTick } from './priceFeedEngine';

export interface MarketTickPayload {
  symbol: string;
  price: number;
  prevPrice: number;
  timestamp: number;
  candle?: Candle;
}

export interface MarketSnapshot {
  symbol: string;
  lastPrice: number;
  prevPrice: number;
  updatedAt: number;
  candles5s?: Candle[];
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
   * Initializes REST polling against `/api/market/live-prices` instead of WebSockets
   * to prevent ERR_CONNECTION_TIMED_OUT errors in firewall/cloud environments.
   */
  public initRealtimeChannel() {
    if (this.pollInterval || typeof window === 'undefined') return;

    const pollServerPrices = async () => {
      try {
        const res = await fetch('/api/market/live-prices');
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && data.prices && typeof data.prices === 'object') {
          const now = Date.now();
          Object.entries(data.prices).forEach(([symbol, priceVal]) => {
            const price = Number(priceVal);
            if (!Number.isNaN(price) && price > 0) {
              this.handleRemoteTick({
                symbol,
                price,
                prevPrice: price,
                timestamp: now,
              });
            }
          });
        }
      } catch {
        // Fail silently
      }
    };

    pollServerPrices();
    this.pollInterval = setInterval(pollServerPrices, 2500);
  }

  /**
   * Returns all 268+ synchronized OTC assets and primes their live prices from `/api/market/live-prices`.
   */
  public async fetchAllOtcAssets(): Promise<AssetInfo[]> {
    try {
      const res = await fetch('/api/market/live-prices');
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data.prices && typeof data.prices === 'object') {
          for (const asset of DEFAULT_ASSETS) {
            const canonical = normalizeAssetSymbol(asset.symbol);
            const livePrice = Number(data.prices[canonical] ?? data.prices[asset.symbol]);
            if (!Number.isNaN(livePrice) && livePrice > 0) {
              appendLiveTick(asset, livePrice, true);
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
   * Synchronizes asset updates via REST polling (no WebSocket channels opened).
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
    const now = Date.now();

    this.notifySubscribers(payload);
    this.lastBroadcastMs[symKey] = now;
  }

  /**
   * Handles incoming remote ticks from server REST sync
   */
  private handleRemoteTick(payload: MarketTickPayload) {
    if (!payload || !payload.symbol || typeof payload.price !== 'number') return;

    const canonical = normalizeAssetSymbol(payload.symbol);
    const asset = findAssetBySymbol(canonical);
    if (asset) {
      appendLiveTick(asset, payload.price, true);
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
   * Fetches latest synchronized market state snapshot from `/api/market/live-prices`
   */
  public async fetchMarketSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    const canonical = normalizeAssetSymbol(symbol);
    try {
      const res = await fetch('/api/market/live-prices');
      if (res.ok) {
        const data = await res.json();
        const price = Number(data?.prices?.[canonical] ?? data?.prices?.[symbol]);
        if (!Number.isNaN(price) && price > 0) {
          return {
            symbol: canonical,
            lastPrice: price,
            prevPrice: price,
            updatedAt: Date.now(),
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
