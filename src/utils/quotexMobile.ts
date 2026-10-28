/**
 * Pure helper functions for the BFT Mobile Trading Terminal (Quotex Mobile Layout):
 * - Real-time Candle Expiry Countdown Timer calculation
 * - Touch Pinch-to-Zoom & Single-Finger Pan geometry math
 * - Mobile Account Switcher balance formatting
 */

export interface CandleCountdownResult {
  remainingSeconds: number;
  formatted: string;
  progressPercent: number;
}

/**
 * Computes the exact remaining time before the current candlestick closes and the next candle begins.
 */
export function calculateCandleCountdown(
  nowMs: number,
  timeframeSeconds: number
): CandleCountdownResult {
  const safeTf = Math.max(1, Math.floor(timeframeSeconds || 60));
  const nowSec = Math.max(0, Math.floor(nowMs / 1000));
  const elapsed = nowSec % safeTf;
  const remainingSeconds = Math.max(1, safeTf - elapsed);
  const progressPercent = Number((((safeTf - remainingSeconds) / safeTf) * 100).toFixed(1));

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const formatted =
    hours > 0
      ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;

  return {
    remainingSeconds,
    formatted,
    progressPercent,
  };
}

/**
 * Computes the clamped zoom level from a two-finger pinch gesture on the mobile candlestick chart.
 */
export function calculatePinchZoomLevel(
  initialZoom: number,
  startDistancePx: number,
  currentDistancePx: number,
  minZoom: number = 0.35,
  maxZoom: number = 3.5
): number {
  if (!startDistancePx || startDistancePx <= 0 || !currentDistancePx || currentDistancePx <= 0) {
    return Number(Math.max(minZoom, Math.min(maxZoom, initialZoom || 1)).toFixed(2));
  }
  const scale = currentDistancePx / startDistancePx;
  const rawZoom = (initialZoom || 1) * scale;
  return Number(Math.max(minZoom, Math.min(maxZoom, rawZoom)).toFixed(2));
}

/**
 * Computes the clamped candle pan offset from a single-finger horizontal drag gesture.
 */
export function calculateTouchPanOffset(
  initialPanOffset: number,
  deltaXPx: number,
  zoomLevel: number,
  totalCandles: number,
  minVisibleCandles: number = 20
): number {
  const safeZoom = Math.max(0.35, zoomLevel || 1);
  const candleWidthEst = 11 * safeZoom;
  const offsetDiff = Math.round(deltaXPx / candleWidthEst);
  const maxPan = Math.max(0, totalCandles - minVisibleCandles);
  return Math.max(0, Math.min(maxPan, initialPanOffset + offsetDiff));
}

/**
 * Formats an account balance in the compact Quotex mobile header style (e.g. "10,000.90").
 */
export function formatMobileAccountBalance(
  balance: number | null | undefined,
  decimals: number = 2
): string {
  const safeVal = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0;
  return safeVal.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
