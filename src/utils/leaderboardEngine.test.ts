import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YOHAN_FUNDED_PROFIT,
  FUNDED_RANK_15_PROFIT,
  YOHAN_SELF_FUNDED_PROFIT,
  getSriLankaDailyResetInfo,
  getSriLankaWeeklyResetInfo,
  getDynamicLeaderboardTraders,
  calculateUserDailyPnL,
  calculateUserWeeklyPnL,
  formatDailyProfitLoss,
  resolveUserLeaderboardPosition,
} from './leaderboardEngine';

test('Rule 1: Funded Traders Leaderboard (Weekly Reset Logic) features exact 1 LK, 7 IN, 3 BD, 2 PK, 2 AE/MY with Rank 1 ($72,876.98) and Rank 15 ($27,321.11)', () => {
  const weeklyReset = getSriLankaWeeklyResetInfo();
  assert.ok(weeklyReset.resetScheduleLabel.includes('Resets Weekly'), 'Schedule label should indicate weekly reset');
  assert.ok(weeklyReset.daysUntilReset >= 0 && weeklyReset.daysUntilReset <= 7);

  const fundedList = getDynamicLeaderboardTraders({ category: 'funded', useEveningPeak: true });
  assert.equal(fundedList.length, 15);

  // Rank 1 Fixed: Yohan Siriwardhana from Sri Lanka ($72,876.98)
  const rank1 = fundedList[0];
  assert.equal(rank1.rank, 1);
  assert.equal(rank1.name, 'Yohan Siriwardhana');
  assert.equal(rank1.country, 'Sri Lanka');
  assert.equal(rank1.isoCode, 'LK');
  assert.equal(rank1.profit, YOHAN_FUNDED_PROFIT);

  // Rank 15 Fixed: $27,321.11
  const rank15 = fundedList[14];
  assert.equal(rank15.rank, 15);
  assert.equal(rank15.profit, FUNDED_RANK_15_PROFIT);

  // Regional Distribution: 1 LK, 7 IN, 3 BD, 2 PK, 2 AE/MY
  assert.equal(fundedList.filter((t) => t.isoCode === 'LK').length, 1);
  assert.equal(fundedList.filter((t) => t.isoCode === 'IN').length, 7);
  assert.equal(fundedList.filter((t) => t.isoCode === 'BD').length, 3);
  assert.equal(fundedList.filter((t) => t.isoCode === 'PK').length, 2);
  assert.equal(fundedList.filter((t) => t.isoCode === 'AE' || t.isoCode === 'MY').length, 2);
});

test('Rule 2: Self-Funded Traders Leaderboard (Daily Reset Logic) features Yohan Siriwardhana ($37,456.55) and 1 LK, 5 IN, 4 PK, 3 AE, 2 BD with distinct names', () => {
  const morningUtcMs = Date.UTC(2026, 10, 10, 0, 15, 0); // 05:45 AM SLST
  const morningReset = getSriLankaDailyResetInfo(morningUtcMs);
  assert.equal(morningReset.sessionPhase, 'morning');

  const selfFundedList = getDynamicLeaderboardTraders({ category: 'self_funded', useEveningPeak: true });
  assert.equal(selfFundedList.length, 15);

  // Rank 1 Fixed: Yohan Siriwardhana ($37,456.55)
  const rank1 = selfFundedList[0];
  assert.equal(rank1.rank, 1);
  assert.equal(rank1.name, 'Yohan Siriwardhana');
  assert.equal(rank1.country, 'Sri Lanka');
  assert.equal(rank1.profit, YOHAN_SELF_FUNDED_PROFIT);

  // Regional Distribution: 1 LK, 5 IN, 4 PK, 3 AE, 2 BD
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'LK').length, 1);
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'IN').length, 5);
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'PK').length, 4);
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'AE').length, 3);
  assert.equal(selfFundedList.filter((t) => t.isoCode === 'BD').length, 2);

  // Check distinct names between Funded and Self-Funded (excluding Yohan at Rank 1)
  const fundedList = getDynamicLeaderboardTraders({ category: 'funded', useEveningPeak: true });
  const fundedNames = new Set(fundedList.slice(1).map((t) => t.name));
  const selfFundedNames = selfFundedList.slice(1).map((t) => t.name);

  for (const name of selfFundedNames) {
    assert.equal(fundedNames.has(name), false, `Name '${name}' should not appear in both leaderboards`);
  }
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
