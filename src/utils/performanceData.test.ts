import test from 'node:test';
import assert from 'node:assert/strict';
import { generate30DayPerformance } from './performanceData';
import { TradingAccount } from '../types';

test('generate30DayPerformance outputs exactly 30 data points and calibrates to account profit', () => {
  const account: TradingAccount = {
    id: 'BFT-91823',
    loginId: 'BFT-91823',
    passwordHash: 'hash',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10480, // $480 profit
    startingDayEquity: 10200,
    equity: 10480,
    dailyLossLimitPercent: 4,
    maxOverallLossPercent: 5,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-25',
    phase: 'funded',
    tradingDaysCompleted: 24,
    tradesCount: 24,
    winRate: 70.8,
  };

  const { points, stats } = generate30DayPerformance(account);

  assert.equal(points.length, 30);
  // Final point cumulative profit should match net profit $480
  assert.equal(points[points.length - 1].cumulativeProfit, 480);
  assert.equal(stats.totalProfit, 480);
  assert.ok(stats.overallWinRate >= 50);
  assert.ok(stats.totalTrades30Days > 0);
  assert.ok(stats.profitFactor > 0);
});
