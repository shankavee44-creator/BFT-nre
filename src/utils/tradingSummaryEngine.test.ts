import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAccountEligibleForTradingSummary,
  filterTradesFromEligibleAccounts,
  computeUserTradingSummary,
} from './supabaseTradeSync';
import { generate30DayPerformance } from './performanceData';
import type { TradingAccount, BinaryTrade } from '../types';

test('isAccountEligibleForTradingSummary rejects demo accounts', () => {
  const demoAccount: Partial<TradingAccount> = {
    id: 'BFT-DEMO-001',
    tier: 'demo',
    currentBalance: 10000,
    tradesCount: 15,
  };
  const trades: BinaryTrade[] = [
    {
      id: 'trade-1',
      accountId: 'BFT-DEMO-001',
      asset: 'EUR/USD',
      direction: 'CALL',
      strikePrice: 1.085,
      currentPrice: 1.086,
      investment: 50,
      payoutPercentage: 85,
      potentialPayout: 42.5,
      startTime: Date.now() - 60000,
      durationSeconds: 60,
      endTime: Date.now(),
      status: 'won',
      pnl: 42.5,
      accountTier: 'demo',
    },
  ];

  assert.equal(isAccountEligibleForTradingSummary(demoAccount, trades), false);
});

test('isAccountEligibleForTradingSummary strictly rejects live account with balance of 0', () => {
  const unfundedLiveAccount: Partial<TradingAccount> = {
    id: 'BFT-LIVE-001',
    tier: 'personal',
    currentBalance: 0,
    tradesCount: 0,
  };

  assert.equal(isAccountEligibleForTradingSummary(unfundedLiveAccount, []), false);
});

test('isAccountEligibleForTradingSummary strictly rejects live account with funded balance but zero completed trades', () => {
  const fundedNoTradesAccount: Partial<TradingAccount> = {
    id: 'BFT-LIVE-002',
    tier: 'personal',
    currentBalance: 500,
    tradesCount: 0,
  };

  // Only open/active trades exist, 0 completed
  const activeTrade: BinaryTrade = {
    id: 'trade-open-1',
    accountId: 'BFT-LIVE-002',
    asset: 'EUR/USD',
    direction: 'CALL',
    strikePrice: 1.085,
    currentPrice: 1.085,
    investment: 50,
    payoutPercentage: 85,
    potentialPayout: 42.5,
    startTime: Date.now(),
    durationSeconds: 60,
    endTime: Date.now() + 60000,
    status: 'active',
    pnl: 0,
    accountTier: 'personal',
  };

  assert.equal(isAccountEligibleForTradingSummary(fundedNoTradesAccount, [activeTrade]), false);
});

test('isAccountEligibleForTradingSummary accepts funded live account with completed trades', () => {
  const fundedActiveAccount: Partial<TradingAccount> = {
    id: 'BFT-LIVE-003',
    tier: 'personal',
    currentBalance: 1250,
    tradesCount: 2,
  };

  const completedTrades: BinaryTrade[] = [
    {
      id: 'trade-won-1',
      accountId: 'BFT-LIVE-003',
      asset: 'EUR/USD',
      direction: 'CALL',
      strikePrice: 1.085,
      currentPrice: 1.086,
      investment: 100,
      payoutPercentage: 85,
      potentialPayout: 85,
      startTime: Date.now() - 120000,
      durationSeconds: 60,
      endTime: Date.now() - 60000,
      status: 'won',
      pnl: 85,
      accountTier: 'personal',
    },
  ];

  assert.equal(isAccountEligibleForTradingSummary(fundedActiveAccount, completedTrades), true);
});

test('filterTradesFromEligibleAccounts filters out trades from unfunded/ineligible accounts', () => {
  const accounts: Partial<TradingAccount>[] = [
    { id: 'BFT-DEMO', tier: 'demo', currentBalance: 10000 },
    { id: 'BFT-UNFUNDED-LIVE', tier: 'personal', currentBalance: 0 },
    { id: 'BFT-ACTIVE-LIVE', tier: 'personal', currentBalance: 2000 },
  ];

  const trades: BinaryTrade[] = [
    {
      id: 't-demo',
      accountId: 'BFT-DEMO',
      asset: 'GBP/USD',
      direction: 'CALL',
      strikePrice: 1.25,
      currentPrice: 1.251,
      investment: 50,
      payoutPercentage: 85,
      potentialPayout: 42.5,
      startTime: Date.now() - 100000,
      durationSeconds: 60,
      endTime: Date.now(),
      status: 'won',
      pnl: 42.5,
      accountTier: 'demo',
    },
    {
      id: 't-unfunded',
      accountId: 'BFT-UNFUNDED-LIVE',
      asset: 'USD/JPY',
      direction: 'PUT',
      strikePrice: 155.0,
      currentPrice: 155.1,
      investment: 100,
      payoutPercentage: 85,
      potentialPayout: 85,
      startTime: Date.now() - 100000,
      durationSeconds: 60,
      endTime: Date.now(),
      status: 'lost',
      pnl: -100,
      accountTier: 'personal',
    },
    {
      id: 't-active',
      accountId: 'BFT-ACTIVE-LIVE',
      asset: 'EUR/USD',
      direction: 'CALL',
      strikePrice: 1.085,
      currentPrice: 1.086,
      investment: 200,
      payoutPercentage: 90,
      potentialPayout: 180,
      startTime: Date.now() - 100000,
      durationSeconds: 60,
      endTime: Date.now(),
      status: 'won',
      pnl: 180,
      accountTier: 'personal',
    },
  ];

  const eligibleTrades = filterTradesFromEligibleAccounts(trades, accounts as TradingAccount[]);
  assert.equal(eligibleTrades.length, 1);
  assert.equal(eligibleTrades[0].id, 't-active');
});

test('computeUserTradingSummary returns clean N/A and 0 default states when no active live accounts have trades', () => {
  const accounts: Partial<TradingAccount>[] = [
    { id: 'BFT-DEMO', tier: 'demo', currentBalance: 10000 },
    { id: 'BFT-UNFUNDED-LIVE', tier: 'personal', currentBalance: 0 },
  ];

  // Even if demo or unfunded trades are passed, summary must remain clean 0 / N/A
  const trades: BinaryTrade[] = [
    {
      id: 't-demo',
      accountId: 'BFT-DEMO',
      asset: 'GBP/USD',
      direction: 'CALL',
      strikePrice: 1.25,
      currentPrice: 1.251,
      investment: 50,
      payoutPercentage: 85,
      potentialPayout: 42.5,
      startTime: Date.now() - 100000,
      durationSeconds: 60,
      endTime: Date.now(),
      status: 'won',
      pnl: 42.5,
      accountTier: 'demo',
    },
  ];

  const summary = computeUserTradingSummary(trades, accounts as TradingAccount[]);
  assert.equal(summary.totalTradesCount, 0);
  assert.equal(summary.totalCompletedTrades, 0);
  assert.equal(summary.winRatePercent, 0);
  assert.equal(summary.formattedWinRate, 'N/A');
  assert.equal(summary.totalNetProfitLoss, 0);
  assert.equal(summary.formattedNetProfitLoss, '$0.00');
  assert.equal(summary.totalVolumeTraded, 0);
  assert.equal(summary.formattedVolumeTraded, '$0.00');
  assert.equal(summary.hasActiveTradesData, false);
});

test('generate30DayPerformance returns 30 zero points and zero stats for unfunded live accounts', () => {
  const unfundedAccount: Partial<TradingAccount> = {
    id: 'BFT-LIVE-001',
    tier: 'personal',
    initialBalance: 0,
    currentBalance: 0,
    tradesCount: 0,
  };

  const { points, stats } = generate30DayPerformance(unfundedAccount as TradingAccount, []);
  assert.equal(points.length, 30);
  assert.equal(points.every((p) => p.dailyPnL === 0 && p.cumulativeProfit === 0 && p.winRate === 0), true);
  assert.equal(stats.totalProfit, 0);
  assert.equal(stats.overallWinRate, 0);
  assert.equal(stats.totalTrades30Days, 0);
  assert.equal(stats.profitFactor, 0);
});
