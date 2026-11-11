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
  ROTATION_INTERVAL_MS,
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
  getRotatedTop24hTraders,
  computeDynamicTraderTimeframeStats,
  queryCopyTradersPool,
  validateCopyTradingAccountTypeMatch,
  getCanonicalAccountDatabaseUuid,
  SOCIAL_TRADING_TOP_24H_TRADERS,
  type CopyTraderProfileData,
  type CopySubscriptionData,
} from '../utils/copyTradingRules';
import {
  resolveSelectedFollowerAccount,
  isPlaceholderOrUnselectedAccountValue,
  resolveAuthUserId,
  resolveCopierAccountId,
  isSubscriptionStoppedLocally,
} from '../utils/copyTradingSync';
import { isValidUuid, ensureTradeUuid } from '../utils/supabaseTradeSync';
import { isDemoAccount } from '../utils/propRules';

/**
 * Renders the business suit silhouette SVG used inside circular & VIP octagonal trader avatars
 */
const SuitSilhouetteSvg: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg viewBox="0 0 100 100" className={className}>
    <rect width="100" height="100" fill="#bac2cf" />
    {/* Shoulders / Suit jacket */}
    <path d="M12 100 C14 78, 28 70, 50 70 C72 70, 86 78, 88 100 Z" fill="#778396" />
    {/* White shirt V-neck */}
    <polygon points="39,71 50,96 61,71" fill="#e6ecf5" />
    {/* Tie */}
    <polygon points="48,76 52,76 54,96 50,100 46,96" fill="#778396" />
    {/* Suit lapels */}
    <polygon points="35,71 46,94 39,71" fill="#687488" />
    <polygon points="65,71 54,94 61,71" fill="#687488" />
    {/* Neck */}
    <rect x="43" y="56" width="14" height="17" rx="4" fill="#778396" />
    {/* Head & ears */}
    <ellipse cx="34.5" cy="42" rx="3" ry="5.5" fill="#778396" />
    <ellipse cx="65.5" cy="42" rx="3" ry="5.5" fill="#778396" />
    <path
      d="M35 36 C35 22, 65 22, 65 36 C65 51, 59 61, 50 61 C41 61, 35 51, 35 36 Z"
      fill="#778396"
    />
    {/* Hair contour */}
    <path
      d="M34 35 C34 21, 45 18, 53 20 C61 21, 66 26, 65 35 C63 29, 56 26, 48 26 C40 26, 36 30, 34 35 Z"
      fill="#6d798c"
    />
  </svg>
);

/**
 * Renders the 44x44 trader avatar for each row in the Social Trading list matching Screenshot 2
 */
const SocialTraderRowAvatar: React.FC<{ trader: CopyTraderProfileData }> = ({ trader }) => {
  const variant = trader.avatar_variant || 'gold_ring_silhouette';

  // VIP Octagonal Frame variants
  if (variant.startsWith('vip_octagon')) {
    return (
      <div className="relative w-11 h-11 shrink-0 select-none flex items-center justify-center">
        <svg viewBox="0 0 48 48" className="w-11 h-11">
          <defs>
            <clipPath id={`oct-clip-${trader.id}`}>
              <polygon points="15,4 33,4 44,15 44,31 33,42 15,42 4,31 4,15" />
            </clipPath>
          </defs>
          {/* Outer octagonal border */}
          <polygon
            points="14,2 34,2 46,14 46,32 34,44 14,44 2,32 2,14"
            fill="#1e2330"
            stroke="#c59b38"
            strokeWidth="2"
          />
          <g clipPath={`url(#oct-clip-${trader.id})`}>
            {variant === 'vip_octagon_flag_uz' ? (
              <g>
                <rect x="0" y="0" width="48" height="16" fill="#0099b5" />
                <rect x="0" y="16" width="48" height="1.5" fill="#ce1126" />
                <rect x="0" y="17.5" width="48" height="13" fill="#ffffff" />
                <rect x="0" y="30.5" width="48" height="1.5" fill="#ce1126" />
                <rect x="0" y="32" width="48" height="16" fill="#1eb53a" />
                <circle cx="14" cy="9" r="4" fill="#ffffff" />
                <circle cx="15.5" cy="9" r="3.3" fill="#0099b5" />
              </g>
            ) : variant === 'vip_octagon_flag_ru' ? (
              <g>
                <rect x="0" y="0" width="48" height="15" fill="#ffffff" />
                <rect x="0" y="15" width="48" height="15" fill="#0039a6" />
                <rect x="0" y="30" width="48" height="18" fill="#d52b1e" />
              </g>
            ) : variant === 'vip_octagon_flag_tm' ? (
              <g>
                <rect x="0" y="0" width="48" height="48" fill="#00843d" />
                <rect x="9" y="0" width="6" height="48" fill="#c8102e" />
                <circle cx="24" cy="14" r="4.5" fill="#ffffff" />
                <circle cx="22.5" cy="13.5" r="3.8" fill="#00843d" />
              </g>
            ) : (
              <foreignObject x="2" y="2" width="44" height="42">
                <SuitSilhouetteSvg />
              </foreignObject>
            )}
          </g>
          {/* Inner octagonal silver frame */}
          <polygon
            points="15,4 33,4 44,15 44,31 33,42 15,42 4,31 4,15"
            fill="none"
            stroke="#d4dce8"
            strokeWidth="1.5"
          />
          {/* Gold VIP ribbon at bottom */}
          <polygon points="10,36 38,36 34,45 14,45" fill="#e5a922" stroke="#1b202e" strokeWidth="1" />
          <text
            x="24"
            y="43"
            textAnchor="middle"
            fill="#1b202e"
            fontSize="7.5"
            fontWeight="900"
            fontFamily="Inter, sans-serif"
            letterSpacing="0.4"
          >
            VIP
          </text>
        </svg>
      </div>
    );
  }

  // Circular Ring variants (gold, blue, purple)
  const isBlue = variant.startsWith('blue_ring');
  const isPurple = variant.startsWith('purple_ring');
  const ringColor = isBlue ? '#2d74da' : isPurple ? '#7e42f5' : '#e5a01d';

  return (
    <div className="relative w-11 h-11 shrink-0 select-none">
      <div
        className="w-11 h-11 rounded-full p-[2px] flex items-center justify-center bg-[#202534]"
        style={{ border: `2.5px solid ${ringColor}` }}
      >
        <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-[#bac2cf]">
          {variant === 'blue_ring_flag_tj' ? (
            <svg viewBox="0 0 40 40" className="w-full h-full">
              <rect x="0" y="0" width="40" height="13" fill="#cc0000" />
              <rect x="0" y="13" width="40" height="14" fill="#ffffff" />
              <rect x="0" y="27" width="40" height="13" fill="#006600" />
              <circle cx="20" cy="20" r="3.5" fill="none" stroke="#f8c300" strokeWidth="1.5" />
            </svg>
          ) : variant === 'purple_ring_photo_1' ? (
            <svg viewBox="0 0 40 40" className="w-full h-full">
              <rect width="40" height="40" fill="#5c7a58" />
              <path d="M6 40 C8 29, 14 26, 20 26 C26 26, 32 29, 34 40 Z" fill="#3a3f47" />
              <circle cx="20" cy="16" r="7" fill="#d9a17c" />
              <path d="M13 14 C13 9, 27 9, 27 14 C25 11, 15 11, 13 14 Z" fill="#1e1b18" />
              <rect x="14.5" y="14.5" width="4.5" height="3" rx="0.8" fill="none" stroke="#1e1b18" strokeWidth="1" />
              <rect x="21" y="14.5" width="4.5" height="3" rx="0.8" fill="none" stroke="#1e1b18" strokeWidth="1" />
            </svg>
          ) : variant === 'purple_ring_photo_2' ? (
            <svg viewBox="0 0 40 40" className="w-full h-full">
              <rect width="40" height="40" fill="#2c3e55" />
              <path d="M7 40 C9 28, 15 25, 20 25 C25 25, 31 28, 33 40 Z" fill="#d59c78" />
              <circle cx="20" cy="15.5" r="6.8" fill="#e0a884" />
              <path d="M13.5 13 C14 8.5, 26 8.5, 26.5 13 Z" fill="#3b281e" />
            </svg>
          ) : (
            <SuitSilhouetteSvg />
          )}
        </div>
      </div>

      {/* Top-right pentagon status badge */}
      <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#202534] flex items-center justify-center">
        <svg viewBox="0 0 16 16" className="w-3 h-3">
          <polygon points="8,1.5 14.5,6 12,14 4,14 1.5,6" fill={ringColor} />
        </svg>
      </div>
    </div>
  );
};

/**
 * Renders the large 120x120 circular avatar with thick gold border and pentagon badge for the Trader Profile Modal (Screenshot 1)
 */
const SocialTraderProfileLargeAvatar: React.FC<{ trader: CopyTraderProfileData }> = ({ trader }) => {
  return (
    <div className="relative w-[122px] h-[122px] shrink-0 select-none">
      <div className="w-full h-full rounded-full border-[4.5px] border-[#e5a01d] p-[3.5px] bg-[#1f2433] flex items-center justify-center">
        <div className="w-full h-full rounded-full overflow-hidden bg-[#bac2cf] flex items-center justify-center">
          <SuitSilhouetteSvg />
        </div>
      </div>
      {/* Top-right dark navy circle with gold pentagon icon */}
      <div
        data-testid={`profile-badge-${trader.social_profile_id || trader.numeric_id}`}
        className="absolute top-0.5 right-0 w-8 h-8 rounded-full bg-[#1f2433] flex items-center justify-center shadow-md"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5">
          <polygon points="12,2.5 21.5,9.2 17.8,20.5 6.2,20.5 2.5,9.2" fill="#e5a01d" />
        </svg>
      </div>
    </div>
  );
};

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
  activeAccount?: TradingAccount | null;
  onViewStats: (trader: CopyTraderProfileData) => void;
  onCancelSubscription: (trader: CopyTraderProfileData) => void;
  onOpenCopyConfig: (trader: CopyTraderProfileData) => void;
}

const MasterTraderCardItem: React.FC<MasterTraderCardItemProps> = React.memo(({
  trader,
  displayRank,
  isCopying,
  isFull,
  activeAccount,
  onViewStats,
  onCancelSubscription,
  onOpenCopyConfig,
}) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(displayRank === 1);
  const matchResult = validateCopyTradingAccountTypeMatch(activeAccount, trader);

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
              <span
                data-testid={`trader-compatibility-badge-${trader.numeric_id}`}
                className={`text-[8.5px] sm:text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${matchResult.badgeColor}`}
              >
                {matchResult.badgeLabel}
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
              data-testid={`quick-copy-btn-${trader.numeric_id}`}
              onClick={() => onOpenCopyConfig(trader)}
              className={`flex-1 py-1.5 sm:py-2 px-3 rounded-lg sm:rounded-xl font-black text-[10.5px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 bft-touch-scale min-h-[34px] sm:min-h-[42px] ${
                isFull
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-[#00F5A0] hover:brightness-110 text-[#07080B] cursor-pointer shadow-md'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>{isFull ? '200/200 Full' : 'Quick Copy'}</span>
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
  const [mainViewMode, setMainViewMode] = useState<'leaderboard' | 'my_subscriptions'>('leaderboard');
  const [activeTab, setActiveTab] = useState<'instant_funded' | 'self_capital'>('instant_funded');
  const [socialFilterOption, setSocialFilterOption] = useState<
    'top_24h' | 'instant_funded' | 'self_capital' | 'my_subscriptions'
  >('top_24h');
  const [isSocialFilterDropdownOpen, setIsSocialFilterDropdownOpen] = useState<boolean>(false);
  const [isToolsDrawerOpen, setIsToolsDrawerOpen] = useState<boolean>(false);
  const [profileActiveTab, setProfileActiveTab] = useState<'trading' | 'social'>('trading');
  const [profileTimeframe, setProfileTimeframe] = useState<
    'Today' | 'Yesterday' | 'Last 7 days' | 'Last 30 days' | 'All time'
  >('Today');
  const [isProfileDateDropdownOpen, setIsProfileDateDropdownOpen] = useState<boolean>(false);
  const [watchedTraderIds, setWatchedTraderIds] = useState<string[]>([]);
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
      if (!raw) return {};
      const parsed = JSON.parse(raw) || {};
      const cleaned: Record<string, CopySubscriptionData> = {};
      for (const [k, val] of Object.entries(parsed)) {
        const sub = val as CopySubscriptionData;
        if (
          sub &&
          sub.status === 'active' &&
          !isSubscriptionStoppedLocally(sub.id, sub.provider_id) &&
          !isSubscriptionStoppedLocally(k, sub.provider_id)
        ) {
          cleaned[k] = sub;
        }
      }
      return cleaned;
    } catch {
      return {};
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const findMatchingSubscriptionForTrader = (
    trader: CopyTraderProfileData,
    subsMap: Record<string, CopySubscriptionData> = activeSubscriptions
  ): CopySubscriptionData | undefined => {
    if (!trader) return undefined;
    const traderUuid = ensureTradeUuid(trader.id);
    const direct = subsMap[trader.id] || subsMap[traderUuid];
    if (
      direct &&
      direct.status === 'active' &&
      !isSubscriptionStoppedLocally(direct.id, direct.provider_id)
    ) {
      return direct;
    }
    for (const s of Object.values(subsMap)) {
      if (
        s &&
        s.status === 'active' &&
        !isSubscriptionStoppedLocally(s.id, s.provider_id) &&
        (s.provider_id === trader.id ||
          s.provider_id === traderUuid ||
          ensureTradeUuid(String(s.provider_id || '')) === traderUuid ||
          (s.provider_numeric_id &&
            String(s.provider_numeric_id) === String(trader.numeric_id)) ||
          (s.provider_name && s.provider_name === trader.provider_name))
      ) {
        return s;
      }
    }
    return undefined;
  };

  const activeSubscriptionsList = useMemo(() => {
    const seenTraders = new Set<string>();
    const list: CopySubscriptionData[] = [];
    for (const s of Object.values(activeSubscriptions)) {
      if (
        !s ||
        s.status !== 'active' ||
        isSubscriptionStoppedLocally(s.id, s.provider_id)
      ) {
        continue;
      }
      const dedupeKey = ensureTradeUuid(String(s.provider_id || s.id));
      if (!seenTraders.has(dedupeKey)) {
        seenTraders.add(dedupeKey);
        list.push(s);
      }
    }
    return list;
  }, [activeSubscriptions]);
  const activeSubsCount = activeSubscriptionsList.length;

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

  const loadCopyTradingData = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    try {
      const freshPool = generate200TraderPool(Date.now());
      setFullPool(freshPool);
      setRotationInfo(getRotationWindowInfo(Date.now()));

      const subsRes = await apiGetSubscriptions(userProfile?.id);
      if (subsRes.ok && Array.isArray(subsRes.subscriptions)) {
        setActiveSubscriptions((prev) => {
          const nextMap: Record<string, CopySubscriptionData> = {};

          // Preserve valid active local subscriptions that have not been stopped
          for (const [k, existing] of Object.entries(prev)) {
            if (
              existing &&
              existing.status === 'active' &&
              !isSubscriptionStoppedLocally(existing.id, existing.provider_id) &&
              !isSubscriptionStoppedLocally(k, existing.provider_id)
            ) {
              nextMap[k] = existing;
            }
          }

          // Merge active subscriptions from Supabase, normalizing keys to match pool traders
          for (const sub of subsRes.subscriptions) {
            if (
              !sub ||
              !sub.provider_id ||
              String(sub.status || '').toLowerCase() !== 'active' ||
              isSubscriptionStoppedLocally(sub.id, sub.provider_id)
            ) {
              continue;
            }

            const matchedTrader = freshPool.find(
              (t) =>
                t.id === sub.provider_id ||
                ensureTradeUuid(t.id) === sub.provider_id ||
                (sub.provider_numeric_id &&
                  String(t.numeric_id) === String(sub.provider_numeric_id)) ||
                (sub.provider_name && t.provider_name === sub.provider_name)
            );

            const canonicalKey = matchedTrader ? matchedTrader.id : sub.provider_id;
            const prevEntry = nextMap[canonicalKey] || nextMap[sub.provider_id];

            if (canonicalKey !== sub.provider_id && nextMap[sub.provider_id]) {
              delete nextMap[sub.provider_id];
            }

            nextMap[canonicalKey] = {
              id: sub.id || prevEntry?.id || `SUB-${canonicalKey}`,
              provider_id: canonicalKey,
              provider_numeric_id:
                sub.provider_numeric_id ||
                prevEntry?.provider_numeric_id ||
                matchedTrader?.numeric_id,
              provider_name:
                sub.provider_name ||
                prevEntry?.provider_name ||
                matchedTrader?.provider_name,
              copier_account_id: sub.copier_account_id || prevEntry?.copier_account_id,
              copier_account_type:
                sub.copier_account_type ||
                prevEntry?.copier_account_type ||
                matchedTrader?.account_category,
              per_trade_allocation_type:
                sub.per_trade_allocation_type ||
                prevEntry?.per_trade_allocation_type ||
                'amount',
              per_trade_allocation_value: Number(
                sub.per_trade_allocation_value ??
                  sub.trade_amount ??
                  sub.allocated_capital ??
                  prevEntry?.per_trade_allocation_value ??
                  100
              ),
              allocated_capital: Number(
                sub.allocated_capital ??
                  sub.trade_amount ??
                  prevEntry?.allocated_capital ??
                  100
              ),
              max_loss_limit: Number(
                sub.max_loss_limit ?? sub.stop_loss ?? prevEntry?.max_loss_limit ?? 250
              ),
              stop_loss: Number(
                sub.stop_loss ?? sub.max_loss_limit ?? prevEntry?.stop_loss ?? 250
              ),
              take_profit_limit: Number(
                sub.take_profit_limit ??
                  sub.take_profit ??
                  prevEntry?.take_profit_limit ??
                  500
              ),
              take_profit: Number(
                sub.take_profit ??
                  sub.take_profit_limit ??
                  prevEntry?.take_profit ??
                  500
              ),
              max_drawdown: Number(sub.max_drawdown ?? prevEntry?.max_drawdown ?? 5.0),
              trade_sizing_type:
                sub.trade_sizing_type || prevEntry?.trade_sizing_type || 'proportionate',
              sizing_multiplier: Number(
                sub.sizing_multiplier ?? prevEntry?.sizing_multiplier ?? 1
              ),
              status: 'active',
              current_pnl: Number(sub.current_pnl ?? prevEntry?.current_pnl ?? 0),
              commission_pct: 0,
            };
          }

          try {
            localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(nextMap));
          } catch {
            // ignore
          }
          return nextMap;
        });
      }

      await apiGetCopyTraders(activeTab, searchQuery, LEADERBOARD_TOP_LIMIT).catch(() => {});
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
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

  // Merge accounts list with global activeAccount context so the active live account is always available
  const effectiveAccounts = useMemo(() => {
    const list: TradingAccount[] = Array.isArray(accounts) ? [...accounts] : [];
    if (
      activeAccount &&
      !list.some(
        (a) =>
          a.id === activeAccount.id ||
          (a.supabaseAccountId &&
            activeAccount.supabaseAccountId &&
            a.supabaseAccountId === activeAccount.supabaseAccountId)
      )
    ) {
      list.push(activeAccount);
    }
    return list;
  }, [accounts, activeAccount]);

  const userBonusFunds = useMemo(() => {
    return Math.max(
      0,
      Number(
        (userProfile as any)?.bonusFunds ??
          (activeAccount as any)?.bonusFunds ??
          0
      )
    );
  }, [userProfile, activeAccount]);

  // Evaluate copier eligibility across all user accounts
  const copierEligibility = useMemo(() => {
    const cleanSelected = !isPlaceholderOrUnselectedAccountValue(selectedCopyAccountId)
      ? selectedCopyAccountId
      : activeAccount?.supabaseAccountId || activeAccount?.id;
    const explicitCategory =
      socialFilterOption === 'instant_funded' || socialFilterOption === 'self_capital'
        ? socialFilterOption
        : undefined;
    return resolveCopierEligibilityForUser({
      selectedAccountId: cleanSelected,
      accounts: effectiveAccounts,
      userProfile,
      bonusFunds: userBonusFunds,
      targetProviderCategory: explicitCategory,
    });
  }, [selectedCopyAccountId, activeAccount, effectiveAccounts, userProfile, userBonusFunds, socialFilterOption]);

  // Resolve the active follower account and its database UUID with automatic fallback to global activeAccount
  const resolvedFollowerSelection = useMemo(() => {
    return resolveSelectedFollowerAccount({
      selectedCopyAccountId,
      accounts: effectiveAccounts,
      activeAccount,
      userProfile,
      copierSelectedAccount: copierEligibility.selectedAccount,
    });
  }, [
    selectedCopyAccountId,
    effectiveAccounts,
    activeAccount,
    userProfile,
    copierEligibility.selectedAccount,
  ]);

  // Keep selectedCopyAccountId synced to an eligible/active live account UUID if unselected
  useEffect(() => {
    if (
      isPlaceholderOrUnselectedAccountValue(selectedCopyAccountId) &&
      resolvedFollowerSelection.selectedOptionValue
    ) {
      setSelectedCopyAccountId(resolvedFollowerSelection.selectedOptionValue);
    }
  }, [selectedCopyAccountId, resolvedFollowerSelection.selectedOptionValue]);

  // Listen for automatic or manual stop-out / take-profit events
  useEffect(() => {
    const handleStopped = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      setActiveSubscriptions((prev) => {
        const next = { ...prev };
        const targetProviderUuid = detail.providerId ? ensureTradeUuid(String(detail.providerId)) : '';
        for (const k of Object.keys(next)) {
          const item = next[k];
          if (
            !item ||
            item.id === detail.subscriptionId ||
            item.provider_id === detail.providerId ||
            item.provider_id === detail.resolvedProviderId ||
            (targetProviderUuid && ensureTradeUuid(String(item.provider_id || '')) === targetProviderUuid) ||
            k === detail.providerId ||
            k === detail.resolvedProviderId ||
            (targetProviderUuid && ensureTradeUuid(k) === targetProviderUuid)
          ) {
            delete next[k];
          }
        }
        try {
          localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    };
    window.addEventListener('bft-copy-subscription-stopped', handleStopped);
    return () => window.removeEventListener('bft-copy-subscription-stopped', handleStopped);
  }, []);

  if (!isOpen) return null;

  const displayedTraders =
    !searchQuery.trim() && socialFilterOption === 'top_24h'
      ? getRotatedTop24hTraders(rotationInfo.rotationSlot * ROTATION_INTERVAL_MS, combinedPool)
      : queryResult.traders;

  const handleOpenCopyConfig = (trader: CopyTraderProfileData) => {
    soundEngine.playUiClick();
    setRiskErrorNotice(null);

    const sub = findMatchingSubscriptionForTrader(trader, activeSubscriptions);
    if (sub && sub.status === 'active') {
      handleCancelSubscription(trader, sub);
      return;
    }

    if (trader.current_copiers >= MAX_COPIERS_PER_TRADER) {
      triggerToast(
        `Capacity Reached: ${trader.provider_name} (#${trader.numeric_id}) has reached the maximum ${MAX_COPIERS_PER_TRADER} / ${MAX_COPIERS_PER_TRADER} copiers limit.`,
        'error'
      );
      return;
    }

    // Check if the currently selected account (or active account) matches the trader's account type
    const activeTargetAccount = resolvedFollowerSelection.targetAccount || activeAccount;
    const typeMatchEval = validateCopyTradingAccountTypeMatch(activeTargetAccount, trader);

    if (!typeMatchEval.isMatch) {
      setShowEligibilityModal({
        trader,
        reason: typeMatchEval.error || 'Account type mismatch.',
        code: 'ACCOUNT_TYPE_MISMATCH',
      });
      triggerToast(typeMatchEval.error || 'Account type mismatch.', 'error');
      return;
    }

    // Check if the currently selected account (or any matching user account) meets capital & tier rules
    const evalForTarget = resolveCopierEligibilityForUser({
      selectedAccountId:
        (!isPlaceholderOrUnselectedAccountValue(selectedCopyAccountId)
          ? selectedCopyAccountId
          : undefined) ||
        activeAccount?.supabaseAccountId ||
        activeAccount?.id,
      accounts: effectiveAccounts,
      userProfile,
      bonusFunds: userBonusFunds,
      targetProviderCategory: trader.account_category,
    });

    const compatibleEligibleAccounts = evalForTarget.eligibleAccounts.filter(
      (item) => item.result.accountCategory === trader.account_category
    );

    if (!evalForTarget.selectedResult.eligible && compatibleEligibleAccounts.length === 0) {
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
      const canonicalOptionId =
        getCanonicalAccountDatabaseUuid(bestEligible.account, userProfile) ||
        bestEligible.account.id;
      setSelectedCopyAccountId(canonicalOptionId);
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

  const handleCancelSubscription = async (
    trader: CopyTraderProfileData,
    explicitSub?: CopySubscriptionData
  ) => {
    soundEngine.playUiClick();

    const matchedSub = explicitSub || findMatchingSubscriptionForTrader(trader, activeSubscriptions);
    const traderUuid = ensureTradeUuid(trader.id);

    // 1. Instantly update UI state to reflect that the user is no longer copying this trader
    const next: Record<string, CopySubscriptionData> = {};
    for (const [k, item] of Object.entries(activeSubscriptions)) {
      const isTarget =
        k === trader.id ||
        k === traderUuid ||
        (matchedSub?.id && item?.id === matchedSub.id) ||
        (matchedSub?.provider_id && item?.provider_id === matchedSub.provider_id) ||
        item?.provider_id === trader.id ||
        item?.provider_id === traderUuid ||
        ensureTradeUuid(String(item?.provider_id || '')) === traderUuid ||
        (item?.provider_numeric_id &&
          String(item.provider_numeric_id) === String(trader.numeric_id)) ||
        (item?.provider_name && item.provider_name === trader.provider_name);

      if (!isTarget && item) {
        next[k] = item;
      }
    }
    saveSubscriptionsMap(next);

    // Decrement copier count on the trader card immediately
    setFullPool((prev) =>
      prev.map((t) =>
        t.id === trader.id || t.numeric_id === trader.numeric_id
          ? { ...t, current_copiers: Math.max(0, t.current_copiers - 1) }
          : t
      )
    );

    setViewingTrader(null);

    triggerToast(
      `Stopped copying ${trader.provider_name} (#${trader.numeric_id}). Subscription removed and 100% of your profits remain in your account.`,
      'success'
    );

    // 2. Execute update (`status = 'stopped'`) and delete mutation on Supabase `copy_trading_subscriptions`
    const targetAccountId =
      matchedSub?.copier_account_id ||
      resolvedFollowerSelection.dbAccountId ||
      selectedCopyAccountId ||
      activeAccount?.supabaseAccountId ||
      activeAccount?.id;

    await apiCancelCopy(trader.id, userProfile?.id, targetAccountId, {
      subscriptionId: matchedSub?.id,
      masterTraderId: matchedSub?.provider_id || trader.id,
      providerName: trader.provider_name,
      userEmail: userProfile?.email,
    });

    // 3. Refresh active subscriptions list silently to confirm synchronized state
    await loadCopyTradingData({ silent: true });
  };

  const handleConfirmCopySubscription = async () => {
    if (!showRiskConfigModal) return;
    soundEngine.playUiClick();
    setRiskErrorNotice(null);

    const { targetAccount, dbAccountId } = resolveSelectedFollowerAccount({
      selectedCopyAccountId,
      accounts: effectiveAccounts,
      activeAccount,
      userProfile,
      copierSelectedAccount: copierEligibility.selectedAccount,
    });

    if (!targetAccount || !dbAccountId) {
      const errorMsg = 'Trading Account Error: Unable to resolve active trading account ID for copy trading.';
      setRiskErrorNotice(errorMsg);
      triggerToast(errorMsg, 'error');
      return;
    }

    const matchValidation = validateCopyTradingAccountTypeMatch(targetAccount, showRiskConfigModal);
    if (!matchValidation.isMatch) {
      const errorMsg = matchValidation.error || 'Account type mismatch: Incompatible account types.';
      setRiskErrorNotice(errorMsg);
      triggerToast(errorMsg, 'error');
      return;
    }

    const singleAccountEval = evaluateSingleAccountCopyEligibility({
      account: targetAccount,
      userProfile,
      bonusFunds: userBonusFunds,
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

    let resolvedSupabaseAccountUuid =
      (targetAccount.supabaseAccountId && isValidUuid(targetAccount.supabaseAccountId)
        ? targetAccount.supabaseAccountId
        : null) ||
      (isValidUuid(dbAccountId) ? dbAccountId : null) ||
      (activeAccount &&
      !isDemoAccount(activeAccount) &&
      activeAccount.supabaseAccountId &&
      isValidUuid(activeAccount.supabaseAccountId)
        ? activeAccount.supabaseAccountId
        : null) ||
      (activeAccount && !isDemoAccount(activeAccount) && isValidUuid(activeAccount.id)
        ? activeAccount.id
        : null) ||
      (userProfile?.id && isValidUuid(userProfile.id) ? userProfile.id : null) ||
      dbAccountId;

    const authUserUuid = await resolveAuthUserId(userProfile?.id, userProfile?.email);
    if (authUserUuid) {
      const verifiedDbAccountUuid = await resolveCopierAccountId({
        userId: authUserUuid,
        accountId: resolvedSupabaseAccountUuid,
        supabaseAccountId: targetAccount.supabaseAccountId || resolvedSupabaseAccountUuid,
        accountType: singleAccountEval.accountCategory,
        startingBalance: Number(
          targetAccount.initialBalance || targetAccount.size || singleAccountEval.availableBalance || 50000
        ),
        currentBalance: Number(
          singleAccountEval.availableBalance || targetAccount.currentBalance || 50000
        ),
      });
      if (verifiedDbAccountUuid && isValidUuid(verifiedDbAccountUuid)) {
        resolvedSupabaseAccountUuid = verifiedDbAccountUuid;
      }
    }

    const res = await apiCopyTrader({
      userId: authUserUuid || userProfile?.id,
      userEmail: userProfile?.email,
      providerId: showRiskConfigModal.id,
      providerNumericId: showRiskConfigModal.numeric_id,
      providerName: showRiskConfigModal.provider_name,
      providerCategory: showRiskConfigModal.account_category,
      copierAccountId: resolvedSupabaseAccountUuid,
      copierSupabaseAccountId: resolvedSupabaseAccountUuid,
      copierAccountType: singleAccountEval.accountCategory,
      startingBalance: Number(
        targetAccount.initialBalance || targetAccount.size || singleAccountEval.availableBalance || 50000
      ),
      currentBalance: Number(
        singleAccountEval.availableBalance || targetAccount.currentBalance || 50000
      ),
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
        copier_account_id: res.subscription?.copier_account_id || resolvedSupabaseAccountUuid,
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

      // Dispatch immediate event so the background copy trading bot executes live simulated trades seamlessly
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('bft-copy-subscription-updated', {
            detail: {
              type: 'INSERT',
              subscription: newSub,
              providerId: showRiskConfigModal.id,
            },
          })
        );
      }

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

  const filterDropdownLabel =
    socialFilterOption === 'top_24h'
      ? 'Top ranked traders for 24h'
      : socialFilterOption === 'instant_funded'
      ? 'Top ranked traders (Instant Funded)'
      : socialFilterOption === 'self_capital'
      ? 'Top ranked traders (Self-Capital)'
      : `My Active Subscriptions (${activeSubsCount})`;

  // Compute timeframe-scaled stats for the currently viewed trader in the Trader Profile Modal
  const computeProfileStatsForTimeframe = (trader: CopyTraderProfileData) => {
    return computeDynamicTraderTimeframeStats(trader, profileTimeframe);
  };

  return (
    <div
      data-testid="copy-trading-modal"
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/55 backdrop-blur-[2px] animate-fade-in font-sans overflow-hidden"
      onClick={onClose}
    >
      {/* Main Social Trading Panel (Matches Screenshot 2 with 100% fidelity) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:w-[375px] md:w-[390px] h-full bg-[#1c202e] shadow-[-12px_0_40px_rgba(0,0,0,0.75)] flex flex-col border-l border-[#2c3246] overflow-hidden select-none"
      >
        {/* 1. Header: Dark container with centered "Social Trading" title */}
        <div className="bg-[#252a3a] border-b border-[#181c27] px-3.5 h-12 flex items-center justify-between shrink-0 relative">
          <button
            type="button"
            data-testid="toggle-social-tools-btn"
            title="Search / Account / Provider Options"
            onClick={() => {
              soundEngine.playUiClick();
              setIsToolsDrawerOpen((prev) => !prev);
            }}
            className={`p-1.5 rounded-md transition-colors cursor-pointer z-10 ${
              isToolsDrawerOpen
                ? 'bg-[#2d74da]/25 text-[#4da3ff]'
                : 'text-[#8b96b2] hover:text-white hover:bg-white/5'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          <h2
            data-testid="social-trading-header-title"
            className="text-[15.5px] font-semibold text-white tracking-tight absolute inset-x-0 text-center pointer-events-none"
          >
            Social Trading
          </h2>

          <div className="flex items-center gap-1 z-10">
            {activeSubsCount > 0 && (
              <button
                type="button"
                data-testid="active-subscriptions-badge"
                onClick={() => {
                  soundEngine.playUiClick();
                  setMainViewMode((prev) =>
                    prev === 'my_subscriptions' ? 'leaderboard' : 'my_subscriptions'
                  );
                }}
                className="px-2 py-0.5 rounded bg-[#4cd964]/20 border border-[#4cd964]/40 text-[#4cd964] text-[10px] font-bold cursor-pointer"
                title="Active Copy Subscriptions"
              >
                {activeSubsCount} Active
              </button>
            )}
            <button
              type="button"
              data-testid="close-copy-trading-btn"
              aria-label="Close Social Trading"
              onClick={onClose}
              className="p-1.5 rounded-md text-[#8b96b2] hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Dropdown Filter: "Top ranked traders for 24h" */}
        <div className="bg-[#1c202e] px-3.5 py-2.5 shrink-0 relative">
          <button
            type="button"
            data-testid="social-trading-filter-dropdown"
            onClick={() => {
              soundEngine.playUiClick();
              setIsSocialFilterDropdownOpen((prev) => !prev);
            }}
            className="w-full bg-[#242938] hover:bg-[#292f40] border border-[#373e52] rounded-md px-3.5 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Stopwatch / Rank Star Icon matching Screenshot 2 */}
              <svg
                viewBox="0 0 20 20"
                className="w-4 h-4 text-[#7c87a2] shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="10" cy="11" r="6.5" />
                <path d="M8 2.5h4M10 2.5v2" strokeLinecap="round" />
                <polygon
                  points="10,7.5 10.9,9.4 13,9.7 11.5,11.1 11.8,13.1 10,12.1 8.2,13.1 8.5,11.1 7,9.7 9.1,9.4"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
              <span className="text-[13.5px] font-semibold text-white truncate">
                {filterDropdownLabel}
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-white shrink-0 transition-transform duration-150 ${
                isSocialFilterDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Dropdown Menu Options */}
          {isSocialFilterDropdownOpen && (
            <div
              data-testid="social-filter-menu"
              className="absolute left-3.5 right-3.5 top-[54px] z-30 bg-[#242938] border border-[#373e52] rounded-md shadow-2xl overflow-hidden py-1"
            >
              <button
                type="button"
                data-testid="filter-option-top-24h"
                onClick={() => {
                  soundEngine.playUiClick();
                  setSocialFilterOption('top_24h');
                  setMainViewMode('leaderboard');
                  setSearchQuery('');
                  setIsSocialFilterDropdownOpen(false);
                }}
                className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between cursor-pointer ${
                  socialFilterOption === 'top_24h' && mainViewMode === 'leaderboard'
                    ? 'bg-[#2d74da]/25 text-white'
                    : 'text-[#b4bdd0] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>Top ranked traders for 24h</span>
                <span className="text-[10px] text-[#4cd964] font-bold">24H</span>
              </button>

              <button
                type="button"
                data-testid="tab-instant-funded"
                onClick={() => {
                  soundEngine.playUiClick();
                  setSocialFilterOption('instant_funded');
                  setActiveTab('instant_funded');
                  setMainViewMode('leaderboard');
                  setIsSocialFilterDropdownOpen(false);
                }}
                className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between cursor-pointer ${
                  socialFilterOption === 'instant_funded' && mainViewMode === 'leaderboard'
                    ? 'bg-[#2d74da]/25 text-white'
                    : 'text-[#b4bdd0] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>Top ranked traders (Instant Funded)</span>
                <span className="text-[10px] text-[#7c87a2]">100 Pool</span>
              </button>

              <button
                type="button"
                data-testid="tab-self-capital"
                onClick={() => {
                  soundEngine.playUiClick();
                  setSocialFilterOption('self_capital');
                  setActiveTab('self_capital');
                  setMainViewMode('leaderboard');
                  setIsSocialFilterDropdownOpen(false);
                }}
                className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between cursor-pointer ${
                  socialFilterOption === 'self_capital' && mainViewMode === 'leaderboard'
                    ? 'bg-[#2d74da]/25 text-white'
                    : 'text-[#b4bdd0] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>Top ranked traders (Self-Capital)</span>
                <span className="text-[10px] text-[#7c87a2]">100 Pool</span>
              </button>

              <button
                type="button"
                data-testid="view-subscriptions-tab"
                onClick={() => {
                  soundEngine.playUiClick();
                  setSocialFilterOption('my_subscriptions');
                  setMainViewMode('my_subscriptions');
                  setIsSocialFilterDropdownOpen(false);
                }}
                className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between cursor-pointer border-t border-[#32394c] ${
                  mainViewMode === 'my_subscriptions'
                    ? 'bg-[#2d74da]/25 text-white'
                    : 'text-[#b4bdd0] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>My Active Copy Subscriptions</span>
                <span className="px-1.5 py-0.2 rounded bg-[#4cd964]/20 text-[#4cd964] text-[10px] font-bold">
                  {activeSubsCount}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Search / Account / Provider Drawer (Accessible when Search icon is clicked) */}
        {isToolsDrawerOpen && (
          <div className="bg-[#181c28] border-b border-[#2a3042] px-3.5 py-2.5 space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#7c87a2] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                data-testid="copy-trader-search-input"
                aria-label="Search Traders by ID or Name"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (mainViewMode !== 'leaderboard') setMainViewMode('leaderboard');
                }}
                placeholder="Search trader ID (e.g. 11101163 or 100105)..."
                className="w-full bg-[#242938] border border-[#373e52] focus:border-[#2d74da] rounded-md pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-[#7c87a2] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7c87a2] hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Select Copying Account"
                data-testid="copy-account-selector"
                value={resolvedFollowerSelection.selectedOptionValue}
                onChange={(e) => setSelectedCopyAccountId(e.target.value)}
                className="flex-1 bg-[#242938] border border-[#373e52] rounded-md px-2.5 py-1.5 text-[11px] text-white outline-none truncate"
              >
                {copierEligibility.allEvaluations.map(({ account, result }) => {
                  const optionDbId =
                    getCanonicalAccountDatabaseUuid(account, userProfile) || account.id;
                  return (
                    <option key={account.id} value={optionDbId}>
                      {account.tierName || account.id} ($
                      {Number(account.currentBalance || 0).toLocaleString()}) —{' '}
                      {result.eligible ? 'ELIGIBLE' : 'RESTRICTED'}
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                data-testid="join-copy-provider-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  setProviderErrorNotice(null);
                  setShowProviderModal(true);
                }}
                className="px-2.5 py-1.5 rounded-md bg-[#2d74da] hover:bg-[#3882eb] text-white text-[11px] font-semibold shrink-0 cursor-pointer"
              >
                + Become Master
              </button>
            </div>
          </div>
        )}

        {/* 3. Section Tag: Small centered sub-header "REAL TRADING" in uppercase gray/white text */}
        <div
          data-testid="real-trading-section-tag"
          className="bg-[#191d2a] py-1.5 px-3 border-y border-[#151822] text-center shrink-0"
        >
          <span className="text-[10.5px] font-bold tracking-wider text-[#d5dce6] uppercase">
            {mainViewMode === 'my_subscriptions' ? 'ACTIVE COPY SUBSCRIPTIONS' : 'REAL TRADING'}
          </span>
        </div>

        {/* 4. Trader Rows List OR Active Copy Subscriptions */}
        {mainViewMode === 'my_subscriptions' ? (
          <div
            data-testid="active-subscriptions-section"
            className="flex-1 overflow-y-auto bg-[#202534] divide-y divide-[#171b26] custom-scrollbar"
          >
            {activeSubsCount === 0 ? (
              <div
                data-testid="empty-active-subscriptions"
                className="flex flex-col items-center justify-center py-16 px-5 text-center space-y-3"
              >
                <Users className="w-8 h-8 text-[#7c87a2]" />
                <p className="text-sm font-bold text-white">No Active Copy Subscriptions</p>
                <p className="text-xs text-[#7c87a2]">
                  Select any trader from the Social Trading list to view their profile and copy trades.
                </p>
                <button
                  type="button"
                  data-testid="explore-leaderboard-cta"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setSocialFilterOption('top_24h');
                    setMainViewMode('leaderboard');
                  }}
                  className="px-4 py-2 rounded-md bg-[#2d74da] text-white text-xs font-semibold cursor-pointer"
                >
                  Back to Top Ranked Traders
                </button>
              </div>
            ) : (
              <div data-testid="active-subscriptions-feed" className="divide-y divide-[#171b26]">
                {activeSubscriptionsList.map((sub) => {
                  const allKnownTraders = [...SOCIAL_TRADING_TOP_24H_TRADERS, ...combinedPool];
                  const trader: CopyTraderProfileData =
                    allKnownTraders.find(
                      (t) =>
                        t.id === sub.provider_id ||
                        ensureTradeUuid(t.id) === sub.provider_id ||
                        t.numeric_id === sub.provider_numeric_id ||
                        t.social_profile_id === sub.provider_numeric_id ||
                        t.provider_name === sub.provider_name
                    ) || SOCIAL_TRADING_TOP_24H_TRADERS[0];

                  const currentPnl = sub.current_pnl || 0;
                  return (
                    <div
                      key={sub.id || sub.provider_id}
                      data-testid={`active-sub-card-${trader.numeric_id}`}
                      className="px-3.5 py-3 bg-[#202534] hover:bg-[#262c3e] transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div
                          onClick={() => setViewingTrader(trader)}
                          className="flex items-center gap-3 min-w-0 cursor-pointer"
                        >
                          <SocialTraderRowAvatar trader={trader} />
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-bold text-white truncate">
                              {trader.provider_name || trader.full_legal_name || trader.display_handle}
                            </div>
                            <div className="text-[11px] text-[#7c87a2]">
                              Alloc: ${sub.allocated_capital || sub.per_trade_allocation_value || 100}/trade
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`text-[13.5px] font-semibold ${
                              currentPnl >= 0 ? 'text-[#4cd964]' : 'text-rose-400'
                            }`}
                          >
                            {currentPnl >= 0
                              ? `+$${currentPnl.toFixed(2)}`
                              : `-$${Math.abs(currentPnl).toFixed(2)}`}
                          </div>
                          <div className="flex items-center justify-end gap-1.5 mt-1">
                            <button
                              type="button"
                              data-testid={`edit-sub-btn-${trader.numeric_id}`}
                              onClick={() => {
                                soundEngine.playUiClick();
                                setShowRiskConfigModal(trader);
                              }}
                              className="px-2 py-0.5 rounded bg-[#323a4d] hover:bg-[#3c455c] text-white text-[10px] font-semibold cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              data-testid={`uncopy-sub-btn-${trader.numeric_id}`}
                              onClick={() => handleCancelSubscription(trader, sub)}
                              className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] font-semibold cursor-pointer"
                            >
                              Stop
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div
            data-testid="copy-traders-list"
            className="flex-1 overflow-y-auto bg-[#202534] divide-y divide-[#171b26] custom-scrollbar overscroll-contain"
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <RefreshCw className="w-6 h-6 text-[#4cd964] animate-spin" />
                <p className="text-[#7c87a2] text-xs">Loading ranked traders...</p>
              </div>
            ) : displayedTraders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 space-y-3 text-center">
                <p className="text-white font-semibold text-xs">
                  No trader found matching "{searchQuery}"
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3.5 py-1.5 rounded-md bg-[#242938] border border-[#373e52] text-xs text-white cursor-pointer"
                >
                  Reset Filter
                </button>
              </div>
            ) : (
              displayedTraders.map((trader) => {
                const handleLabel =
                  trader.provider_name || trader.full_legal_name || trader.display_handle;
                const tradesCount = trader.trades_24h ?? trader.total_trades ?? 80;
                const profitablePct = Math.max(
                  60,
                  trader.profitable_trades_pct ?? Math.round(trader.win_rate_3m || 65)
                );
                const formattedProfit = `+$${Number(trader.daily_profit || 0).toLocaleString(
                  'en-US',
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}`;
                const isCopying = Boolean(
                  findMatchingSubscriptionForTrader(trader, activeSubscriptions)?.status === 'active'
                );

                return (
                  <div
                    key={trader.id}
                    data-testid={`copy-trader-card-${trader.numeric_id}`}
                    onClick={() => {
                      soundEngine.playUiClick();
                      setProfileActiveTab('trading');
                      setProfileTimeframe('Today');
                      setIsProfileDateDropdownOpen(false);
                      setViewingTrader(trader);
                    }}
                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isCopying
                        ? 'bg-[#25333a] hover:bg-[#2a3a42]'
                        : 'bg-[#202534] hover:bg-[#262c3e]'
                    }`}
                  >
                    {/* Left: Circular/Octagonal Avatar + Trader Handle & Number of trades */}
                    <div className="flex items-center gap-3 min-w-0">
                      <SocialTraderRowAvatar trader={trader} />

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            data-testid={`trader-handle-${trader.numeric_id}`}
                            className="text-[13.5px] font-bold text-white leading-tight truncate"
                          >
                            {handleLabel}
                          </span>
                          {isCopying && (
                            <span className="px-1.5 py-0.2 rounded bg-[#4cd964]/20 text-[#4cd964] text-[9px] font-bold">
                              COPYING
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-[#7c87a2] leading-tight mt-0.5">
                          Number of trades:
                        </div>
                        <div
                          data-testid={`trader-trades-count-${trader.numeric_id}`}
                          className="text-[12.5px] font-bold text-white leading-tight mt-0.5"
                        >
                          {tradesCount}
                        </div>
                      </div>
                    </div>

                    {/* Right: Green Profit Amount on top + Profitable trades: [Y]% underneath */}
                    <div className="text-right shrink-0">
                      <div
                        data-testid={`trader-profit-${trader.numeric_id}`}
                        className="text-[13.5px] font-semibold text-[#4cd964] leading-tight"
                      >
                        {formattedProfit}
                      </div>
                      <div className="text-[11.5px] text-[#7c87a2] leading-tight mt-0.5">
                        Profitable trades:
                      </div>
                      <div
                        data-testid={`trader-winrate-${trader.numeric_id}`}
                        className="text-[12.5px] font-bold text-white leading-tight mt-0.5"
                      >
                        {profitablePct}%
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 2. Trader Profile Modal UI */}
      {viewingTrader && (() => {
        const profileId = viewingTrader.social_profile_id || viewingTrader.numeric_id;
        const fullTraderName =
          viewingTrader.provider_name || viewingTrader.full_legal_name || viewingTrader.display_handle;
        const statusText = viewingTrader.status_text || 'last seen recently';
        const followersCount = viewingTrader.followers_count ?? 75;
        const isWatched = watchedTraderIds.includes(viewingTrader.id);
        const watchersCount = (viewingTrader.watchers_count ?? 155) + (isWatched ? 1 : 0);
        const isCurrentlyCopying =
          findMatchingSubscriptionForTrader(viewingTrader, activeSubscriptions)?.status === 'active';
        const stats = computeProfileStatsForTimeframe(viewingTrader);

        const overallCapitalEligibility = resolveCopierEligibilityForUser({
          selectedAccountId:
            (!isPlaceholderOrUnselectedAccountValue(selectedCopyAccountId)
              ? selectedCopyAccountId
              : undefined) ||
            activeAccount?.supabaseAccountId ||
            activeAccount?.id,
          accounts: effectiveAccounts,
          userProfile,
          bonusFunds: userBonusFunds,
        });

        const hasSufficientCapital =
          overallCapitalEligibility.selectedResult.eligible ||
          overallCapitalEligibility.eligibleAccounts.length > 0 ||
          copierEligibility.selectedResult.eligible ||
          copierEligibility.eligibleAccounts.length > 0;

        return (
          <div
            data-testid="trader-profile-detail-modal"
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-[2px] animate-fade-in"
            onClick={(e) => {
              e.stopPropagation();
              setViewingTrader(null);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[650px] bg-[#1f2433] border border-[#2d3448] rounded-xl p-5 sm:p-7 shadow-[0_25px_70px_rgba(0,0,0,0.85)] text-white max-h-[94vh] overflow-y-auto"
            >
              {/* Modal Header: Trader Profile with close (X) button */}
              <div className="flex items-center justify-between gap-4">
                <h3
                  data-testid="trader-profile-modal-title"
                  className="text-[16.5px] sm:text-[17.5px] font-semibold text-white tracking-tight"
                >
                  Trader Profile: {fullTraderName}
                </h3>
                <button
                  type="button"
                  aria-label="Close Trader Profile"
                  data-testid="close-trader-profile-modal-btn"
                  onClick={() => setViewingTrader(null)}
                  className="p-1 text-[#6c7893] hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5 stroke-[2.2]" />
                </button>
              </div>

              {/* Profile Header Box: Large Avatar on Left + Metadata Grid & Action Buttons on Right */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 mt-5">
                {/* Large Circular Avatar with Gold Border & Pentagon Badge */}
                <SocialTraderProfileLargeAvatar trader={viewingTrader} />

                {/* Right Column: Metadata Grid + Conditional Notice Banner + Watch / Start Copy Trader Buttons */}
                <div className="flex-1 w-full space-y-3.5">
                  {/* Metadata Grid (Name, Status, Followers, Watchers — no Profile Level or Account Level) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 text-left">
                    {/* Name */}
                    <div className="min-w-0 col-span-2 sm:col-span-1">
                      <div className="text-[11.5px] text-[#7c87a2] leading-tight">Name</div>
                      <div
                        data-testid="profile-full-name"
                        className="text-[13px] font-bold text-white leading-snug mt-0.5 truncate"
                        title={fullTraderName}
                      >
                        {fullTraderName}
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <div className="text-[11.5px] text-[#7c87a2] leading-tight">Status</div>
                      <div
                        data-testid="profile-status"
                        className="text-[13px] font-bold text-white leading-snug mt-0.5"
                      >
                        {statusText}
                      </div>
                    </div>

                    {/* Followers */}
                    <div>
                      <div className="text-[11.5px] text-[#7c87a2] leading-tight">Followers</div>
                      <div
                        data-testid="profile-followers-count"
                        className="text-[13px] font-bold text-white leading-snug mt-0.5"
                      >
                        {followersCount}
                      </div>
                    </div>

                    {/* Watchers */}
                    <div>
                      <div className="text-[11.5px] text-[#7c87a2] leading-tight">Watchers</div>
                      <div
                        data-testid="profile-watchers-count"
                        className="text-[13px] font-bold text-white leading-snug mt-0.5"
                      >
                        {watchersCount}
                      </div>
                    </div>
                  </div>

                  {/* Conditional "Add Money" Banner: Only shown when user's capital is genuinely insufficient */}
                  {!hasSufficientCapital && !isCurrentlyCopying && (
                    <div
                      data-testid="profile-copy-notice-box"
                      className="border border-dashed border-[#434c66] bg-[#2a3144] rounded-md px-3.5 py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="w-4 h-4 rounded-full bg-[#5e6b8a] text-[#2a3144] flex items-center justify-center text-[11px] font-black shrink-0">
                        !
                      </div>
                      <div className="text-[12px] text-white text-center flex-1">
                        <button
                          type="button"
                          data-testid="modal-copy-trader-cta"
                          onClick={() => {
                            soundEngine.playUiClick();
                            if (onOpenDepositModal) {
                              setViewingTrader(null);
                              onClose();
                              onOpenDepositModal();
                            } else {
                              handleOpenCopyConfig(viewingTrader);
                            }
                          }}
                          className="underline font-bold text-white hover:text-[#4cd964] cursor-pointer"
                        >
                          Add money
                        </button>{' '}
                        to your account in order to copy trades.
                      </div>
                    </div>
                  )}

                  {/* Watch & Prominent Start Copy Trader Action Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      data-testid="profile-watch-btn"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setWatchedTraderIds((prev) =>
                          prev.includes(viewingTrader.id)
                            ? prev.filter((id) => id !== viewingTrader.id)
                            : [...prev, viewingTrader.id]
                        );
                        triggerToast(
                          isWatched
                            ? `Removed ${fullTraderName} from your Watchlist.`
                            : `Now watching ${fullTraderName} (ID: ${profileId}).`,
                          'success'
                        );
                      }}
                      className={`border border-[#1d8f5c] ${
                        isWatched ? 'bg-[#1d8f5c]/30' : 'bg-[#1e3237] hover:bg-[#1d8f5c]/25'
                      } text-white font-semibold py-2.5 px-4 rounded-md text-[12.5px] cursor-pointer transition-colors`}
                    >
                      {isWatched ? 'Watching' : 'Watch'}
                    </button>

                    <button
                      type="button"
                      data-testid="profile-start-copy-btn"
                      onClick={() => {
                        soundEngine.playUiClick();
                        handleOpenCopyConfig(viewingTrader);
                      }}
                      className={`${
                        isCurrentlyCopying
                          ? 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200'
                          : 'bg-[#0066ff] hover:bg-[#1a75ff] border border-[#3385ff]/50 text-white shadow-[0_4px_14px_rgba(0,102,255,0.35)]'
                      } font-bold py-2.5 px-4 rounded-md text-[12.5px] cursor-pointer transition-all flex items-center justify-center gap-1.5`}
                    >
                      <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                      <span>{isCurrentlyCopying ? 'Stop Copy Trader' : 'Start Copy Trader'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Lower Section: Left Side Tabs + Right Side Statistics Body */}
              <div className="bg-[#181c28] rounded-xl p-4 sm:p-5 mt-5 flex flex-col sm:flex-row gap-4 sm:gap-5">
                {/* Left Column Tabs: Trading Statistics, Social Statistics (Achievements removed) */}
                <div className="w-full sm:w-[172px] shrink-0 flex flex-col gap-2.5">
                  <button
                    type="button"
                    data-testid="profile-tab-trading-stats"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setProfileActiveTab('trading');
                    }}
                    className={`w-full py-2.5 px-4 rounded-md text-[12.5px] font-semibold text-center transition-colors cursor-pointer border ${
                      profileActiveTab === 'trading'
                        ? 'bg-[#213554] border-[#2d74da] text-white'
                        : 'bg-[#1d2230] border-[#32394c] hover:border-[#454f69] text-white/90'
                    }`}
                  >
                    Trading Statistics
                  </button>

                  <button
                    type="button"
                    data-testid="profile-tab-social-stats"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setProfileActiveTab('social');
                    }}
                    className={`w-full py-2.5 px-4 rounded-md text-[12.5px] font-semibold text-center transition-colors cursor-pointer border ${
                      profileActiveTab === 'social'
                        ? 'bg-[#213554] border-[#2d74da] text-white'
                        : 'bg-[#1d2230] border-[#32394c] hover:border-[#454f69] text-white/90'
                    }`}
                  >
                    Social Statistics
                  </button>
                </div>

                {/* Right Column Statistics Body */}
                <div className="flex-1 space-y-2.5">
                  {profileActiveTab === 'trading' && (
                    <>
                      {/* Date Filter Dropdown ("Today" with blue calendar icon) */}
                      <div className="relative w-full sm:w-[225px]">
                        <button
                          type="button"
                          data-testid="profile-date-filter"
                          onClick={() => {
                            soundEngine.playUiClick();
                            setIsProfileDateDropdownOpen((prev) => !prev);
                          }}
                          className="w-full bg-[#1d2230] border border-[#32394c] hover:border-[#454f69] rounded-md px-3 py-2 flex items-center justify-between text-[12px] text-[#8b96b2] cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            {/* Blue Calendar Icon */}
                            <svg
                              viewBox="0 0 16 16"
                              className="w-3.5 h-3.5 text-[#2d74da] shrink-0"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <rect x="2" y="3" width="12" height="11" rx="1.5" />
                              <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
                              <circle cx="5.5" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
                              <circle cx="8" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
                              <circle cx="10.5" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
                            </svg>
                            <span>{profileTimeframe}</span>
                          </div>
                          <span className="text-[9px] text-[#8b96b2]">▼</span>
                        </button>

                        {isProfileDateDropdownOpen && (
                          <div className="absolute left-0 right-0 top-[38px] z-20 bg-[#242938] border border-[#373e52] rounded-md shadow-xl overflow-hidden py-1">
                            {(
                              [
                                'Today',
                                'Yesterday',
                                'Last 7 days',
                                'Last 30 days',
                                'All time',
                              ] as const
                            ).map((tf) => (
                              <button
                                key={tf}
                                type="button"
                                onClick={() => {
                                  soundEngine.playUiClick();
                                  setProfileTimeframe(tf);
                                  setIsProfileDateDropdownOpen(false);
                                }}
                                className={`w-full px-3 py-1.5 text-left text-xs cursor-pointer ${
                                  profileTimeframe === tf
                                    ? 'bg-[#2d74da]/25 text-white font-semibold'
                                    : 'text-[#8b96b2] hover:bg-white/5 hover:text-white'
                                }`}
                              >
                                {tf}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 7 Clean Dark Horizontal Stat Cards with Blue Left Accent Border */}
                      {[
                        {
                          label: 'Trades:',
                          value: String(stats.trades),
                          testId: 'stat-row-trades',
                        },
                        {
                          label: 'Profitable trades:',
                          value: `${stats.profitableTradesPct}%`,
                          testId: 'stat-row-profitable-trades',
                        },
                        {
                          label: 'Trading turnover:',
                          value: `$${stats.tradingTurnover.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`,
                          testId: 'stat-row-trading-turnover',
                        },
                        {
                          label: 'Trading profit:',
                          value: `$${stats.tradingProfit.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`,
                          testId: 'stat-row-trading-profit',
                        },
                        {
                          label: 'Max. trade:',
                          value: `$${stats.maxTrade.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`,
                          testId: 'stat-row-max-trade',
                        },
                        {
                          label: 'Min. trade:',
                          value: `$${stats.minTrade.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`,
                          testId: 'stat-row-min-trade',
                        },
                        {
                          label: 'Max. profit:',
                          value: `$${stats.maxProfit.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`,
                          testId: 'stat-row-max-profit',
                        },
                      ].map((row) => (
                        <div
                          key={row.label}
                          data-testid={row.testId}
                          className="bg-[#252b3b] rounded-md flex items-center py-2.5 px-4 relative overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-[#1da1f2] rounded-l-md" />
                          <span className="w-[55%] text-[12.5px] text-[#8b96b2] pl-1.5">
                            {row.label}
                          </span>
                          <span className="w-[45%] text-[13px] font-bold text-white">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {profileActiveTab === 'social' && (
                    <div className="space-y-2.5">
                      {[
                        { label: 'Followers:', value: String(followersCount) },
                        { label: 'Watchers:', value: String(watchersCount) },
                        {
                          label: 'Active copiers:',
                          value: `${viewingTrader.current_copiers} / ${MAX_COPIERS_PER_TRADER}`,
                        },
                        { label: 'Profit keep share:', value: '100%' },
                        { label: 'Commission fee:', value: '0%' },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="bg-[#252b3b] rounded-md flex items-center py-2.5 px-4 relative overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-[#1da1f2] rounded-l-md" />
                          <span className="w-[55%] text-[12.5px] text-[#8b96b2] pl-1.5">
                            {row.label}
                          </span>
                          <span className="w-[45%] text-[13px] font-bold text-white">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Copy Allocation Modal */}
      {showRiskConfigModal && (
        <div
          data-testid="quick-copy-allocation-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-fade-in"
          onClick={() => setShowRiskConfigModal(null)}
        >
          <div
            data-testid="copy-risk-config-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0B0E17] border border-slate-700 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 sm:space-y-5 max-h-[92vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 sm:pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2 uppercase">
                  <Zap className="w-5 h-5 text-[#00F5A0] fill-current" />
                  <span>Quick Copy Allocation</span>
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Allocate capital to mirror future binary trades with zero execution latency
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Quick Copy Allocation"
                onClick={() => setShowRiskConfigModal(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selected Master Trader Preview Card */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-[#121726] border border-slate-700/80 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#161C2B] border border-slate-600 flex items-center justify-center shrink-0 overflow-hidden">
                  <CountryFlagIcon
                    isoCode={showRiskConfigModal.country_code}
                    country={showRiskConfigModal.country}
                    flagEmoji={showRiskConfigModal.flag}
                    className="w-7 h-5 object-cover rounded-xs"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-black text-sm text-white truncate">
                      {showRiskConfigModal.provider_name}
                    </span>
                    <span className="text-[10px] font-mono text-cyan-300 font-bold bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.2 rounded">
                      ID #{showRiskConfigModal.numeric_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5 flex-wrap">
                    <span>{showRiskConfigModal.country}</span>
                    <span>•</span>
                    <span className="text-[#00F5A0] font-bold">3M Win: {showRiskConfigModal.win_rate_3m}%</span>
                    <span>•</span>
                    <span className="text-amber-400 font-bold">24H: +{showRiskConfigModal.daily_profit_pct}%</span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[9px] font-mono text-slate-400 uppercase block">Copiers</span>
                <span className="text-xs font-mono font-bold text-white">
                  {showRiskConfigModal.current_copiers} / {MAX_COPIERS_PER_TRADER}
                </span>
              </div>
            </div>

            {/* Account Selector inside Risk Modal */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
                  1. Follower Account (Active Live Account)
                </label>
                <span className="text-[10px] font-mono text-[#00F5A0] font-bold">
                  Available: ${copierEligibility.selectedResult.availableBalance.toLocaleString()}
                </span>
              </div>
              <select
                aria-label="Follower Account for Copy Trading"
                data-testid="risk-modal-account-select"
                value={resolvedFollowerSelection.selectedOptionValue}
                onChange={(e) => setSelectedCopyAccountId(e.target.value)}
                className="w-full bg-[#121726] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none focus:border-[#00F5A0]"
              >
                {copierEligibility.allEvaluations.map(({ account, result }) => {
                  const optionDbId =
                    getCanonicalAccountDatabaseUuid(account, userProfile) || account.id;
                  return (
                    <option key={account.id} value={optionDbId}>
                      {account.tierName || account.id} (${Number(account.currentBalance || 0).toLocaleString()}) —{' '}
                      {result.eligible ? 'ELIGIBLE' : `BLOCKED: ${result.code}`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Per-Trade Allocation Mode ($ vs % of Balance) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold uppercase text-slate-400">
                  2. Allocate Trade Amount to Mirror
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  {perTradeAllocationType === 'amount'
                    ? `$${perTradeAllocationValue} per binary trade`
                    : `${perTradeAllocationValue}% of balance per trade`}
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
                  className={`py-2 px-3 rounded-xl font-mono font-bold text-xs border flex items-center justify-center gap-1.5 cursor-pointer ${
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
                  className={`py-2 px-3 rounded-xl font-mono font-bold text-xs border flex items-center justify-center gap-1.5 cursor-pointer ${
                    perTradeAllocationType === 'percentage'
                      ? 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0]'
                      : 'bg-[#121726] border-slate-800 text-slate-400'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>Balance Percent (%)</span>
                </button>
              </div>

              {/* Quick Amount Allocation Chips ($25, $50, $100, $250, $500) */}
              {perTradeAllocationType === 'amount' && (
                <div className="flex items-center gap-1.5 pt-0.5 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">Quick:</span>
                  {[25, 50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      data-testid={`quick-chip-${amt}`}
                      onClick={() => {
                        soundEngine.playUiClick();
                        setPerTradeAllocationValue(amt);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] border cursor-pointer transition-colors shrink-0 ${
                        perTradeAllocationValue === amt
                          ? 'bg-[#00F5A0] text-[#07080B] border-[#00F5A0]'
                          : 'bg-[#161C2B] text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              )}

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
              <div className="space-y-1">
                <label className="text-[9.5px] font-mono font-bold uppercase text-rose-400 block">
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

              <div className="space-y-1">
                <label className="text-[9.5px] font-mono font-bold uppercase text-[#00F5A0] block">
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

              <div className="space-y-1">
                <label className="text-[9.5px] font-mono font-bold uppercase text-amber-400 block">
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
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono flex items-center justify-between">
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
                data-testid="confirm-quick-copy-btn"
                onClick={handleConfirmCopySubscription}
                className="flex-1 py-3 rounded-xl bg-[#00F5A0] hover:brightness-110 text-[#07080B] font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg touch-manipulation flex items-center justify-center gap-1.5"
              >
                <Zap className="w-4 h-4 fill-current shrink-0" />
                <span>Confirm & Start Mirroring</span>
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
