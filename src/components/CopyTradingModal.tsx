import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Trophy,
  Zap,
  DollarSign,
  ChevronRight,
  ChevronDown,
  Activity,
  Award,
  Globe,
  UserPlus,
  StopCircle,
  Lock,
  CheckCircle2,
  X,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Clock,
  ShieldAlert,
  Settings2,
  Wallet,
  Target as TargetIcon,
  Search,
  Percent,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { TradingAccount, BinaryTrade, UserProfile } from '../types';
import { soundEngine } from '../utils/soundEffects';
import {
  apiCopyTrader,
  apiCancelCopy,
  apiGetSubscriptions,
  apiGetCopyTraders,
  apiRegisterCopyProvider,
} from '../utils/apiClient';
import { CountryFlagIcon } from './CountryFlagIcon';
import {
  MAX_COPIERS_PER_TRADER,
  MIN_PROVIDER_WIN_RATE_3M,
  ROTATION_INTERVAL_MINUTES,
  LEADERBOARD_TOP_LIMIT,
  TOTAL_TRADER_POOL_SIZE,
  FOLLOWER_PROFIT_SHARE_PERCENT,
  MASTER_COMMISSION_PERCENT,
  evaluateProviderEligibility,
  evaluateSingleAccountCopyEligibility,
  resolveCopierEligibilityForUser,
  validateCopyRiskSettings,
  generate200TraderPool,
  getRotationWindowInfo,
  queryCopyTradersPool,
  type CopyTraderProfileData,
  type CopySubscriptionData,
} from '../utils/copyTradingRules';

interface CopyTradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: TradingAccount[];
  activeAccount?: TradingAccount | null;
  trades?: BinaryTrade[];
  userProfile?: UserProfile;
  onNavigateToPricing?: () => void;
  onOpenDepositModal?: () => void;
}

interface MasterTraderCardItemProps {
  trader: CopyTraderProfileData;
  displayRank: number;
  isCopying: boolean;
  isFull: boolean;
  onViewStats: (trader: CopyTraderProfileData) => void;
  onCancelSubscription: (trader: CopyTraderProfileData) => void;
  onOpenCopyConfig: (trader: CopyTraderProfileData) => void;
}

const MasterTraderCardItem: React.FC<MasterTraderCardItemProps> = React.memo(({
  trader,
  displayRank,
  isCopying,
  isFull,
  onViewStats,
  onCancelSubscription,
  onOpenCopyConfig,
}) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(displayRank === 1);

  return (
    <div
      data-testid={`copy-trader-card-${trader.numeric_id}`}
      className={`group relative flex flex-col xl:flex-row xl:items-center justify-between gap-2 sm:gap-4 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 ${
        isCopying
          ? 'bg-[#00F5A0]/[0.06] border-[#00F5A0]/50 shadow-lg'
          : 'bg-[#10141F] border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Top / Left Primary Compact Row: Rank + Flag + Name + Numeric ID + Mobile 24H ROI Summary */}
      <div className="flex items-center justify-between gap-2 xl:w-[340px] shrink-0 w-full">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div
            className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center text-[10px] sm:text-xs font-black font-mono shrink-0 ${
              displayRank === 1
                ? 'bg-amber-400 text-slate-950'
                : displayRank === 2
                ? 'bg-slate-300 text-slate-950'
                : displayRank === 3
                ? 'bg-amber-600 text-white'
                : 'bg-[#181E2E] text-slate-300 border border-slate-700'
            }`}
          >
            #{displayRank}
          </div>

          <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-[#161C2B] border border-slate-700/80 flex items-center justify-center shrink-0 overflow-hidden">
            <CountryFlagIcon
              isoCode={trader.country_code}
              country={trader.country}
              flagEmoji={trader.flag}
              className="w-5 h-3.5 sm:w-7 sm:h-5 object-cover rounded-xs"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
              <h3 className="text-xs sm:text-base font-black text-white truncate max-w-[115px] xs:max-w-[155px] sm:max-w-none">
                {trader.provider_name}
              </h3>
              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-[#00F5A0] shrink-0" />
              <span
                data-testid={`trader-numeric-id-${trader.numeric_id}`}
                className="px-1.5 py-0.2 rounded bg-cyan-500/15 border border-cyan-500/30 font-mono text-[8.5px] sm:text-[10px] font-bold text-cyan-300"
              >
                ID #{trader.numeric_id}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-0.5">
              <span className="text-[8.5px] sm:text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-slate-200">
                {trader.account_type_label}
              </span>
              <span className="text-[8.5px] sm:text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 border border-emerald-500/30 text-[#00F5A0]">
                3M Win: {trader.win_rate_3m}%
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Quick 24H ROI Summary + Accordion Toggle Button */}
        <div className="flex sm:hidden items-center gap-1.5 shrink-0">
          <div className="text-right font-mono">
            <div className="text-[11px] font-black text-[#00F5A0] leading-tight">
              +${trader.daily_profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[8.5px] font-bold text-[#00F5A0]/80 leading-tight">
              +{trader.daily_profit_pct}% 24H
            </div>
          </div>
          <button
            type="button"
            data-testid={`toggle-trader-details-${trader.numeric_id}`}
            aria-expanded={isDetailsOpen}
            aria-label={`Toggle metrics for ${trader.provider_name}`}
            onClick={() => {
              soundEngine.playUiClick();
              setIsDetailsOpen((prev) => !prev);
            }}
            className="w-7 h-7 rounded-lg bg-[#181E2E] border border-slate-700/80 text-slate-300 flex items-center justify-center bft-touch-scale cursor-pointer"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isDetailsOpen ? 'rotate-180 text-[#00F5A0]' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Collapsible Detailed ROI Grid & Balances (Collapsible on Mobile, Always Open on sm+ Desktop) */}
      <div
        className={`bft-accordion-grid bft-accordion-sm-always-open flex-1 w-full ${
          isDetailsOpen ? 'bft-accordion-open' : 'bft-accordion-closed'
        }`}
      >
        <div className="bft-accordion-inner space-y-2 pt-1 sm:pt-0">
          {/* Balances Summary Strip */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 text-[8.5px] sm:text-[10px] font-mono text-slate-400">
            <span>
              Start: <strong className="text-slate-200">${trader.starting_balance.toLocaleString()}</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span>
              Curr: <strong className="text-[#00F5A0]">${trader.current_balance.toLocaleString()}</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span>
              Wd: <strong className="text-amber-300">${trader.all_time_withdrawals.toLocaleString()}</strong>
            </span>
          </div>

          {/* 4-Period ROI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5 w-full">
            <div className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#0B0E17] border border-slate-800/80">
              <p className="text-[7.5px] sm:text-[9px] text-slate-400 font-mono uppercase truncate">Daily ROI (24H)</p>
              <p className="text-[10.5px] sm:text-sm font-mono font-black text-[#00F5A0] mt-0.5">
                +${trader.daily_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[8px] sm:text-[10px] font-mono font-bold text-[#00F5A0]/80">
                +{trader.daily_profit_pct}%
              </p>
            </div>

            <div className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#0B0E17] border border-slate-800/80">
              <p className="text-[7.5px] sm:text-[9px] text-slate-400 font-mono uppercase truncate">Weekly ROI (7D)</p>
              <p className="text-[10.5px] sm:text-sm font-mono font-black text-white mt-0.5">
                +${trader.weekly_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[8px] sm:text-[10px] font-mono font-bold text-emerald-400">
                +{trader.weekly_profit_pct}%
              </p>
            </div>

            <div className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#0B0E17] border border-slate-800/80">
              <p className="text-[7.5px] sm:text-[9px] text-slate-400 font-mono uppercase truncate">Monthly ROI (30D)</p>
              <p className="text-[10.5px] sm:text-sm font-mono font-black text-white mt-0.5">
                +${trader.monthly_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[8px] sm:text-[10px] font-mono font-bold text-emerald-400">
                +{trader.monthly_profit_pct}%
              </p>
            </div>

            <div className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#0B0E17] border border-slate-800/80">
              <p className="text-[7.5px] sm:text-[9px] text-slate-400 font-mono uppercase truncate">3-Month ROI (90D)</p>
              <p className="text-[10.5px] sm:text-sm font-mono font-black text-amber-300 mt-0.5">
                +${trader.three_month_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[8px] sm:text-[10px] font-mono font-bold text-amber-400">
                +{trader.three_month_profit_pct}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right / Bottom: Compact Copier Capacity + Always-Accessible Stats & Copy Buttons */}
      <div className="flex flex-col sm:flex-row xl:flex-col items-stretch sm:items-center xl:items-end justify-between gap-1.5 sm:gap-2.5 xl:w-[230px] shrink-0 w-full xl:w-auto">
        <div className="w-full">
          <div className="flex items-center justify-between text-[8.5px] sm:text-[10px] font-mono mb-0.5">
            <span className="text-slate-400 flex items-center gap-1">
              <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#00F5A0]" /> Copiers:
            </span>
            <span
              data-testid={`trader-copiers-${trader.numeric_id}`}
              className={`font-black ${isFull ? 'text-amber-400' : 'text-white'}`}
            >
              {trader.current_copiers} / {MAX_COPIERS_PER_TRADER} Copiers
            </span>
            <span className="text-[#00F5A0] font-bold sm:hidden">100% Keep • 0% Fee</span>
          </div>
          <div className="w-full h-1 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isFull ? 'bg-amber-400' : 'bg-[#00F5A0]'}`}
              style={{
                width: `${Math.min(100, (trader.current_copiers / MAX_COPIERS_PER_TRADER) * 100)}%`,
              }}
            />
          </div>
          <div className="hidden sm:flex items-center justify-between mt-1 text-[9px] font-mono text-slate-400">
            <span>Profit Keep: <strong className="text-[#00F5A0]">100%</strong></span>
            <span>Fee: <strong className="text-[#00F5A0]">0%</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 w-full">
          <button
            type="button"
            data-testid={`view-trader-btn-${trader.numeric_id}`}
            onClick={() => {
              soundEngine.playUiClick();
              onViewStats(trader);
            }}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-mono font-bold text-[10.5px] sm:text-xs cursor-pointer bft-touch-scale min-h-[34px] sm:min-h-[42px]"
          >
            Stats
          </button>

          {isCopying ? (
            <button
              type="button"
              data-testid={`copy-trader-btn-${trader.numeric_id}`}
              onClick={() => onCancelSubscription(trader)}
              className="flex-1 py-1.5 sm:py-2 px-3 rounded-lg sm:rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-black text-[10.5px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer bft-touch-scale min-h-[34px] sm:min-h-[42px]"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Stop Copying</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isFull}
              data-testid={`copy-trader-btn-${trader.numeric_id}`}
              onClick={() => onOpenCopyConfig(trader)}
              className={`flex-1 py-1.5 sm:py-2 px-3 rounded-lg sm:rounded-xl font-black text-[10.5px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 bft-touch-scale min-h-[34px] sm:min-h-[42px] ${
                isFull
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-[#00F5A0] hover:brightness-110 text-[#07080B] cursor-pointer shadow-md'
              }`}
            >
              <span>{isFull ? '200/200 Full' : 'Copy Trader'}</span>
              {!isFull && <ChevronRight className="w-3.5 h-3.5 stroke-[3]" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

const SUBSCRIPTIONS_STORAGE_KEY = 'bft_copy_subscriptions_v2';
const CUSTOM_PROVIDERS_STORAGE_KEY = 'bft_custom_copy_providers_v2';

export const CopyTradingModal: React.FC<CopyTradingModalProps> = ({
  isOpen,
  onClose,
  accounts = [],
  activeAccount,
  trades = [],
  userProfile,
  onNavigateToPricing,
  onOpenDepositModal,
}) => {
  const [activeTab, setActiveTab] = useState<'instant_funded' | 'self_capital'>('instant_funded');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMobileRulesOpen, setIsMobileRulesOpen] = useState<boolean>(false);
  const [fullPool, setFullPool] = useState<CopyTraderProfileData[]>(() => generate200TraderPool());
  const [customProviders, setCustomProviders] = useState<CopyTraderProfileData[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_PROVIDERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [rotationInfo, setRotationInfo] = useState(() => getRotationWindowInfo());
  const [viewingTrader, setViewingTrader] = useState<CopyTraderProfileData | null>(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState<Record<string, CopySubscriptionData>>(() => {
    try {
      const raw = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Modals & Alerts
  const [showEligibilityModal, setShowEligibilityModal] = useState<{
    trader: CopyTraderProfileData;
    reason: string;
    code: string;
  } | null>(null);
  const [showProviderModal, setShowProviderModal] = useState<boolean>(false);
  const [showRiskConfigModal, setShowRiskConfigModal] = useState<CopyTraderProfileData | null>(null);
  const [providerErrorNotice, setProviderErrorNotice] = useState<string | null>(null);
  const [riskErrorNotice, setRiskErrorNotice] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected Account for Copying
  const [selectedCopyAccountId, setSelectedCopyAccountId] = useState<string>('');

  // Custom Copy Risk Management State
  const [perTradeAllocationType, setPerTradeAllocationType] = useState<'amount' | 'percentage'>('amount');
  const [perTradeAllocationValue, setPerTradeAllocationValue] = useState<number>(100);
  const [maxLossStopUsd, setMaxLossStopUsd] = useState<number>(250);
  const [targetProfitStopUsd, setTargetProfitStopUsd] = useState<number>(500);
  const [maxDrawdownPercent, setMaxDrawdownPercent] = useState<number>(5.0);

  // Provider Registration State
  const [providerStrategyName, setProviderStrategyName] = useState<string>('Institutional OTC Alpha');
  const [providerCategory, setProviderCategory] = useState<'instant_funded' | 'self_capital'>('instant_funded');
  const computedInitialWinRate = useMemo(() => {
    const res = evaluateProviderEligibility({ accounts, trades });
    return res.winRate90d > 0 ? res.winRate90d : 54.0;
  }, [accounts, trades]);
  const [auditedWinRate90d, setAuditedWinRate90d] = useState<number>(computedInitialWinRate);

  useEffect(() => {
    setAuditedWinRate90d(computedInitialWinRate);
  }, [computedInitialWinRate]);

  const triggerToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastNotice({ type, text });
    setTimeout(() => {
      setToastNotice((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  const saveSubscriptionsMap = (next: Record<string, CopySubscriptionData>) => {
    setActiveSubscriptions(next);
    try {
      localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const loadCopyTradingData = async () => {
    setIsLoading(true);
    try {
      const freshPool = generate200TraderPool(Date.now());
      setFullPool(freshPool);
      setRotationInfo(getRotationWindowInfo(Date.now()));

      const subsRes = await apiGetSubscriptions(userProfile?.id);
      if (subsRes.ok && Array.isArray(subsRes.subscriptions) && subsRes.subscriptions.length > 0) {
        const merged: Record<string, CopySubscriptionData> = { ...activeSubscriptions };
        subsRes.subscriptions.forEach((sub: any) => {
          if (sub && sub.provider_id && sub.status === 'active') {
            merged[sub.provider_id] = {
              id: sub.id || `SUB-${sub.provider_id}`,
              provider_id: sub.provider_id,
              per_trade_allocation_type: sub.per_trade_allocation_type || 'amount',
              per_trade_allocation_value: Number(sub.per_trade_allocation_value ?? sub.allocated_capital ?? 100),
              allocated_capital: Number(sub.allocated_capital ?? 100),
              max_loss_limit: Number(sub.max_loss_limit ?? 250),
              take_profit_limit: Number(sub.take_profit_limit ?? 500),
              trade_sizing_type: sub.trade_sizing_type || 'proportionate',
              sizing_multiplier: Number(sub.sizing_multiplier ?? 1),
              status: 'active',
              current_pnl: Number(sub.current_pnl ?? 0),
              commission_pct: 0,
            };
          }
        });
        saveSubscriptionsMap(merged);
      }

      await apiGetCopyTraders(activeTab, searchQuery, LEADERBOARD_TOP_LIMIT).catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCopyTradingData();
    }
  }, [isOpen]);

  // 1-second timer for 45-minute rotation countdown & 5-second live profit micro-updates
  useEffect(() => {
    if (!isOpen) return;
    let lastSlot = Math.floor(Date.now() / (ROTATION_INTERVAL_MINUTES * 60 * 1000));

    const timer = setInterval(() => {
      const now = Date.now();
      const info = getRotationWindowInfo(now);
      setRotationInfo(info);

      if (info.rotationSlot !== lastSlot) {
        lastSlot = info.rotationSlot;
        setFullPool(generate200TraderPool(now));
      }
    }, 1000);

    const liveTick = setInterval(() => {
      setFullPool((prev) =>
        prev.map((t) => {
          const delta = (Math.random() - 0.44) * 0.0015 * t.daily_profit;
          const nextDaily = Number(Math.max(10, t.daily_profit + delta).toFixed(2));
          const nextDailyPct = Number(((nextDaily / t.starting_balance) * 100).toFixed(2));
          return {
            ...t,
            daily_profit: nextDaily,
            daily_profit_pct: nextDailyPct,
            current_balance: Number((t.starting_balance + t.monthly_profit * 0.35 + nextDaily).toFixed(2)),
          };
        })
      );
    }, 5000);

    return () => {
      clearInterval(timer);
      clearInterval(liveTick);
    };
  }, [isOpen]);

  // Combine custom registered providers with the 200-trader pool
  const combinedPool = useMemo(() => {
    if (customProviders.length === 0) return fullPool;
    const customIds = new Set(customProviders.map((c) => c.id));
    return [...customProviders, ...fullPool.filter((p) => !customIds.has(p.id))];
  }, [customProviders, fullPool]);

  // Query Top 10 for active category OR search across all 200 traders by numeric ID / name
  const queryResult = useMemo(() => {
    return queryCopyTradersPool({
      pool: combinedPool,
      category: activeTab,
      searchQuery,
      limit: LEADERBOARD_TOP_LIMIT,
    });
  }, [combinedPool, activeTab, searchQuery]);

  // Evaluate copier eligibility across all user accounts
  const copierEligibility = useMemo(() => {
    return resolveCopierEligibilityForUser({
      selectedAccountId: selectedCopyAccountId || activeAccount?.id,
      accounts,
      userProfile,
      bonusFunds: 0,
      targetProviderCategory: activeTab,
    });
  }, [selectedCopyAccountId, activeAccount?.id, accounts, userProfile, activeTab]);

  // Keep selectedCopyAccountId synced to an eligible account if available
  useEffect(() => {
    if (!selectedCopyAccountId && copierEligibility.selectedAccount) {
      setSelectedCopyAccountId(copierEligibility.selectedAccount.id);
    }
  }, [selectedCopyAccountId, copierEligibility.selectedAccount]);

  if (!isOpen) return null;

  const displayedTraders = queryResult.traders;

  const handleOpenCopyConfig = (trader: CopyTraderProfileData) => {
    soundEngine.playUiClick();
    setRiskErrorNotice(null);

    const sub = activeSubscriptions[trader.id];
    if (sub && sub.status === 'active') {
      handleCancelSubscription(trader);
      return;
    }

    if (trader.current_copiers >= MAX_COPIERS_PER_TRADER) {
      triggerToast(
        `Capacity Reached: ${trader.provider_name} (#${trader.numeric_id}) has reached the maximum ${MAX_COPIERS_PER_TRADER} / ${MAX_COPIERS_PER_TRADER} copiers limit.`,
        'error'
      );
      return;
    }

    // Check if the currently selected account (or any user account) is eligible
    const evalForTarget = resolveCopierEligibilityForUser({
      selectedAccountId: selectedCopyAccountId || activeAccount?.id,
      accounts,
      userProfile,
      bonusFunds: 0,
      targetProviderCategory: trader.account_category,
    });

    // If user explicitly selected an ineligible account and has no eligible account, show the strict eligibility restriction modal
    if (!evalForTarget.selectedResult.eligible && evalForTarget.eligibleAccounts.length === 0) {
      setShowEligibilityModal({
        trader,
        reason: evalForTarget.selectedResult.reason,
        code: evalForTarget.selectedResult.code,
      });
      triggerToast(evalForTarget.selectedResult.reason, 'error');
      return;
    }

    const bestEligible = evalForTarget.selectedResult.eligible
      ? { account: evalForTarget.selectedAccount!, result: evalForTarget.selectedResult }
      : evalForTarget.eligibleAccounts[0];

    if (bestEligible?.account) {
      setSelectedCopyAccountId(bestEligible.account.id);
      const avail = bestEligible.result.availableBalance;
      const defaultPerTrade =
        bestEligible.result.accountCategory === 'instant_funded'
          ? Math.min(500, Math.max(50, Math.round(avail * 0.01)))
          : Math.min(50, Math.max(10, Math.round(avail * 0.1)));
      setPerTradeAllocationType('amount');
      setPerTradeAllocationValue(defaultPerTrade);
      setMaxLossStopUsd(Math.max(25, Math.round(avail * 0.05)));
      setTargetProfitStopUsd(Math.max(50, Math.round(avail * 0.15)));
      setMaxDrawdownPercent(trader.max_drawdown ? Number(trader.max_drawdown) : 5.0);
    }

    setViewingTrader(null);
    setShowRiskConfigModal(trader);
  };

  const handleCancelSubscription = async (trader: CopyTraderProfileData) => {
    soundEngine.playUiClick();
    const targetAccountId = selectedCopyAccountId || activeAccount?.id;
    await apiCancelCopy(trader.id, userProfile?.id, targetAccountId);
    const next = { ...activeSubscriptions };
    delete next[trader.id];
    saveSubscriptionsMap(next);
    triggerToast(
      `Stopped copying ${trader.provider_name} (#${trader.numeric_id}). 100% of your profits remain in your account.`,
      'success'
    );
    setViewingTrader(null);
  };

  const handleConfirmCopySubscription = async () => {
    if (!showRiskConfigModal) return;
    soundEngine.playUiClick();
    setRiskErrorNotice(null);

    const targetAccount =
      accounts.find((a) => a.id === selectedCopyAccountId) || copierEligibility.selectedAccount;
    const singleAccountEval = evaluateSingleAccountCopyEligibility({
      account: targetAccount,
      userProfile,
      bonusFunds: 0,
      targetProviderCategory: showRiskConfigModal.account_category,
    });

    if (!singleAccountEval.eligible) {
      setRiskErrorNotice(singleAccountEval.reason);
      triggerToast(singleAccountEval.reason, 'error');
      return;
    }

    const isInstantFunded = singleAccountEval.accountCategory === 'instant_funded';
    const validation = validateCopyRiskSettings({
      perTradeAllocationType,
      perTradeAllocationValue,
      maxLossStopUsd,
      targetProfitStopUsd,
      accountBalance: singleAccountEval.availableBalance,
      isInstantFunded,
    });

    if (!validation.valid) {
      setRiskErrorNotice(validation.error || 'Invalid copy risk settings.');
      triggerToast(validation.error || 'Invalid copy risk settings.', 'error');
      return;
    }

    const tradeAmount = validation.perTradeDollarAmount;
    const stopLoss = validation.maxLossStopUsd;
    const takeProfit = validation.targetProfitStopUsd;
    const maxDrawdown = maxDrawdownPercent;

    const res = await apiCopyTrader({
      userId: userProfile?.id,
      userEmail: userProfile?.email,
      providerId: showRiskConfigModal.id,
      providerNumericId: showRiskConfigModal.numeric_id,
      providerName: showRiskConfigModal.provider_name,
      copierAccountId: targetAccount?.id,
      copierAccountType: singleAccountEval.accountCategory,
      perTradeAllocationType,
      perTradeAllocationValue,
      allocatedCapital: tradeAmount,
      tradeAmount,
      maxLossLimit: stopLoss,
      stopLoss,
      takeProfitLimit: takeProfit,
      takeProfit,
      maxDrawdown,
      tradeSizingType: perTradeAllocationType === 'percentage' ? 'proportionate' : 'fixed',
      sizingMultiplier: 1.0,
    });

    if (res.ok) {
      const newSub: CopySubscriptionData = {
        id: res.subscription?.id || `SUB-${Date.now()}`,
        provider_id: showRiskConfigModal.id,
        provider_numeric_id: showRiskConfigModal.numeric_id,
        provider_name: showRiskConfigModal.provider_name,
        copier_account_id: targetAccount?.id,
        copier_account_type: singleAccountEval.accountCategory,
        per_trade_allocation_type: perTradeAllocationType,
        per_trade_allocation_value: perTradeAllocationValue,
        allocated_capital: tradeAmount,
        max_loss_limit: stopLoss,
        take_profit_limit: takeProfit,
        trade_sizing_type: perTradeAllocationType === 'percentage' ? 'proportionate' : 'fixed',
        sizing_multiplier: 1.0,
        status: 'active',
        current_pnl: 0,
        commission_pct: MASTER_COMMISSION_PERCENT,
        created_at: Date.now(),
      };

      saveSubscriptionsMap({
        ...activeSubscriptions,
        [showRiskConfigModal.id]: newSub,
      });

      // Increment copier count up to 200 cap
      setFullPool((prev) =>
        prev.map((t) =>
          t.id === showRiskConfigModal.id
            ? { ...t, current_copiers: Math.min(MAX_COPIERS_PER_TRADER, t.current_copiers + 1) }
            : t
        )
      );

      triggerToast(
        `Copy Active: Now copying ${showRiskConfigModal.provider_name} (#${showRiskConfigModal.numeric_id}) at $${tradeAmount}/trade (SL: $${stopLoss}, TP: $${takeProfit}, Max DD: ${maxDrawdown}%) • 100% Profit Keep (0% Fee).`,
        'success'
      );
      setShowRiskConfigModal(null);
    } else {
      const errMsg = res.error || 'Failed to save copy trading subscription to database.';
      setRiskErrorNotice(errMsg);
      triggerToast(errMsg, 'error');
    }
  };

  const handleApplyAsProvider = async () => {
    soundEngine.playUiClick();
    setProviderErrorNotice(null);

    const eligibility = evaluateProviderEligibility({
      accounts,
      trades,
      explicitWinRate90d: auditedWinRate90d,
    });

    if (!eligibility.eligible) {
      setProviderErrorNotice(eligibility.message);
      triggerToast(eligibility.message, 'error');
      return;
    }

    const providerName =
      userProfile?.fullName?.trim() ||
      userProfile?.email?.split('@')[0] ||
      'Verified BFT Master';

    const res = await apiRegisterCopyProvider({
      userId: userProfile?.id,
      email: userProfile?.email,
      providerName,
      country: userProfile?.country || 'United States',
      countryCode: 'US',
      category: providerCategory,
      strategyTitle: providerStrategyName.trim() || 'Institutional OTC Alpha',
      startingBalance: providerCategory === 'instant_funded' ? 50000 : 5000,
      winRate3m: eligibility.winRate90d,
    });

    if (!res.ok) {
      const msg = res.error || eligibility.message;
      setProviderErrorNotice(msg);
      triggerToast(msg, 'error');
      return;
    }

    const createdProvider: CopyTraderProfileData = res.provider || {
      id: `trd_custom_${Date.now()}`,
      numeric_id: String(100301 + customProviders.length),
      user_id: userProfile?.id || 'usr_bft_001',
      provider_name: providerName,
      country_code: 'US',
      country: userProfile?.country || 'United States',
      flag: '🇺🇸',
      avatar_url: '🇺🇸',
      account_category: providerCategory,
      account_type_label:
        providerCategory === 'instant_funded' ? 'Instant Funded ($50K)' : 'Self-Capital Live',
      strategy_title: providerStrategyName.trim() || 'Institutional OTC Alpha',
      tier_name:
        providerCategory === 'instant_funded' ? '$50K Instant Funded' : 'Self-Capital Account',
      vip_level: 'Master Trader',
      starting_balance: providerCategory === 'instant_funded' ? 50000 : 5000,
      current_balance: providerCategory === 'instant_funded' ? 54200 : 5850,
      all_time_withdrawals: providerCategory === 'instant_funded' ? 18500 : 3400,
      lifetime_earnings: providerCategory === 'instant_funded' ? 18500 : 3400,
      daily_profit: providerCategory === 'instant_funded' ? 4200 : 850,
      daily_profit_pct: providerCategory === 'instant_funded' ? 8.4 : 17.0,
      weekly_profit: providerCategory === 'instant_funded' ? 12400 : 2100,
      weekly_profit_pct: providerCategory === 'instant_funded' ? 24.8 : 42.0,
      monthly_profit: providerCategory === 'instant_funded' ? 31000 : 5400,
      monthly_profit_pct: providerCategory === 'instant_funded' ? 62.0 : 108.0,
      three_month_profit: providerCategory === 'instant_funded' ? 74000 : 12800,
      three_month_profit_pct: providerCategory === 'instant_funded' ? 148.0 : 256.0,
      win_rate_3m: eligibility.winRate90d,
      profit_factor: 2.45,
      max_drawdown: 2.9,
      sharpe_ratio: 2.12,
      avg_holding_time: '2m 15s',
      total_trades: 285,
      current_copiers: 1,
      max_copiers: MAX_COPIERS_PER_TRADER,
      commission_pct: MASTER_COMMISSION_PERCENT,
      follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
      is_custom_provider: true,
    };

    const nextCustom = [createdProvider, ...customProviders];
    setCustomProviders(nextCustom);
    try {
      localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(nextCustom));
    } catch {
      // ignore
    }

    setActiveTab(providerCategory);
    setShowProviderModal(false);
    triggerToast(
      `Master Trader Approved! Listed as ${createdProvider.provider_name} (ID #${createdProvider.numeric_id}) with ${eligibility.winRate90d.toFixed(1)}% 90-Day Win Rate.`,
      'success'
    );
  };

  return (
    <div
      data-testid="copy-trading-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080B]/95 backdrop-blur-2xl animate-fade-in font-sans sm:p-4 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full h-full sm:h-[94vh] sm:max-w-[1320px] bg-[#090B10] sm:rounded-3xl shadow-2xl flex flex-col border border-slate-800/70 overflow-hidden"
      >
        {/* Top Header Bar (Ultra-Compact on Mobile) */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5 sm:py-4 border-b border-slate-800/60 bg-[#0B0E17] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-[#00F5A0]/15 border border-[#00F5A0]/30 flex items-center justify-center text-[#00F5A0] shrink-0">
              <Users className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                <h2 className="text-xs sm:text-xl font-black text-white tracking-tight uppercase truncate">
                  BFT Copy Trading <span className="text-[#00F5A0]">Master Pool</span>
                </h2>
                <span className="px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded bg-[#00F5A0]/15 border border-[#00F5A0]/30 text-[8.5px] sm:text-[10px] font-mono font-black text-[#00F5A0] uppercase">
                  100% Profit Keep
                </span>
                <span className="hidden xs:inline-block px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[8.5px] sm:text-[10px] font-mono font-bold text-amber-400">
                  {TOTAL_TRADER_POOL_SIZE} Verified Traders
                </span>
              </div>
              <p className="text-[9.5px] sm:text-[11px] text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-3">
                <span>Top {LEADERBOARD_TOP_LIMIT}</span>
                <span>•</span>
                <span data-testid="rotation-countdown-badge" className="text-cyan-400 font-bold">
                  45m Rotation: {rotationInfo.formattedCountdown}
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline">Max {MAX_COPIERS_PER_TRADER} Copiers / Trader</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              data-testid="join-copy-provider-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setProviderErrorNotice(null);
                setShowProviderModal(true);
              }}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] hover:brightness-110 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-2 cursor-pointer shadow-md bft-touch-scale"
            >
              <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span className="hidden xs:inline">Join as Copy Master</span>
              <span className="xs:hidden">Join</span>
            </button>
            <button
              type="button"
              data-testid="close-copy-trading-btn"
              aria-label="Close Copy Trading Modal"
              onClick={onClose}
              className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 cursor-pointer shrink-0 bft-touch-scale"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Copier Account Switcher & Collapsible Eligibility Rules Dropdown */}
        <div className="bg-[#0D111C] border-b border-slate-800/60 px-3 sm:px-6 py-2 text-xs shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="font-mono text-[9.5px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-bold shrink-0">
                Account:
              </span>
              <select
                aria-label="Select Copying Account"
                data-testid="copy-account-selector"
                value={selectedCopyAccountId}
                onChange={(e) => setSelectedCopyAccountId(e.target.value)}
                className="flex-1 sm:flex-none sm:max-w-xs bg-[#141926] border border-slate-700 rounded-lg px-2 py-1 text-[11px] sm:text-xs font-mono text-white outline-none focus:border-[#00F5A0] truncate"
              >
                {copierEligibility.allEvaluations.map(({ account, result }) => (
                  <option key={account.id} value={account.id}>
                    {account.tierName || account.id} (${Number(account.currentBalance || 0).toLocaleString()}) —{' '}
                    {result.eligible ? 'ELIGIBLE' : 'RESTRICTED'}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              data-testid="toggle-copy-rules-accordion"
              aria-expanded={isMobileRulesOpen}
              onClick={() => {
                soundEngine.playUiClick();
                setIsMobileRulesOpen((prev) => !prev);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141926] border border-slate-700/80 text-[10px] font-mono font-bold text-slate-300 hover:text-white cursor-pointer bft-touch-scale shrink-0"
            >
              {copierEligibility.selectedResult.eligible ? (
                <CheckCircle2 className="w-3 h-3 text-[#00F5A0] shrink-0" />
              ) : (
                <Lock className="w-3 h-3 text-rose-400 shrink-0" />
              )}
              <span>{copierEligibility.selectedResult.eligible ? 'Eligible' : 'Rules'}</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${
                  isMobileRulesOpen ? 'rotate-180 text-[#00F5A0]' : ''
                }`}
              />
            </button>
          </div>

          {/* Collapsible Eligibility Details & Rule Breakdown */}
          <div
            data-testid="mobile-copy-rules-collapsible"
            className={`bft-accordion-grid bft-accordion-sm-always-open ${
              isMobileRulesOpen ? 'bft-accordion-open' : 'bft-accordion-closed'
            }`}
          >
            <div className="bft-accordion-inner pt-2 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <span
                data-testid="copier-eligibility-badge"
                className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold flex items-center gap-1.5 border ${
                  copierEligibility.selectedResult.eligible
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-[#00F5A0]'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                }`}
              >
                {copierEligibility.selectedResult.eligible ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate">{copierEligibility.selectedResult.reason}</span>
              </span>

              <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] sm:text-[10px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                  Funded: <strong className="text-white">$25K/$50K/$100K Instant</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                  Challenge: <strong className="text-rose-400">Barred</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                  Self-Capital: <strong className="text-[#00F5A0]">$100+ Balance</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                  Active Subs: {Object.values(activeSubscriptions).filter((s) => s.status === 'active').length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Category Tabs + 200-Pool Numeric ID Search Bar (Compact on Mobile) */}
        <div className="px-3 sm:px-6 py-2 sm:py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 sm:gap-3 border-b border-slate-800/40 bg-[#090B10] shrink-0">
          <div className="flex bg-[#111520] p-0.5 sm:p-1 rounded-xl border border-slate-800 w-full md:w-auto">
            <button
              type="button"
              data-testid="tab-instant-funded"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveTab('instant_funded');
              }}
              className={`flex-1 sm:flex-none px-2.5 sm:px-6 py-1.5 sm:py-2 rounded-lg font-black text-[10.5px] sm:text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer bft-touch-scale ${
                activeTab === 'instant_funded'
                  ? 'bg-[#00F5A0] text-[#07080B] shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              <span>
                <span className="hidden sm:inline">INSTANT FUNDED TRADERS (100)</span>
                <span className="sm:hidden">INSTANT FUNDED (100)</span>
              </span>
            </button>
            <button
              type="button"
              data-testid="tab-self-capital"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveTab('self_capital');
              }}
              className={`flex-1 sm:flex-none px-2.5 sm:px-6 py-1.5 sm:py-2 rounded-lg font-black text-[10.5px] sm:text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer bft-touch-scale ${
                activeTab === 'self_capital'
                  ? 'bg-[#00F5A0] text-[#07080B] shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              <span>
                <span className="hidden sm:inline">SELF-CAPITAL TRADERS (100)</span>
                <span className="sm:hidden">SELF-CAPITAL (100)</span>
              </span>
            </button>
          </div>

          {/* Search across all 200 traders by numeric ID (#100101 - #100300) or name */}
          <div className="relative w-full md:max-w-md">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="copy-trader-search-input"
              aria-label="Search 200 Traders by Numeric ID or Name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 200 traders by ID (e.g. 100105) or name..."
              className="w-full bg-[#111520] border border-slate-700/80 focus:border-[#00F5A0] rounded-lg sm:rounded-xl pl-9 pr-8 py-1.5 sm:py-2 text-xs font-mono text-white placeholder:text-slate-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear Trader Search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer touch-manipulation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Leaderboard Feed with Mobile Horizontal Swipable Top 3 Spotlight */}
        <div
          data-testid="copy-traders-list"
          className="flex-1 overflow-y-auto px-3 sm:px-6 py-2.5 sm:py-4 space-y-2 sm:space-y-3 custom-scrollbar overscroll-contain touch-scroll hw-accelerate"
        >
          {/* Mobile Horizontal Swipable Top 3 Podium Cards */}
          {!isLoading && !queryResult.isSearchActive && displayedTraders.length >= 3 && (
            <div className="sm:hidden pb-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5 px-0.5">
                <span className="font-bold text-white flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-amber-400" /> Top 3 Spotlight (Swipe →)
                </span>
                <span className="text-[#00F5A0] font-bold">
                  Tap card chevron for full ROI
                </span>
              </div>
              <div
                data-testid="mobile-swipable-top-traders"
                className="bft-snap-strip gap-2 pb-1"
              >
                {displayedTraders.slice(0, 3).map((topTrader, idx) => {
                  const topRank = topTrader.rank || idx + 1;
                  const topSub = activeSubscriptions[topTrader.id];
                  const topIsCopying = Boolean(topSub && topSub.status === 'active');
                  const topIsFull = topTrader.current_copiers >= MAX_COPIERS_PER_TRADER && !topIsCopying;
                  return (
                    <div
                      key={`swipe-${topTrader.id}`}
                      className="bft-snap-card w-[235px] p-2.5 rounded-xl bg-gradient-to-br from-[#131929] to-[#0D111C] border border-slate-700/80 flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black font-mono shrink-0 ${
                              topRank === 1
                                ? 'bg-amber-400 text-slate-950'
                                : topRank === 2
                                ? 'bg-slate-300 text-slate-950'
                                : 'bg-amber-600 text-white'
                            }`}
                          >
                            #{topRank}
                          </span>
                          <CountryFlagIcon
                            isoCode={topTrader.country_code}
                            country={topTrader.country}
                            flagEmoji={topTrader.flag}
                            className="w-4 h-3 object-cover rounded-xs shrink-0"
                          />
                          <span className="text-xs font-black text-white truncate">
                            {topTrader.provider_name}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono font-bold text-[#00F5A0] bg-emerald-500/15 px-1.5 py-0.2 rounded shrink-0">
                          {topTrader.win_rate_3m}% WR
                        </span>
                      </div>

                      <div className="flex items-center justify-between font-mono bg-[#090C14] px-2 py-1 rounded-lg border border-slate-800/80">
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase block">24H Profit</span>
                          <span className="text-xs font-black text-[#00F5A0]">
                            +${topTrader.daily_profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[8px] text-slate-400 uppercase block">90D ROI</span>
                          <span className="text-xs font-black text-amber-300">
                            +{topTrader.three_month_profit_pct}%
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playUiClick();
                            setViewingTrader(topTrader);
                          }}
                          className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono font-bold text-slate-300 bft-touch-scale cursor-pointer"
                        >
                          Stats
                        </button>
                        <button
                          type="button"
                          disabled={topIsFull}
                          onClick={() =>
                            topIsCopying
                              ? handleCancelSubscription(topTrader)
                              : handleOpenCopyConfig(topTrader)
                          }
                          className={`flex-1 py-1 px-2 rounded-lg font-black text-[10px] uppercase tracking-wider bft-touch-scale cursor-pointer ${
                            topIsCopying
                              ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                              : topIsFull
                              ? 'bg-slate-800 text-slate-500'
                              : 'bg-[#00F5A0] text-[#07080B]'
                          }`}
                        >
                          {topIsCopying ? 'Stop' : topIsFull ? 'Full' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <RefreshCw className="w-7 h-7 text-[#00F5A0] animate-spin" />
              <p className="text-slate-400 font-mono text-xs uppercase tracking-widest">
                Synchronizing 200-Trader Master Pool...
              </p>
            </div>
          ) : displayedTraders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 space-y-3 text-center">
              <ShieldAlert className="w-8 h-8 text-amber-400" />
              <div>
                <p className="text-white font-bold text-xs sm:text-sm">No Master Trader Found Matching "{searchQuery}"</p>
                <p className="text-slate-400 font-mono text-[11px] mt-1">
                  Try searching any numeric Trader ID between #100101 and #100300.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-mono text-white cursor-pointer bft-touch-scale"
              >
                Reset Search to Daily Top 10
              </button>
            </div>
          ) : (
            displayedTraders.map((trader, index) => {
              const sub = activeSubscriptions[trader.id];
              const isCopying = Boolean(sub && sub.status === 'active');
              const isFull = trader.current_copiers >= MAX_COPIERS_PER_TRADER && !isCopying;
              const displayRank = trader.rank || index + 1;

              return (
                <MasterTraderCardItem
                  key={trader.id}
                  trader={trader}
                  displayRank={displayRank}
                  isCopying={isCopying}
                  isFull={isFull}
                  onViewStats={setViewingTrader}
                  onCancelSubscription={handleCancelSubscription}
                  onOpenCopyConfig={handleOpenCopyConfig}
                />
              );
            })
          )}
        </div>

        {/* Bottom Footer (Compact on Mobile) */}
        <div className="px-3 sm:px-6 py-2 sm:py-3 border-t border-slate-800/60 bg-[#0B0E17] flex items-center justify-between gap-2 text-[10px] sm:text-[11px] font-mono text-slate-400 shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 min-w-0">
            <span className="flex items-center gap-1 text-slate-300 truncate">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00F5A0] shrink-0" />
              <span className="truncate">100% Profit Keep (0% Fee)</span>
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">Provider Requirement: ≥{MIN_PROVIDER_WIN_RATE_3M}% 90-Day Win Rate</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 sm:px-5 py-1.5 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-bold text-[10.5px] sm:text-xs uppercase cursor-pointer shrink-0 bft-touch-scale"
          >
            Close
          </button>
        </div>
      </div>

      {/* Detailed Trader Profile Modal */}
      {viewingTrader && (
        <div
          data-testid="trader-profile-detail-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in"
          onClick={() => setViewingTrader(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#0B0E17] border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#141926] border border-slate-700 flex items-center justify-center">
                  <CountryFlagIcon
                    isoCode={viewingTrader.country_code}
                    country={viewingTrader.country}
                    flagEmoji={viewingTrader.flag}
                    className="w-10 h-7 object-cover rounded-xs"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black text-white">{viewingTrader.provider_name}</h3>
                    <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 font-mono text-xs font-bold text-cyan-300">
                      ID #{viewingTrader.numeric_id}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#00F5A0]/15 border border-[#00F5A0]/30 font-mono text-[10px] font-bold text-[#00F5A0]">
                      100% Profit Keep
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-400 mt-1">
                    {viewingTrader.account_type_label} • {viewingTrader.strategy_title} • {viewingTrader.country}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close Trader Profile"
                onClick={() => setViewingTrader(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Balances & All-Time Withdrawals */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-[#111624] border border-slate-800">
                <p className="text-[10px] font-mono text-slate-400 uppercase">Starting Balance</p>
                <p className="text-lg font-mono font-black text-white mt-1">
                  ${viewingTrader.starting_balance.toLocaleString()}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-[#111624] border border-[#00F5A0]/30">
                <p className="text-[10px] font-mono text-[#00F5A0] uppercase">Current Balance</p>
                <p className="text-lg font-mono font-black text-[#00F5A0] mt-1">
                  ${viewingTrader.current_balance.toLocaleString()}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-[#111624] border border-amber-500/30">
                <p className="text-[10px] font-mono text-amber-400 uppercase">All-Time Withdrawals</p>
                <p className="text-lg font-mono font-black text-amber-300 mt-1">
                  ${viewingTrader.all_time_withdrawals.toLocaleString()}
                </p>
              </div>
            </div>

            {/* 4-Period ROI Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#111624] border border-slate-800">
                <p className="text-[10px] font-mono text-slate-400 uppercase">Daily ROI</p>
                <p className="text-sm font-mono font-black text-[#00F5A0] mt-1">
                  +${viewingTrader.daily_profit.toLocaleString()}
                </p>
                <p className="text-xs font-mono text-[#00F5A0]/80">+{viewingTrader.daily_profit_pct}%</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#111624] border border-slate-800">
                <p className="text-[10px] font-mono text-slate-400 uppercase">Weekly ROI</p>
                <p className="text-sm font-mono font-black text-white mt-1">
                  +${viewingTrader.weekly_profit.toLocaleString()}
                </p>
                <p className="text-xs font-mono text-emerald-400">+{viewingTrader.weekly_profit_pct}%</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#111624] border border-slate-800">
                <p className="text-[10px] font-mono text-slate-400 uppercase">Monthly ROI</p>
                <p className="text-sm font-mono font-black text-white mt-1">
                  +${viewingTrader.monthly_profit.toLocaleString()}
                </p>
                <p className="text-xs font-mono text-emerald-400">+{viewingTrader.monthly_profit_pct}%</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#111624] border border-slate-800">
                <p className="text-[10px] font-mono text-slate-400 uppercase">3-Month ROI</p>
                <p className="text-sm font-mono font-black text-amber-300 mt-1">
                  +${viewingTrader.three_month_profit.toLocaleString()}
                </p>
                <p className="text-xs font-mono text-amber-400">+{viewingTrader.three_month_profit_pct}%</p>
              </div>
            </div>

            {/* Verification & Capacity Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#111624] border border-slate-800">
                <span className="text-slate-400 block text-[10px]">3M Win Rate</span>
                <strong className="text-[#00F5A0] text-sm">{viewingTrader.win_rate_3m}%</strong>
              </div>
              <div className="p-3 rounded-xl bg-[#111624] border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Max Drawdown</span>
                <strong className="text-rose-400 text-sm">-{viewingTrader.max_drawdown}%</strong>
              </div>
              <div className="p-3 rounded-xl bg-[#111624] border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Profit Factor</span>
                <strong className="text-white text-sm">{viewingTrader.profit_factor}x</strong>
              </div>
              <div className="p-3 rounded-xl bg-[#111624] border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Copier Capacity</span>
                <strong className="text-cyan-300 text-sm">
                  {viewingTrader.current_copiers} / {MAX_COPIERS_PER_TRADER}
                </strong>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => setViewingTrader(null)}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase cursor-pointer touch-manipulation"
              >
                Close
              </button>
              <button
                type="button"
                data-testid="modal-copy-trader-cta"
                onClick={() => handleOpenCopyConfig(viewingTrader)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#00F5A0] hover:brightness-110 text-[#07080B] font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg touch-manipulation"
              >
                {activeSubscriptions[viewingTrader.id]?.status === 'active'
                  ? 'Stop Copying Trader'
                  : `Copy ${viewingTrader.provider_name} (#${viewingTrader.numeric_id})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Copy Risk Management Configuration Modal */}
      {showRiskConfigModal && (
        <div
          data-testid="copy-risk-config-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in"
          onClick={() => setShowRiskConfigModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0B0E17] border border-slate-700 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2 uppercase">
                  <Settings2 className="w-5 h-5 text-[#00F5A0]" />
                  <span>Copy Risk Configuration</span>
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Master Trader: <strong className="text-white">{showRiskConfigModal.provider_name}</strong> (ID #{showRiskConfigModal.numeric_id})
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Risk Configuration"
                onClick={() => setShowRiskConfigModal(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Account Selector inside Risk Modal */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
                1. Follower Account (Instant Funded $25K/$50K/$100K or Self-Capital $100+)
              </label>
              <select
                aria-label="Follower Account for Copy Trading"
                data-testid="risk-modal-account-select"
                value={selectedCopyAccountId}
                onChange={(e) => setSelectedCopyAccountId(e.target.value)}
                className="w-full bg-[#121726] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none focus:border-[#00F5A0]"
              >
                {copierEligibility.allEvaluations.map(({ account, result }) => (
                  <option key={account.id} value={account.id}>
                    {account.tierName || account.id} (${Number(account.currentBalance || 0).toLocaleString()}) —{' '}
                    {result.eligible ? 'ELIGIBLE' : `BLOCKED: ${result.code}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Per-Trade Allocation Mode ($ vs % of Balance) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold uppercase text-slate-400">
                  2. Per-Trade Allocation ($ or % of Balance)
                </label>
                <span className="text-[10px] font-mono text-[#00F5A0]">
                  Available: ${copierEligibility.selectedResult.availableBalance.toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="allocation-type-amount-btn"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setPerTradeAllocationType('amount');
                    setPerTradeAllocationValue(100);
                  }}
                  className={`py-2.5 px-3 rounded-xl font-mono font-bold text-xs border flex items-center justify-center gap-1.5 cursor-pointer ${
                    perTradeAllocationType === 'amount'
                      ? 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0]'
                      : 'bg-[#121726] border-slate-800 text-slate-400'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Fixed Amount ($)</span>
                </button>
                <button
                  type="button"
                  data-testid="allocation-type-percentage-btn"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setPerTradeAllocationType('percentage');
                    setPerTradeAllocationValue(2);
                  }}
                  className={`py-2.5 px-3 rounded-xl font-mono font-bold text-xs border flex items-center justify-center gap-1.5 cursor-pointer ${
                    perTradeAllocationType === 'percentage'
                      ? 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0]'
                      : 'bg-[#121726] border-slate-800 text-slate-400'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>Balance Percent (%)</span>
                </button>
              </div>

              <input
                type="number"
                data-testid="per-trade-allocation-input"
                aria-label="Per-Trade Allocation Value"
                value={perTradeAllocationValue}
                onChange={(e) => setPerTradeAllocationValue(Math.max(0, Number(e.target.value)))}
                className="w-full bg-[#121726] border border-slate-700 focus:border-[#00F5A0] rounded-xl px-4 py-2.5 text-white text-sm font-mono outline-none"
              />
            </div>

            {/* Max Loss Stop, Target Profit Stop & Max Drawdown Stop */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-rose-400 block">
                  3. Max Loss Stop ($)
                </label>
                <input
                  type="number"
                  data-testid="max-loss-stop-input"
                  aria-label="Max Loss Stop in USD"
                  value={maxLossStopUsd}
                  onChange={(e) => setMaxLossStopUsd(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-[#121726] border border-slate-700 focus:border-rose-500 rounded-xl px-3 py-2 text-white text-xs sm:text-sm font-mono outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-[#00F5A0] block">
                  4. Target Profit ($)
                </label>
                <input
                  type="number"
                  data-testid="target-profit-stop-input"
                  aria-label="Target Profit Stop in USD"
                  value={targetProfitStopUsd}
                  onChange={(e) => setTargetProfitStopUsd(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-[#121726] border border-slate-700 focus:border-[#00F5A0] rounded-xl px-3 py-2 text-white text-xs sm:text-sm font-mono outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-amber-400 block">
                  5. Max Drawdown (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="50"
                  data-testid="max-drawdown-stop-input"
                  aria-label="Max Drawdown Percentage"
                  value={maxDrawdownPercent}
                  onChange={(e) => setMaxDrawdownPercent(Math.max(0.5, Number(e.target.value)))}
                  className="w-full bg-[#121726] border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-white text-xs sm:text-sm font-mono outline-none"
                />
              </div>
            </div>

            {/* 100% Profit Share Guarantee Box */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono flex items-center justify-between">
              <span className="text-slate-200">Follower Profit Share:</span>
              <strong className="text-[#00F5A0]">100% Profit Keep (0% Commission)</strong>
            </div>

            {riskErrorNotice && (
              <div
                data-testid="copy-risk-error-alert"
                className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-mono"
              >
                {riskErrorNotice}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowRiskConfigModal(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase cursor-pointer touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-copy-allocation-btn"
                onClick={handleConfirmCopySubscription}
                className="flex-1 py-3 rounded-xl bg-[#00F5A0] hover:brightness-110 text-[#07080B] font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg touch-manipulation"
              >
                Confirm & Start Copying
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider Registration Gatekeeper Modal (Strict >= 60% 3-Month Win Rate) */}
      {showProviderModal && (
        <div
          data-testid="provider-registration-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in"
          onClick={() => setShowProviderModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0B0E17] border border-slate-700 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2 uppercase">
                <Award className="w-5 h-5 text-[#ff8800]" />
                <span>Join as Copy Master / Provider</span>
              </h3>
              <button
                type="button"
                aria-label="Close Provider Modal"
                onClick={() => setShowProviderModal(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-200 leading-relaxed">
              <strong>Strict Gatekeeper Rule:</strong> Only traders with a proven{' '}
              <span className="text-white font-black underline">minimum 60% Win Rate over the last 3 months (90 days)</span>{' '}
              are permitted to register as a Copy Master / Provider.
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                  Strategy Title
                </label>
                <input
                  type="text"
                  data-testid="provider-strategy-name-input"
                  aria-label="Strategy Title"
                  value={providerStrategyName}
                  onChange={(e) => setProviderStrategyName(e.target.value)}
                  className="w-full bg-[#121726] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-[#00F5A0]"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                  Leaderboard Category
                </label>
                <select
                  aria-label="Leaderboard Category"
                  data-testid="provider-category-select"
                  value={providerCategory}
                  onChange={(e) => setProviderCategory(e.target.value as 'instant_funded' | 'self_capital')}
                  className="w-full bg-[#121726] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-[#00F5A0]"
                >
                  <option value="instant_funded">Instant Funded Traders Pool</option>
                  <option value="self_capital">Self-Capital Traders Pool</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-bold">
                    Verified 90-Day (3-Month) Win Rate (%)
                  </label>
                  <span
                    className={`text-[10px] font-black ${
                      auditedWinRate90d >= MIN_PROVIDER_WIN_RATE_3M ? 'text-[#00F5A0]' : 'text-rose-400'
                    }`}
                  >
                    {auditedWinRate90d >= MIN_PROVIDER_WIN_RATE_3M ? 'ELIGIBLE (≥60%)' : 'BELOW 60% MINIMUM'}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  data-testid="provider-winrate-input"
                  aria-label="Verified 90-Day Win Rate Percentage"
                  value={auditedWinRate90d}
                  onChange={(e) => {
                    setAuditedWinRate90d(Number(e.target.value));
                    setProviderErrorNotice(null);
                  }}
                  className="w-full bg-[#121726] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-[#00F5A0]"
                />
              </div>
            </div>

            {providerErrorNotice && (
              <div
                data-testid="provider-gatekeeper-error"
                className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-mono leading-relaxed"
              >
                {providerErrorNotice}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowProviderModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase cursor-pointer touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="submit-provider-registration-btn"
                onClick={handleApplyAsProvider}
                className="flex-1 py-3 rounded-xl bg-[#00F5A0] hover:brightness-110 text-[#07080B] font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg touch-manipulation"
              >
                Verify & Join Pool
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copier Account Eligibility Restriction Modal */}
      {showEligibilityModal && (
        <div
          data-testid="copier-eligibility-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in"
          onClick={() => setShowEligibilityModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0B0E17] border border-rose-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl text-center space-y-5"
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white uppercase">
                Copy Account Eligibility Restriction
              </h3>
              <p
                data-testid="copier-restriction-reason"
                className="text-xs text-rose-200 font-mono leading-relaxed mt-2 bg-rose-500/10 border border-rose-500/25 p-3 rounded-xl"
              >
                {showEligibilityModal.reason}
              </p>
              <div className="text-[11px] text-slate-400 font-mono text-left mt-3 space-y-1.5 bg-[#111624] p-3.5 rounded-xl border border-slate-800">
                <div>• <strong className="text-white">Instant Funded:</strong> Must hold active $25K, $50K, or $100K account.</div>
                <div>• <strong className="text-rose-400">Challenge Accounts:</strong> Strictly barred from copying anyone.</div>
                <div>• <strong className="text-[#00F5A0]">Self-Capital:</strong> Minimum $100.00 real balance (excluding bonus).</div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowEligibilityModal(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEligibilityModal(null);
                  onClose();
                  if (onNavigateToPricing) onNavigateToPricing();
                }}
                className="flex-1 py-3 rounded-xl bg-[#00F5A0] text-[#07080B] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Get Eligible Account</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastNotice && (
        <div
          data-testid="copy-trading-toast"
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-5 py-3.5 rounded-2xl font-mono font-bold text-xs shadow-2xl flex items-center gap-2.5 max-w-xl border ${
            toastNotice.type === 'error'
              ? 'bg-rose-950/95 border-rose-500 text-rose-100'
              : 'bg-[#00F5A0] border-emerald-300 text-[#07080B]'
          }`}
        >
          {toastNotice.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#07080B]" />
          )}
          <span>{toastNotice.text}</span>
        </div>
      )}
    </div>
  );
};
