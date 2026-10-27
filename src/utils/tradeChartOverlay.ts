import { AssetInfo, BinaryTrade, Candle } from '../types';

export interface TradeChartMarkerPoint {
  id: string;
  tradeId: string;
  pointType: 'execution' | 'settlement';
  timestamp: number;
  price: number;
  x: number;
  y: number;
  partnerX: number;
  partnerY: number;
  color: '#00e676' | '#ff334b';
  isWin: boolean;
  direction: 'CALL' | 'PUT';
  investment: number;
  payoutPercentage: number;
  pnl: number;
  strikePrice: number;
  closePrice: number;
  startTime: number;
  endTime: number;
  asset: string;
}

export interface TradeChartTrajectory {
  tradeId: string;
  isWin: boolean;
  color: '#00e676' | '#ff334b';
  direction: 'CALL' | 'PUT';
  investment: number;
  pnl: number;
  entryPoint: TradeChartMarkerPoint;
  exitPoint: TradeChartMarkerPoint;
}

export interface ComputeTradeOverlayParams {
  trades: BinaryTrade[];
  assetSymbol: string;
  visibleCandles: Candle[];
  timeframeSeconds: number;
  canvasWidth: number;
  chartHeight: number;
  minPrice: number;
  maxPrice: number;
}

/**
 * Maps a price value to its vertical Y canvas coordinate.
 */
export function priceToCanvasY(
  price: number,
  minPrice: number,
  maxPrice: number,
  chartHeight: number
): number {
  const range = Math.max(1e-9, maxPrice - minPrice);
  const rawY = chartHeight - ((price - minPrice) / range) * chartHeight + 10;
  return Math.max(14, Math.min(chartHeight + 6, rawY));
}

/**
 * Maps an exact timestamp (ms) to its horizontal X canvas coordinate
 * across the currently visible candles.
 */
export function timestampToCanvasX(
  timestamp: number,
  visibleCandles: Candle[],
  timeframeSeconds: number,
  canvasWidth: number
): number | null {
  if (visibleCandles.length === 0) return null;

  const bucketMs = Math.max(5, timeframeSeconds) * 1000;
  const firstTime = visibleCandles[0].time;
  const lastTime = visibleCandles[visibleCandles.length - 1].time;

  // Allow slight margin before first candle and after last candle
  if (timestamp < firstTime - bucketMs * 0.75 || timestamp > lastTime + bucketMs * 1.75) {
    return null;
  }

  const slotWidth = (canvasWidth - 78) / Math.max(1, visibleCandles.length);
  const candleGap = Math.max(2, Math.round(slotWidth * 0.24));
  const candleWidth = Math.max(4, Math.floor(slotWidth - candleGap));
  const firstCenterX = Math.floor(10 + candleWidth / 2) + 0.5;

  const fractionalIdx = (timestamp - firstTime) / bucketMs;
  const rawX = firstCenterX + fractionalIdx * slotWidth;
  return Math.max(12, Math.min(canvasWidth - 70, rawX));
}

/**
 * Computes all visible execution and settlement dot markers and trajectories
 * for settled trades ('won' | 'lost') on the active asset.
 */
export function computeTradeHistoryChartMarkers(
  params: ComputeTradeOverlayParams
): {
  markers: TradeChartMarkerPoint[];
  trajectories: TradeChartTrajectory[];
} {
  const {
    trades,
    assetSymbol,
    visibleCandles,
    timeframeSeconds,
    canvasWidth,
    chartHeight,
    minPrice,
    maxPrice,
  } = params;

  if (visibleCandles.length === 0 || canvasWidth <= 0 || chartHeight <= 0) {
    return { markers: [], trajectories: [] };
  }

  const settledAssetTrades = trades.filter(
    (t) =>
      t.asset === assetSymbol &&
      (t.status === 'won' || t.status === 'lost') &&
      typeof t.startTime === 'number' &&
      typeof t.endTime === 'number'
  );

  const markers: TradeChartMarkerPoint[] = [];
  const trajectories: TradeChartTrajectory[] = [];

  for (const trade of settledAssetTrades) {
    const rawEntryX = timestampToCanvasX(
      trade.startTime,
      visibleCandles,
      timeframeSeconds,
      canvasWidth
    );
    const rawExitX = timestampToCanvasX(
      trade.endTime,
      visibleCandles,
      timeframeSeconds,
      canvasWidth
    );

    if (rawEntryX === null && rawExitX === null) {
      continue;
    }

    const entryX = rawEntryX ?? Math.max(12, (rawExitX ?? 20) - 18);
    let exitX = rawExitX ?? Math.min(canvasWidth - 70, entryX + 18);

    // Ensure execution and settlement dots remain visually distinguishable even for short trades on high timeframes
    if (Math.abs(exitX - entryX) < 8) {
      exitX = Math.min(canvasWidth - 70, entryX + 10);
    }

    const closePrice =
      typeof trade.closePrice === 'number' ? trade.closePrice : trade.strikePrice;
    const entryY = priceToCanvasY(trade.strikePrice, minPrice, maxPrice, chartHeight);
    const exitY = priceToCanvasY(closePrice, minPrice, maxPrice, chartHeight);

    const isWin = trade.status === 'won';
    const color: '#00e676' | '#ff334b' = isWin ? '#00e676' : '#ff334b';
    const pnl =
      typeof trade.pnl === 'number'
        ? trade.pnl
        : isWin
        ? Number(((trade.investment * trade.payoutPercentage) / 100).toFixed(2))
        : -trade.investment;

    const entryPoint: TradeChartMarkerPoint = {
      id: `${trade.id}:execution`,
      tradeId: trade.id,
      pointType: 'execution',
      timestamp: trade.startTime,
      price: trade.strikePrice,
      x: Number(entryX.toFixed(1)),
      y: Number(entryY.toFixed(1)),
      partnerX: Number(exitX.toFixed(1)),
      partnerY: Number(exitY.toFixed(1)),
      color,
      isWin,
      direction: trade.direction,
      investment: trade.investment,
      payoutPercentage: trade.payoutPercentage,
      pnl,
      strikePrice: trade.strikePrice,
      closePrice,
      startTime: trade.startTime,
      endTime: trade.endTime,
      asset: trade.asset,
    };

    const exitPoint: TradeChartMarkerPoint = {
      id: `${trade.id}:settlement`,
      tradeId: trade.id,
      pointType: 'settlement',
      timestamp: trade.endTime,
      price: closePrice,
      x: Number(exitX.toFixed(1)),
      y: Number(exitY.toFixed(1)),
      partnerX: Number(entryX.toFixed(1)),
      partnerY: Number(entryY.toFixed(1)),
      color,
      isWin,
      direction: trade.direction,
      investment: trade.investment,
      payoutPercentage: trade.payoutPercentage,
      pnl,
      strikePrice: trade.strikePrice,
      closePrice,
      startTime: trade.startTime,
      endTime: trade.endTime,
      asset: trade.asset,
    };

    markers.push(entryPoint, exitPoint);
    trajectories.push({
      tradeId: trade.id,
      isWin,
      color,
      direction: trade.direction,
      investment: trade.investment,
      pnl,
      entryPoint,
      exitPoint,
    });
  }

  return { markers, trajectories };
}

/**
 * Finds the closest trade history dot marker within `hitRadius` pixels of `(mouseX, mouseY)`.
 */
export function findHoveredTradeMarker(
  mouseX: number,
  mouseY: number,
  markers: TradeChartMarkerPoint[],
  hitRadius: number = 11
): TradeChartMarkerPoint | null {
  let closest: TradeChartMarkerPoint | null = null;
  let minDistanceSq = hitRadius * hitRadius;

  for (const marker of markers) {
    const dx = mouseX - marker.x;
    const dy = mouseY - marker.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= minDistanceSq) {
      minDistanceSq = distSq;
      closest = marker;
    }
  }

  return closest;
}

/**
 * Generates deterministic, realistic settled trades anchored to the visible candle history
 * of an asset so the interactive chart history overlay immediately displays past execution
 * and settlement dots on the chart when no recent settled trades exist for that asset.
 */
export function generateSeededPastTradesForCandles(
  asset: AssetInfo,
  candles: Candle[],
  accountId: string = 'BFT-91823'
): BinaryTrade[] {
  if (candles.length < 26) return [];

  const specs: Array<{
    idSuffix: string;
    entryOffsetFromEnd: number;
    exitOffsetFromEnd: number;
    investment: number;
    wantWin: boolean;
  }> = [
    { idSuffix: '101', entryOffsetFromEnd: 24, exitOffsetFromEnd: 21, investment: 50, wantWin: true },
    { idSuffix: '102', entryOffsetFromEnd: 18, exitOffsetFromEnd: 15, investment: 30, wantWin: false },
    { idSuffix: '103', entryOffsetFromEnd: 12, exitOffsetFromEnd: 9, investment: 100, wantWin: true },
    { idSuffix: '104', entryOffsetFromEnd: 6, exitOffsetFromEnd: 3, investment: 50, wantWin: true },
  ];

  const minPip = Math.pow(10, -asset.pipDecimals);
  const symbolSlug = asset.symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();

  return specs.map((spec) => {
    const entryCandle = candles[candles.length - spec.entryOffsetFromEnd];
    const exitCandle = candles[candles.length - spec.exitOffsetFromEnd];

    const strikePrice = entryCandle.open;
    let closePrice = exitCandle.close;
    if (Math.abs(closePrice - strikePrice) < minPip) {
      closePrice = Number((strikePrice + minPip * 3).toFixed(asset.pipDecimals));
    }

    const wentUp = closePrice > strikePrice;
    const direction: 'CALL' | 'PUT' = spec.wantWin
      ? wentUp
        ? 'CALL'
        : 'PUT'
      : wentUp
      ? 'PUT'
      : 'CALL';

    const durationSeconds = Math.max(
      30,
      Math.round((exitCandle.time - entryCandle.time) / 1000)
    );
    const payoutPercentage = asset.payout || 88;
    const pnl = spec.wantWin
      ? Number(((spec.investment * payoutPercentage) / 100).toFixed(2))
      : -spec.investment;

    return {
      id: `TRD-${symbolSlug}-${spec.idSuffix}`,
      accountId,
      asset: asset.symbol,
      category: asset.category,
      direction,
      investment: spec.investment,
      payoutPercentage,
      strikePrice,
      closePrice,
      startTime: entryCandle.time,
      endTime: exitCandle.time,
      durationSeconds,
      status: spec.wantWin ? 'won' : 'lost',
      pnl,
    };
  });
}
