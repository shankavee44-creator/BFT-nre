import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BFT_ORIGINAL_ACCOUNT_SIZES,
  getUnifiedChallengeCards,
  getBftCardsForTier,
  getCurrencyConfig,
  formatMetricValue,
  formatFtmoCurrencyAmount,
} from './ftmoPricingCatalog';

test('getUnifiedChallengeCards returns exact 6 unified Funded Challenge packages and prices', () => {
  assert.deepEqual(BFT_ORIGINAL_ACCOUNT_SIZES, [200000, 100000, 50000, 25000, 10000, 5000]);

  const cards = getUnifiedChallengeCards('NONE', false);
  assert.equal(cards.length, 6);
  assert.deepEqual(
    cards.map((c) => [c.size, c.finalPriceUsd]),
    [
      [200000, 1199],
      [100000, 549],
      [50000, 329],
      [25000, 199],
      [10000, 89],
      [5000, 49],
    ]
  );

  for (const card of cards) {
    assert.equal(card.tier, 'funded-challenge');
    assert.equal(card.phase1TargetPercent, 30);
    assert.equal(card.phase2TargetPercent, null);
    assert.equal(card.maxDailyLossPercent, 0);
    assert.equal(card.maxLossPercent, 10);
    assert.equal(card.maxRiskPerTradePercent, 5);
    assert.equal(card.maxCombinedRiskPercent, 5);
    assert.equal(card.maxOpenTradesPerPair, 1);
    assert.equal(card.minTradingDaysLabel, '5 days (≥ 1% profit/day)');
    assert.equal(card.rewardsLabel, '80% → 90%');
    assert.equal(card.withdrawalCycleLabel, 'Weekly (7-Day 1st Wait)');
  }

  // With +15% Daily Withdrawals Add-on
  const dailyCards = getUnifiedChallengeCards('NONE', true);
  const c5k = dailyCards.find((c) => c.size === 5000)!;
  assert.equal(c5k.finalPriceUsd, Number((49 * 1.15).toFixed(2)));
  assert.match(c5k.withdrawalCycleLabel, /Daily/i);

  // Legacy getBftCardsForTier delegates cleanly to unified model
  const legacyCall = getBftCardsForTier('funded-challenge', 'NONE', false);
  assert.equal(legacyCall.length, 6);
  assert.equal(legacyCall.find((c) => c.size === 50000)?.finalPriceUsd, 329);
});

test('formatMetricValue toggles between dollar amounts with percentages and percentage-only view', () => {
  const usd = getCurrencyConfig('USD');
  assert.equal(
    formatMetricValue({
      size: 10000,
      percent: 30,
      showNumbers: true,
      accountSymbol: usd.accountSymbol,
      accountMultiplier: usd.accountMultiplier,
    }),
    '$3,000 (30%)'
  );
  assert.equal(
    formatMetricValue({
      size: 10000,
      percent: 10,
      showNumbers: false,
      accountSymbol: usd.accountSymbol,
      accountMultiplier: usd.accountMultiplier,
    }),
    '10%'
  );
  assert.equal(formatFtmoCurrencyAmount(89, usd.feeSymbol), '$89');
});
