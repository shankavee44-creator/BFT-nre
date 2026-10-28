import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateVisibleWindow,
  computeReleaseVelocity,
  stepMomentum,
  calculateAnchoredZoom,
  translatePanOffsetForTimeframe,
} from './chartVirtualizationEngine';
import { aggregateCandlesForTimeframe, prependHistoricalCandles } from './priceFeedEngine';
import { AssetInfo } from '../types';

const TEST_ASSET: AssetInfo = {
  symbol: 'EUR/USD (OTC)',
  name: 'Euro / US Dollar OTC',
  category: 'Forex (OTC)',
  payout: 92,
  basePrice: 1.0845,
  volatility: 0.00018,
  pipDecimals: 5,
};

test('calculateVisibleWindow returns accurate visible slice and clamps panOffset across deep history', () => {
  const win = calculateVisibleWindow(1500, 200, 1.0, 900);
  assert.ok(win.maxVisibleCandles >= 14);
  assert.equal(win.effectivePanOffset, 200);
  assert.equal(win.hasMorePast, true);
  assert.equal(win.hasMoreFuture, true);

  const liveWin = calculateVisibleWindow(1500, 0, 1.0, 900);
  assert.equal(liveWin.hasMoreFuture, false);
  assert.equal(liveWin.endIndex, 1500);
});

test('computeReleaseVelocity and stepMomentum smoothly decay inertia velocity to rest', () => {
  const samples = [
    { x: 200, time: 100 },
    { x: 320, time: 132 },
    { x: 440, time: 164 },
  ];
  const velocity = computeReleaseVelocity(samples, 12);
  assert.ok(velocity > 0, 'Dragging right produces positive historical pan velocity');

  let currentOffset = 50;
  let currentVel = velocity;
  let frames = 0;
  while (frames < 160) {
    const step = stepMomentum(currentOffset, currentVel, 0.92, 0.012, 1500);
    currentOffset = step.nextPanOffset;
    currentVel = step.nextVelocity;
    frames++;
    if (!step.isCoasting) break;
  }
  assert.ok(currentOffset > 50, 'Momentum carries pan offset forward into history');
  assert.equal(currentVel, 0, 'Momentum velocity cleanly decays to 0');
});

test('calculateAnchoredZoom scales zoom while keeping the anchor candle stable', () => {
  const res = calculateAnchoredZoom(1.0, 0.25, 0.5, 100);
  assert.equal(res.nextZoom, 1.25);
  assert.ok(res.nextPanOffset >= 0);
});

test('translatePanOffsetForTimeframe preserves historical timestamp delta across timeframes', () => {
  // 60 candles back on 5s timeframe = 300 seconds = 5 candles on 1m (60s) timeframe
  const translated = translatePanOffsetForTimeframe(60, 5, 60);
  assert.equal(translated, 5);
});

test('prependHistoricalCandles seamlessly prepends older continuous OHLC candles to deep history buffer', () => {
  const initial = aggregateCandlesForTimeframe(TEST_ASSET, 60);
  assert.equal(initial.length, 1500);

  const oldestBefore = initial[0];
  const expanded = prependHistoricalCandles(TEST_ASSET, 60, 500);
  assert.equal(expanded.length, 2000);
  assert.ok(expanded[0].time < oldestBefore.time);
  assert.equal(expanded[499].close, oldestBefore.open);
});
