import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type { TradingAccount } from '../types';
import {
  buildInitialFundedWalletFromAccount,
  clearExpiredSoftBreachInFundedWallet,
  findWalletForAccount,
  resolveFundedWalletBreachState,
  subscribePurchasedFundedWalletsRealtime,
  type PurchasedFundedWallet,
} from '../utils/fundedWalletAnalytics';
import {
  MAX_SINGLE_TRADE_INVESTMENT_USD,
  MIN_TRADE_DURATION_SECONDS,
} from '../utils/propRules';

interface FundedWalletAnalyticsModalProps {
  isOpen: boolean;
  account: TradingAccount | null;
  initialWallet?: PurchasedFundedWallet | null;
  userId?: string;
  onClose: () => void;
  onWalletUpdated?: (wallet: PurchasedFundedWallet) => void;
}

function formatMoney(value: number, signed: boolean = false): string {
  const num = Number.isFinite(value) ? value : 0;
  const absFormatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (signed) {
    if (num > 0) return `+$${absFormatted}`;
    if (num < 0) return `-$${absFormatted}`;
  }
  return `$${absFormatted}`;
}

export const FundedWalletAnalyticsModal: React.FC<FundedWalletAnalyticsModalProps> = ({
  isOpen,
  account,
  initialWallet,
  userId,
  onClose,
  onWalletUpdated,
}) => {
  const [liveWallet, setLiveWallet] = useState<PurchasedFundedWallet | null>(() => {
    if (initialWallet) return initialWallet;
    if (account) return buildInitialFundedWalletFromAccount(account, userId);
    return null;
  });
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const onCloseRef = useRef(onClose);
  const onWalletUpdatedRef = useRef(onWalletUpdated);
  const initialWalletRef = useRef(initialWallet);
  const lastEmittedSigRef = useRef<string>('');
  const autoUnlockInFlightRef = useRef<boolean>(false);

  onCloseRef.current = onClose;
  onWalletUpdatedRef.current = onWalletUpdated;
  initialWalletRef.current = initialWallet;

  const accountId = account?.id || '';

  useEffect(() => {
    if (!isOpen || !account || !accountId) return;

    lastEmittedSigRef.current = '';
    autoUnlockInFlightRef.current = false;

    const seedWallet = initialWalletRef.current;
    setLiveWallet(
      seedWallet && seedWallet.account_id === accountId
        ? seedWallet
        : buildInitialFundedWalletFromAccount(account, userId, seedWallet)
    );

    const unsubscribe = subscribePurchasedFundedWalletsRealtime({
      userId: userId || account.ownerId,
      accountId,
      onWalletsChanged: (wallets) => {
        const matched = findWalletForAccount(wallets, account);
        if (matched) {
          const sig = `${matched.account_id}|${matched.account_status}|${matched.current_balance}|${matched.current_profit_amount}|${matched.completed_profitable_days}|${matched.updated_at}`;
          if (sig !== lastEmittedSigRef.current) {
            lastEmittedSigRef.current = sig;
            setLiveWallet(matched);
            onWalletUpdatedRef.current?.(matched);
          }
        }
      },
    });

    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accountId, userId]);

  const wallet = useMemo(() => {
    if (!account) return null;
    return (
      liveWallet ||
      initialWallet ||
      buildInitialFundedWalletFromAccount(account, userId)
    );
  }, [account, liveWallet, initialWallet, userId]);

  const breachState = useMemo(
    () => resolveFundedWalletBreachState(wallet, account, nowTick),
    [wallet, account, nowTick]
  );

  // Auto-unlock soft breach inside modal if countdown finishes while open
  useEffect(() => {
    if (isOpen && wallet && breachState.shouldAutoUnlock && !autoUnlockInFlightRef.current) {
      autoUnlockInFlightRef.current = true;
      clearExpiredSoftBreachInFundedWallet(wallet, nowTick)
        .then((unlocked) => {
          setLiveWallet(unlocked);
          onWalletUpdatedRef.current?.(unlocked);
        })
        .catch(() => {})
        .finally(() => {
          autoUnlockInFlightRef.current = false;
        });
    }
  }, [isOpen, wallet, breachState.shouldAutoUnlock, nowTick]);

  if (!isOpen || !account || !wallet) return null;

  const profitTargetPct =
    wallet.profit_target_amount > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Number(((wallet.current_profit_amount / wallet.profit_target_amount) * 100).toFixed(1))
          )
        )
      : 100;

  const remainingProfitToPass =
    wallet.profit_target_amount > 0
      ? Math.max(0, Number((wallet.profit_target_amount - wallet.current_profit_amount).toFixed(2)))
      : 0;

  const dailyUsagePct =
    wallet.daily_drawdown_limit_amount > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Number(((wallet.current_daily_drawdown / wallet.daily_drawdown_limit_amount) * 100).toFixed(1))
          )
        )
      : 0;

  const maxUsagePct =
    wallet.max_drawdown_limit_amount > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Number(((wallet.current_max_drawdown / wallet.max_drawdown_limit_amount) * 100).toFixed(1))
          )
        )
      : 0;

  const dailyMeterTone =
    dailyUsagePct >= 85
      ? {
          bar: 'bg-gradient-to-r from-rose-500 to-red-400 shadow-[0_0_16px_rgba(244,63,94,0.6)]',
          text: 'text-rose-400',
          border: 'border-rose-500/45',
          badge: 'CRITICAL RISK',
        }
      : dailyUsagePct >= 60
      ? {
          bar: 'bg-gradient-to-r from-amber-500 to-yellow-400 shadow-[0_0_14px_rgba(245,158,11,0.5)]',
          text: 'text-amber-300',
          border: 'border-amber-500/45',
          badge: 'WARNING ZONE',
        }
      : {
          bar: 'bg-gradient-to-r from-[#38BDF8] to-[#00E5FF] shadow-[0_0_14px_rgba(0,229,255,0.45)]',
          text: 'text-[#38BDF8]',
          border: 'border-[#38BDF8]/25',
          badge: 'SAFE BUFFER',
        };

  const maxMeterTone =
    maxUsagePct >= 85
      ? {
          bar: 'bg-gradient-to-r from-rose-500 to-red-400 shadow-[0_0_16px_rgba(244,63,94,0.6)]',
          text: 'text-rose-400',
          border: 'border-rose-500/45',
          badge: 'CRITICAL RISK',
        }
      : maxUsagePct >= 60
      ? {
          bar: 'bg-gradient-to-r from-amber-500 to-yellow-400 shadow-[0_0_14px_rgba(245,158,11,0.5)]',
          text: 'text-amber-300',
          border: 'border-amber-500/45',
          badge: 'WARNING ZONE',
        }
      : {
          bar: 'bg-gradient-to-r from-[#38BDF8] to-[#00E5FF] shadow-[0_0_14px_rgba(0,229,255,0.45)]',
          text: 'text-[#38BDF8]',
          border: 'border-[#38BDF8]/25',
          badge: 'SAFE BUFFER',
        };

  const statusConfig =
    breachState.effectiveStatus === 'HARD_BREACH'
      ? {
          label: 'HARD BREACH',
          classes: 'bg-rose-950/90 text-rose-300 border-rose-500/60 shadow-[0_0_16px_rgba(244,63,94,0.25)]',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />,
        }
      : breachState.effectiveStatus === 'SOFT_BREACH'
      ? {
          label: 'SOFT BREACH',
          classes: 'bg-amber-950/90 text-amber-300 border-amber-500/60 shadow-[0_0_16px_rgba(245,158,11,0.25)]',
          icon: <Clock className="w-3.5 h-3.5 text-amber-400" />,
        }
      : breachState.effectiveStatus === 'PASSED'
      ? {
          label: 'PASSED',
          classes: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-[0_0_16px_rgba(16,185,129,0.25)]',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
        }
      : {
          label: 'ACTIVE',
          classes: 'bg-[#082F49]/80 text-[#00E5FF] border-[#38BDF8]/60 shadow-[0_0_16px_rgba(56,189,248,0.25)]',
          icon: <Activity className="w-3.5 h-3.5 text-[#00E5FF]" />,
        };

  const minDays = Math.max(1, wallet.min_profitable_days || 5);
  const completedDays = Math.max(0, Math.min(minDays, wallet.completed_profitable_days || 0));
  const dailyThresholdDollars = Number(((wallet.initial_balance * 1) / 100).toFixed(2));
  const maxRisk5PctDollars = Number(((wallet.current_balance * 5) / 100).toFixed(2));

  return (
    <div
      data-testid="funded-wallet-analytics-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="funded-analytics-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-2.5 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl rounded-3xl bg-[#06090F] border border-[#38BDF8]/40 shadow-[0_0_60px_rgba(0,229,255,0.14)] overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Top Ice-Blue Accent Glow Strip */}
        <div className="h-1 w-full bg-gradient-to-r from-[#0284C7] via-[#00E5FF] to-[#38BDF8]" />

        {/* Modal Header + Account Overview */}
        <div className="px-4 py-4 sm:px-6 sm:py-4.5 bg-[#0B111A] border-b border-[#38BDF8]/20 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/35 font-mono">
                  <BarChart3 className="w-3.5 h-3.5 text-[#00E5FF]" />
                  {wallet.is_real_funded ? 'REAL FUNDED ANALYTICS' : 'FUNDED WALLET ANALYTICS'}
                </span>
                {wallet.is_real_funded ? (
                  <span
                    data-testid="analytics-tier-badge"
                    data-badge-color="purple"
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/50 font-mono"
                  >
                    REAL FUNDED · 90% PROFIT (PRINCIPAL LOCKED)
                  </span>
                ) : (
                  <span
                    data-testid="analytics-tier-badge"
                    data-badge-color="red"
                    className="inline-flex items-center gap-1 text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/45 font-mono"
                  >
                    Challenge
                  </span>
                )}
                <span
                  data-testid="analytics-status-badge"
                  className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border font-mono ${statusConfig.classes}`}
                >
                  {statusConfig.icon}
                  {statusConfig.label}
                </span>
              </div>

              <h2
                id="funded-analytics-modal-title"
                className="text-xl sm:text-2xl font-black text-white tracking-tight flex flex-wrap items-center gap-x-2.5 gap-y-1"
              >
                {!wallet.is_real_funded && wallet.account_status !== 'PASSED' ? (
                  <span className="font-mono text-[#00E5FF]">Challenge</span>
                ) : (
                  <>
                    <span className="font-mono text-[#00E5FF]">{wallet.account_id}</span>
                    <span className="text-slate-500 font-normal">/</span>
                    <span className="text-slate-100">{wallet.challenge_type}</span>
                  </>
                )}
              </h2>
            </div>

            <button
              type="button"
              data-testid="close-funded-analytics-modal"
              onClick={onClose}
              aria-label="Close Analytics Modal"
              className="p-2 rounded-xl bg-[#06090F] border border-[#38BDF8]/25 text-slate-300 hover:text-white hover:border-[#00E5FF] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Overview Metric Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#06090F] border border-[#38BDF8]/20">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                Current Balance vs Initial
              </span>
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-lg sm:text-xl font-black text-white">
                  {formatMoney(wallet.current_balance)}
                </span>
                <span className="text-xs text-slate-400">
                  / {formatMoney(wallet.initial_balance)}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#06090F] border border-[#38BDF8]/20">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                Live Equity
              </span>
              <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                <span className="text-lg sm:text-xl font-black text-[#00E5FF]">
                  {formatMoney(wallet.current_equity)}
                </span>
                <span
                  className={`text-xs font-bold ${
                    wallet.current_profit_amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatMoney(wallet.current_profit_amount, true)}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#06090F] border border-[#38BDF8]/20">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                Account Status
              </span>
              <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                <span className="text-sm font-black text-white">
                  {breachState.effectiveStatus === 'SOFT_BREACH'
                    ? `Resumes in ${breachState.countdownFormatted}`
                    : breachState.effectiveStatus === 'HARD_BREACH'
                    ? 'Permanently Locked'
                    : breachState.effectiveStatus === 'PASSED'
                    ? 'Challenge Passed'
                    : 'Trading Enabled'}
                </span>
                <span className="text-[10px] text-[#38BDF8] font-bold">LIVE SYNC</span>
              </div>
            </div>
          </div>

          {/* Breach Notification Banner (if breached) */}
          {(breachState.isHardBreach || breachState.isSoftBreach) && (
            <div
              data-testid="analytics-breach-banner"
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                breachState.isHardBreach
                  ? 'bg-rose-950/50 border-rose-500/50 text-rose-200'
                  : 'bg-amber-950/50 border-amber-500/50 text-amber-200'
              }`}
            >
              {breachState.isHardBreach ? (
                <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-black uppercase tracking-wider mb-0.5 font-mono">
                  {breachState.isHardBreach
                    ? 'HARD BREACH — TERMINAL PERMANENTLY DISABLED'
                    : `SOFT BREACH — LOCKED (RESUMES IN ${breachState.countdownFormatted})`}
                </div>
                <p className="text-xs opacity-90 leading-relaxed">
                  {breachState.breachReason || 'Account risk threshold triggered.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Analytics Content */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
          {/* 1. Profit Target Tracker */}
          <section
            data-testid="analytics-profit-target-card"
            className="p-4 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/30 shadow-[0_0_24px_rgba(56,189,248,0.06)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/40 flex items-center justify-center">
                  <Target className="w-4 h-4 text-[#00E5FF]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-wide">
                    Profit Target Tracker
                  </h3>
                  <p className="text-xs text-slate-400">
                    {wallet.profit_target_percent > 0 && !wallet.is_real_funded
                      ? `Target: ${wallet.profit_target_percent}% (${formatMoney(wallet.profit_target_amount)}) + 5 Days (≥1%/day)`
                      : 'Real Funded Account — Live Profit Generation (Weekly Payouts • 7-Day 1st Wait)'}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right font-mono tabular-nums">
                <span className="text-base sm:text-lg font-black text-[#00E5FF]">
                  {formatMoney(wallet.current_profit_amount, true)}
                </span>
                {wallet.profit_target_amount > 0 && (
                  <span className="text-xs text-slate-400 block">
                    {remainingProfitToPass > 0
                      ? `${formatMoney(remainingProfitToPass)} remaining to pass`
                      : 'Profit target achieved'}
                  </span>
                )}
              </div>
            </div>

            <div className="w-full h-3 rounded-full bg-[#06090F] border border-[#38BDF8]/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0284C7] via-[#38BDF8] to-[#00E5FF] shadow-[0_0_16px_rgba(0,229,255,0.65)] transition-all duration-500"
                style={{
                  width: `${Math.max(0, Math.min(100, profitTargetPct))}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between mt-2 text-[11px] font-mono tabular-nums text-slate-400">
              <span>
                Progress: <strong className="text-[#38BDF8]">{profitTargetPct}%</strong>
              </span>
              <span>
                Goal:{' '}
                <strong className="text-white">
                  {wallet.profit_target_amount > 0
                    ? `${formatMoney(wallet.profit_target_amount)} (${wallet.profit_target_percent}%)`
                    : 'NONE'}
                </strong>
              </span>
            </div>
          </section>

          {/* 2. Drawdown Limit Meters (Daily + Max) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Overall Risk Exposure / Daily Cap Info */}
            {wallet.daily_drawdown_limit_percent > 0 ? (
              <section
                data-testid="analytics-daily-drawdown-card"
                className={`p-5 rounded-2xl bg-[#0B111A] border ${dailyMeterTone.border}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#06090F] border border-[#38BDF8]/30 flex items-center justify-center">
                      <TrendingDown className={`w-4 h-4 ${dailyMeterTone.text}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">Daily Drawdown Limit</h3>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Max {wallet.daily_drawdown_limit_percent}% Daily Cap
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#06090F] border border-white/10 font-mono ${dailyMeterTone.text}`}
                  >
                    {dailyMeterTone.badge}
                  </span>
                </div>

                <div className="flex items-baseline justify-between mb-2 font-mono tabular-nums">
                  <span className={`text-lg font-black ${dailyMeterTone.text}`}>
                    {formatMoney(wallet.current_daily_drawdown)}
                  </span>
                  <span className="text-xs text-slate-400">
                    of {formatMoney(wallet.daily_drawdown_limit_amount)} ({wallet.daily_drawdown_limit_percent}%)
                  </span>
                </div>

                <div className="w-full h-2.5 rounded-full bg-[#06090F] border border-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${dailyMeterTone.bar}`}
                    style={{ width: `${dailyUsagePct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-2 text-[11px] font-mono tabular-nums text-slate-400">
                  <span>Used: {dailyUsagePct}%</span>
                  <span>
                    Buffer Left:{' '}
                    <strong className="text-slate-200">
                      {formatMoney(
                        Math.max(0, wallet.daily_drawdown_limit_amount - wallet.current_daily_drawdown)
                      )}
                    </strong>
                  </span>
                </div>
              </section>
            ) : (
              <section
                data-testid="analytics-daily-drawdown-card"
                className="p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/30 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#06090F] border border-[#38BDF8]/30 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-[#00E5FF]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">Overall Loss Structure</h3>
                      <span className="text-[11px] text-slate-400 font-mono">
                        No Separate Daily-Only Cap
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#06090F] border border-[#38BDF8]/30 font-mono text-[#00E5FF]">
                    UNIFIED 10%
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  Governed strictly by a <strong className="text-white">10% Max Overall Account Loss</strong> limit. Reaching 10% total drawdown triggers an immediate <strong className="text-rose-300">HARD_BREACH</strong>.
                </p>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400 pt-2 border-t border-white/10">
                  <span>5% Max Single / Combined Risk:</span>
                  <strong className="text-[#00E5FF]">{formatMoney(maxRisk5PctDollars)}</strong>
                </div>
              </section>
            )}

            {/* Max Drawdown Limit */}
            <section
              data-testid="analytics-max-drawdown-card"
              className={`p-5 rounded-2xl bg-[#0B111A] border ${maxMeterTone.border}`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#06090F] border border-[#38BDF8]/30 flex items-center justify-center">
                    <ShieldAlert className={`w-4 h-4 ${maxMeterTone.text}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Max Drawdown Limit</h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Max {wallet.max_drawdown_limit_percent}% Overall Cap
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#06090F] border border-white/10 font-mono ${maxMeterTone.text}`}
                >
                  {maxMeterTone.badge}
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-2 font-mono tabular-nums">
                <span className={`text-lg font-black ${maxMeterTone.text}`}>
                  {formatMoney(wallet.current_max_drawdown)}
                </span>
                <span className="text-xs text-slate-400">
                  of {formatMoney(wallet.max_drawdown_limit_amount)} ({wallet.max_drawdown_limit_percent}%)
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-[#06090F] border border-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${maxMeterTone.bar}`}
                  style={{ width: `${maxUsagePct}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-2 text-[11px] font-mono tabular-nums text-slate-400">
                <span>Used: {maxUsagePct}%</span>
                <span>
                  Buffer Left:{' '}
                  <strong className="text-slate-200">
                    {formatMoney(
                      Math.max(0, wallet.max_drawdown_limit_amount - wallet.current_max_drawdown)
                    )}
                  </strong>
                </span>
              </div>
            </section>
          </div>

          {/* 3. Minimum Profitable Trading Days Tracker */}
          <section
            data-testid="analytics-profitable-days-card"
            className="p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/25"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/40 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-[#00E5FF]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Minimum Profitable Trading Days
                  </h3>
                  <p className="text-xs text-slate-300">
                    A trading day counts only when net daily profit reaches at least 1% of initial balance.
                  </p>
                </div>
              </div>

              <div className="px-3 py-1 rounded-xl bg-[#06090F] border border-[#38BDF8]/35 font-mono tabular-nums text-xs font-black text-[#00E5FF]">
                {completedDays} / {minDays} Days Completed
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 sm:gap-3 mt-4">
              {Array.from({ length: minDays }).map((_, idx) => {
                const isDone = idx < completedDays;
                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl border text-center transition-all font-mono ${
                      isDone
                        ? 'bg-[#38BDF8]/15 border-[#00E5FF]/60 text-[#00E5FF] shadow-[0_0_14px_rgba(0,229,255,0.2)]'
                        : 'bg-[#06090F] border-white/10 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-1">
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-[#00E5FF]" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-600" />
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase block">
                      Day {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400">
              <span>
                Daily Qualifying Profit Threshold (1%):{' '}
                <strong className="text-white">{formatMoney(dailyThresholdDollars)}</strong>
              </span>
              <span>
                Today&apos;s Net Profit:{' '}
                <strong
                  className={
                    wallet.daily_net_profit >= dailyThresholdDollars
                      ? 'text-[#00E5FF]'
                      : wallet.daily_net_profit >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }
                >
                  {formatMoney(wallet.daily_net_profit, true)}
                </strong>
              </span>
            </div>
          </section>

          {/* 4. Strict Trading Rules Checklist (Immediate HARD_BREACH on Violation) */}
          <section
            data-testid="analytics-rules-checklist-card"
            className="p-5 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/25"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/40 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-[#00E5FF]" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Strict Trading &amp; Risk Rules</h3>
                <p className="text-xs text-slate-400">
                  Any violation immediately triggers a permanent HARD_BREACH on funded accounts
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-[#06090F] border border-[#38BDF8]/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <TrendingUp className="w-4 h-4 text-[#38BDF8] shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Max Single-Trade Risk</div>
                    <div className="text-[11px] text-slate-400">5% of current balance (Hard Breach)</div>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs font-black text-[#00E5FF] whitespace-nowrap">
                  5% ({formatMoney(maxRisk5PctDollars)})
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#06090F] border border-[#38BDF8]/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldAlert className="w-4 h-4 text-[#38BDF8] shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Max Combined Open Risk</div>
                    <div className="text-[11px] text-slate-400">5% aggregate across all open trades</div>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs font-black text-[#00E5FF] whitespace-nowrap">
                  5% Total
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#06090F] border border-[#38BDF8]/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Activity className="w-4 h-4 text-[#38BDF8] shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Open Trades Per Currency Pair</div>
                    <div className="text-[11px] text-slate-400">Multiple trades allowed only on different pairs</div>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs font-black text-[#00E5FF] whitespace-nowrap">
                  Max 1 / Pair
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#06090F] border border-rose-500/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Martingale &amp; Hedging</div>
                    <div className="text-[11px] text-slate-400">Strictly prohibited — immediate Hard Breach</div>
                  </div>
                </div>
                <span className="font-mono text-xs font-black text-rose-300 whitespace-nowrap">
                  PROHIBITED
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#06090F] border border-[#38BDF8]/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Clock className="w-4 h-4 text-[#38BDF8] shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Minimum Trade Duration</div>
                    <div className="text-[11px] text-slate-400">Required expiry on Funded accounts</div>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs font-black text-[#00E5FF] whitespace-nowrap">
                  {MIN_TRADE_DURATION_SECONDS}s Min
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#06090F] border border-[#38BDF8]/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Calendar className="w-4 h-4 text-[#38BDF8] shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Withdrawal Schedule</div>
                    <div className="text-[11px] text-slate-400">7-day 1st wait • Weekly (+15% Daily)</div>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs font-black text-emerald-300 whitespace-nowrap">
                  ${MAX_SINGLE_TRADE_INVESTMENT_USD.toLocaleString('en-US')} Cap
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
