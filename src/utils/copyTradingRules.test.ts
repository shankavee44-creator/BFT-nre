import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_COPIERS_PER_TRADER,
  MIN_PROVIDER_WIN_RATE_3M,
  ROTATION_INTERVAL_MINUTES,
  LEADERBOARD_TOP_LIMIT,
  TOTAL_TRADER_POOL_SIZE,
  FOLLOWER_PROFIT_SHARE_PERCENT,
  MASTER_COMMISSION_PERCENT,
  evaluateProviderEligibility,
  evaluateSingleAccountCopyEligibility,
  resolveCopierEligibilityForUser,
  validateCopyRiskSettings,
  generate200TraderPool,
  getRotationWindowInfo,
  queryCopyTradersPool,
} from './copyTradingRules';
import { TradingAccount, BinaryTrade, UserProfile } from '../types';

const makeAccount = (overrides: Partial<TradingAccount>): TradingAccount => ({
  id: 'BFT-10001',
  loginId: 'BFT-10001',
  passwordHash: 'hash',
  tier: 'instant',
  accountType: 'instant',
  tierName: '$50K Instant Funded',
  size: 50000,
  currentBalance: 50000,
  initialBalance: 50000,
  startingDayEquity: 50000,
  equity: 50000,
  dailyLossLimitPercent: 6,
  maxOverallLossPercent: 12,
  status: 'active',
  createdDate: '2026-10-01',
  lastActiveDate: '2026-11-01',
  phase: 'funded',
  tradingDaysCompleted: 5,
  tradesCount: 25,
  winRate: 72,
  ...overrides,
});

test('1. Provider Eligibility Gatekeeper enforces >= 60% 3-month (90-day) win rate', () => {
  // Below 60% win rate -> blocked
  const blockedRes = evaluateProviderEligibility({
    explicitWinRate90d: 58.4,
  });
  assert.equal(blockedRes.eligible, false);
  assert.equal(blockedRes.code, 'WIN_RATE_BELOW_60');
  assert.equal(blockedRes.requiredWinRate, MIN_PROVIDER_WIN_RATE_3M);
  assert.match(blockedRes.message, /Registration Blocked/i);

  // Exactly 60% or above -> eligible
  const allowedRes = evaluateProviderEligibility({
    explicitWinRate90d: 60.0,
  });
  assert.equal(allowedRes.eligible, true);
  assert.equal(allowedRes.code, 'ELIGIBLE');

  // Computed from 90-day closed trades (7 wins out of 10 = 70%)
  const now = Date.now();
  const trades: BinaryTrade[] = Array.from({ length: 10 }).map((_, idx) => ({
    id: `tr_${idx}`,
    accountId: 'BFT-50000',
    asset: 'EUR/USD (OTC)',
    direction: 'CALL',
    strikePrice: 1.08,
    currentPrice: 1.09,
    investment: 100,
    payoutPercentage: 85,
    potentialPayout: 185,
    startTime: now - 10 * 24 * 60 * 60 * 1000,
    durationSeconds: 60,
    endTime: now - 10 * 24 * 60 * 60 * 1000 + 60000,
    status: idx < 7 ? 'won' : 'lost',
    accountTier: 'instant',
  }));
  const fromTradesRes = evaluateProviderEligibility({ trades, nowMs: now });
  assert.equal(fromTradesRes.eligible, true);
  assert.equal(fromTradesRes.winRate90d, 70);
  assert.equal(fromTradesRes.tradesEvaluated90d, 10);
});

test('2. Copier Account Eligibility blocks Challenge, Demo, Instant Funded <$25K, and Self-Capital <$100 real balance', () => {
  // Challenge One-Step / Two-Step accounts are strictly barred
  const oneStepAcc = makeAccount({
    id: 'BFT-CHAL-1',
    tier: 'one-step',
    accountType: 'one_step',
    phase: 'phase_1',
    size: 50000,
  });
  const challengeRes = evaluateSingleAccountCopyEligibility({ account: oneStepAcc });
  assert.equal(challengeRes.eligible, false);
  assert.equal(challengeRes.code, 'CHALLENGE_ACCOUNT_BARRED');

  // Demo account is barred
  const demoAcc = makeAccount({
    id: 'BFT-DEMO-001',
    tier: 'demo',
    accountType: 'demo',
    phase: 'demo',
  });
  const demoRes = evaluateSingleAccountCopyEligibility({ account: demoAcc });
  assert.equal(demoRes.eligible, false);
  assert.equal(demoRes.code, 'DEMO_ACCOUNT_BARRED');

  // Instant Funded $10K (< $25K) is blocked
  const instant10k = makeAccount({
    id: 'BFT-IF-10K',
    tier: 'instant',
    accountType: 'instant',
    phase: 'funded',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10000,
  });
  const instant10kRes = evaluateSingleAccountCopyEligibility({ account: instant10k });
  assert.equal(instant10kRes.eligible, false);
  assert.equal(instant10kRes.code, 'INSTANT_FUNDED_BELOW_25K');

  // Instant Funded $25K, $50K, $100K are allowed
  for (const allowedSize of [25000, 50000, 100000]) {
    const instantAllowed = makeAccount({
      id: `BFT-IF-${allowedSize}`,
      tier: 'instant',
      accountType: 'instant',
      phase: 'funded',
      size: allowedSize,
      initialBalance: allowedSize,
      currentBalance: allowedSize,
    });
    const res = evaluateSingleAccountCopyEligibility({ account: instantAllowed });
    assert.equal(res.eligible, true);
    assert.equal(res.code, 'ELIGIBLE_INSTANT_FUNDED');
  }

  // Self-Capital < $100 real balance (e.g., $120 total but $40 is bonus = $80 real) -> blocked
  const selfLowAcc = makeAccount({
    id: 'BFT-PERS-001',
    tier: 'personal',
    accountType: 'self_funded',
    accountCategory: 'personal_live',
    phase: 'personal_live',
    size: 120,
    currentBalance: 120,
  });
  const selfLowRes = evaluateSingleAccountCopyEligibility({
    account: selfLowAcc,
    bonusFunds: 40,
  });
  assert.equal(selfLowRes.eligible, false);
  assert.equal(selfLowRes.code, 'SELF_CAPITAL_BELOW_100');
  assert.equal(selfLowRes.realSelfBalance, 80);

  // Self-Capital >= $100 real balance -> allowed
  const selfOkAcc = makeAccount({
    id: 'BFT-PERS-002',
    tier: 'personal',
    accountType: 'self_funded',
    accountCategory: 'personal_live',
    phase: 'personal_live',
    size: 250,
    currentBalance: 250,
  });
  const selfOkRes = evaluateSingleAccountCopyEligibility({
    account: selfOkAcc,
    bonusFunds: 50,
  });
  assert.equal(selfOkRes.eligible, true);
  assert.equal(selfOkRes.code, 'ELIGIBLE_SELF_CAPITAL');
  assert.equal(selfOkRes.realSelfBalance, 200);

  // resolveCopierEligibilityForUser picks eligible account automatically
  const resolved = resolveCopierEligibilityForUser({
    accounts: [demoAcc, oneStepAcc, instant10k, selfOkAcc],
    userProfile: { selfBalance: 250 } as UserProfile,
    bonusFunds: 50,
  });
  assert.equal(resolved.selectedResult.eligible, true);
  assert.equal(resolved.selectedAccount?.id, 'BFT-PERS-002');
});

test('3. Custom Copy Risk Management validates Per-Trade $ / %, 5% Instant Funded rule, Max Loss Stop, and Target Profit Stop', () => {
  // Valid percentage allocation on $50K Instant Funded (2% = $1,000 per trade)
  const validRes = validateCopyRiskSettings({
    perTradeAllocationType: 'percentage',
    perTradeAllocationValue: 2,
    maxLossStopUsd: 2000,
    targetProfitStopUsd: 5000,
    accountBalance: 50000,
    isInstantFunded: true,
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.perTradeDollarAmount, 1000);
  assert.equal(validRes.perTradePercentOfBalance, 2);

  // Exceeding 5% per trade on Instant Funded is rejected
  const exceed5Pct = validateCopyRiskSettings({
    perTradeAllocationType: 'percentage',
    perTradeAllocationValue: 6,
    maxLossStopUsd: 2000,
    targetProfitStopUsd: 5000,
    accountBalance: 50000,
    isInstantFunded: true,
  });
  assert.equal(exceed5Pct.valid, false);
  assert.match(exceed5Pct.error || '', /cannot exceed 5%/i);

  // Max loss stop exceeding balance is rejected
  const badMaxLoss = validateCopyRiskSettings({
    perTradeAllocationType: 'amount',
    perTradeAllocationValue: 25,
    maxLossStopUsd: 500,
    targetProfitStopUsd: 300,
    accountBalance: 200,
    isInstantFunded: false,
  });
  assert.equal(badMaxLoss.valid, false);
  assert.match(badMaxLoss.error || '', /cannot exceed your account balance/i);
});

test('4. 200-Trader Pool & 45-Minute Dynamic Rotation & Numeric ID Search', () => {
  const t0 = 45 * 60 * 1000 * 650000;
  const pool0 = generate200TraderPool(t0);
  assert.equal(pool0.length, TOTAL_TRADER_POOL_SIZE);

  const instantTraders = pool0.filter((t) => t.account_category === 'instant_funded');
  const selfTraders = pool0.filter((t) => t.account_category === 'self_capital');
  assert.equal(instantTraders.length, 100);
  assert.equal(selfTraders.length, 100);

  // Verify numeric IDs 100101..100300, 200 copier cap, 0% commission, 100% profit keep, and >=60% 3M win rate
  for (const trader of pool0) {
    assert.equal(trader.max_copiers, MAX_COPIERS_PER_TRADER);
    assert.ok(trader.current_copiers <= MAX_COPIERS_PER_TRADER);
    assert.equal(trader.commission_pct, MASTER_COMMISSION_PERCENT);
    assert.equal(trader.follower_profit_keep_pct, FOLLOWER_PROFIT_SHARE_PERCENT);
    assert.ok(trader.win_rate_3m >= MIN_PROVIDER_WIN_RATE_3M);
    assert.ok(trader.daily_profit > 0);
    assert.ok(trader.weekly_profit > 0);
    assert.ok(trader.monthly_profit > 0);
    assert.ok(trader.three_month_profit > 0);
    assert.ok(trader.all_time_withdrawals > 0);
  }

  // Default leaderboard returns Top 10 sorted by daily_profit DESC
  const top10Instant = queryCopyTradersPool({
    pool: pool0,
    category: 'instant_funded',
  });
  assert.equal(top10Instant.traders.length, LEADERBOARD_TOP_LIMIT);
  assert.equal(top10Instant.isSearchActive, false);
  for (let i = 1; i < top10Instant.traders.length; i++) {
    assert.ok(top10Instant.traders[i - 1].daily_profit >= top10Instant.traders[i].daily_profit);
  }

  // Searching by numeric ID finds any trader across the entire 200-trader pool
  const searchByNumeric = queryCopyTradersPool({
    pool: pool0,
    category: 'instant_funded',
    searchQuery: '#100255',
  });
  assert.equal(searchByNumeric.isSearchActive, true);
  assert.ok(searchByNumeric.traders.length >= 1);
  assert.equal(searchByNumeric.traders[0].numeric_id, '100255');

  // 45-minute rotation changes daily profits & Top 10 order
  const tNext45m = t0 + ROTATION_INTERVAL_MINUTES * 60 * 1000;
  const poolNext = generate200TraderPool(tNext45m);
  const top10Next = queryCopyTradersPool({
    pool: poolNext,
    category: 'instant_funded',
  });
  const order0 = top10Instant.traders.map((t) => t.id).join(',');
  const orderNext = top10Next.traders.map((t) => t.id).join(',');
  assert.notEqual(order0, orderNext);

  const rotInfo = getRotationWindowInfo(t0 + 15 * 60 * 1000);
  assert.equal(rotInfo.intervalMinutes, 45);
  assert.equal(rotInfo.secondsUntilNextRotation, 30 * 60);
});
