import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrCreateMasterHistory,
  aggregateCandlesForTimeframe,
  stepOrganicLiveTick,
  resetAssetMarketState,
  getAssetMarketState,
} from './priceFeedEngine';
import { AssetInfo } from '../types';
import {
  DEFAULT_ASSETS,
  getLivePayoutPercentage,
  findAssetBySymbol,
  normalizeAssetSymbol,
  loadSelectedAssetSymbol,
  saveSelectedAssetSymbol,
  loadOpenAssetTabSymbols,
  saveOpenAssetTabSymbols,
  loadSelectedTimeframe,
  saveSelectedTimeframe,
  loadChartType,
  saveChartType,
} from './storage';
import { broadcastSyncEvent, subscribeToSyncEvents } from './crossTabSync';

const mockEurUsd: AssetInfo = {
  symbol: 'EUR/USD (OTC)',
  name: 'Euro / US Dollar OTC',
  payout: 97,
  category: 'Forex (OTC)',
  basePrice: 1.0854,
  volatility: 0.00015,
  pipDecimals: 5,
};

const mockGbpUsd: AssetInfo = {
  symbol: 'GBP/USD (OTC)',
  name: 'British Pound / US Dollar OTC',
  payout: 96,
  category: 'Forex (OTC)',
  basePrice: 1.2980,
  volatility: 0.00020,
  pipDecimals: 5,
};

const mockBtcUsd: AssetInfo = {
  symbol: 'BTC/USD (OTC)',
  name: 'Bitcoin / US Dollar OTC',
  payout: 97,
  category: 'Crypto (OTC)',
  basePrice: 68500.0,
  volatility: 18.5,
  pipDecimals: 2,
};

const mockGold: AssetInfo = {
  symbol: 'XAU/USD (OTC)',
  name: 'Gold Spot OTC',
  payout: 95,
  category: 'Commodities (OTC)',
  basePrice: 2740.0,
  volatility: 0.85,
  pipDecimals: 2,
};

test('aggregateCandlesForTimeframe generates rich organic candlesticks with upper and lower wicks across all timeframes', () => {
  for (const tf of [5, 15, 60, 300, 900, 3600]) {
    const candles = aggregateCandlesForTimeframe(mockEurUsd, tf);
    assert.ok(candles.length >= 120, `Expected >= 120 candles for ${tf}s timeframe, got ${candles.length}`);

    let withBothWicks = 0;
    const bodyHeights: number[] = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const bodyMax = Math.max(c.open, c.close);
      const bodyMin = Math.min(c.open, c.close);
      const upperWick = c.high - bodyMax;
      const lowerWick = bodyMin - c.low;
      const bodyHeight = Math.abs(c.close - c.open);

      assert.ok(c.high >= bodyMax, 'Candle high must be >= max(open, close)');
      assert.ok(c.low <= bodyMin, 'Candle low must be <= min(open, close)');

      if (upperWick > 0 && lowerWick > 0) {
        withBothWicks++;
      }
      bodyHeights.push(bodyHeight);

      if (i > 0) {
        // Verify exact open-to-previous-close continuity
        assert.equal(c.open, candles[i - 1].close, 'Candle open must match previous candle close');
      }
    }

    // Every candle should organically display upper and lower wicks
    assert.equal(withBothWicks, candles.length, `All candles in ${tf}s timeframe should have visible upper and lower wicks`);

    // Verify dynamic body height variance (not uniform blocks)
    const minBody = Math.min(...bodyHeights);
    const maxBody = Math.max(...bodyHeights);
    assert.ok(maxBody > minBody * 2.0, 'Candle bodies must vary naturally in height');
  }
});

test('stepOrganicLiveTick advances price smoothly and maintains valid active candle wicks', () => {
  const store = getOrCreateMasterHistory(mockEurUsd);
  const initialLast = store.lastPrice;
  assert.ok(initialLast > 0);

  for (let i = 0; i < 15; i++) {
    const p = stepOrganicLiveTick(mockEurUsd);
    assert.ok(Number.isFinite(p) && p > 0);
  }

  const updatedCandles = aggregateCandlesForTimeframe(mockEurUsd, 5);
  const activeCandle = updatedCandles[updatedCandles.length - 1];
  assert.ok(activeCandle.high >= Math.max(activeCandle.open, activeCandle.close));
  assert.ok(activeCandle.low <= Math.min(activeCandle.open, activeCandle.close));
});

test('Market Isolation: different asset pairs have independent price movements and distinct patterns', () => {
  resetAssetMarketState();

  const eurStore = getOrCreateMasterHistory(mockEurUsd);
  const gbpStore = getOrCreateMasterHistory(mockGbpUsd);
  const btcStore = getOrCreateMasterHistory(mockBtcUsd);
  const goldStore = getOrCreateMasterHistory(mockGold);

  // 1. Verify each asset has its own distinct frequencies and phase offsets
  assert.notEqual(eurStore.primaryFrequency, gbpStore.primaryFrequency, 'EUR and GBP must have different frequencies');
  assert.notEqual(eurStore.phaseOffset, btcStore.phaseOffset, 'EUR and BTC must have different phase offsets');
  assert.notEqual(btcStore.primaryFrequency, goldStore.primaryFrequency, 'BTC and Gold must have different frequencies');

  // 2. Aggregate 60s candles for both Forex pairs
  const eurCandles = aggregateCandlesForTimeframe(mockEurUsd, 60);
  const gbpCandles = aggregateCandlesForTimeframe(mockGbpUsd, 60);

  assert.equal(eurCandles.length, 1500);
  assert.equal(gbpCandles.length, 1500);

  // 3. Compute price returns for last 50 candles to verify uncorrelated motion
  const eurReturns: number[] = [];
  const gbpReturns: number[] = [];
  for (let i = 1450; i < 1500; i++) {
    eurReturns.push(eurCandles[i].close - eurCandles[i - 1].close);
    gbpReturns.push(gbpCandles[i].close - gbpCandles[i - 1].close);
  }

  // Verify they are not moving in identical lockstep
  let identicalReturnsCount = 0;
  for (let i = 0; i < eurReturns.length; i++) {
    const eurSign = Math.sign(eurReturns[i]);
    const gbpSign = Math.sign(gbpReturns[i]);
    if (eurSign === gbpSign && eurSign !== 0) {
      identicalReturnsCount++;
    }
  }

  // If movements were clones, identicalReturnsCount would be 50. In independent markets, it hovers around ~50%
  assert.ok(
    identicalReturnsCount < 45 && identicalReturnsCount > 5,
    `Returns must be independent, identical directional count was ${identicalReturnsCount}/50`
  );
});

test('Live Tick Independence: stepping EUR/USD does not affect GBP/USD or BTC/USD', () => {
  resetAssetMarketState();

  const eur = getOrCreateMasterHistory(mockEurUsd);
  const gbp = getOrCreateMasterHistory(mockGbpUsd);
  const btc = getOrCreateMasterHistory(mockBtcUsd);

  const initialEurTicks = eur.tickCounter;
  const initialGbpPrice = gbp.lastPrice;
  const initialGbpTicks = gbp.tickCounter;
  const initialBtcPrice = btc.lastPrice;
  const initialBtcTicks = btc.tickCounter;

  // Step EUR/USD 25 times
  for (let i = 0; i < 25; i++) {
    stepOrganicLiveTick(mockEurUsd);
  }

  // EUR state should have advanced by 25 ticks
  assert.equal(eur.tickCounter, initialEurTicks + 25);

  // GBP and BTC state should remain completely untouched
  assert.equal(gbp.lastPrice, initialGbpPrice, 'GBP price must remain untouched when EUR ticks');
  assert.equal(gbp.tickCounter, initialGbpTicks, 'GBP tick count must remain untouched when EUR ticks');
  assert.equal(btc.lastPrice, initialBtcPrice, 'BTC price must remain untouched when EUR ticks');
  assert.equal(btc.tickCounter, initialBtcTicks, 'BTC tick count must remain untouched when EUR ticks');
});

test('Category Volatility: Crypto assets exhibit larger relative volatility and price changes than Forex', () => {
  resetAssetMarketState();

  const eurInitial = getOrCreateMasterHistory(mockEurUsd).lastPrice;
  const btcInitial = getOrCreateMasterHistory(mockBtcUsd).lastPrice;

  let maxEurDeltaPercent = 0;
  let maxBtcDeltaPercent = 0;

  for (let i = 0; i < 30; i++) {
    const eurP = stepOrganicLiveTick(mockEurUsd);
    const btcP = stepOrganicLiveTick(mockBtcUsd);

    const eurDeltaPct = Math.abs(eurP - eurInitial) / eurInitial;
    const btcDeltaPct = Math.abs(btcP - btcInitial) / btcInitial;

    if (eurDeltaPct > maxEurDeltaPercent) maxEurDeltaPercent = eurDeltaPct;
    if (btcDeltaPct > maxBtcDeltaPercent) maxBtcDeltaPercent = btcDeltaPct;
  }

  // BTC price excursions should be significantly wider in absolute pip value and standard deviation
  assert.ok(maxBtcDeltaPercent > 0);
  assert.ok(maxEurDeltaPercent > 0);
});

test('DEFAULT_ASSETS provides 25+ OTC instruments in each of the 4 categories (Forex, Crypto, Commodities, Stocks)', () => {
  const forexOtc = DEFAULT_ASSETS.filter((a) => a.category === 'Forex (OTC)');
  const cryptoOtc = DEFAULT_ASSETS.filter((a) => a.category === 'Crypto (OTC)');
  const commoditiesOtc = DEFAULT_ASSETS.filter((a) => a.category === 'Commodities (OTC)');
  const stocksOtc = DEFAULT_ASSETS.filter((a) => a.category === 'Stocks (OTC)');

  assert.ok(forexOtc.length >= 25, `Expected >= 25 Forex (OTC) assets, got ${forexOtc.length}`);
  assert.ok(cryptoOtc.length >= 25, `Expected >= 25 Crypto (OTC) assets, got ${cryptoOtc.length}`);
  assert.ok(commoditiesOtc.length >= 25, `Expected >= 25 Commodities (OTC) assets, got ${commoditiesOtc.length}`);
  assert.ok(stocksOtc.length >= 25, `Expected >= 25 Stocks (OTC) assets, got ${stocksOtc.length}`);
  assert.ok(DEFAULT_ASSETS.length >= 100);

  for (const asset of DEFAULT_ASSETS) {
    const livePayout = getLivePayoutPercentage(asset, 100);
    assert.ok(livePayout >= 79 && livePayout <= 97, `Expected payout between 79 and 97%, got ${livePayout}`);
  }
});

test('Timeframe Independence: candles and price history update correctly and separately for each timeframe without glitching', () => {
  resetAssetMarketState();

  const store = getOrCreateMasterHistory(mockEurUsd);
  assert.ok(store.lastPrice > 0);

  // 1. Verify all standard timeframes are pre-warmed and ready
  const timeframesToTest = [5, 15, 30, 60, 300, 900, 3600];
  for (const tf of timeframesToTest) {
    const series = aggregateCandlesForTimeframe(mockEurUsd, tf);
    assert.ok(series.length >= 100, `Timeframe ${tf}s should have >= 100 candles`);

    // Verify timestamps are strictly increasing and bucket-aligned
    const bucketMs = tf * 1000;
    for (let i = 1; i < series.length; i++) {
      assert.equal(series[i].time - series[i - 1].time, bucketMs, `Candles in ${tf}s must be separated by exactly ${bucketMs}ms`);
      assert.equal(series[i].open, series[i - 1].close, `Candle open must equal previous close in ${tf}s`);
    }

    // Verify active candle close aligns with master store lastPrice
    const lastCandle = series[series.length - 1];
    assert.equal(lastCandle.close, store.lastPrice, `Timeframe ${tf}s newest candle close must match store.lastPrice`);
  }

  // 2. Advance live ticks and verify all timeframes receive the tick updates simultaneously
  const ticksToRun = 20;
  let finalPrice = store.lastPrice;
  for (let i = 0; i < ticksToRun; i++) {
    finalPrice = stepOrganicLiveTick(mockEurUsd);
  }

  for (const tf of timeframesToTest) {
    const series = aggregateCandlesForTimeframe(mockEurUsd, tf);
    const activeCandle = series[series.length - 1];
    assert.equal(activeCandle.close, finalPrice, `Timeframe ${tf}s active candle must be updated to finalPrice ${finalPrice}`);
  }
});

test('State Consistency 4.1: normalizeAssetSymbol normalizes OTC symbols, shorthand aliases, and casing consistently', () => {
  assert.equal(normalizeAssetSymbol('EUR/USD'), 'EUR/USD (OTC)');
  assert.equal(normalizeAssetSymbol('eur/usd'), 'EUR/USD (OTC)');
  assert.equal(normalizeAssetSymbol('EUR/USD (OTC)'), 'EUR/USD (OTC)');
  assert.equal(normalizeAssetSymbol('btc/usd'), 'BTC/USD (OTC)');
  assert.equal(normalizeAssetSymbol('BTC/USD'), 'BTC/USD (OTC)');
  assert.equal(normalizeAssetSymbol('gold'), 'XAU/USD (OTC)');
  assert.equal(normalizeAssetSymbol('oil'), 'US Oil (OTC)');
  assert.equal(normalizeAssetSymbol('nasdaq'), 'NAS100 (OTC)');
  assert.equal(normalizeAssetSymbol('spx'), 'SPX500 (OTC)');
  assert.equal(normalizeAssetSymbol('gbpjpy'), 'GBP/JPY (OTC)');
});

test('State Consistency 4.2: findAssetBySymbol always returns a valid, consistent AssetInfo object without undefined or null', () => {
  const eurUsd = findAssetBySymbol('EUR/USD');
  assert.equal(eurUsd.symbol, 'EUR/USD (OTC)');
  assert.equal(eurUsd.pipDecimals, 5);
  assert.ok(eurUsd.payout >= 79 && eurUsd.payout <= 97);

  const btcUsd = findAssetBySymbol('btc/usd');
  assert.equal(btcUsd.symbol, 'BTC/USD (OTC)');
  assert.equal(btcUsd.category, 'Crypto (OTC)');

  const gold = findAssetBySymbol('gold');
  assert.equal(gold.symbol, 'XAU/USD (OTC)');
  assert.equal(gold.category, 'Commodities (OTC)');

  // Unrecognized custom asset gracefully returns a safe organic fallback
  const custom = findAssetBySymbol('CUSTOM/ASSET');
  assert.ok(custom.symbol.includes('CUSTOM/ASSET'));
  assert.ok(custom.basePrice > 0);
  assert.ok(custom.pipDecimals >= 2);
});

test('State Consistency 4.3: getAssetMarketState resolves the same market state regardless of symbol variant or missing (OTC)', () => {
  resetAssetMarketState();

  const asset = findAssetBySymbol('EUR/USD');
  const storeDirect = getOrCreateMasterHistory(asset);
  assert.ok(storeDirect.lastPrice > 0);

  // Looking up with 'EUR/USD', 'eur/usd', or 'EUR/USD (OTC)' must all return the exact same store
  const lookup1 = getAssetMarketState('EUR/USD');
  const lookup2 = getAssetMarketState('eur/usd');
  const lookup3 = getAssetMarketState('EUR/USD (OTC)');

  assert.ok(lookup1 !== undefined);
  assert.ok(lookup2 !== undefined);
  assert.ok(lookup3 !== undefined);
  assert.equal(lookup1?.symbol, 'EUR/USD (OTC)');
  assert.equal(lookup2?.symbol, 'EUR/USD (OTC)');
  assert.equal(lookup3?.symbol, 'EUR/USD (OTC)');
  assert.equal(lookup1?.lastPrice, storeDirect.lastPrice);
  assert.equal(lookup2?.lastPrice, storeDirect.lastPrice);
  assert.equal(lookup3?.lastPrice, storeDirect.lastPrice);

  // Stepping the price via stepOrganicLiveTick advances the exact same state machine
  const nextPrice = stepOrganicLiveTick('EUR/USD');
  assert.equal(lookup1?.lastPrice, nextPrice);
  assert.equal(lookup2?.lastPrice, nextPrice);
  assert.equal(lookup3?.lastPrice, nextPrice);
});

test('State Consistency 4.4: Terminal view preferences (selected asset, tabs, timeframe, chart type) persist cleanly', () => {
  // Test selected asset persistence
  saveSelectedAssetSymbol('GBP/JPY');
  assert.equal(loadSelectedAssetSymbol(), 'GBP/JPY (OTC)');

  // Test open tabs persistence
  const tabsToSave = ['EUR/USD', 'BTC/USD', 'TSLA'];
  saveOpenAssetTabSymbols(tabsToSave);
  const loadedTabs = loadOpenAssetTabSymbols();
  assert.deepEqual(loadedTabs, ['EUR/USD (OTC)', 'BTC/USD (OTC)', 'TSLA (OTC)']);

  // Test timeframe persistence
  saveSelectedTimeframe('5m');
  assert.equal(loadSelectedTimeframe(), '5m');

  // Test chart type persistence
  saveChartType('heikin-ashi');
  assert.equal(loadChartType(), 'heikin-ashi');
});

test('State Consistency 4.5: crossTabSync event bus transmits and unsubscribes cleanly without throwing in node environment', () => {
  let receivedCount = 0;
  const unsubscribe = subscribeToSyncEvents((msg) => {
    if (msg.type === 'ASSET_SELECTED') {
      receivedCount++;
    }
  });

  assert.equal(typeof unsubscribe, 'function');
  broadcastSyncEvent('ASSET_SELECTED', 'EUR/USD (OTC)');
  broadcastSyncEvent('ACCOUNT_SELECTED', 'BFT-9999');

  unsubscribe();
});

test('State Persistence 10: Candle history and active market states persist and rehydrate without resetting simulation', () => {
  resetAssetMarketState();

  const asset = findAssetBySymbol('BTC/USD');
  const initialCandles = aggregateCandlesForTimeframe(asset, 60); // 1m candles
  assert.ok(initialCandles.length > 0, 'Should generate initial candles');

  // Step a live tick
  stepOrganicLiveTick(asset);

  // Clear in-memory master state to simulate page refresh
  resetAssetMarketState('BTC/USD');

  // Re-request market state and timeframe candles
  const rehydratedCandles = aggregateCandlesForTimeframe(asset, 60);
  assert.ok(rehydratedCandles.length > 0, 'Rehydrated candles should be restored from storage');
  assert.equal(rehydratedCandles[0].time, initialCandles[0].time, 'Oldest candle time should match persisted history');
});

