import type { AssetInfo, BinaryOptionDirection, BinaryTrade, Candle } from '../types/index.ts';
import { isValidPriceForAsset } from './priceFeedEngine.ts';

export interface TradeChartMarkerPoint {
  id: string;
  tradeId: string;
  pointType: 'execution' | 'settlement';
  x: number;
  y: number;
  color: string;
  isWin: boolean;
  asset: string;
  direction: BinaryOptionDirection;
  investment: number;
  pnl: number;
  strikePrice: number;
  closePrice: number;
  startTime: number;
  endTime: number;
}

export interface TradeChartTrajectory {
  tradeId: string;
  color: string;
  entryPoint: TradeChartMarkerPoint;
  exitPoint: TradeChartMarkerPoint;
}

export function priceToCanvasY(
  price: number,
  minPrice: number,
  maxPrice: number,
  chartHeight: number,
  topPadding: number = 10
): number {
  const range = Math.max(maxPrice - minPrice, 1e-9);
  const ratio = (maxPrice - price) / range;
  return topPadding + ratio * chartHeight;
}

export function timestampToCanvasX(
  timestampMs: number,
  visibleCandles: Candle[],
  timeframeSeconds: number,
  canvasWidth: number
): number | null {
  if (!visibleCandles || visibleCandles.length === 0 || !Number.isFinite(timestampMs)) {
    return null;
  }
  const usableWidth = Math.max(40, canvasWidth - 80);
  const firstTime = visibleCandles[0].time;
  const lastTime = visibleCandles[visibleCandles.length - 1].time;
  const bucketMs = Math.max(1000, timeframeSeconds * 1000);
  const totalSpan = Math.max(bucketMs, lastTime - firstTime + bucketMs);

  if (timestampMs < firstTime - bucketMs || timestampMs > lastTime + bucketMs * 2) {
    return null;
  }

  const ratio = (timestampMs - firstTime) / totalSpan;
  return Math.max(8, Math.min(usableWidth, 12 + ratio * (usableWidth - 24)));
}

export function formatInlineTradeResultBadge(
  isWin: boolean,
  pnl: number,
  investment: number
): string {
  if (isWin) {
    const net = Number.isFinite(pnl) && pnl > 0 ? pnl : investment * 0.85;
    return `+${net.toFixed(2)} $`;
  }
  const loss = Number.isFinite(pnl) && pnl < 0 ? Math.abs(pnl) : Math.abs(investment);
  return `-${loss.toFixed(2)} $`;
}

export interface InlineTradeResultBadgeBoxParams {
  anchorX: number;
  anchorY: number;
  canvasWidth: number;
  chartHeight: number;
  isWin: boolean;
  profitOrPnl: number;
  investment: number;
  direction?: BinaryOptionDirection;
}

export interface InlineTradeResultBadgeBox {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  bgColor: string;
  borderColor: string;
  textColor: string;
  label: string;
}

export function computeInlineTradeResultBadgeBox(
  params: InlineTradeResultBadgeBoxParams
): InlineTradeResultBadgeBox {
  const { anchorX, anchorY, canvasWidth, chartHeight, isWin, profitOrPnl, investment } = params;
  const label = formatInlineTradeResultBadge(isWin, profitOrPnl, investment);
  const boxWidth = Math.max(66, label.length * 7 + 14);
  const boxHeight = 20;

  const boxX = Math.max(8, Math.min(canvasWidth - boxWidth - 72, anchorX - boxWidth / 2));
  const preferAbove = anchorY - boxHeight - 12 >= 12;
  const boxY = preferAbove
    ? anchorY - boxHeight - 10
    : Math.min(chartHeight - boxHeight - 6, anchorY + 10);

  return {
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    bgColor: isWin ? 'rgba(0, 230, 118, 0.92)' : 'rgba(30, 20, 26, 0.92)',
    borderColor: isWin ? '#00e676' : '#ff334b',
    textColor: isWin ? '#05150c' : '#ff7b8a',
    label,
  };
}

export function computeTradeHistoryChartMarkers(params: {
  trades: BinaryTrade[];
  assetSymbol: string;
  visibleCandles: Candle[];
  timeframeSeconds: number;
  canvasWidth: number;
  chartHeight: number;
  minPrice: number;
  maxPrice: number;
}): {
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

  const markers: TradeChartMarkerPoint[] = [];
  const trajectories: TradeChartTrajectory[] = [];

  if (!trades || trades.length === 0 || !visibleCandles || visibleCandles.length === 0) {
    return { markers, trajectories };
  }

  const targetSym = String(assetSymbol || '').toUpperCase().trim();

  for (const trade of trades) {
    const sym = String(trade.asset || '').toUpperCase().trim();
    if (sym !== targetSym) continue;
    if (trade.status !== 'won' && trade.status !== 'lost') continue;

    const isWin = trade.status === 'won';
    const color = isWin ? '#00e676' : '#ff334b';
    const closePrice = Number(trade.closePrice ?? trade.currentPrice ?? trade.strikePrice) || 0;
    const strikePrice = Number(trade.strikePrice) || closePrice;
    const pnl =
      typeof trade.pnl === 'number' && Number.isFinite(trade.pnl)
        ? trade.pnl
        : isWin
        ? Number(((trade.investment * (trade.payoutPercentage || 85)) / 100).toFixed(2))
        : -Number(trade.investment || 0);

    const entryX = timestampToCanvasX(trade.startTime, visibleCandles, timeframeSeconds, canvasWidth);
    const exitX = timestampToCanvasX(trade.endTime, visibleCandles, timeframeSeconds, canvasWidth);

    let entryPoint: TradeChartMarkerPoint | null = null;
    let exitPoint: TradeChartMarkerPoint | null = null;

    if (entryX !== null) {
      entryPoint = {
        id: `${trade.id}_exec`,
        tradeId: trade.id,
        pointType: 'execution',
        x: entryX,
        y: priceToCanvasY(strikePrice, minPrice, maxPrice, chartHeight),
        color,
        isWin,
        asset: trade.asset,
        direction: trade.direction,
        investment: Number(trade.investment) || 0,
        pnl,
        strikePrice,
        closePrice,
        startTime: trade.startTime,
        endTime: trade.endTime,
      };
      markers.push(entryPoint);
    }

    if (exitX !== null) {
      exitPoint = {
        id: `${trade.id}_settle`,
        tradeId: trade.id,
        pointType: 'settlement',
        x: exitX,
        y: priceToCanvasY(closePrice, minPrice, maxPrice, chartHeight),
        color,
        isWin,
        asset: trade.asset,
        direction: trade.direction,
        investment: Number(trade.investment) || 0,
        pnl,
        strikePrice,
        closePrice,
        startTime: trade.startTime,
        endTime: trade.endTime,
      };
      markers.push(exitPoint);
    }

    if (entryPoint && exitPoint) {
      trajectories.push({
        tradeId: trade.id,
        color,
        entryPoint,
        exitPoint,
      });
    }
  }

  return { markers, trajectories };
}

export function findHoveredTradeMarker(
  x: number,
  y: number,
  markers: TradeChartMarkerPoint[],
  hitRadius: number = 14
): TradeChartMarkerPoint | null {
  let closest: TradeChartMarkerPoint | null = null;
  let closestDist = hitRadius;
  for (const m of markers) {
    const dist = Math.hypot(m.x - x, m.y - y);
    if (dist <= closestDist) {
      closestDist = dist;
      closest = m;
    }
  }
  return closest;
}

export function generateSeededPastTradesForCandles(
  _candles: Candle[],
  _assetSymbol: string
): BinaryTrade[] {
  return [];
}

export interface TradeExecutionPriceParams {
  asset: AssetInfo;
  isSelectedAsset: boolean;
  liveFeedPrice?: number | null;
  targetRefPrice?: number | null;
  marketStatePrice?: number | null;
  latestCandleClose?: number | null;
  reactCurrentPrice?: number | null;
}

/**
 * Resolves the exact authoritative live execution price for a trade at the instant
 * the user triggers UP (CALL) or DOWN (PUT), preventing stale React closures or
 * mobile UI tick-throttling from anchoring the entry price line below/away from
 * the current live market price.
 */
export function resolveTradeExecutionPrice(params: TradeExecutionPriceParams): number {
  const {
    asset,
    isSelectedAsset,
    liveFeedPrice,
    targetRefPrice,
    marketStatePrice,
    latestCandleClose,
    reactCurrentPrice,
  } = params;

  const decimals = Math.max(0, Math.min(8, Number(asset.pipDecimals ?? 5)));
  const candidates: Array<number | null | undefined> = isSelectedAsset
    ? [
        liveFeedPrice,
        targetRefPrice,
        marketStatePrice,
        latestCandleClose,
        reactCurrentPrice,
        asset.basePrice,
      ]
    : [liveFeedPrice, marketStatePrice, asset.basePrice];

  for (const candidate of candidates) {
    if (
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate > 0 &&
      isValidPriceForAsset(asset, candidate)
    ) {
      return Number(candidate.toFixed(decimals));
    }
  }

  return Number((asset.basePrice || 0).toFixed(decimals));
}

export interface TradeBadgePositionParams {
  entryX: number;
  entryY: number;
  containerWidth: number;
  containerHeight: number;
  isMobile: boolean;
  badgeWidth?: number;
  badgeHeight?: number;
  priceAxisWidth?: number;
}

export interface TradeBadgePositionResult {
  /** Exact Y coordinate for vertical center (paired with translateY(-50%)) */
  top: number;
  /** Clamped X left coordinate so the badge never overflows off-screen or overlaps the price axis */
  left: number;
  /** Exact entry-point anchor dot coordinates aligned to the horizontal price line */
  entryDotX: number;
  entryDotY: number;
  placedLeftOfCandle: boolean;
}

/**
 * Computes the exact TradeBadge and entry-dot coordinates so the marker and pill align
 * precisely with the live price line across desktop and mobile viewports/DPI scaling.
 */
export function computeTradeBadgePosition(
  params: TradeBadgePositionParams
): TradeBadgePositionResult {
  const {
    entryX,
    entryY,
    containerWidth,
    containerHeight,
    isMobile,
    badgeWidth = isMobile ? 156 : 136,
    badgeHeight = 44,
    priceAxisWidth = isMobile ? 126 : 126,
  } = params;

  const safeWidth = Math.max(200, Math.round(containerWidth || 0));
  const safeHeight = Math.max(120, Math.round(containerHeight || 0));

  const minTop = Math.round(badgeHeight / 2) + 6;
  const maxTop = Math.max(minTop, safeHeight - Math.round(badgeHeight / 2) - 6);
  const clampedTop = Math.max(minTop, Math.min(maxTop, Math.round(entryY)));

  const plotRightLimit = Math.max(badgeWidth + 12, safeWidth - priceAxisWidth);
  const gap = isMobile ? 10 : 15;
  const preferredRightLeft = Math.round(entryX) + gap;

  let left = preferredRightLeft;
  let placedLeftOfCandle = false;

  if (preferredRightLeft + badgeWidth > plotRightLimit) {
    const leftCandidate = Math.round(entryX) - badgeWidth - gap;
    if (leftCandidate >= 8) {
      left = leftCandidate;
      placedLeftOfCandle = true;
    } else {
      left = Math.max(8, Math.min(plotRightLimit - badgeWidth, Math.round(entryX) - Math.round(badgeWidth / 2)));
      placedLeftOfCandle = left < entryX;
    }
  } else if (left < 8) {
    left = 8;
  }

  const axisOnlyReserve = isMobile ? 64 : 74;
  const entryDotX = Math.max(6, Math.min(safeWidth - axisOnlyReserve, Math.round(entryX)));
  const entryDotY = Math.max(4, Math.min(safeHeight - 4, Math.round(entryY)));

  return {
    top: clampedTop,
    left,
    entryDotX,
    entryDotY,
    placedLeftOfCandle,
  };
}
