import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  AreaSeries,
  BarSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import { TrendingUp, TrendingDown, Clock, Lock } from 'lucide-react';
import type { AssetInfo, BinaryTrade, Candle } from '../types';
import { normalizeAssetSymbol } from '../utils/storage';
import {
  calculateHeikinAshi,
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  calculateFibonacciLevels,
  calculateSupportResistanceLevels,
  evaluateLiveTradeOverlayStatus,
  type IndicatorSettings,
} from '../utils/technicalIndicators';
import {
  type DrawingToolId,
  type DrawingLineStyle,
  type ChartDrawingObject,
  createInitialDrawing,
  updateDrawingOnDrag,
  finalizeDrawingObject,
  translateDrawing,
  updateDrawingHandle,
  findHitDrawing,
  findHitDrawingHandle,
  renderDrawingOnCanvas,
} from '../utils/drawingToolsEngine';
import {
  resolveTradingViewSymbol,
  computeOrderLineState,
  createTradingViewOrderLine,
  type ITradingViewOrderLine,
} from '../utils/tradingViewOrderLineEngine';

export interface LightweightTradingChartProps {
  asset: AssetInfo;
  candles: Candle[];
  currentPrice: number;
  timeframe: string;
  chartType: 'candles' | 'heikin-ashi' | 'line' | 'bars';
  activeTrades: BinaryTrade[];
  indicators?: IndicatorSettings;
  zoomLevel?: number;
  onHoverCandle?: (candle: Candle | null) => void;
  // Interactive Drawing Tools props
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
}

interface FormattedBar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Deduplicates and strictly sorts candles by ascending UTC timestamp (in seconds)
 * as required by TradingView Lightweight Charts.
 */
function prepareLightweightBars(
  candles: Candle[],
  chartType: 'candles' | 'heikin-ashi' | 'line' | 'bars',
  decimals: number
): FormattedBar[] {
  if (!candles || candles.length === 0) return [];
  const source = chartType === 'heikin-ashi' ? calculateHeikinAshi(candles) : candles;

  const bySec = new Map<number, FormattedBar>();
  for (const c of source) {
    if (
      !c ||
      typeof c.time !== 'number' ||
      Number.isNaN(c.open) ||
      Number.isNaN(c.high) ||
      Number.isNaN(c.low) ||
      Number.isNaN(c.close)
    ) {
      continue;
    }
    const sec = Math.floor(c.time / 1000);
    bySec.set(sec, {
      time: sec as UTCTimestamp,
      open: Number(c.open.toFixed(decimals)),
      high: Number(Math.max(c.open, c.close, c.high).toFixed(decimals)),
      low: Number(Math.min(c.open, c.close, c.low).toFixed(decimals)),
      close: Number(c.close.toFixed(decimals)),
    });
  }

  return Array.from(bySec.values()).sort((a, b) => (a.time as number) - (b.time as number));
}

export const LightweightTradingChart: React.FC<LightweightTradingChartProps> = ({
  asset,
  candles,
  currentPrice,
  timeframe,
  chartType,
  activeTrades,
  indicators,
  zoomLevel = 1,
  onHoverCandle,
  drawings = [],
  activeDrawingTool = 'none',
  drawingColor = '#ff8800',
  drawingWidth = 2,
  drawingLineStyle = 'solid',
  selectedDrawingId = null,
  onSelectDrawing,
  onAddDrawing,
  onUpdateDrawing,
  onCompleteDrawingTool,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<any> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<any> | null>(null);

  const tradeLinesRef = useRef<Map<string, ITradingViewOrderLine>>(new Map());
  const srLinesRef = useRef<IPriceLine[]>([]);
  const fibLinesRef = useRef<IPriceLine[]>([]);
  const resolvedTvSymbol = useMemo(
    () => resolveTradingViewSymbol(asset.symbol, asset.category),
    [asset.symbol, asset.category]
  );

  const prevDatasetKeyRef = useRef<string>('');
  const prevIndicatorKeyRef = useRef<string>('');
  const prevBarsLenRef = useRef<number>(0);
  const barsCacheRef = useRef<FormattedBar[]>([]);
  const tickRafRef = useRef<number | null>(null);
  const overlayRafRef = useRef<number | null>(null);

  const [, setNowTick] = useState<number>(() => Date.now());
  const [tradeCoords, setTradeCoords] = useState<
    Record<string, { y: number; entryX: number | null; liveX: number | null }>
  >({});

  // Interactive Drawing state on the overlay canvas
  const [draftDrawing, setDraftDrawing] = useState<ChartDrawingObject | null>(null);
  const draggingDrawingRef = useRef<{
    id: string;
    mode: 'move' | 'start' | 'end' | 'control';
    lastX: number;
    lastY: number;
    drawing: ChartDrawingObject;
  } | null>(null);

  // Filter active open trades belonging to the currently selected asset
  const assetActiveTrades = useMemo(() => {
    const targetSym = normalizeAssetSymbol(asset.symbol);
    return activeTrades.filter(
      (t) => t.status === 'active' && normalizeAssetSymbol(t.asset) === targetSym
    );
  }, [activeTrades, asset.symbol]);

  const computeTradeCoordinates = useCallback(() => {
    if (!mainSeriesRef.current || !chartRef.current || assetActiveTrades.length === 0) return;
    const series = mainSeriesRef.current;
    const timeScale = chartRef.current.timeScale();
    const bars = barsCacheRef.current;
    const lastBarTime = bars.length > 0 ? bars[bars.length - 1].time : null;

    let liveX: number | null = null;
    if (lastBarTime !== null) {
      try {
        const lx = timeScale.timeToCoordinate(lastBarTime);
        if (typeof lx === 'number' && !Number.isNaN(lx)) liveX = lx;
      } catch {
        // ignore
      }
    }

    const nextCoords: Record<string, { y: number; entryX: number | null; liveX: number | null }> = {};
    for (const t of assetActiveTrades) {
      try {
        const yCoord = series.priceToCoordinate(t.strikePrice);
        if (typeof yCoord === 'number' && !Number.isNaN(yCoord)) {
          let entryX: number | null = null;
          if (bars.length > 0) {
            const entrySec = Math.floor(t.startTime / 1000);
            // Snap to nearest bar timestamp
            let nearestTime = bars[bars.length - 1].time;
            let minDiff = Infinity;
            for (let i = Math.max(0, bars.length - 120); i < bars.length; i++) {
              const diff = Math.abs((bars[i].time as number) - entrySec);
              if (diff < minDiff) {
                minDiff = diff;
                nearestTime = bars[i].time;
              }
            }
            const ex = timeScale.timeToCoordinate(nearestTime);
            if (typeof ex === 'number' && !Number.isNaN(ex)) entryX = ex;
          }
          nextCoords[t.id] = { y: yCoord, entryX, liveX };
        }
      } catch {
        // ignore
      }
    }

    setTradeCoords((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(nextCoords);
      if (
        prevKeys.length === nextKeys.length &&
        nextKeys.every(
          (k) =>
            prev[k] &&
            Math.abs(prev[k].y - nextCoords[k].y) < 0.5 &&
            Math.abs((prev[k].entryX ?? -999) - (nextCoords[k].entryX ?? -999)) < 1 &&
            Math.abs((prev[k].liveX ?? -999) - (nextCoords[k].liveX ?? -999)) < 1
        )
      ) {
        return prev;
      }
      return nextCoords;
    });
  }, [assetActiveTrades]);

  // 250ms ticker to keep countdown timers and Y-coordinate badges responsive
  useEffect(() => {
    if (assetActiveTrades.length === 0) return;
    computeTradeCoordinates();
    const timer = setInterval(() => {
      setNowTick(Date.now());
      computeTradeCoordinates();
    }, 250);
    return () => clearInterval(timer);
  }, [assetActiveTrades, computeTradeCoordinates]);

  // 1. Initialize TradingView Lightweight Chart instance once with PC & Mobile Touch Optimizations
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: container.clientHeight || 460,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0e14' },
        textColor: '#94a3b8',
        fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Solid },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255, 136, 0, 0.55)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#ff8800',
        },
        horzLine: {
          color: 'rgba(255, 136, 0, 0.55)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.6)',
        scaleMargins: {
          top: 0.14,
          bottom: 0.18,
        },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.6)',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 10,
        barSpacing: 9,
        minBarSpacing: 2.5,
      },
      kineticScroll: {
        touch: true,
        mouse: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (tickRafRef.current) cancelAnimationFrame(tickRafRef.current);
      if (overlayRafRef.current) cancelAnimationFrame(overlayRafRef.current);
      tradeLinesRef.current.clear();
      srLinesRef.current = [];
      fibLinesRef.current = [];
      mainSeriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  // 2. Recreate Main Series when chartType changes (`candles`, `heikin-ashi`, `line`, `bars`)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (mainSeriesRef.current) {
      try {
        chart.removeSeries(mainSeriesRef.current);
      } catch {
        // ignore
      }
      mainSeriesRef.current = null;
      tradeLinesRef.current.clear();
      srLinesRef.current = [];
      fibLinesRef.current = [];
    }

    const minMove = Number(Math.pow(10, -asset.pipDecimals).toFixed(asset.pipDecimals));
    const priceFormat = {
      type: 'price' as const,
      precision: asset.pipDecimals,
      minMove,
    };

    let series: ISeriesApi<any>;
    if (chartType === 'line') {
      series = chart.addSeries(AreaSeries, {
        lineColor: '#00e676',
        topColor: 'rgba(0, 230, 118, 0.28)',
        bottomColor: 'rgba(0, 230, 118, 0.01)',
        lineWidth: 2,
        priceFormat,
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: '#00e676',
        priceLineStyle: LineStyle.Dashed,
      });
    } else if (chartType === 'bars') {
      series = chart.addSeries(BarSeries, {
        upColor: '#00e676',
        downColor: '#ff334b',
        thinBars: false,
        priceFormat,
        lastValueVisible: true,
        priceLineVisible: true,
      });
    } else {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#00e676',
        downColor: '#ff334b',
        borderUpColor: '#00e676',
        borderDownColor: '#ff334b',
        wickUpColor: '#00e676',
        wickDownColor: '#ff334b',
        priceFormat,
        lastValueVisible: true,
        priceLineVisible: true,
      });
    }

    mainSeriesRef.current = series;
    prevDatasetKeyRef.current = '';
    prevIndicatorKeyRef.current = '';

    const handleCrosshair = (param: any) => {
      if (!onHoverCandle) return;
      if (!param || !param.time || !mainSeriesRef.current) {
        onHoverCandle(null);
        return;
      }
      const data = param.seriesData?.get(mainSeriesRef.current);
      if (!data) {
        onHoverCandle(null);
        return;
      }
      if ('open' in data) {
        onHoverCandle({
          time: (param.time as number) * 1000,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: 100,
        });
      } else if ('value' in data) {
        onHoverCandle({
          time: (param.time as number) * 1000,
          open: data.value,
          high: data.value,
          low: data.value,
          close: data.value,
          volume: 100,
        });
      }
    };

    chart.subscribeCrosshairMove(handleCrosshair);
    return () => {
      try {
        chart.unsubscribeCrosshairMove(handleCrosshair);
      } catch {
        // ignore
      }
    };
  }, [chartType]);

  // 3. Apply zoomLevel changes to barSpacing smoothly
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const spacing = Math.max(3, Math.min(28, Math.round(9 * zoomLevel)));
    chart.timeScale().applyOptions({ barSpacing: spacing });
  }, [zoomLevel]);

  // 4. RequestAnimationFrame-Throttled Price & Indicator Updates for Butter-Smooth 60fps Performance
  useEffect(() => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

    if (tickRafRef.current) {
      cancelAnimationFrame(tickRafRef.current);
    }

    tickRafRef.current = requestAnimationFrame(() => {
      const minMove = Number(Math.pow(10, -asset.pipDecimals).toFixed(asset.pipDecimals));
      series.applyOptions({
        priceFormat: {
          type: 'price',
          precision: asset.pipDecimals,
          minMove,
        },
      });

      const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
      if (bars.length === 0) return;

      // Guard against 1-frame transitional render where `asset` updated before `candles` state updated
      if (
        asset.basePrice > 0 &&
        bars[0].open > 0 &&
        Math.abs(bars[0].open - asset.basePrice) / Math.max(asset.basePrice, bars[0].open) > 0.45
      ) {
        return;
      }

      barsCacheRef.current = bars;

      const firstBarSig = `${bars[0].time}:${bars[0].open.toFixed(asset.pipDecimals)}`;
      const datasetKey = `${asset.symbol}:${timeframe}:${chartType}:${firstBarSig}`;
      const isNewDataset = prevDatasetKeyRef.current !== datasetKey;

      if (isNewDataset || Math.abs(bars.length - prevBarsLenRef.current) > 3) {
        if (chartType === 'line') {
          series.setData(bars.map((b) => ({ time: b.time, value: b.close })));
        } else {
          series.setData(bars);
        }
        const fullRawCandles: Candle[] = bars.map((b) => ({
          time: (b.time as number) * 1000,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: 100,
        }));
        if (indicators?.showSma && smaSeriesRef.current) {
          const smaVals = calculateSMA(fullRawCandles, indicators.smaPeriod || 14);
          const smaData = bars
            .map((b, idx) => (smaVals[idx] !== null ? { time: b.time, value: smaVals[idx]! } : null))
            .filter(Boolean) as Array<{ time: UTCTimestamp; value: number }>;
          smaSeriesRef.current.setData(smaData);
        }
        if (indicators?.showEma && emaSeriesRef.current) {
          const emaVals = calculateEMA(fullRawCandles, indicators.emaPeriod || 9);
          const emaData = bars
            .map((b, idx) => (emaVals[idx] !== null ? { time: b.time, value: emaVals[idx]! } : null))
            .filter(Boolean) as Array<{ time: UTCTimestamp; value: number }>;
          emaSeriesRef.current.setData(emaData);
        }
        if (indicators?.showBollinger && bbUpperRef.current && bbLowerRef.current) {
          const bbVals = calculateBollingerBands(
            fullRawCandles,
            indicators.bollingerPeriod || 20,
            indicators.bollingerStd || 2
          );
          const upperData: Array<{ time: UTCTimestamp; value: number }> = [];
          const lowerData: Array<{ time: UTCTimestamp; value: number }> = [];
          bars.forEach((b, idx) => {
            if (bbVals.upper[idx] !== null && bbVals.lower[idx] !== null) {
              upperData.push({ time: b.time, value: bbVals.upper[idx]! });
              lowerData.push({ time: b.time, value: bbVals.lower[idx]! });
            }
          });
          bbUpperRef.current.setData(upperData);
          bbLowerRef.current.setData(lowerData);
        }
        prevDatasetKeyRef.current = datasetKey;
        prevBarsLenRef.current = bars.length;
        prevIndicatorKeyRef.current = '';
        chart.priceScale('right').applyOptions({ autoScale: true });
        chart.timeScale().scrollToRealTime();
      } else {
        const prevBar = bars.length >= 2 ? bars[bars.length - 2] : null;
        const lastBar = bars[bars.length - 1];
        try {
          if (prevBar) {
            if (chartType === 'line') {
              series.update({ time: prevBar.time, value: prevBar.close });
            } else {
              series.update(prevBar);
            }
          }
          if (chartType === 'line') {
            series.update({ time: lastBar.time, value: lastBar.close });
          } else {
            series.update(lastBar);
          }
          prevBarsLenRef.current = bars.length;
        } catch {
          if (chartType === 'line') {
            series.setData(bars.map((b) => ({ time: b.time, value: b.close })));
          } else {
            series.setData(bars);
          }
          prevBarsLenRef.current = bars.length;
        }

        // Incremental O(1) fast-tip update for active LineSeries indicators (SMA, EMA, Bollinger)
        if (indicators && bars.length >= 30) {
          const tailSlice = bars.slice(-60).map((b) => ({
            time: (b.time as number) * 1000,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: 100,
          }));
          if (indicators.showSma && smaSeriesRef.current) {
            const smaTail = calculateSMA(tailSlice, indicators.smaPeriod || 14);
            const lastSma = smaTail[smaTail.length - 1];
            if (lastSma !== null) {
              try {
                smaSeriesRef.current.update({ time: lastBar.time, value: lastSma });
              } catch {
                // ignore
              }
            }
          }
          if (indicators.showEma && emaSeriesRef.current) {
            const emaTail = calculateEMA(tailSlice, indicators.emaPeriod || 9);
            const lastEma = emaTail[emaTail.length - 1];
            if (lastEma !== null) {
              try {
                emaSeriesRef.current.update({ time: lastBar.time, value: lastEma });
              } catch {
                // ignore
              }
            }
          }
          if (indicators.showBollinger && bbUpperRef.current && bbLowerRef.current) {
            const bbTail = calculateBollingerBands(
              tailSlice,
              indicators.bollingerPeriod || 20,
              indicators.bollingerStd || 2
            );
            const lastUp = bbTail.upper[bbTail.upper.length - 1];
            const lastLow = bbTail.lower[bbTail.lower.length - 1];
            if (lastUp !== null && lastLow !== null) {
              try {
                bbUpperRef.current.update({ time: lastBar.time, value: lastUp });
                bbLowerRef.current.update({ time: lastBar.time, value: lastLow });
              } catch {
                // ignore
              }
            }
          }
        }
      }

      computeTradeCoordinates();
    });
  }, [asset.symbol, asset.basePrice, asset.pipDecimals, candles, currentPrice, timeframe, chartType, computeTradeCoordinates]);

  // 5. Full Technical Indicator Setup (Only re-runs when indicator toggles/params or dataset changes, NOT on every tick!)
  useEffect(() => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

    const removeIfPresent = (ref: React.MutableRefObject<ISeriesApi<any> | null>) => {
      if (ref.current) {
        try {
          chart.removeSeries(ref.current);
        } catch {
          // ignore
        }
        ref.current = null;
      }
    };

    const clearPriceLines = (listRef: React.MutableRefObject<IPriceLine[]>) => {
      for (const l of listRef.current) {
        try {
          series.removePriceLine(l);
        } catch {
          // ignore
        }
      }
      listRef.current = [];
    };

    if (!indicators) {
      removeIfPresent(smaSeriesRef);
      removeIfPresent(emaSeriesRef);
      removeIfPresent(bbUpperRef);
      removeIfPresent(bbLowerRef);
      clearPriceLines(srLinesRef);
      clearPriceLines(fibLinesRef);
      return;
    }

    const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
    if (bars.length === 0) return;

    if (
      asset.basePrice > 0 &&
      bars[0].open > 0 &&
      Math.abs(bars[0].open - asset.basePrice) / Math.max(asset.basePrice, bars[0].open) > 0.45
    ) {
      return;
    }

    const firstBarSig = `${bars[0].time}:${bars[0].open.toFixed(asset.pipDecimals)}`;
    const indicatorKey = JSON.stringify({
      sym: asset.symbol,
      sig: firstBarSig,
      tf: timeframe,
      ct: chartType,
      sma: indicators.showSma ? `${indicators.smaPeriod}:${indicators.smaColor}:${indicators.smaWidth}` : 'off',
      ema: indicators.showEma ? `${indicators.emaPeriod}:${indicators.emaColor}:${indicators.emaWidth}` : 'off',
      bb: indicators.showBollinger ? `${indicators.bollingerPeriod}:${indicators.bollingerStd}:${indicators.bollingerColor}` : 'off',
      sr: Boolean(indicators.showSupportResistance),
      fib: Boolean(indicators.showFib),
    });

    if (prevIndicatorKeyRef.current === indicatorKey) {
      return;
    }
    prevIndicatorKeyRef.current = indicatorKey;

    const rawCandles: Candle[] = bars.map((b) => ({
      time: (b.time as number) * 1000,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: 100,
    }));

    // SMA
    if (indicators.showSma) {
      if (!smaSeriesRef.current) {
        smaSeriesRef.current = chart.addSeries(LineSeries, {
          color: indicators.smaColor || '#38bdf8',
          lineWidth: (indicators.smaWidth || 2) as any,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      } else {
        smaSeriesRef.current.applyOptions({
          color: indicators.smaColor || '#38bdf8',
          lineWidth: (indicators.smaWidth || 2) as any,
        });
      }
      const smaVals = calculateSMA(rawCandles, indicators.smaPeriod || 14);
      const smaData = bars
        .map((b, idx) => (smaVals[idx] !== null ? { time: b.time, value: smaVals[idx]! } : null))
        .filter(Boolean) as Array<{ time: UTCTimestamp; value: number }>;
      smaSeriesRef.current.setData(smaData);
    } else {
      removeIfPresent(smaSeriesRef);
    }

    // EMA
    if (indicators.showEma) {
      if (!emaSeriesRef.current) {
        emaSeriesRef.current = chart.addSeries(LineSeries, {
          color: indicators.emaColor || '#f59e0b',
          lineWidth: (indicators.emaWidth || 2) as any,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      } else {
        emaSeriesRef.current.applyOptions({
          color: indicators.emaColor || '#f59e0b',
          lineWidth: (indicators.emaWidth || 2) as any,
        });
      }
      const emaVals = calculateEMA(rawCandles, indicators.emaPeriod || 9);
      const emaData = bars
        .map((b, idx) => (emaVals[idx] !== null ? { time: b.time, value: emaVals[idx]! } : null))
        .filter(Boolean) as Array<{ time: UTCTimestamp; value: number }>;
      emaSeriesRef.current.setData(emaData);
    } else {
      removeIfPresent(emaSeriesRef);
    }

    // Bollinger Bands
    if (indicators.showBollinger) {
      const bbColor = indicators.bollingerColor || 'rgba(168, 85, 247, 0.75)';
      if (!bbUpperRef.current) {
        bbUpperRef.current = chart.addSeries(LineSeries, {
          color: bbColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }
      if (!bbLowerRef.current) {
        bbLowerRef.current = chart.addSeries(LineSeries, {
          color: bbColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }
      const bbVals = calculateBollingerBands(
        rawCandles,
        indicators.bollingerPeriod || 20,
        indicators.bollingerStd || 2
      );
      const upperData: Array<{ time: UTCTimestamp; value: number }> = [];
      const lowerData: Array<{ time: UTCTimestamp; value: number }> = [];
      bars.forEach((b, idx) => {
        if (bbVals.upper[idx] !== null && bbVals.lower[idx] !== null) {
          upperData.push({ time: b.time, value: bbVals.upper[idx]! });
          lowerData.push({ time: b.time, value: bbVals.lower[idx]! });
        }
      });
      bbUpperRef.current.setData(upperData);
      bbLowerRef.current.setData(lowerData);
    } else {
      removeIfPresent(bbUpperRef);
      removeIfPresent(bbLowerRef);
    }

    // Auto Support & Resistance Price Lines
    clearPriceLines(srLinesRef);
    if (indicators.showSupportResistance) {
      const srLevels = calculateSupportResistanceLevels(rawCandles, asset.pipDecimals);
      for (const lvl of srLevels) {
        try {
          const line = series.createPriceLine({
            price: lvl.price,
            color: lvl.type === 'resistance' ? 'rgba(255, 51, 75, 0.65)' : 'rgba(0, 230, 118, 0.65)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: lvl.type === 'resistance' ? 'RESISTANCE' : 'SUPPORT',
          });
          srLinesRef.current.push(line);
        } catch {
          // ignore
        }
      }
    }

    // Fibonacci Retracement Price Lines
    clearPriceLines(fibLinesRef);
    if (indicators.showFib && rawCandles.length >= 10) {
      const recent = rawCandles.slice(-80);
      const high = Math.max(...recent.map((c) => c.high));
      const low = Math.min(...recent.map((c) => c.low));
      const fibs = calculateFibonacciLevels(high, low);
      for (const f of fibs) {
        try {
          const line = series.createPriceLine({
            price: Number(f.price.toFixed(asset.pipDecimals)),
            color: f.ratio === 0.618 ? '#ff8800' : 'rgba(56, 189, 248, 0.55)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: `Fib ${f.label}`,
          });
          fibLinesRef.current.push(line);
        } catch {
          // ignore
        }
      }
    }
    // Adjust vertical scale margins when RSI or MACD sub-panes are active so candles never collide with sub-panes
    try {
      chart.priceScale('right').applyOptions({
        scaleMargins: {
          top: 0.14,
          bottom: indicators.showRsi || indicators.showMacd ? 0.28 : 0.16,
        },
      });
    } catch {
      // ignore
    }
  }, [
    indicators?.showSma,
    indicators?.smaPeriod,
    indicators?.smaColor,
    indicators?.smaWidth,
    indicators?.showEma,
    indicators?.emaPeriod,
    indicators?.emaColor,
    indicators?.emaWidth,
    indicators?.showBollinger,
    indicators?.bollingerPeriod,
    indicators?.bollingerStd,
    indicators?.bollingerColor,
    indicators?.showSupportResistance,
    indicators?.showFib,
    indicators?.showRsi,
    indicators?.showMacd,
    asset.symbol,
    asset.basePrice,
    asset.pipDecimals,
    timeframe,
    chartType,
    candles.length,
    candles[0]?.time,
    candles[0]?.open,
  ]);

  // 6. Synchronize Interactive Chart Trade Overlays (TradingView createOrderLine Primitive)
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;

    const existingMap = tradeLinesRef.current;
    const activeIds = new Set(assetActiveTrades.map((t) => t.id));

    // Automatically remove order lines upon final trade settlement / expiration
    for (const [id, orderLineObj] of existingMap.entries()) {
      if (!activeIds.has(id)) {
        orderLineObj.remove();
        existingMap.delete(id);
      }
    }

    const now = Date.now();
    const isCompactViewport = (containerRef.current?.clientWidth || 800) < 540;

    for (const trade of assetActiveTrades) {
      const orderState = computeOrderLineState(trade, currentPrice, now, asset.pipDecimals);
      const existingOrderLine = existingMap.get(trade.id);

      if (existingOrderLine && !existingOrderLine.isRemoved()) {
        existingOrderLine
          .setPrice(trade.strikePrice)
          .setDirection(trade.direction)
          .setQuantity(orderState.formattedAmount)
          .setTimer(orderState.formattedTimer)
          .setLineColor(orderState.lineColor)
          .setBodyBackgroundColor(orderState.bodyBackgroundColor)
          .setBodyBorderColor(orderState.bodyBorderColor)
          .setBodyTextColor(orderState.bodyTextColor)
          .setQuantityBackgroundColor(orderState.quantityBackgroundColor)
          .setCancellable(false)
          .applyState(orderState, isCompactViewport);
      } else {
        try {
          const newOrderLine = createTradingViewOrderLine(
            series as any,
            orderState,
            isCompactViewport
          );
          existingMap.set(trade.id, newOrderLine);
        } catch {
          // ignore
        }
      }
    }

    computeTradeCoordinates();
  }, [assetActiveTrades, currentPrice, chartType, asset.pipDecimals, computeTradeCoordinates]);

  // 7. Synchronize Hardware-Accelerated Overlay Canvas (Legacy Trade Entry/Exit Nodes + Drawings + RSI/MACD Sub-panes)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (overlayRafRef.current) {
      cancelAnimationFrame(overlayRafRef.current);
    }

    overlayRafRef.current = requestAnimationFrame(() => {
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 460;
      const dpr = Math.max(1, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const bars = barsCacheRef.current;
      const recentBars = bars.slice(-80);
      const minPrice = recentBars.length > 0 ? Math.min(...recentBars.map((b) => b.low)) : currentPrice * 0.99;
      const maxPrice = recentBars.length > 0 ? Math.max(...recentBars.map((b) => b.high)) : currentPrice * 1.01;
      const chartHeight = height - 28;

      // A. Render TradingView OrderLine Primitive Annotations (Horizontal Entry Line + Execution Node + Expiry Marker)
      if (assetActiveTrades.length > 0) {
        const now = Date.now();
        for (const trade of assetActiveTrades) {
          const coords = tradeCoords[trade.id];
          if (!coords) continue;
          const orderState = computeOrderLineState(trade, currentPrice, now, asset.pipDecimals);
          const { y, entryX, liveX } = coords;

          // Reinforced Horizontal OrderLine across the chart canvas at the exact entry price Y coordinate
          if (y >= 10 && y <= chartHeight) {
            ctx.save();
            ctx.strokeStyle = orderState.lineColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width - 68, y);
            ctx.stroke();
            ctx.restore();
          }

          // Entry vertical dashed line & glowing execution dot
          const nodeX = entryX ?? liveX ?? width - 160;
          if (nodeX >= 10 && nodeX <= width - 70) {
            ctx.save();
            ctx.strokeStyle = orderState.isInTheMoney
              ? 'rgba(0, 230, 118, 0.35)'
              : 'rgba(255, 51, 75, 0.35)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(nodeX, 12);
            ctx.lineTo(nodeX, chartHeight);
            ctx.stroke();

            // Outer glow ring at execution coordinate
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(nodeX, y, 8, 0, Math.PI * 2);
            ctx.fillStyle = orderState.isInTheMoney
              ? 'rgba(0, 230, 118, 0.25)'
              : 'rgba(255, 51, 75, 0.25)';
            ctx.fill();

            // Inner solid entry point dot
            ctx.beginPath();
            ctx.arc(nodeX, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = orderState.lineColor;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
            ctx.restore();
          }

          // Expiration vertical line ("End of trade") ahead of live candle
          const expX = Math.min(width - 78, (liveX ?? width - 140) + 52);
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 136, 0, 0.45)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(expX, 12);
          ctx.lineTo(expX, chartHeight);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#ff8800';
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`EXP ${orderState.formattedTimer}`, expX, 20);
          ctx.restore();
        }
      }

      // B. Render User Technical Drawings (Trendline, Horizontal S/R, Fibonacci, Channels, etc.)
      const allDrawings = [...drawings, ...(draftDrawing ? [draftDrawing] : [])];
      for (const d of allDrawings) {
        renderDrawingOnCanvas(
          ctx,
          d,
          width,
          height,
          chartHeight,
          minPrice,
          maxPrice,
          asset.pipDecimals,
          d.id === selectedDrawingId
        );
      }

      // C. Render RSI / MACD Compact Sub-Pane Overlay above the bottom floating toolbar
      let bottomCursor = height - 54;
      if (indicators?.showRsi && bars.length > 15) {
        const rsiH = 48;
        const rsiTop = bottomCursor - rsiH;
        bottomCursor = rsiTop - 4;

        ctx.save();
        ctx.fillStyle = 'rgba(11, 14, 20, 0.92)';
        ctx.fillRect(0, rsiTop, width - 65, rsiH);
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
        ctx.strokeRect(0, rsiTop, width - 65, rsiH);

        // Overbought 70 & Oversold 30 lines
        ctx.strokeStyle = 'rgba(255, 51, 75, 0.35)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, rsiTop + rsiH * 0.3);
        ctx.lineTo(width - 65, rsiTop + rsiH * 0.3);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 230, 118, 0.35)';
        ctx.beginPath();
        ctx.moveTo(0, rsiTop + rsiH * 0.7);
        ctx.lineTo(width - 65, rsiTop + rsiH * 0.7);
        ctx.stroke();
        ctx.setLineDash([]);

        const slice = bars.slice(-80).map((b) => ({
          time: (b.time as number) * 1000,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: 100,
        }));
        const rsiVals = calculateRSI(slice, indicators.rsiPeriod || 14);
        ctx.strokeStyle = indicators.rsiColor || '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        const plotW = width - 75;
        rsiVals.forEach((v, idx) => {
          if (v !== null) {
            const x = 8 + (idx / Math.max(1, rsiVals.length - 1)) * plotW;
            const y = rsiTop + rsiH - (v / 100) * rsiH;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();

        const lastRsi = rsiVals[rsiVals.length - 1];
        ctx.fillStyle = indicators.rsiColor || '#00e5ff';
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
          `RSI (${indicators.rsiPeriod || 14}): ${lastRsi !== null && lastRsi !== undefined ? lastRsi.toFixed(1) : '--'}`,
          10,
          rsiTop + 13
        );
        ctx.restore();
      }

      if (indicators?.showMacd && bars.length > 26) {
        const macdH = 54;
        const macdTop = bottomCursor - macdH;

        ctx.save();
        ctx.fillStyle = 'rgba(11, 14, 20, 0.92)';
        ctx.fillRect(0, macdTop, width - 65, macdH);
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
        ctx.strokeRect(0, macdTop, width - 65, macdH);

        const slice = bars.slice(-80).map((b) => ({
          time: (b.time as number) * 1000,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: 100,
        }));
        const macdRes = calculateMACD(
          slice,
          indicators.macdFast || 12,
          indicators.macdSlow || 26,
          indicators.macdSignal || 9
        );
        const zeroY = macdTop + macdH / 2;
        const mags = [
          ...macdRes.macd.filter((v): v is number => v !== null).map((v) => Math.abs(v)),
          ...macdRes.signal.filter((v): v is number => v !== null).map((v) => Math.abs(v)),
        ];
        const maxAbs = Math.max(1e-5, ...mags);
        const scale = (macdH * 0.4) / maxAbs;
        const plotW = width - 75;

        macdRes.histogram.forEach((h, idx) => {
          if (h !== null) {
            const x = 8 + (idx / Math.max(1, slice.length - 1)) * plotW;
            const barH = h * scale;
            ctx.fillStyle = h >= 0 ? 'rgba(0, 230, 118, 0.65)' : 'rgba(255, 51, 75, 0.65)';
            ctx.fillRect(x - 1.5, zeroY - barH, 3, barH);
          }
        });

        ctx.strokeStyle = indicators.macdColor || '#2962ff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let s1 = false;
        macdRes.macd.forEach((v, idx) => {
          if (v !== null) {
            const x = 8 + (idx / Math.max(1, slice.length - 1)) * plotW;
            const y = zeroY - v * scale;
            if (!s1) {
              ctx.moveTo(x, y);
              s1 = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
          `MACD (${indicators.macdFast || 12},${indicators.macdSlow || 26},${indicators.macdSignal || 9})`,
          10,
          macdTop + 13
        );
        ctx.restore();
      }

      ctx.restore();
    });
  }, [
    assetActiveTrades,
    tradeCoords,
    currentPrice,
    drawings,
    draftDrawing,
    selectedDrawingId,
    indicators?.showRsi,
    indicators?.rsiPeriod,
    indicators?.rsiColor,
    indicators?.showMacd,
    indicators?.macdFast,
    indicators?.macdSlow,
    indicators?.macdSignal,
    asset.pipDecimals,
  ]);

  // 8. Interactive Mouse & Touch Handlers for Drawing Tools Overlay
  const getRelativePoint = (clientX: number, clientY: number) => {
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerStart = (clientX: number, clientY: number) => {
    const pt = getRelativePoint(clientX, clientY);
    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 460;

    if (activeDrawingTool !== 'none') {
      const initial = createInitialDrawing(
        activeDrawingTool,
        pt.x,
        pt.y,
        drawingColor,
        drawingWidth,
        drawingLineStyle
      );
      setDraftDrawing(initial);
      onSelectDrawing?.(null);
      return true;
    }

    const selectedObj = drawings.find((d) => d.id === selectedDrawingId);
    if (selectedObj) {
      const handle = findHitDrawingHandle(pt.x, pt.y, selectedObj, 14);
      if (handle) {
        draggingDrawingRef.current = {
          id: selectedObj.id,
          mode: handle,
          lastX: pt.x,
          lastY: pt.y,
          drawing: selectedObj,
        };
        return true;
      }
    }

    const hit = findHitDrawing(pt.x, pt.y, drawings, width, height, 12);
    if (hit) {
      onSelectDrawing?.(hit.id);
      draggingDrawingRef.current = {
        id: hit.id,
        mode: 'move',
        lastX: pt.x,
        lastY: pt.y,
        drawing: hit,
      };
      return true;
    }

    if (selectedDrawingId) {
      onSelectDrawing?.(null);
    }
    return false;
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    const pt = getRelativePoint(clientX, clientY);
    if (draftDrawing) {
      setDraftDrawing((prev) => (prev ? updateDrawingOnDrag(prev, pt.x, pt.y) : null));
      return;
    }
    if (draggingDrawingRef.current) {
      const state = draggingDrawingRef.current;
      const dx = pt.x - state.lastX;
      const dy = pt.y - state.lastY;
      const updated =
        state.mode === 'move'
          ? translateDrawing(state.drawing, dx, dy)
          : updateDrawingHandle(state.drawing, state.mode, pt.x, pt.y);
      draggingDrawingRef.current = {
        ...state,
        lastX: pt.x,
        lastY: pt.y,
        drawing: updated,
      };
      onUpdateDrawing?.(updated);
    }
  };

  const handlePointerEnd = () => {
    if (draftDrawing) {
      const finalized = finalizeDrawingObject(draftDrawing);
      onAddDrawing?.(finalized);
      onSelectDrawing?.(finalized.id);
      setDraftDrawing(null);
      onCompleteDrawingTool?.();
    }
    draggingDrawingRef.current = null;
  };

  const isOverlayInteractive = activeDrawingTool !== 'none' || Boolean(draftDrawing) || Boolean(draggingDrawingRef.current);

  return (
    <div
      data-testid="lightweight-chart-wrapper"
      data-tv-symbol={resolvedTvSymbol.tvSymbol}
      data-tv-exchange={resolvedTvSymbol.exchange}
      data-tv-category={resolvedTvSymbol.marketCategory}
      data-active-orderlines={assetActiveTrades.length}
      className="relative w-full h-full min-h-[280px] bg-[#0b0e14] overflow-hidden select-none touch-pan-y"
    >
      {/* Official TradingView Lightweight Charts Mount Container */}
      <div
        ref={containerRef}
        data-testid="tv-lightweight-chart-canvas"
        className="w-full h-full"
      />

      {/* Synchronized Hardware-Accelerated Canvas Overlay for Drawings, S/R, RSI/MACD & Trade OrderLines */}
      <canvas
        ref={overlayCanvasRef}
        data-testid="chart-technical-overlay-canvas"
        style={{
          pointerEvents: isOverlayInteractive || drawings.length > 0 ? 'auto' : 'none',
          touchAction: activeDrawingTool !== 'none' ? 'none' : 'pan-y',
        }}
        onMouseDown={(e) => {
          const captured = handlePointerStart(e.clientX, e.clientY);
          if (!captured && activeDrawingTool === 'none') {
            // Forward pointer interaction to underlying chart when clicking empty space
          }
        }}
        onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
        onMouseUp={handlePointerEnd}
        onMouseLeave={handlePointerEnd}
        onTouchStart={(e) => {
          if (e.touches.length === 1 && activeDrawingTool !== 'none') {
            e.preventDefault();
            handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 1 && (draftDrawing || draggingDrawingRef.current)) {
            e.preventDefault();
            handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={handlePointerEnd}
        className={`absolute inset-0 z-15 ${
          activeDrawingTool !== 'none' ? 'cursor-crosshair' : 'pointer-events-none'
        }`}
      />

      {/* Interactive TradingView OrderLine (`createOrderLine`) Overlays Pinned to Entry Price Lines */}
      {assetActiveTrades.length > 0 && (
        <div
          data-testid="chart-active-trade-overlays"
          className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
        >
          {(() => {
            const usedYs: number[] = [];
            const maxH = (containerRef.current?.clientHeight || 420) - 64;
            const now = Date.now();

            return assetActiveTrades.map((trade, index) => {
              const orderState = computeOrderLineState(
                trade,
                currentPrice,
                now,
                asset.pipDecimals
              );
              const evalStatus = evaluateLiveTradeOverlayStatus(trade, currentPrice, now);
              const rawY = tradeCoords[trade.id]?.y;
              let clampedY =
                typeof rawY === 'number'
                  ? Math.max(48, Math.min(maxH, rawY))
                  : 90 + index * 44;

              for (const prevY of usedYs) {
                if (Math.abs(clampedY - prevY) < 38) {
                  clampedY = Math.min(maxH, prevY + 40);
                }
              }
              usedYs.push(clampedY);

              return (
                <div
                  key={trade.id}
                  data-testid={`chart-trade-overlay-${trade.id}`}
                  data-orderline-id={trade.id}
                  data-orderline-direction={trade.direction}
                  data-orderline-status={orderState.isInTheMoney ? 'ITM' : 'OTM'}
                  data-orderline-color={orderState.lineColor}
                  data-orderline-price={trade.strikePrice.toFixed(asset.pipDecimals)}
                  style={{ transform: `translate3d(0, ${clampedY - 16}px, 0)` }}
                  className="absolute top-0 left-3 sm:left-4 right-16 flex items-center gap-2 transition-transform duration-100 will-change-transform"
                >
                  {/* TradingView OrderLine Tag Body (Direction | Amount | ITM/OTM Color Status | Expiration Timer) */}
                  <div
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-md border-2 font-mono text-[10.5px] sm:text-[11px] shadow-xl backdrop-blur-md shrink-0 ${
                      orderState.isInTheMoney
                        ? 'bg-[#052e16]/95 border-[#00e676] text-[#00e676] shadow-emerald-950/60'
                        : 'bg-[#3b0712]/95 border-[#ff334b] text-[#ff4d63] shadow-rose-950/60'
                    }`}
                  >
                    {/* Direction Badge (CALL / PUT) */}
                    <span
                      data-testid={`chart-trade-direction-${trade.id}`}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                        evalStatus.isCall
                          ? 'bg-[#00e676] text-slate-950'
                          : 'bg-[#ff334b] text-white'
                      }`}
                    >
                      {evalStatus.isCall ? (
                        <TrendingUp className="w-3 h-3 stroke-[3]" />
                      ) : (
                        <TrendingDown className="w-3 h-3 stroke-[3]" />
                      )}
                      <span>{trade.direction}</span>
                    </span>

                    {/* OrderLine Quantity / Amount & Entry Strike Price */}
                    <span
                      data-testid={`chart-trade-stake-${trade.id}`}
                      className="font-black text-white tabular-nums"
                    >
                      {orderState.formattedAmount}
                    </span>
                    <span
                      data-testid={`chart-trade-entry-price-${trade.id}`}
                      className="text-[10px] text-slate-300 hidden sm:inline tabular-nums"
                    >
                      @ {trade.strikePrice.toFixed(asset.pipDecimals)}
                    </span>

                    {/* Dynamic Color Status Indicator (Green ITM / Red OTM) */}
                    <span
                      data-testid={`chart-trade-itm-badge-${trade.id}`}
                      className={`px-1.5 py-0.2 rounded text-[10px] font-black uppercase tabular-nums ${
                        orderState.isInTheMoney
                          ? 'bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/50'
                          : 'bg-[#ff334b]/20 text-[#ff4d63] border border-[#ff334b]/50'
                      }`}
                    >
                      {orderState.isInTheMoney
                        ? `ITM ${orderState.formattedPnl}`
                        : `OTM ${orderState.formattedPnl}`}
                    </span>

                    {/* Expiration Timer + Locked Settlement Indicator */}
                    <span className="inline-flex items-center gap-1 pl-1.5 border-l border-white/15 font-black text-white tabular-nums">
                      <Clock className="w-3 h-3 text-[#ff8800]" />
                      <span data-testid={`chart-trade-timer-${trade.id}`}>
                        {orderState.formattedTimer}
                      </span>
                      <Lock
                        className="w-2.5 h-2.5 text-slate-300 ml-0.5"
                        aria-label="Trade locked until expiry"
                      />
                    </span>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};
