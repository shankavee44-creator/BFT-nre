import React, { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import {
  WEEKLY_LEADERBOARD_TRADERS,
  normalizeWeeklyLeaderboard,
  formatCleanLeaderboardRow,
} from '../utils/leaderboardEngine';

export const CryptoTickerBar: React.FC = () => {
  const [traders, setTraders] = useState(() => normalizeWeeklyLeaderboard(WEEKLY_LEADERBOARD_TRADERS));

  // Periodic leaderboard update simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setTraders((prev) => normalizeWeeklyLeaderboard(prev.map(t => ({ ...t, profit: t.profit + Math.random() * 50 }))));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const marqueeItems = [...traders, ...traders];

  return (
    <div
      data-testid="weekly-top-traders-ticker"
      className="w-full bg-[#0a0a0a] border-b border-white/10 overflow-hidden py-1.5 flex items-center text-xs relative select-none"
    >
      <div className="hidden sm:flex items-center gap-1.5 px-3 py-0.5 bg-[#121215] border-r border-white/10 text-[10px] font-mono font-bold text-[#ff8800] z-10 shrink-0">
        <Trophy className="w-3 h-3 text-[#ff8800]" />
        <span>WEEKLY TOP FUNDED TRADERS</span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10 pointer-events-none" />

        <div className="animate-marquee flex items-center gap-6 whitespace-nowrap">
          {marqueeItems.map((trader, index) => {
            const row = formatCleanLeaderboardRow(trader);
            return (
              <div
                key={`${trader.id}-${index}`}
                data-testid={`trader-ticker-item-${index}`}
                className="flex items-center gap-2 shrink-0 text-xs"
              >
                <span className="font-mono font-bold text-slate-500">#{row.rank}</span>
                <span className="text-base">{row.flag}</span>
                <span className="font-sans font-bold text-white">{row.name}</span>
                <span className="font-mono font-black text-[#00e676]">{row.profitFormatted}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
