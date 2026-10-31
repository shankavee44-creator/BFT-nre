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
    const rawTime = Number(c.time);
    if (!rawTime || Number.isNaN(rawTime)) continue;
    const sec = rawTime > 1e11 ? Math.floor(rawTime / 1000) : Math.floor(rawTime);
    bySec.set(sec, {
      time: sec as UTCTimestamp,
      open: Number(Number(c.open).toFixed(decimals)),
      high: Number(Math.max(Number(c.open), Number(c.close), Number(c.high)).toFixed(decimals)),
      low: Number(Math.min(Number(c.open), Number(c.close), Number(c.low)).toFixed(decimals)),
      close: Number(Number(c.close).toFixed(decimals)),
    });
  }
  return Array.from(bySec.values()).sort((a, b) => (a.time as number) - (b.time as number));
}

function createSeriesForType(chart: IChartApi, type: 'candles' | 'heikin-ashi' | 'line' | 'bars'): ISeriesApi<any> {
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
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const lastLoadedSymbolRef = useRef<string>('');
  const lastLoadedTimeframeRef = useRef<string>('');
  const lastLoadedChartTypeRef = useRef<string>('');
  const barsCountRef = useRef<number>(0);

  const [badgeCoords, setBadgeCoords] = useState<Record<string, { y: number; x: number }>>({});
  const [resultBadgeCoords, setResultBadgeCoords] = useState<{ y: number; x: number } | null>(null);
  const [currentPriceY, setCurrentPriceY] = useState<number>(0);
  const [candleCountdown, setCandleCountdown] = useState<string>('00:30');
  const [now, setNow] = useState<number>(Date.now());
  const [isScrolledFromLive, setIsScrolledFromLive] = useState<boolean>(false);

  const assetActiveTrades = useMemo(() => {
    const targetSym = normalizeAssetSymbol(asset.symbol);
    return activeTrades.filter(
      (t) => t.status === 'active' && normalizeAssetSymbol(t.asset) === targetSym
    );
  }, [activeTrades, asset.symbol]);

  // Tick interval for live timers & PnL
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Candle expiry countdown calculation
  useEffect(() => {
    const tfSec = parseTimeframeSeconds(timeframe);
    const lastBar = candles.length > 0 ? candles[candles.length - 1] : null;
    if (!lastBar) return;

    const barStartTime = Number(lastBar.time) || Date.now();
    const barEndTime = barStartTime + tfSec * 1000;
    const remainingMs = Math.max(0, barEndTime - now);
    const remSec = Math.floor(remainingMs / 1000);
    const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
    const ss = String(remSec % 60).padStart(2, '0');
    setCandleCountdown(`${mm}:${ss}`);
  }, [candles, timeframe, now]);

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
      timeScale: {
        barSpacing: 12,
        minBarSpacing: 4,
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

    const series = createSeriesForType(chart, chartType);
    seriesRef.current = series;

    const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
    barsCountRef.current = bars.length;
    if (bars.length > 0) {
      if (chartType === 'line') {
        series.setData(bars.map((b: FormattedBar) => ({ time: b.time, value: b.close })));
      } else {
        series.setData(bars);
      }
      lastLoadedSymbolRef.current = asset.symbol;
      lastLoadedTimeframeRef.current = timeframe;
      lastLoadedChartTypeRef.current = chartType;
      chart.timeScale().fitContent();
    }

    const handleLogicalRangeChange = (logicalRange: { from: number; to: number } | null) => {
      if (!logicalRange || barsCountRef.current === 0) {
        setIsScrolledFromLive(false);
        return;
      }
      const lastBarIndex = barsCountRef.current - 1;
      if (logicalRange.to < lastBarIndex - 2) {
        setIsScrolledFromLive(true);
      } else {
        setIsScrolledFromLive(false);
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleLogicalRangeChange);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && chartRef.current) {
          try {
            chartRef.current.applyOptions({ width, height });
          } catch {
            // ignore
          }
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
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

  // 2. Stream Series Data using series.update on live ticks without touching timeScale
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
    barsCountRef.current = bars.length;
    if (bars.length === 0) return;

    const isSymbolChanged = lastLoadedSymbolRef.current !== asset.symbol;
    const isTimeframeChanged = lastLoadedTimeframeRef.current !== timeframe;
    const isChartTypeChanged = lastLoadedChartTypeRef.current !== chartType;
    const lastBar = bars[bars.length - 1];

    if (isChartTypeChanged || isSymbolChanged) {
      if (seriesRef.current) {
        try {
          chart.removeSeries(seriesRef.current);
        } catch {
          // ignore
        }
      }
      priceLinesRef.current.clear();
      const newSeries = createSeriesForType(chart, chartType);
      seriesRef.current = newSeries;
      
      lastLoadedSymbolRef.current = asset.symbol;
      lastLoadedTimeframeRef.current = timeframe;
      lastLoadedChartTypeRef.current = chartType;

      try {
        if (chartType === 'line') {
          newSeries.setData(bars.map((b: FormattedBar) => ({ time: b.time, value: b.close })));
        } else {
          newSeries.setData(bars);
        }
        chart.timeScale().fitContent();
      } catch {
        // ignore
      }
      return;
    }

    const series = seriesRef.current;
    if (!series) return;

    if (isTimeframeChanged) {
      lastLoadedTimeframeRef.current = timeframe;
      try {
        if (chartType === 'line') {
          series.setData(bars.map((b: FormattedBar) => ({ time: b.time, value: b.close })));
        } else {
          series.setData(bars);
        }
        chart.timeScale().fitContent();
      } catch {
        // ignore
      }
    } else if (lastBar) {
      try {
        if (chartType === 'line') {
          series.update({ time: lastBar.time, value: lastBar.close });
        } else {
          series.update(lastBar);
        }
      } catch {
        // Mismatch fallback
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
  }, [candles, chartType, timeframe, asset.pipDecimals, asset.symbol]);

  // 3. Native Canvas Trade Execution Lines (series.createPriceLine)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const currentLines = priceLinesRef.current;
    const activeIds = new Set(assetActiveTrades.map(t => t.id));

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
  }, [assetActiveTrades]);

  // Coordinate sync for floating PnL badge pills & live moving price tag
  const updateCoordinates = useCallback(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const series = seriesRef.current;
    const timeScale = chartRef.current.timeScale();
    const bars = prepareLightweightBars(candles, chartType, asset.pipDecimals);
    const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;

    let defaultX = 180;
    if (lastBar) {
      try {
        const cx = timeScale.timeToCoordinate(lastBar.time);
        if (typeof cx === 'number' && !Number.isNaN(cx)) defaultX = cx;
      } catch {
        // ignore
      }
    }

    try {
      const py = series.priceToCoordinate(Number(currentPrice) || lastBar?.close || 0);
      if (typeof py === 'number' && !Number.isNaN(py)) {
        setCurrentPriceY(py);
      }
    } catch {
      // ignore
    }

    const nextCoords: Record<string, { y: number; x: number }> = {};
    for (const t of assetActiveTrades) {
      try {
        const strikePriceNum = Number(t.strikePrice) || 0;
        const y = series.priceToCoordinate(strikePriceNum);
        if (typeof y === 'number' && !Number.isNaN(y)) {
          nextCoords[t.id] = { y, x: defaultX };
        }
      } catch {
        // ignore
      }
    }
    setBadgeCoords(nextCoords);

    // Calculate coordinate for trade settlement result overlay badge
    if (tradeResultOverlay) {
      try {
        const closeP = Number(tradeResultOverlay.closePrice) || Number(tradeResultOverlay.strikePrice) || 0;
        const ry = series.priceToCoordinate(closeP);
        let rx = defaultX;
        const endTimeSec = Math.floor((tradeResultOverlay.endTime || Date.now()) / 1000) as UTCTimestamp;
        const cx = timeScale.timeToCoordinate(endTimeSec);
        if (typeof cx === 'number' && !Number.isNaN(cx)) {
          rx = cx;
        }
        if (typeof ry === 'number' && !Number.isNaN(ry)) {
          setResultBadgeCoords({ y: ry, x: rx });
        } else {
          setResultBadgeCoords(null);
        }
      } catch {
        setResultBadgeCoords(null);
      }
    } else {
      setResultBadgeCoords(null);
    }
  }, [assetActiveTrades, candles, chartType, asset.pipDecimals, currentPrice, tradeResultOverlay]);

  useEffect(() => {
    let animId: number;
    let lastTs = 0;
    const loop = (ts: number) => {
      if (ts - lastTs >= 30) {
        lastTs = ts;
        updateCoordinates();
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [updateCoordinates]);

  const handleGoToLive = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
      setIsScrolledFromLive(false);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none chart-container hw-accelerate"
      style={{
        background: "url('/1793209787676.jpg.jpeg') center/cover no-repeat",
        transform: 'translateZ(0)',
        touchAction: 'pan-y',
      }}
    >
      {/* Loading state indicator when data is empty or fetching */}
      {(!candles || candles.length === 0) && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0e14]/80 backdrop-blur-sm pointer-events-none select-none">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#111827]/90 border border-cyan-500/40 shadow-2xl">
            <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
            <span className="text-xs font-mono font-medium text-cyan-200 tracking-wide">
              Loading Chart Data...
            </span>
          </div>
        </div>
      )}

      {/* Live Moving Price Tag & Candle Countdown Timer pinned right below it on the price axis */}
      {currentPriceY > 0 && (
        <div
          className="absolute right-[60px] z-35 px-2 py-1 rounded bg-[#0b0e14] border border-cyan-500/70 shadow-2xl flex flex-col items-end font-mono text-[10px] select-none transition-all duration-75 pointer-events-none"
          style={{ top: `${currentPriceY - 14}px` }}
        >
          <span className="font-bold text-cyan-300 tabular-nums">
            {Number(currentPrice || 0).toFixed(asset.pipDecimals)}
          </span>
          <span className="text-[#00E676] font-bold text-[9.5px] tabular-nums flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-ping" />
            {candleCountdown}
          </span>
        </div>
      )}

      {/* Active Trades PnL Pill Badges */}
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
        const expiresAt = Number(trade.endTime) || (startTimeMs + durationSec * 1000);
        const remainingMs = Math.max(0, expiresAt - now);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
        const ss = String(remainingSeconds % 60).padStart(2, '0');
        const formattedTimer = `${mm}:${ss}`;
        const formattedPnl = livePnl >= 0 ? `+$${livePnl.toFixed(2)}` : `-$${Math.abs(livePnl).toFixed(2)}`;

        return (
          <TradeBadge
            key={trade.id}
            direction={trade.direction}
            investment={investmentNum}
            formattedTimer={formattedTimer}
            remainingSeconds={remainingSeconds}
            totalDuration={durationSec}
            formattedPnl={formattedPnl}
            isInTheMoney={isInTheMoney}
            top={coords.y}
            left={coords.x}
          />
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
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-mono text-xs font-black shadow-2xl border backdrop-blur-md animate-in fade-in zoom-in-90 slide-in-from-bottom-2 duration-300 ${
              tradeResultOverlay.isWin
                ? 'bg-[#00E676] text-slate-950 border-[#00E676] shadow-[0_4px_20px_rgba(0,230,118,0.55)]'
                : tradeResultOverlay.isTie
                ? 'bg-[#FFB300] text-slate-950 border-[#FFB300] shadow-[0_4px_20px_rgba(255,179,0,0.55)]'
                : 'bg-[#FF1744] text-white border-[#FF1744] shadow-[0_4px_20px_rgba(255,23,68,0.55)]'
            }`}
          >
            <span className="text-[11px]">
              {tradeResultOverlay.isWin ? '▲ WIN' : tradeResultOverlay.isTie ? '► TIE' : '▼ LOSS'}
            </span>
            <span className="tabular-nums">
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      )}
    </div>
  );
});

