import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidPriceForAsset,
  validateCandlesForAsset,
  appendLiveTick,
  aggregateCandlesForTimeframe,
  resetAssetMarketState,
} from './priceFeedEngine';
import {
  getIsoCountryCode,
  extractIsoFromEmoji,
  resolveCurrencyPairFlags,
} from '../components/CountryFlagIcon';
import { findAssetBySymbol } from './storage';

describe('Chart Symbol Binding, Price Scale Validation & Country Flag Resolution', () => {
  it('rejects cross-contaminated prices (e.g., 3.03 on GBP/JPY) and accepts valid asset prices', () => {
    const gbpJpy = findAssetBySymbol('GBP/JPY (OTC)');
    assert.ok(gbpJpy, 'GBP/JPY (OTC) asset should exist');
    assert.ok(gbpJpy.basePrice > 150, 'GBP/JPY basePrice should be around 199');

    // 3.03 is completely outside GBP/JPY scale and must be rejected
    assert.equal(isValidPriceForAsset(gbpJpy, 3.03), false);
    assert.equal(isValidPriceForAsset(gbpJpy, 1.0845), false);
    assert.equal(isValidPriceForAsset(gbpJpy, 199.32), true);

    resetAssetMarketState(gbpJpy.symbol);
    const cleanCandles = aggregateCandlesForTimeframe(gbpJpy, 60);
    assert.ok(cleanCandles.length > 100);
    assert.equal(validateCandlesForAsset(gbpJpy, cleanCandles), true);

    // Attempt to contaminate GBP/JPY with a 3.03 tick from another asset
    appendLiveTick(gbpJpy, 3.03, true);
    const afterContaminationAttempt = aggregateCandlesForTimeframe(gbpJpy, 60);
    const lastCandle = afterContaminationAttempt[afterContaminationAttempt.length - 1];
    assert.ok(
      lastCandle.close > 150 && lastCandle.close < 250,
      `Expected GBP/JPY close to stay near ~199, got ${lastCandle.close}`
    );
  });

  it('maps leaderboard countries, emojis, and currency pairs to accurate ISO 2-letter flag codes', () => {
    assert.equal(getIsoCountryCode('Sri Lanka'), 'lk');
    assert.equal(getIsoCountryCode('🇱🇰'), 'lk');
    assert.equal(getIsoCountryCode('Dubai, UAE'), 'ae');
    assert.equal(getIsoCountryCode('🇦🇪'), 'ae');
    assert.equal(getIsoCountryCode('India'), 'in');
    assert.equal(getIsoCountryCode('Malaysia'), 'my');
    assert.equal(getIsoCountryCode('Pakistan'), 'pk');
    assert.equal(extractIsoFromEmoji('🇬🇧'), 'gb');
    assert.equal(extractIsoFromEmoji('🇯🇵'), 'jp');

    const gbpJpyFlags = resolveCurrencyPairFlags('GBP/JPY (OTC)', 'Forex');
    assert.equal(gbpJpyFlags.primaryIso, 'gb');
    assert.equal(gbpJpyFlags.secondaryIso, 'jp');
    assert.equal(gbpJpyFlags.isForex, true);

    const eurUsdFlags = resolveCurrencyPairFlags('EUR/USD (OTC)', 'Forex');
    assert.equal(eurUsdFlags.primaryIso, 'eu');
    assert.equal(eurUsdFlags.secondaryIso, 'us');
    assert.equal(eurUsdFlags.isForex, true);
  });
});
