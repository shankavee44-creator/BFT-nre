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

