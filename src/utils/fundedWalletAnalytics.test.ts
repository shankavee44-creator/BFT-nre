import test from 'node:test';
import assert from 'node:assert/strict';
import type { TradingAccount } from '../types/index.ts';
import {
  applyClosedTradeToFundedWallet,
  buildInitialFundedWalletFromAccount,
  formatBreachCountdown,
  formatChallengeTierLabel,
  normalizeSupabaseFundedWalletRow,
  resolveFundedWalletBreachState,
  resolveLiveFundedAccountMetrics,
} from './fundedWalletAnalytics.ts';

function makeChallengeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: 'BFT-88001',
    loginId: 'BFT-88001',
    passwordHash: 'secret123',
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    tierName: 'Funded Challenge',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10000,
    startingDayEquity: 10000,
    equity: 10000,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: 10,
    profitTargetPercent: 30,
    maxRiskPerTradePercent: 5,
    dailyWithdrawalsUnlocked: false,
    monthsCompleted: 0,
    scalingActive: false,
    status: 'active',
    createdDate: '2026-11-16',
    lastActiveDate: '2026-11-16',
    phase: 'phase_1',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    ...overrides,
  };
}

test('buildInitialFundedWalletFromAccount computes unified Funded Challenge limits (30% target, 0% daily cap, 10% max overall loss, 5 qualifying days)', () => {
  const acc = makeChallengeAccount();
  const wallet = buildInitialFundedWalletFromAccount(acc, 'user-uuid-1');

  assert.equal(wallet.account_id, 'BFT-88001');
  assert.equal(wallet.user_id, 'user-uuid-1');
  assert.equal(wallet.challenge_type, 'Funded Challenge');
  assert.equal(wallet.account_status, 'ACTIVE');
  assert.equal(wallet.is_real_funded, false);
  assert.equal(wallet.initial_balance, 10000);
  assert.equal(wallet.profit_target_percent, 30);
  assert.equal(wallet.profit_target_amount, 3000);
  assert.equal(wallet.daily_drawdown_limit_percent, 0);
  assert.equal(wallet.daily_drawdown_limit_amount, 0);
  assert.equal(wallet.max_drawdown_limit_percent, 10);
  assert.equal(wallet.max_drawdown_limit_amount, 1000);
  assert.equal(wallet.min_profitable_days, 5);
  assert.equal(wallet.completed_profitable_days, 0);
});

test('applyClosedTradeToFundedWallet requires >= 1% daily profit per qualifying day and auto-passes ONLY when BOTH 30% profit AND 5 qualifying days are reached', () => {
  const acc = makeChallengeAccount();
  const baseTime = Date.parse('2026-11-16T10:00:00.000Z');
  let wallet = buildInitialFundedWalletFromAccount(acc, 'user-1', null, baseTime);

  // Day 1: Win $80 (< $100 = 1% of $10,000) -> does NOT count as a qualifying day
  const step1 = applyClosedTradeToFundedWallet(wallet, {
    tradePnl: 80,
    nowMs: baseTime + 60_000,
  });
  assert.equal(step1.incrementedProfitableDay, false);
  assert.equal(step1.updatedWallet.completed_profitable_days, 0);

  // Day 1: Win another $25 -> daily_net_profit = $105 >= $100 (1%) -> increments qualifying days to 1
  const step2 = applyClosedTradeToFundedWallet(step1.updatedWallet, {
    tradePnl: 25,
    nowMs: baseTime + 120_000,
  });
  assert.equal(step2.incrementedProfitableDay, true);
  assert.equal(step2.updatedWallet.completed_profitable_days, 1);

  // Day 1: Huge win of $2,900 -> total profit is now $3,005 (>= 30% target), BUT only 1 qualifying day -> MUST NOT PASS YET!
  const step3 = applyClosedTradeToFundedWallet(step2.updatedWallet, {
    tradePnl: 2900,
    nowMs: baseTime + 180_000,
  });
  assert.equal(step3.incrementedProfitableDay, false);
  assert.equal(step3.updatedWallet.completed_profitable_days, 1);
  assert.equal(step3.becamePassed, false);
  assert.equal(step3.updatedWallet.account_status, 'ACTIVE');

  // Complete Days 2, 3, 4 with >= $100 (1%) each -> still ACTIVE until Day 5
  wallet = step3.updatedWallet;
  for (let d = 2; d <= 4; d++) {
    const dayRes = applyClosedTradeToFundedWallet(wallet, {
      tradePnl: 100,
      nowMs: Date.parse(`2026-11-${15 + d}T10:00:00.000Z`),
    });
    assert.equal(dayRes.incrementedProfitableDay, true);
    assert.equal(dayRes.updatedWallet.completed_profitable_days, d);
    assert.equal(dayRes.becamePassed, false);
    wallet = dayRes.updatedWallet;
  }

  // Day 5: Win $100 (>= 1%) -> 5 qualifying days AND >= 30% profit -> auto-marks PASSED!
  const day5 = applyClosedTradeToFundedWallet(wallet, {
    tradePnl: 100,
    nowMs: Date.parse('2026-11-20T10:00:00.000Z'),
  });
  assert.equal(day5.incrementedProfitableDay, true);
  assert.equal(day5.updatedWallet.completed_profitable_days, 5);
  assert.equal(day5.becamePassed, true);
  assert.equal(day5.updatedWallet.account_status, 'PASSED');
  assert.equal(day5.updatedWallet.certificate_unlocked, true);
  assert.ok(day5.updatedWallet.certificate_id);
  assert.ok(day5.updatedWallet.passed_at);
});

test('applyClosedTradeToFundedWallet triggers immediate HARD_BREACH at 10% overall loss without separate daily-only cap', () => {
  const acc = makeChallengeAccount(); // $10,000, 0% daily cap, 10% ($1,000) max overall loss
  const baseTime = Date.parse('2026-11-16T10:00:00.000Z');
  const wallet = buildInitialFundedWalletFromAccount(acc, 'user-1', null, baseTime);

  // Single-day loss of $850 (8.5%) does NOT breach because there is no separate daily-only cap
  const day1 = applyClosedTradeToFundedWallet(wallet, {
    tradePnl: -850,
    nowMs: baseTime + 60_000,
  });
  assert.equal(day1.triggeredBreach, null);
  assert.equal(day1.updatedWallet.account_status, 'ACTIVE');

  // Additional loss of $150 reaches exact 10% ($1,000) max overall loss -> immediate HARD_BREACH
  const day2 = applyClosedTradeToFundedWallet(day1.updatedWallet, {
    tradePnl: -150,
    nowMs: Date.parse('2026-11-17T10:00:00.000Z'),
  });
  assert.equal(day2.triggeredBreach, 'HARD_BREACH');
  assert.equal(day2.updatedWallet.account_status, 'HARD_BREACH');
  assert.match(day2.updatedWallet.breach_reason || '', /Max Overall Loss Limit Exceeded/i);
});

test('applyClosedTradeToFundedWallet triggers SOFT_BREACH with cooldown and resolveFundedWalletBreachState auto-unlocks after expiry', () => {
  const acc = makeChallengeAccount();
  const baseTime = Date.parse('2026-11-16T10:00:00.000Z');
  const wallet = buildInitialFundedWalletFromAccount(acc, 'user-1', null, baseTime);

  const softRes = applyClosedTradeToFundedWallet(wallet, {
    tradePnl: -100,
    nowMs: baseTime,
    minorInfractionReason: 'Economic News Window Cooldown',
    softBreachCooldownMs: 4 * 3600 * 1000 + 12 * 60 * 1000 + 30 * 1000, // 04:12:30
  });

  assert.equal(softRes.triggeredBreach, 'SOFT_BREACH');
  assert.equal(softRes.updatedWallet.account_status, 'SOFT_BREACH');
  assert.ok(softRes.updatedWallet.soft_breach_until);

  const lockedState = resolveFundedWalletBreachState(softRes.updatedWallet, acc, baseTime);
  assert.equal(lockedState.effectiveStatus, 'SOFT_BREACH');
  assert.equal(lockedState.isLaunchBlocked, true);
  assert.equal(lockedState.isSoftBreach, true);
  assert.equal(lockedState.countdownFormatted, '04:12:30');
  assert.equal(lockedState.shouldAutoUnlock, false);

  // After timer expires, Launch Terminal auto-unlocks back to ACTIVE
  const afterExpiryMs = Date.parse(softRes.updatedWallet.soft_breach_until!) + 1000;
  const unlockedState = resolveFundedWalletBreachState(softRes.updatedWallet, acc, afterExpiryMs);
  assert.equal(unlockedState.effectiveStatus, 'ACTIVE');
  assert.equal(unlockedState.isLaunchBlocked, false);
  assert.equal(unlockedState.isSoftBreach, false);
  assert.equal(unlockedState.shouldAutoUnlock, true);
});

test('resolveFundedWalletBreachState enforces permanent HARD_BREACH and formatBreachCountdown formats HH:MM:SS', () => {
  assert.equal(formatBreachCountdown(0), '00:00:00');
  assert.equal(formatBreachCountdown((4 * 3600 + 12 * 60 + 30) * 1000), '04:12:30');

  const row = normalizeSupabaseFundedWalletRow({
    id: 'row-1',
    account_id: 'BFT-99001',
    user_id: 'u-1',
    challenge_type: 'Funded Challenge',
    account_status: 'HARD_BREACH',
    breach_reason: '10% Max Overall Loss Limit Exceeded ($1,050.00 / $1,000.00)',
    initial_balance: 10000,
    current_balance: 8950,
    current_equity: 8950,
    profit_target_percent: 30,
    daily_drawdown_limit_percent: 0,
    max_drawdown_limit_percent: 10,
  });

  const breach = resolveFundedWalletBreachState(row, null, Date.now());
  assert.equal(breach.effectiveStatus, 'HARD_BREACH');
  assert.equal(breach.isHardBreach, true);
  assert.equal(breach.isLaunchBlocked, true);
  assert.equal(breach.shouldAutoUnlock, false);
  assert.match(breach.breachReason || '', /Max Overall Loss Limit Exceeded/i);
});

test('resolveLiveFundedAccountMetrics derives live balance, equity, profit split, and 1% qualifying day threshold accurately', () => {
  const acc = makeChallengeAccount({
    id: 'BFT-50K-LIVE',
    size: 50000,
    initialBalance: 50000,
    currentBalance: 54200,
    equity: 54200,
    phase: 'funded',
    isRealFunded: true,
    is_real_funded: true,
    monthsCompleted: 1,
    scalingActive: false,
  });
  const wallet = normalizeSupabaseFundedWalletRow({
    id: 'w-live-1',
    account_id: 'BFT-50K-LIVE',
    user_id: 'u-1',
    challenge_type: 'Real Funded Account',
    is_real_funded: true,
    account_status: 'ACTIVE',
    initial_balance: 50000,
    current_balance: 54200,
    current_equity: 54500,
    daily_drawdown_limit_percent: 0,
    daily_drawdown_limit_amount: 0,
    current_daily_drawdown: 0,
    max_drawdown_limit_percent: 10,
    max_drawdown_limit_amount: 5000,
    current_max_drawdown: 500,
    completed_profitable_days: 3,
    min_profitable_days: 5,
  });

  const metrics = resolveLiveFundedAccountMetrics(acc, wallet);
  assert.equal(formatChallengeTierLabel(acc), '$50,000 Real Funded');
  assert.equal(metrics.accountId, 'BFT-50K-LIVE');
  assert.equal(metrics.initialBalance, 50000);
  assert.equal(metrics.currentBalance, 54200);
  assert.equal(metrics.liveEquity, 54500);
  assert.equal(metrics.netProfit, 4200);
  assert.equal(metrics.netProfitPercent, 8.4);
  assert.equal(metrics.isRealFunded, true);
  assert.equal(metrics.principalLocked, true);
  assert.equal(metrics.profitSplitPercent, 90);
  assert.equal(metrics.maxWithdrawableProfit, 3780); // 90% of $4,200 earned net profit
  assert.equal(metrics.dailyDrawdownLimitPercent, 0);
  assert.equal(metrics.maxDrawdownLimitPercent, 10);
  assert.equal(metrics.maxDrawdownRatio, 10);
  assert.equal(metrics.completedProfitableDays, 3);
  assert.equal(metrics.qualifyingDayThresholdUsd, 500); // 1% of $50,000
});
