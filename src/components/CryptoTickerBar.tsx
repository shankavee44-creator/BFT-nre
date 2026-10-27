import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface TickerCryptoItem {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  decimals: number;
  flash?: 'up' | 'down';
}

const INITIAL_CRYPTO_PAIRS: TickerCryptoItem[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', price: 68482.50, change24h: 2.45, decimals: 2 },
  { symbol: 'ETH/USD', name: 'Ethereum', price: 2634.80, change24h: 1.82, decimals: 2 },
  { symbol: 'SOL/USD', name: 'Solana', price: 179.40, change24h: 4.15, decimals: 2 },
  { symbol: 'TRX/USD', name: 'TRON (TRC-20)', price: 0.1645, change24h: 3.10, decimals: 4 },
  { symbol: 'BNB/USD', name: 'BNB Chain', price: 592.30, change24h: 0.75, decimals: 2 },
  { symbol: 'XRP/USD', name: 'Ripple', price: 0.5482, change24h: -0.68, decimals: 4 },
  { symbol: 'DOGE/USD', name: 'Dogecoin', price: 0.1425, change24h: 5.20, decimals: 4 },
  { symbol: 'AVAX/USD', name: 'Avalanche', price: 28.65, change24h: 1.95, decimals: 2 },
];

interface CryptoTickerBarProps {
  onSelectPair?: (symbol: string) => void;
}

export const CryptoTickerBar: React.FC<CryptoTickerBarProps> = ({ onSelectPair }) => {
  const [pairs, setPairs] = useState<TickerCryptoItem[]>(INITIAL_CRYPTO_PAIRS);

  // Live price tick simulation loop
  useEffect(() => {
    const interval = setInterval(() => {
      setPairs((prevPairs) => {
        const randomIndex = Math.floor(Math.random() * prevPairs.length);
        const pair = prevPairs[randomIndex];
        const isUp = Math.random() > 0.48;
        const deltaPercent = (Math.random() * 0.002) + 0.0003;
        const delta = pair.price * deltaPercent * (isUp ? 1 : -1);
        const newPrice = Number((pair.price + delta).toFixed(pair.decimals));

        return prevPairs.map((p, idx) => {
          if (idx === randomIndex) {
            return {
              ...p,
              price: newPrice,
              change24h: Number((p.change24h + (isUp ? 0.02 : -0.02)).toFixed(2)),
              flash: isUp ? 'up' : 'down',
            };
          }
          return { ...p, flash: undefined };
        });
      });
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const marqueeItems = [...pairs, ...pairs];

  return (
    <div className="w-full bg-[#050a16] border-b border-slate-800/80 overflow-hidden py-1.5 flex items-center text-xs relative select-none">
      {/* Fixed Left Institutional Badge */}
      <div className="hidden sm:flex items-center gap-1.5 px-3 py-0.5 bg-[#091122] border-r border-slate-800 text-[10px] font-mono font-bold text-amber-400 z-10 shrink-0">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span>INSTITUTIONAL FEED</span>
      </div>

      {/* Scrolling Marquee Container */}
      <div className="relative flex-1 overflow-hidden">
        {/* Soft gradient edge masks */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#050a16] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#050a16] to-transparent z-10 pointer-events-none" />

        <div className="animate-marquee items-center gap-6 cursor-pointer">
          {marqueeItems.map((item, index) => {
            const isPositive = item.change24h >= 0;
            return (
              <div
                key={`${item.symbol}-${index}`}
                onClick={() => onSelectPair && onSelectPair(item.symbol)}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors hover:bg-slate-800/60 shrink-0 bg-[#0c1220] border border-slate-800/60 ${
                  item.flash === 'up'
                    ? 'ring-1 ring-emerald-500/60 bg-emerald-950/40'
                    : item.flash === 'down'
                    ? 'ring-1 ring-rose-500/60 bg-rose-950/40'
                    : ''
                }`}
                title={`Click to trade ${item.symbol} on Terminal`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-100 text-xs">{item.symbol}</span>
                  <span className="text-[10px] text-slate-400 font-sans hidden md:inline">
                    {item.name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-bold text-xs transition-colors ${
                      item.flash === 'up'
                        ? 'text-emerald-400 text-glow-mint'
                        : item.flash === 'down'
                        ? 'text-rose-400 text-glow-red'
                        : 'text-white'
                    }`}
                  >
                    ${item.price.toFixed(item.decimals)}
                  </span>

                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                      isPositive
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )}
                    {isPositive ? '+' : ''}
                    {item.change24h}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
