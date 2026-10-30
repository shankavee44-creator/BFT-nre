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
  type IndicatorSettings,
} from '../utils/technicalIndicators';
import {
  type DrawingToolId,
  type DrawingLineStyle,
  type ChartDrawingObject,
  renderDrawingOnCanvas,
} from '../utils/drawingToolsEngine';
import {
  resolveTradingViewSymbol,
  computeOrderLineState,
} from '../utils/tradingViewOrderLineEngine';
import { TradeBadge } from './TradeBadge';

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

function prepareLightweightBars(
  candles: Candle[],
  chartType: 'candles' | 'heikin-ashi' | 'line' | 'bars',
  decimals: number
): FormattedBar[] {
  if (!candles || candles.length === 0) return [];
  const source = chartType === 'heikin-ashi' ? calculateHeikinAshi(candles) : candles;
  const bySec = new Map<number, FormattedBar>();
  for (const c of source) {
    if (!c || typeof c.time !== 'number' || Number.isNaN(c.open)) continue;
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

export const LightweightTradingChart = React.memo(
  ({
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
  }: LightweightTradingChartProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const smaSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const emaSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const bbUpperRef = useRef<ISeriesApi<any> | null>(null);
    const bbLowerRef = useRef<ISeriesApi<any> | null>(null);
    const srLinesRef = useRef<IPriceLine[]>([]);
    const fibLinesRef = useRef<IPriceLine[]>([]);
    
    const [tradeCoords, setTradeCoords] = useState<Record<string, { y: number; entryX: number | null; liveX: number | null }>>({});

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
        const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
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
            const yCoord = series.priceToCoordinate(t.strikePrice);
            if (typeof yCoord === 'number' && !Number.isNaN(yCoord)) {
                let entryX: number | null = null;
                if (bars.length > 0) {
                  const entrySec = Math.floor(t.startTime / 1000);
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
        }
        setTradeCoords(nextCoords);
    }, [assetActiveTrades, candles, chartType, asset.pipDecimals]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const chart = createChart(container, {
            width: container.clientWidth || 800,
            height: container.clientHeight || 460,
            layout: { background: { type: ColorType.Solid, color: '#0b0e14' }, textColor: '#94a3b8' },
            grid: {
              vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
              horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
            },
            timeScale: { timeVisible: true, secondsVisible: true, borderColor: 'rgba(255, 255, 255, 0.1)' },
            rightPriceScale: {
              visible: true,
              borderColor: 'rgba(255, 255, 255, 0.1)',
              scaleMargins: { top: 0.1, bottom: 0.1 },
            },
        });
        chartRef.current = chart;
        
        let series: ISeriesApi<any>;
        const seriesOptions = {
          upColor: '#00e676',
          downColor: '#ff334b',
          priceLineVisible: true,
          lastValueVisible: true,
          priceLineWidth: 1,
          priceLineColor: '#2b70ff',
          priceLineStyle: LineStyle.Dashed,
        };

        if (chartType === 'line') {
          series = chart.addSeries(AreaSeries, { ...seriesOptions, lineColor: '#00e676' });
        } else if (chartType === 'bars') {
          series = chart.addSeries(BarSeries, seriesOptions);
        } else {
          series = chart.addSeries(CandlestickSeries, seriesOptions);
        }
        mainSeriesRef.current = series;

        const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
        if (bars.length > 0) {
          if (chartType === 'line') {
            series.setData(bars.map(b => ({ time: b.time, value: b.close })));
          } else {
            series.setData(bars);
          }
        }

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
          chart.remove();
        };
    }, [chartType, asset.pipDecimals]);

    // Update chart data when candles change
    useEffect(() => {
      const series = mainSeriesRef.current;
      if (!series) return;
      const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
      if (bars.length > 0) {
        if (chartType === 'line') {
          series.setData(bars.map(b => ({ time: b.time, value: b.close })));
        } else {
          series.setData(bars);
        }
      }
      computeTradeCoordinates();
    }, [candles, chartType, asset.pipDecimals, computeTradeCoordinates]);

    // 250ms ticker to keep coordinates updated
    useEffect(() => {
      if (assetActiveTrades.length === 0) return;
      computeTradeCoordinates();
      const timer = setInterval(computeTradeCoordinates, 250);
      return () => clearInterval(timer);
    }, [assetActiveTrades, computeTradeCoordinates]);

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none">
            {assetActiveTrades.map((trade) => {
                const coords = tradeCoords[trade.id];
                if (!coords) return null;
                const orderState = computeOrderLineState(trade, currentPrice, Date.now(), asset.pipDecimals);
                const lineY = coords.y;
                const badgeX = coords.entryX || coords.liveX || 120;

                return (
                    <React.Fragment key={trade.id}>
                        {/* Clean minimal horizontal dashed entry line at exact entry price coordinate, ending before right price scale */}
                        <div
                          className="absolute left-0 border-b border-dashed pointer-events-none z-10 transition-all duration-75"
                          style={{
                            top: `${lineY}px`,
                            right: '65px',
                            borderColor: orderState.lineColor,
                            borderBottomWidth: '1.5px',
                          }}
                        />
                        {/* Compact trade pill badge */}
                        <TradeBadge
                            direction={trade.direction}
                            investment={trade.investment}
                            formattedTimer={orderState.formattedTimer}
                            formattedPnl={orderState.formattedPnl}
                            isInTheMoney={orderState.isInTheMoney}
                            top={lineY}
                            left={badgeX}
                        />
                    </React.Fragment>
                );
            })}
        </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.asset.symbol === nextProps.asset.symbol &&
      prevProps.timeframe === nextProps.timeframe &&
      prevProps.chartType === nextProps.chartType &&
      prevProps.zoomLevel === nextProps.zoomLevel &&
      prevProps.activeTrades.length === nextProps.activeTrades.length &&
      prevProps.candles.length === nextProps.candles.length &&
      prevProps.currentPrice === nextProps.currentPrice
    );
  }
);
