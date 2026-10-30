import React, { useEffect, useRef, memo } from 'react';
import { resolveTradingViewSymbol } from '../utils/tradingViewOrderLineEngine';

interface TradingViewWidgetProps {
  symbol: string; // e.g. 'EUR/USD (OTC)', 'BTC/USDT (OTC)', 'AAPL (OTC)', 'XAU/USD (OTC)'
  timeframe: string; // '5s', '15s', '30s', '1m', '5m', '15m', '1h', '4h', '1D'
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

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = memo(({ symbol, timeframe }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resolved = resolveTradingViewSymbol(symbol);

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
      hide_top_toolbar: true,
      hide_legend: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      toolbar_bg: '#0b0e14',
      withdateranges: false,
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
  }, [resolved.tvSymbol, timeframe]);

  return (
    <div
      data-testid="tradingview-widget-embed"
      data-tv-symbol={resolved.tvSymbol}
      className="w-full h-full relative overflow-hidden rounded-xl bg-[#0b0e14]"
      style={{
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        willChange: 'transform',
      }}
    >
      <div ref={containerRef} className="tradingview-widget-container w-full h-full" style={{ minHeight: '390px' }} />
    </div>
  );
});

