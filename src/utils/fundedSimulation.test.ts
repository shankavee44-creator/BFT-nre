import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChallengeCertificateData,
  formatChallengeTierLabel,
  resolveLiveFundedAccountMetrics,
  runFundedGrowthSimulation,
} from './fundedSimulation.ts';
import type { TradingAccount } from '../types/index.ts';
import type { PurchasedFundedWallet } from './fundedWalletAnalytics.ts';

function makeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: 'BFT-2S-50000',
    loginId: 'BFT-2S-50000',
    passwordHash: 'secret',
    tier: 'two-step',
    accountType: 'two_step',
    tierName: 'Two-Step Challenge',
    size: 50000,
    initialBalance: 50000,
    currentBalance: 54250,
    startingDayEquity: 54250,
    equity: 54500,
    dailyLossLimitPercent: 8,
    maxOverallLossPercent: 20,
    status: 'active',
    phase: 'funded',
    tradingDaysCompleted: 5,
    tradesCount: 18,
    winRate: 66.7,
    monthsCompleted: 1,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-11-16',
    ...overrides,
  };
}

test('formatChallengeTierLabel formats 2-step, 1-step, and instant tiers cleanly', () => {
  assert.equal(formatChallengeTierLabel({ tier: 'two-step', size: 50000 }), '$50,000 2-Step Funded');
  assert.equal(formatChallengeTierLabel({ tier: 'one-step', size: 25000 }), '$25,000 1-Step Funded');
  assert.equal(formatChallengeTierLabel({ tier: 'instant', size: 10000 }), '$10,000 Instant Funded');
});

test('buildChallengeCertificateData dynamically constructs Trader Name, Tier, Pass Date, and Verification ID', () => {
  const data = buildChallengeCertificateData({
    traderName: 'Ishan Kavisha',
    passedAccount: makeAccount({ id: 'BFT-CH-908', size: 50000, tier: 'two-step' }),
    deployedAccount: makeAccount({ id: 'BFT-FUND-908', size: 50000, tier: 'two-step', monthsCompleted: 1 }),
    certificateId: 'BFT-CERT-2S50K',
    passDate: '2026-11-16T10:00:00Z',
  });

  assert.equal(data.traderName, 'Ishan Kavisha');
  assert.equal(data.challengeTier, '$50,000 2-Step Funded');
  assert.equal(data.verificationId, 'BFT-CERT-2S50K');
  assert.equal(data.profitSplitPercent, 80);
  assert.match(data.passDateFormatted, /Nov/i);
  assert.match(data.passDateFormatted, /2026/);
});

test('resolveLiveFundedAccountMetrics prioritizes live Supabase wallet numbers and computes drawdown ratios', () => {
  const acc = makeAccount({ monthsCompleted: 1 });
  const wallet: PurchasedFundedWallet = {
    id: 'w_1',
    account_id: 'BFT-2S-50000',
    user_id: 'usr_1',
    challenge_type: 'Two-Step Challenge',
    account_status: 'ACTIVE',
    soft_breach_until: null,
    breach_reason: null,
    initial_balance: 50000,
    current_balance: 56400,
    current_equity: 56650,
    current_profit_amount: 6400,
    profit_target_amount: 0,
    profit_target_percent: 0,
    current_daily_drawdown: 1000,
    daily_drawdown_limit_amount: 4000,
    daily_drawdown_limit_percent: 8,
    current_max_drawdown: 2000,
    max_drawdown_limit_amount: 10000,
    max_drawdown_limit_percent: 20,
    completed_profitable_days: 4,
    min_profitable_days: 5,
    daily_net_profit: 650,
    daily_profit_date: '2026-11-16',
    last_profitable_day_date: '2026-11-16',
    starting_day_balance: 56400,
    updated_at: '2026-11-16T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
  };

  const metrics = resolveLiveFundedAccountMetrics(acc, wallet);
  assert.equal(metrics.initialBalance, 50000);
  assert.equal(metrics.currentBalance, 56400);
  assert.equal(metrics.liveEquity, 56650);
  assert.equal(metrics.netProfit, 6400);
  assert.equal(metrics.profitSplitPercent, 80);
  assert.equal(metrics.dailyDrawdownRatio, 25); // 1000 / 4000
  assert.equal(metrics.maxDrawdownRatio, 20); // 2000 / 10000
  assert.equal(metrics.qualifyingDayThresholdUsd, 250); // 0.5% of 50000
});

test('runFundedGrowthSimulation projects compound capital scaling, 0.5% profitable days, and 80% -> 90% profit split transition', () => {
  const sim = runFundedGrowthSimulation({
    initialCapital: 50000,
    monthlyReturnPercent: 10,
    horizonMonths: 6,
    profitSplitPercent: 80,
    reinvestRatioPercent: 50,
  });

  assert.equal(sim.timeline.length, 6);
  // Month 1: 50,000 * 10% = $5,000 gross, 80% split = $4,000 trader share, 50% reinvested = $2,000, payout = $2,000
  assert.equal(sim.timeline[0].monthlyGrossProfit, 5000);
  assert.equal(sim.timeline[0].effectiveSplitPercent, 80);
  assert.equal(sim.timeline[0].reinvestedProfit, 2000);
  assert.equal(sim.timeline[0].traderPayout, 2000);
  assert.equal(sim.timeline[0].endingEquity, 52000);
  assert.equal(sim.timeline[0].qualifyingTradingDays, 20); // 10% / 0.5% = 20 days

  // Month 4+ upgrades automatically to 90% split under BFT 3-Month Scaling Plan
  assert.equal(sim.timeline[2].effectiveSplitPercent, 80);
  assert.equal(sim.timeline[3].effectiveSplitPercent, 90);
  assert.equal(sim.finalProfitSplitPercent, 90);

  // Monotonic growth & payout accumulation
  for (let i = 1; i < sim.timeline.length; i++) {
    assert.ok(sim.timeline[i].endingEquity > sim.timeline[i - 1].endingEquity);
    assert.ok(sim.timeline[i].cumulativePayouts > sim.timeline[i - 1].cumulativePayouts);
  }
  assert.equal(sim.totalQualifyingDays, 120);
});

test('runFundedGrowthSimulation handles 0% return and caps qualifying trading days at 22/month', () => {
  const flatSim = runFundedGrowthSimulation({
    initialCapital: 25000,
    monthlyReturnPercent: 0,
    horizonMonths: 4,
  });
  assert.equal(flatSim.endingEquity, 25000);
  assert.equal(flatSim.totalTraderPayouts, 0);
  assert.equal(flatSim.totalQualifyingDays, 0);

  const highSim = runFundedGrowthSimulation({
    initialCapital: 10000,
    monthlyReturnPercent: 30,
    horizonMonths: 3,
  });
  assert.equal(highSim.timeline[0].qualifyingTradingDays, 22);
});
