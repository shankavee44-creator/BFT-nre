import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrCreateMasterHistory,
  aggregateCandlesForTimeframe,
  stepOrganicLiveTick,
} from './priceFeedEngine';
import { AssetInfo } from '../types';

const mockAsset: AssetInfo = {
  symbol: 'EUR/USD (OTC)',
  name: 'Euro / US Dollar OTC',
  payout: 92,
  category: 'OTC',
  basePrice: 1.0854,
  volatility: 0.00045,
  pipDecimals: 5,
};

test('aggregateCandlesForTimeframe generates rich organic candlesticks with upper and lower wicks across all timeframes', () => {
  for (const tf of [5, 15, 60, 300, 900, 3600]) {
    const candles = aggregateCandlesForTimeframe(mockAsset, tf);
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
    assert.ok(maxBody > minBody * 2.5, 'Candle bodies must vary naturally in height');

    // Verify natural interleaving of bullish and bearish candles (no long artificial 12+ same-color streaks)
    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < candles.length; i++) {
      const prevGreen = candles[i - 1].close >= candles[i - 1].open;
      const curGreen = candles[i].close >= candles[i].open;
      if (prevGreen === curGreen) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 1;
      }
    }
    assert.ok(maxStreak <= 6, `Expected natural pullbacks with max same-color streak <= 6, got ${maxStreak}`);
  }
});

test('stepOrganicLiveTick advances price smoothly and maintains valid active candle wicks', () => {
  const store = getOrCreateMasterHistory(mockAsset);
  const initialLast = store.lastPrice;
  assert.ok(initialLast > 0);

  for (let i = 0; i < 15; i++) {
    const p = stepOrganicLiveTick(mockAsset);
    assert.ok(Number.isFinite(p) && p > 0);
  }

  const updatedCandles = aggregateCandlesForTimeframe(mockAsset, 5);
  const activeCandle = updatedCandles[updatedCandles.length - 1];
  assert.ok(activeCandle.high > Math.max(activeCandle.open, activeCandle.close));
  assert.ok(activeCandle.low < Math.min(activeCandle.open, activeCandle.close));
});

import { DEFAULT_ASSETS, getLivePayoutPercentage } from './storage';

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
    assert.ok(livePayout >= 82 && livePayout <= 95);
  }
});
