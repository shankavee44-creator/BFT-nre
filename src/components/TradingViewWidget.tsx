import React, { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
  symbol: string; // e.g. 'EUR/USD', 'BTC/USD', 'ETH/USD'
  timeframe: string; // '1', '5', '15', '60', '240', 'D'
}

function getTradingViewSymbol(bftSymbol: string): string {
  switch (bftSymbol) {
    case 'EUR/USD':
      return 'FX:EURUSD';
    case 'BTC/USD':
      return 'BINANCE:BTCUSDT';
    case 'GBP/USD':
      return 'FX:GBPUSD';
    case 'ETH/USD':
      return 'BINANCE:ETHUSDT';
    case 'USD/JPY':
      return 'FX:USDJPY';
    case 'XAU/USD':
      return 'OANDA:XAUUSD';
    default:
      return 'FX:EURUSD';
  }
}

function mapTimeframeToTv(tf: string): string {
  switch (tf) {
    case '1s':
    case '5s':
    case '15s':
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
    default:
      return '1';
  }
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = memo(({ symbol, timeframe }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous contents
    containerRef.current.innerHTML = '';

    const tvSymbol = getTradingViewSymbol(symbol);
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
      backgroundColor: '#050914',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      toolbar_bg: '#080d1a',
      withdateranges: true,
      allow_symbol_change: false,
      details: true,
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
  }, [symbol, timeframe]);

  return (
    <div
      className="w-full h-full relative overflow-hidden rounded-xl bg-[#050914]"
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
