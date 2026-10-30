import React, { useEffect, useRef, useState, useMemo } from 'react';
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
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import type { AssetInfo, BinaryTrade, Candle } from '../types';
import { normalizeAssetSymbol } from '../utils/storage';
import {
  calculateHeikinAshi,
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  type IndicatorSettings,
} from '../utils/technicalIndicators';

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
}

interface FormattedBar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

function formatCountdown(secondsLeft: number): string {
  const s = Math.max(0, Math.ceil(secondsLeft));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<any> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<any> | null>(null);
  const tradeLinesRef = useRef<Map<string, IPriceLine>>(new Map());

  const prevDatasetKeyRef = useRef<string>('');
  const prevBarsLenRef = useRef<number>(0);
  const [, setNowTick] = useState<number>(() => Date.now());
  const [tradeYCoords, setTradeYCoords] = useState<Record<string, number>>({});

  // Filter active open trades belonging to the currently selected asset
  const assetActiveTrades = useMemo(() => {
    const targetSym = normalizeAssetSymbol(asset.symbol);
    return activeTrades.filter(
      (t) => t.status === 'active' && normalizeAssetSymbol(t.asset) === targetSym
    );
  }, [activeTrades, asset.symbol]);

  // 250ms ticker to keep countdown timers and Y-coordinate badges responsive
  useEffect(() => {
    if (assetActiveTrades.length === 0) return;
    const timer = setInterval(() => {
      setNowTick(Date.now());
      if (mainSeriesRef.current && assetActiveTrades.length > 0) {
        const nextCoords: Record<string, number> = {};
        for (const t of assetActiveTrades) {
          try {
            const coord = mainSeriesRef.current.priceToCoordinate(t.strikePrice);
            if (typeof coord === 'number' && !Number.isNaN(coord)) {
              nextCoords[t.id] = coord;
            }
          } catch {
            // ignore
          }
        }
        setTradeYCoords((prev) => {
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(nextCoords);
          if (
            prevKeys.length === nextKeys.length &&
            nextKeys.every((k) => Math.abs((prev[k] ?? -9999) - nextCoords[k]) < 0.5)
          ) {
            return prev;
          }
          return nextCoords;
        });
      }
    }, 250);
    return () => clearInterval(timer);
  }, [assetActiveTrades]);

  // 1. Initialize TradingView Lightweight Chart instance once
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
          bottom: 0.14,
        },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.6)',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 8,
        barSpacing: 9,
        minBarSpacing: 3,
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
      tradeLinesRef.current.clear();
      mainSeriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  // 2. Recreate Main Series when chartType changes (`candles`, `heikin-ashi`, `line`, `bars`)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Clean up existing series
    if (mainSeriesRef.current) {
      try {
        chart.removeSeries(mainSeriesRef.current);
      } catch {
        // ignore
      }
      mainSeriesRef.current = null;
      tradeLinesRef.current.clear();
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
    prevDatasetKeyRef.current = ''; // Force full setData on next effect

    // Subscribe crosshair move for OHLC bar
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

  // 4. Update PriceFormat & Candle Data when Asset, Timeframe, or Live Ticks change
  useEffect(() => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

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

    const datasetKey = `${asset.symbol}:${timeframe}:${chartType}`;
    const isNewDataset = prevDatasetKeyRef.current !== datasetKey;

    if (isNewDataset || Math.abs(bars.length - prevBarsLenRef.current) > 3) {
      if (chartType === 'line') {
        series.setData(bars.map((b) => ({ time: b.time, value: b.close })));
      } else {
        series.setData(bars);
      }
      prevDatasetKeyRef.current = datasetKey;
      prevBarsLenRef.current = bars.length;
      chart.timeScale().scrollToRealTime();
    } else {
      // Incremental live tick update on the last 1-2 bars for 60fps smoothness
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
        // Fallback to full setData if out-of-order timestamp occurred
        if (chartType === 'line') {
          series.setData(bars.map((b) => ({ time: b.time, value: b.close })));
        } else {
          series.setData(bars);
        }
        prevBarsLenRef.current = bars.length;
      }
    }
  }, [asset.symbol, asset.pipDecimals, candles, currentPrice, timeframe, chartType]);

  // 5. Optional Technical Indicator Overlays (SMA, EMA, Bollinger Bands)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

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

    if (!indicators) {
      removeIfPresent(smaSeriesRef);
      removeIfPresent(emaSeriesRef);
      removeIfPresent(bbUpperRef);
      removeIfPresent(bbLowerRef);
      return;
    }

    const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
    if (bars.length === 0) return;

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
          color: '#38bdf8',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }
      const smaVals = calculateSMA(rawCandles, indicators.smaPeriod || 20);
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
          color: '#f59e0b',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }
      const emaVals = calculateEMA(rawCandles, indicators.emaPeriod || 14);
      const emaData = bars
        .map((b, idx) => (emaVals[idx] !== null ? { time: b.time, value: emaVals[idx]! } : null))
        .filter(Boolean) as Array<{ time: UTCTimestamp; value: number }>;
      emaSeriesRef.current.setData(emaData);
    } else {
      removeIfPresent(emaSeriesRef);
    }

    // Bollinger Bands
    if (indicators.showBollinger) {
      if (!bbUpperRef.current) {
        bbUpperRef.current = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.75)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }
      if (!bbLowerRef.current) {
        bbLowerRef.current = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.75)',
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
  }, [
    indicators?.showSma,
    indicators?.smaPeriod,
    indicators?.showEma,
    indicators?.emaPeriod,
    indicators?.showBollinger,
    indicators?.bollingerPeriod,
    indicators?.bollingerStd,
    candles,
    chartType,
    asset.pipDecimals,
  ]);

  // 6. Synchronize Visual Trade Overlays (Horizontal Price Lines on TradingView Chart)
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;

    const existingMap = tradeLinesRef.current;
    const activeIds = new Set(assetActiveTrades.map((t) => t.id));

    // Remove expired or other-asset price lines
    for (const [id, lineObj] of existingMap.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(lineObj);
        } catch {
          // ignore
        }
        existingMap.delete(id);
      }
    }

    const now = Date.now();
    const nextCoords: Record<string, number> = {};

    // Create or update horizontal trade lines for active trades on this asset
    for (const trade of assetActiveTrades) {
      const isCall = trade.direction === 'CALL';
      const priceDiff = currentPrice - trade.strikePrice;
      const isTie = Math.abs(priceDiff) < 1e-7;
      const isWinning = isTie
        ? isCall // At exact entry tick, color Higher Green and Lower Red
        : (isCall && priceDiff > 0) || (!isCall && priceDiff < 0);

      const lineColor = isWinning ? '#00e676' : '#ff334b';
      const secondsLeft = Math.max(0, Math.ceil((trade.endTime - now) / 1000));
      const dirLabel = isCall ? '▲ HIGHER' : '▼ LOWER';
      const statusTag = isTie ? 'ENTRY' : isWinning ? 'ITM' : 'OTM';
      const title = `${dirLabel} $${trade.investment} • ${formatCountdown(secondsLeft)} (${statusTag})`;

      const existingLine = existingMap.get(trade.id);
      if (existingLine) {
        try {
          existingLine.applyOptions({
            price: trade.strikePrice,
            color: lineColor,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title,
          });
        } catch {
          // ignore
        }
      } else {
        try {
          const newLine = series.createPriceLine({
            price: trade.strikePrice,
            color: lineColor,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title,
          });
          existingMap.set(trade.id, newLine);
        } catch {
          // ignore
        }
      }

      try {
        const coord = series.priceToCoordinate(trade.strikePrice);
        if (typeof coord === 'number' && !Number.isNaN(coord)) {
          nextCoords[trade.id] = coord;
        }
      } catch {
        // ignore
      }
    }

    setTradeYCoords((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(nextCoords);
      if (
        prevKeys.length === nextKeys.length &&
        nextKeys.every((k) => Math.abs((prev[k] ?? -9999) - nextCoords[k]) < 0.5)
      ) {
        return prev;
      }
      return nextCoords;
    });
  }, [assetActiveTrades, currentPrice, chartType]);

  return (
    <div
      data-testid="lightweight-chart-wrapper"
      className="relative w-full h-full min-h-[280px] bg-[#0b0e14] overflow-hidden select-none"
    >
      {/* Official TradingView Lightweight Charts Mount Container */}
      <div
        ref={containerRef}
        data-testid="tv-lightweight-chart-canvas"
        className="w-full h-full"
      />

      {/* High-Visibility Visual Trade Overlays Pinned to Entry Price Lines */}
      {assetActiveTrades.length > 0 && (
        <div
          data-testid="chart-active-trade-overlays"
          className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
        >
          {(() => {
            const usedYs: number[] = [];
            const maxH = (containerRef.current?.clientHeight || 420) - 64;
            return assetActiveTrades.map((trade, index) => {
              const isCall = trade.direction === 'CALL';
              const priceDiff = currentPrice - trade.strikePrice;
              const isTie = Math.abs(priceDiff) < 1e-7;
              const isWinning = isTie
                ? isCall
                : (isCall && priceDiff > 0) || (!isCall && priceDiff < 0);

              const secondsLeft = Math.max(0, Math.ceil((trade.endTime - Date.now()) / 1000));
              const rawY = tradeYCoords[trade.id];
              let clampedY =
                typeof rawY === 'number'
                  ? Math.max(48, Math.min(maxH, rawY))
                  : 90 + index * 44;

              // Prevent vertical overlap when multiple trades are placed at nearby strike prices
              for (const prevY of usedYs) {
                if (Math.abs(clampedY - prevY) < 38) {
                  clampedY = Math.min(maxH, prevY + 40);
                }
              }
              usedYs.push(clampedY);

              const profitAmount = ((trade.investment * trade.payoutPercentage) / 100).toFixed(2);

              return (
                <div
                  key={trade.id}
                  data-testid={`chart-trade-overlay-${trade.id}`}
                  style={{ top: `${clampedY - 16}px` }}
                  className="absolute left-3 sm:left-4 flex items-center gap-2 transition-all duration-150"
                >
                <div
                  className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border font-mono text-[11px] shadow-xl backdrop-blur-md ${
                    isWinning
                      ? 'bg-[#052e16]/95 border-[#00e676] text-[#00e676] shadow-emerald-950/50'
                      : 'bg-[#3b0712]/95 border-[#ff334b] text-[#ff4d63] shadow-rose-950/50'
                  }`}
                >
                  {/* Direction Icon & Label */}
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                      isCall
                        ? 'bg-[#00e676] text-slate-950'
                        : 'bg-[#ff334b] text-white'
                    }`}
                  >
                    {isCall ? (
                      <TrendingUp className="w-3 h-3 stroke-[3]" />
                    ) : (
                      <TrendingDown className="w-3 h-3 stroke-[3]" />
                    )}
                    <span>{isCall ? 'HIGHER' : 'LOWER'}</span>
                  </span>

                  {/* Entry Stake & Strike Price */}
                  <span className="font-black text-white">
                    ${trade.investment.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-300 hidden sm:inline">
                    @ {trade.strikePrice.toFixed(asset.pipDecimals)}
                  </span>

                  {/* Live ITM / OTM Dynamic Status */}
                  <span
                    data-testid={`chart-trade-itm-badge-${trade.id}`}
                    className={`px-1.5 py-0.2 rounded text-[10px] font-black uppercase ${
                      isWinning
                        ? 'bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/50'
                        : 'bg-[#ff334b]/20 text-[#ff4d63] border border-[#ff334b]/50'
                    }`}
                  >
                    {isWinning ? `ITM +$${profitAmount}` : `OTM -$${trade.investment.toFixed(2)}`}
                  </span>

                  {/* Live Countdown Timer */}
                  <span className="inline-flex items-center gap-1 pl-1.5 border-l border-white/15 font-black text-white">
                    <Clock className="w-3 h-3 text-[#ff8800]" />
                    <span data-testid={`chart-trade-timer-${trade.id}`}>
                      {formatCountdown(secondsLeft)}
                    </span>
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
