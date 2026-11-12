import React, { useState, useEffect } from 'react';
import { Trophy, TrendingUp } from 'lucide-react';
import { CountryFlagIcon } from './CountryFlagIcon';
import {
  LeaderboardTrader,
  fetchSelfFundedLeaderboardFromSupabase,
  subscribeToLeaderboardsRealtime,
  getDynamicLeaderboardTraders,
  normalizeSelfFundedLeaderboard,
  formatCleanLeaderboardRow,
} from '../utils/leaderboardEngine';

export interface DailyTopTradersTickerProps {
  onSelectPair?: () => void;
  onOpenLeaderboard?: () => void;
}

export type CryptoTickerBarProps = DailyTopTradersTickerProps;

export const DailyTopTradersTicker: React.FC<DailyTopTradersTickerProps> = ({
  onSelectPair,
  onOpenLeaderboard,
}) => {
  const [traders, setTraders] = useState<LeaderboardTrader[]>(() =>
    getDynamicLeaderboardTraders({ category: 'self_funded', useEveningPeak: false })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 15)
  );

  const handleClick = () => {
    if (onOpenLeaderboard) onOpenLeaderboard();
    else if (onSelectPair) onSelectPair();
  };

  useEffect(() => {
    // 1. Initial fetch from Supabase (global_leaderboards view / self_funded_leaderboard table)
    fetchSelfFundedLeaderboardFromSupabase().then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        const sortedTop15 = [...data]
          .sort((a, b) => b.profit - a.profit)
          .slice(0, 15)
          .map((t, idx) => ({ ...t, rank: idx + 1 }));
        setTraders(sortedTop15);
      }
    });

    // 2. Realtime listener for active DB shifts
    const unsubscribeRealtime = subscribeToLeaderboardsRealtime(
      () => {},
      (updatedSelfFunded) => {
        if (Array.isArray(updatedSelfFunded) && updatedSelfFunded.length > 0) {
          const sortedTop15 = [...updatedSelfFunded]
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 15)
            .map((t, idx) => ({ ...t, rank: idx + 1 }));
          setTraders(sortedTop15);
        }
      }
    );

    // 3. Intraday periodic update rotation for realistic live movement
    const interval = setInterval(() => {
      setTraders((prev) => {
        const next = prev.map((t) => ({ ...t }));
        // Rank 1 Aarav Sharma ($40,056.61) remains anchored
        const eligible = next.filter(
          (t) => t.rank > 1 && t.name !== 'Aarav Sharma' && !t.name.toLowerCase().includes('yohan')
        );
        if (eligible.length > 0) {
          const target = eligible[Math.floor(Math.random() * eligible.length)];
          const isPullback = Math.random() < 0.15 && target.profit > 50;
          const stepDelta = isPullback
            ? -Number((Math.random() * 12 + 2.5).toFixed(2))
            : Number((Math.random() * 35 + 5.5).toFixed(2));
          target.profit = Math.max(0, Number((target.profit + stepDelta).toFixed(2)));
        }

        const normalized = normalizeSelfFundedLeaderboard(next, false, false);
        return normalized
          .sort((a, b) => b.profit - a.profit)
          .slice(0, 15)
          .map((t, idx) => ({ ...t, rank: idx + 1 }));
      });
    }, 5000);

    return () => {
      unsubscribeRealtime();
      clearInterval(interval);
    };
  }, []);

  // Duplicate list to create a seamless infinite marquee scrolling effect
  const marqueeItems = [...traders, ...traders];

  return (
    <div
      data-testid="daily-top-traders-ticker"
      className="w-full bg-[#0b0f19] border-b border-white/[0.08] overflow-hidden py-1.5 flex items-center text-xs relative select-none font-sans"
    >
      {/* Ticker Title Badge - FTMO Dark Styling */}
      <button
        type="button"
        onClick={handleClick}
        data-testid="ticker-header-badge"
        className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#121827] hover:bg-[#1a2236] border-r border-white/[0.1] text-[10.5px] font-mono font-bold text-[#00e676] z-10 shrink-0 transition-colors cursor-pointer"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e676] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00e676]"></span>
        </span>
        <Trophy className="w-3.5 h-3.5 text-[#ff8800] shrink-0" />
        <span className="tracking-wide text-white">DAILY TOP TRADERS</span>
      </button>

      {/* Marquee Feed Area */}
      <div
        className="relative flex-1 overflow-hidden cursor-pointer"
        onClick={handleClick}
      >
        <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-10 bg-gradient-to-r from-[#0b0f19] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-10 bg-gradient-to-l from-[#0b0f19] to-transparent z-10 pointer-events-none" />

        <div className="animate-marquee flex items-center gap-6 whitespace-nowrap">
          {marqueeItems.map((trader, index) => {
            const row = formatCleanLeaderboardRow(trader);
            const winRate = Number(trader.winRate ?? 80.0).toFixed(1);

            return (
              <div
                key={`${trader.id}-${index}`}
                data-testid={`trader-ticker-item-${index}`}
                className="flex items-center gap-2.5 shrink-0 text-xs py-0.5 px-2 rounded hover:bg-white/[0.04] transition-colors"
              >
                {/* Rank Badge */}
                <span className="font-mono font-black text-[11px] text-[#ff8800] bg-[#ff8800]/10 px-1.5 py-0.5 rounded border border-[#ff8800]/25">
                  #{row.rank}
                </span>

                {/* Country Flag & ISO Code */}
                <span className="flex items-center justify-center shrink-0">
                  <CountryFlagIcon
                    country={trader.country}
                    countryCode={trader.countryCode || trader.country_code}
                    isoCode={trader.isoCode}
                    flagEmoji={row.flag}
                    showIsoBadge={true}
                    className="w-5 h-3.5 rounded-[2px] shadow-sm border border-white/15 shrink-0 inline-block align-middle object-cover"
                  />
                </span>

                {/* Trader Name */}
                <span className="font-semibold text-slate-100 truncate max-w-[120px] sm:max-w-[160px]">
                  {row.name}
                </span>

                {/* Win Rate */}
                <span className="font-mono text-[10.5px] font-semibold text-slate-400 bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/10 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-[#00e676] inline-block shrink-0" />
                  <span>{winRate}% Win</span>
                </span>

                {/* Profit Amount */}
                <span
                  className={`font-mono font-black tabular-nums ${
                    row.isLoss ? 'text-rose-500' : 'text-[#00e676]'
                  }`}
                >
                  {row.profitFormatted}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const CryptoTickerBar = DailyTopTradersTicker;
