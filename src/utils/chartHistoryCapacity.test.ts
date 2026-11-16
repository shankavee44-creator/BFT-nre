import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_CANDLE_HISTORY_COUNT,
  MAX_CANDLE_HISTORY_CAPACITY,
  aggregateCandlesForTimeframe,
  prependHistoricalCandles,
  syncAssetStoreWithServerTime,
  resetAssetMarketState,
  stepOrganicLiveTick,
} from './priceFeedEngine';
import { getDevicePerformanceProfile } from './devicePerformance';
import { findAssetBySymbol } from './storage';

test('historical candle engine initializes with 2,500+ candles and prepends up to 10,000 candles seamlessly', () => {
  const asset = findAssetBySymbol('EUR/USD (OTC)');
  resetAssetMarketState(asset.symbol);

  const initial = aggregateCandlesForTimeframe(asset, 60);
  assert.equal(initial.length, INITIAL_CANDLE_HISTORY_COUNT);
  assert.ok(initial.length >= 2500);

  // Verify strictly monotonic timestamps
  for (let i = 1; i < initial.length; i++) {
    assert.equal(initial[i].time - initial[i - 1].time, 60_000);
  }

  // Prepend 1,000 historical candles
  const afterPrepend1 = prependHistoricalCandles(asset, 60, 1000);
  assert.equal(afterPrepend1.length, 3500);
  assert.ok(afterPrepend1[0].time < initial[0].time);
  for (let i = 1; i < afterPrepend1.length; i++) {
    assert.equal(afterPrepend1[i].time - afterPrepend1[i - 1].time, 60_000);
  }

  // Advancing live ticks must preserve the loaded 3,500-bar historical buffer
  stepOrganicLiveTick(asset, { timeframeSeconds: 60 });
  const afterTick = aggregateCandlesForTimeframe(asset, 60);
  assert.ok(afterTick.length >= 3500);

  // Server resync must preserve existing extended historical buffer
  const afterResync = syncAssetStoreWithServerTime(asset, 60);
  assert.ok(afterResync.length >= 3500);

  // Prepending repeatedly stops cleanly at MAX_CANDLE_HISTORY_CAPACITY (10,000)
  let latest = afterResync;
  for (let k = 0; k < 10; k++) {
    latest = prependHistoricalCandles(asset, 60, 1000);
  }
  assert.equal(latest.length, MAX_CANDLE_HISTORY_CAPACITY);
});

test('device performance profile supports expanded historical candle capacity', () => {
  const high = getDevicePerformanceProfile('high');
  const low = getDevicePerformanceProfile('low');
  assert.ok(high.recommendedMaxCandles >= 10000);
  assert.ok(low.recommendedMaxCandles >= 2500);
});
