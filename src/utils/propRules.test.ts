import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWithdrawalRequest,
  isValidTradeDuration,
  isPositionSizeSpike,
  isDuringRestrictedNewsWindow,
  calculateDrawdownMetrics,
  evaluateWithdrawalGuarantee,
  generateAccountCredentials,
  isMartingalePattern,
  isHedgingViolation,
  isRiskBarricadeActive,
  evaluateAccountBreach,
  resetSoftBreachedAccount,
  calculateDiscountedPrice,
  calculateWithdrawalBreakdown,
  checkMaxRiskPerTradeViolation,
  advanceChallengeAccountPhase,
  checkFirstWithdrawalWaitingPeriod,
  createDefaultPersonalLiveAccount,
  isPersonalLiveAccount,
  getAccountStatusBadgeLabel,
  MIN_WITHDRAWAL_PROFIT,
  FIRST_WITHDRAWAL_WAITING_DAYS,
  WITHDRAWAL_GUARANTEE_NOTICE,
  PACKAGES,
} from './propRules';
import { TradingAccount, WithdrawalRequest, BinaryTrade } from '../types';

test('packages catalog contains all 3 tiers with exact BFT trading objectives', () => {
  const oneStep = PACKAGES.filter((p) => p.tier === 'one-step');
  const twoStep = PACKAGES.filter((p) => p.tier === 'two-step');
  const instant = PACKAGES.filter((p) => p.tier === 'instant');

  assert.equal(oneStep.length, 6);
  assert.equal(twoStep.length, 6);
  assert.equal(instant.length, 6);

  // One-Step: 30% Profit Target, 10% Daily DD, 15% Max DD, 5% Max Risk/Trade, 5 Profitable Days
  const os10k = oneStep.find((p) => p.size === 10000);
  assert.ok(os10k);
  assert.equal(os10k.profitTarget, 30);
  assert.equal(os10k.maxDailyDrawdown, 10);
  assert.equal(os10k.maxOverallLoss, 15);
  assert.equal(os10k.maxRiskPerTradePercent, 5);
  assert.equal(os10k.profitDaysRequirement, 5);

  // Two-Step: 25% Phase 1, 15% Phase 2, 8% Daily DD, 20% Max DD, 5% Max Risk/Trade, 5 Profitable Days
  const ts10k = twoStep.find((p) => p.size === 10000);
  assert.ok(ts10k);
  assert.equal(ts10k.profitTarget, 25);
  assert.equal(ts10k.step2Target, 15);
  assert.equal(ts10k.maxDailyDrawdown, 8);
  assert.equal(ts10k.maxOverallLoss, 20);
  assert.equal(ts10k.maxRiskPerTradePercent, 5);
  assert.equal(ts10k.profitDaysRequirement, 5);

  // Instant Funded: 0% Target, 6% Daily DD, 12% Overall DD, 5% Max Risk/Trade
  const inst10k = instant.find((p) => p.size === 10000);
  assert.ok(inst10k);
  assert.equal(inst10k.profitTarget, 0);
  assert.equal(inst10k.maxDailyDrawdown, 6);
  assert.equal(inst10k.maxOverallLoss, 12);
  assert.equal(inst10k.maxRiskPerTradePercent, 5);
});

test('promo codes SPOOKY40 (40% OFF) and SPOOKY20 (20% OFF) and +15% daily withdrawal add-on calculate accurately', () => {
  // Base $100 with SPOOKY40 (40% OFF) -> $60
  const p40 = calculateDiscountedPrice(100, 'SPOOKY40');
  assert.equal(p40.discountedBasePrice, 60);
  assert.equal(p40.finalTotal, 60);

  // Base $100 with SPOOKY20 (20% OFF) -> $80
  const p20 = calculateDiscountedPrice(100, 'SPOOKY20');
  assert.equal(p20.discountedBasePrice, 80);
  assert.equal(p20.finalTotal, 80);

  // Base $100 with SPOOKY40 ($60) + 15% Daily Withdrawals Add-on (+$9) = $69
  const pWithAddon = calculateDiscountedPrice(100, 'SPOOKY40', { dailyWithdrawalsAddon: true });
  assert.equal(pWithAddon.dailyAddonAmount, 9);
  assert.equal(pWithAddon.finalTotal, 69);
});

test('withdrawal breakdown deducts 10% withdrawal fee and upgrades split from 80% to 90% after 3 months', () => {
  // Month 1: 80% split, $500 requested -> $50 fee (10%) -> $450 net received
  const m1 = calculateWithdrawalBreakdown(500, 1);
  assert.equal(m1.profitSplitPercent, 80);
  assert.equal(m1.scalingPlanActive, false);
  assert.equal(m1.withdrawalFeeAmount, 50);
  assert.equal(m1.netPayoutToReceive, 450);
  assert.equal(m1.affiliateWithdrawalBonus8Percent, 40);

  // Month 3+: 90% split + Scaling Plan active
  const m3 = calculateWithdrawalBreakdown(500, 3);
  assert.equal(m3.profitSplitPercent, 90);
  assert.equal(m3.scalingPlanActive, true);
  assert.equal(m3.withdrawalFeeAmount, 50);
  assert.equal(m3.netPayoutToReceive, 450);
});

test('5% max risk per trade validation detects hard breach violations', () => {
  // $10,000 capital -> 5% max risk is $500
  const okTrade = checkMaxRiskPerTradeViolation(300, 10000, 5);
  assert.equal(okTrade.violated, false);
  assert.equal(okTrade.maxAllowedStake, 500);

  const breachTrade = checkMaxRiskPerTradeViolation(600, 10000, 5);
  assert.equal(breachTrade.violated, true);
  assert.equal(breachTrade.stakePercent, 6);
});

test('advanceChallengeAccountPhase locks passed phase and deploys clean Phase 2 or Real Funded account', () => {
  const oneStepAcc: TradingAccount = {
    id: 'BFT-11111',
    loginId: 'BFT-11111',
    passwordHash: 'pass',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 13000,
    startingDayEquity: 12500,
    equity: 13000,
    dailyLossLimitPercent: 10,
    maxOverallLossPercent: 15,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-25',
    phase: 'phase_1',
    tradingDaysCompleted: 5,
    tradesCount: 20,
    winRate: 75,
  };

  const res = advanceChallengeAccountPhase(oneStepAcc);
  assert.equal(res.lockedAccount.status, 'passed');
  assert.ok(res.certificateId);
  assert.equal(res.isRealFundedDeployed, true);
  assert.equal(res.deployedAccount.phase, 'funded');
  assert.equal(res.deployedAccount.currentBalance, 13000);
});

test('withdrawal validation requires strict minimum $250 profit threshold and enforces 14-day first withdrawal lock', () => {
  assert.equal(MIN_WITHDRAWAL_PROFIT, 250);
  assert.equal(FIRST_WITHDRAWAL_WAITING_DAYS, 14);
  assert.equal(WITHDRAWAL_GUARANTEE_NOTICE, 'We process payouts within 3 minutes; if we fail, we pay double!');

  const mockAccount: TradingAccount = {
    id: 'BFT-1001',
    loginId: 'BFT-1001',
    passwordHash: 'secret123',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10180, // Only $180 profit (< $250 minimum)
    startingDayEquity: 10000,
    equity: 10180,
    dailyLossLimitPercent: 6,
    maxOverallLossPercent: 12,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-24',
    phase: 'funded',
    tradingDaysCompleted: 14,
    tradesCount: 12,
    winRate: 75,
    dailyWithdrawalsUnlocked: true,
  };

  // $180 profit is below $250 threshold
  const result1 = validateWithdrawalRequest(mockAccount, 180);
  assert.equal(result1.valid, false);
  assert.equal(result1.code, 'BELOW_MIN_PROFIT');

  // When account has $450 profit
  mockAccount.currentBalance = 10450;
  mockAccount.equity = 10450;

  // Requesting $200 is below minimum amount $250
  const result2 = validateWithdrawalRequest(mockAccount, 200);
  assert.equal(result2.valid, false);
  assert.equal(result2.code, 'AMOUNT_TOO_LOW');

  // Requesting $250 (exact minimum threshold) or $350 (within profit of $450)
  const resultMin = validateWithdrawalRequest(mockAccount, 250);
  assert.equal(resultMin.valid, true);

  const result3 = validateWithdrawalRequest(mockAccount, 350);
  assert.equal(result3.valid, true);

  // Requesting more than total profits ($500 > $450)
  const result4 = validateWithdrawalRequest(mockAccount, 500);
  assert.equal(result4.valid, false);
  assert.equal(result4.code, 'EXCEEDS_PROFIT');

  // Check mandatory 14-day waiting period on first withdrawal when tradingDaysCompleted < 14
  const newFundedAcc: TradingAccount = {
    ...mockAccount,
    createdDate: '2026-10-25',
    tradingDaysCompleted: 4,
    firstWithdrawalCompleted: false,
  };
  const lockCheck = checkFirstWithdrawalWaitingPeriod(newFundedAcc, Date.UTC(2026, 9, 28));
  assert.equal(lockCheck.eligible, false);
  assert.equal(lockCheck.daysRemaining, 10);
  assert.match(lockCheck.subsequentCycleLabel, /Daily Withdrawals/);

  const blockedFirst = validateWithdrawalRequest(newFundedAcc, 250, {
    enforceFirstWithdrawalLock: true,
    nowMs: Date.UTC(2026, 9, 28),
  });
  assert.equal(blockedFirst.valid, false);
  assert.equal(blockedFirst.code, 'FIRST_WITHDRAWAL_14_DAY_LOCK');
});

test('trade duration rule enforces >= 30 seconds to prevent tick scalping', () => {
  assert.equal(isValidTradeDuration(10), false);
  assert.equal(isValidTradeDuration(29), false);
  assert.equal(isValidTradeDuration(30), true);
  assert.equal(isValidTradeDuration(60), true);
  assert.equal(isValidTradeDuration(180), true);
});

test('position size spike flags sudden 5x volume jumps', () => {
  const history = [20, 25, 20, 15]; // avg ~ 20
  assert.equal(isPositionSizeSpike(30, history), false);
  assert.equal(isPositionSizeSpike(80, history), false);
  assert.equal(isPositionSizeSpike(100, history), true); // 5x average
  assert.equal(isPositionSizeSpike(150, history), true);
});

test('news trading rule flags trades within 2 minutes of high-impact event', () => {
  const newsTime = 1700000000000;
  const highImpactNews = [
    { title: 'US Non-Farm Payrolls (NFP)', timestamp: newsTime, impact: 'HIGH' as const },
    { title: 'Minor Speech', timestamp: newsTime + 5000000, impact: 'LOW' as const },
  ];

  // 1 minute before news -> restricted
  const res1 = isDuringRestrictedNewsWindow(newsTime - 60 * 1000, highImpactNews, 2);
  assert.equal(res1.restricted, true);

  // 1 minute after news -> restricted
  const res2 = isDuringRestrictedNewsWindow(newsTime + 60 * 1000, highImpactNews, 2);
  assert.equal(res2.restricted, true);

  // 5 minutes before news -> safe
  const res3 = isDuringRestrictedNewsWindow(newsTime - 5 * 60 * 1000, highImpactNews, 2);
  assert.equal(res3.restricted, false);
});

test('drawdown metrics calculate daily and overall loss accurately', () => {
  const account: TradingAccount = {
    id: 'BFT-999',
    loginId: 'BFT-999',
    passwordHash: 'pass',
    tier: 'one-step',
    tierName: 'One-Step',
    size: 10000,
    initialBalance: 10000,
    startingDayEquity: 10000,
    currentBalance: 9650,
    equity: 9650, // $350 loss = 3.5%
    dailyLossLimitPercent: 4,
    maxOverallLossPercent: 7,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-24',
    phase: 'phase_1',
    tradingDaysCompleted: 1,
    tradesCount: 4,
    winRate: 50,
  };

  const metrics = calculateDrawdownMetrics(account);
  assert.equal(metrics.dailyDrawdownPercent, 3.5);
  assert.equal(metrics.isDailyBreached, false);

  // If equity drops to $9550 ($450 loss = 4.5% > 4% limit)
  account.equity = 9550;
  const breachedMetrics = calculateDrawdownMetrics(account);
  assert.equal(breachedMetrics.dailyDrawdownPercent, 4.5);
  assert.equal(breachedMetrics.isDailyBreached, true);
  assert.equal(breachedMetrics.isBreached, true);
});

test('double payout guarantee triggers if withdrawal exceeds 180 seconds', () => {
  const req: WithdrawalRequest = {
    id: 'w-1',
    accountId: 'BFT-1001',
    amount: 250,
    trc20Address: 'TYsD...',
    requestedAt: 1000,
    status: 'processing',
    isDoublePayoutEligible: true,
    timeElapsedSeconds: 190,
  };

  // Under 180 seconds (150s elapsed)
  const result1 = evaluateWithdrawalGuarantee(req, 1000 + 150 * 1000);
  assert.equal(result1.isDoubled, false);
  assert.equal(result1.payoutAmount, 250);

  // Over 180 seconds (190s elapsed)
  const result2 = evaluateWithdrawalGuarantee(req, 1000 + 190 * 1000);
  assert.equal(result2.isDoubled, true);
  assert.equal(result2.payoutAmount, 500); // Doubled!
});

test('generateAccountCredentials outputs BFT prefix and secure credentials', () => {
  const creds = generateAccountCredentials('BFT');
  assert.match(creds.loginId, /^BFT-\d{5}$/);
  assert.ok(creds.password.length >= 8);
});

test('isMartingalePattern detects explosive doubling following a loss', () => {
  const pastTrades: BinaryTrade[] = [
    {
      id: 't-1',
      accountId: 'acc-1',
      asset: 'EUR/USD',
      direction: 'CALL',
      strikePrice: 1.085,
      currentPrice: 1.084,
      investment: 50,
      payoutPercentage: 88,
      potentialPayout: 44,
      startTime: 1000,
      durationSeconds: 60,
      endTime: 2000,
      status: 'lost',
    },
  ];

  // Normal stake ($50 or $60) is NOT martingale
  assert.equal(isMartingalePattern(50, pastTrades).detected, false);
  assert.equal(isMartingalePattern(60, pastTrades).detected, false);

  // Doubling to $100 (2x) or $150 (3x) IS martingale
  const flagged = isMartingalePattern(100, pastTrades);
  assert.equal(flagged.detected, true);
  assert.equal(flagged.multiplier, 2);

  // If previous trade was WON, doubling is NOT a martingale loss-chasing violation
  pastTrades[0].status = 'won';
  assert.equal(isMartingalePattern(100, pastTrades).detected, false);
});

test('isHedgingViolation flags simultaneous opposing directions on same asset', () => {
  const activeTrades: BinaryTrade[] = [
    {
      id: 't-call',
      accountId: 'acc-1',
      asset: 'BTC/USD',
      direction: 'CALL',
      strikePrice: 65000,
      currentPrice: 65100,
      investment: 50,
      payoutPercentage: 88,
      potentialPayout: 44,
      startTime: 1000,
      durationSeconds: 60,
      endTime: 5000,
      status: 'active',
    },
  ];

  // Opening another CALL on BTC/USD is fine
  assert.equal(isHedgingViolation('CALL', 'BTC/USD', activeTrades).detected, false);

  // Opening PUT on BTC/USD while CALL is active is a Hedging violation!
  const hedgeViolation = isHedgingViolation('PUT', 'BTC/USD', activeTrades);
  assert.equal(hedgeViolation.detected, true);

  // Opening PUT on a different asset (e.g. EUR/USD) is fine
  assert.equal(isHedgingViolation('PUT', 'EUR/USD', activeTrades).detected, false);
});

test('isRiskBarricadeActive blocks trading at 80% loss threshold', () => {
  // Daily limit = 4%, current loss = 2.5% (62.5% ratio -> not barricaded)
  const check1 = isRiskBarricadeActive(2.5, 4, 2.5, 8, 0.8);
  assert.equal(check1.barricaded, false);

  // Daily limit = 4%, current loss = 3.3% (82.5% ratio -> BARRICADED!)
  const check2 = isRiskBarricadeActive(3.3, 4, 3.3, 8, 0.8);
  assert.equal(check2.barricaded, true);
  assert.match(check2.reason || '', /Risk Barricade Active/);

  // Overall limit = 7%, current overall loss = 5.8% (82.8% ratio -> BARRICADED!)
  const check3 = isRiskBarricadeActive(1.0, 4, 5.8, 7, 0.8);
  assert.equal(check3.barricaded, true);
});

test('evaluateAccountBreach triggers auto-breach when loss limits are crossed', () => {
  const account: TradingAccount = {
    id: 'BFT-999',
    loginId: 'BFT-999',
    passwordHash: 'pass123',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 9650,
    startingDayEquity: 10000,
    equity: 9650, // 3.5% daily drawdown (< 4% limit)
    dailyLossLimitPercent: 4,
    maxOverallLossPercent: 7,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-24',
    phase: 'phase_1',
    tradingDaysCompleted: 2,
    tradesCount: 10,
    winRate: 60,
  };

  // Safe state
  const evalSafe = evaluateAccountBreach(account);
  assert.equal(evalSafe.isBreached, false);

  // Daily breach: equity drops to $9580 ($420 loss = 4.2% > 4%) -> Soft Breach
  account.equity = 9580;
  const evalDaily = evaluateAccountBreach(account);
  assert.equal(evalDaily.isBreached, true);
  assert.equal(evalDaily.breachCategory, 'soft');
  assert.equal(evalDaily.breachType, 'DAILY_LOSS');
  assert.ok(evalDaily.autoUnlockTimestamp);
  assert.ok(evalDaily.violationLog);
  assert.equal(evalDaily.violationLog.rule, 'DAILY_LOSS');

  // Test soft breach reset
  const softBreachedAccount: TradingAccount = {
    ...account,
    status: 'soft-breached',
    breachType: 'soft',
    softBreachResetTime: Date.now() + 3600000,
  };
  const unbreached = resetSoftBreachedAccount(softBreachedAccount);
  assert.equal(unbreached.status, 'active');
  assert.equal(unbreached.breachType, 'none');

  // Overall breach: equity drops to $9200 ($800 loss = 8.0% > 7%) -> Hard Breach
  account.equity = 9200;
  account.startingDayEquity = 9400; // Reset startingDay so only overall triggers
  account.dailyLossLimitPercent = 10;
  account.maxOverallLossPercent = 7;
  const evalOverall = evaluateAccountBreach(account);
  assert.equal(evalOverall.isBreached, true);
  assert.equal(evalOverall.breachCategory, 'hard');
  assert.equal(evalOverall.breachType, 'OVERALL_LOSS');
  assert.equal(evalOverall.violationLog?.rule, 'OVERALL_LOSS');
});

test('Personal Live account bypasses prop drawdown locks and allows 100% capital + profit withdrawal with $250 min and 10% fee', () => {
  const personalAcc = createDefaultPersonalLiveAccount('usr_bft_001', 'alex.mercer@bft-trader.io', 1250);
  assert.equal(isPersonalLiveAccount(personalAcc), true);
  assert.equal(getAccountStatusBadgeLabel(personalAcc), 'PERSONAL LIVE');
  assert.equal(personalAcc.dailyLossLimitPercent, 0);
  assert.equal(personalAcc.maxOverallLossPercent, 0);

  // Even after a 50% balance drop, Personal Live account never triggers prop drawdown breach
  personalAcc.currentBalance = 600;
  personalAcc.equity = 600;
  const ddMetrics = calculateDrawdownMetrics(personalAcc);
  assert.equal(ddMetrics.isDailyBreached, false);
  assert.equal(ddMetrics.isOverallBreached, false);
  assert.equal(ddMetrics.isBreached, false);
  assert.equal(evaluateAccountBreach(personalAcc).isBreached, false);

  // Can still withdraw capital ($400) even when currentBalance ($600) is below initial deposit ($1,250)
  const validCapWithdrawal = validateWithdrawalRequest(personalAcc, 400, {
    enforceFirstWithdrawalLock: true,
  });
  assert.equal(validCapWithdrawal.valid, true);

  // Minimum $250 threshold still enforced on Personal Live account
  const belowMin = validateWithdrawalRequest(personalAcc, 150);
  assert.equal(belowMin.valid, false);
  assert.equal(belowMin.code, 'AMOUNT_TOO_LOW');

  // Cannot withdraw more than available Personal Live balance
  const exceedsBal = validateWithdrawalRequest(personalAcc, 750);
  assert.equal(exceedsBal.valid, false);
  assert.equal(exceedsBal.code, 'EXCEEDS_BALANCE');

  // Withdrawal breakdown shows 100% retention and 10% standard fee
  const breakdown = calculateWithdrawalBreakdown(400, 0, true);
  assert.equal(breakdown.profitSplitPercent, 100);
  assert.equal(breakdown.withdrawalFeeAmount, 40);
  assert.equal(breakdown.netPayoutToReceive, 360);
});

