import React, { useState, useEffect } from 'react';
import { CheckCircle2, ArrowUpRight } from 'lucide-react';

export interface LivePayoutNotification {
  id: string;
  traderName: string;
  flag: string;
  country: string;
  amount: number;
  method: string;
  timeAgo: string;
  highlight?: boolean;
}

const INITIAL_PAYOUT_NOTIFICATIONS: LivePayoutNotification[] = [
  { id: 'pay_01', traderName: 'Ahamed K.', flag: '🇦🇪', country: 'Dubai, UAE', amount: 450.00, method: 'USDT', timeAgo: 'Just now' },
  { id: 'pay_02', traderName: 'Kasun P.', flag: '🇱🇰', country: 'Sri Lanka', amount: 1250.00, method: 'USDT', timeAgo: '1m ago' },
  { id: 'pay_03', traderName: 'Rajesh S.', flag: '🇮🇳', country: 'India', amount: 680.00, method: 'USDT', timeAgo: '2m ago' },
  { id: 'pay_04', traderName: 'Zainab A.', flag: '🇵🇰', country: 'Pakistan', amount: 920.00, method: 'USDT', timeAgo: '3m ago' },
  { id: 'pay_05', traderName: 'Nurul H.', flag: '🇲🇾', country: 'Malaysia', amount: 540.00, method: 'USDT', timeAgo: '4m ago' },
  { id: 'pay_06', traderName: 'Tariq M.', flag: '🇦🇪', country: 'Dubai, UAE', amount: 1840.00, method: 'USDT', timeAgo: '5m ago' },
  { id: 'pay_07', traderName: 'Bilal R.', flag: '🇵🇰', country: 'Pakistan', amount: 760.00, method: 'USDT', timeAgo: '6m ago' },
  { id: 'pay_08', traderName: 'Faizal Z.', flag: '🇲🇾', country: 'Malaysia', amount: 1120.00, method: 'USDT', timeAgo: '8m ago' },
  { id: 'pay_09', traderName: 'Vikram P.', flag: '🇮🇳', country: 'India', amount: 1490.00, method: 'USDT', timeAgo: '9m ago' },
  { id: 'pay_10', traderName: 'Hamza Q.', flag: '🇵🇰', country: 'Pakistan', amount: 615.00, method: 'USDT', timeAgo: '11m ago' },
];

const STREAMING_POOL: Omit<LivePayoutNotification, 'id' | 'timeAgo' | 'highlight'>[] = [
  { traderName: 'Ahamed K.', flag: '🇦🇪', country: 'Dubai, UAE', amount: 450.00, method: 'USDT' },
  { traderName: 'Arjun M.', flag: '🇮🇳', country: 'India', amount: 810.00, method: 'USDT' },
  { traderName: 'Usman K.', flag: '🇵🇰', country: 'Pakistan', amount: 530.00, method: 'USDT' },
  { traderName: 'Syafiq R.', flag: '🇲🇾', country: 'Malaysia', amount: 975.00, method: 'USDT' },
  { traderName: 'Rashid K.', flag: '🇦🇪', country: 'Dubai, UAE', amount: 1620.00, method: 'USDT' },
  { traderName: 'Kasun P.', flag: '🇱🇰', country: 'Sri Lanka', amount: 1180.00, method: 'USDT' },
  { traderName: 'Ananya D.', flag: '🇮🇳', country: 'India', amount: 495.00, method: 'USDT' },
];

interface CryptoTickerBarProps {
  onSelectPair?: (symbol: string) => void;
}

export const CryptoTickerBar: React.FC<CryptoTickerBarProps> = () => {
  const [payouts, setPayouts] = useState<LivePayoutNotification[]>(INITIAL_PAYOUT_NOTIFICATIONS);

  // Real-time streaming payout notification ticker loop
  useEffect(() => {
    let poolIdx = 0;
    const interval = setInterval(() => {
      setPayouts((prev) => {
        const nextItem = STREAMING_POOL[poolIdx % STREAMING_POOL.length];
        poolIdx += 1;
        const targetIndex = Math.floor(Math.random() * prev.length);
        return prev.map((item, idx) => {
          if (idx === targetIndex) {
            return {
              ...item,
              traderName: nextItem.traderName,
              flag: nextItem.flag,
              country: nextItem.country,
              amount: nextItem.amount,
              method: nextItem.method,
              timeAgo: 'Just now',
              highlight: true,
            };
          }
          return { ...item, highlight: false };
        });
      });
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  const marqueeItems = [...payouts, ...payouts];

  return (
    <div
      data-testid="institutional-payout-ticker"
      className="w-full bg-[#0a0a0a] border-b border-white/10 overflow-hidden py-1.5 flex items-center text-xs relative select-none"
    >
      {/* Fixed Left Institutional Payout Feed Badge */}
      <div className="hidden sm:flex items-center gap-1.5 px-3 py-0.5 bg-[#121215] border-r border-white/10 text-[10px] font-mono font-bold text-[#ff8800] z-10 shrink-0">
        <span className="w-2 h-2 rounded-full bg-[#00c853] shrink-0" />
        <span>LIVE PAYOUT FEED</span>
      </div>

      {/* Scrolling Marquee Container */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10 pointer-events-none" />

        <div className="animate-marquee items-center gap-4">
          {marqueeItems.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              data-testid={`payout-ticker-item-${index}`}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors shrink-0 bg-[#111114] border ${
                item.highlight ? 'border-[#00c853]/60 bg-[#0d1c14]' : 'border-white/10'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00c853] shrink-0" />
              <span className="text-xs leading-none" title={item.country}>
                {item.flag}
              </span>
              <span className="font-sans font-bold text-white text-xs">
                {item.traderName}
              </span>
              <span className="text-slate-400 text-[11px]">withdrew</span>
              <span className="font-mono font-black text-[#00e676] text-xs">
                ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-slate-300 text-[11px] font-mono font-semibold">
                via {item.method}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-slate-500 pl-1 border-l border-white/10">
                <ArrowUpRight className="w-2.5 h-2.5 text-[#00c853]" />
                {item.timeAgo}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
