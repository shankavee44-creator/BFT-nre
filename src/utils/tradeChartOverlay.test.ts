import test from 'node:test';
import assert from 'node:assert/strict';
import {
  priceToCanvasY,
  timestampToCanvasX,
  computeTradeHistoryChartMarkers,
  findHoveredTradeMarker,
  generateSeededPastTradesForCandles,
} from './tradeChartOverlay';
import { AssetInfo, BinaryTrade, Candle } from '../types';

const mockAsset: AssetInfo = {
  symbol: 'EUR/USD (OTC)',
  name: 'Euro / US Dollar OTC',
  category: 'Forex (OTC)',
  payout: 88,
  basePrice: 1.0845,
  volatility: 0.0004,
  pipDecimals: 5,
  flag: '🇪🇺🇺🇸',
};

function createMockCandles(count: number = 30, startTimeMs: number = 1700000000000): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const base = 1.084 + i * 0.0001;
    candles.push({
      time: startTimeMs + i * 60000,
      open: Number(base.toFixed(5)),
      high: Number((base + 0.0003).toFixed(5)),
      low: Number((base - 0.0002).toFixed(5)),
      close: Number((base + 0.00015).toFixed(5)),
      volume: 100 + i,
    });
  }
  return candles;
}

test('priceToCanvasY maps higher prices near top of canvas and lower prices near bottom', () => {
  const minPrice = 1.08;
  const maxPrice = 1.09;
  const chartHeight = 400;

  const yHigh = priceToCanvasY(1.089, minPrice, maxPrice, chartHeight);
  const yMid = priceToCanvasY(1.085, minPrice, maxPrice, chartHeight);
  const yLow = priceToCanvasY(1.081, minPrice, maxPrice, chartHeight);

  assert.ok(yHigh < yMid, 'Higher price should have smaller Y coordinate');
  assert.ok(yMid < yLow, 'Mid price should have smaller Y coordinate than low price');
});

test('timestampToCanvasX maps exact candle and sub-candle timestamps to monotonically increasing X coordinates', () => {
  const candles = createMockCandles(30, 1700000000000);
  const xCandle5 = timestampToCanvasX(candles[5].time, candles, 60, 900);
  const xCandle5Half = timestampToCanvasX(candles[5].time + 30000, candles, 60, 900);
  const xCandle6 = timestampToCanvasX(candles[6].time, candles, 60, 900);

  assert.ok(xCandle5 !== null && xCandle5Half !== null && xCandle6 !== null);
  assert.ok(xCandle5 < xCandle5Half, 'Halfway timestamp should be to the right of candle 5 start');
  assert.ok(xCandle5Half < xCandle6, 'Candle 6 start should be to the right of halfway timestamp');

  // Out-of-bounds timestamp far in the past returns null
  const xOut = timestampToCanvasX(candles[0].time - 60000 * 10, candles, 60, 900);
  assert.equal(xOut, null);
});

test('computeTradeHistoryChartMarkers creates green (#00e676) and red (#ff334b) execution & settlement markers', () => {
  const candles = createMockCandles(30, 1700000000000);
  const trades: BinaryTrade[] = [
    {
      id: 'TRD-WIN-1',
      accountId: 'BFT-91823',
      asset: 'EUR/USD (OTC)',
      category: 'Forex (OTC)',
      direction: 'CALL',
      investment: 50,
      payoutPercentage: 88,
      strikePrice: candles[10].open,
      closePrice: candles[12].close,
      startTime: candles[10].time,
      endTime: candles[12].time,
      durationSeconds: 120,
      status: 'won',
      pnl: 44,
    },
    {
      id: 'TRD-LOSS-2',
      accountId: 'BFT-91823',
      asset: 'EUR/USD (OTC)',
      category: 'Forex (OTC)',
      direction: 'PUT',
      investment: 25,
      payoutPercentage: 88,
      strikePrice: candles[18].open,
      closePrice: candles[20].close,
      startTime: candles[18].time,
      endTime: candles[20].time,
      durationSeconds: 120,
      status: 'lost',
      pnl: -25,
    },
  ];

  const { markers, trajectories } = computeTradeHistoryChartMarkers({
    trades,
    assetSymbol: 'EUR/USD (OTC)',
    visibleCandles: candles,
    timeframeSeconds: 60,
    canvasWidth: 900,
    chartHeight: 450,
    minPrice: 1.083,
    maxPrice: 1.088,
  });

  assert.equal(trajectories.length, 2);
  assert.equal(markers.length, 4); // 2 execution + 2 settlement dots

  const winExec = markers.find((m) => m.id === 'TRD-WIN-1:execution');
  const winSettle = markers.find((m) => m.id === 'TRD-WIN-1:settlement');
  const lossExec = markers.find((m) => m.id === 'TRD-LOSS-2:execution');

  assert.ok(winExec && winSettle && lossExec);
  assert.equal(winExec.color, '#00e676');
  assert.equal(winSettle.color, '#00e676');
  assert.equal(lossExec.color, '#ff334b');
  assert.ok(winSettle.x > winExec.x, 'Settlement dot X must be after execution dot X');
});

test('findHoveredTradeMarker accurately detects cursor proximity to execution and settlement dots', () => {
  const candles = createMockCandles(30, 1700000000000);
  const seeded = generateSeededPastTradesForCandles(mockAsset, candles);
  assert.equal(seeded.length, 4);

  const { markers } = computeTradeHistoryChartMarkers({
    trades: seeded,
    assetSymbol: mockAsset.symbol,
    visibleCandles: candles,
    timeframeSeconds: 60,
    canvasWidth: 900,
    chartHeight: 450,
    minPrice: 1.083,
    maxPrice: 1.088,
  });

  assert.equal(markers.length, 8);
  const target = markers[0];

  const hit = findHoveredTradeMarker(target.x + 3, target.y - 2, markers, 11);
  assert.ok(hit);
  assert.equal(hit.id, target.id);

  const miss = findHoveredTradeMarker(5, 5, markers, 11);
  assert.equal(miss, null);
});
