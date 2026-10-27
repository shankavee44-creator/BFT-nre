import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProfitSimulation } from './profitCalculator';

test('profit simulation calculates monthly metrics accurately for $10,000 account at 70% win rate', () => {
  const result = calculateProfitSimulation({
    accountSize: 10000,
    winRatePercent: 70,
    tradesPerDay: 5,
    tradingDaysPerMonth: 20, // 100 total trades
    riskPerTradePercent: 1, // $100 stake
    averagePayoutPercent: 90, // $90 win payout
    profitSplitPercent: 90, // 90% payout
    challengeFee: 200,
  });

  assert.equal(result.totalMonthlyTrades, 100);
  assert.equal(result.winningTrades, 70);
  assert.equal(result.losingTrades, 30);
  assert.equal(result.stakePerTrade, 100);

  // 70 wins * 100 * 0.9 = 6300
  assert.equal(result.grossWinsAmount, 6300);
  // 30 losses * 100 = 3000
  assert.equal(result.grossLossesAmount, 3000);
  // Net = 6300 - 3000 = 3300
  assert.equal(result.netMonthlyProfit, 3300);

  // Trader take-home (90%): 3300 * 0.9 = 2970
  assert.equal(result.traderPayout, 2970);
  assert.equal(result.firmShare, 330);

  // ROI on $200 fee: ((2970 - 200) / 200) * 100 = 1385%
  assert.equal(result.roiOnFeePercent, 1385);
});

test('profit simulation handles lower win rate without negative payout', () => {
  const result = calculateProfitSimulation({
    accountSize: 5000,
    winRatePercent: 40, // Losing scenario
    tradesPerDay: 4,
    tradingDaysPerMonth: 20,
    riskPerTradePercent: 2,
    averagePayoutPercent: 90,
    profitSplitPercent: 85,
    challengeFee: 50,
  });

  assert.equal(result.netMonthlyProfit, 0);
  assert.equal(result.traderPayout, 0);
});
