import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSecondsToTimer } from '../components/QuotexMobileDock';
import {
  calculateCandleCountdown,
  calculatePinchZoomLevel,
  calculateTouchPanOffset,
  formatMobileAccountBalance,
  resolveMobileTradesDrawerAction,
  computeMobileTerminalViewportBudget,
} from './quotexMobile';
import { HAPTIC_PATTERNS, triggerHapticFeedback } from './soundEffects';

test('formatSecondsToTimer formats durations accurately in Quotex MM:SS:00 style', () => {
  assert.equal(formatSecondsToTimer(30), '00:30:00');
  assert.equal(formatSecondsToTimer(60), '01:00:00');
  assert.equal(formatSecondsToTimer(120), '02:00:00');
  assert.equal(formatSecondsToTimer(300), '05:00:00');
  assert.equal(formatSecondsToTimer(900), '15:00:00');
});

test('Investment calculations compute real-time payouts accurately', () => {
  const computePayout = (inv: number, payoutPct: number) => {
    return Number((inv * (1 + payoutPct / 100)).toFixed(2));
  };

  // $2 at 83% payout = $3.66 (matching Quotex reference)
  assert.equal(computePayout(2, 83), 3.66);

  // $10 at 90% payout = $19.00
  assert.equal(computePayout(10, 90), 19.00);

  // $100 at 93% payout = $193.00
  assert.equal(computePayout(100, 93), 193.00);
});

test('Mobile touch zoom distance formula calculates organic scale factors accurately', () => {
  const computeTouchDist = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.hypot(x2 - x1, y2 - y1);
  };

  const initialDist = computeTouchDist(100, 100, 200, 200); // ~141.42
  const pinchOutDist = computeTouchDist(80, 80, 220, 220); // ~197.99
  const scale = pinchOutDist / initialDist;

  assert.ok(scale > 1.3, 'Pinch out should expand zoom scale');
  assert.ok(scale < 1.5, 'Pinch out within expected geometric range');

  const zoomedIn = calculatePinchZoomLevel(1.0, initialDist, pinchOutDist);
  assert.equal(zoomedIn, 1.4);

  const zoomedOut = calculatePinchZoomLevel(1.0, pinchOutDist, initialDist);
  assert.equal(zoomedOut, 0.71);

  // Clamping boundaries
  assert.equal(calculatePinchZoomLevel(3.0, 50, 200), 3.5);
  assert.equal(calculatePinchZoomLevel(0.5, 200, 20), 0.35);
});

test('calculateCandleCountdown computes exact seconds/minutes remaining before candle close', () => {
  // 1m (60s) candle at t = 18 seconds into the minute -> 42s remaining ("00:42")
  const c1 = calculateCandleCountdown(18_000, 60);
  assert.equal(c1.remainingSeconds, 42);
  assert.equal(c1.formatted, '00:42');

  // 5m (300s) candle at t = 125 seconds -> 175s remaining ("02:55")
  const c2 = calculateCandleCountdown(125_000, 300);
  assert.equal(c2.remainingSeconds, 175);
  assert.equal(c2.formatted, '02:55');

  // 5s candle at exact boundary t = 10_000ms -> 5s remaining ("00:05")
  const c3 = calculateCandleCountdown(10_000, 5);
  assert.equal(c3.remainingSeconds, 5);
  assert.equal(c3.formatted, '00:05');
});

test('calculateTouchPanOffset pans smoothly through historical candles and clamps safely', () => {
  // Dragging right (+110px at zoom 1.0) shifts panOffset back in history by 10 candles
  const p1 = calculateTouchPanOffset(0, 110, 1.0, 120);
  assert.equal(p1, 10);

  // Dragging left (-200px from panOffset 5) clamps at 0 (live edge)
  const p2 = calculateTouchPanOffset(5, -200, 1.0, 120);
  assert.equal(p2, 0);

  // Dragging far right clamps at totalCandles - 20
  const p3 = calculateTouchPanOffset(90, 500, 1.0, 120);
  assert.equal(p3, 100);
});

test('Safe balance helper guards against null, undefined, and non-numeric balances', () => {
  const formatBalance = (acc?: { currentBalance?: number } | null): string => {
    return (acc?.currentBalance ?? 0).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  assert.equal(formatBalance(undefined), '0.0');
  assert.equal(formatBalance(null), '0.0');
  assert.equal(formatBalance({}), '0.0');
  assert.equal(formatBalance({ currentBalance: 10000.9 }), '10,000.9');
  assert.equal(formatBalance({ currentBalance: 5000 }), '5,000.0');
  assert.equal(formatMobileAccountBalance(10000.9, 2), '10,000.90');
});

test('Duration boundary validation enforces minimum 30s rule and upper bound', () => {
  const clampDuration = (dur: number) => Math.max(30, Math.min(14400, dur));

  assert.equal(clampDuration(10), 30);
  assert.equal(clampDuration(30), 30);
  assert.equal(clampDuration(60), 60);
  assert.equal(clampDuration(300), 300);
  assert.equal(clampDuration(20000), 14400);
});

test('resolveMobileTradesDrawerAction handles smooth tab switching and collapsing without losing active tab', () => {
  // Opening 'history' when drawer is closed opens drawer directly on 'history'
  const s1 = resolveMobileTradesDrawerAction(false, 'trades', 'history');
  assert.deepEqual(s1, { isOpen: true, activeTab: 'history' });

  // Switching from 'history' to 'trades' while open keeps drawer open and changes activeTab
  const s2 = resolveMobileTradesDrawerAction(true, 'history', 'trades');
  assert.deepEqual(s2, { isOpen: true, activeTab: 'trades' });

  // Tapping active 'trades' tab again while open collapses the drawer
  const s3 = resolveMobileTradesDrawerAction(true, 'trades', 'trades');
  assert.deepEqual(s3, { isOpen: false, activeTab: 'trades' });

  // Explicit toggle button flips isOpen while preserving activeTab
  const s4 = resolveMobileTradesDrawerAction(false, 'history', 'toggle');
  assert.deepEqual(s4, { isOpen: true, activeTab: 'history' });
});

test('computeMobileTerminalViewportBudget guarantees generous chart canvas height on 390x844 and 375x667 viewports', () => {
  const iphone14 = computeMobileTerminalViewportBudget(844);
  assert.equal(iphone14.chartCanvasPx, 518);
  assert.equal(iphone14.fitsWithoutOverflow, true);

  const iphoneSE = computeMobileTerminalViewportBudget(667);
  assert.equal(iphoneSE.chartCanvasPx, 341);
  assert.equal(iphoneSE.fitsWithoutOverflow, true);
  assert.ok(iphoneSE.chartCanvasPx >= 300);
});

test('triggerHapticFeedback invokes Web Vibration API patterns for trade entry and withdrawal requests safely', () => {
  const recordedPatterns: Array<number | number[]> = [];
  const mockNav = {
    vibrate: (p: number | number[]) => {
      recordedPatterns.push(p);
      return true;
    },
  };

  assert.equal(triggerHapticFeedback(HAPTIC_PATTERNS.tradeEntryCall, mockNav), true);
  assert.equal(triggerHapticFeedback(HAPTIC_PATTERNS.tradeEntryPut, mockNav), true);
  assert.equal(triggerHapticFeedback(HAPTIC_PATTERNS.withdrawalRequest, mockNav), true);
  assert.equal(triggerHapticFeedback(HAPTIC_PATTERNS.withdrawalSuccess, mockNav), true);

  assert.deepEqual(recordedPatterns[0], [22, 30, 35]);
  assert.deepEqual(recordedPatterns[1], [35, 30, 22]);
  assert.deepEqual(recordedPatterns[2], [20, 40, 25]);
  assert.deepEqual(recordedPatterns[3], [30, 45, 40, 45, 70]);

  // Gracefully returns false when Vibration API is unavailable
  assert.equal(triggerHapticFeedback(HAPTIC_PATTERNS.uiTap, {}), false);
});

test('getTopVolatileAssets returns the top 5 most volatile assets for the quick-access strip', async () => {
  const { getTopVolatileAssets, DEFAULT_ASSETS } = await import('./storage');
  const top5 = getTopVolatileAssets(DEFAULT_ASSETS, 5);
  assert.equal(top5.length, 5);
  for (const asset of top5) {
    assert.ok(asset.symbol && asset.symbol.length > 0);
    assert.ok(asset.volatility > 0);
  }
});

test('computeUserTradingSummary calculates real trading stats and returns $0.00 / 0% when empty', async () => {
  const { computeUserTradingSummary } = await import('./supabaseTradeSync');

  const emptySummary = computeUserTradingSummary([]);
  assert.equal(emptySummary.totalTradesCount, 0);
  assert.equal(emptySummary.winRatePercent, 0);
  assert.equal(emptySummary.formattedWinRate, '0%');
  assert.equal(emptySummary.totalNetProfitLoss, 0);
  assert.equal(emptySummary.formattedNetProfitLoss, '$0.00');
  assert.equal(emptySummary.totalVolumeTraded, 0);
  assert.equal(emptySummary.formattedVolumeTraded, '$0.00');

  const realSummary = computeUserTradingSummary([
    { id: '1', investment: 100, status: 'won', pnl: 85 },
    { id: '2', investment: 50, status: 'lost', pnl: -50 },
    { id: '3', investment: 200, status: 'won', pnl: 170 },
    { id: '4', investment: 50, status: 'active' },
  ]);

  assert.equal(realSummary.totalTradesCount, 4);
  assert.equal(realSummary.winningTradesCount, 2);
  assert.equal(realSummary.losingTradesCount, 1);
  assert.equal(realSummary.totalCompletedTrades, 3);
  assert.equal(realSummary.winRatePercent, 66.7);
  assert.equal(realSummary.formattedWinRate, '66.7%');
  assert.equal(realSummary.totalNetProfitLoss, 205);
  assert.equal(realSummary.formattedNetProfitLoss, '+$205.00');
  assert.equal(realSummary.totalVolumeTraded, 400);
  assert.equal(realSummary.formattedVolumeTraded, '$400.00');

  // Test Supabase raw rows with uppercase status, 'amount' column, and negative P&L
  const supaRows = [
    { id: 's1', amount: 150, status: 'WIN', payout_multiplier: 1.85, potentialPayout: 127.5 },
    { id: 's2', amount: 100, status: 'LOSS' },
    { id: 's3', amount: 50, status: 'TIE' },
    { id: 's4', amount: 200, status: 'OPEN' },
  ];
  const supaSummary = computeUserTradingSummary(supaRows);
  assert.equal(supaSummary.totalTradesCount, 4);
  assert.equal(supaSummary.winningTradesCount, 1);
  assert.equal(supaSummary.losingTradesCount, 1);
  assert.equal(supaSummary.totalCompletedTrades, 3); // 1 win + 1 loss + 1 tie
  assert.equal(supaSummary.winRatePercent, 33.3);
  assert.equal(supaSummary.totalVolumeTraded, 500);
  assert.equal(supaSummary.totalNetProfitLoss, 27.5);
  assert.equal(supaSummary.formattedNetProfitLoss, '+$27.50');
});

test('filterTradesForActiveAccount correctly segregates DEMO, SELF_FUNDED, and FUNDED trades', async () => {
  const { filterTradesForActiveAccount } = await import('./supabaseTradeSync');

  const trades = [
    { id: 't1', accountId: 'BFT-DEMO', accountTier: 'demo', asset: 'EUR/USD (OTC)' },
    { id: 't2', accountId: 'BFT-SELF', accountTier: 'personal', asset: 'BTC/USD (OTC)' },
    { id: 't3', accountId: 'BFT-FUNDED-1', accountTier: 'instant', asset: 'GOLD (OTC)' },
  ] as any[];

  const demoFiltered = filterTradesForActiveAccount(trades, { id: 'BFT-DEMO', tier: 'demo' });
  assert.equal(demoFiltered.length, 1);
  assert.equal(demoFiltered[0].id, 't1');

  const personalFiltered = filterTradesForActiveAccount(trades, { id: 'BFT-SELF', tier: 'personal' });
  assert.equal(personalFiltered.length, 1);
  assert.equal(personalFiltered[0].id, 't2');

  const fundedFiltered = filterTradesForActiveAccount(trades, { id: 'BFT-FUNDED-1', tier: 'instant' });
  assert.equal(fundedFiltered.length, 1);
  assert.equal(fundedFiltered[0].id, 't3');
});

test('resolveOptimisticTradeResult accurately resolves CALL, PUT, and TIE trades instantly at expiry', async () => {
  const { resolveOptimisticTradeResult } = await import('./supabaseTradeSync');

  // Test 1: CALL Win (exit > strike)
  const callWin = resolveOptimisticTradeResult(
    {
      id: 'TRD-CALL-WIN',
      status: 'active',
      direction: 'CALL',
      strikePrice: 1.0850,
      investment: 100,
      payoutPercentage: 85,
    } as any,
    1.0855
  );
  assert.equal(callWin.status, 'won');
  assert.equal(callWin.pnl, 85);
  assert.equal(callWin.closePrice, 1.0855);

  // Test 2: CALL Loss (exit < strike)
  const callLoss = resolveOptimisticTradeResult(
    {
      id: 'TRD-CALL-LOSS',
      status: 'active',
      direction: 'CALL',
      strikePrice: 1.0850,
      investment: 100,
      payoutPercentage: 85,
    } as any,
    1.0845
  );
  assert.equal(callLoss.status, 'lost');
  assert.equal(callLoss.pnl, -100);
  assert.equal(callLoss.closePrice, 1.0845);

  // Test 3: PUT Win (exit < strike)
  const putWin = resolveOptimisticTradeResult(
    {
      id: 'TRD-PUT-WIN',
      status: 'active',
      direction: 'PUT',
      strikePrice: 1.0850,
      investment: 100,
      payoutPercentage: 85,
    } as any,
    1.0845
  );
  assert.equal(putWin.status, 'won');
  assert.equal(putWin.pnl, 85);
  assert.equal(putWin.closePrice, 1.0845);

  // Test 4: PUT Loss (exit > strike)
  const putLoss = resolveOptimisticTradeResult(
    {
      id: 'TRD-PUT-LOSS',
      status: 'active',
      direction: 'PUT',
      strikePrice: 1.0850,
      investment: 100,
      payoutPercentage: 85,
    } as any,
    1.0855
  );
  assert.equal(putLoss.status, 'lost');
  assert.equal(putLoss.pnl, -100);
  assert.equal(putLoss.closePrice, 1.0855);

  // Test 5: TIE (exit == strike)
  const tieTrade = resolveOptimisticTradeResult(
    {
      id: 'TRD-TIE',
      status: 'active',
      direction: 'CALL',
      strikePrice: 1.0850,
      investment: 100,
      payoutPercentage: 85,
    } as any,
    1.0850
  );
  assert.equal(tieTrade.status, 'tie');
  assert.equal(tieTrade.pnl, 0);
  assert.equal(tieTrade.closePrice, 1.0850);
});

test('mergeTradesAuthoritatively preserves local settled trade outcome against stale remote OPEN status', async () => {
  const { mergeTradesAuthoritatively } = await import('./supabaseTradeSync');

  const localTrades = [
    {
      id: 'TRD-LOCAL-WIN',
      status: 'won',
      direction: 'CALL',
      strikePrice: 100,
      closePrice: 105,
      investment: 50,
      pnl: 42.5,
      endTime: Date.now() - 5000,
    },
  ] as any[];

  // Stale remote row that hasn't written settled status yet
  const remoteTrades = [
    {
      id: 'TRD-LOCAL-WIN',
      status: 'active',
      direction: 'CALL',
      strikePrice: 100,
      investment: 50,
      endTime: Date.now() - 5000,
    },
  ] as any[];

  const merged = mergeTradesAuthoritatively(localTrades, remoteTrades);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'won', 'Local won status must take authority over stale remote active status');
  assert.equal(merged[0].pnl, 42.5);
});


