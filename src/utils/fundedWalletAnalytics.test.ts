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
    tier: 'two-step',
    accountType: 'two_step',
    tierName: 'Two-Step Challenge',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10000,
    startingDayEquity: 10000,
    equity: 10000,
    dailyLossLimitPercent: 8,
    maxOverallLossPercent: 20,
    profitTargetPercent: 25,
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

test('buildInitialFundedWalletFromAccount computes rule limits accurately for Two-Step Challenge', () => {
  const acc = makeChallengeAccount();
  const wallet = buildInitialFundedWalletFromAccount(acc, 'user-uuid-1');

  assert.equal(wallet.account_id, 'BFT-88001');
  assert.equal(wallet.user_id, 'user-uuid-1');
  assert.equal(wallet.challenge_type, 'Two-Step Challenge');
  assert.equal(wallet.account_status, 'ACTIVE');
  assert.equal(wallet.initial_balance, 10000);
  assert.equal(wallet.profit_target_percent, 25);
  assert.equal(wallet.profit_target_amount, 2500);
  assert.equal(wallet.daily_drawdown_limit_percent, 8);
  assert.equal(wallet.daily_drawdown_limit_amount, 800);
  assert.equal(wallet.max_drawdown_limit_percent, 20);
  assert.equal(wallet.max_drawdown_limit_amount, 2000);
  assert.equal(wallet.min_profitable_days, 5);
  assert.equal(wallet.completed_profitable_days, 0);
});

test('applyClosedTradeToFundedWallet increments profitable trading days once per calendar day when net profit >= 0.5% of initial balance', () => {
  const acc = makeChallengeAccount();
  const baseTime = Date.parse('2026-11-16T10:00:00.000Z');
  let wallet = buildInitialFundedWalletFromAccount(acc, 'user-1', null, baseTime);

  // Win $30 (< $50 = 0.5% of $10,000) -> does NOT increment profitable day
  const step1 = applyClosedTradeToFundedWallet(wallet, {
    tradePnl: 30,
    nowMs: baseTime + 60_000,
  });
  assert.equal(step1.incrementedProfitableDay, false);
  assert.equal(step1.updatedWallet.completed_profitable_days, 0);
  assert.equal(step1.updatedWallet.current_balance, 10030);
  assert.equal(step1.updatedWallet.current_profit_amount, 30);

  // Win another $25 on the same UTC day -> daily_net_profit = $55 >= $50 -> increments profitable day to 1
  const step2 = applyClosedTradeToFundedWallet(step1.updatedWallet, {
    tradePnl: 25,
    nowMs: baseTime + 120_000,
  });
  assert.equal(step2.incrementedProfitableDay, true);
  assert.equal(step2.updatedWallet.completed_profitable_days, 1);

  // Win another $100 on the SAME calendar day -> still 1 profitable day (strictly once per day)
  const step3 = applyClosedTradeToFundedWallet(step2.updatedWallet, {
    tradePnl: 100,
    nowMs: baseTime + 180_000,
  });
  assert.equal(step3.incrementedProfitableDay, false);
  assert.equal(step3.updatedWallet.completed_profitable_days, 1);

  // Next calendar day: win $60 (>= $50) -> increments profitable day to 2
  const nextDayTime = Date.parse('2026-11-17T09:00:00.000Z');
  const step4 = applyClosedTradeToFundedWallet(step3.updatedWallet, {
    tradePnl: 60,
    nowMs: nextDayTime,
  });
  assert.equal(step4.incrementedProfitableDay, true);
  assert.equal(step4.updatedWallet.completed_profitable_days, 2);
});

test('applyClosedTradeToFundedWallet triggers HARD_BREACH when daily drawdown or max drawdown limit is exceeded', () => {
  const acc = makeChallengeAccount(); // $10,000, 8% ($800) daily DD, 20% ($2,000) max DD
  const baseTime = Date.parse('2026-11-16T10:00:00.000Z');
  const wallet = buildInitialFundedWalletFromAccount(acc, 'user-1', null, baseTime);

  // Loss of $850 exceeds $800 daily drawdown limit -> HARD_BREACH
  const dailyBreachRes = applyClosedTradeToFundedWallet(wallet, {
    tradePnl: -850,
    nowMs: baseTime + 60_000,
  });
  assert.equal(dailyBreachRes.triggeredBreach, 'HARD_BREACH');
  assert.equal(dailyBreachRes.updatedWallet.account_status, 'HARD_BREACH');
  assert.match(dailyBreachRes.updatedWallet.breach_reason || '', /Daily Drawdown Limit Exceeded/i);

  // Multi-day max drawdown exceedance
  const day1 = applyClosedTradeToFundedWallet(wallet, {
    tradePnl: -700, // daily DD $700 (< $800), max DD $700
    nowMs: baseTime + 60_000,
  });
  assert.equal(day1.updatedWallet.account_status, 'ACTIVE');

  const day2 = applyClosedTradeToFundedWallet(day1.updatedWallet, {
    tradePnl: -700, // cumulative loss $1,400 (< $2,000)
    nowMs: Date.parse('2026-11-17T10:00:00.000Z'),
  });
  assert.equal(day2.updatedWallet.account_status, 'ACTIVE');

  const day3 = applyClosedTradeToFundedWallet(day2.updatedWallet, {
    tradePnl: -650, // daily DD $650 (< $800) BUT cumulative max DD $2,050 (> $2,000) -> HARD_BREACH
    nowMs: Date.parse('2026-11-18T10:00:00.000Z'),
  });
  assert.equal(day3.triggeredBreach, 'HARD_BREACH');
  assert.equal(day3.updatedWallet.account_status, 'HARD_BREACH');
  assert.match(day3.updatedWallet.breach_reason || '', /Max Drawdown Limit Exceeded/i);
});

test('applyClosedTradeToFundedWallet triggers SOFT_BREACH with cooldown and resolveFundedWalletBreachState auto-unlocks after expiry', () => {
  const acc = makeChallengeAccount();
  const baseTime = Date.parse('2026-11-16T10:00:00.000Z');
  const wallet = buildInitialFundedWalletFromAccount(acc, 'user-1', null, baseTime);

  const softRes = applyClosedTradeToFundedWallet(wallet, {
    tradePnl: -100,
    nowMs: baseTime,
    minorInfractionReason: 'Minor Rule Infraction: Martingale stake spike cooldown',
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
    challenge_type: 'One-Step Challenge',
    account_status: 'HARD_BREACH',
    breach_reason: 'Max Drawdown Limit Exceeded ($1,550.00 / $1,500.00)',
    initial_balance: 10000,
    current_balance: 8450,
    current_equity: 8450,
    profit_target_percent: 30,
    daily_drawdown_limit_percent: 10,
    max_drawdown_limit_percent: 15,
  });

  const breach = resolveFundedWalletBreachState(row, null, Date.now());
  assert.equal(breach.effectiveStatus, 'HARD_BREACH');
  assert.equal(breach.isHardBreach, true);
  assert.equal(breach.isLaunchBlocked, true);
  assert.equal(breach.shouldAutoUnlock, false);
  assert.match(breach.breachReason || '', /Max Drawdown Limit Exceeded/i);
});

test('resolveLiveFundedAccountMetrics derives live balance, equity, profit split, and drawdown ratios strictly from account and wallet state', () => {
  const acc = makeChallengeAccount({
    id: 'BFT-50K-LIVE',
    size: 50000,
    initialBalance: 50000,
    currentBalance: 54200,
    equity: 54200,
    phase: 'live',
    monthsCompleted: 1,
    scalingActive: false,
  });
  const wallet = normalizeSupabaseFundedWalletRow({
    id: 'w-live-1',
    account_id: 'BFT-50K-LIVE',
    user_id: 'u-1',
    challenge_type: 'Two-Step Challenge',
    account_status: 'ACTIVE',
    initial_balance: 50000,
    current_balance: 54200,
    current_equity: 54500,
    daily_drawdown_limit_percent: 8,
    daily_drawdown_limit_amount: 4000,
    current_daily_drawdown: 400,
    max_drawdown_limit_percent: 20,
    max_drawdown_limit_amount: 10000,
    current_max_drawdown: 500,
    completed_profitable_days: 3,
    min_profitable_days: 5,
  });

  const metrics = resolveLiveFundedAccountMetrics(acc, wallet);
  assert.equal(formatChallengeTierLabel(acc), '$50,000 2-Step Funded');
  assert.equal(metrics.accountId, 'BFT-50K-LIVE');
  assert.equal(metrics.initialBalance, 50000);
  assert.equal(metrics.currentBalance, 54200);
  assert.equal(metrics.liveEquity, 54500);
  assert.equal(metrics.netProfit, 4200);
  assert.equal(metrics.netProfitPercent, 8.4);
  assert.equal(metrics.profitSplitPercent, 80);
  assert.equal(metrics.dailyDrawdownRatio, 10);
  assert.equal(metrics.maxDrawdownRatio, 5);
  assert.equal(metrics.completedProfitableDays, 3);
  assert.equal(metrics.qualifyingDayThresholdUsd, 250);
});

