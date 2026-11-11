import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BFT_ORIGINAL_ACCOUNT_SIZES,
  getBftCardsForTier,
  getCurrencyConfig,
  formatMetricValue,
  formatFtmoCurrencyAmount,
} from './ftmoPricingCatalog';

test('getBftCardsForTier restores all 6 original BFT packages, prices, and rules for each tier', () => {
  assert.deepEqual(BFT_ORIGINAL_ACCOUNT_SIZES, [100000, 50000, 25000, 10000, 5000, 2500]);

  // 1. Two-Step Challenge: 25% Phase 1, 15% Phase 2, 8% Daily DD, 20% Max Loss, 5% Risk/Trade, 5 days
  const twoStep = getBftCardsForTier('two-step', 'SPOOKY40', false);
  assert.equal(twoStep.length, 6);
  assert.deepEqual(
    twoStep.map((c) => c.size),
    [100000, 50000, 25000, 10000, 5000, 2500]
  );

  const ts10k = twoStep.find((c) => c.size === 10000)!;
  assert.equal(ts10k.isBestValue, true);
  assert.equal(ts10k.originalPriceUsd, 115);
  assert.equal(ts10k.finalPriceUsd, 69); // 40% OFF $115
  assert.equal(ts10k.phase1TargetPercent, 25);
  assert.equal(ts10k.phase2TargetPercent, 15);
  assert.equal(ts10k.maxDailyLossPercent, 8);
  assert.equal(ts10k.maxLossPercent, 20);
  assert.equal(ts10k.maxRiskPerTradePercent, 5);
  assert.equal(ts10k.rewardsLabel, '80% → 90%');

  // 2. One-Step Challenge: 30% Target, 10% Daily DD, 15% Max Loss, 5% Risk/Trade, 5 days
  const oneStep = getBftCardsForTier('one-step', 'SPOOKY40', false);
  assert.equal(oneStep.length, 6);
  const os10k = oneStep.find((c) => c.size === 10000)!;
  assert.equal(os10k.isBestValue, true);
  assert.equal(os10k.originalPriceUsd, 149);
  assert.equal(os10k.finalPriceUsd, 89); // 40% OFF $149
  assert.equal(os10k.phase1TargetPercent, 30);
  assert.equal(os10k.phase2TargetPercent, null);
  assert.equal(os10k.maxDailyLossPercent, 10);
  assert.equal(os10k.maxLossPercent, 15);

  // 3. Instant Funded: 0% Target, 6% Daily DD, 12% Max Loss, 5% Risk/Trade
  const instant = getBftCardsForTier('instant', 'SPOOKY40', false);
  assert.equal(instant.length, 6);
  const inst10k = instant.find((c) => c.size === 10000)!;
  assert.equal(inst10k.isBestValue, true);
  assert.equal(inst10k.originalPriceUsd, 415);
  assert.equal(inst10k.finalPriceUsd, 249); // 40% OFF $415
  assert.equal(inst10k.phase1TargetPercent, 0);
  assert.equal(inst10k.maxDailyLossPercent, 6);
  assert.equal(inst10k.maxLossPercent, 12);
});

test('formatMetricValue toggles between dollar amounts with percentages and percentage-only view', () => {
  const usd = getCurrencyConfig('USD');
  assert.equal(
    formatMetricValue({
      size: 10000,
      percent: 25,
      showNumbers: true,
      accountSymbol: usd.accountSymbol,
      accountMultiplier: usd.accountMultiplier,
    }),
    '$2,500 (25%)'
  );
  assert.equal(
    formatMetricValue({
      size: 10000,
      percent: 25,
      showNumbers: false,
      accountSymbol: usd.accountSymbol,
      accountMultiplier: usd.accountMultiplier,
    }),
    '25%'
  );
  assert.equal(formatFtmoCurrencyAmount(69, usd.feeSymbol), '$69');
});
