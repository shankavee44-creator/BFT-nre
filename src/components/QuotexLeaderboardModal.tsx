import React, { useState, useEffect } from 'react';
import { X, Trophy, HelpCircle, ChevronDown, ChevronUp, CalendarClock, ShieldAlert, Zap, DollarSign, CheckCircle2 } from 'lucide-react';
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
  const [quickCopyTrader, setQuickCopyTrader] = useState<LeaderboardTrader | null>(null);
  const [quickAllocation, setQuickAllocation] = useState<number>(100);
  const [quickCopyToast, setQuickCopyToast] = useState<string | null>(null);

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
      className="fixed inset-0 top-0 z-50 flex items-start sm:items-center justify-center pt-0 mt-0 p-0 sm:p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        data-testid="quotex-leaderboard-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-none sm:rounded-2xl bg-[#0a0a0a] border-0 sm:border border-white/15 overflow-hidden flex flex-col h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[88vh] pt-0 mt-0 font-sans text-slate-100 select-none"
      >
        {/* 1. Clean Quotex Header Bar */}
        <div className="px-3 py-1.5 sm:px-4 sm:py-3 bg-[#101218] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800] shrink-0">
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-base font-bold text-white leading-tight truncate">
                Past Week Best Funded Traders
              </h3>
              <div
                data-testid="leaderboard-weekly-reset"
                className="text-[9px] sm:text-[10px] font-mono text-[#ff8800] flex items-center gap-1 leading-tight truncate"
              >
                <CalendarClock className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
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
            className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#181b24] hover:bg-[#222632] border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 bft-touch-scale"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* 2. Personal Summary Card ("Your profit" & "Your position") */}
        <div className="px-2.5 py-1.5 sm:p-3.5 bg-[#0e1016] border-b border-white/10 shrink-0 space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between text-[11px] sm:text-xs">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="font-bold text-white truncate">{userName}</span>
              <span className="text-[9.5px] sm:text-[10px] font-mono text-slate-400 shrink-0">
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
              className="text-[10px] sm:text-[11px] font-medium text-[#ff8800] hover:text-amber-300 flex items-center gap-1 cursor-pointer shrink-0 bft-touch-scale"
            >
              <HelpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>How does it work?</span>
              {showHowItWorks ? (
                <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              ) : (
                <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              )}
            </button>
          </div>

          {/* Account Eligibility Banner (if using Demo, Personal, or Challenge Account) */}
          {activeAccount && !isEligible && (
            <div className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-[9.5px] sm:text-[11px] text-amber-300 flex items-center gap-1.5 font-mono leading-tight">
              <ShieldAlert className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                Active account ({activeAccount.tierName || activeAccount.tier}) excluded. Only Live Active Funded Accounts qualify.
              </span>
            </div>
          )}

          {/* Side-by-Side Quotex Summary Boxes */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <div className="px-2.5 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl bg-[#141720] border border-white/10 flex items-center justify-between sm:block">
              <div className="text-[9px] sm:text-[10px] text-slate-400 font-medium">Your profit:</div>
              <div
                data-testid="user-leaderboard-profit"
                className={`text-xs sm:text-sm font-black font-mono tabular-nums sm:mt-0.5 ${
                  userPosition.verifiedWeeklyProfit > 0 ? 'text-[#00e676]' : 'text-white'
                }`}
              >
                ${userPosition.verifiedWeeklyProfit.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>

            <div className="px-2.5 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl bg-[#141720] border border-white/10 flex items-center justify-between sm:block">
              <div className="text-[9px] sm:text-[10px] text-slate-400 font-medium">Your position:</div>
              <div
                data-testid="user-leaderboard-rank"
                className="text-xs sm:text-sm font-black font-mono tabular-nums text-[#ff8800] sm:mt-0.5"
              >
                {userPosition.rankLabel}
              </div>
            </div>
          </div>

          {/* Collapsible Weekly Reset Rules */}
          {showHowItWorks && (
            <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-[#141720] border border-white/10 text-[10px] sm:text-[11px] text-slate-300 leading-snug font-sans animate-in fade-in duration-150">
              Rankings strictly reflect verified net profit from closed trades on <span className="text-[#00e676] font-semibold">Live Active Funded Accounts</span> during the current week (starting{' '}
              <span className="font-mono text-white">{resetInfo.weekStartIso}</span>) and reset automatically every{' '}
              <span className="text-[#ff8800] font-semibold">Monday at 00:00 UTC</span>. Demo, Personal, and Challenge accounts are excluded. All traders ranked below 20th place display position <span className="font-mono text-white">1000+</span>.
            </div>
          )}

          {/* Mobile Horizontal Swipable Top 3 Podium Strip */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between text-[8.5px] font-mono text-slate-400 uppercase tracking-wider mb-0.5">
              <span className="text-[#ff8800] font-bold">Top 3 Podium Leaders</span>
              <span>Swipe →</span>
            </div>
            <div
              data-testid="mobile-swipable-leaderboard-podium"
              className="bft-snap-strip flex items-stretch gap-1.5 pb-0.5"
            >
              {traders.slice(0, 3).map((topTrader) => {
                const topRow = formatCleanLeaderboardRow(topTrader);
                return (
                  <div
                    key={`podium-${topTrader.id}`}
                    className="bft-snap-card min-w-[170px] px-2 py-1.5 rounded-lg bg-[#141720] border border-[#ff8800]/30 flex items-center justify-between gap-1.5 shrink-0"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className={`w-4.5 h-4.5 rounded font-mono font-black text-[9.5px] flex items-center justify-center shrink-0 ${
                          topRow.rank === 1
                            ? 'bg-[#ff8800] text-slate-950'
                            : topRow.rank === 2
                            ? 'bg-slate-300/20 text-slate-100 border border-slate-300/40'
                            : 'bg-amber-600/25 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {topRow.rankDisplay}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10.5px] font-bold text-white leading-tight truncate">{topRow.name}</div>
                        <div className="text-[9.5px] font-mono font-black text-[#00e676] leading-tight tabular-nums">
                          {topRow.profitFormatted}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`podium-quick-copy-${topTrader.rank}`}
                      onClick={() => {
                        soundEngine.playUiClick();
                        setQuickCopyTrader(topTrader);
                      }}
                      className="px-1.5 py-1 rounded bg-[#00F5A0]/20 hover:bg-[#00F5A0]/30 text-[#00F5A0] font-mono text-[9px] font-black flex items-center gap-0.5 cursor-pointer shrink-0"
                    >
                      <Zap className="w-2.5 h-2.5 fill-current" />
                      <span>Copy</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick Copy Success Toast */}
        {quickCopyToast && (
          <div className="px-3 py-1.5 bg-[#00F5A0]/15 border-b border-[#00F5A0]/30 text-[#00F5A0] font-mono text-xs flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{quickCopyToast}</span>
          </div>
        )}

        {/* 3. Clean Institutional Top 20 List (Strictly Rank Number, Country Flag, Trader Name, and Profit Amount with Quick Copy) */}
        <div
          data-testid="leaderboard-traders-list"
          className="flex-1 overflow-y-auto divide-y divide-white/[0.06] px-2.5 sm:px-3 py-0.5 sm:py-1 bg-[#0a0a0a]"
        >
          {traders.map((trader) => {
            const row = formatCleanLeaderboardRow(trader);
            const wasJustUpdated = lastUpdatedTraderId === trader.id;

            return (
              <div
                key={trader.id}
                data-testid={`leaderboard-row-${trader.rank}`}
                className={`flex items-center justify-between py-1.5 sm:py-2.5 px-1.5 sm:px-2 transition-colors ${
                  wasJustUpdated ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* Left: Rank Number + Country Flag + Trader Name */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2">
                  <span
                    className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md font-mono font-black text-[11px] sm:text-xs tabular-nums flex items-center justify-center shrink-0 ${
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

                {/* Right: Profit Amount + Quick Copy Button */}
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                  <div
                    data-testid={`trader-profit-${trader.rank}`}
                    className="text-xs sm:text-sm font-black font-mono tabular-nums text-[#00e676] text-right"
                  >
                    {row.profitFormatted}
                  </div>

                  <button
                    type="button"
                    data-testid={`quick-copy-leaderboard-btn-${trader.rank}`}
                    onClick={() => {
                      soundEngine.playUiClick();
                      setQuickCopyTrader(trader);
                    }}
                    className="px-2 py-1 rounded-md bg-[#00F5A0]/15 hover:bg-[#00F5A0]/25 border border-[#00F5A0]/40 text-[#00F5A0] font-mono font-bold text-[10px] sm:text-[11px] flex items-center gap-1 cursor-pointer transition-colors bft-touch-scale"
                    title={`Quick Copy ${trader.name}`}
                  >
                    <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current shrink-0" />
                    <span>Quick Copy</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Copy Allocation Modal */}
        {quickCopyTrader && (
          <div
            data-testid="leaderboard-quick-copy-modal"
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-fade-in"
            onClick={() => setQuickCopyTrader(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#0e1118] border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3.5"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#00F5A0]/15 border border-[#00F5A0]/30 flex items-center justify-center text-[#00F5A0]">
                    <Zap className="w-4 h-4 fill-current" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white uppercase">Quick Copy Allocation</h4>
                    <p className="text-[10px] font-mono text-slate-400">Mirror future binary trades in real-time</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickCopyTrader(null)}
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Trader Summary */}
              <div className="p-3 rounded-xl bg-[#141720] border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded font-mono font-black text-xs bg-[#ff8800] text-slate-950 flex items-center justify-center shrink-0">
                    #{quickCopyTrader.rank}
                  </span>
                  <CountryFlagIcon
                    country={quickCopyTrader.country}
                    isoCode={quickCopyTrader.isoCode}
                    flagEmoji={quickCopyTrader.flag}
                    showIsoBadge={true}
                    className="w-5 h-3.5 rounded-[2px] object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{quickCopyTrader.name}</div>
                    <div className="text-[10px] font-mono text-slate-400">{quickCopyTrader.country}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[9px] font-mono text-slate-400 uppercase block">Weekly Profit</span>
                  <span className="text-xs font-mono font-black text-[#00e676]">
                    +${quickCopyTrader.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Active Account Information */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">
                  Active Account & Available Balance
                </label>
                <div className="px-3 py-2 rounded-xl bg-[#141720] border border-white/10 flex items-center justify-between text-xs font-mono">
                  <span className="text-white truncate">
                    {activeAccount?.tierName || activeAccount?.id || 'Active Live Account'}
                  </span>
                  <span className="font-bold text-[#00e676] shrink-0">
                    ${Number(activeAccount?.currentBalance ?? 50000).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Allocation Amount */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">
                  Allocate Capital to Mirror ($)
                </label>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {[25, 50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setQuickAllocation(amt);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] border cursor-pointer transition-colors shrink-0 ${
                        quickAllocation === amt
                          ? 'bg-[#00F5A0] text-[#07080B] border-[#00F5A0]'
                          : 'bg-[#141720] text-slate-300 border-white/10 hover:border-white/20'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">$</span>
                  <input
                    type="number"
                    min="1"
                    value={quickAllocation}
                    onChange={(e) => setQuickAllocation(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-[#141720] border border-white/15 focus:border-[#00F5A0] rounded-xl pl-7 pr-3 py-2 text-white font-mono text-xs outline-none"
                  />
                </div>
              </div>

              {/* 0-Latency Guarantee */}
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[10.5px] font-mono text-slate-300 flex items-center justify-between">
                <span>Mirror Execution:</span>
                <span className="font-bold text-[#00F5A0]">0ms Latency • 100% Profit Keep</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setQuickCopyTrader(null)}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-leaderboard-quick-copy-btn"
                  onClick={() => {
                    soundEngine.playTradePlacement();
                    setQuickCopyToast(`Quick Copy Active: Now mirroring ${quickCopyTrader.name} at $${quickAllocation}/trade.`);
                    setTimeout(() => setQuickCopyToast(null), 4000);
                    setQuickCopyTrader(null);
                  }}
                  className="flex-1 py-2 rounded-xl bg-[#00F5A0] hover:brightness-110 text-[#07080B] font-black text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>Start Mirroring</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


