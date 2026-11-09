import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEKLY_LEADERBOARD_TRADERS,
  YOHAN_SIRIWARDHANA_ENTRY,
  KASUN_PERERA_ENTRY,
  resolveUserLeaderboardPosition,
  normalizeWeeklyLeaderboard,
  getMondayWeeklyResetInfo,
  formatCleanLeaderboardRow,
  isEligibleLeaderboardAccount,
} from './leaderboardEngine.ts';
import { getIsoCountryCode } from '../components/CountryFlagIcon.tsx';

test('Leaderboard consists of 15 traders with Rank 1 profit $66,456.11 and Rank 7 Yohan Siriwardhana ($29,456.71)', () => {
  const normalized = normalizeWeeklyLeaderboard(WEEKLY_LEADERBOARD_TRADERS);
  assert.equal(normalized.length, 15);

  // Top 1: Rashid Al-Maktoum with $66,456.11
  const top1 = normalized[0];
  assert.equal(top1.rank, 1);
  assert.equal(top1.profit, 66456.11);

  // Rank 7: Yohan Siriwardhana with Sri Lanka flag and $29,456.71
  const seventh = normalized[6];
  assert.ok(seventh);
  assert.equal(seventh.rank, 7);
  assert.equal(seventh.name, 'Yohan Siriwardhana');
  assert.equal(seventh.flag, '🇱🇰');
  assert.equal(seventh.isoCode, 'LK');
  assert.equal(seventh.profit, 29456.71);
  assert.equal(YOHAN_SIRIWARDHANA_ENTRY.profit, 29456.71);
});

test('Weekly leaderboard includes strong representation from India, Pakistan, Dubai (UAE), and Bangladesh with valid ISO codes', () => {
  const countries = new Set(WEEKLY_LEADERBOARD_TRADERS.map((t) => t.country));
  const flags = new Set(WEEKLY_LEADERBOARD_TRADERS.map((t) => t.flag));

  assert.equal(countries.has('India'), true);
  assert.equal(countries.has('Pakistan'), true);
  assert.equal(countries.has('Dubai, UAE'), true);
  assert.equal(countries.has('Bangladesh'), true);
  assert.equal(countries.has('Sri Lanka'), true);

  assert.equal(flags.has('🇮🇳'), true);
  assert.equal(flags.has('🇵🇰'), true);
  assert.equal(flags.has('🇧🇩'), true);
  assert.equal(flags.has('🇦🇪'), true);
  assert.equal(flags.has('🇱🇰'), true);

  assert.equal(getIsoCountryCode('Bangladesh'), 'bd');
  assert.equal(getIsoCountryCode('Pakistan'), 'pk');
  assert.equal(getIsoCountryCode('Dubai, UAE'), 'ae');
  assert.equal(getIsoCountryCode('India'), 'in');
  assert.equal(getIsoCountryCode('Sri Lanka'), 'lk');
});

test('isEligibleLeaderboardAccount excludes Demo, Personal, and Challenge accounts', () => {
  assert.equal(isEligibleLeaderboardAccount({ tier: 'demo', phase: 'demo' }), false);
  assert.equal(isEligibleLeaderboardAccount({ tier: 'personal', phase: 'personal_live', id: 'BFT-PERS-001' }), false);
  assert.equal(isEligibleLeaderboardAccount({ tier: 'two-step', phase: 'phase_1' }), false);
  assert.equal(isEligibleLeaderboardAccount({ tier: 'one-step', phase: 'phase_2' }), false);

  // Live Funded accounts qualify
  assert.equal(isEligibleLeaderboardAccount({ tier: 'instant', phase: 'funded', status: 'active' }), true);
  assert.equal(isEligibleLeaderboardAccount({ tier: 'two-step', phase: 'funded', status: 'passed' }), true);
});

test('resolveUserLeaderboardPosition returns 1000+ when profit is $0, 0 trades, ineligible account, or rank > 20', () => {
  const zeroProfit = resolveUserLeaderboardPosition(0, 0);
  assert.equal(zeroProfit.isUnranked, true);
  assert.equal(zeroProfit.rankLabel, '1000+');
  assert.equal(zeroProfit.verifiedWeeklyProfit, 0);

  const negativeProfit = resolveUserLeaderboardPosition(-250, 5);
  assert.equal(negativeProfit.isUnranked, true);
  assert.equal(negativeProfit.rankLabel, '1000+');
  assert.equal(negativeProfit.verifiedWeeklyProfit, 0);

  const noTrades = resolveUserLeaderboardPosition(500, 0);
  assert.equal(noTrades.isUnranked, true);
  assert.equal(noTrades.rankLabel, '1000+');

  // Ineligible Demo / Challenge account -> 1000+
  const demoResult = resolveUserLeaderboardPosition(15000, 10, WEEKLY_LEADERBOARD_TRADERS, { tier: 'demo' });
  assert.equal(demoResult.isUnranked, true);
  assert.equal(demoResult.rankLabel, '1000+');

  // Rank calculation based on new 15-trader distribution:
  // $25,000 profit is higher than #9 ($23,410) -> Rank #9
  const fundedEligible = { tier: 'instant', phase: 'funded' };
  const activeRanked = resolveUserLeaderboardPosition(25000, 6, WEEKLY_LEADERBOARD_TRADERS, fundedEligible);
  assert.equal(activeRanked.isUnranked, false);
  assert.equal(activeRanked.rankLabel, '#9');
  assert.equal(activeRanked.verifiedWeeklyProfit, 25000);

  // $32,000 profit is higher than #6 ($31,250) -> Rank #6
  const activeRanked6 = resolveUserLeaderboardPosition(32000, 6, WEEKLY_LEADERBOARD_TRADERS, fundedEligible);
  assert.equal(activeRanked6.isUnranked, false);
  assert.equal(activeRanked6.rankLabel, '#6');
  assert.equal(activeRanked6.verifiedWeeklyProfit, 32000);

  // Profit below 20th place -> 1000+
  const belowTop20 = resolveUserLeaderboardPosition(100, 5, WEEKLY_LEADERBOARD_TRADERS, fundedEligible);
  assert.equal(belowTop20.isUnranked, true);
  assert.equal(belowTop20.rankLabel, '1000+');
});

test('getMondayWeeklyResetInfo computes valid Monday UTC reset schedule', () => {
  // Wednesday, Oct 28, 2026 12:00:00 UTC
  const sampleNow = Date.UTC(2026, 9, 28, 12, 0, 0);
  const info = getMondayWeeklyResetInfo(sampleNow);
  assert.equal(info.weekStartIso, '2026-10-26'); // Monday Oct 26
  assert.equal(info.nextMondayIso, '2026-11-02'); // Next Monday Nov 2
  assert.ok(info.resetScheduleLabel.includes('Resets Monday 00:00 UTC'));
});

test('formatCleanLeaderboardRow formats strictly rank number, flag, trader name, and profit amount', () => {
  const normalized = normalizeWeeklyLeaderboard(WEEKLY_LEADERBOARD_TRADERS);
  const top1 = formatCleanLeaderboardRow(normalized[0]);
  assert.deepEqual(top1, {
    rank: 1,
    rankDisplay: '1',
    flag: '🇦🇪',
    name: 'Rashid Al-Maktoum',
    profitFormatted: '+$66,456.11',
    isTopThree: true,
  });

  const seventh = formatCleanLeaderboardRow(normalized[6]);
  assert.deepEqual(seventh, {
    rank: 7,
    rankDisplay: '7',
    flag: '🇱🇰',
    name: 'Yohan Siriwardhana',
    profitFormatted: '+$29,456.71',
    isTopThree: false,
  });
});


