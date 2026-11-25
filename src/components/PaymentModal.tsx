import React from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  ArrowUpRight,
  ShieldCheck,
  Target,
  TrendingDown,
  Timer,
  Layers,
} from 'lucide-react';
import { EvaluationPackage, PromoCodeType, TradingAccount, UserProfile } from '../types';
import { NormalizedPurchaseRecord } from '../config/directDeposit';
import {
  SelfCapitalChallengePurchaseResult,
  executeSelfCapitalChallengePurchase,
  getAccountBadgeDisplayText,
} from '../utils/propRules';

export interface PaymentModalProps {
  packageToBuy?: EvaluationPackage | null;
  purchaseResult?: SelfCapitalChallengePurchaseResult | null;
  persistenceError?: string | null;
  userProfile: UserProfile;
  activePromoCode: PromoCodeType;
  initialDailyWithdrawals?: boolean;
  applyBreachDiscount?: boolean;
  onClose: () => void;
  onOpenDepositModal?: () => void;
  onOpenTerminal?: (accountId?: string) => void;
  onOpenDashboard?: (accountId?: string) => void;
  onSuccess?: (newAccount: TradingAccount, purchaseRecord?: NormalizedPurchaseRecord) => void;
  onPurchaseRecorded?: (purchase: NormalizedPurchaseRecord) => void;
  onCommissionsProcessed?: (params: {
    buyerUserId: string;
    buyerName: string;
    buyerEmail: string;
    packageTier: any;
    packageName: string;
    packagePrice: number;
    referralCodeUsed?: string | null;
  }) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  packageToBuy,
  purchaseResult,
  persistenceError,
  userProfile,
  activePromoCode,
  initialDailyWithdrawals = false,
  applyBreachDiscount = false,
  onClose,
  onOpenDepositModal,
  onOpenTerminal,
  onOpenDashboard,
}) => {
  const effectiveResult: SelfCapitalChallengePurchaseResult | null = React.useMemo(() => {
    if (purchaseResult) return purchaseResult;
    if (!packageToBuy) return null;
    return executeSelfCapitalChallengePurchase({
      pkg: packageToBuy,
      selfCapitalBalance: Number(userProfile?.selfBalance ?? 0),
      promoCode: activePromoCode,
      unlockDailyWithdrawals: initialDailyWithdrawals,
      applyBreachDiscount,
      ownerId: userProfile?.id,
      ownerEmail: userProfile?.email,
    });
  }, [
    purchaseResult,
    packageToBuy,
    userProfile?.selfBalance,
    userProfile?.id,
    userProfile?.email,
    activePromoCode,
    initialDailyWithdrawals,
    applyBreachDiscount,
  ]);

  if (!effectiveResult) return null;

  // 1. INSUFFICIENT SELF CAPITAL BALANCE VIEW
  if (!effectiveResult.ok) {
    return (
      <div
        data-testid="insufficient-balance-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="insufficient-balance-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      >
        <div className="relative w-full max-w-md rounded-2xl bg-[#0d1322] border border-rose-500/40 shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden">
          {/* Top Accent Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                  Self Capital Balance Check
                </span>
                <h3
                  id="insufficient-balance-title"
                  data-testid="insufficient-balance-heading"
                  className="text-lg font-extrabold text-white tracking-tight"
                >
                  Insufficient Account Balance
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            <p
              data-testid="insufficient-balance-message"
              className="text-xs sm:text-sm text-slate-300 leading-relaxed"
            >
              Your available <strong className="text-white">Self Capital</strong> balance is lower
              than the selected <strong className="text-white">{effectiveResult.packageName}</strong>{' '}
              package price. Please deposit funds into your Self Capital account balance first to
              activate this challenge.
            </p>

            {/* Balance Comparison Card */}
            <div className="rounded-xl bg-[#111827] border border-white/[0.08] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Selected Challenge Package</span>
                <span className="text-white font-bold">{effectiveResult.packageName}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Package Price Required</span>
                <span
                  data-testid="insufficient-required-amount"
                  className="text-white font-extrabold tabular-nums"
                >
                  ${effectiveResult.requiredAmount.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Available Self Capital Balance</span>
                <span
                  data-testid="insufficient-available-balance"
                  className="text-rose-400 font-extrabold tabular-nums"
                >
                  ${effectiveResult.availableBalance.toFixed(2)}
                </span>
              </div>

              <div className="pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-xs">
                <span className="text-amber-300 font-bold">Additional Deposit Needed</span>
                <span
                  data-testid="insufficient-shortfall-amount"
                  className="text-amber-300 font-extrabold text-sm tabular-nums"
                >
                  ${effectiveResult.shortfallAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Guidance Note */}
            <div className="rounded-xl bg-[#0066ff]/10 border border-[#0066ff]/25 p-3.5 flex items-start gap-2.5 text-xs text-slate-300">
              <Wallet className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
              <span>
                Deposit via automated crypto gateways into your{' '}
                <strong className="text-white">Self Capital</strong> balance, then click{' '}
                <strong className="text-[#38BDF8]">Start now</strong> on your preferred package to
                activate immediately.
              </span>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
              <button
                type="button"
                data-testid="deposit-self-capital-btn"
                onClick={() => {
                  onClose();
                  onOpenDepositModal?.();
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,102,255,0.4)] transition cursor-pointer"
              >
                <Wallet className="w-4 h-4" />
                <span>Deposit to Self Capital</span>
              </button>
              <button
                type="button"
                data-testid="close-insufficient-balance-btn"
                onClick={onClose}
                className="py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-300 hover:text-white font-bold text-xs sm:text-sm transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. CHALLENGE ACCOUNT IMMEDIATELY ACTIVATED VIEW
  const badgeLabel = getAccountBadgeDisplayText(effectiveResult.account);

  return (
    <div
      data-testid="challenge-activated-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="challenge-activated-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0d1322] border border-emerald-500/40 shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Top Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-[#00e5ff] to-[#0066ff]" />

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Instant Self Capital Activation
                </span>
                <span
                  data-testid="activated-challenge-badge"
                  className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-extrabold tracking-wide"
                >
                  {badgeLabel}
                </span>
              </div>
              <h3
                id="challenge-activated-title"
                data-testid="challenge-activated-heading"
                className="text-lg font-extrabold text-white tracking-tight mt-0.5"
              >
                Funded Challenge Activated
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p
            data-testid="challenge-activated-message"
            className="text-xs sm:text-sm text-slate-300 leading-relaxed"
          >
            {effectiveResult.message}
          </p>

          {persistenceError && (
            <div
              role="alert"
              data-testid="supabase-sync-error-banner"
              className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-3.5 flex items-start gap-2.5 text-xs text-amber-200"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 space-y-0.5">
                <div className="font-bold text-amber-300">Cloud Sync Warning</div>
                <div className="text-amber-200/90 break-words leading-relaxed">
                  {persistenceError}
                </div>
              </div>
            </div>
          )}

          {/* Self Capital Deduction & New Challenge Summary */}
          <div className="rounded-xl bg-[#111827] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Activated Package</span>
              <span className="text-white font-bold">{effectiveResult.packageName}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Account Tier Badge</span>
              <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-extrabold">
                {badgeLabel}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Challenge Starting Capital</span>
              <span
                data-testid="activated-challenge-capital"
                className="text-[#00e5ff] font-extrabold text-sm tabular-nums"
              >
                ${effectiveResult.packageSize.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Deducted from Self Capital</span>
              <span
                data-testid="activated-deducted-amount"
                className="text-amber-300 font-extrabold tabular-nums"
              >
                -${effectiveResult.deductedAmount.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Remaining Self Capital Balance</span>
              <span
                data-testid="activated-remaining-self-capital"
                className="text-emerald-400 font-extrabold tabular-nums"
              >
                ${effectiveResult.remainingSelfCapital.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Challenge Rules Quick Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-[#111827] border border-white/[0.08] p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-semibold">
                <Target className="w-3 h-3 text-[#00e5ff]" />
                <span>Profit Target</span>
              </div>
              <div className="text-xs font-extrabold text-white mt-1">30%</div>
            </div>
            <div className="rounded-xl bg-[#111827] border border-white/[0.08] p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-semibold">
                <TrendingDown className="w-3 h-3 text-rose-400" />
                <span>Max Loss</span>
              </div>
              <div className="text-xs font-extrabold text-rose-300 mt-1">10%</div>
            </div>
            <div className="rounded-xl bg-[#111827] border border-white/[0.08] p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-semibold">
                <Layers className="w-3 h-3 text-amber-400" />
                <span>Max Risk</span>
              </div>
              <div className="text-xs font-extrabold text-amber-300 mt-1">5% / Trade</div>
            </div>
            <div className="rounded-xl bg-[#111827] border border-white/[0.08] p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-semibold">
                <Timer className="w-3 h-3 text-emerald-400" />
                <span>Min Days</span>
              </div>
              <div className="text-xs font-extrabold text-emerald-300 mt-1">5 (≥1%/d)</div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <button
              type="button"
              data-testid="open-activated-challenge-terminal-btn"
              onClick={() => {
                const accId = effectiveResult.account.id;
                onClose();
                onOpenTerminal?.(accId);
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,102,255,0.4)] transition cursor-pointer"
            >
              <span>Trade Now in Terminal</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid="view-activated-challenge-dashboard-btn"
              onClick={() => {
                const accId = effectiveResult.account.id;
                onClose();
                onOpenDashboard?.(accId);
              }}
              className="py-3 px-4 rounded-xl bg-[#161f33] hover:bg-[#1e2a44] border border-[#38BDF8]/30 text-[#38BDF8] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Funded Dashboard</span>
            </button>
            <button
              type="button"
              data-testid="close-challenge-activated-btn"
              onClick={onClose}
              className="py-3 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-300 hover:text-white font-bold text-xs sm:text-sm transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
