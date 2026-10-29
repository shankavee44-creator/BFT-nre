import { supabase } from './supabase';
import { Candle, AssetInfo, AssetCategory } from '../types';
import { normalizeAssetSymbol } from './storage';
import { getOrCreateMasterHistory, setMarketBroadcastListener } from './priceFeedEngine';


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
  private assetSubscription: ReturnType<typeof supabase.channel> | null = null;
  private listeners: Set<MarketTickCallback> = new Set();
  private lastBroadcastMs: Record<string, number> = {};
  private isSubscribed = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initRealtimeChannel();
      // Register this instance as the global broadcast handler for the price engine
      setMarketBroadcastListener((payload) => this.broadcastTick(payload));
    }
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
   * Fetches all 250+ assets directly from Supabase 'otc_assets' table.
   */
  public async fetchAllOtcAssets(): Promise<AssetInfo[]> {
    try {
      const { data, error } = await supabase
        .from('otc_assets')
        .select('*')
        .order('symbol', { ascending: true });

      if (error) throw error;
      if (!data) return [];

      return data.map((item: any) => {
        const symbol = item.symbol || 'UNKNOWN';
        return {
          symbol,
          name: item.name || symbol,
          payout: Number(item.payout_rate) || 92,
          category: (item.category as AssetCategory) || 'OTC',
          basePrice: Number(item.current_price) || 1.0,
          volatility: Number(item.volatility) || 0.00012,
          pipDecimals: Number(item.pip_decimals) || (symbol.includes('JPY') ? 3 : symbol.includes('/') ? 5 : 2),
          flag: item.flag || '📈',
        };
      });
    } catch (err) {
      console.error('Failed to fetch OTC assets from Supabase:', err);
      return [];
    }
  }

  /**
   * Enables Global Realtime Sync: Subscribes to 'otc_assets' table updates so every visitor
   * sees the exact same price movement simultaneously.
   */
  public initGlobalMarketSync(onUpdate?: (asset: Partial<AssetInfo>) => void) {
    if (typeof window === 'undefined') return;
    if (this.assetSubscription) return;

    this.assetSubscription = supabase
      .channel('global-otc-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'otc_assets' },
        (payload) => {
          const updated = payload.new;
          if (!updated || !updated.symbol) return;

          const price = Number(updated.current_price);
          if (Number.isNaN(price)) return;

          const payout = updated.payout_rate ? Number(updated.payout_rate) : undefined;
          
          // Apply to local market engine
          const store = getOrCreateMasterHistory({ symbol: updated.symbol } as AssetInfo);
          if (store) {
            store.prevPrice = store.lastPrice;
            store.lastPrice = price;
          }

          // Notify UI components
          this.notifySubscribers({
            symbol: updated.symbol,
            price: price,
            prevPrice: store?.prevPrice || price,
            timestamp: Date.now(),
          });

          if (onUpdate) {
            onUpdate({
              symbol: updated.symbol,
              payout: payout,
              basePrice: price,
            });
          }
        }
      )
      .subscribe();
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

    // Persist snapshot to Supabase DB asynchronously (throttled every 3s in browser runtime)
    // Note: If prices are managed by a backend cron/edge function, this client-side persist
    // might be redundant, but we keep it as a fallback for user-driven ticks.
    if (
      typeof window !== 'undefined' &&
      (!this.lastBroadcastMs[`${symKey}:db`] || now - this.lastBroadcastMs[`${symKey}:db`] > 3000)
    ) {
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
    if (this.assetSubscription) {
      supabase.removeChannel(this.assetSubscription);
      this.assetSubscription = null;
    }
    this.listeners.clear();
  }
}

export const supabaseMarketSync = new SupabaseMarketSyncEngine();
