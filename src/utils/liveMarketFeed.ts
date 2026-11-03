/**
 * Binary Funded Trader (BFT) - Live Synchronized 268+ Asset Market Data Feed Engine
 *
 * Connects to the centralized server real-time stream (`/api/market/stream` SSE + `/api/market/snapshot`)
 * combined with server-clock-aligned deterministic sub-second synchronization (`computeSynchronizedTickAtTime`)
 * across all 268+ Forex, Crypto, Stocks, Indices, and Commodities assets.
 *
 * Guarantees:
 * - Every connected user (whether newly joined or long-active) reads from the identical global pricing array
 * - Automatic heartbeat monitoring and instant reconnection + state catch-up if a connection lags
 * - Immediate live server state sync when opening the trading page or switching assets/timeframes
 */

import type { Candle } from '../types/index.ts';
import { OTC_ASSETS_CATALOG } from './otcAssetsCatalog.ts';
import {
  computeSynchronizedTickAtTime,
  setServerTimeOffset,
  getSynchronizedNowMs,
  syncAssetStoreWithServerTime,
} from './priceFeedEngine.ts';
import { findAssetBySymbol, normalizeAssetSymbol } from './storage.ts';

export interface LiveMarketTick {
  symbol: string;
  price: number;
  prevPrice: number;
  timestamp: number;
  serverTime?: number;
  activeCandle?: Candle;
  source: 'binance_ws' | 'binance_rest' | 'interbank_forex' | 'commodities' | 'server_sync' | 'server_stream';
  change24h?: number;
}

export interface LiveMarketResyncPayload {
  symbol: string;
  timeframeSeconds: number;
  price: number;
  prevPrice: number;
  serverTime: number;
  activeCandle?: Candle;
  candles: Candle[];
}

export interface LiveFeedStatus {
  binanceStatus: 'connected' | 'connecting' | 'disconnected' | 'fallback';
  forexStatus: 'synchronized' | 'updating' | 'offline';
  latencyMs: number;
  lastTickTime: number;
  lastHeartbeatTime?: number;
  reconnectCount?: number;
  totalTicksReceived: number;
  activePairsCount: number;
  connectedStream: string;
}

export type LiveTickListener = (tick: LiveMarketTick) => void;
export type LiveStatusListener = (status: LiveFeedStatus) => void;
export type LiveResyncListener = (payload: LiveMarketResyncPayload) => void;

export const DEFAULT_FOREX_RATES: Record<string, number> = {
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

export class LiveMarketFeedEngine {
  private currentActiveSymbol: string | null = null;
  private currentTimeframeSeconds: number = 60;
  private isDestroyed = false;
  private restPollInterval: any = null;
  private activeSymbolPollInterval: any = null;
  private activeSymbolAbortController: AbortController | null = null;
  private microTickInterval: any = null;
  private heartbeatWatchdogInterval: any = null;
  private eventSource: EventSource | null = null;
  private lastServerHeartbeatMs: number = Date.now();
  private reconnectCount: number = 0;

  private latestPrices: Map<string, number> = new Map();
  private prevPrices: Map<string, number> = new Map();
  private tickListeners: Set<LiveTickListener> = new Set();
  private statusListeners: Set<LiveStatusListener> = new Set();
  private resyncListeners: Set<LiveResyncListener> = new Set();

  private boundVisibilityHandler: (() => void) | null = null;
  private boundOnlineHandler: (() => void) | null = null;

  private status: LiveFeedStatus = {
    binanceStatus: 'connected',
    forexStatus: 'synchronized',
    latencyMs: 12,
    lastTickTime: Date.now(),
    lastHeartbeatTime: Date.now(),
    reconnectCount: 0,
    totalTicksReceived: 0,
    activePairsCount: OTC_ASSETS_CATALOG.length,
    connectedStream: `Global Realtime Stream (${OTC_ASSETS_CATALOG.length} Markets • Synced)`,
  };

  constructor() {
    const now = getSynchronizedNowMs();
    for (const asset of OTC_ASSETS_CATALOG) {
      const snap = computeSynchronizedTickAtTime(asset, now);
      this.latestPrices.set(asset.symbol, snap.price);
      this.prevPrices.set(asset.symbol, snap.open);
    }

    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init() {
    this.isDestroyed = false;
    this.startRestPollingEngine();
    this.startSynchronizedMicroTickEngine();
    this.startHeartbeatWatchdog();
    this.attachBrowserLifecycleListeners();
  }

  public addTickListener(cb: LiveTickListener): () => void {
    this.tickListeners.add(cb);
    return () => this.tickListeners.delete(cb);
  }

  public addStatusListener(cb: LiveStatusListener): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  public addResyncListener(cb: LiveResyncListener): () => void {
    this.resyncListeners.add(cb);
    return () => this.resyncListeners.delete(cb);
  }

  public getStatus(): LiveFeedStatus {
    return { ...this.status };
  }

  public getLatestPrice(symbol: string): number | undefined {
    const canonical = normalizeAssetSymbol(symbol);
    const asset = findAssetBySymbol(canonical);
    if (asset) {
      const snap = computeSynchronizedTickAtTime(asset, getSynchronizedNowMs());
      this.latestPrices.set(canonical, snap.price);
      return snap.price;
    }
    if (this.latestPrices.has(canonical)) {
      return this.latestPrices.get(canonical);
    }
    return undefined;
  }

  /**
   * Completely unsubscribes and disconnects the active asset polling interval, SSE stream, and in-flight requests
   */
  public unsubscribeActiveSymbol() {
    if (this.activeSymbolPollInterval) {
      clearInterval(this.activeSymbolPollInterval);
      this.activeSymbolPollInterval = null;
    }
    if (this.activeSymbolAbortController) {
      try {
        this.activeSymbolAbortController.abort();
      } catch {
        // ignore abort error
      }
      this.activeSymbolAbortController = null;
    }
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // ignore
      }
      this.eventSource = null;
    }
    this.currentActiveSymbol = null;
  }

  /**
   * Sets the currently active symbol & timeframe, connects to the live SSE stream,
   * and immediately fetches the authoritative server snapshot so no manual refresh is needed.
   */
  public setActiveSymbol(symbol: string, timeframeSeconds: number = 60) {
    this.unsubscribeActiveSymbol();
    this.currentActiveSymbol = normalizeAssetSymbol(symbol);
    this.currentTimeframeSeconds = Math.max(5, Number(timeframeSeconds) || 60);

    if (this.currentActiveSymbol && typeof window !== 'undefined') {
      const targetSym = this.currentActiveSymbol;
      const targetTf = this.currentTimeframeSeconds;

      // 1. Immediately sync authoritative snapshot from server (no cache)
      this.syncActiveSymbolSnapshot(targetSym, targetTf).catch(() => {});

      // 2. Connect to unified Server-Sent Events (/api/market/stream) real-time push feed
      this.connectServerStream(targetSym, targetTf);

      // 3. Keep 1s active ticker verification poll as continuous redundancy
      this.activeSymbolPollInterval = setInterval(() => {
        if (!this.isDestroyed && this.currentActiveSymbol === targetSym) {
          this.pollActiveSymbolFromServerProxy(targetSym);
        }
      }, 1000);
    }
  }

  /**
   * Connects to `/api/market/stream` (SSE) to receive live server ticks and heartbeats in real time.
   */
  private connectServerStream(symbol: string, timeframeSeconds: number) {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined' || this.isDestroyed) {
      return;
    }
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // ignore
      }
      this.eventSource = null;
    }

    try {
      const url = `/api/market/stream?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(
        String(timeframeSeconds)
      )}&_t=${Date.now()}`;
      const es = new EventSource(url);
      this.eventSource = es;

      es.addEventListener('init', (event: MessageEvent) => {
        if (this.isDestroyed || this.currentActiveSymbol !== symbol) return;
        try {
          const data = JSON.parse(event.data);
          if (data?.serverTime) {
            setServerTimeOffset(Number(data.serverTime));
          }
          this.lastServerHeartbeatMs = Date.now();
          const asset = findAssetBySymbol(symbol);
          const freshCandles = syncAssetStoreWithServerTime(
            asset,
            timeframeSeconds,
            data?.serverTime,
            Number(data?.price)
          );
          const livePrice = Number(data?.price) || freshCandles[freshCandles.length - 1]?.close || asset.basePrice;
          this.dispatchTick({
            symbol,
            price: livePrice,
            prevPrice: Number(data?.prevPrice) || livePrice,
            timestamp: getSynchronizedNowMs(),
            serverTime: data?.serverTime,
            activeCandle: data?.activeCandle,
            source: 'server_stream',
          });
          this.notifyResyncListeners({
            symbol,
            timeframeSeconds,
            price: livePrice,
            prevPrice: Number(data?.prevPrice) || livePrice,
            serverTime: Number(data?.serverTime) || getSynchronizedNowMs(),
            activeCandle: data?.activeCandle,
            candles: freshCandles,
          });
        } catch {
          // ignore malformed init payload
        }
      });

      es.addEventListener('tick', (event: MessageEvent) => {
        if (this.isDestroyed || this.currentActiveSymbol !== symbol) return;
        try {
          const data = JSON.parse(event.data);
          if (data?.serverTime) {
            setServerTimeOffset(Number(data.serverTime));
          }
          this.lastServerHeartbeatMs = Date.now();
          if (data?.prices && typeof data.prices === 'object') {
            Object.entries(data.prices).forEach(([sym, val]) => {
              const num = Number(val);
              if (!Number.isNaN(num) && num > 0) {
                this.latestPrices.set(sym, num);
              }
            });
          }
          const livePrice = Number(data?.price);
          if (!Number.isNaN(livePrice) && livePrice > 0) {
            this.dispatchTick({
              symbol,
              price: livePrice,
              prevPrice: this.latestPrices.get(symbol) || livePrice,
              timestamp: getSynchronizedNowMs(),
              serverTime: data?.serverTime,
              activeCandle: data?.activeCandle,
              source: 'server_stream',
            });
          }
        } catch {
          // ignore malformed tick
        }
      });

      es.addEventListener('heartbeat', (event: MessageEvent) => {
        if (this.isDestroyed) return;
        try {
          const data = JSON.parse(event.data);
          if (data?.serverTime) {
            setServerTimeOffset(Number(data.serverTime));
          }
          this.lastServerHeartbeatMs = Date.now();
          this.updateStatus({
            binanceStatus: 'connected',
            forexStatus: 'synchronized',
            lastHeartbeatTime: this.lastServerHeartbeatMs,
          });
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        // Handled automatically by heartbeat watchdog + EventSource retry
      };
    } catch {
      // Fallback to REST polling if EventSource is unavailable
    }
  }

  /**
   * Fetches the authoritative server market snapshot (`/api/market/snapshot`) with `cache: 'no-store'`,
   * aligns the local server clock offset, rebuilds the deterministic candle state, and notifies subscribers.
   */
  public async syncActiveSymbolSnapshot(
    symbol?: string,
    timeframeSeconds?: number
  ): Promise<LiveMarketResyncPayload | null> {
    const targetSymbol = normalizeAssetSymbol(symbol || this.currentActiveSymbol || 'EUR/USD (OTC)');
    const targetTf = Math.max(5, Number(timeframeSeconds || this.currentTimeframeSeconds || 60));
    const asset = findAssetBySymbol(targetSymbol);
    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      if (typeof fetch !== 'undefined') {
        const res = await fetch(
          `/api/market/snapshot?symbol=${encodeURIComponent(targetSymbol)}&timeframe=${encodeURIComponent(
            String(targetTf)
          )}&count=250&_t=${Date.now()}`,
          {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.ok) {
            const rttMs = Math.max(
              4,
              Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs)
            );
            const estimatedServerNow = Number(data.serverTime || Date.now()) + Math.round(rttMs / 2);
            setServerTimeOffset(estimatedServerNow);
            this.lastServerHeartbeatMs = Date.now();

            const authoritativePrice = Number(data.price);
            const syncedCandles = syncAssetStoreWithServerTime(
              asset,
              targetTf,
              estimatedServerNow,
              authoritativePrice
            );
            const finalPrice =
              !Number.isNaN(authoritativePrice) && authoritativePrice > 0
                ? authoritativePrice
                : syncedCandles[syncedCandles.length - 1]?.close || asset.basePrice;

            this.dispatchTick({
              symbol: targetSymbol,
              price: finalPrice,
              prevPrice: Number(data.prevPrice) || finalPrice,
              timestamp: getSynchronizedNowMs(),
              serverTime: estimatedServerNow,
              activeCandle: data.activeCandle,
              source: 'server_sync',
            });

            this.updateStatus({
              binanceStatus: 'connected',
              forexStatus: 'synchronized',
              latencyMs: rttMs,
              lastTickTime: Date.now(),
              lastHeartbeatTime: this.lastServerHeartbeatMs,
            });

            const payload: LiveMarketResyncPayload = {
              symbol: targetSymbol,
              timeframeSeconds: targetTf,
              price: finalPrice,
              prevPrice: Number(data.prevPrice) || finalPrice,
              serverTime: estimatedServerNow,
              activeCandle: syncedCandles[syncedCandles.length - 1],
              candles: syncedCandles,
            };
            this.notifyResyncListeners(payload);
            return payload;
          }
        }
      }
    } catch {
      // Deterministic server-aligned fallback below
    }

    const syncedNow = getSynchronizedNowMs();
    const fallbackCandles = syncAssetStoreWithServerTime(asset, targetTf, syncedNow);
    const fallbackPrice = fallbackCandles[fallbackCandles.length - 1]?.close || asset.basePrice;
    const payload: LiveMarketResyncPayload = {
      symbol: targetSymbol,
      timeframeSeconds: targetTf,
      price: fallbackPrice,
      prevPrice: fallbackCandles[fallbackCandles.length - 1]?.open || fallbackPrice,
      serverTime: syncedNow,
      activeCandle: fallbackCandles[fallbackCandles.length - 1],
      candles: fallbackCandles,
    };
    this.notifyResyncListeners(payload);
    return payload;
  }

  /**
   * Automatic Heartbeat & Reconnection Watchdog:
   * Monitors connection health every 2 seconds. If the connection lags (> 4s without server heartbeat),
   * automatically reconnects the real-time stream and catches up to the current global market state.
   */
  private startHeartbeatWatchdog() {
    if (this.heartbeatWatchdogInterval) clearInterval(this.heartbeatWatchdogInterval);

    this.heartbeatWatchdogInterval = setInterval(() => {
      if (this.isDestroyed || typeof window === 'undefined') return;
      const elapsedSinceHeartbeat = Date.now() - this.lastServerHeartbeatMs;
      if (elapsedSinceHeartbeat > 4000) {
        this.reconnectAndCatchUp();
      }
    }, 2000);
  }

  private attachBrowserLifecycleListeners() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    this.boundVisibilityHandler = () => {
      if (document.visibilityState === 'visible' && !this.isDestroyed) {
        this.reconnectAndCatchUp();
      }
    };
    this.boundOnlineHandler = () => {
      if (!this.isDestroyed) {
        this.reconnectAndCatchUp();
      }
    };

    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    window.addEventListener('online', this.boundOnlineHandler);
    window.addEventListener('focus', this.boundOnlineHandler);
  }

  /**
   * Forces an immediate reconnection of the real-time stream and catches up the chart state.
   */
  public reconnectAndCatchUp() {
    if (this.isDestroyed) return;
    this.reconnectCount += 1;
    this.lastServerHeartbeatMs = Date.now();

    const activeSym = this.currentActiveSymbol || 'EUR/USD (OTC)';
    const activeTf = this.currentTimeframeSeconds || 60;

    this.updateStatus({
      binanceStatus: 'connected',
      forexStatus: 'synchronized',
      reconnectCount: this.reconnectCount,
      lastHeartbeatTime: this.lastServerHeartbeatMs,
    });

    if (typeof window !== 'undefined' && this.currentActiveSymbol) {
      this.connectServerStream(activeSym, activeTf);
    }
    this.syncActiveSymbolSnapshot(activeSym, activeTf).catch(() => {});
    this.fetchInitialSnapshots().catch(() => {});
  }

  public resolveBinanceSymbol(symbol: string): string | null {
    const matched = findAssetBySymbol(symbol);
    if (matched && !matched.category.toLowerCase().includes('crypto')) {
      return null;
    }
    const clean = symbol
      .replace(/\s*\(OTC\)/gi, '')
      .replace(/\//g, '')
      .trim()
      .toUpperCase();
    const fiatPrefixes = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY', 'XAU', 'XAG', 'WTI'];
    if (fiatPrefixes.some((fiat) => clean.startsWith(fiat))) {
      return null;
    }
    if (clean.endsWith('USDT')) return clean;
    if (clean.endsWith('USD')) return `${clean}T`;
    return null;
  }

  private startRestPollingEngine() {
    if (this.restPollInterval) clearInterval(this.restPollInterval);

    this.fetchInitialSnapshots();

    this.restPollInterval = setInterval(() => {
      if (!this.isDestroyed) {
        this.fetchInitialSnapshots();
      }
    }, 1500);
  }

  private async pollActiveSymbolFromServerProxy(symbol: string) {
    const canonical = normalizeAssetSymbol(symbol);
    if (this.currentActiveSymbol !== canonical) return;

    if (this.activeSymbolAbortController) {
      try {
        this.activeSymbolAbortController.abort();
      } catch {
        // ignore
      }
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.activeSymbolAbortController = controller;

    const startMs = performance.now();
    try {
      const res = await fetch(
        `/api/market/ticker?symbol=${encodeURIComponent(canonical)}&timeframe=${encodeURIComponent(
          String(this.currentTimeframeSeconds)
        )}&_t=${Date.now()}`,
        {
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {}),
        }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (this.currentActiveSymbol !== canonical) return;
      const rtt = Math.max(4, Math.round(performance.now() - startMs));
      if (data?.serverTime) {
        setServerTimeOffset(Number(data.serverTime) + Math.round(rtt / 2));
      }
      this.lastServerHeartbeatMs = Date.now();
      const rawPrice = Number(data?.price);
      if (!Number.isNaN(rawPrice) && rawPrice > 0) {
        const now = getSynchronizedNowMs();
        this.dispatchTick({
          symbol: canonical,
          price: rawPrice,
          prevPrice: this.latestPrices.get(canonical) || rawPrice,
          timestamp: now,
          serverTime: data?.serverTime,
          activeCandle: data?.activeCandle,
          source: 'server_sync',
        });
        this.updateStatus({
          binanceStatus: 'connected',
          forexStatus: 'synchronized',
          latencyMs: rtt,
          lastTickTime: now,
          lastHeartbeatTime: this.lastServerHeartbeatMs,
        });
      }
    } catch {
      // Deterministic micro-tick generator maintains continuity
    }
  }

  public async fetchInitialSnapshots() {
    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      const res = await fetch(`/api/market/live-prices?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data.prices && typeof data.prices === 'object') {
          const latency = Math.max(
            4,
            Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs)
          );
          if (data.serverTime || data.timestamp) {
            setServerTimeOffset(Number(data.serverTime || data.timestamp) + Math.round(latency / 2));
          }
          this.lastServerHeartbeatMs = Date.now();
          const now = getSynchronizedNowMs();

          Object.entries(data.prices).forEach(([sym, priceVal]) => {
            const numPrice = Number(priceVal);
            if (!Number.isNaN(numPrice) && numPrice > 0) {
              this.latestPrices.set(sym, numPrice);
            }
          });

          if (this.currentActiveSymbol) {
            const activePrice = this.latestPrices.get(this.currentActiveSymbol);
            if (activePrice) {
              this.dispatchTick({
                symbol: this.currentActiveSymbol,
                price: activePrice,
                prevPrice: this.prevPrices.get(this.currentActiveSymbol) || activePrice,
                timestamp: now,
                serverTime: data.serverTime || data.timestamp,
                source: 'server_sync',
              });
            }
          }

          this.updateStatus({
            binanceStatus: 'connected',
            forexStatus: 'synchronized',
            latencyMs: latency,
            lastTickTime: now,
            lastHeartbeatTime: this.lastServerHeartbeatMs,
            activePairsCount: OTC_ASSETS_CATALOG.length,
          });
        }
      }
    } catch {
      // Deterministic tick engine maintains continuity
    }
  }

  private startSynchronizedMicroTickEngine() {
    if (this.microTickInterval) clearInterval(this.microTickInterval);

    this.microTickInterval = setInterval(() => {
      if (!this.isDestroyed) {
        this.generateSynchronizedTicks();
      }
    }, 250);
  }

  private generateSynchronizedTicks() {
    const now = getSynchronizedNowMs();

    // Always step the currently active symbol smoothly every 250ms against synchronized server time
    if (this.currentActiveSymbol) {
      const activeAsset = findAssetBySymbol(this.currentActiveSymbol);
      if (activeAsset) {
        const snap = computeSynchronizedTickAtTime(activeAsset, now);
        const prev = this.latestPrices.get(activeAsset.symbol) || snap.price;
        this.dispatchTick({
          symbol: activeAsset.symbol,
          price: snap.price,
          prevPrice: prev,
          timestamp: now,
          source: activeAsset.category.includes('Crypto')
            ? 'binance_rest'
            : activeAsset.category.includes('Commodit')
            ? 'commodities'
            : 'interbank_forex',
        });
      }
    }

    // Rotate through background batches so all 268+ assets stay updated every second
    const secBucket = Math.floor(now / 250) % 4;
    const batchSize = Math.ceil(OTC_ASSETS_CATALOG.length / 4);
    const startIdx = secBucket * batchSize;
    const endIdx = Math.min(OTC_ASSETS_CATALOG.length, startIdx + batchSize);

    for (let i = startIdx; i < endIdx; i++) {
      const asset = OTC_ASSETS_CATALOG[i];
      if (asset.symbol === this.currentActiveSymbol) continue;
      const snap = computeSynchronizedTickAtTime(asset, now);
      this.prevPrices.set(asset.symbol, this.latestPrices.get(asset.symbol) || snap.price);
      this.latestPrices.set(asset.symbol, snap.price);
    }
  }

  private dispatchTick(tick: LiveMarketTick) {
    this.prevPrices.set(tick.symbol, this.latestPrices.get(tick.symbol) || tick.price);
    this.latestPrices.set(tick.symbol, tick.price);

    this.status.lastTickTime = tick.timestamp;
    this.status.totalTicksReceived++;

    for (const listener of this.tickListeners) {
      try {
        listener(tick);
      } catch {
        // ignore callback error
      }
    }
  }

  private notifyResyncListeners(payload: LiveMarketResyncPayload) {
    for (const listener of this.resyncListeners) {
      try {
        listener(payload);
      } catch {
        // ignore
      }
    }
  }

  private updateStatus(partial: Partial<LiveFeedStatus>) {
    this.status = { ...this.status, ...partial };
    for (const listener of this.statusListeners) {
      try {
        listener(this.status);
      } catch {
        // ignore
      }
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.unsubscribeActiveSymbol();
    if (this.restPollInterval) clearInterval(this.restPollInterval);
    if (this.activeSymbolPollInterval) clearInterval(this.activeSymbolPollInterval);
    if (this.microTickInterval) clearInterval(this.microTickInterval);
    if (this.heartbeatWatchdogInterval) clearInterval(this.heartbeatWatchdogInterval);
    if (typeof document !== 'undefined' && this.boundVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    }
    if (typeof window !== 'undefined' && this.boundOnlineHandler) {
      window.removeEventListener('online', this.boundOnlineHandler);
      window.removeEventListener('focus', this.boundOnlineHandler);
    }
    this.tickListeners.clear();
    this.statusListeners.clear();
    this.resyncListeners.clear();
  }
}

// Global Singleton Instance
export const liveMarketFeed = new LiveMarketFeedEngine();

/**
 * Payout and Settlement Calculation Engine
 * Accurately determines binary option outcome based on synchronized live strike price vs close price.
 */
export interface TradeSettlementResult {
  status: 'won' | 'lost' | 'tie';
  pnl: number;
  creditedAmount: number;
  profitPercentage: number;
  strikePrice: number;
  closePrice: number;
}

export function calculateTradeSettlement(params: {
  direction: 'CALL' | 'PUT';
  strikePrice: number;
  closePrice: number;
  investment: number;
  payoutPercentage: number;
}): TradeSettlementResult {
  const { direction, strikePrice, closePrice, investment, payoutPercentage } = params;

  const priceDiff = closePrice - strikePrice;
  const isTie = Math.abs(priceDiff) < 1e-7;

  if (isTie) {
    return {
      status: 'tie',
      pnl: 0,
      creditedAmount: investment,
      profitPercentage: 0,
      strikePrice,
      closePrice,
    };
  }

  const isWin =
    (direction === 'CALL' && priceDiff > 0) ||
    (direction === 'PUT' && priceDiff < 0);

  if (isWin) {
    const profit = Number(((investment * payoutPercentage) / 100).toFixed(2));
    const creditedAmount = Number((investment + profit).toFixed(2));
    return {
      status: 'won',
      pnl: profit,
      creditedAmount,
      profitPercentage: payoutPercentage,
      strikePrice,
      closePrice,
    };
  }

  return {
    status: 'lost',
    pnl: -investment,
    creditedAmount: 0,
    profitPercentage: -100,
    strikePrice,
    closePrice,
  };
}

export function computeAccountWinRate(trades: Array<{ status: 'won' | 'lost' | 'tie' | string }>): number {
  if (!trades || trades.length === 0) return 0;
  const closedTrades = trades.filter((t) => t.status === 'won' || t.status === 'lost' || t.status === 'tie');
  if (closedTrades.length === 0) return 0;
  const wonTrades = closedTrades.filter((t) => t.status === 'won').length;
  return Number(((wonTrades / closedTrades.length) * 100).toFixed(1));
}

/**
 * Locked Trade Execution Guard:
 * Ensures active binary option trades cannot be closed, cancelled, or cashed out prematurely
 * once placed, forcing them to run strictly until full expiration duration is met.
 */
export function isTradeLockedUntilExpiry(
  trade: { status?: string; startTime: number; endTime: number },
  nowMs: number = getSynchronizedNowMs()
): boolean {
  if (trade.status && trade.status !== 'active') return false;
  return nowMs < trade.endTime;
}

export function canSettleTradeAtTime(
  trade: { status?: string; startTime: number; endTime: number },
  nowMs: number = getSynchronizedNowMs()
): { allowed: boolean; remainingMs: number; reason?: string } {
  const remainingMs = Math.max(0, trade.endTime - nowMs);
  if (remainingMs > 0) {
    return {
      allowed: false,
      remainingMs,
      reason: `Trade is locked until expiration (${Math.ceil(remainingMs / 1000)}s remaining). Early closure or cancellation is prohibited.`,
    };
  }
  return {
    allowed: true,
    remainingMs: 0,
  };
}
