import React, { useState, useEffect } from 'react';
import { X, Trophy, Activity, HelpCircle, ChevronDown, ChevronUp, Sparkles, CalendarClock } from 'lucide-react';
import { soundEngine } from '../utils/soundEffects';
import {
  LeaderboardTrader,
  WEEKLY_LEADERBOARD_TRADERS,
  KASUN_PERERA_ENTRY,
  resolveUserLeaderboardPosition,
  normalizeWeeklyLeaderboard,
  getMondayWeeklyResetInfo,
} from '../utils/leaderboardEngine';

export type { LeaderboardTrader };

interface QuotexLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfit?: number;
  weeklyTradesCount?: number;
  userName?: string;
  userAccountId?: string;
}

export const QuotexLeaderboardModal: React.FC<QuotexLeaderboardModalProps> = ({
  isOpen,
  onClose,
  userProfit = 0,
  weeklyTradesCount = 0,
  userName = 'Trader',
  userAccountId = 'UNRANKED',
}) => {
  const [traders, setTraders] = useState<LeaderboardTrader[]>(() =>
    normalizeWeeklyLeaderboard(WEEKLY_LEADERBOARD_TRADERS)
  );
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [lastUpdatedTraderId, setLastUpdatedTraderId] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState(() => getMondayWeeklyResetInfo());

  // Dynamic live weekly performance updates while keeping Kasun Perera anchored at #9 ($18,995.22)
  useEffect(() => {
    if (!isOpen) return;
    setResetInfo(getMondayWeeklyResetInfo());

    const interval = setInterval(() => {
      setTraders((prev) => {
        const next = prev.map((t) => ({ ...t }));
        const eligibleIndices = next
          .map((t, idx) => (t.rank > 3 && t.id !== KASUN_PERERA_ENTRY.id && t.rank !== 8 && t.rank !== 10 ? idx : -1))
          .filter((idx) => idx !== -1);

        if (eligibleIndices.length === 0) return next;

        const randomIndex = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
        const target = next[randomIndex];
        const gain = Math.floor(Math.random() * 25) + 8;
        target.profit = Number((target.profit + gain).toFixed(2));
        target.recentWin = true;

        setLastUpdatedTraderId(target.id);
        setTimeout(() => setLastUpdatedTraderId(null), 2500);

        return normalizeWeeklyLeaderboard(next);
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const userPosition = resolveUserLeaderboardPosition(
    userProfit,
    weeklyTradesCount,
    traders
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
      <div
        data-testid="quotex-leaderboard-modal"
        className="w-full max-w-3xl rounded-3xl bg-[#0a0a0a] border border-white/15 overflow-hidden flex flex-col max-h-[92vh] font-mono text-slate-100"
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-[#111115] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800]">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white font-sans">
                  Weekly Institutional Leaderboard
                </h3>
                <span
                  data-testid="leaderboard-weekly-reset"
                  className="px-2 py-0.5 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/40 text-[10px] font-black uppercase inline-flex items-center gap-1"
                >
                  <CalendarClock className="w-3 h-3" />
                  {resetInfo.resetScheduleLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Week of {resetInfo.weekStartIso} • Verified weekly trading performance across India 🇮🇳, Pakistan 🇵🇰, Malaysia 🇲🇾, UAE 🇦🇪 & Sri Lanka 🇱🇰.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-leaderboard-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            aria-label="Close Leaderboard"
            className="p-2 rounded-xl bg-[#1a1a20] hover:bg-[#252530] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Personal Ranking Card Header (Defaults to 1000+ when $0 profit or 0 weekly trades) */}
        <div className="p-4 bg-[#111115] border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div
              data-testid="user-leaderboard-rank"
              className="min-w-[54px] h-12 px-2.5 rounded-2xl bg-[#1a1a22] border border-[#ff8800]/50 text-[#ff8800] font-black text-sm sm:text-base flex items-center justify-center font-mono"
            >
              {userPosition.rankLabel}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-white font-sans">{userName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 font-mono font-bold">
                  {userAccountId}
                </span>
                {userPosition.isUnranked && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-bold">
                    Position: 1000+ (No Active Weekly Profit)
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-mono">
                Your Weekly Profit:{' '}
                <strong
                  data-testid="user-leaderboard-profit"
                  className={userPosition.verifiedWeeklyProfit > 0 ? 'text-[#00e676]' : 'text-slate-300'}
                >
                  ${userPosition.verifiedWeeklyProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>{' '}
                • Weekly Trades: <strong className="text-white">{Math.max(0, weeklyTradesCount)}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="toggle-how-it-works-btn"
            onClick={() => {
              soundEngine.playUiClick();
              setShowHowItWorks(!showHowItWorks);
            }}
            className="px-3 py-2 rounded-xl bg-[#16161c] hover:bg-[#1f1f27] border border-white/15 text-xs font-mono font-bold text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer self-start sm:self-center transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-[#ff8800]" />
            <span>Weekly Reset Rules</span>
            {showHowItWorks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Informative Collapsible Section */}
        {showHowItWorks && (
          <div className="p-4 bg-[#141418] border-b border-white/10 text-xs text-slate-300 space-y-2 font-mono animate-in fade-in duration-150 shrink-0">
            <div className="font-black uppercase tracking-wider text-[#ff8800] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Automatic Monday 00:00 UTC Weekly Reset
            </div>
            <p className="leading-relaxed text-slate-300">
              Weekly rankings reset automatically every Monday at 00:00 UTC. Only verified net positive weekly profit from live funded or challenge trades qualifies for Top 1000 placement. Traders with $0.00 weekly profit or zero completed weekly trades remain at position <strong>1000+</strong> until they close profitable trades during the active Monday–Sunday cycle.
            </p>
          </div>
        )}

        {/* Podium Top 3 (Strictly Trader Name, Country Flag, and Profit Amount — Zero Profile Photos) */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-[#0e0e12] border-b border-white/10 text-center shrink-0">
          {/* 2nd Place Silver */}
          <div className="p-3 rounded-2xl bg-[#121217] border border-slate-700/60 flex flex-col items-center justify-center">
            <span className="px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 border border-slate-500/40 text-[9px] font-black uppercase mb-1.5">
              #2 Runner-Up
            </span>
            <div className="text-2xl mb-1" title={traders[1].country}>
              {traders[1].flag}
            </div>
            <div className="font-bold text-white text-xs sm:text-sm truncate max-w-[150px] font-sans">
              {traders[1].name}
            </div>
            <div className="text-[10px] text-slate-400">{traders[1].country}</div>
            <div className="text-[#00e676] font-black text-xs sm:text-sm mt-1">
              +${traders[1].profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* 1st Place Gold */}
          <div className="p-3 rounded-2xl bg-[#16120a] border-2 border-[#ff8800] flex flex-col items-center justify-center">
            <span className="px-2.5 py-0.5 rounded bg-[#ff8800] text-slate-950 font-black text-[10px] uppercase mb-1.5">
              #1 Weekly Leader
            </span>
            <div className="text-2xl mb-1" title={traders[0].country}>
              {traders[0].flag}
            </div>
            <div className="font-black text-white text-xs sm:text-sm truncate max-w-[160px] font-sans">
              {traders[0].name}
            </div>
            <div className="text-[10px] text-amber-300">{traders[0].country}</div>
            <div className="text-[#ff8800] font-black text-sm sm:text-base mt-1">
              +${traders[0].profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* 3rd Place Bronze */}
          <div className="p-3 rounded-2xl bg-[#121217] border border-amber-800/50 flex flex-col items-center justify-center">
            <span className="px-2 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-600/40 text-[9px] font-black uppercase mb-1.5">
              #3 Podium
            </span>
            <div className="text-2xl mb-1" title={traders[2].country}>
              {traders[2].flag}
            </div>
            <div className="font-bold text-white text-xs sm:text-sm truncate max-w-[150px] font-sans">
              {traders[2].name}
            </div>
            <div className="text-[10px] text-slate-400">{traders[2].country}</div>
            <div className="text-[#00e676] font-black text-xs sm:text-sm mt-1">
              +${traders[2].profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Top 20 Weekly Traders List (Zero Profile Photos — Strictly Rank, Flag, Name, and Profit) */}
        <div className="p-3 sm:p-4 overflow-y-auto divide-y divide-white/5 flex-1 text-xs space-y-1">
          {traders.map((trader) => {
            const isKasun = trader.id === KASUN_PERERA_ENTRY.id || trader.name === 'Kasun Perera';
            const wasJustUpdated = lastUpdatedTraderId === trader.id;

            return (
              <div
                key={trader.id}
                data-testid={`leaderboard-row-${trader.rank}`}
                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                  isKasun
                    ? 'bg-[#101c15] border-2 border-[#00e676]/60'
                    : wasJustUpdated
                    ? 'bg-white/5 border border-white/15'
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span
                    className={`w-7 text-center font-black text-sm ${
                      trader.rank === 1
                        ? 'text-[#ff8800]'
                        : trader.rank === 2
                        ? 'text-slate-200'
                        : trader.rank === 3
                        ? 'text-amber-500'
                        : isKasun
                        ? 'text-[#00e676]'
                        : 'text-slate-400'
                    }`}
                  >
                    #{trader.rank}
                  </span>

                  <span
                    className="w-9 h-9 rounded-xl bg-[#16161c] border border-white/10 flex items-center justify-center text-lg shrink-0"
                    title={trader.country}
                  >
                    {trader.flag}
                  </span>

                  <div>
                    <div className="font-black text-white flex items-center gap-2">
                      <span className="font-sans text-sm">{trader.name}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        ({trader.country})
                      </span>
                      {isKasun && (
                        <span
                          data-testid="kasun-perera-badge"
                          className="px-2 py-0.5 rounded bg-[#00c853]/20 text-[#00e676] border border-[#00e676]/40 text-[9px] font-black uppercase tracking-wider"
                        >
                          Verified #9 🇱🇰
                        </span>
                      )}
                      {wasJustUpdated && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                          +Trade
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      {trader.accountTier} • Win Rate: <strong className="text-slate-200">{trader.winRate}%</strong>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    data-testid={`trader-profit-${trader.rank}`}
                    className={`text-sm sm:text-base font-black font-mono ${
                      isKasun ? 'text-[#00e676] text-base sm:text-lg' : 'text-emerald-400'
                    }`}
                  >
                    +${trader.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Payout SLA: {trader.payoutTime}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#111115] border-t border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono shrink-0">
          <span className="flex items-center gap-1.5 text-[#00e676] font-bold">
            <Activity className="w-4 h-4" /> TRC-20 & BEP-20 Institutional Payout Gateway Active
          </span>
          <span className="text-slate-400">Next Reset: {resetInfo.resetScheduleLabel}</span>
        </div>
      </div>
    </div>
  );
};
