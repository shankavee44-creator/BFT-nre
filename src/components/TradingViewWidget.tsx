import React, { useEffect, useRef, memo, useMemo, useState } from 'react';
import { resolveTradingViewSymbol, computeOrderLineState } from '../utils/tradingViewOrderLineEngine';
import type { AssetInfo, BinaryTrade, Candle } from '../types';
import { normalizeAssetSymbol } from '../utils/storage';
import { TradeBadge } from './TradeBadge';

interface TradingViewWidgetProps {
  asset: AssetInfo;
  candles: Candle[];
  currentPrice: number;
  timeframe: string;
  activeTrades: BinaryTrade[];
}

function mapTimeframeToTv(tf: string): string {
  switch (tf) {
    case '1s':
    case '5s':
    case '15s':
    case '30s':
    case '1m':
      return '1';
    case '5m':
      return '5';
    case '15m':
      return '15';
    case '1h':
      return '60';
    case '4h':
      return '240';
    case '1D':
    case 'D':
      return 'D';
    default:
      return '1';
  }
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = memo(({
  asset,
  candles,
  currentPrice,
  timeframe,
  activeTrades,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const resolved = resolveTradingViewSymbol(asset.symbol, asset.category);

  // Filter active trades for this specific asset
  const assetActiveTrades = useMemo(() => {
    const targetSym = normalizeAssetSymbol(asset.symbol);
    return activeTrades.filter(
      (t) => t.status === 'active' && normalizeAssetSymbol(t.asset) === targetSym
    );
  }, [activeTrades, asset.symbol]);

  // Initialize TradingView widget ONLY ONCE per symbol change (isolated dependency array)
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous contents
    containerRef.current.innerHTML = '';

    const tvSymbol = resolved.tvSymbol;
    const interval = mapTimeframeToTv(timeframe);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: interval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      backgroundColor: '#0b0e14',
      gridColor: 'rgba(30, 41, 59, 0.45)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      toolbar_bg: '#0b0e14',
      withdateranges: true,
      allow_symbol_change: false,
      details: false,
      hotlist: false,
    });

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';

    containerRef.current.appendChild(widgetContainer);
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [resolved.tvSymbol]);

  // Dynamic high-performance overlay coordinate calculation
  const [containerHeight, setContainerHeight] = useState<number>(550);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const updateHeight = () => {
      if (wrapperRef.current) {
        setContainerHeight(wrapperRef.current.clientHeight || 550);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const maxPrice = candles.length > 0 ? Math.max(...candles.map((c) => c.high), currentPrice) : currentPrice * 1.01;
  const minPrice = candles.length > 0 ? Math.min(...candles.map((c) => c.low), currentPrice) : currentPrice * 0.99;
  const priceRange = maxPrice - minPrice || 1;

  return (
    <div
      ref={wrapperRef}
      data-testid="tradingview-widget-embed"
      data-tv-symbol={resolved.tvSymbol}
      className="w-full h-full relative overflow-hidden rounded-xl bg-[#0b0e14]"
      style={{
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        willChange: 'transform',
      }}
    >
      <div ref={containerRef} className="tradingview-widget-container w-full h-full" style={{ minHeight: '420px' }} />

      {/* Custom HTML/DOM trade execution container overlay (Quotex-style entry line, countdown timer, dynamic Green/Red live PnL badge) */}
      {assetActiveTrades.map((trade) => {
        const orderState = computeOrderLineState(trade, currentPrice, Date.now(), asset.pipDecimals);
        const normalizedPrice = (trade.strikePrice - minPrice) / priceRange;
        const clampedNorm = Math.max(0.05, Math.min(0.95, normalizedPrice));
        const lineY = containerHeight - (clampedNorm * (containerHeight - 100) + 50);

        return (
          <React.Fragment key={trade.id}>
            {/* Clean minimal horizontal dashed entry line at exact entry price coordinate */}
            <div
              className="absolute left-0 border-b border-dashed pointer-events-none z-30 transition-all duration-75"
              style={{
                top: `${lineY}px`,
                right: '75px',
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
              left={120}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
});
