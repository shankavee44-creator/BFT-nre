import React, { useState, useEffect } from 'react';
import { X, Trophy, HelpCircle, ChevronDown, ChevronUp, CalendarClock, ShieldAlert } from 'lucide-react';
import { soundEngine } from '../utils/soundEffects';
import { CountryFlagIcon } from './CountryFlagIcon';
import {
  LeaderboardTrader,
  WEEKLY_LEADERBOARD_TRADERS,
  KASUN_PERERA_ENTRY,
  resolveUserLeaderboardPosition,
  normalizeWeeklyLeaderboard,
  getMondayWeeklyResetInfo,
  formatCleanLeaderboardRow,
  isEligibleLeaderboardAccount,
} from '../utils/leaderboardEngine';

export type { LeaderboardTrader };

interface QuotexLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfit?: number;
  weeklyTradesCount?: number;
  userName?: string;
  userAccountId?: string;
  activeAccount?: any;
}

export const QuotexLeaderboardModal: React.FC<QuotexLeaderboardModalProps> = ({
  isOpen,
  onClose,
  userProfit = 0,
  weeklyTradesCount = 0,
  userName = 'Trader',
  userAccountId = 'UNRANKED',
  activeAccount,
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
          .map((t, idx) =>
            t.rank > 3 && t.id !== KASUN_PERERA_ENTRY.id && t.rank !== 8 && t.rank !== 10 ? idx : -1
          )
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

  const isEligible = activeAccount ? isEligibleLeaderboardAccount(activeAccount) : true;
  const userPosition = resolveUserLeaderboardPosition(
    isEligible ? userProfit : 0,
    isEligible ? weeklyTradesCount : 0,
    traders,
    activeAccount
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        data-testid="quotex-leaderboard-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-[#0a0a0a] border-t sm:border border-white/15 overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[88vh] font-sans text-slate-100 select-none"
      >
        {/* 1. Clean Quotex Header Bar */}
        <div className="px-4 py-3 bg-[#101218] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800] shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">
                Past Week Best Funded Traders
              </h3>
              <div
                data-testid="leaderboard-weekly-reset"
                className="text-[10px] font-mono text-[#ff8800] flex items-center gap-1 truncate"
              >
                <CalendarClock className="w-3 h-3 shrink-0" />
                <span className="truncate">{resetInfo.resetScheduleLabel}</span>
              </div>
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
            className="w-9 h-9 rounded-lg bg-[#181b24] hover:bg-[#222632] border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Personal Summary Card ("Your profit" & "Your position") */}
        <div className="p-3.5 bg-[#0e1016] border-b border-white/10 shrink-0 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-white truncate">{userName}</span>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                · {userAccountId}
              </span>
            </div>

            <button
              type="button"
              data-testid="toggle-how-it-works-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setShowHowItWorks(!showHowItWorks);
              }}
              className="text-[11px] font-medium text-[#ff8800] hover:text-amber-300 flex items-center gap-1 cursor-pointer shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>How does it work?</span>
              {showHowItWorks ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Account Eligibility Banner (if using Demo, Personal, or Challenge Account) */}
          {activeAccount && !isEligible && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 flex items-center gap-1.5 font-mono">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                Active account ({activeAccount.tierName || activeAccount.tier}) excluded. Only Live Active Funded Accounts qualify.
              </span>
            </div>
          )}

          {/* Side-by-Side Quotex Summary Boxes */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="px-3 py-2 rounded-xl bg-[#141720] border border-white/10">
              <div className="text-[10px] text-slate-400 font-medium">Your profit:</div>
              <div
                data-testid="user-leaderboard-profit"
                className={`text-sm font-black font-mono tabular-nums mt-0.5 ${
                  userPosition.verifiedWeeklyProfit > 0 ? 'text-[#00e676]' : 'text-white'
                }`}
              >
                ${userPosition.verifiedWeeklyProfit.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-[#141720] border border-white/10">
              <div className="text-[10px] text-slate-400 font-medium">Your position:</div>
              <div
                data-testid="user-leaderboard-rank"
                className="text-sm font-black font-mono tabular-nums text-[#ff8800] mt-0.5"
              >
                {userPosition.rankLabel}
              </div>
            </div>
          </div>

          {/* Collapsible Weekly Reset Rules */}
          {showHowItWorks && (
            <div className="p-3 rounded-xl bg-[#141720] border border-white/10 text-[11px] text-slate-300 leading-relaxed font-sans">
              Rankings strictly reflect verified net profit from closed trades on <span className="text-[#00e676] font-semibold">Live Active Funded Accounts</span> during the current week (starting{' '}
              <span className="font-mono text-white">{resetInfo.weekStartIso}</span>) and reset automatically every{' '}
              <span className="text-[#ff8800] font-semibold">Monday at 00:00 UTC</span>. Demo, Personal, and Challenge accounts are excluded. All traders ranked below 20th place display position <span className="font-mono text-white">1000+</span>.
            </div>
          )}
        </div>

        {/* 3. Clean Institutional Top 20 List (Strictly Rank Number, Country Flag, Trader Name, and Profit Amount) */}
        <div
          data-testid="leaderboard-traders-list"
          className="flex-1 overflow-y-auto divide-y divide-white/[0.06] px-3 py-1.5 bg-[#0a0a0a]"
        >
          {traders.map((trader) => {
            const row = formatCleanLeaderboardRow(trader);
            const wasJustUpdated = lastUpdatedTraderId === trader.id;

            return (
              <div
                key={trader.id}
                data-testid={`leaderboard-row-${trader.rank}`}
                className={`flex items-center justify-between py-2.5 px-2 transition-colors ${
                  wasJustUpdated ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* Left: Rank Number + Country Flag + Trader Name */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-3">
                  <span
                    className={`w-6 h-6 rounded-md font-mono font-black text-xs tabular-nums flex items-center justify-center shrink-0 ${
                      row.rank === 1
                        ? 'bg-[#ff8800] text-slate-950'
                        : row.rank === 2
                        ? 'bg-slate-300/20 text-slate-100 border border-slate-300/40'
                        : row.rank === 3
                        ? 'bg-amber-600/25 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400'
                    }`}
                  >
                    {row.rankDisplay}
                  </span>

                  <span
                    className="flex items-center justify-center shrink-0"
                    title={`${trader.country} (${(trader.isoCode || '').toUpperCase()})`}
                  >
                    <CountryFlagIcon
                      country={trader.country}
                      isoCode={trader.isoCode}
                      flagEmoji={row.flag}
                      showIsoBadge={true}
                      className="w-5 h-3.5 rounded-[2px] shadow-sm border border-white/15 shrink-0 inline-block align-middle object-cover"
                    />
                  </span>

                  <span className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                    {row.name}
                  </span>
                </div>

                {/* Right: Profit Amount */}
                <div
                  data-testid={`trader-profit-${trader.rank}`}
                  className="text-xs sm:text-sm font-black font-mono tabular-nums text-[#00e676] shrink-0 text-right"
                >
                  {row.profitFormatted}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


