import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHeikinAshi,
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateFibonacciLevels,
  calculateMACD,
} from './technicalIndicators';
import { Candle } from '../types';

const mockCandles: Candle[] = [
  { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: 2000, open: 11, high: 14, low: 10, close: 13, volume: 150 },
  { time: 3000, open: 13, high: 15, low: 12, close: 14, volume: 200 },
  { time: 4000, open: 14, high: 16, low: 13, close: 15, volume: 250 },
  { time: 5000, open: 15, high: 17, low: 14, close: 16, volume: 300 },
];

test('calculateHeikinAshi transforms standard candles accurately', () => {
  const ha = calculateHeikinAshi(mockCandles);
  assert.equal(ha.length, 5);
  // First haClose = (10 + 12 + 9 + 11) / 4 = 10.5
  assert.equal(ha[0].close, 10.5);
  // Second haOpen = (ha[0].open + ha[0].close) / 2 = (10 + 10.5) / 2 = 10.25
  assert.equal(ha[1].open, 10.25);
  assert.ok(ha[1].high >= ha[1].open);
  assert.ok(ha[1].low <= ha[1].close);
});

test('calculateSMA computes moving average correctly', () => {
  const sma3 = calculateSMA(mockCandles, 3);
  assert.equal(sma3[0], null);
  assert.equal(sma3[1], null);
  // (11 + 13 + 14) / 3 = 12.66667
  assert.equal(sma3[2], 12.66667);
});

test('calculateFibonacciLevels computes golden ratio retracements accurately', () => {
  const fib = calculateFibonacciLevels(200, 100);
  assert.equal(fib.length, 7);
  // 50% = 150
  assert.equal(fib.find((f) => f.ratio === 0.5)?.price, 150);
  // 61.8% = 161.8
  assert.equal(fib.find((f) => f.ratio === 0.618)?.price, 161.8);
});

test('calculateMACD computes macd, signal, and histogram arrays', () => {
  const macdRes = calculateMACD(mockCandles, 2, 4, 2);
  assert.equal(macdRes.macd.length, mockCandles.length);
  assert.equal(macdRes.signal.length, mockCandles.length);
  assert.equal(macdRes.histogram.length, mockCandles.length);
});

