import test from 'node:test';
import assert from 'node:assert/strict';
import type { AssetInfo } from '../types/index.ts';
import {
  computeTradeBadgePosition,
  resolveTradeExecutionPrice,
} from './tradeChartOverlay.ts';

const EUR_USD: AssetInfo = {
  symbol: 'EUR/USD',
  name: 'Euro / US Dollar',
  category: 'Forex',
  payout: 92,
  basePrice: 1.08425,
  volatility: 0.00018,
  pipDecimals: 5,
  isOtc: false,
};

test('resolveTradeExecutionPrice uses liveFeedPrice over stale React state on mobile', () => {
  const price = resolveTradeExecutionPrice({
    asset: EUR_USD,
    isSelectedAsset: true,
    liveFeedPrice: 1.0861234,
    targetRefPrice: 1.0859,
    marketStatePrice: 1.0858,
    latestCandleClose: 1.0855,
    reactCurrentPrice: 1.08425, // stale closure price from initial mount
  });
  assert.equal(price, 1.08612);
});

test('resolveTradeExecutionPrice falls back to targetRefPrice when liveFeedPrice is unavailable', () => {
  const price = resolveTradeExecutionPrice({
    asset: EUR_USD,
    isSelectedAsset: true,
    liveFeedPrice: null,
    targetRefPrice: 1.08745,
    marketStatePrice: 1.0861,
    reactCurrentPrice: 1.08425,
  });
  assert.equal(price, 1.08745);
});

test('resolveTradeExecutionPrice ignores invalid cross-asset outlier prices', () => {
  const price = resolveTradeExecutionPrice({
    asset: EUR_USD,
    isSelectedAsset: true,
    liveFeedPrice: 2735.5, // wrong asset (XAU/USD)
    targetRefPrice: 1.08515,
    reactCurrentPrice: 1.08425,
  });
  assert.equal(price, 1.08515);
});

test('computeTradeBadgePosition centers vertically on exact entryY and keeps badge clear of mobile live price tag', () => {
  const pos = computeTradeBadgePosition({
    entryX: 165,
    entryY: 142,
    containerWidth: 390,
    containerHeight: 340,
    isMobile: true,
  });

  // Vertically anchored directly at exact entryY (paired with translateY(-50%))
  assert.equal(pos.top, 142);
  assert.equal(pos.entryDotY, 142);
  // Placed cleanly to the left of the candle because 165 + 10 + 156 > 390 - 126
  assert.equal(pos.placedLeftOfCandle, true);
  assert.ok(pos.left >= 8, `Expected left >= 8, got ${pos.left}`);
  assert.ok(pos.left + 156 <= 390 - 126, 'Badge should not overlap the live price tag or right price axis');
});

test('computeTradeBadgePosition preserves desktop right-of-candle placement when space allows', () => {
  const pos = computeTradeBadgePosition({
    entryX: 620,
    entryY: 250,
    containerWidth: 1080,
    containerHeight: 560,
    isMobile: false,
  });

  assert.equal(pos.top, 250);
  assert.equal(pos.left, 635);
  assert.equal(pos.placedLeftOfCandle, false);
  assert.equal(pos.entryDotX, 620);
  assert.equal(pos.entryDotY, 250);
});
