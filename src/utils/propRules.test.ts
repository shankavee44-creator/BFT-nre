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
  validatePromoCode,
  PROMO_CODES,
  calculateWithdrawalBreakdown,
  checkMaxRiskPerTradeViolation,
  evaluateFundedTradeRiskRules,
  advanceChallengeAccountPhase,
  checkFirstWithdrawalWaitingPeriod,
  createDefaultPersonalLiveAccount,
  isPersonalLiveAccount,
  isRealFundedAccount,
  isPassedChallengeAccount,
  resolveAccountBadgeMeta,
  calculateRealFundedWithdrawalAllowance,
  getAccountStatusBadgeLabel,
  getDynamicAccountLimits,
  normalizeChallengeAccountType,
  getChallengeProfitTarget,
  sanitizeAccountForAntiBreach,
  calculateLiveAccountEquity,
  validateZeroToleranceTradeExecution,
  liquidateActiveTradesOnSoftBreach,
  evaluateRealtimeTradingEngine,
  MIN_WITHDRAWAL_PROFIT,
  FIRST_WITHDRAWAL_WAITING_DAYS,
  STANDARD_WITHDRAWAL_FREQUENCY,
  WITHDRAWAL_GUARANTEE_NOTICE,
  PACKAGES,
} from './propRules';
import { TradingAccount, WithdrawalRequest, BinaryTrade } from '../types';

test('packages catalog contains exact 6 unified Funded Challenge packages and criteria', () => {
  assert.equal(PACKAGES.length, 6);
  const expected: Array<[number, number]> = [
    [5000, 49],
    [10000, 89],
    [25000, 199],
    [50000, 329],
    [100000, 549],
    [200000, 1199],
  ];
  for (const [size, price] of expected) {
    const pkg = PACKAGES.find((p) => p.size === size);
    assert.ok(pkg, `Missing package for $${size}`);
    assert.equal(pkg.tier, 'funded-challenge');
    assert.equal(pkg.price, price);
    assert.equal(pkg.profitTarget, 30);
    assert.equal(pkg.maxDailyDrawdown, 0);
    assert.equal(pkg.maxOverallLoss, 10);
    assert.equal(pkg.maxRiskPerTradePercent, 5);
    assert.equal(pkg.profitDaysRequirement, 5);
    assert.equal(pkg.minProfitableDayPercent, 1);
    assert.equal(pkg.withdrawalFrequency, 'WEEKLY');
  }
});

test('pricing calculator supports exact standard prices (NONE), only the 40% bonus code, rejects 20% codes, and reverts to standard pricing when cleared/invalid', () => {
  // Verify PROMO_CODES contains ONLY 40% codes and no 20% codes
  assert.equal(Object.values(PROMO_CODES).every((c) => c.discountPercent === 40), true);
  assert.equal('SPOOKY20' in PROMO_CODES, false);
  assert.equal('BFT20' in PROMO_CODES, false);

  // Exact standard price with no promo
  const std49 = calculateDiscountedPrice(49, 'NONE');
  assert.equal(std49.discountedBasePrice, 49);
  assert.equal(std49.finalTotal, 49);
  assert.equal(std49.promoDiscountPercent, 0);
  assert.equal(std49.promoCode, 'NONE');

  // Standard $100 + 15% Daily Withdrawals Add-On -> $115
  const stdDaily = calculateDiscountedPrice(100, 'NONE', true);
  assert.equal(stdDaily.dailyAddonAmount, 15);
  assert.equal(stdDaily.finalTotal, 115);

  // Base $100 with SPOOKY40 (40% OFF) -> $60
  const p40 = calculateDiscountedPrice(100, 'SPOOKY40');
  assert.equal(p40.discountedBasePrice, 60);
  assert.equal(p40.finalTotal, 60);
  assert.equal(p40.promoDiscountPercent, 40);
  assert.equal(p40.promoCode, 'SPOOKY40');

  // Removed 20% codes (SPOOKY20 / BFT20) and invalid codes must be rejected and revert immediately to standard base price
  const v20 = validatePromoCode('SPOOKY20');
  assert.equal(v20.valid, false);
  assert.equal(v20.code, 'NONE');
  assert.equal(v20.discountPercent, 0);

  const p20 = calculateDiscountedPrice(89, 'SPOOKY20');
  assert.equal(p20.promoDiscountPercent, 0);
  assert.equal(p20.discountedBasePrice, 89);
  assert.equal(p20.finalTotal, 89);
  assert.equal(p20.promoCode, 'NONE');

  // Cleared or empty code reverts immediately to standard base price
  const vCleared = validatePromoCode('   ');
  assert.equal(vCleared.valid, false);
  assert.equal(vCleared.isCleared, true);
  assert.equal(vCleared.code, 'NONE');

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

test('evaluateFundedTradeRiskRules triggers immediate HARD_BREACH on all 5 strict funded risk rules and exempts Self-Capital/Demo', () => {
  const fundedChallenge: TradingAccount = {
    id: 'BFT-FC-10K',
    loginId: 'BFT-FC-10K',
    passwordHash: 'pass',
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
    status: 'active',
    createdDate: '2026-11-01',
    lastActiveDate: '2026-11-10',
    phase: 'phase_1',
    tradingDaysCompleted: 2,
    tradesCount: 4,
    winRate: 75,
  };

  // 1. Single trade <= 5% ($500) allowed
  const okSingle = evaluateFundedTradeRiskRules({
    account: fundedChallenge,
    stake: 500,
    assetSymbol: 'EUR/USD',
    direction: 'CALL',
    activeTrades: [],
    allTrades: [],
  });
  assert.equal(okSingle.violated, false);

  // 2. Single trade > 5% of current wallet balance ($501 on $10,000) -> HARD_BREACH
  const badSingle = evaluateFundedTradeRiskRules({
    account: fundedChallenge,
    stake: 501,
    assetSymbol: 'EUR/USD',
    direction: 'CALL',
    activeTrades: [],
    allTrades: [],
  });
  assert.equal(badSingle.violated, true);
  assert.equal(badSingle.code, 'SINGLE_TRADE_RISK_EXCEEDED');
  assert.equal(badSingle.triggerHardBreach, true);

  // Uses current wallet balance (e.g., after drawdown to $9,200, 5% is $460 so $470 breaches)
  const badCurrentBalance = evaluateFundedTradeRiskRules({
    account: { ...fundedChallenge, currentBalance: 9200, equity: 9200 },
    stake: 470,
    assetSymbol: 'EUR/USD',
    direction: 'CALL',
    activeTrades: [],
    allTrades: [],
  });
  assert.equal(badCurrentBalance.violated, true);
  assert.equal(badCurrentBalance.code, 'SINGLE_TRADE_RISK_EXCEEDED');
  assert.equal(badCurrentBalance.triggerHardBreach, true);

  const openEurCall: BinaryTrade = {
    id: 't-open-eur',
    accountId: 'BFT-FC-10K',
    asset: 'EUR/USD',
    direction: 'CALL',
    strikePrice: 1.085,
    currentPrice: 1.086,
    investment: 300,
    payoutPercentage: 88,
    potentialPayout: 264,
    startTime: 1000,
    durationSeconds: 60,
    endTime: 61000,
    status: 'active',
  };

  // 3. Second open trade on DIFFERENT pair within combined 5% ($300 + $200 = $500 = 5% of $10,000) -> ALLOWED
  const okDiffPair = evaluateFundedTradeRiskRules({
    account: { ...fundedChallenge, currentBalance: 9700 }, // $300 already deducted
    stake: 200,
    assetSymbol: 'GBP/USD',
    direction: 'PUT',
    activeTrades: [openEurCall],
    allTrades: [openEurCall],
    stakesAlreadyDeducted: true,
  });
  assert.equal(okDiffPair.violated, false);

  // 4. Combined open risk across DIFFERENT pairs exceeding 5% ($300 + $250 = $550 = 5.5%) -> HARD_BREACH
  const badCombined = evaluateFundedTradeRiskRules({
    account: { ...fundedChallenge, currentBalance: 9700 },
    stake: 250,
    assetSymbol: 'GBP/USD',
    direction: 'CALL',
    activeTrades: [openEurCall],
    allTrades: [openEurCall],
    stakesAlreadyDeducted: true,
  });
  assert.equal(badCombined.violated, true);
  assert.equal(badCombined.code, 'COMBINED_OPEN_RISK_EXCEEDED');
  assert.equal(badCombined.triggerHardBreach, true);

  // 5. Second open trade on SAME currency pair (same direction CALL) -> HARD_BREACH
  const badSamePair = evaluateFundedTradeRiskRules({
    account: { ...fundedChallenge, currentBalance: 9700 },
    stake: 100,
    assetSymbol: 'EUR/USD',
    direction: 'CALL',
    activeTrades: [openEurCall],
    allTrades: [openEurCall],
    stakesAlreadyDeducted: true,
  });
  assert.equal(badSamePair.violated, true);
  assert.equal(badSamePair.code, 'DUPLICATE_PAIR_TRADE');
  assert.equal(badSamePair.triggerHardBreach, true);

  // 6. Hedging (opposing PUT on EUR/USD while CALL is open) -> HARD_BREACH
  const badHedge = evaluateFundedTradeRiskRules({
    account: { ...fundedChallenge, currentBalance: 9700 },
    stake: 100,
    assetSymbol: 'EUR/USD',
    direction: 'PUT',
    activeTrades: [openEurCall],
    allTrades: [openEurCall],
    stakesAlreadyDeducted: true,
  });
  assert.equal(badHedge.violated, true);
  assert.equal(badHedge.code, 'HEDGING_PROHIBITED');
  assert.equal(badHedge.triggerHardBreach, true);

  // 7. Martingale (doubling stake after a loss: $100 loss -> $200 next trade) -> HARD_BREACH
  const lostTrade: BinaryTrade = {
    ...openEurCall,
    id: 't-lost-1',
    investment: 100,
    status: 'lost',
  };
  const badMartingale = evaluateFundedTradeRiskRules({
    account: fundedChallenge,
    stake: 200,
    assetSymbol: 'GBP/USD',
    direction: 'CALL',
    activeTrades: [],
    allTrades: [lostTrade],
  });
  assert.equal(badMartingale.violated, true);
  assert.equal(badMartingale.code, 'MARTINGALE_PROHIBITED');
  assert.equal(badMartingale.triggerHardBreach, true);

  // 8. Self-Capital account is completely exempt from funded hard-breach rules
  const selfCapital = createDefaultPersonalLiveAccount('usr-self', 'self@bft.io', 5000);
  const exemptSelf = evaluateFundedTradeRiskRules({
    account: selfCapital,
    stake: 2000, // 40% of balance
    assetSymbol: 'EUR/USD',
    direction: 'PUT',
    activeTrades: [openEurCall],
    allTrades: [lostTrade],
  });
  assert.equal(exemptSelf.violated, false);
});

test('advanceChallengeAccountPhase marks challenge PASSED and provisions Real Funded account with exact package balance and is_real_funded=true', () => {
  const challengeAcc: TradingAccount = {
    id: 'BFT-11111',
    loginId: 'BFT-11111',
    passwordHash: 'pass',
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    tierName: 'Funded Challenge',
    size: 50000,
    initialBalance: 50000,
    currentBalance: 65000, // +30% profit target met
    startingDayEquity: 64000,
    equity: 65000,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: 10,
    profitTargetPercent: 30,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-25',
    phase: 'phase_1',
    tradingDaysCompleted: 5,
    tradesCount: 20,
    winRate: 75,
  };

  const res = advanceChallengeAccountPhase(challengeAcc);
  assert.equal(res.lockedAccount.status, 'passed');
  assert.equal(res.isRealFundedDeployed, true);
  assert.equal(res.deployedAccount.phase, 'funded');
  assert.equal(res.deployedAccount.isRealFunded, true);
  assert.equal(res.deployedAccount.is_real_funded, true);
  assert.equal(res.deployedAccount.size, 50000);
  assert.equal(res.deployedAccount.initialBalance, 50000);
  assert.equal(res.deployedAccount.currentBalance, 50000);
  assert.equal(res.deployedAccount.maxOverallLossPercent, 10);
  assert.equal(res.deployedAccount.dailyLossLimitPercent, 0);
  assert.equal(getAccountStatusBadgeLabel(res.deployedAccount), 'REAL FUNDED');
});

test('withdrawal validation requires strict minimum $250 profit threshold and enforces 7-day first withdrawal lock with Weekly standard / Daily +15% cycle', () => {
  assert.equal(MIN_WITHDRAWAL_PROFIT, 250);
  assert.equal(FIRST_WITHDRAWAL_WAITING_DAYS, 7);
  assert.equal(STANDARD_WITHDRAWAL_FREQUENCY, 'WEEKLY');
  assert.equal(WITHDRAWAL_GUARANTEE_NOTICE, 'We process payouts within 3 minutes; if we fail, we pay double!');

  const mockAccount: TradingAccount = {
    id: 'BFT-1001',
    loginId: 'BFT-1001',
    passwordHash: 'secret123',
    tier: 'funded-challenge',
    tierName: 'Real Funded Account',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10180, // Only $180 profit (< $250 minimum)
    startingDayEquity: 10000,
    equity: 10180,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: 10,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-24',
    phase: 'funded',
    isRealFunded: true,
    is_real_funded: true,
    tradingDaysCompleted: 8,
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

  // Check mandatory 7-day waiting period on first withdrawal
  const newFundedAcc: TradingAccount = {
    ...mockAccount,
    createdDate: '2026-10-25',
    tradingDaysCompleted: 4,
    firstWithdrawalCompleted: false,
    dailyWithdrawalsUnlocked: false,
  };
  const lockCheck = checkFirstWithdrawalWaitingPeriod(newFundedAcc, Date.UTC(2026, 9, 28));
  assert.equal(lockCheck.eligible, false);
  assert.equal(lockCheck.daysRemaining, 3);
  assert.match(lockCheck.subsequentCycleLabel, /Weekly/i);

  const dailyAddOnCheck = checkFirstWithdrawalWaitingPeriod(
    { ...newFundedAcc, dailyWithdrawalsUnlocked: true },
    Date.UTC(2026, 9, 28)
  );
  assert.match(dailyAddOnCheck.subsequentCycleLabel, /Daily Withdrawals/i);

  const blockedFirst = validateWithdrawalRequest(newFundedAcc, 250, {
    enforceFirstWithdrawalLock: true,
    nowMs: Date.UTC(2026, 9, 28),
  });
  assert.equal(blockedFirst.valid, false);
  assert.equal(blockedFirst.code, 'FIRST_WITHDRAWAL_7_DAY_LOCK');

  // After 7 days, first withdrawal unlocks!
  const unlockedFirst = validateWithdrawalRequest(newFundedAcc, 250, {
    enforceFirstWithdrawalLock: true,
    nowMs: Date.UTC(2026, 10, 2), // 8 days after Oct 25
  });
  assert.equal(unlockedFirst.valid, true);
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

  // Minimum $10 threshold enforced on Personal Live account
  const belowMin = validateWithdrawalRequest(personalAcc, 5);
  assert.equal(belowMin.valid, false);
  assert.equal(belowMin.code, 'AMOUNT_TOO_LOW');

  const validPersonal = validateWithdrawalRequest(personalAcc, 150);
  assert.equal(validPersonal.valid, true);

  // Cannot withdraw more than available Personal Live balance
  const exceedsBal = validateWithdrawalRequest(personalAcc, 750);
  assert.equal(exceedsBal.valid, false);
  assert.equal(exceedsBal.code, 'EXCEEDS_BALANCE');

  // Withdrawal breakdown shows 100% retention and 3% fee for Personal Live
  const breakdown = calculateWithdrawalBreakdown(400, 0, true);
  assert.equal(breakdown.profitSplitPercent, 100);
  assert.equal(breakdown.withdrawalFeeAmount, 12);
  assert.equal(breakdown.netPayoutToReceive, 388);
});

test('dynamic account limits and normalization for unified funded_challenge and legacy tiers', () => {
  assert.equal(normalizeChallengeAccountType('funded-challenge'), 'funded_challenge');
  assert.equal(normalizeChallengeAccountType('funded_challenge'), 'funded_challenge');
  assert.equal(normalizeChallengeAccountType('one-step'), 'one_step');
  assert.equal(normalizeChallengeAccountType('two-step'), 'two_step');
  assert.equal(normalizeChallengeAccountType('instant'), 'instant');

  // Unified Funded Challenge limits: 30% Profit Target, 0% Daily Cap, 10% Max Overall Loss, 5 days >=1%
  const fcLimits = getDynamicAccountLimits('funded_challenge', 'phase_1');
  assert.equal(fcLimits.accountType, 'funded_challenge');
  assert.equal(fcLimits.profitTargetPercent, 30);
  assert.equal(fcLimits.dailyLossLimitPercent, 0);
  assert.equal(fcLimits.maxOverallLossPercent, 10);
  assert.equal(fcLimits.maxRiskPerTradePercent, 5);
  assert.equal(fcLimits.minProfitableDays, 5);
  assert.equal(fcLimits.minProfitableDayPercent, 1);
  assert.equal(fcLimits.initialPhase, 'phase_1');

  // Challenge target requires BOTH 30% profit AND 5 qualifying days
  const notEnoughDays = getChallengeProfitTarget(
    {
      accountType: 'funded_challenge',
      phase: 'phase_1',
      initialBalance: 10000,
      currentBalance: 13500, // 35% profit
      tradingDaysCompleted: 4, // Only 4 qualifying days
    } as any
  );
  assert.equal(notEnoughDays.targetAmount, 3000);
  assert.equal(notEnoughDays.isProfitTargetMet, true);
  assert.equal(notEnoughDays.isMinDaysMet, false);
  assert.equal(notEnoughDays.isTargetMet, false);

  const bothMet = getChallengeProfitTarget(
    {
      accountType: 'funded_challenge',
      phase: 'phase_1',
      initialBalance: 10000,
      currentBalance: 13000, // 30% profit
      tradingDaysCompleted: 5, // 5 qualifying days
    } as any
  );
  assert.equal(bothMet.isProfitTargetMet, true);
  assert.equal(bothMet.isMinDaysMet, true);
  assert.equal(bothMet.isTargetMet, true);
});

test('unified challenge graduation transitions directly from challenge to Real Funded account with exact package balance', () => {
  const fcAccount: TradingAccount = {
    id: 'ACC-FC-25K',
    loginId: 'BFT-25001',
    passwordHash: 'pass',
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    tierName: 'Funded Challenge',
    size: 25000,
    initialBalance: 25000,
    currentBalance: 32500, // +30% profit
    startingDayEquity: 32500,
    equity: 32500,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: 10,
    profitTargetPercent: 30,
    status: 'active',
    phase: 'phase_1',
    tradingDaysCompleted: 5,
    tradesCount: 15,
    winRate: 70,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-24',
  };

  const progression = advanceChallengeAccountPhase(fcAccount);
  assert.equal(progression.lockedAccount.status, 'passed');
  assert.ok(progression.deployedAccount);
  assert.equal(progression.deployedAccount.phase, 'funded');
  assert.equal(progression.deployedAccount.isRealFunded, true);
  assert.equal(progression.deployedAccount.is_real_funded, true);
  assert.equal(progression.deployedAccount.size, 25000);
  assert.equal(progression.deployedAccount.currentBalance, 25000);
});

test('anti-breach sanitization prevents false auto-breaches on zero or uninitialized balance rows', () => {
  const zeroBalanceAcc: TradingAccount = {
    id: 'ACC-ZERO',
    loginId: 'BFT-9999',
    passwordHash: 'pass',
    tier: 'two-step',
    accountType: 'two_step',
    tierName: 'Two-Step Challenge',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 0, // Uninitialized zero balance
    startingDayEquity: 0,
    equity: 0,
    dailyLossLimitPercent: 8,
    maxOverallLossPercent: 20,
    profitTargetPercent: 25,
    status: 'active',
    phase: 'phase_1',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-24',
  };

  const sanitized = sanitizeAccountForAntiBreach(zeroBalanceAcc);
  assert.equal(sanitized.currentBalance, 10000);
  assert.equal(sanitized.equity, 10000);
  assert.equal(sanitized.startingDayEquity, 10000);

  // Breach evaluation on sanitized account passes safely
  const breachCheck = evaluateAccountBreach(sanitized);
  assert.equal(breachCheck.isBreached, false);

  // Instant Funded $50,000 account with 0 balance or erroneous 'breached' status when tradesCount === 0 is restored to $50,000 and 'active'
  const instant50k: TradingAccount = {
    id: 'ACC-INST-50K',
    loginId: 'BFT-50000',
    passwordHash: 'pass',
    tier: 'instant',
    accountType: 'instant',
    tierName: 'Instant Funded',
    size: 50000,
    initialBalance: 50000,
    currentBalance: 0,
    startingDayEquity: 0,
    equity: 0,
    dailyLossLimitPercent: 6,
    maxOverallLossPercent: 12,
    profitTargetPercent: 0,
    status: 'breached',
    phase: 'funded',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-24',
  };

  const sanitizedInstant = sanitizeAccountForAntiBreach(instant50k);
  assert.equal(sanitizedInstant.currentBalance, 50000);
  assert.equal(sanitizedInstant.equity, 50000);
  assert.equal(sanitizedInstant.startingDayEquity, 50000);
  assert.equal(sanitizedInstant.status, 'active');
  assert.equal(sanitizedInstant.dailyLossLimitPercent, 0);
  assert.equal(sanitizedInstant.maxOverallLossPercent, 10);
  assert.equal(sanitizedInstant.profitTargetPercent, 0);
});

test('Soft Breach auto-liquidation closes active floating trades, realizes PnL, sets next-day starting balance, and shrinks cumulative overall drawdown buffer', () => {
  // $5,000 1-Step Challenge account (10% Daily DD = $500, 15% Max Overall DD = $750)
  const acc5k: TradingAccount = {
    id: 'ACC-5K-1STEP',
    loginId: 'BFT-5001',
    passwordHash: 'pass',
    tier: 'one-step',
    accountType: 'one_step',
    tierName: 'One-Step Challenge',
    size: 5000,
    initialBalance: 5000,
    startingDayEquity: 5000,
    // Trader had $4,500 after closed losses, then opened 2 trades:
    // Trade 1: $100 stake (losing at close), Trade 2: $100 stake (winning +$90 at close -> $190 payout)
    // Wait: let's test hitting exact $500 daily loss ($4,500 equity):
    // Suppose currentBalance (after deducting $200 for two $100 active trades) is $4,310,
    // and Trade 1 ($100) is ITM returning $190, Trade 2 ($100) is OTM returning $0 -> live equity = $4,310 + $190 = $4,500!
    currentBalance: 4310,
    equity: 4500,
    dailyLossLimitPercent: 10,
    maxOverallLossPercent: 15,
    profitTargetPercent: 30,
    status: 'active',
    phase: 'phase_1',
    tradingDaysCompleted: 1,
    tradesCount: 3,
    winRate: 33,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-25',
  };

  const activeTrades: BinaryTrade[] = [
    {
      id: 't-active-win',
      accountId: 'ACC-5K-1STEP',
      asset: 'EUR/USD',
      direction: 'CALL',
      strikePrice: 1.0800,
      currentPrice: 1.0850, // In-the-money!
      investment: 100,
      payoutPercentage: 90,
      potentialPayout: 90,
      startTime: 1000,
      durationSeconds: 60,
      endTime: 61000,
      status: 'active',
    },
    {
      id: 't-active-loss',
      accountId: 'ACC-5K-1STEP',
      asset: 'BTC/USD',
      direction: 'PUT',
      strikePrice: 65000,
      currentPrice: 65200, // Out-of-the-money!
      investment: 100,
      payoutPercentage: 90,
      potentialPayout: 90,
      startTime: 1000,
      durationSeconds: 60,
      endTime: 61000,
      status: 'active',
    },
  ];

  const priceLookup: Record<string, number> = {
    'EUR/USD': 1.0850,
    'BTC/USD': 65200,
  };
  const getLivePrice = (symbol: string, fallback: number) => priceLookup[symbol] ?? fallback;

  const liveEq = calculateLiveAccountEquity(acc5k.currentBalance, activeTrades, getLivePrice, true);
  assert.equal(liveEq.liveEquity, 4500);
  assert.equal(liveEq.floatingReturn, 190);
  assert.equal(liveEq.netFloatingPnL, -10);

  // Trigger Soft Breach auto-liquidation
  const liq = liquidateActiveTradesOnSoftBreach({
    account: acc5k,
    activeTrades,
    getLivePrice,
    nowMs: 1700000000000,
    stakesAlreadyDeducted: true,
  });
  assert.equal(liq.liquidatedTrades.length, 2);
  assert.equal(liq.liquidatedTrades[0].status, 'won');
  assert.equal(liq.liquidatedTrades[0].pnl, 90);
  assert.equal(liq.liquidatedTrades[1].status, 'lost');
  assert.equal(liq.liquidatedTrades[1].pnl, -100);

  // Remaining balance and next-day startingDayEquity are set to $4,500
  assert.equal(liq.nextDayStartingBalance, 4500);
  assert.equal(liq.updatedAccount.currentBalance, 4500);
  assert.equal(liq.updatedAccount.equity, 4500);
  assert.equal(liq.updatedAccount.startingDayEquity, 4500);
  assert.equal(liq.updatedAccount.status, 'soft_breached');
  assert.equal(liq.updatedAccount.breachType, 'soft');
  assert.equal(liq.remainingOverallBuffer, 250);

  // Verify cumulative overall drawdown buffer on the next trading day when unlocked at $4,500:
  const nextDayAccount = resetSoftBreachedAccount(liq.updatedAccount);
  assert.equal(nextDayAccount.status, 'active');
  assert.equal(nextDayAccount.startingDayEquity, 4500);
  assert.equal(nextDayAccount.currentBalance, 4500);

  const nextDayMetrics = calculateDrawdownMetrics(nextDayAccount);
  // 15% of $5,000 = $750 max overall loss -> $500 already lost -> only $250 remaining buffer before Hard Breach!
  assert.equal(nextDayMetrics.maxOverallLossAmount, 750);
  assert.equal(nextDayMetrics.overallLossAmount, 500);
  assert.equal(nextDayMetrics.remainingOverallBuffer, 250);
  assert.equal(nextDayMetrics.effectiveRemainingBuffer, 250);
  assert.equal(nextDayMetrics.hardBreachFloor, 4250);
});

test('Zero-Tolerance Execution blocks trades exceeding remaining drawdown buffer or 5% max risk per trade', () => {
  // $5,000 1-Step account currently at $4,500 (so $250 remaining overall drawdown buffer before Hard Breach at $4,250)
  const accAt4500: TradingAccount = {
    id: 'ACC-5K-NEXTDAY',
    loginId: 'BFT-5002',
    passwordHash: 'pass',
    tier: 'one-step',
    accountType: 'one_step',
    tierName: 'One-Step Challenge',
    size: 5000,
    initialBalance: 5000,
    startingDayEquity: 4500,
    currentBalance: 4500,
    equity: 4500,
    dailyLossLimitPercent: 10,
    maxOverallLossPercent: 15,
    profitTargetPercent: 30,
    status: 'active',
    phase: 'phase_1',
    tradingDaysCompleted: 2,
    tradesCount: 5,
    winRate: 40,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-26',
  };

  // Placing a $200 trade is within the $250 remaining overall buffer and 5% max risk ($250) -> ALLOWED
  const ok200 = validateZeroToleranceTradeExecution({ account: accAt4500, stake: 200 });
  assert.equal(ok200.allowed, true);

  // Placing a $300 trade exceeds 5% max risk ($250) -> BLOCKED
  const blockedRisk = validateZeroToleranceTradeExecution({ account: accAt4500, stake: 300 });
  assert.equal(blockedRisk.allowed, false);
  assert.equal(blockedRisk.code, 'MAX_RISK_PER_TRADE_EXCEEDED');

  // Suppose balance drops to $4,350 ($150 remaining overall buffer before $4,250 Hard Breach)
  const accAt4350: TradingAccount = {
    ...accAt4500,
    currentBalance: 4350,
    equity: 4350,
  };
  // Placing a $200 trade is <= $250 (5% max risk), but exceeds the $150 remaining overall drawdown buffer -> BLOCKED!
  const blockedOverall = validateZeroToleranceTradeExecution({ account: accAt4350, stake: 200 });
  assert.equal(blockedOverall.allowed, false);
  assert.equal(blockedOverall.code, 'OVERALL_DRAWDOWN_BUFFER_EXCEEDED');

  // Self-Funded account has no drawdown or max risk limits -> unrestricted
  const selfFunded = createDefaultPersonalLiveAccount('usr-1', 'user@test.com', 5000);
  const okSelf = validateZeroToleranceTradeExecution({ account: selfFunded, stake: 2500 });
  assert.equal(okSelf.allowed, true);
});

test('evaluateRealtimeTradingEngine triggers instant soft_breached, hard_breached, passed, and ignores self-funded', () => {
  const base5k: TradingAccount = {
    id: 'ACC-RT-5K',
    loginId: 'BFT-RT-5K',
    passwordHash: 'pass',
    tier: 'one-step',
    accountType: 'one_step',
    tierName: 'One-Step Challenge',
    size: 5000,
    initialBalance: 5000,
    startingDayEquity: 5000,
    currentBalance: 4400, // $400 already lost + $200 stake deducted
    equity: 4400,
    dailyLossLimitPercent: 10,
    maxOverallLossPercent: 15,
    profitTargetPercent: 30,
    status: 'active',
    phase: 'phase_1',
    tradingDaysCompleted: 5,
    tradesCount: 4,
    winRate: 50,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-25',
  };

  const losingTrade: BinaryTrade = {
    id: 'TRD-RT-1',
    accountId: 'ACC-RT-5K',
    asset: 'BTC/USDT (OTC)',
    direction: 'CALL',
    investment: 200,
    payoutPercentage: 90,
    potentialPayout: 380,
    strikePrice: 95000,
    currentPrice: 94800,
    startTime: 1000,
    endTime: 61000,
    durationSeconds: 60,
    status: 'active',
  };

  // 1. Unified 10% max overall loss ($500 on $5,000): live equity = $4,400 ($600 loss = 12% >= 10%) -> immediate hard_breached
  const hardFromUnified = evaluateRealtimeTradingEngine({
    account: { ...base5k, tier: 'funded-challenge', accountType: 'funded_challenge', dailyLossLimitPercent: 0, maxOverallLossPercent: 10 },
    activeTrades: [losingTrade],
    getLivePrice: () => 94800,
    nowMs: 50000,
  });
  assert.equal(hardFromUnified.action, 'hard_breach');
  assert.equal(hardFromUnified.databaseStatus, 'hard_breached');
  assert.equal(hardFromUnified.updatedAccount.status, 'hard_breached');
  assert.equal(hardFromUnified.liquidatedTrades.length, 1);
  assert.equal(hardFromUnified.liquidatedTrades[0].status, 'lost');

  // 2. Single-day 8% loss ($400 on $5,000) stays ACTIVE because there is no separate daily-only cap (only 10% max overall loss)
  const underTenEval = evaluateRealtimeTradingEngine({
    account: { ...base5k, tier: 'funded-challenge', accountType: 'funded_challenge', dailyLossLimitPercent: 0, maxOverallLossPercent: 10, currentBalance: 4600, equity: 4600 },
    activeTrades: [losingTrade],
    getLivePrice: () => 94800,
    nowMs: 50000,
  });
  assert.equal(underTenEval.action, 'none');
  assert.equal(underTenEval.updatedAccount.status, 'active');

  // 3a. 30% profit with only 4 qualifying days does NOT pass yet
  const fourDaysEval = evaluateRealtimeTradingEngine({
    account: { ...base5k, currentBalance: 6550, equity: 6550, tradingDaysCompleted: 4 },
    activeTrades: [],
    getLivePrice: () => 95000,
    nowMs: 50000,
  });
  assert.equal(fourDaysEval.action, 'none');

  // 3b. Target reached: $5,000 + 30% ($1,500) = $6,500 balance AND 5 qualifying days -> instant passed
  const passedEval = evaluateRealtimeTradingEngine({
    account: { ...base5k, currentBalance: 6550, equity: 6550, tradingDaysCompleted: 5 },
    activeTrades: [],
    getLivePrice: () => 95000,
    nowMs: 50000,
  });
  assert.equal(passedEval.action, 'target_reached');
  assert.equal(passedEval.databaseStatus, 'passed');
  assert.equal(passedEval.updatedAccount.status, 'passed');

  // 4. Instant Funded ($50K) newly purchased account has 0 trades and full balance -> active (no false breach)
  const instant50k: TradingAccount = {
    id: 'ACC-INST-50K',
    loginId: 'BFT-INST-50K',
    passwordHash: 'pass',
    tier: 'instant',
    accountType: 'instant',
    tierName: 'Instant Funded',
    size: 50000,
    initialBalance: 50000,
    startingDayEquity: 0,
    currentBalance: 0,
    equity: 0,
    dailyLossLimitPercent: 6,
    maxOverallLossPercent: 12,
    profitTargetPercent: 0,
    status: 'hard-breached',
    phase: 'funded',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    createdDate: '2026-10-25',
    lastActiveDate: '2026-10-25',
  };
  const sanitizedInstant = sanitizeAccountForAntiBreach(instant50k);
  assert.equal(sanitizedInstant.currentBalance, 50000);
  assert.equal(sanitizedInstant.equity, 50000);
  assert.equal(sanitizedInstant.status, 'active');

  // 5. Self-Funded account ignores drawdown rules completely
  const selfFunded = createDefaultPersonalLiveAccount('usr-1', 'user@test.com', 5000);
  const selfEval = evaluateRealtimeTradingEngine({
    account: { ...selfFunded, currentBalance: 500, equity: 500 },
    activeTrades: [],
    getLivePrice: () => 95000,
    nowMs: 50000,
  });
  assert.equal(selfEval.action, 'none');
  assert.equal(selfEval.updatedAccount.status, 'active');
});

test('custom duration helpers (5s to 4h), Funded <30s restriction vs Self-Capital 5s+ exemption, and strict $5,000 per-trade limit', async () => {
  const {
    clampCustomTradeDuration,
    durationSecondsToHms,
    hmsToDurationSeconds,
    validateTradeDurationForAccount,
    MAX_SINGLE_TRADE_INVESTMENT_USD,
  } = await import('./propRules');

  assert.equal(MAX_SINGLE_TRADE_INVESTMENT_USD, 5000);

  // 1. Custom duration clamping and H:M:S conversion (5s to 4h = 14,400s)
  assert.equal(clampCustomTradeDuration(1), 5);
  assert.equal(clampCustomTradeDuration(5), 5);
  assert.equal(clampCustomTradeDuration(14400), 14400);
  assert.equal(clampCustomTradeDuration(20000), 14400);

  assert.deepEqual(durationSecondsToHms(5), { hours: 0, minutes: 0, seconds: 5 });
  assert.deepEqual(durationSecondsToHms(95), { hours: 0, minutes: 1, seconds: 35 });
  assert.deepEqual(durationSecondsToHms(14400), { hours: 4, minutes: 0, seconds: 0 });

  assert.equal(hmsToDurationSeconds(0, 0, 5), 5);
  assert.equal(hmsToDurationSeconds(0, 0, 2), 5); // clamps to 5s min
  assert.equal(hmsToDurationSeconds(1, 30, 15), 5415);
  assert.equal(hmsToDurationSeconds(4, 15, 30), 14400); // clamps to 4h max

  // 2. Rule 1: Funded Account blocks < 30s, Self-Capital Account allows 5s–29s
  const fundedAcc: TradingAccount = {
    id: 'ACC-FUNDED-100K',
    loginId: 'BFT-100K',
    passwordHash: 'pass',
    tier: 'instant',
    accountType: 'instant',
    tierName: 'Instant Funded',
    size: 100000,
    initialBalance: 100000,
    startingDayEquity: 100000,
    currentBalance: 100000,
    equity: 100000,
    dailyLossLimitPercent: 6,
    maxOverallLossPercent: 12,
    profitTargetPercent: 0,
    status: 'active',
    phase: 'funded',
    tradingDaysCompleted: 1,
    tradesCount: 2,
    winRate: 50,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-26',
  };
  const selfCapitalAcc = createDefaultPersonalLiveAccount('usr-self', 'self@bft.io', 25000);

  // Funded account < 30s -> BLOCKED
  const funded5s = validateTradeDurationForAccount(5, fundedAcc);
  assert.equal(funded5s.valid, false);
  assert.equal(funded5s.code, 'FUNDED_ACCOUNT_UNDER_30S');
  assert.equal(isValidTradeDuration(15, fundedAcc), false);
  assert.equal(isValidTradeDuration(30, fundedAcc), true);
  assert.equal(isValidTradeDuration(14400, fundedAcc), true);

  // Self-Capital account 5s to 29s -> ALLOWED
  const self5s = validateTradeDurationForAccount(5, selfCapitalAcc);
  assert.equal(self5s.valid, true);
  assert.equal(isValidTradeDuration(5, selfCapitalAcc), true);
  assert.equal(isValidTradeDuration(15, selfCapitalAcc), true);
  assert.equal(isValidTradeDuration(14400, selfCapitalAcc), true);

  // 3. Rule 2: Strict $5,000 per-trade investment limit for both Self-Capital and Funded accounts
  const self5000 = validateZeroToleranceTradeExecution({ account: selfCapitalAcc, stake: 5000 });
  assert.equal(self5000.allowed, true);

  const self5001 = validateZeroToleranceTradeExecution({ account: selfCapitalAcc, stake: 5001 });
  assert.equal(self5001.allowed, false);
  assert.equal(self5001.code, 'MAX_SINGLE_TRADE_LIMIT_EXCEEDED');

  const funded5000 = validateZeroToleranceTradeExecution({ account: fundedAcc, stake: 5000 });
  assert.equal(funded5000.allowed, true);

  const funded6000 = validateZeroToleranceTradeExecution({ account: fundedAcc, stake: 6000 });
  assert.equal(funded6000.allowed, false);
  assert.equal(funded6000.code, 'MAX_SINGLE_TRADE_LIMIT_EXCEEDED');
});

test('account badge colors resolve Green LIVE, Yellow DEMO, Red CHALLENGE, Emerald PASSED, and Purple REAL FUNDED', () => {
  const personalLive = createDefaultPersonalLiveAccount('usr-1', 'trader@bft.io', 500);
  const demoAcc: TradingAccount = {
    ...personalLive,
    id: 'BFT-DEMO-01',
    tier: 'demo',
    accountCategory: 'demo',
    phase: 'demo',
    tierName: 'Demo Account',
  };
  const activeChallenge: TradingAccount = {
    id: 'BFT-CH-10K',
    loginId: 'BFT-CH-10K',
    passwordHash: 'pass',
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    tierName: 'Funded Challenge',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10400,
    startingDayEquity: 10000,
    equity: 10400,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: 10,
    profitTargetPercent: 30,
    status: 'active',
    phase: 'phase_1',
    tradingDaysCompleted: 2,
    tradesCount: 4,
    winRate: 75,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-10',
  };

  assert.deepEqual(resolveAccountBadgeMeta(personalLive), {
    account_tier: 'LIVE',
    badge_color: 'green',
    label: 'LIVE',
    isPassedChallenge: false,
  });

  assert.deepEqual(resolveAccountBadgeMeta(demoAcc), {
    account_tier: 'DEMO',
    badge_color: 'yellow',
    label: 'DEMO',
    isPassedChallenge: false,
  });

  assert.deepEqual(resolveAccountBadgeMeta(activeChallenge), {
    account_tier: 'CHALLENGE',
    badge_color: 'red',
    label: 'CHALLENGE',
    isPassedChallenge: false,
  });

  // Auto-graduation transitions Challenge -> PASSED (certificate unlocked) & creates Purple REAL FUNDED
  const graduated = advanceChallengeAccountPhase(activeChallenge);
  assert.equal(graduated.lockedAccount.status, 'passed');
  assert.equal(graduated.lockedAccount.certificate_unlocked, true);
  assert.ok(graduated.lockedAccount.certificateId);
  assert.equal(isPassedChallengeAccount(graduated.lockedAccount), true);
  assert.equal(resolveAccountBadgeMeta(graduated.lockedAccount).label, 'PASSED');
  assert.equal(resolveAccountBadgeMeta(graduated.lockedAccount).isPassedChallenge, true);

  const rf = graduated.deployedAccount;
  assert.equal(isRealFundedAccount(rf), true);
  assert.equal(rf.account_tier, 'REAL_FUNDED');
  assert.equal(rf.badge_color, 'purple');
  assert.equal(rf.is_real_funded, true);
  assert.equal(rf.principal_locked, true);
  assert.equal(rf.profit_split_percent, 90);
  assert.equal(rf.certificate_unlocked, true);
  assert.equal(rf.size, 10000);
  assert.equal(rf.initialBalance, 10000);
  assert.equal(rf.currentBalance, 10000);
  assert.deepEqual(resolveAccountBadgeMeta(rf), {
    account_tier: 'REAL_FUNDED',
    badge_color: 'purple',
    label: 'REAL FUNDED',
    isPassedChallenge: false,
  });
});

test('Real Funded withdrawals enforce principal lock and 90% earned net profit ceiling', () => {
  const realFunded10k: TradingAccount = {
    id: 'BFT-RF-10K',
    loginId: 'BFT-RF-10K',
    passwordHash: 'pass',
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    account_tier: 'REAL_FUNDED',
    badge_color: 'purple',
    tierName: 'Real Funded ($10,000)',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10000,
    startingDayEquity: 10000,
    equity: 10000,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: 10,
    profitTargetPercent: 0,
    isRealFunded: true,
    is_real_funded: true,
    principal_locked: true,
    profit_split_percent: 90,
    status: 'active',
    phase: 'funded',
    tradingDaysCompleted: 8,
    tradesCount: 12,
    winRate: 65,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-15',
  };

  // At $10,000 balance ($0 profit), principal is locked and withdrawal is blocked
  const zeroProfitAllowance = calculateRealFundedWithdrawalAllowance(realFunded10k);
  assert.equal(zeroProfitAllowance.principalLocked, true);
  assert.equal(zeroProfitAllowance.earnedNetProfit, 0);
  assert.equal(zeroProfitAllowance.maxWithdrawableProfit, 0);
  const blockedNoProfit = validateWithdrawalRequest(realFunded10k, 300);
  assert.equal(blockedNoProfit.valid, false);
  assert.equal(blockedNoProfit.code, 'NO_PROFIT');

  // After earning $1,000 net profit ($11,000 balance): max withdrawable = $900 (90%)
  const profitableRf: TradingAccount = {
    ...realFunded10k,
    currentBalance: 11000,
    equity: 11000,
  };
  const allowance = calculateRealFundedWithdrawalAllowance(profitableRf);
  assert.equal(allowance.fundedPrincipal, 10000);
  assert.equal(allowance.earnedNetProfit, 1000);
  assert.equal(allowance.profitSplitPercent, 90);
  assert.equal(allowance.maxWithdrawableProfit, 900);

  // $900 (exact 90% of earned net profit) -> ALLOWED
  assert.equal(validateWithdrawalRequest(profitableRf, 900).valid, true);

  // $901 (exceeds 90% profit limit) -> BLOCKED with EXCEEDS_90_PERCENT_PROFIT
  const blocked901 = validateWithdrawalRequest(profitableRf, 901);
  assert.equal(blocked901.valid, false);
  assert.equal(blocked901.code, 'EXCEEDS_90_PERCENT_PROFIT');

  // $1,050 (attempts to withdraw into funded principal) -> BLOCKED with EXCEEDS_PROFIT
  const blockedPrincipal = validateWithdrawalRequest(profitableRf, 1050);
  assert.equal(blockedPrincipal.valid, false);
  assert.equal(blockedPrincipal.code, 'EXCEEDS_PROFIT');
});

test('getAccountBadgeDisplayText shows strictly Challenge without numbers or codes while keeping other badges intact', async () => {
  const {
    isChallengeBadgeAccount,
    getAccountBadgeDisplayText,
  } = await import('./propRules');

  const personalLive = createDefaultPersonalLiveAccount('usr-1', 'trader@bft.io', 500);
  const demoAcc: TradingAccount = {
    ...personalLive,
    id: 'BFT-DEMO-01',
    tier: 'demo',
    accountCategory: 'demo',
    phase: 'demo',
    tierName: 'Demo Account',
  };
  const activeChallenge: TradingAccount = {
    id: 'BFT-CH-10K-999',
    loginId: 'BFT-CH-10K-999',
    passwordHash: 'pass',
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    tierName: 'Funded Challenge ($10,000)',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10400,
    startingDayEquity: 10000,
    equity: 10400,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: 10,
    profitTargetPercent: 30,
    status: 'active',
    phase: 'phase_1',
    tradingDaysCompleted: 2,
    tradesCount: 4,
    winRate: 75,
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-10',
  };
  const graduated = advanceChallengeAccountPhase(activeChallenge);

  assert.equal(isChallengeBadgeAccount(activeChallenge), true);
  assert.equal(getAccountBadgeDisplayText(activeChallenge), 'Challenge');
  assert.equal(/\d/.test(getAccountBadgeDisplayText(activeChallenge)), false);

  assert.equal(isChallengeBadgeAccount(personalLive), false);
  assert.equal(getAccountBadgeDisplayText(personalLive), 'LIVE');

  assert.equal(isChallengeBadgeAccount(demoAcc), false);
  assert.equal(getAccountBadgeDisplayText(demoAcc), 'DEMO');

  assert.equal(isChallengeBadgeAccount(graduated.lockedAccount), false);
  assert.equal(getAccountBadgeDisplayText(graduated.lockedAccount), 'PASSED');

  assert.equal(isChallengeBadgeAccount(graduated.deployedAccount), false);
  assert.equal(getAccountBadgeDisplayText(graduated.deployedAccount), 'REAL FUNDED');
});

test('executeSelfCapitalChallengePurchase blocks purchase with Insufficient Account Balance when Self Capital < package price', async () => {
  const {
    executeSelfCapitalChallengePurchase,
    resolveAvailableSelfCapitalBalance,
  } = await import('./propRules');

  const pkg10k = PACKAGES.find((p) => p.size === 10000)!; // $89
  assert.equal(pkg10k.price, 89);

  // Resolve available balance when profile has $30
  const available = resolveAvailableSelfCapitalBalance({ selfBalance: 30, isLoggedIn: true }, []);
  assert.equal(available, 30);

  const res = executeSelfCapitalChallengePurchase({
    pkg: pkg10k,
    selfCapitalBalance: available,
    ownerId: 'usr-1',
    ownerEmail: 'trader@bft.io',
  });

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.code, 'INSUFFICIENT_ACCOUNT_BALANCE');
    assert.equal(res.error, 'Insufficient Account Balance');
    assert.equal(res.requiredAmount, 89);
    assert.equal(res.availableBalance, 30);
    assert.equal(res.shortfallAmount, 59);
    assert.match(res.message, /Insufficient Account Balance/);
  }
});

test('executeSelfCapitalChallengePurchase deducts exact package price from Self Capital and activates Challenge account immediately when balance >= price', async () => {
  const {
    executeSelfCapitalChallengePurchase,
    getAccountBadgeDisplayText,
    isChallengeBadgeAccount,
  } = await import('./propRules');

  const pkg10k = PACKAGES.find((p) => p.size === 10000)!; // $89
  const res = executeSelfCapitalChallengePurchase({
    pkg: pkg10k,
    selfCapitalBalance: 250,
    ownerId: 'usr-1',
    ownerEmail: 'trader@bft.io',
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.code, 'CHALLENGE_ACTIVATED');
    assert.equal(res.deductedAmount, 89);
    assert.equal(res.previousSelfCapital, 250);
    assert.equal(res.remainingSelfCapital, 161);
    assert.equal(res.account.size, 10000);
    assert.equal(res.account.currentBalance, 10000);
    assert.equal(res.account.status, 'active');
    assert.equal(res.account.account_tier, 'CHALLENGE');
    assert.equal(res.account.badge_color, 'red');
    assert.equal(res.account.profitTargetPercent, 30);
    assert.equal(res.account.maxOverallLossPercent, 10);
    assert.equal(res.account.minTradingDaysRequired, 5);
    assert.equal(isChallengeBadgeAccount(res.account), true);
    assert.equal(getAccountBadgeDisplayText(res.account), 'Challenge');
  }
});

