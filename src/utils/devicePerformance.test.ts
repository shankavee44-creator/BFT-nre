import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDevicePerformanceTier,
  getDevicePerformanceProfile,
  applyDevicePerformanceClasses,
  PERF_STORAGE_KEY,
} from './devicePerformance.ts';

test('detectDevicePerformanceTier returns "high" or "low" and respects manual override', () => {
  // Test manual preference low
  const lowProfile = getDevicePerformanceProfile('low');
  assert.equal(lowProfile.tier, 'low');
  assert.equal(lowProfile.isLowEnd, true);
  assert.equal(lowProfile.isHighEnd, false);
  assert.equal(lowProfile.recommendedMaxCandles, 180);
  assert.equal(lowProfile.backdropBlurEnabled, false);

  // Test manual preference high
  const highProfile = getDevicePerformanceProfile('high');
  assert.equal(highProfile.tier, 'high');
  assert.equal(highProfile.isLowEnd, false);
  assert.equal(highProfile.isHighEnd, true);
  assert.equal(highProfile.recommendedMaxCandles, 500);
  assert.equal(highProfile.backdropBlurEnabled, true);
});

test('getDevicePerformanceProfile configures throttled chart updates for low-end hardware', () => {
  const low = getDevicePerformanceProfile('low');
  assert.ok(low.chartUpdateThrottleMs >= 40, 'Low-end tier should throttle chart updates');
  assert.equal(low.highFpsAnimationsEnabled, false);

  const high = getDevicePerformanceProfile('high');
  assert.equal(high.chartUpdateThrottleMs, 0, 'High-end tier should not artificially throttle');
  assert.equal(high.highFpsAnimationsEnabled, true);
});
