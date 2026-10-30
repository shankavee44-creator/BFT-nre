import type { Candle, AssetInfo } from '../types/index.ts';
import { supabase } from '../utils/supabase.ts';

// Global Anchor Epoch: Jan 1, 2024 00:00:00 UTC
const GLOBAL_EPOCH = 1704067200000;

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
 * Fast 32-bit FNV-1a hash for deterministic seeds.
 */
function hashSymbol(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getCategoryParameters(category: string, symbol: string = '') {
  const cat = (category || '').toLowerCase();
  const sym = (symbol || '').toLowerCase();

  const isVolatileFx =
    sym.includes('jpy') ||
    sym.includes('gbp') ||
    sym.includes('mxn') ||
    sym.includes('brl') ||
    sym.includes('try') ||
    sym.includes('zar');

  if (cat.includes('crypto')) {
    return {
      volMultiplier: 2.85,
      trendLengthMin: 20,
      trendLengthMax: 65,
      breakoutChance: 0.32,
      jumpChance: 0.08,
      wickMultiplier: 1.45,
    };
  }
  if (cat.includes('commodit')) {
    return {
      volMultiplier: sym.includes('xau') || sym.includes('wti') || sym.includes('cocoa') ? 2.1 : 1.65,
      trendLengthMin: 30,
      trendLengthMax: 85,
      breakoutChance: 0.24,
      jumpChance: 0.06,
      wickMultiplier: 1.30,
    };
  }
  if (cat.includes('stock')) {
    return {
      volMultiplier: sym.includes('tsla') || sym.includes('nvda') || sym.includes('mstr') || sym.includes('coin') ? 2.2 : 1.55,
      trendLengthMin: 25,
      trendLengthMax: 75,
      breakoutChance: 0.22,
      jumpChance: 0.05,
      wickMultiplier: 1.25,
    };
  }
  return {
    volMultiplier: isVolatileFx ? 1.35 : 1.0,
    trendLengthMin: 30,
    trendLengthMax: 85,
    breakoutChance: 0.16,
    jumpChance: 0.03,
    wickMultiplier: 1.10,
  };
}

function createPRNG(seed: number) {
  return { state: seed >>> 0 };
}

function nextRandom(prng: { state: number }): number {
  prng.state = (prng.state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(prng.state ^ (prng.state >>> 15), 1 | prng.state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function getAssetTimeOffsetMs(symbol: string, timeframeSeconds: number): number {
  const hash = hashSymbol(symbol);
  const tfSeconds = Math.max(5, timeframeSeconds);
  const subSteps = Math.max(1, Math.floor(tfSeconds / 5));
  const stepIndex = (hash >> 3) % subSteps;
  return stepIndex * 5000;
}

function getDeterministicBlockBasePrice(asset: AssetInfo, blockIndex: number): number {
  const symbolSeed = hashSymbol(asset.symbol);
  const catParams = getCategoryParameters(asset.category, asset.symbol);

  const primaryFreq = 0.0012 + (symbolSeed % 500) * 0.000015;
  const secondaryFreq = 0.0003 + ((symbolSeed >> 4) % 500) * 0.000008;
  const phaseOffset = (((symbolSeed >> 8) % 1000) / 1000) * Math.PI * 2;

  const wave =
    Math.sin(phaseOffset + blockIndex * primaryFreq) * 0.06 +
    Math.cos(blockIndex * secondaryFreq) * 0.03;

  const blockHash = hashSymbol(`${asset.symbol}:blockDrift:${blockIndex}`);
  const rawDrift = ((blockHash % 10000) - 5000) / 5000;
  const maxDrift = asset.basePrice * (catParams.volMultiplier > 1.5 ? 0.08 : 0.03);

  const price = asset.basePrice * (1 + wave) + rawDrift * maxDrift;
  const minPip = Math.pow(10, -asset.pipDecimals);
  return Math.max(minPip * 10, Number(price.toFixed(asset.pipDecimals)));
}

/**
 * Ported master price generation algorithm.
 * This runs on the server to ensure all clients receive identical ticks.
 */
export function calculateMarketTick(asset: AssetInfo, nowMs: number): MarketTickPayload {
  const tfSeconds = 5;
  const bucketMs = tfSeconds * 1000;
  const offsetMs = getAssetTimeOffsetMs(asset.symbol, tfSeconds);
  
  // Current 5s candle bucket
  const currentBucketTime = Math.floor((nowMs + offsetMs) / bucketMs) * bucketMs - offsetMs;
  const bucketIdx = Math.floor((currentBucketTime - GLOBAL_EPOCH) / bucketMs);
  
  const candlesPerBlock = 500;
  const blockIndex = Math.floor(bucketIdx / candlesPerBlock);
  const indexInBlock = bucketIdx % candlesPerBlock;
  
  const catParams = getCategoryParameters(asset.category, asset.symbol);
  const unitVol = asset.volatility * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  // Initialize PRNG for this block
  const blockSeed = hashSymbol(`${asset.symbol}:${tfSeconds}:block:${blockIndex}`);
  const prng = createPRNG(blockSeed);
  
  let currentPrice = getDeterministicBlockBasePrice(asset, blockIndex);
  let volCluster = 1.0;
  let currentRegime: MarketRegime = 'consolidation';
  let regimeTicksRemaining = 0;
  let regimeIntensity = 1.0;
  
  const regimes: MarketRegime[] = ['bullish_trend', 'bearish_trend', 'consolidation', 'volatile_breakout', 'mean_reverting'];

  // Fast-forward to current bucket in block
  for (let j = 0; j <= indexInBlock; j++) {
    const u1 = Math.max(1e-7, nextRandom(prng));
    const u2 = Math.max(1e-7, nextRandom(prng));
    const shock = Math.abs(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
    volCluster = Math.max(0.45, Math.min(2.8, 0.72 * volCluster + 0.28 * shock));

    if (regimeTicksRemaining <= 0) {
      const r = nextRandom(prng);
      if (currentRegime === 'bullish_trend') currentRegime = r < 0.55 ? 'consolidation' : r < 0.80 ? 'bearish_trend' : 'mean_reverting';
      else if (currentRegime === 'bearish_trend') currentRegime = r < 0.55 ? 'consolidation' : r < 0.80 ? 'bullish_trend' : 'mean_reverting';
      else if (currentRegime === 'consolidation' || currentRegime === 'mean_reverting') currentRegime = r < catParams.breakoutChance ? 'volatile_breakout' : r < 0.55 ? 'bullish_trend' : 'bearish_trend';
      else currentRegime = r < 0.65 ? 'consolidation' : 'mean_reverting';
      
      regimeTicksRemaining = catParams.trendLengthMin + Math.floor(nextRandom(prng) * (catParams.trendLengthMax - catParams.trendLengthMin));
      regimeIntensity = 0.6 + nextRandom(prng) * 0.8;
    }
    regimeTicksRemaining--;

    if (j < indexInBlock) {
      let trendDrift = 0;
      if (currentRegime === 'bullish_trend') trendDrift = 0.28 * regimeIntensity;
      else if (currentRegime === 'bearish_trend') trendDrift = -0.28 * regimeIntensity;
      else if (currentRegime === 'volatile_breakout') trendDrift = (nextRandom(prng) < 0.5 ? 1 : -1) * 0.5 * regimeIntensity;

      const dirProb = Math.max(0.1, Math.min(0.9, 0.5 + trendDrift));
      const sign = nextRandom(prng) < dirProb ? 1 : -1;
      const u3 = Math.max(1e-7, nextRandom(prng));
      const u4 = Math.max(1e-7, nextRandom(prng));
      const shock2 = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4));
      const bodyMag = Math.max(minPip * 3.5, (0.45 + shock2 * 0.85) * unitVol * volCluster);
      currentPrice = Math.max(minPip * 10, currentPrice + sign * bodyMag);
    }
  }

  // We are now at the start of the current bucket.
  const open = currentPrice;
  
  // Calculate the "close" for this bucket (end of 5s)
  let trendDrift = 0;
  if (currentRegime === 'bullish_trend') trendDrift = 0.28 * regimeIntensity;
  else if (currentRegime === 'bearish_trend') trendDrift = -0.28 * regimeIntensity;
  else if (currentRegime === 'volatile_breakout') trendDrift = (nextRandom(prng) < 0.5 ? 1 : -1) * 0.5 * regimeIntensity;

  const dirProb = Math.max(0.1, Math.min(0.9, 0.5 + trendDrift));
  const sign = nextRandom(prng) < dirProb ? 1 : -1;
  const u3 = Math.max(1e-7, nextRandom(prng));
  const u4 = Math.max(1e-7, nextRandom(prng));
  const shock2 = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4));
  const bodyMag = Math.max(minPip * 3.5, (0.45 + shock2 * 0.85) * unitVol * volCluster);
  const close = Math.max(minPip * 10, open + sign * bodyMag);

  // Intra-candle pulse (tick level)
  const elapsedInBucketMs = ((nowMs + offsetMs) % bucketMs + bucketMs) % bucketMs;
  const progress = elapsedInBucketMs / bucketMs;
  
  // Micro-spike logic (porting "last-second volatility spike")
  const remainingMs = bucketMs - elapsedInBucketMs;
  const spikeWindowMs = 1200;
  const isLastSecondSpike = remainingMs <= spikeWindowMs;
  
  const tickHash = hashSymbol(`${asset.symbol}:pulse:${Math.floor(nowMs / 100)}`);
  const tu1 = Math.max(1e-7, (tickHash % 10000) / 10000);
  const tu2 = Math.max(1e-7, ((tickHash >> 5) % 10000) / 10000);
  const tShock = Math.sqrt(-2.0 * Math.log(tu1)) * Math.cos(2.0 * Math.PI * tu2);

  let volMult = 1.0;
  let microBurst = 0;
  if (isLastSecondSpike) {
    const spikeProgress = 1 - (remainingMs / spikeWindowMs);
    volMult = 1.25 + spikeProgress * 0.85;
    const burstSign = (tickHash % 3 === 0) ? 0 : (tickHash % 2 === 0 ? 1 : -1);
    microBurst = burstSign * (0.25 + (tickHash % 1000 / 1000) * 0.95) * spikeProgress;
  }

  const pulseNoise = (tShock * 0.35 + microBurst) * unitVol * volMult;
  const intraPrice = open + (close - open) * progress + pulseNoise;
  const finalPrice = Number(Math.max(minPip * 10, intraPrice).toFixed(asset.pipDecimals));

  return {
    symbol: asset.symbol,
    price: finalPrice,
    prevPrice: finalPrice, // Server doesn't strictly need to track prev for every 100ms
    timestamp: nowMs,
  };
}

export class BackendMarketEngine {
  private assets: AssetInfo[] = [];
  private tickInterval: NodeJS.Timeout | null = null;
  private channel: any = null;
  private lastDbSaveMs: number = 0;

  constructor() {
    this.channel = supabase.channel('market-live-feed', {
      config: { broadcast: { self: true } },
    });
    this.channel.subscribe();
  }

  public async start() {
    await this.refreshAssets();
    this.tickInterval = setInterval(() => this.broadcastBatch(), 150);
  }

  private async refreshAssets() {
    const { data } = await supabase.from('otc_assets').select('*');
    if (data && data.length > 0) {
      this.assets = data.map((item: any) => ({
        symbol: item.symbol,
        name: item.name,
        payout: Number(item.payout_rate) || 92,
        category: item.category || 'OTC',
        basePrice: Number(item.current_price) || 1.0,
        volatility: Number(item.volatility) || 0.00012,
        pipDecimals: Number(item.pip_decimals) || 5,
        flag: item.flag || '📈',
      }));
    }
  }

  private broadcastBatch() {
    const now = Date.now();
    const chunkCount = 50;
    const allTicks: MarketTickPayload[] = [];

    for (let i = 0; i < this.assets.length; i += chunkCount) {
      const chunk = this.assets.slice(i, i + chunkCount);
      const batch = chunk.map((asset) => {
        const tick = calculateMarketTick(asset, now);
        allTicks.push(tick);
        return tick;
      });

      this.channel.send({
        type: 'broadcast',
        event: 'price_batch',
        payload: { ticks: batch },
      });
    }

    // Persist snapshot to Supabase 'market_prices' table every 3 seconds
    if (now - this.lastDbSaveMs >= 3000 && allTicks.length > 0) {
      this.lastDbSaveMs = now;
      this.persistSnapshots(allTicks);
    }
  }

  private async persistSnapshots(ticks: MarketTickPayload[]) {
    try {
      const rows = ticks.map((t) => ({
        symbol: t.symbol,
        last_price: t.price,
        prev_price: t.prevPrice,
        updated_at: new Date(t.timestamp).toISOString(),
      }));

      // Upsert in chunks of 100 to avoid payload size limits
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        await supabase.from('market_prices').upsert(chunk, { onConflict: 'symbol' });
      }
    } catch (e) {
      // Graceful fallback if database is temporarily unreachable
    }
  }

  public stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }
}
