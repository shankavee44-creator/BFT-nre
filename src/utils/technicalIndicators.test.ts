import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  calculateSupportResistanceLevels,
  evaluateLiveTradeOverlayStatus,
} from './technicalIndicators';
import {
  isTradeLockedUntilExpiry,
  canSettleTradeAtTime,
} from './liveMarketFeed';
import type { Candle } from '../types';

function generateSampleCandles(count: number): Candle[] {
  const baseTime = 1730000000000;
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i * 0.4) * 0.005;
    const open = 1.085 + wave;
    const close = 1.085 + Math.sin((i + 1) * 0.4) * 0.005;
    const high = Math.max(open, close) + 0.0012;
    const low = Math.min(open, close) - 0.0012;
    candles.push({
      time: baseTime + i * 60000,
      open,
      high,
      low,
      close,
      volume: 100 + i,
    });
  }
  return candles;
}

describe('Visual Trade Overlay & Locked Trade Execution Logic', () => {
  it('evaluates Higher (CALL) trade as ITM (Green) when price > strikePrice and locked before expiry', () => {
    const startTime = 1730000000000;
    const endTime = startTime + 60000;
    const status = evaluateLiveTradeOverlayStatus(
      {
        direction: 'CALL',
        strikePrice: 1.08500,
        investment: 100,
        payoutPercentage: 92,
        startTime,
        endTime,
      },
      1.08550,
      startTime + 15000
    );

    assert.equal(status.isCall, true);
    assert.equal(status.isWinning, true);
    assert.equal(status.statusTag, 'ITM');
    assert.equal(status.directionLabel, 'HIGHER');
    assert.equal(status.lineColor, '#00e676');
    assert.equal(status.secondsLeft, 45);
    assert.equal(status.formattedCountdown, '00:45');
    assert.equal(status.profitAmount, 92);
    assert.equal(status.pnlDisplay, '+$92.00');
    assert.equal(status.isLockedUntilExpiry, true);
  });

  it('evaluates Lower (PUT) trade as OTM (Red) when price > strikePrice', () => {
    const startTime = 1730000000000;
    const endTime = startTime + 60000;
    const status = evaluateLiveTradeOverlayStatus(
      {
        direction: 'PUT',
        strikePrice: 1.08500,
        investment: 50,
        payoutPercentage: 88,
        startTime,
        endTime,
      },
      1.08540,
      startTime + 30000
    );

    assert.equal(status.isCall, false);
    assert.equal(status.isWinning, false);
    assert.equal(status.statusTag, 'OTM');
    assert.equal(status.directionLabel, 'LOWER');
    assert.equal(status.lineColor, '#ff334b');
    assert.equal(status.secondsLeft, 30);
    assert.equal(status.formattedCountdown, '00:30');
    assert.equal(status.pnlDisplay, '-$50.00');
    assert.equal(status.isLockedUntilExpiry, true);
  });

  it('strictly locks active trades before expiration and only allows settlement once full duration is met', () => {
    const trade = {
      status: 'active',
      startTime: 1000000,
      endTime: 1060000,
    };

    // Mid-trade (locked)
    assert.equal(isTradeLockedUntilExpiry(trade, 1030000), true);
    const earlyCheck = canSettleTradeAtTime(trade, 1030000);
    assert.equal(earlyCheck.allowed, false);
    assert.equal(earlyCheck.remainingMs, 30000);
    assert.ok(earlyCheck.reason?.includes('locked until expiration'));

    // At or after expiration (unlocked for automatic settlement)
    assert.equal(isTradeLockedUntilExpiry(trade, 1060000), false);
    const expiredCheck = canSettleTradeAtTime(trade, 1060000);
    assert.equal(expiredCheck.allowed, true);
    assert.equal(expiredCheck.remainingMs, 0);
  });
});

describe('Technical Analysis Indicators & Support/Resistance Levels', () => {
  it('computes SMA, EMA, RSI, Bollinger Bands, and Support/Resistance levels accurately', () => {
    const candles = generateSampleCandles(40);

    const sma = calculateSMA(candles, 14);
    assert.equal(sma.length, 40);
    assert.equal(sma[0], null);
    assert.equal(typeof sma[39], 'number');

    const ema = calculateEMA(candles, 9);
    assert.equal(ema.length, 40);
    assert.equal(typeof ema[39], 'number');

    const rsi = calculateRSI(candles, 14);
    assert.equal(rsi.length, 40);
    assert.ok(rsi[39]! >= 0 && rsi[39]! <= 100);

    const bb = calculateBollingerBands(candles, 20, 2);
    assert.equal(bb.upper.length, 40);
    assert.ok(bb.upper[39]! > bb.lower[39]!);

    const sr = calculateSupportResistanceLevels(candles, 5);
    assert.equal(sr.length, 2);
    const res = sr.find((l) => l.type === 'resistance');
    const sup = sr.find((l) => l.type === 'support');
    assert.ok(res && sup);
    assert.ok(res.price >= sup.price);
  });
});
