import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATEUS_FUNDED_PROFIT,
  FUNDED_RANK_15_PROFIT,
  YOHAN_SELF_FUNDED_PROFIT,
  getSriLankaDailyResetInfo,
  getSriLankaWeeklyResetInfo,
  getDynamicLeaderboardTraders,
  createFreshZeroSelfFundedLeaderboard,
  normalizeFundedLeaderboard,
  calculateUserDailyPnL,
  calculateUserWeeklyPnL,
  formatDailyProfitLoss,
  resolveUserLeaderboardPosition,
} from './leaderboardEngine';
import {
  markKycVerifiedLock,
  resolveStableKycStatus,
} from './kycVerification';
import {
  issueTwoFactorEmailOtp,
  verifyTwoFactorEmailOtpCode,
} from './authOtpLogic';

test('Rule 1: Funded Traders Leaderboard removes Yohan Siriwardhana and anchors Mateus Domingos (Angola, $72,876.98) at Rank 1', () => {
  const weeklyReset = getSriLankaWeeklyResetInfo();
  assert.ok(weeklyReset.resetScheduleLabel.includes('Resets Weekly'), 'Schedule label should indicate weekly reset');
  assert.ok(weeklyReset.daysUntilReset >= 0 && weeklyReset.daysUntilReset <= 7);

  const fundedList = getDynamicLeaderboardTraders({ category: 'funded', useEveningPeak: true });
  assert.equal(fundedList.length, 15);

  // Rank 1 Fixed: Mateus Domingos from Angola ($72,876.98)
  const rank1 = fundedList[0];
  assert.equal(rank1.rank, 1);
  assert.equal(rank1.name, 'Mateus Domingos');
  assert.equal(rank1.country, 'Angola');
  assert.equal(rank1.isoCode, 'AO');
  assert.equal(rank1.profit, MATEUS_FUNDED_PROFIT);

  // Ensure Yohan Siriwardhana is NOT on the Funded Leaderboard
  const hasYohanInFunded = fundedList.some((t) =>
    t.name.toLowerCase().includes('yohan')
  );
  assert.equal(hasYohanInFunded, false, 'Yohan Siriwardhana must not appear on Funded Leaderboard');

  // Even if stale database rows include Yohan Siriwardhana in Funded, normalizeFundedLeaderboard strips him out
  const normalizedFromStale = normalizeFundedLeaderboard([
    { ...fundedList[0], rank: 1, name: 'Yohan Siriwardhana', country: 'Sri Lanka', flag: '🇱🇰', isoCode: 'LK', profit: 72876.98, winRate: 94.8 },
    ...fundedList.slice(1),
  ]);
  assert.equal(normalizedFromStale[0].name, 'Mateus Domingos');
  assert.equal(normalizedFromStale[0].country, 'Angola');
  assert.equal(normalizedFromStale[0].profit, 72876.98);
  assert.equal(
    normalizedFromStale.some((t) => t.name.toLowerCase().includes('yohan')),
    false
  );

  // Rank 15 Fixed: $27,321.11
  const rank15 = fundedList[14];
  assert.equal(rank15.rank, 15);
  assert.equal(rank15.profit, FUNDED_RANK_15_PROFIT);

  // Regional Distribution: 1 AO, 7 IN, 3 BD, 2 PK, 2 AE/MY
  assert.equal(fundedList.filter((t) => t.isoCode === 'AO').length, 1);
  assert.equal(fundedList.filter((t) => t.isoCode === 'IN').length, 7);
  assert.equal(fundedList.filter((t) => t.isoCode === 'BD').length, 3);
  assert.equal(fundedList.filter((t) => t.isoCode === 'PK').length, 2);
  assert.equal(fundedList.filter((t) => t.isoCode === 'AE' || t.isoCode === 'MY').length, 2);
});

test('Rule 2: Self-Funded Daily Leaderboard resets every day at 05:30 AM (UTC+5:30) starting fresh from $0.00 and scales throughout the day', () => {
  // Exact reset boundary: 00:00 UTC === 05:30 AM (UTC+5:30)
  const exactResetUtcMs = Date.UTC(2026, 10, 10, 0, 0, 0);
  const resetInfo = getSriLankaDailyResetInfo(exactResetUtcMs);
  assert.equal(resetInfo.intradayScale, 0);

  const atResetList = getDynamicLeaderboardTraders({
    category: 'self_funded',
    nowMs: exactResetUtcMs,
    useEveningPeak: false,
  });
  assert.equal(atResetList.length, 15);
  for (const trader of atResetList) {
    assert.equal(trader.profit, 0, `Trader ${trader.name} should start at $0.00 upon 05:30 AM (UTC+5:30) reset`);
  }

  const freshZeroList = createFreshZeroSelfFundedLeaderboard();
  assert.equal(freshZeroList.length, 15);
  assert.ok(freshZeroList.every((t) => t.profit === 0));

  // Evening peak check: Rank 1 is Yohan Siriwardhana ($37,456.55) with 1 LK, 5 IN, 4 PK, 3 AE, 2 BD
  const selfFundedList = getDynamicLeaderboardTraders({ category: 'self_funded', useEveningPeak: true });
  assert.equal(selfFundedList.length, 15);

  const rank1 = selfFundedList[0];
  assert.equal(rank1.rank, 1);
  assert.equal(rank1.name, 'Yohan Siriwardhana');
  assert.equal(rank1.country, 'Sri Lanka');
  assert.equal(rank1.profit, YOHAN_SELF_FUNDED_PROFIT);

  assert.equal(selfFundedList.filter((t) => t.isoCode === 'LK').length, 1);
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'IN').length, 5);
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'PK').length, 4);
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'AE').length, 3);
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'BD').length, 2);
});

test('Rule 3: User Real-Time Integration calculates Weekly PnL for Funded and Daily PnL for Self-Funded', () => {
  const profitFmt = formatDailyProfitLoss(150);
  assert.equal(profitFmt.formatted, '+$150.00');
  assert.equal(profitFmt.isProfit, true);
  assert.equal(profitFmt.colorClass, 'text-[#00e676]');

  const lossFmt = formatDailyProfitLoss(-45);
  assert.equal(lossFmt.formatted, '-$45.00');
  assert.equal(lossFmt.isLoss, true);
  assert.equal(lossFmt.colorClass, 'text-rose-500');

  const nowMs = Date.UTC(2026, 10, 10, 10, 0, 0);
  const todayTradeWon = {
    status: 'won',
    investment: 100,
    payoutPercentage: 90,
    endTime: Date.UTC(2026, 10, 10, 4, 0, 0),
  };
  const yesterdayTradeWon = {
    status: 'won',
    investment: 200,
    payoutPercentage: 90,
    endTime: Date.UTC(2026, 10, 9, 12, 0, 0),
  };

  const trades = [todayTradeWon, yesterdayTradeWon];

  const dailyRes = calculateUserDailyPnL({ trades, nowMs });
  assert.equal(dailyRes.tradesTodayCount, 1);
  assert.equal(dailyRes.dailyPnL, 90);

  const weeklyRes = calculateUserWeeklyPnL({ trades, nowMs });
  assert.equal(weeklyRes.tradesWeeklyCount, 2);
  assert.equal(weeklyRes.weeklyPnL, 270);

  const top15 = getDynamicLeaderboardTraders({ category: 'funded', useEveningPeak: true });
  const posDefault = resolveUserLeaderboardPosition(270, 2, top15);
  assert.equal(posDefault.isUnranked, true);
  assert.equal(posDefault.rankLabel, '1000+');
});

test('Rule 4: KYC Verified Lock & 2FA OTP Verification prevent status flapping and validate 6-digit codes', () => {
  // Once verified is observed or locked, subsequent stale 'unverified' polls never downgrade KYC status
  const status1 = resolveStableKycStatus(['unverified', 'verified'], {
    userId: 'usr_test_kyc_1',
    email: 'trader@example.com',
  });
  assert.equal(status1, 'verified');

  const statusAfterStalePoll = resolveStableKycStatus(['unverified'], {
    userId: 'usr_test_kyc_1',
    email: 'trader@example.com',
  });
  assert.equal(statusAfterStalePoll, 'verified', 'KYC status must stay locked as verified even if a stale poll returns unverified');

  markKycVerifiedLock({ userId: 'usr_test_kyc_2', email: 'locked@example.com' });
  assert.equal(
    resolveStableKycStatus(['unverified'], { email: 'locked@example.com' }),
    'verified'
  );

  // 2FA Email OTP issuance & verification for Login and P2P transfers
  const otp = issueTwoFactorEmailOtp({
    email: 'trader@example.com',
    userId: 'usr_test_kyc_1',
    purpose: 'p2p',
    forceNew: true,
  });
  assert.equal(otp.code.length, 6);

  const badCheck = verifyTwoFactorEmailOtpCode({
    code: '000000',
    email: 'trader@example.com',
    userId: 'usr_test_kyc_1',
  });
  if (otp.code !== '000000') {
    assert.equal(badCheck, false);
  }

  const goodCheck = verifyTwoFactorEmailOtpCode({
    code: otp.code,
    email: 'trader@example.com',
    userId: 'usr_test_kyc_1',
  });
  assert.equal(goodCheck, true);
});

