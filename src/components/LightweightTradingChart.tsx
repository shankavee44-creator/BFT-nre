import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  AreaSeries,
  BarSeries,
  ColorType,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { AssetInfo, BinaryTrade, Candle, TradeResultOverlayData } from '../types';
import { normalizeAssetSymbol } from '../utils/storage';
import {
  calculateHeikinAshi,
  type IndicatorSettings,
} from '../utils/technicalIndicators';
import {
  type DrawingToolId,
  type DrawingLineStyle,
  type ChartDrawingObject,
} from '../utils/drawingToolsEngine';
import {
  isValidPriceForAsset,
  validateCandlesForAsset,
  getSynchronizedNowMs,
} from '../utils/priceFeedEngine';
import { getDevicePerformanceProfile } from '../utils/devicePerformance';
import { computeTradeBadgePosition } from '../utils/tradeChartOverlay';
import { TradeBadge } from './TradeBadge';

export interface LightweightTradingChartProps {
  asset: AssetInfo;
  candles: Candle[];
  currentPrice: number;
  timeframe: string;
  chartType: 'candles' | 'heikin-ashi' | 'line' | 'bars';
  activeTrades: BinaryTrade[];
  tradeResultOverlay?: TradeResultOverlayData | null;
  indicators?: IndicatorSettings;
  zoomLevel?: number;
  onHoverCandle?: (candle: Candle | null) => void;
  drawings?: ChartDrawingObject[];
  activeDrawingTool?: DrawingToolId;
  drawingColor?: string;
  drawingWidth?: number;
  drawingLineStyle?: DrawingLineStyle;
  selectedDrawingId?: string | null;
  onSelectDrawing?: (id: string | null) => void;
  onAddDrawing?: (drawing: ChartDrawingObject) => void;
  onUpdateDrawing?: (drawing: ChartDrawingObject) => void;
  onCompleteDrawingTool?: () => void;
  onLoadMoreHistory?: () => void;
}

interface FormattedBar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

function parseTimeframeSeconds(tf: string): number {
  if (tf.endsWith('s')) return parseInt(tf) || 30;
  if (tf.endsWith('m')) return (parseInt(tf) || 1) * 60;
  if (tf.endsWith('h')) return (parseInt(tf) || 1) * 3600;
  if (tf === '1D' || tf === 'D') return 86400;
  return 60;
}

function formatSingleCandle(c: Candle, decimals: number): FormattedBar | null {
  if (!c || typeof c.time !== 'number' || Number.isNaN(c.open) || Number.isNaN(c.close)) return null;
  const rawTime = Number(c.time);
  if (!rawTime || Number.isNaN(rawTime)) return null;
  const sec = rawTime > 1e11 ? Math.floor(rawTime / 1000) : Math.floor(rawTime);
  return {
    time: sec as UTCTimestamp,
    open: Number(Number(c.open).toFixed(decimals)),
    high: Number(Math.max(Number(c.open), Number(c.close), Number(c.high)).toFixed(decimals)),
    low: Number(Math.min(Number(c.open), Number(c.close), Number(c.low)).toFixed(decimals)),
    close: Number(Number(c.close).toFixed(decimals)),
  };
}

export function prepareLightweightBars(
  candles: Candle[],
  chartType: 'candles' | 'heikin-ashi' | 'line' | 'bars',
  decimals: number,
  asset?: AssetInfo
): FormattedBar[] {
  if (!candles || candles.length === 0) return [];
  if (asset && !validateCandlesForAsset(asset, candles)) return [];
  const perf = getDevicePerformanceProfile();
  const maxBars = perf.recommendedMaxCandles;
  const windowed = candles.length > maxBars ? candles.slice(-maxBars) : candles;
  const source = chartType === 'heikin-ashi' ? calculateHeikinAshi(windowed) : windowed;
  const bySec = new Map<number, FormattedBar>();
  for (const c of source) {
    const formatted = formatSingleCandle(c, decimals);
    if (!formatted) continue;
    if (asset && !isValidPriceForAsset(asset, formatted.close)) continue;
    bySec.set(formatted.time as number, formatted);
  }
  return Array.from(bySec.values()).sort((a, b) => (a.time as number) - (b.time as number));
}

function createSeriesForType(
  chart: IChartApi,
  type: 'candles' | 'heikin-ashi' | 'line' | 'bars',
  pipDecimals: number = 5
): ISeriesApi<any> {
  const minMove = Number(Math.pow(10, -Math.max(0, Math.min(8, pipDecimals))).toFixed(8));
  const seriesOptions = {
    upColor: '#00E676',
    downColor: '#FF1744',
    wickUpColor: '#00E676',
    wickDownColor: '#FF1744',
    borderUpColor: '#00E676',
    borderDownColor: '#FF1744',
    priceLineVisible: true,
    lastValueVisible: true,
    priceLineColor: '#00E676',
    priceLineStyle: LineStyle.Dotted,
    priceFormat: {
      type: 'price' as const,
      precision: pipDecimals,
      minMove,
    },
  };
  if (type === 'line') {
    return chart.addSeries(AreaSeries, { ...seriesOptions, lineColor: '#00E676' });
  } else if (type === 'bars') {
    return chart.addSeries(BarSeries, seriesOptions);
  } else {
    return chart.addSeries(CandlestickSeries, seriesOptions);
  }
}

export const LightweightTradingChart: React.FC<LightweightTradingChartProps> = React.memo(({
  asset,
  candles,
  currentPrice,
  chartType,
  timeframe,
  activeTrades,
  tradeResultOverlay,
  zoomLevel = 1,
  onLoadMoreHistory,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const lastLoadedSymbolRef = useRef<string>('');
  const lastLoadedTimeframeRef = useRef<string>('');
  const lastLoadedChartTypeRef = useRef<string>('');
  const barsCountRef = useRef<number>(0);
  const firstFormattedBarTimeRef = useRef<number>(0);
  const lastFormattedBarRef = useRef<FormattedBar | null>(null);
  const lastPriceYRef = useRef<number>(0);
  const lastCoordUpdateMsRef = useRef<number>(0);
  const isLoadingHistoryRef = useRef<boolean>(false);
  const lastHistoryLoadMsRef = useRef<number>(0);
  const prevZoomLevelRef = useRef<number>(zoomLevel);
  const onLoadMoreHistoryRef = useRef(onLoadMoreHistory);
  onLoadMoreHistoryRef.current = onLoadMoreHistory;

  const [badgeCoords, setBadgeCoords] = useState<
    Record<string, { y: number; x: number; entryX: number }>
  >({});
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 500,
  });
  const [resultBadgeCoords, setResultBadgeCoords] = useState<{ y: number; x: number } | null>(null);
  const [currentPriceY, setCurrentPriceY] = useState<number>(0);
  const [candleCountdown, setCandleCountdown] = useState<string>('00:30');
  const [now, setNow] = useState<number>(() => getSynchronizedNowMs());
  const [isScrolledFromLive, setIsScrolledFromLive] = useState<boolean>(false);

  const assetActiveTrades = useMemo(() => {
    const targetSym = normalizeAssetSymbol(asset.symbol);
    return activeTrades.filter((t) => {
      const st = String(t.status || '').toUpperCase().trim();
      const isOpen = st === 'ACTIVE' || st === 'OPEN';
      const tradeSym = (t as any).asset_symbol || t.asset || (t as any).symbol || '';
      return isOpen && normalizeAssetSymbol(tradeSym) === targetSym;
    });
  }, [activeTrades, asset.symbol]);

  // 1s tick interval for live timers synchronized to authoritative server clock
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(getSynchronizedNowMs());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Candle expiry countdown calculation
  useEffect(() => {
    const tfSec = parseTimeframeSeconds(timeframe);
    const lastBar = candles.length > 0 ? candles[candles.length - 1] : null;
    if (!lastBar) return;

    const barStartTime = Number(lastBar.time) || getSynchronizedNowMs();
    const barEndTime = barStartTime + tfSec * 1000;
    const remainingMs = Math.max(0, barEndTime - now);
    const remSec = Math.floor(remainingMs / 1000);
    const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
    const ss = String(remSec % 60).padStart(2, '0');
    const formatted = `${mm}:${ss}`;
    setCandleCountdown((prev) => (prev === formatted ? prev : formatted));
  }, [candles, timeframe, now]);

  // Coordinate sync for floating PnL badge pills, entry markers & live moving price tag
  const updateCoordinates = useCallback((force: boolean = false) => {
    if (!seriesRef.current || !chartRef.current) return;
    if (lastLoadedSymbolRef.current !== asset.symbol) return;

    const perf = getDevicePerformanceProfile();
    if (!force && perf.isLowEnd && perf.chartUpdateThrottleMs > 0) {
      const nowMs = performance.now();
      if (nowMs - lastCoordUpdateMsRef.current < perf.chartUpdateThrottleMs) {
        return;
      }
      lastCoordUpdateMsRef.current = nowMs;
    } else {
      lastCoordUpdateMsRef.current = performance.now();
    }

    const container = containerRef.current;
    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
      const nextW = Math.round(container.clientWidth);
      const nextH = Math.round(container.clientHeight);
      setContainerSize((prev) =>
        prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH }
      );
    }

    const series = seriesRef.current;
    const timeScale = chartRef.current.timeScale();
    const lastBar = lastFormattedBarRef.current;

    let defaultX = 180;
    if (lastBar) {
      try {
        const cx = timeScale.timeToCoordinate(lastBar.time);
        if (typeof cx === 'number' && !Number.isNaN(cx)) defaultX = Math.round(cx);
      } catch {
        // ignore
      }
    }

    try {
      const priceToUse =
        isValidPriceForAsset(asset, Number(currentPrice))
          ? Number(currentPrice)
          : lastBar?.close || 0;
      if (priceToUse > 0) {
        const py = series.priceToCoordinate(priceToUse);
        if (typeof py === 'number' && !Number.isNaN(py)) {
          const roundedY = Math.round(py);
          if (force || Math.abs(roundedY - lastPriceYRef.current) >= 1) {
            lastPriceYRef.current = roundedY;
            setCurrentPriceY(roundedY);
          }
        }
      }
    } catch {
      // ignore
    }

    if (assetActiveTrades.length > 0) {
      const nextCoords: Record<string, { y: number; x: number; entryX: number }> = {};
      const tfSec = parseTimeframeSeconds(timeframe);
      for (const t of assetActiveTrades) {
        try {
          const strikePriceNum = Number(t.strikePrice) || 0;
          const y = series.priceToCoordinate(strikePriceNum);
          if (typeof y === 'number' && !Number.isNaN(y)) {
            let entryX = defaultX;
            if (typeof t.startTime === 'number' && t.startTime > 0 && tfSec > 0) {
              const bucketSec = (Math.floor(t.startTime / 1000 / tfSec) * tfSec) as UTCTimestamp;
              const tx = timeScale.timeToCoordinate(bucketSec);
              if (typeof tx === 'number' && !Number.isNaN(tx)) {
                entryX = Math.round(tx);
              }
            }
            nextCoords[t.id] = { y: Math.round(y), x: defaultX, entryX };
          }
        } catch {
          // ignore
        }
      }
      setBadgeCoords((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(nextCoords);
        if (prevKeys.length !== nextKeys.length) return nextCoords;
        for (const k of nextKeys) {
          if (
            !prev[k] ||
            prev[k].x !== nextCoords[k].x ||
            prev[k].y !== nextCoords[k].y ||
            prev[k].entryX !== nextCoords[k].entryX
          ) {
            return nextCoords;
          }
        }
        return prev;
      });
    } else {
      setBadgeCoords((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    }

    // Calculate coordinate for trade settlement result overlay badge
    if (tradeResultOverlay) {
      try {
        const closeP = Number(tradeResultOverlay.closePrice) || Number(tradeResultOverlay.strikePrice) || 0;
        const ry = series.priceToCoordinate(closeP);
        let rx = defaultX;
        const endTimeSec = Math.floor((tradeResultOverlay.endTime || getSynchronizedNowMs()) / 1000) as UTCTimestamp;
        const cx = timeScale.timeToCoordinate(endTimeSec);
        if (typeof cx === 'number' && !Number.isNaN(cx)) {
          rx = Math.round(cx);
        }
        if (typeof ry === 'number' && !Number.isNaN(ry)) {
          const nextRes = { y: Math.round(ry), x: rx };
          setResultBadgeCoords((prev) =>
            prev && prev.x === nextRes.x && prev.y === nextRes.y ? prev : nextRes
          );
        } else {
          setResultBadgeCoords((prev) => (prev === null ? prev : null));
        }
      } catch {
        setResultBadgeCoords((prev) => (prev === null ? prev : null));
      }
    } else {
      setResultBadgeCoords((prev) => (prev === null ? prev : null));
    }
  }, [asset, assetActiveTrades, currentPrice, timeframe, tradeResultOverlay]);

  const updateCoordinatesRef = useRef(updateCoordinates);
  updateCoordinatesRef.current = updateCoordinates;

  // 1. Initialize Chart ONCE with empty dependency array []
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: container.clientHeight || 500,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#D9D9D9',
      },
      grid: {
        vertLines: { visible: false, color: '#111111' },
        horzLines: { visible: false, color: '#111111' },
      },
      kineticScroll: {
        touch: true,
        mouse: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        axisDoubleClickReset: {
          time: true,
          price: true,
        },
        mouseWheel: true,
        pinch: true,
      },
      timeScale: {
        barSpacing: 11,
        minBarSpacing: 0.5,
        maxBarSpacing: 50,
        rightOffset: 15,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        timeVisible: true,
        secondsVisible: true,
        borderColor: 'rgba(255, 255, 255, 0.15)',
      },
      rightPriceScale: {
        autoScale: true,
        mode: PriceScaleMode.Normal,
        alignLabels: true,
        visible: true,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
    });
    chartRef.current = chart;

    const series = createSeriesForType(chart, chartType, asset.pipDecimals);
    seriesRef.current = series;

    const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals, asset);
    barsCountRef.current = bars.length;
    if (bars.length > 0) {
      firstFormattedBarTimeRef.current = bars[0].time as number;
      lastFormattedBarRef.current = bars[bars.length - 1];
      if (chartType === 'line') {
        series.setData(bars.map((b: FormattedBar) => ({ time: b.time, value: b.close })));
      } else {
        series.setData(bars);
      }
      lastLoadedSymbolRef.current = asset.symbol;
      lastLoadedTimeframeRef.current = timeframe;
      lastLoadedChartTypeRef.current = chartType;
      chart.priceScale('right').applyOptions({
        autoScale: true,
        mode: PriceScaleMode.Normal,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      });
      chart.timeScale().resetTimeScale();
      chart.timeScale().scrollToRealTime();
      requestAnimationFrame(() => updateCoordinatesRef.current());
    }

    const handleLogicalRangeChange = (logicalRange: { from: number; to: number } | null) => {
      if (!logicalRange || barsCountRef.current === 0) {
        setIsScrolledFromLive((prev) => (prev ? false : prev));
        updateCoordinatesRef.current();
        return;
      }
      const lastBarIndex = barsCountRef.current - 1;
      const scrolled = logicalRange.to < lastBarIndex - 2;
      setIsScrolledFromLive((prev) => (prev === scrolled ? prev : scrolled));

      // Seamlessly load deeper historical candles when scrolling/zooming near the left boundary
      const perf = getDevicePerformanceProfile();
      if (
        logicalRange.from <= 120 &&
        barsCountRef.current < perf.recommendedMaxCandles &&
        onLoadMoreHistoryRef.current &&
        !isLoadingHistoryRef.current
      ) {
        const nowMs = performance.now();
        if (nowMs - lastHistoryLoadMsRef.current > 180) {
          lastHistoryLoadMsRef.current = nowMs;
          isLoadingHistoryRef.current = true;
          try {
            onLoadMoreHistoryRef.current();
          } finally {
            setTimeout(() => {
              isLoadingHistoryRef.current = false;
            }, 180);
          }
        }
      }

      updateCoordinatesRef.current();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleLogicalRangeChange);

    const handleCenterChartEvent = () => {
      if (chartRef.current) {
        try {
          chartRef.current.priceScale('right').applyOptions({ autoScale: true });
          chartRef.current.timeScale().resetTimeScale();
          chartRef.current.timeScale().scrollToRealTime();
          setIsScrolledFromLive(false);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('bft-center-chart', handleCenterChartEvent);

    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          const w = Math.floor(width);
          const h = Math.floor(height);
          if (w > 0 && h > 0 && chartRef.current) {
            try {
              chartRef.current.resize(w, h, true);
              setContainerSize((prev) =>
                prev.width === w && prev.height === h ? prev : { width: w, height: h }
              );
              updateCoordinatesRef.current(true);
            } catch {
              // ignore
            }
          }
        }
      });
    });
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('bft-center-chart', handleCenterChartEvent);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeObserver.disconnect();
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
        chart.remove();
      } catch {
        // ignore
      }
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external zoomLevel changes smoothly to timeScale barSpacing
  useEffect(() => {
    if (!chartRef.current) return;
    if (prevZoomLevelRef.current === zoomLevel) return;
    prevZoomLevelRef.current = zoomLevel;
    try {
      const targetSpacing = Number(Math.max(0.6, Math.min(48, 12 * zoomLevel)).toFixed(2));
      chartRef.current.timeScale().applyOptions({ barSpacing: targetSpacing });
      updateCoordinatesRef.current();
    } catch {
      // ignore
    }
  }, [zoomLevel]);

  // 2. Strict Symbol Binding & Fast O(1) Live Tick Streaming (Never interrupts touch pan/zoom)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const isSymbolChanged = lastLoadedSymbolRef.current !== asset.symbol;
    const isTimeframeChanged = lastLoadedTimeframeRef.current !== timeframe;
    const isChartTypeChanged = lastLoadedChartTypeRef.current !== chartType;

    // Immediately clear previous series data array upon asset switch so old candles never mix with new asset
    if (isSymbolChanged && seriesRef.current) {
      try {
        seriesRef.current.setData([]);
      } catch {
        // ignore
      }
      for (const [, line] of priceLinesRef.current.entries()) {
        try {
          seriesRef.current.removePriceLine(line);
        } catch {
          // ignore
        }
      }
      priceLinesRef.current.clear();
      lastFormattedBarRef.current = null;
      firstFormattedBarTimeRef.current = 0;
      barsCountRef.current = 0;
      lastPriceYRef.current = 0;
      setCurrentPriceY(0);
    }

    // Validate incoming candles against active asset price scale to prevent cross-contamination
    const hasValidCandles = candles && candles.length > 0 && validateCandlesForAsset(asset, candles);

    if (!hasValidCandles) {
      return;
    }

    // Full series rebuild ONLY when symbol, chartType, or timeframe changes, or on initial load
    if (
      isChartTypeChanged ||
      isSymbolChanged ||
      isTimeframeChanged ||
      barsCountRef.current === 0 ||
      !lastFormattedBarRef.current
    ) {
      const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals, asset);
      barsCountRef.current = bars.length;
      if (bars.length === 0) return;
      firstFormattedBarTimeRef.current = bars[0].time as number;
      lastFormattedBarRef.current = bars[bars.length - 1];

      if (isChartTypeChanged || isSymbolChanged || !seriesRef.current) {
        if (seriesRef.current) {
          try {
            seriesRef.current.setData([]);
            chart.removeSeries(seriesRef.current);
          } catch {
            // ignore
          }
        }
        priceLinesRef.current.clear();
        const newSeries = createSeriesForType(chart, chartType, asset.pipDecimals);
        seriesRef.current = newSeries;
      }

      lastLoadedSymbolRef.current = asset.symbol;
      lastLoadedTimeframeRef.current = timeframe;
      lastLoadedChartTypeRef.current = chartType;

      try {
        if (chartType === 'line') {
          seriesRef.current.setData(bars.map((b: FormattedBar) => ({ time: b.time, value: b.close })));
        } else {
          seriesRef.current.setData(bars);
        }
        seriesRef.current.priceScale().applyOptions({
          autoScale: true,
          mode: PriceScaleMode.Normal,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
        chart.priceScale('right').applyOptions({
          autoScale: true,
          mode: PriceScaleMode.Normal,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
        chart.timeScale().resetTimeScale();
        chart.timeScale().scrollToRealTime();
        setIsScrolledFromLive(false);
        requestAnimationFrame(() => {
          if (chartRef.current && lastLoadedSymbolRef.current === asset.symbol) {
            try {
              chartRef.current.priceScale('right').applyOptions({
                autoScale: true,
                mode: PriceScaleMode.Normal,
                scaleMargins: { top: 0.1, bottom: 0.1 },
              });
              chartRef.current.timeScale().scrollToRealTime();
              updateCoordinatesRef.current();
            } catch {
              // ignore
            }
          }
        });
      } catch {
        // ignore
      }
      updateCoordinates();
      return;
    }

    // Fast O(1) incremental live tick update & new candle bucket append (preserves active touch drag & pinch-zoom!)
    const series = seriesRef.current;
    if (!series) return;

    // Detect if older historical candles were prepended when scrolling backward
    const firstIncomingRaw = Number(candles[0]?.time || 0);
    const firstIncomingSec =
      firstIncomingRaw > 1e11 ? Math.floor(firstIncomingRaw / 1000) : Math.floor(firstIncomingRaw);
    const hasPrependedHistory =
      firstFormattedBarTimeRef.current > 0 &&
      firstIncomingSec > 0 &&
      firstIncomingSec < firstFormattedBarTimeRef.current;

    if (hasPrependedHistory) {
      const prevFirstTime = firstFormattedBarTimeRef.current;
      const prevRange = chart.timeScale().getVisibleLogicalRange();
      const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals, asset);
      if (bars.length > 0) {
        let prependedCount = 0;
        for (const b of bars) {
          if ((b.time as number) < prevFirstTime) {
            prependedCount += 1;
          } else {
            break;
          }
        }
        barsCountRef.current = bars.length;
        firstFormattedBarTimeRef.current = bars[0].time as number;
        lastFormattedBarRef.current = bars[bars.length - 1];
        try {
          if (chartType === 'line') {
            series.setData(bars.map((b: FormattedBar) => ({ time: b.time, value: b.close })));
          } else {
            series.setData(bars);
          }
          if (prevRange && prependedCount > 0) {
            chart.timeScale().setVisibleLogicalRange({
              from: prevRange.from + prependedCount,
              to: prevRange.to + prependedCount,
            });
          }
        } catch {
          // ignore
        }
      }
      updateCoordinates();
      return;
    }

    const prevBar = lastFormattedBarRef.current;
    const recentSlice = candles.slice(-6);
    const sourceSlice = chartType === 'heikin-ashi' ? calculateHeikinAshi(recentSlice) : recentSlice;

    if (sourceSlice.length === 0) return;

    // Collect any bars >= prevBar.time so new candle buckets append cleanly via series.update()
    const barsToApply: FormattedBar[] = [];
    for (const c of sourceSlice) {
      const formatted = formatSingleCandle(c, asset.pipDecimals);
      if (!formatted || !isValidPriceForAsset(asset, formatted.close)) continue;
      if (!prevBar || (formatted.time as number) >= (prevBar.time as number)) {
        barsToApply.push(formatted);
      }
    }

    if (barsToApply.length === 0) return;

    try {
      for (const b of barsToApply) {
        const prevTime = lastFormattedBarRef.current ? (lastFormattedBarRef.current.time as number) : 0;
        if ((b.time as number) > prevTime) {
          barsCountRef.current += 1;
        }
        lastFormattedBarRef.current = b;
        if (chartType === 'line') {
          series.update({ time: b.time, value: b.close });
        } else {
          series.update(b);
        }
      }
    } catch {
      // Fallback full sync only if time series became non-monotonic
      const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals, asset);
      barsCountRef.current = bars.length;
      if (bars.length > 0) {
        firstFormattedBarTimeRef.current = bars[0].time as number;
        lastFormattedBarRef.current = bars[bars.length - 1];
        try {
          if (chartType === 'line') {
            series.setData(bars.map((b: FormattedBar) => ({ time: b.time, value: b.close })));
          } else {
            series.setData(bars);
          }
        } catch {
          // ignore
        }
      }
    }

    updateCoordinates();
  }, [candles, chartType, timeframe, asset, updateCoordinates]);

  // 3. Native Canvas Trade Execution Lines (series.createPriceLine)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || lastLoadedSymbolRef.current !== asset.symbol) return;

    const currentLines = priceLinesRef.current;
    const activeIds = new Set(assetActiveTrades.map((t) => t.id));

    for (const [id, line] of currentLines.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(line);
        } catch {
          // ignore
        }
        currentLines.delete(id);
      }
    }

    for (const t of assetActiveTrades) {
      let line = currentLines.get(t.id);
      const isCall = t.direction === 'CALL';
      const lineColor = isCall ? '#00E676' : '#FF1744';
      const investmentNum = Number(t.investment) || 0;
      const title = `${isCall ? 'CALL' : 'PUT'} $${investmentNum}`;
      const strikePriceNum = Number(t.strikePrice) || 0;

      if (!isValidPriceForAsset(asset, strikePriceNum)) continue;

      if (!line) {
        line = series.createPriceLine({
          price: strikePriceNum,
          color: lineColor,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        });
        currentLines.set(t.id, line);
      } else {
        line.applyOptions({
          price: strikePriceNum,
          color: lineColor,
          title,
        });
      }
    }
    updateCoordinates(true);
    const rafId = requestAnimationFrame(() => {
      updateCoordinatesRef.current(true);
    });
    return () => cancelAnimationFrame(rafId);
  }, [asset, assetActiveTrades, updateCoordinates]);

  const handleGoToLive = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      chartRef.current.timeScale().resetTimeScale();
      chartRef.current.timeScale().scrollToRealTime();
      setIsScrolledFromLive(false);
      requestAnimationFrame(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().scrollToRealTime();
          setIsScrolledFromLive(false);
        }
      });
    }
  }, []);

  const isDataValidAndReady =
    candles && candles.length > 0 && validateCandlesForAsset(asset, candles);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none tradingview-chart-container tv-chart-container chart-container hw-accelerate gpu-accelerated"
      style={{
        background: "url('/1793209787676.jpg.jpeg') center/cover no-repeat",
        transform: 'translateZ(0)',
        willChange: 'transform',
        touchAction: 'pan-x pan-y pinch-zoom',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Loading state indicator when data is empty, switching symbol, or validating */}
      {!isDataValidAndReady && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0e14]/80 backdrop-blur-sm pointer-events-none select-none">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#111827]/90 border border-cyan-500/40 shadow-2xl">
            <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
            <span className="text-xs font-mono font-medium text-cyan-200 tracking-wide">
              Loading {asset.symbol} Chart Data...
            </span>
          </div>
        </div>
      )}

      {/* Live Moving Price Tag & Candle Countdown Timer pinned symmetrically on the live price axis */}
      {isDataValidAndReady && currentPriceY > 0 && (
        <div
          data-testid="chart-live-price-tag"
          data-price-y={currentPriceY}
          className="absolute right-[60px] z-35 px-2 py-1 rounded bg-[#0b0e14] border border-cyan-500/70 shadow-2xl flex flex-col items-end font-mono text-[10px] select-none transition-all duration-75 pointer-events-none gpu-accelerated"
          style={{
            top: `${Math.max(20, Math.min(Math.max(20, containerSize.height - 20), currentPriceY))}px`,
            transform: 'translateY(-50%) translateZ(0)',
            willChange: 'transform',
          }}
        >
          <span className="font-bold text-cyan-300 tabular-nums">
            {Number(
              isValidPriceForAsset(asset, Number(currentPrice))
                ? currentPrice
                : candles[candles.length - 1]?.close || asset.basePrice
            ).toFixed(asset.pipDecimals)}
          </span>
          <span className="text-[#00E676] font-bold text-[9.5px] tabular-nums flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-ping" />
            {candleCountdown}
          </span>
        </div>
      )}

      {/* Active Trades Entry Anchor Markers & PnL Pill Badges */}
      {assetActiveTrades.map((trade) => {
        const coords = badgeCoords[trade.id];
        if (!coords) return null;

        const investmentNum = Number(trade.investment) || 0;
        const payoutPct = Number(trade.payoutPercentage) || 92;
        const strikePriceNum = Number(trade.strikePrice) || 0;
        const currentPriceNum = Number(currentPrice) || strikePriceNum;
        const isCall = trade.direction === 'CALL';
        const isInTheMoney = isCall
          ? currentPriceNum >= strikePriceNum
          : currentPriceNum <= strikePriceNum;
        const livePnl = isInTheMoney ? (investmentNum * payoutPct) / 100 : -investmentNum;

        const durationSec = Number(trade.durationSeconds) || 30;
        const startTimeMs = Number(trade.startTime) || Date.now();
        const expiresAt = Number(trade.endTime) || startTimeMs + durationSec * 1000;
        const remainingMs = Math.max(0, expiresAt - now);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
        const ss = String(remainingSeconds % 60).padStart(2, '0');
        const formattedTimer = `${mm}:${ss}`;
        const formattedPnl = livePnl >= 0 ? `+$${livePnl.toFixed(2)}` : `-$${Math.abs(livePnl).toFixed(2)}`;

        const isMobileChart =
          containerSize.width < 768 || (typeof window !== 'undefined' && window.innerWidth < 768);
        const pos = computeTradeBadgePosition({
          entryX: coords.entryX,
          entryY: coords.y,
          containerWidth: containerSize.width,
          containerHeight: containerSize.height,
          isMobile: isMobileChart,
        });

        return (
          <React.Fragment key={trade.id}>
            <div
              data-testid="trade-entry-marker"
              data-trade-direction={trade.direction}
              data-strike-price={strikePriceNum.toFixed(asset.pipDecimals)}
              data-entry-y={coords.y}
              className={`absolute z-30 w-2.5 h-2.5 rounded-full border-2 border-[#0b0e14] pointer-events-none ${
                isCall
                  ? 'bg-[#00E676] shadow-[0_0_10px_rgba(0,230,118,0.85)]'
                  : 'bg-[#FF1744] shadow-[0_0_10px_rgba(255,23,68,0.85)]'
              }`}
              style={{
                top: `${pos.entryDotY}px`,
                left: `${pos.entryDotX}px`,
                transform: 'translate(-50%, -50%) translateZ(0)',
              }}
            />
            <TradeBadge
              direction={trade.direction}
              investment={investmentNum}
              formattedTimer={formattedTimer}
              remainingSeconds={remainingSeconds}
              totalDuration={durationSec}
              formattedPnl={formattedPnl}
              isInTheMoney={isInTheMoney}
              top={pos.top}
              left={pos.left}
            />
          </React.Fragment>
        );
      })}

      {/* Quotex-style Floating Trade Settlement Result Badge directly at exact Candle & Price Settlement Coordinate */}
      {tradeResultOverlay && resultBadgeCoords && (
        <div
          data-testid="settlement-result-badge"
          className="absolute z-40 pointer-events-none select-none transition-all duration-100"
          style={{
            top: `${resultBadgeCoords.y - 20}px`,
            left: `${resultBadgeCoords.x + 10}px`,
          }}
        >
          <div
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-mono text-xs font-black shadow-2xl border bg-zinc-950/95 animate-in fade-in zoom-in-90 slide-in-from-bottom-2 duration-300 ${
              tradeResultOverlay.isWin
                ? 'border-emerald-500/80 text-emerald-400 shadow-[0_4px_20px_rgba(0,230,118,0.35)]'
                : tradeResultOverlay.isTie
                ? 'border-amber-500/80 text-amber-400 shadow-[0_4px_20px_rgba(255,179,0,0.35)]'
                : 'border-rose-500/80 text-rose-400 shadow-[0_4px_20px_rgba(255,23,68,0.35)]'
            }`}
          >
            <span className="text-[11px]">
              {tradeResultOverlay.isWin ? '▲ WIN' : tradeResultOverlay.isTie ? '► TIE' : '▼ LOSS'}
            </span>
            <span className="tabular-nums font-extrabold">
              {tradeResultOverlay.isWin
                ? `+$${Number(tradeResultOverlay.profitAmount || 0).toFixed(2)}`
                : tradeResultOverlay.isTie
                ? '±$0.00'
                : `-$${Number(tradeResultOverlay.investment || 0).toFixed(2)}`}
            </span>
          </div>
        </div>
      )}

      {/* Quotex-style Floating 'Go to Live' Button */}
      {isScrolledFromLive && (
        <button
          onClick={handleGoToLive}
          data-testid="go-to-live-button"
          className="absolute bottom-12 right-16 z-40 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0b0e14]/90 hover:bg-[#151c28] text-cyan-400 hover:text-cyan-300 border border-cyan-500/50 hover:border-cyan-400 shadow-[0_4px_25px_rgba(0,229,255,0.25)] backdrop-blur-md transition-all duration-200 cursor-pointer animate-in fade-in zoom-in-95 slide-in-from-bottom-3 group select-none"
          title="Snap back to real-time market candles"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
          </span>
          <span className="text-[11px] font-bold tracking-wider font-mono uppercase">Go to Live</span>
          <svg
            className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform text-cyan-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 12h15" />
          </svg>
        </button>
      )}
    </div>
  );
});
