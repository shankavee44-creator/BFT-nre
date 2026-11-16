import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Clock,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import type { TradingAccount, UserProfile } from '../types';
import {
  findWalletForAccount,
  resolveFundedWalletBreachState,
  type PurchasedFundedWallet,
} from '../utils/fundedWalletAnalytics';
import {
  formatChallengeTierLabel,
  resolveLiveFundedAccountMetrics,
} from '../utils/fundedSimulation';
import {
  isDemoAccount,
  isLiveFundedAccount,
  isPersonalLiveAccount,
} from '../utils/propRules';
import { soundEngine } from '../utils/soundEffects';

interface LiveFundedDashboardViewProps {
  accounts: TradingAccount[];
  activeAccountId?: string;
  fundedWallets: PurchasedFundedWallet[];
  userProfile: UserProfile;
  nowTick: number;
  onSelectAccount: (accountId: string) => void;
  onOpenTerminal: (accountId?: string) => void;
  onOpenAnalytics: (account: TradingAccount) => void;
  onRequestPayout: (accountId: string) => void;
  onOpenCertificatePreview: (account: TradingAccount) => void;
  onOpenChallengeModal: () => void;
}

export const LiveFundedDashboardView: React.FC<LiveFundedDashboardViewProps> = ({
  accounts,
  activeAccountId,
  fundedWallets,
  nowTick,
  onSelectAccount,
  onOpenTerminal,
  onOpenAnalytics,
  onRequestPayout,
  onOpenCertificatePreview,
  onOpenChallengeModal,
}) => {
  const fundedOrChallengeAccounts = useMemo(() => {
    const propAccounts = accounts.filter(
      (acc) => acc && !isPersonalLiveAccount(acc) && !isDemoAccount(acc)
    );
    // Prioritize live funded / passed accounts at top
    return [...propAccounts].sort((a, b) => {
      const aLive = isLiveFundedAccount(a) ? 1 : 0;
      const bLive = isLiveFundedAccount(b) ? 1 : 0;
      return bLive - aLive;
    });
  }, [accounts]);

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (activeAccountId) {
      const match = fundedOrChallengeAccounts.find((a) => a.id === activeAccountId);
      if (match) return match.id;
    }
    return fundedOrChallengeAccounts[0]?.id || '';
  });

  useEffect(() => {
    if (activeAccountId && fundedOrChallengeAccounts.some((a) => a.id === activeAccountId)) {
      setSelectedId(activeAccountId);
    } else if (!fundedOrChallengeAccounts.some((a) => a.id === selectedId)) {
      setSelectedId(fundedOrChallengeAccounts[0]?.id || '');
    }
  }, [activeAccountId, fundedOrChallengeAccounts, selectedId]);

  const selectedAccount = useMemo(
    () => fundedOrChallengeAccounts.find((a) => a.id === selectedId) || fundedOrChallengeAccounts[0] || null,
    [fundedOrChallengeAccounts, selectedId]
  );

  const matchedWallet = useMemo(
    () => (selectedAccount ? findWalletForAccount(fundedWallets, selectedAccount) : null),
    [fundedWallets, selectedAccount]
  );

  const metrics = useMemo(
    () => (selectedAccount ? resolveLiveFundedAccountMetrics(selectedAccount, matchedWallet) : null),
    [selectedAccount, matchedWallet]
  );

  const breachState = useMemo(
    () =>
      selectedAccount
        ? resolveFundedWalletBreachState(matchedWallet, selectedAccount, nowTick)
        : null,
    [matchedWallet, selectedAccount, nowTick]
  );

  if (!selectedAccount || !metrics) {
    return (
      <div
        data-testid="live-funded-empty-state"
        className="rounded-3xl bg-[#06090F] border border-[#38BDF8]/30 p-8 sm:p-12 text-center space-y-5 shadow-[0_0_50px_rgba(56,189,248,0.08)]"
      >
        <div className="w-14 h-14 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/40 flex items-center justify-center mx-auto">
          <Wallet className="w-7 h-7 text-[#38BDF8]" />
        </div>
        <div className="space-y-2 max-w-lg mx-auto">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#38BDF8]">
            BFT Live Funded Portal
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">
            No Funded Account Provisioned Yet
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Activate an Instant Funded account or pass a 1-Step / 2-Step Evaluation to unlock your live
            funded trading terminal, 80%–90% profit split payouts, and real-time drawdown telemetry.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            data-testid="empty-live-funded-buy-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onOpenChallengeModal();
            }}
            className="px-5 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#00E5FF] text-[#06090F] font-black text-xs font-mono uppercase tracking-wider flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <span>Activate Funded Account</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const isHardBreach = Boolean(breachState?.isHardBreach);
  const isSoftBreach = Boolean(breachState?.isSoftBreach);
  const isPassedOrFunded =
    isLiveFundedAccount(selectedAccount) || matchedWallet?.account_status === 'PASSED';

  const dailyMeterTone =
    metrics.dailyDrawdownRatio >= 80
      ? 'bg-rose-500'
      : metrics.dailyDrawdownRatio >= 55
      ? 'bg-amber-400'
      : 'bg-[#00E5FF]';

  const maxMeterTone =
    metrics.maxDrawdownRatio >= 80
      ? 'bg-rose-500'
      : metrics.maxDrawdownRatio >= 55
      ? 'bg-amber-400'
      : 'bg-[#38BDF8]';

  return (
    <div
      data-testid="live-funded-dashboard-view"
      className="space-y-6 rounded-3xl bg-[#06090F] border border-[#38BDF8]/35 p-5 sm:p-7 shadow-[0_0_60px_rgba(56,189,248,0.1)]"
    >
      {/* Header + Account Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#38BDF8]/20">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#0B111A] border border-[#38BDF8]/35 text-[#38BDF8] text-[10.5px] font-mono font-bold uppercase tracking-wider mb-2">
            <Activity className="w-3.5 h-3.5 text-[#00E5FF]" />
            <span>Supabase Real-Time Funded Cockpit</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Live Funded Account
            </h2>
            <span
              data-testid="live-funded-status-badge"
              className={`px-3 py-1 rounded-lg text-[11px] font-mono font-black uppercase border whitespace-nowrap ${
                isHardBreach
                  ? 'bg-rose-950/90 text-rose-300 border-rose-500/60'
                  : isSoftBreach
                  ? 'bg-amber-950/90 text-amber-300 border-amber-500/60'
                  : isPassedOrFunded
                  ? 'bg-[#38BDF8]/15 text-[#00E5FF] border-[#38BDF8]/50'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {isHardBreach
                ? 'HARD BREACH'
                : isSoftBreach
                ? `SOFT BREACH • ${breachState?.countdownFormatted || '00:00:00'}`
                : isPassedOrFunded
                ? 'LIVE FUNDED'
                : 'EVALUATION ACTIVE'}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            {formatChallengeTierLabel(selectedAccount)} • Account ID:{' '}
            <span className="text-[#38BDF8] font-bold">{metrics.accountId}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {fundedOrChallengeAccounts.length > 1 && (
            <select
              aria-label="Select funded account"
              data-testid="live-funded-account-selector"
              value={selectedAccount.id}
              onChange={(e) => {
                setSelectedId(e.target.value);
                onSelectAccount(e.target.value);
              }}
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-[#0B111A] border border-[#38BDF8]/35 text-xs font-mono font-bold text-white focus:outline-none focus:border-[#00E5FF]"
            >
              {fundedOrChallengeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-[#06090F] text-white">
                  {acc.id} — ${Number(acc.size || acc.initialBalance).toLocaleString()} ({acc.phase})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            data-testid="live-funded-preview-certificate-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onOpenCertificatePreview(selectedAccount);
            }}
            className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-[#0B111A] hover:bg-[#082F49]/80 border border-[#38BDF8]/40 text-[#38BDF8] hover:text-white text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Award className="w-4 h-4 text-[#00E5FF] shrink-0" />
            <span>Preview Certificate</span>
          </button>
        </div>
      </div>

      {/* Breach Alert Banner (if Soft or Hard Breached) */}
      {(isHardBreach || isSoftBreach) && breachState?.breachReason && (
        <div
          data-testid="live-funded-breach-banner"
          className={`p-4 rounded-2xl border font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isHardBreach
              ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
              : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {isHardBreach ? (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-black uppercase">
                {isHardBreach ? 'Permanent Hard Breach Lock' : 'Temporary Soft Breach Cooldown'}
              </div>
              <p className="text-[11px] opacity-90 mt-0.5">{breachState.breachReason}</p>
            </div>
          </div>
          {isSoftBreach && (
            <div className="px-3 py-1.5 rounded-lg bg-black/40 border border-amber-500/40 font-black tabular-nums whitespace-nowrap shrink-0">
              Resumes in {breachState.countdownFormatted}
            </div>
          )}
        </div>
      )}

      {/* Primary KPI Grid: Balance vs Initial, Live Equity, Profit Split */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/30">
          <div className="text-[10.5px] uppercase tracking-wider text-slate-400">
            Current Balance vs. Initial
          </div>
          <div
            data-testid="live-funded-current-balance"
            className="text-xl sm:text-2xl font-black text-white mt-1.5 tabular-nums"
          >
            ${metrics.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between gap-2 mt-2 text-[11px]">
            <span className="text-slate-400 tabular-nums">
              Initial: ${metrics.initialBalance.toLocaleString('en-US')}
            </span>
            <span
              className={`font-bold tabular-nums ${
                metrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {metrics.netProfit >= 0 ? '+' : ''}${metrics.netProfit.toFixed(2)} (
              {metrics.netProfitPercent >= 0 ? '+' : ''}
              {metrics.netProfitPercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/30">
          <div className="text-[10.5px] uppercase tracking-wider text-slate-400">
            Live Equity
          </div>
          <div
            data-testid="live-funded-equity"
            className="text-xl sm:text-2xl font-black text-[#00E5FF] mt-1.5 tabular-nums"
          >
            ${metrics.liveEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Real-time mark-to-market equity
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/30">
          <div className="text-[10.5px] uppercase tracking-wider text-slate-400">
            Profit Split
          </div>
          <div
            data-testid="live-funded-profit-split"
            className="text-xl sm:text-2xl font-black text-white mt-1.5 tabular-nums"
          >
            {metrics.profitSplitPercent}% to Trader
          </div>
          <div className="text-[11px] text-[#38BDF8] mt-2 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>
              {metrics.scalingActive ? '90% Scaling Plan Unlocked' : 'Scales to 90% after 3 months'}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/30">
          <div className="text-[10.5px] uppercase tracking-wider text-slate-400">
            0.5% Qualifying Days
          </div>
          <div
            data-testid="live-funded-profitable-days"
            className="text-xl sm:text-2xl font-black text-emerald-400 mt-1.5 tabular-nums"
          >
            {metrics.completedProfitableDays} / {metrics.minProfitableDays} Days
          </div>
          <div className="text-[11px] text-slate-400 mt-2 tabular-nums">
            ≥ ${metrics.qualifyingDayThresholdUsd.toFixed(0)} daily net profit (0.5%)
          </div>
        </div>
      </div>

      {/* Drawdown Limit Meters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 font-mono">
        {/* Daily Drawdown Limit Tracker */}
        <div
          data-testid="live-funded-daily-dd-card"
          className="p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/30 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Daily Drawdown Limit ({metrics.dailyDrawdownLimitPercent}%)
              </div>
              <div className="text-sm font-black text-white mt-0.5 tabular-nums">
                ${metrics.dailyDrawdownUsed.toFixed(2)} / ${metrics.dailyDrawdownLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-black tabular-nums border ${
                metrics.dailyDrawdownRatio >= 80
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                  : metrics.dailyDrawdownRatio >= 55
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40'
              }`}
            >
              {metrics.dailyDrawdownRatio.toFixed(1)}% Used
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-[#06090F] border border-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${dailyMeterTone}`}
              style={{ width: `${Math.min(100, metrics.dailyDrawdownRatio)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>Remaining Buffer</span>
            <span className="text-slate-200 font-bold">
              ${Math.max(0, metrics.dailyDrawdownLimit - metrics.dailyDrawdownUsed).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Max Drawdown Limit Meter */}
        <div
          data-testid="live-funded-max-dd-card"
          className="p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/30 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Max Drawdown Limit ({metrics.maxDrawdownLimitPercent}%)
              </div>
              <div className="text-sm font-black text-white mt-0.5 tabular-nums">
                ${metrics.maxDrawdownUsed.toFixed(2)} / ${metrics.maxDrawdownLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-black tabular-nums border ${
                metrics.maxDrawdownRatio >= 80
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                  : metrics.maxDrawdownRatio >= 55
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40'
              }`}
            >
              {metrics.maxDrawdownRatio.toFixed(1)}% Used
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-[#06090F] border border-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${maxMeterTone}`}
              style={{ width: `${Math.min(100, metrics.maxDrawdownRatio)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>Max Overall Cushion</span>
            <span className="text-slate-200 font-bold">
              ${Math.max(0, metrics.maxDrawdownLimit - metrics.maxDrawdownUsed).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Action Strip: Launch Terminal, Analytics, Request Payout */}
      <div className="pt-2 flex flex-wrap items-center gap-3">
        {isHardBreach ? (
          <button
            type="button"
            disabled
            data-testid="live-funded-launch-terminal-btn"
            className="flex-1 min-w-[180px] py-3 px-5 min-h-[46px] rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300/80 font-mono text-xs font-black flex items-center justify-center gap-2 cursor-not-allowed whitespace-nowrap"
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>Terminal Permanently Locked</span>
          </button>
        ) : isSoftBreach ? (
          <button
            type="button"
            disabled
            data-testid="live-funded-launch-terminal-btn"
            className="flex-1 min-w-[200px] py-3 px-5 min-h-[46px] rounded-xl bg-amber-950/60 border border-amber-500/45 text-amber-300 font-mono text-xs font-black flex items-center justify-center gap-2 cursor-not-allowed tabular-nums whitespace-nowrap"
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>Locked - Resumes in {breachState?.countdownFormatted || '00:00:00'}</span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="live-funded-launch-terminal-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onSelectAccount(selectedAccount.id);
              onOpenTerminal(selectedAccount.id);
            }}
            className="flex-1 min-w-[170px] py-3 px-5 min-h-[46px] rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#00E5FF] hover:brightness-110 text-[#06090F] font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(56,189,248,0.25)] transition-all whitespace-nowrap cursor-pointer"
          >
            <span>Launch Terminal</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5] shrink-0" />
          </button>
        )}

        <button
          type="button"
          data-testid="live-funded-analytics-btn"
          onClick={() => {
            soundEngine.playUiClick();
            onOpenAnalytics(selectedAccount);
          }}
          className="px-5 py-3 min-h-[46px] rounded-xl bg-[#0B111A] hover:bg-[#082F49]/80 border border-[#38BDF8]/45 hover:border-[#00E5FF] text-[#38BDF8] hover:text-white font-mono text-xs font-black flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 text-[#00E5FF] shrink-0" />
          <span>Analytics</span>
        </button>

        <button
          type="button"
          data-testid="live-funded-request-payout-btn"
          onClick={() => {
            soundEngine.playUiClick();
            onRequestPayout(selectedAccount.id);
          }}
          className="px-5 py-3 min-h-[46px] rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/45 text-emerald-300 font-mono text-xs font-black flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Request Payout</span>
        </button>
      </div>
    </div>
  );
};
