import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Trophy,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CalendarClock,
  Award,
  Wallet,
} from 'lucide-react';
import { soundEngine } from '../utils/soundEffects';
import { CountryFlagIcon } from './CountryFlagIcon';
import {
  LeaderboardTrader,
  LeaderboardTabCategory,
  YOHAN_SIRIWARDHANA_ENTRY,
  getDynamicLeaderboardTraders,
  getSriLankaDailyResetInfo,
  getSriLankaWeeklyResetInfo,
  calculateUserLeaderboardPnL,
  formatDailyProfitLoss,
  resolveUserLeaderboardPosition,
  normalizeWeeklyLeaderboard,
  formatCleanLeaderboardRow,
  fetchFundedLeaderboardFromSupabase,
  fetchSelfFundedLeaderboardFromSupabase,
  subscribeToLeaderboardsRealtime,
} from '../utils/leaderboardEngine';

export type { LeaderboardTrader, LeaderboardTabCategory };

interface QuotexLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfit?: number;
  weeklyTradesCount?: number;
  userName?: string;
  userCountry?: string;
  userCountryIso?: string;
  userAccountId?: string;
  activeAccount?: any;
  accounts?: any[];
  trades?: any[];
  defaultTab?: LeaderboardTabCategory;
}

export const QuotexLeaderboardModal: React.FC<QuotexLeaderboardModalProps> = ({
  isOpen,
  onClose,
  userProfit,
  weeklyTradesCount = 0,
  userName = 'Trader',
  userCountry = 'Sri Lanka',
  userCountryIso = 'LK',
  userAccountId = 'ACTIVE',
  activeAccount,
  trades = [],
  defaultTab = 'funded',
}) => {
  const [activeTab, setActiveTab] = useState<LeaderboardTabCategory>(defaultTab);
  const [fundedTraders, setFundedTraders] = useState<LeaderboardTrader[]>(() =>
    getDynamicLeaderboardTraders({ category: 'funded', useEveningPeak: true })
  );
  const [selfFundedTraders, setSelfFundedTraders] = useState<LeaderboardTrader[]>(() =>
    getDynamicLeaderboardTraders({ category: 'self_funded', useEveningPeak: true })
  );
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [lastUpdatedTraderId, setLastUpdatedTraderId] = useState<string | null>(null);
  const [dailyResetInfo, setDailyResetInfo] = useState(() => getSriLankaDailyResetInfo());
  const [weeklyResetInfo, setWeeklyResetInfo] = useState(() => getSriLankaWeeklyResetInfo());

  // Fetch initial leaderboard rows from Supabase tables and subscribe to Realtime updates
  useEffect(() => {
    if (!isOpen) return;

    fetchFundedLeaderboardFromSupabase().then((data) => {
      if (data && data.length > 0) setFundedTraders(data);
    });
    fetchSelfFundedLeaderboardFromSupabase().then((data) => {
      if (data && data.length > 0) setSelfFundedTraders(data);
    });

    const unsubscribeRealtime = subscribeToLeaderboardsRealtime(
      (updatedFunded) => {
        if (updatedFunded && updatedFunded.length > 0) {
          setFundedTraders(updatedFunded);
        }
      },
      (updatedSelfFunded) => {
        if (updatedSelfFunded && updatedSelfFunded.length > 0) {
          setSelfFundedTraders(updatedSelfFunded);
        }
      }
    );

    setDailyResetInfo(getSriLankaDailyResetInfo());
    setWeeklyResetInfo(getSriLankaWeeklyResetInfo());

    const interval = setInterval(() => {
      setDailyResetInfo(getSriLankaDailyResetInfo());
      setWeeklyResetInfo(getSriLankaWeeklyResetInfo());

      const applyRealisticStep = (prevList: LeaderboardTrader[]): LeaderboardTrader[] => {
        const next = prevList.map((t) => ({ ...t }));
        const eligibleIndices = next
          .map((t, idx) =>
            t.rank > 1 && t.name !== 'Yohan Siriwardhana' && !t.isCurrentUser ? idx : -1
          )
          .filter((idx) => idx !== -1);

        if (eligibleIndices.length === 0) return next;

        const randomIndex = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
        const target = next[randomIndex];
        const yohan = next.find((t) => t.rank === 1 || t.name === 'Yohan Siriwardhana');
        const maxAllowedForOthers = (yohan?.profit ?? YOHAN_SIRIWARDHANA_ENTRY.profit) - 150;

        const stepGain = Number((Math.random() * 35 + 5.5).toFixed(2));
        target.profit = Math.min(
          maxAllowedForOthers,
          Number((target.profit + stepGain).toFixed(2))
        );
        target.recentWin = true;

        setLastUpdatedTraderId(target.id);
        setTimeout(() => setLastUpdatedTraderId(null), 2200);

        return normalizeWeeklyLeaderboard(next);
      };

      if (activeTab === 'funded') {
        setFundedTraders((prev) => applyRealisticStep(prev));
      } else {
        setSelfFundedTraders((prev) => applyRealisticStep(prev));
      }
    }, 5500);

    return () => {
      unsubscribeRealtime();
      clearInterval(interval);
    };
  }, [isOpen, activeTab]);

  // Track the logged-in user's real performance according to the active tab timeframe:
  // - 'funded': Weekly PnL (trades during the past week)
  // - 'self_funded': Daily PnL (trades since 05:30 AM SLST today)
  const userMetrics = useMemo(() => {
    return calculateUserLeaderboardPnL({
      category: activeTab,
      trades,
      activeAccount,
      fallbackProfitLoss: userProfit,
    });
  }, [activeTab, trades, activeAccount, userProfit]);

  const activeBaseTraders = activeTab === 'funded' ? fundedTraders : selfFundedTraders;

  const userPosition = useMemo(() => {
    return resolveUserLeaderboardPosition(
      userMetrics.pnl,
      userMetrics.tradesCount || weeklyTradesCount,
      activeBaseTraders,
      activeAccount,
      {
        name: userName,
        country: userCountry === 'United States' ? 'Sri Lanka' : userCountry,
        isoCode: userCountryIso,
        flag: '🇱🇰',
      }
    );
  }, [
    userMetrics.pnl,
    userMetrics.tradesCount,
    weeklyTradesCount,
    activeBaseTraders,
    activeAccount,
    userName,
    userCountry,
    userCountryIso,
  ]);

  const userPnlFormatted = formatDailyProfitLoss(userMetrics.pnl);
  const displayedTraders = userPosition.mergedTraders;
  const currentResetSchedule =
    activeTab === 'funded'
      ? weeklyResetInfo.resetScheduleLabel
      : dailyResetInfo.resetScheduleLabel;

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 top-0 z-[100] flex items-start sm:items-center justify-center pt-0 mt-0 p-0 sm:p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        data-testid="quotex-leaderboard-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl rounded-none sm:rounded-2xl bg-[#0a0c12] border-0 sm:border border-white/15 overflow-hidden flex flex-col h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90vh] pt-0 mt-0 font-sans text-slate-100 select-none shadow-2xl"
      >
        {/* 1. Header Bar */}
        <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 bg-[#10131c] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800] shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                data-testid="leaderboard-modal-title"
                className="text-xs sm:text-base font-bold text-white leading-tight truncate"
              >
                {activeTab === 'funded'
                  ? 'Past Week Best Funded Traders'
                  : 'Daily Top 15 Traders'}
              </h3>
              <div
                data-testid="leaderboard-weekly-reset"
                className="text-[9.5px] sm:text-[10.5px] font-mono text-[#ff8800] flex items-center gap-1 leading-tight truncate mt-0.5"
              >
                <CalendarClock className="w-3 h-3 shrink-0" />
                <span className="truncate">{currentResetSchedule}</span>
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
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#181b24] hover:bg-[#222632] border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Distinct Two-Tab Switcher: [ Funded Traders | Self-Funded Traders ] */}
        <div className="px-3.5 pt-2.5 pb-2 sm:px-5 bg-[#0d1018] border-b border-white/10 shrink-0">
          <div
            role="tablist"
            aria-label="Leaderboard Tabs"
            className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#141824] border border-white/10"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'funded'}
              data-testid="tab-funded-leaderboard"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveTab('funded');
              }}
              className={`py-2 px-3 rounded-lg font-bold text-xs sm:text-[13px] flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'funded'
                  ? 'bg-[#ff8800] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>Funded Traders</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'self_funded'}
              data-testid="tab-self-funded-leaderboard"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveTab('self_funded');
              }}
              className={`py-2 px-3 rounded-lg font-bold text-xs sm:text-[13px] flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'self_funded'
                  ? 'bg-[#00e676] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span>Self-Funded Traders</span>
            </button>
          </div>
        </div>

        {/* 3. Logged-In User Performance & Position Summary Card */}
        <div className="px-3.5 py-2 sm:px-5 sm:py-3 bg-[#0e111a] border-b border-white/10 shrink-0 space-y-2">
          <div className="flex items-center justify-between text-[11px] sm:text-xs">
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
              className="text-[10px] sm:text-[11px] font-medium text-[#ff8800] hover:text-amber-300 flex items-center gap-1 cursor-pointer shrink-0"
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

          <div className="grid grid-cols-2 gap-2">
            <div className="px-3 py-1.5 sm:py-2 rounded-xl bg-[#141824] border border-white/10 flex items-center justify-between sm:block">
              <div className="text-[9.5px] sm:text-[10px] text-slate-400 font-medium">
                {activeTab === 'funded'
                  ? 'Your Weekly Profit / Loss (Past Week):'
                  : 'Your Daily Profit / Loss (Since 05:30 AM SLST):'}
              </div>
              <div
                data-testid="user-leaderboard-profit"
                className={`text-xs sm:text-sm font-black font-mono tabular-nums sm:mt-0.5 ${userPnlFormatted.colorClass}`}
              >
                {userPnlFormatted.formatted}
              </div>
            </div>

            <div className="px-3 py-1.5 sm:py-2 rounded-xl bg-[#141824] border border-white/10 flex items-center justify-between sm:block">
              <div className="text-[9.5px] sm:text-[10px] text-slate-400 font-medium">
                Your Position:
              </div>
              <div
                data-testid="user-leaderboard-rank"
                className="text-xs sm:text-sm font-black font-mono tabular-nums text-[#ff8800] sm:mt-0.5"
              >
                {userPosition.isUnranked ? '1000+' : `#${userPosition.rank}`}
              </div>
            </div>
          </div>

          {showHowItWorks && (
            <div className="p-2.5 sm:p-3 rounded-xl bg-[#141824] border border-white/10 text-[10px] sm:text-[11px] text-slate-300 leading-relaxed font-sans space-y-1">
              <p>
                <strong className="text-white">Funded Traders (Weekly):</strong> Displays Past-Week cumulative performance. Rotates weekly on Sunday 05:30 AM SLST.
              </p>
              <p>
                <strong className="text-white">Self-Funded Traders (Daily):</strong> Displays Daily intraday performance, resetting precisely every morning at{' '}
                <span className="text-[#ff8800] font-semibold">05:30 AM SLST (UTC+5:30)</span> / 00:00 UTC.
              </p>
              <p>
                Default user rank is <span className="font-mono text-white">1000+</span>, updating automatically into the Top 15 if your profit surpasses an active Top 15 trader.
              </p>
            </div>
          )}
        </div>

        {/* 4. Clean Table Column Headers: Rank | Trader Name | Country | Profit/Loss */}
        <div className="px-3.5 sm:px-5 py-2 bg-[#111520] border-b border-white/10 grid grid-cols-12 items-center text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-400 shrink-0">
          <div className="col-span-2">Rank</div>
          <div className="col-span-4">Trader Name</div>
          <div className="col-span-3">Country</div>
          <div className="col-span-3 text-right">
            {activeTab === 'funded' ? 'Weekly Profit/Loss' : 'Daily Profit/Loss'}
          </div>
        </div>

        {/* 5. Top 15 Traders Table Rows (NO Avatars, NO Copy Buttons) */}
        <div
          data-testid="leaderboard-traders-list"
          className="flex-1 overflow-y-auto divide-y divide-white/[0.06] px-2 sm:px-3.5 py-1 bg-[#0a0c12]"
        >
          {displayedTraders.map((trader) => {
            const row = formatCleanLeaderboardRow(trader);
            const wasJustUpdated = lastUpdatedTraderId === trader.id;

            return (
              <div
                key={`${activeTab}-${trader.id}-${trader.rank}`}
                data-testid={`leaderboard-row-${trader.rank}`}
                className={`grid grid-cols-12 items-center py-2 sm:py-2.5 px-1.5 sm:px-2 rounded-lg transition-colors ${
                  trader.isCurrentUser
                    ? 'bg-[#00e676]/10 border border-[#00e676]/30'
                    : wasJustUpdated
                    ? 'bg-white/[0.04]'
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* Column 1: Rank */}
                <div className="col-span-2 flex items-center">
                  <span
                    className={`w-6 h-6 rounded-md font-mono font-black text-[11px] sm:text-xs tabular-nums flex items-center justify-center shrink-0 ${
                      row.rank === 1
                        ? 'bg-[#ff8800] text-slate-950 shadow-sm'
                        : row.rank === 2
                        ? 'bg-slate-300/20 text-slate-100 border border-slate-300/40'
                        : row.rank === 3
                        ? 'bg-amber-600/25 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 bg-white/[0.03]'
                    }`}
                  >
                    {row.rankDisplay}
                  </span>
                </div>

                {/* Column 2: Trader Name (Plain layout without external avatar images) */}
                <div className="col-span-4 min-w-0 pr-2 flex items-center gap-2">
                  <span
                    data-testid={`trader-name-${trader.rank}`}
                    className="text-xs sm:text-sm font-semibold text-slate-100 truncate"
                  >
                    {row.name}
                  </span>
                  {trader.isCurrentUser && (
                    <span className="px-1.5 py-0.5 rounded bg-[#00e676]/20 text-[#00e676] font-mono text-[9px] font-bold shrink-0">
                      YOU
                    </span>
                  )}
                </div>

                {/* Column 3: Country Flag & ISO / Name */}
                <div
                  data-testid={`trader-country-${trader.rank}`}
                  className="col-span-3 flex items-center gap-1.5 min-w-0"
                  title={`${trader.country} (${(trader.isoCode || '').toUpperCase()})`}
                >
                  <CountryFlagIcon
                    country={trader.country}
                    isoCode={trader.isoCode}
                    flagEmoji={row.flag}
                    showIsoBadge={true}
                    className="w-5 h-3.5 rounded-[2px] shadow-sm border border-white/15 shrink-0 inline-block align-middle object-cover"
                  />
                  <span className="hidden sm:inline text-[11px] text-slate-300 truncate">
                    {trader.country}
                  </span>
                </div>

                {/* Column 4: Profit/Loss */}
                <div
                  data-testid={`trader-profit-${trader.rank}`}
                  className={`col-span-3 text-xs sm:text-sm font-black font-mono tabular-nums text-right ${
                    row.isLoss ? 'text-rose-500' : 'text-[#00e676]'
                  }`}
                >
                  {row.profitFormatted}
                </div>
              </div>
            );
          })}
        </div>

        {/* 6. Sticky Bottom Logged-in User Position Bar */}
        <div
          data-testid="leaderboard-sticky-user-row"
          className="px-3.5 sm:px-5 py-2.5 bg-[#121624] border-t border-white/15 grid grid-cols-12 items-center shrink-0"
        >
          <div className="col-span-2 flex items-center">
            <span
              data-testid="sticky-user-rank"
              className="px-2 py-1 rounded-md bg-[#ff8800]/20 border border-[#ff8800]/40 text-[#ff8800] font-mono font-black text-[11px] sm:text-xs tabular-nums"
            >
              {userPosition.rankLabel}
            </span>
          </div>

          <div className="col-span-4 min-w-0 pr-2 flex items-center gap-2">
            <span className="text-xs sm:text-sm font-bold text-white truncate">
              {userName}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-mono text-[9px] font-bold shrink-0">
              YOU
            </span>
          </div>

          <div className="col-span-3 flex items-center gap-1.5 min-w-0">
            <CountryFlagIcon
              country={userCountry === 'United States' ? 'Sri Lanka' : userCountry}
              isoCode={userCountryIso}
              flagEmoji="🇱🇰"
              showIsoBadge={true}
              className="w-5 h-3.5 rounded-[2px] shadow-sm border border-white/15 shrink-0 inline-block align-middle object-cover"
            />
            <span className="hidden sm:inline text-[11px] text-slate-300 truncate">
              {userCountry === 'United States' ? 'Sri Lanka' : userCountry}
            </span>
          </div>

          <div
            data-testid="sticky-user-profit"
            className={`col-span-3 text-xs sm:text-sm font-black font-mono tabular-nums text-right ${userPnlFormatted.colorClass}`}
          >
            {userPnlFormatted.formatted}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
