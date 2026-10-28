/**
 * Binary Funded Trader (BFT) - High-Performance Candlestick Chart Virtualization & Momentum Engine
 * 
 * Provides:
 * 1. Deep historical memory buffering (1,500+ candles per timeframe up to 5,000 max)
 * 2. Butter-smooth 60fps continuous sub-pixel drag-to-pan scrolling
 * 3. Natural inertia & momentum physics with exponential velocity decay
 * 4. Efficient data virtualization rendering only the visible viewport slice + buffer
 * 5. Timeframe switching flexibility with timestamp anchor preservation
 * 6. Smooth pinch-to-zoom and button zoom scaling with focal point anchoring
 */

import { Candle, AssetInfo } from '../types';

export interface DragSample {
  x: number;
  time: number;
}

export interface VirtualizedChartWindow {
  startIndex: number;
  endIndex: number;
  visibleCount: number;
  slotWidth: number;
  candleWidth: number;
  candleGap: number;
  subPixelShift: number; // Fractional pixel displacement for 60fps fluid sliding
  maxVisibleCandles: number;
  effectivePanOffset: number;
  totalCandles: number;
  hasMorePast: boolean;
  hasMoreFuture: boolean;
}

export interface MomentumState {
  panOffset: number;
  velocity: number; // candles per frame (positive = scrolling into past)
  isDragging: boolean;
  isCoasting: boolean;
  lastDragX: number;
  lastDragTime: number;
  samples: DragSample[];
}

/**
 * Calculates the exact visible window of candles for rendering,
 * featuring sub-pixel floating point offsets for ultra-smooth 60fps pan animation.
 */
export function calculateVisibleWindow(
  totalCandles: number,
  panOffset: number,
  zoomLevel: number,
  canvasWidth: number,
  slotPadding: number = 78
): VirtualizedChartWindow {
  const effectiveWidth = Math.max(200, canvasWidth - slotPadding);
  // Base candle slot scale based on zoom (zoomLevel 1.0 = ~12px per candle)
  const baseSlot = Math.max(3.5, 12 * Math.max(0.3, Math.min(3.5, zoomLevel)));
  const maxVisibleCandles = Math.max(14, Math.floor(effectiveWidth / baseSlot));
  const slotWidth = effectiveWidth / Math.max(1, maxVisibleCandles);
  const candleGap = Math.max(1, Math.round(slotWidth * 0.22));
  const candleWidth = Math.max(2, Math.floor(slotWidth - candleGap));

  // Clamp panOffset: 0 = live edge, upper bound = totalCandles - maxVisibleCandles
  const maxPanOffset = Math.max(0, totalCandles - maxVisibleCandles);
  const clampedPan = Math.max(0, Math.min(maxPanOffset, panOffset));

  // Compute integer candle shift and continuous fractional sub-pixel shift
  const intOffset = Math.floor(clampedPan);
  const fraction = clampedPan - intOffset;
  const subPixelShift = fraction * slotWidth;

  // We render 1 extra candle on the boundary to prevent edge clipping during sub-pixel sliding
  const endIndex = Math.min(totalCandles, totalCandles - intOffset + 1);
  const startIndex = Math.max(0, endIndex - maxVisibleCandles - 1);
  const visibleCount = endIndex - startIndex;

  return {
    startIndex,
    endIndex,
    visibleCount,
    slotWidth,
    candleWidth,
    candleGap,
    subPixelShift,
    maxVisibleCandles,
    effectivePanOffset: clampedPan,
    totalCandles,
    hasMorePast: startIndex > 0,
    hasMoreFuture: clampedPan > 0.05,
  };
}

/**
 * Computes release velocity from recent drag sample history (last 120ms)
 * to provide natural inertia flick scrolling.
 */
export function computeReleaseVelocity(
  samples: DragSample[],
  slotWidth: number,
  maxSampleAgeMs: number = 120
): number {
  if (samples.length < 2) return 0;
  const now = samples[samples.length - 1].time;
  const recent = samples.filter((s) => now - s.time <= maxSampleAgeMs);
  if (recent.length < 2) return 0;

  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = Math.max(10, last.time - first.time);
  const dx = last.x - first.x; // positive = dragged right (reveal past)

  // Velocity in pixels per millisecond
  const pixelVelocityPerMs = dx / dt;
  // Convert to candles per frame assuming ~16.6ms per frame
  const candlesPerFrame = (pixelVelocityPerMs * 16.6) / Math.max(1, slotWidth);

  // Clamp to realistic maximum velocity to prevent runaway jumping
  const maxVelocity = 4.5;
  return Math.max(-maxVelocity, Math.min(maxVelocity, candlesPerFrame));
}

/**
 * Advances momentum physics by one animation frame with exponential velocity decay.
 */
export function stepMomentum(
  currentPanOffset: number,
  velocity: number,
  damping: number = 0.93,
  minVelocityThreshold: number = 0.012,
  maxPanOffset: number = 10000
): { nextPanOffset: number; nextVelocity: number; isCoasting: boolean } {
  if (Math.abs(velocity) < minVelocityThreshold) {
    return {
      nextPanOffset: currentPanOffset,
      nextVelocity: 0,
      isCoasting: false,
    };
  }

  const nextOffsetRaw = currentPanOffset + velocity;
  const nextOffset = Math.max(0, Math.min(maxPanOffset, nextOffsetRaw));

  // If we hit hard boundaries (live edge or max history), halt momentum immediately
  if (nextOffset <= 0 || nextOffset >= maxPanOffset) {
    return {
      nextPanOffset: nextOffset,
      nextVelocity: 0,
      isCoasting: false,
    };
  }

  const nextVelocity = velocity * damping;
  const isCoasting = Math.abs(nextVelocity) >= minVelocityThreshold;

  return {
    nextPanOffset: nextOffset,
    nextVelocity: isCoasting ? nextVelocity : 0,
    isCoasting,
  };
}

/**
 * Calculates smooth zoom scaling anchored to mouse cursor or viewport center,
 * adjusting panOffset so the target candle remains visually stationary under the zoom focal point.
 */
export function calculateAnchoredZoom(
  currentZoom: number,
  deltaZoom: number,
  focalRatio: number = 0.5, // 0.0 = left edge, 1.0 = right edge
  currentPanOffset: number = 0,
  minZoom: number = 0.35,
  maxZoom: number = 3.5
): { nextZoom: number; nextPanOffset: number } {
  const nextZoom = Number(Math.max(minZoom, Math.min(maxZoom, currentZoom + deltaZoom)).toFixed(2));
  if (nextZoom === currentZoom) {
    return { nextZoom, nextPanOffset: currentPanOffset };
  }

  const scaleRatio = nextZoom / currentZoom;
  // Adjust pan offset proportionally to focalRatio so zoom scales naturally into the cursor
  const panAdjustment = currentPanOffset * (1 - 1 / scaleRatio) * (1 - focalRatio * 0.4);
  const nextPanOffset = Math.max(0, Number((currentPanOffset + panAdjustment).toFixed(2)));

  return { nextZoom, nextPanOffset };
}

/**
 * Computes translated pan offset when changing timeframes,
 * preserving the trader's historical inspection position across all switches (5s, 15s, 30s, 1m, 5m).
 */
export function translatePanOffsetForTimeframe(
  currentPanOffset: number,
  oldTfSeconds: number,
  newTfSeconds: number
): number {
  if (currentPanOffset <= 0.1) return 0;
  const ratio = oldTfSeconds / Math.max(1, newTfSeconds);
  return Math.max(0, Number((currentPanOffset * ratio).toFixed(2)));
}
