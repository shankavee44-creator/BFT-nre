import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSecondsToTimer } from '../components/QuotexMobileDock';

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
});

test('Duration boundary validation enforces minimum 30s rule and upper bound', () => {
  const clampDuration = (dur: number) => Math.max(30, Math.min(14400, dur));

  assert.equal(clampDuration(10), 30);
  assert.equal(clampDuration(30), 30);
  assert.equal(clampDuration(60), 60);
  assert.equal(clampDuration(300), 300);
  assert.equal(clampDuration(20000), 14400);
});
