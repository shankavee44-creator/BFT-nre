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

export type MobileTradesTab = 'trades' | 'history';

/**
 * Resolves the next open/tab state when a user taps "Trades", "History", or the chevron toggle
 * in the Quotex mobile execution dock, ensuring smooth tab switching without breaking the chart.
 */
export function resolveMobileTradesDrawerAction(
  currentOpen: boolean,
  currentTab: MobileTradesTab,
  action: MobileTradesTab | 'toggle' | { type: 'toggle' } | { type: 'select_tab'; tab: MobileTradesTab }
): { isOpen: boolean; activeTab: MobileTradesTab } {
  const normalizedAction =
    typeof action === 'string'
      ? action === 'toggle'
        ? { type: 'toggle' as const }
        : { type: 'select_tab' as const, tab: action }
      : action;

  if (normalizedAction.type === 'toggle') {
    return {
      isOpen: !currentOpen,
      activeTab: currentTab,
    };
  }
  if (!currentOpen) {
    return {
      isOpen: true,
      activeTab: normalizedAction.tab,
    };
  }
  if (currentTab === normalizedAction.tab) {
    return {
      isOpen: false,
      activeTab: currentTab,
    };
  }
  return {
    isOpen: true,
    activeTab: normalizedAction.tab,
  };
}

/**
 * Computes the vertical layout budget for the Quotex mobile terminal so that
 * top header + asset ticker + chart canvas + bottom dock + bottom nav fit 100%
 * within the mobile viewport height without overflowing or collapsing the chart.
 */
export function computeMobileTerminalViewportBudget(viewportHeightPx: number): {
  topHeaderPx: number;
  tickerBarPx: number;
  bottomDockPx: number;
  bottomNavPx: number;
  chartCanvasPx: number;
  fitsWithoutOverflow: boolean;
} {
  const safeViewport = Math.max(560, Math.floor(viewportHeightPx || 844));
  const topHeaderPx = 42;
  const tickerBarPx = 38;
  const bottomDockPx = 198;
  const bottomNavPx = 48;
  const fixedChrome = topHeaderPx + tickerBarPx + bottomDockPx + bottomNavPx;
  const chartCanvasPx = Math.max(220, safeViewport - fixedChrome);

  return {
    topHeaderPx,
    tickerBarPx,
    bottomDockPx,
    bottomNavPx,
    chartCanvasPx,
    fitsWithoutOverflow: fixedChrome + chartCanvasPx <= safeViewport,
  };
}

