import { supabase } from './supabase';
import { Candle, AssetInfo } from '../types';
import { normalizeAssetSymbol } from './storage';
import { getOrCreateMasterHistory } from './priceFeedEngine';


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
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private listeners: Set<MarketTickCallback> = new Set();
  private lastBroadcastMs: Record<string, number> = {};
  private isSubscribed = false;

  constructor() {
    this.initRealtimeChannel();
  }

  /**
   * Initializes the Supabase Realtime broadcast channel for high-frequency market tick sync across devices.
   */
  public initRealtimeChannel() {
    if (this.channel) return;

    try {
      this.channel = supabase.channel('market-live-feed', {
        config: {
          broadcast: { self: true },
        },
      });

      this.channel
        .on('broadcast', { event: 'price_tick' }, (response) => {
          if (response?.payload) {
            const payload = response.payload as MarketTickPayload;
            this.handleRemoteTick(payload);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.isSubscribed = true;
          }
        });
    } catch (e) {
      console.warn('Supabase Realtime channel init failed, using fail-safe sync mode:', e);
    }
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
   * Broadcasts a live market price tick to all connected tabs/devices via Supabase Realtime
   */
  public async broadcastTick(payload: MarketTickPayload): Promise<void> {
    const symKey = normalizeAssetSymbol(payload.symbol);
    const now = Date.now();

    // Notify local subscribers immediately
    this.notifySubscribers(payload);

    // Rate-limit network broadcast to max once every 80ms per asset to prevent WebSocket congestion
    if (this.lastBroadcastMs[symKey] && now - this.lastBroadcastMs[symKey] < 80) {
      return;
    }
    this.lastBroadcastMs[symKey] = now;

    if (this.channel && this.isSubscribed) {
      try {
        await this.channel.send({
          type: 'broadcast',
          event: 'price_tick',
          payload,
        });
      } catch (err) {
        // Fallback silently if broadcast fails
      }
    }

    // Persist snapshot to Supabase DB asynchronously (throttled every 3s)
    if (!this.lastBroadcastMs[`${symKey}:db`] || now - this.lastBroadcastMs[`${symKey}:db`] > 3000) {
      this.lastBroadcastMs[`${symKey}:db`] = now;
      this.persistSnapshotToSupabase(payload);
    }
  }

  /**
   * Handles incoming remote ticks from other clients/devices received via Supabase Realtime
   */
  private handleRemoteTick(payload: MarketTickPayload) {
    if (!payload || !payload.symbol || typeof payload.price !== 'number') return;

    // Apply remote tick to local market store
    const canonical = normalizeAssetSymbol(payload.symbol);
    const store = getOrCreateMasterHistory({ symbol: canonical } as AssetInfo);
    if (store) {
      store.prevPrice = store.lastPrice;
      store.lastPrice = payload.price;
    }

    // Notify local UI subscribers
    this.notifySubscribers(payload);
  }

  private notifySubscribers(payload: MarketTickPayload) {
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error('Error in market tick listener:', err);
      }
    });
  }

  /**
   * Persists market state snapshot to Supabase database table 'market_prices'
   */
  public async persistSnapshotToSupabase(payload: MarketTickPayload): Promise<void> {
    try {
      await supabase.from('market_prices').upsert(
        {
          symbol: normalizeAssetSymbol(payload.symbol),
          last_price: payload.price,
          prev_price: payload.prevPrice,
          updated_at: new Date(payload.timestamp).toISOString(),
        },
        { onConflict: 'symbol' }
      );
    } catch (e) {
      // Graceful fallback if table is unavailable
    }
  }

  /**
   * Fetches latest synchronized market state snapshot from Supabase
   */
  public async fetchMarketSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    const canonical = normalizeAssetSymbol(symbol);
    try {
      const { data, error } = await supabase
        .from('market_prices')
        .select('*')
        .eq('symbol', canonical)
        .maybeSingle();

      if (error || !data) return null;

      return {
        symbol: data.symbol,
        lastPrice: Number(data.last_price),
        prevPrice: Number(data.prev_price),
        updatedAt: new Date(data.updated_at).getTime(),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Disconnects and cleans up channel resources
   */
  public cleanup() {
    if (this.channel) {
      try {
        supabase.removeChannel(this.channel);
      } catch (e) {
        // Ignore cleanup errors
      }
      this.channel = null;
      this.isSubscribed = false;
    }
    this.listeners.clear();
  }
}

export const supabaseMarketSync = new SupabaseMarketSyncEngine();
