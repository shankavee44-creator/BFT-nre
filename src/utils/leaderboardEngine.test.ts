import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEKLY_LEADERBOARD_TRADERS,
  KASUN_PERERA_ENTRY,
  resolveUserLeaderboardPosition,
  normalizeWeeklyLeaderboard,
  getMondayWeeklyResetInfo,
} from './leaderboardEngine';

test('Kasun Perera is positioned at 9th place with Sri Lankan flag and $18,995.22 profit', () => {
  const normalized = normalizeWeeklyLeaderboard(WEEKLY_LEADERBOARD_TRADERS);
  const ninth = normalized[8];
  assert.ok(ninth);
  assert.equal(ninth.rank, 9);
  assert.equal(ninth.name, 'Kasun Perera');
  assert.equal(ninth.flag, '🇱🇰');
  assert.equal(ninth.profit, 18995.22);
  assert.equal(KASUN_PERERA_ENTRY.profit, 18995.22);
});

test('Weekly leaderboard includes traders from India, Pakistan, Malaysia, and Dubai', () => {
  const countries = new Set(WEEKLY_LEADERBOARD_TRADERS.map((t) => t.country));
  const flags = new Set(WEEKLY_LEADERBOARD_TRADERS.map((t) => t.flag));

  assert.equal(countries.has('India'), true);
  assert.equal(countries.has('Pakistan'), true);
  assert.equal(countries.has('Malaysia'), true);
  assert.equal(countries.has('Dubai, UAE'), true);

  assert.equal(flags.has('🇮🇳'), true);
  assert.equal(flags.has('🇵🇰'), true);
  assert.equal(flags.has('🇲🇾'), true);
  assert.equal(flags.has('🇦🇪'), true);
  assert.equal(flags.has('🇱🇰'), true);
});

test('resolveUserLeaderboardPosition returns 1000+ when profit is $0 or weekly trades count is 0', () => {
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

  const activeRanked = resolveUserLeaderboardPosition(25000, 6);
  assert.equal(activeRanked.isUnranked, false);
  assert.equal(activeRanked.rankLabel, '#6');
  assert.equal(activeRanked.verifiedWeeklyProfit, 25000);
});

test('getMondayWeeklyResetInfo computes valid Monday UTC reset schedule', () => {
  // Wednesday, Oct 28, 2026 12:00:00 UTC
  const sampleNow = Date.UTC(2026, 9, 28, 12, 0, 0);
  const info = getMondayWeeklyResetInfo(sampleNow);
  assert.equal(info.weekStartIso, '2026-10-26'); // Monday Oct 26
  assert.equal(info.nextMondayIso, '2026-11-02'); // Next Monday Nov 2
  assert.ok(info.resetScheduleLabel.includes('Resets Monday 00:00 UTC'));
});
