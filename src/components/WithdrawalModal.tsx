import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Zap,
  ShieldCheck,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  Percent,
  Wallet,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  ArrowUpRight,
  Ban,
  RefreshCw,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { TradingAccount, WithdrawalRequest, WithdrawalPaymentMethod, UserProfile } from '../types';
import {
  validateWithdrawalRequest,
  evaluateWithdrawalGuarantee,
  calculateWithdrawalBreakdown,
  MIN_WITHDRAWAL_PROFIT,
  isLiveFundedAccount,
  getAccountStatusBadgeLabel,
} from '../utils/propRules';
import { canUserWithdraw, KYC_WITHDRAWAL_LOCK_MESSAGE } from '../utils/kycVerification';
import { soundEngine } from '../utils/soundEffects';

interface WithdrawalModalProps {
  account?: TradingAccount | null;
  accounts?: TradingAccount[];
  onSelectAccount?: (accountId: string) => void;
  onClose: () => void;
  onUpdateAccount: (updated: TradingAccount) => void;
  withdrawals: WithdrawalRequest[];
  onAddWithdrawal: (req: WithdrawalRequest) => void;
  onUpdateWithdrawal: (req: WithdrawalRequest) => void;
  onWithdrawalCommissionTriggered?: (payoutAmount: number) => void;
  inlineMode?: boolean;
  userProfile?: UserProfile;
  onNavigateToKyc?: () => void;
  onOpenChallengeModal?: () => void;
}

export const WithdrawalModal: React.FC<WithdrawalModalProps> = ({
  account,
  accounts = [],
  onSelectAccount,
  onClose,
  onUpdateAccount,
  withdrawals,
  onAddWithdrawal,
  onUpdateWithdrawal,
  onWithdrawalCommissionTriggered,
  inlineMode = false,
  userProfile,
  onNavigateToKyc,
  onOpenChallengeModal,
}) => {
  const kycCheck = canUserWithdraw(userProfile);
  const netProfit = account
    ? Math.max(0, Number((account.currentBalance - account.initialBalance).toFixed(2)))
    : 0;
  const [amount, setAmount] = useState<number>(
    netProfit >= MIN_WITHDRAWAL_PROFIT ? Math.min(200, netProfit) : MIN_WITHDRAWAL_PROFIT
  );
  const [monthsActive, setMonthsActive] = useState<number>(account?.monthsCompleted || 1);
  const [paymentMethod, setPaymentMethod] = useState<WithdrawalPaymentMethod>('crypto_trc20');
  const [trc20Address, setTrc20Address] = useState<string>('TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2');
  const [bankName, setBankName] = useState<string>('Barclays Bank UK PLC');
  const [accountHolder, setAccountHolder] = useState<string>(userProfile?.fullName || 'Alex Mercer');
  const [accountNumber, setAccountNumber] = useState<string>('GB29NWBK60161331926819');
  const [swiftCode, setSwiftCode] = useState<string>('BARCGB22XXX');

  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'PAID' | 'PROCESSING' | 'PENDING' | 'REJECTED'>('ALL');

  // 7-day cycle live countdown timer (4 days, 11 hours, 19 minutes, 45 seconds base)
  const [cycleSecondsRemaining, setCycleSecondsRemaining] = useState<number>(
    4 * 86400 + 11 * 3600 + 19 * 60 + 45
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCycleSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 7 * 86400));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!account) return;
    const updatedProfit = Math.max(0, Number((account.currentBalance - account.initialBalance).toFixed(2)));
    setAmount(updatedProfit >= MIN_WITHDRAWAL_PROFIT ? Math.min(200, updatedProfit) : MIN_WITHDRAWAL_PROFIT);
    setMonthsActive(account.monthsCompleted || 1);
    setError(null);
  }, [account?.id]);

  // Real-time auto-calculation of 10% Withdrawal Fee & Net Receivable Amount
  const breakdown = useMemo(
    () => calculateWithdrawalBreakdown(Math.max(0, amount), monthsActive),
    [amount, monthsActive]
  );

  // Summary Card Metrics
  const pendingPayoutsTotal = useMemo(() => {
    return withdrawals
      .filter((w) => w.status === 'pending' || w.status === 'processing')
      .reduce((sum, w) => sum + (w.netReceivedAmount ?? w.amount * 0.9), 0);
  }, [withdrawals]);

  const pendingPayoutsCount = useMemo(() => {
    return withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing').length;
  }, [withdrawals]);

  const lifetimeWithdrawnTotal = useMemo(() => {
    return withdrawals
      .filter((w) => w.status === 'paid' || w.status === 'completed' || w.status === 'doubled')
      .reduce((sum, w) => sum + (w.netReceivedAmount ?? w.amount * 0.9), 0);
  }, [withdrawals]);

  const paidPayoutsCount = useMemo(() => {
    return withdrawals.filter((w) => w.status === 'paid' || w.status === 'completed' || w.status === 'doubled').length;
  }, [withdrawals]);

  // Active processing request on current account for 3-minute SLA tracker
  const activeRequest = withdrawals.find(
    (w) => w.status === 'processing' && account && w.accountId === account.id
  );

  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  useEffect(() => {
    if (!activeRequest) return;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - activeRequest.requestedAt) / 1000);
      setSecondsElapsed(elapsed);

      if (elapsed >= 95 && activeRequest.status === 'processing') {
        const guarantee = evaluateWithdrawalGuarantee(activeRequest, Date.now());
        onUpdateWithdrawal({
          ...activeRequest,
          status: 'paid',
          completedAt: Date.now(),
          txHash:
            activeRequest.paymentMethod === 'bank_transfer'
              ? `SWIFT-BFT-${Math.floor(100000 + Math.random() * 900000)}`
              : `7a${Math.random().toString(16).substring(2, 10)}${Math.random().toString(16).substring(2, 10)}8e9`,
          timeElapsedSeconds: elapsed,
          amount: guarantee.payoutAmount,
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeRequest, onUpdateWithdrawal]);

  // Format 7-day cycle timer
  const formatCycleCountdown = (totalSec: number) => {
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${d.toString().padStart(2, '0')}d : ${h.toString().padStart(2, '0')}h : ${m
      .toString()
      .padStart(2, '0')}m : ${s.toString().padStart(2, '0')}s`;
  };

  // Validation state for Minimum Threshold ($50) & Balance
  const thresholdValidation = useMemo(() => {
    if (!account) {
      return {
        isValid: false,
        level: 'warning' as const,
        title: 'No Active Account Selected',
        message: 'Purchase a Challenge or Instant Funded account to generate withdrawable trading profits.',
      };
    }
    if (netProfit < MIN_WITHDRAWAL_PROFIT) {
      return {
        isValid: false,
        level: 'warning' as const,
        title: `Minimum Withdrawal Threshold ($${MIN_WITHDRAWAL_PROFIT}.00) Not Yet Reached`,
        message: `Available profit on ${account.id} is $${netProfit.toFixed(2)}. Generate at least $${(
          MIN_WITHDRAWAL_PROFIT - netProfit
        ).toFixed(2)} more profit to unlock withdrawals.`,
      };
    }
    if (amount < MIN_WITHDRAWAL_PROFIT) {
      return {
        isValid: false,
        level: 'error' as const,
        title: `Below Minimum Threshold ($${MIN_WITHDRAWAL_PROFIT}.00)`,
        message: `Requested amount ($${amount.toFixed(2)}) is below the mandatory $${MIN_WITHDRAWAL_PROFIT}.00 minimum payout limit.`,
      };
    }
    if (amount > netProfit) {
      return {
        isValid: false,
        level: 'error' as const,
        title: 'Exceeds Available Profit Balance',
        message: `Requested amount ($${amount.toFixed(2)}) exceeds your withdrawable profit of $${netProfit.toFixed(2)}.`,
      };
    }
    return {
      isValid: true,
      level: 'valid' as const,
      title: `Minimum Threshold ($${MIN_WITHDRAWAL_PROFIT}.00) Satisfied`,
      message: `Your $${amount.toFixed(2)} payout request meets all BFT institutional compliance requirements.`,
    };
  }, [amount, netProfit, account]);

  const handleToggleDailyAddon = () => {
    if (!account) return;
    soundEngine.playUiClick();
    onUpdateAccount({
      ...account,
      dailyWithdrawalsUnlocked: !account.dailyWithdrawalsUnlocked,
    });
  };

  const handleRequestWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessBanner(null);

    if (!kycCheck.allowed) {
      setError(KYC_WITHDRAWAL_LOCK_MESSAGE);
      soundEngine.playErrorAlert();
      return;
    }

    if (!account) {
      setError('No Active Account available for withdrawal.');
      soundEngine.playErrorAlert();
      return;
    }

    const validation = validateWithdrawalRequest(account, amount);
    if (!validation.valid) {
      setError(validation.reason || 'Withdrawal validation failed.');
      soundEngine.playErrorAlert();
      return;
    }

    if (paymentMethod === 'crypto_trc20') {
      if (!trc20Address.trim().startsWith('T') || trc20Address.trim().length < 25) {
        setError('Please enter a valid TRON USDT (TRC-20) wallet address starting with "T".');
        soundEngine.playErrorAlert();
        return;
      }
    } else {
      if (!bankName.trim() || !accountHolder.trim() || accountNumber.trim().length < 6 || swiftCode.trim().length < 6) {
        setError('Please complete all required Bank Transfer fields (Bank Name, Account Holder, IBAN/Account #, SWIFT/BIC).');
        soundEngine.playErrorAlert();
        return;
      }
    }

    const newBalance = Number((account.currentBalance - amount).toFixed(2));
    const newEquity = Number((account.equity - amount).toFixed(2));
    onUpdateAccount({
      ...account,
      currentBalance: newBalance,
      equity: newEquity,
      monthsCompleted: monthsActive,
      scalingActive: monthsActive >= 3,
    });

    const reqId = `WD-${Math.floor(1000 + Math.random() * 9000)}`;
    const refNum =
      paymentMethod === 'crypto_trc20'
        ? `TX-TRC20-${Math.random().toString(16).substring(2, 10).toUpperCase()}`
        : `SWIFT-BFT-${Math.floor(100000 + Math.random() * 900000)}`;

    const newRequest: WithdrawalRequest = {
      id: reqId,
      accountId: account.id,
      amount: breakdown.requestedAmount,
      withdrawalFee: breakdown.withdrawalFeeAmount,
      netReceivedAmount: breakdown.netAmountReceived,
      profitSplitApplied: breakdown.profitSplitPercent,
      paymentMethod,
      trc20Address:
        paymentMethod === 'crypto_trc20'
          ? trc20Address.trim()
          : `${bankName.trim()} • ${accountNumber.trim()}`,
      bankDetails:
        paymentMethod === 'bank_transfer'
          ? {
              bankName: bankName.trim(),
              accountHolder: accountHolder.trim(),
              accountNumber: accountNumber.trim(),
              swiftCode: swiftCode.trim().toUpperCase(),
            }
          : undefined,
      referenceNumber: refNum,
      requestedAt: Date.now(),
      status: 'processing',
      txHash:
        paymentMethod === 'crypto_trc20'
          ? `0x${Math.random().toString(16).substring(2, 14)}${Math.random().toString(16).substring(2, 14)}`
          : refNum,
      isDoublePayoutEligible: true,
      timeElapsedSeconds: 0,
    };

    onAddWithdrawal(newRequest);
    onWithdrawalCommissionTriggered?.(breakdown.traderShareBeforeFee);
    soundEngine.playWithdrawalSuccess();
    setSecondsElapsed(0);
    setSuccessBanner(
      `Withdrawal Request ${reqId} submitted! Net Receivable: $${breakdown.netAmountReceived.toFixed(
        2
      )} (${paymentMethod === 'crypto_trc20' ? 'USDT TRC-20' : 'Bank Transfer'}) after 10% fee deduction.`
    );
  };

  const handleCopyHash = (text: string) => {
    soundEngine.playUiClick();
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  const normalizeStatusLabel = (status: WithdrawalRequest['status']): 'PAID' | 'PROCESSING' | 'PENDING' | 'REJECTED' => {
    if (status === 'paid' || status === 'completed' || status === 'doubled') return 'PAID';
    if (status === 'processing') return 'PROCESSING';
    if (status === 'rejected') return 'REJECTED';
    return 'PENDING';
  };

  const filteredWithdrawals = useMemo(() => {
    if (historyFilter === 'ALL') return withdrawals;
    return withdrawals.filter((w) => normalizeStatusLabel(w.status) === historyFilter);
  }, [withdrawals, historyFilter]);

  const dashboardContent = (
    <div
      data-testid="withdrawal-dashboard"
      className="w-full max-w-6xl mx-auto rounded-2xl bg-[#0a0a0a] border border-white/15 p-5 sm:p-8 text-slate-100 font-sans"
    >
      {/* Top Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 bg-[#ff8800] text-slate-950 px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider font-mono">
              <Zap className="w-3.5 h-3.5 fill-slate-950" />
              BFT Institutional Payout Desk
            </span>

            {/* Account Status Badge (LIVE ACCOUNT vs CHALLENGE vs NO ACTIVE ACCOUNT) */}
            {account ? (
              <span
                data-testid="withdrawal-account-badge"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-black uppercase border ${
                  isLiveFundedAccount(account)
                    ? 'bg-[#00c853]/20 text-[#00e676] border-[#00e676]/50'
                    : 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/50'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLiveFundedAccount(account) ? 'bg-[#00e676]' : 'bg-[#ff8800]'
                  }`}
                />
                {account.id} • {getAccountStatusBadgeLabel(account)}
              </span>
            ) : (
              <span
                data-testid="withdrawal-no-account-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-black uppercase border bg-[#16161c] text-[#ff8800] border-[#ff8800]/50"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff8800]" />
                No Active Account
              </span>
            )}

            {/* KYC Compliance Badge */}
            <span
              data-testid="withdrawal-kyc-badge"
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-black uppercase border ${
                userProfile?.kycStatus === 'verified'
                  ? 'bg-[#00c853]/20 text-[#00e676] border-[#00e676]/50'
                  : userProfile?.kycStatus === 'pending'
                  ? 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/50'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/50'
              }`}
            >
              {userProfile?.kycStatus === 'verified' ? (
                <ShieldCheck className="w-3.5 h-3.5 text-[#00e676]" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              KYC: {userProfile?.kycStatus ? userProfile.kycStatus.toUpperCase() : 'UNVERIFIED'}
            </span>

            {/* Optional Daily Withdrawal Add-on Verified Badge */}
            {account?.dailyWithdrawalsUnlocked ? (
              <span
                data-testid="daily-payouts-enabled-badge"
                className="inline-flex items-center gap-1.5 bg-[#00c853]/20 border border-[#00e676]/50 text-[#00e676] px-3 py-0.5 rounded text-[11px] font-mono font-black"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00e676]" />
                Daily Payouts Enabled (No 7-day restriction)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-[#141418] border border-white/15 text-slate-300 px-3 py-0.5 rounded text-[11px] font-mono font-semibold">
                <CalendarClock className="w-3.5 h-3.5 text-[#ff8800]" />
                Standard 7-Day Payout Cycle
              </span>
            )}
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Withdrawal Dashboard & Payout Request
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Request instant crypto (USDT TRC-20) or institutional wire settlements. Automatic{' '}
            <strong className="text-white">10% Withdrawal Processing Fee</strong> deduction with{' '}
            <strong className="text-[#ff8800]">{monthsActive >= 3 ? '90% Scaling Split' : '80% Profit Split'}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
          {/* Account selector if multiple accounts exist */}
          {accounts.length > 1 && onSelectAccount && account && (
            <select
              aria-label="Select Account for Withdrawal"
              value={account.id}
              onChange={(e) => {
                soundEngine.playUiClick();
                onSelectAccount(e.target.value);
              }}
              className="px-3 py-2 rounded-xl bg-[#121216] border border-white/15 text-xs font-mono font-bold text-white focus:outline-none focus:border-[#ff8800] cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.id} ({getAccountStatusBadgeLabel(acc)}) — Bal: ${acc.currentBalance.toFixed(0)}
                </option>
              ))}
            </select>
          )}

          {/* Toggle +15% Daily Withdrawal Add-on for instant verification */}
          {account && (
            <button
              type="button"
              onClick={handleToggleDailyAddon}
              data-testid="toggle-daily-addon-btn"
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                account.dailyWithdrawalsUnlocked
                  ? 'bg-[#00c853]/15 border-[#00e676]/50 text-[#00e676]'
                  : 'bg-[#121216] border-white/15 text-slate-300 hover:border-[#ff8800]'
              }`}
              title="Toggle +15% Daily Withdrawal Package Add-on"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{account.dailyWithdrawalsUnlocked ? 'Daily Add-on: ON' : 'Enable Daily Add-on (+15%)'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            aria-label="Close Withdrawal Dashboard"
            className="p-2 rounded-xl bg-[#121216] border border-white/15 text-slate-400 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* STRICT KYC VERIFICATION RESTRICTION BANNER */}
      {!kycCheck.allowed && (
        <div
          data-testid="kyc-withdrawal-lock-banner"
          className="mt-6 p-4 sm:p-5 rounded-2xl bg-[#121216] border-2 border-[#ff8800] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center shrink-0 text-[#ff8800]">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-black uppercase tracking-wider text-[#ff8800]">
                  Withdrawal Access Restricted • KYC Verification Required
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-black uppercase">
                  Status: {userProfile?.kycStatus ? userProfile.kycStatus.toUpperCase() : 'UNVERIFIED'}
                </span>
              </div>
              <p
                data-testid="kyc-withdrawal-lock-text"
                className="text-sm sm:text-base font-black text-white mt-1"
              >
                {KYC_WITHDRAWAL_LOCK_MESSAGE}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete your immutable personal profile details (Full Name, Address, Date of Birth) and upload your official government ID to unlock payouts.
              </p>
            </div>
          </div>

          {onNavigateToKyc && (
            <button
              type="button"
              data-testid="complete-kyc-from-withdrawal-btn"
              onClick={() => {
                soundEngine.playUiClick();
                onNavigateToKyc();
              }}
              className="px-4 py-3 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black font-mono text-xs uppercase tracking-wider shrink-0 cursor-pointer transition-colors min-h-[44px]"
            >
              Complete KYC Verification →
            </button>
          )}
        </div>
      )}

      {/* NO ACTIVE ACCOUNT BANNER WHEN USER HAS NOT YET PURCHASED A PLAN */}
      {!account && (
        <div
          data-testid="withdrawal-no-account-banner"
          className="mt-4 p-4 sm:p-5 rounded-2xl bg-[#111114] border border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <span className="text-xs font-mono font-black uppercase tracking-wider text-[#ff8800]">
              No Active Account
            </span>
            <h3 className="text-base font-black text-white mt-0.5">
              You have not purchased a Challenge or Instant Funded account yet
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose an evaluation plan or Instant Funded account to start trading and generating withdrawable profits.
            </p>
          </div>
          {onOpenChallengeModal && (
            <button
              type="button"
              data-testid="withdrawal-choose-plan-btn"
              onClick={() => {
                soundEngine.playUiClick();
                onOpenChallengeModal();
              }}
              className="px-4 py-3 rounded-xl bg-[#16161c] hover:bg-[#1f1f27] text-[#ff8800] border border-[#ff8800] font-black font-mono text-xs uppercase tracking-wider shrink-0 cursor-pointer transition-colors min-h-[44px]"
            >
              Choose a Plan / Buy Challenge
            </button>
          )}
        </div>
      )}

      {/* 1. FOUR BALANCE & ELIGIBILITY SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        {/* Card 1: Available Balance */}
        <div
          data-testid="card-available-balance"
          className="p-4 rounded-xl bg-[#111114] border border-white/10 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              Available Balance
            </span>
            <span className="p-1.5 rounded-lg bg-[#ff8800]/15 text-[#ff8800]">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-white">
            ${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Account Equity:</span>
            <span className="text-slate-200 font-bold">
              ${(account?.currentBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Card 2: Pending Payouts */}
        <div
          data-testid="card-pending-payouts"
          className="p-4 rounded-xl bg-[#111114] border border-white/10 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              Pending Payouts
            </span>
            <span className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-[#ff8800]">
            ${pendingPayoutsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Active Requests:</span>
            <span className="text-amber-300 font-bold">{pendingPayoutsCount} In Queue</span>
          </div>
        </div>

        {/* Card 3: Lifetime Withdrawn */}
        <div
          data-testid="card-lifetime-withdrawn"
          className="p-4 rounded-xl bg-[#111114] border border-white/10 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              Lifetime Withdrawn
            </span>
            <span className="p-1.5 rounded-lg bg-[#00c853]/15 text-[#00e676]">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-[#00e676]">
            ${lifetimeWithdrawnTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Settled Payouts:</span>
            <span className="text-[#00e676] font-bold">{paidPayoutsCount} Paid (100% SLA)</span>
          </div>
        </div>

        {/* Card 4: Next Withdrawal Eligibility Timer */}
        <div
          data-testid="card-eligibility-timer"
          className="p-4 rounded-xl bg-[#111114] border border-white/10 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              Next Withdrawal Eligibility Timer
            </span>
            <span className="p-1.5 rounded-lg bg-[#ff8800]/15 text-[#ff8800]">
              <CalendarClock className="w-4 h-4" />
            </span>
          </div>
          {account?.dailyWithdrawalsUnlocked ? (
            <>
              <div className="text-lg font-black font-mono text-[#00e676] tracking-tight">
                00d : 00h : 00m : 00s
              </div>
              <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#00e676] font-bold">✓ Daily Payouts Enabled</span>
                <span className="text-slate-400">No 7-Day Lock</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-black font-mono text-white tracking-tight">
                {formatCycleCountdown(cycleSecondsRemaining)}
              </div>
              <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>7-Day Cycle Window:</span>
                <span className="text-[#ff8800] font-bold">{account ? 'Eligible Now' : 'No Account'}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Optional Daily Withdrawal Add-on Banner */}
      {account?.dailyWithdrawalsUnlocked && (
        <div className="mb-6 p-3.5 rounded-xl bg-[#071a12] border border-[#00e676]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#00e676] shrink-0" />
            <div>
              <span className="text-xs sm:text-sm font-black text-[#00e676] font-mono">
                Daily Payouts Enabled (No 7-day restriction)
              </span>
              <p className="text-xs text-slate-300">
                Your +15% Daily Withdrawal package add-on is active. You can submit payout requests on any calendar day without waiting for the 7-day cycle reset.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-[#00e676]/15 border border-[#00e676]/40 text-[#00e676] font-mono text-[10px] font-black uppercase shrink-0">
            VERIFIED ADD-ON (+15%)
          </span>
        </div>
      )}

      {/* Main Two-Column Grid: Left = Withdrawal Form | Right = Real-Time Calculation & SLA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Left Column (7 cols): Withdrawal Request Form */}
        <form onSubmit={handleRequestWithdrawal} className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#111114] border border-white/10 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wide font-mono">
                1. Configure Payout Request
              </h3>
              <p className="text-xs text-slate-400">
                Select settlement rail and specify your withdrawal amount (Min ${MIN_WITHDRAWAL_PROFIT}.00).
              </p>
            </div>

            {/* Tenure / Profit Split Selector */}
            <div className="flex bg-[#0a0a0a] p-1 rounded-xl border border-white/10 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setMonthsActive(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  monthsActive < 3 ? 'bg-[#ff8800] text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                M1–3 (80% Split)
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setMonthsActive(3);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  monthsActive >= 3 ? 'bg-[#ff8800] text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                M3+ (90% Split)
              </button>
            </div>
          </div>

          {/* Feedback Notifications */}
          {error && (
            <div
              data-testid="withdrawal-error-banner"
              className="p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/50 text-xs text-rose-200 flex items-start gap-2.5 font-mono"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successBanner && (
            <div
              data-testid="withdrawal-success-banner"
              className="p-3.5 rounded-xl bg-emerald-950/90 border border-[#00e676]/50 text-xs text-emerald-200 flex items-start gap-2.5 font-mono"
            >
              <CheckCircle2 className="w-4 h-4 text-[#00e676] shrink-0 mt-0.5" />
              <span>{successBanner}</span>
            </div>
          )}

          {/* Payment Method Selector: Crypto (USDT TRC-20) vs Bank Transfer */}
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2 font-mono">
              Select Payment Method
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                data-testid="method-crypto-trc20"
                onClick={() => {
                  soundEngine.playUiClick();
                  setPaymentMethod('crypto_trc20');
                }}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                  paymentMethod === 'crypto_trc20'
                    ? 'bg-[#1a140c] border-[#ff8800] text-white'
                    : 'bg-[#0a0a0a] border-white/10 text-slate-400 hover:border-white/25'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 ${
                    paymentMethod === 'crypto_trc20' ? 'border-[#ff8800]' : 'border-slate-500'
                  }`}
                >
                  {paymentMethod === 'crypto_trc20' && <div className="w-2 h-2 rounded-full bg-[#ff8800]" />}
                </div>
                <div>
                  <div className="text-xs font-black font-mono text-white flex items-center gap-1.5">
                    <span>Crypto (USDT TRC-20)</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#00c853]/20 text-[#00e676] border border-[#00e676]/40">
                      3-Min SLA
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Instant TRON network settlement directly to your USDT wallet.
                  </p>
                </div>
              </button>

              <button
                type="button"
                data-testid="method-bank-transfer"
                onClick={() => {
                  soundEngine.playUiClick();
                  setPaymentMethod('bank_transfer');
                }}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                  paymentMethod === 'bank_transfer'
                    ? 'bg-[#1a140c] border-[#ff8800] text-white'
                    : 'bg-[#0a0a0a] border-white/10 text-slate-400 hover:border-white/25'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 ${
                    paymentMethod === 'bank_transfer' ? 'border-[#ff8800]' : 'border-slate-500'
                  }`}
                >
                  {paymentMethod === 'bank_transfer' && <div className="w-2 h-2 rounded-full bg-[#ff8800]" />}
                </div>
                <div>
                  <div className="text-xs font-black font-mono text-white flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#ff8800]" />
                    <span>Bank Transfer (SWIFT / IBAN)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Direct institutional wire transfer in USD / EUR / GBP.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Withdrawal Amount Input + Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5 font-mono text-xs">
              <label htmlFor="withdrawal-amount-input" className="font-bold text-slate-200 uppercase">
                Withdrawal Amount (USD)
              </label>
              <span className="text-slate-400">
                Min: <strong className="text-[#ff8800]">${MIN_WITHDRAWAL_PROFIT}.00</strong> • Max:{' '}
                <strong className="text-[#00e676]">${netProfit.toFixed(2)}</strong>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#ff8800] font-mono font-black text-base">
                  $
                </span>
                <input
                  id="withdrawal-amount-input"
                  data-testid="withdrawal-amount-input"
                  type="number"
                  min={0}
                  step="10"
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full pl-8 pr-4 py-3 bg-[#0a0a0a] border border-white/15 rounded-xl text-white font-mono font-black text-base focus:outline-none focus:border-[#ff8800] transition-colors"
                />
              </div>

              <div className="grid grid-cols-4 gap-1.5 font-mono text-xs shrink-0">
                {[
                  { label: '$50 Min', val: 50 },
                  { label: '25%', val: Math.max(50, Math.round(netProfit * 0.25)) },
                  { label: '50%', val: Math.max(50, Math.round(netProfit * 0.5)) },
                  { label: 'MAX', val: Math.max(50, netProfit) },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setAmount(Number(preset.val.toFixed(2)));
                    }}
                    className="px-2.5 py-2.5 rounded-xl bg-[#0a0a0a] hover:bg-[#1a140c] border border-white/10 hover:border-[#ff8800] text-slate-300 hover:text-white font-bold transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Minimum Threshold Warning ($50) with Live Validation States */}
            <div
              data-testid="min-threshold-warning"
              className={`mt-3 p-3 rounded-xl border text-xs font-mono flex items-start gap-2.5 ${
                thresholdValidation.level === 'valid'
                  ? 'bg-[#071a12] border-[#00e676]/40 text-emerald-200'
                  : thresholdValidation.level === 'warning'
                  ? 'bg-[#1a1308] border-[#ff8800]/50 text-amber-200'
                  : 'bg-[#1f090d] border-rose-500/50 text-rose-200'
              }`}
            >
              {thresholdValidation.level === 'valid' ? (
                <CheckCircle2 className="w-4 h-4 text-[#00e676] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#ff8800] shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-black text-white">{thresholdValidation.title}</div>
                <div className="text-[11px] opacity-90 mt-0.5">{thresholdValidation.message}</div>
              </div>
            </div>
          </div>

          {/* Dynamic Destination Fields: Crypto Wallet vs Bank Transfer */}
          {paymentMethod === 'crypto_trc20' ? (
            <div>
              <label
                htmlFor="trc20-wallet-input"
                className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1.5 font-mono"
              >
                USDT (TRC-20) Receiving Wallet Address
              </label>
              <input
                id="trc20-wallet-input"
                data-testid="trc20-wallet-input"
                type="text"
                value={trc20Address}
                onChange={(e) => setTrc20Address(e.target.value)}
                placeholder="Enter TRON TRC-20 Address starting with T..."
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/15 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#ff8800] transition-colors"
              />
              <span className="text-[11px] text-slate-400 font-mono block mt-1">
                Ensure address is on the TRON (TRC-20) network. Guaranteed 3-minute automated dispatch.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1 font-mono">
                  Bank Name
                </label>
                <input
                  data-testid="bank-name-input"
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. Barclays Bank UK"
                  className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1 font-mono">
                  Account Holder Name
                </label>
                <input
                  data-testid="bank-holder-input"
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="Full Legal Name"
                  className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1 font-mono">
                  IBAN / Account Number
                </label>
                <input
                  data-testid="bank-iban-input"
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="IBAN or Account Number"
                  className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1 font-mono">
                  SWIFT / BIC Code
                </label>
                <input
                  data-testid="bank-swift-input"
                  type="text"
                  value={swiftCode}
                  onChange={(e) => setSwiftCode(e.target.value)}
                  placeholder="e.g. BARCGB22XXX"
                  className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            data-testid="submit-withdrawal-btn"
            disabled={!kycCheck.allowed || !account || !thresholdValidation.isValid}
            className={`w-full py-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors font-mono uppercase tracking-wider min-h-[48px] ${
              kycCheck.allowed && account && thresholdValidation.isValid
                ? 'bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 cursor-pointer'
                : 'bg-white/5 text-slate-400 cursor-not-allowed border border-white/10'
            }`}
          >
            {!kycCheck.allowed ? (
              <>
                <Lock className="w-4 h-4 text-[#ff8800]" />
                <span>{KYC_WITHDRAWAL_LOCK_MESSAGE}</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {!account
                    ? 'No Active Account — Choose a Plan to Unlock Withdrawals'
                    : thresholdValidation.isValid
                    ? `Submit Withdrawal • Receive $${breakdown.netAmountReceived.toFixed(2)} Net (${
                        paymentMethod === 'crypto_trc20' ? 'USDT TRC-20' : 'Bank Wire'
                      })`
                    : `Minimum $${MIN_WITHDRAWAL_PROFIT}.00 Profit Required to Withdraw`}
                </span>
              </>
            )}
          </button>
        </form>

        {/* Right Column (5 cols): Auto-Calculation Breakdown & Active SLA Monitor */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          <div
            data-testid="withdrawal-calculation-box"
            className="p-5 sm:p-6 rounded-2xl bg-[#111114] border border-[#ff8800]/40 space-y-4 font-mono"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-black text-[#ff8800] uppercase flex items-center gap-1.5">
                <Percent className="w-4 h-4" /> Real-Time Payout Auto-Calculation
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/30 font-bold">
                {breakdown.scalingPlanUnlocked ? '90% Scaling Split' : '80% Standard Split'}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Requested Withdrawal Amount:</span>
                <span data-testid="calc-requested-amount" className="text-white font-black text-sm">
                  ${breakdown.requestedAmount.toFixed(2)} USD
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span>Applicable Trader Split ({breakdown.profitSplitPercent}%):</span>
                <span className="text-[#00e676] font-bold">
                  {breakdown.profitSplitPercent}% ({monthsActive >= 3 ? '3+ Months Scaling' : 'Months 1–3'})
                </span>
              </div>

              <div className="flex items-center justify-between text-rose-300 p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30">
                <span>Automatic 10% Withdrawal Fee Deduction:</span>
                <span data-testid="calc-fee-amount" className="font-black text-rose-400">
                  -${breakdown.withdrawalFeeAmount.toFixed(2)} USD (10%)
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#0a0a0a] border border-[#ff8800] flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">
                    Net Receivable Amount (90% After Fee)
                  </span>
                  <span className="text-[11px] text-slate-300">
                    Via {paymentMethod === 'crypto_trc20' ? 'USDT (TRC-20)' : 'Bank Wire Transfer'}
                  </span>
                </div>
                <span data-testid="calc-net-receivable" className="text-2xl font-black text-[#ff8800]">
                  ${breakdown.netAmountReceived.toFixed(2)}
                </span>
              </div>

              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                <span>Sponsor 8% Payout Royalty Bonus:</span>
                <span className="text-emerald-400 font-bold">+${breakdown.affiliateWithdrawalBonus.toFixed(2)} USDT</span>
              </div>
            </div>
          </div>

          {/* Active Processing SLA Card */}
          <div className="p-5 rounded-2xl bg-[#111114] border border-white/10 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-black text-white uppercase flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#00e676]" />
                3-Minute Automated SLA Monitor
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#00c853]/20 text-[#00e676] font-bold">
                2X GUARANTEE ACTIVE
              </span>
            </div>

            {activeRequest ? (
              <div className="p-3.5 rounded-xl bg-[#0a0a0a] border border-[#ff8800] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Processing Request:</span>
                  <span className="text-white font-black">{activeRequest.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Net Dispatching:</span>
                  <span className="text-[#00e676] font-black">
                    ${(activeRequest.netReceivedAmount ?? activeRequest.amount * 0.9).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Elapsed SLA Time:</span>
                  <span className="text-[#ff8800] font-black">{secondsElapsed}s / 180s</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Every BFT withdrawal is backed by our <strong className="text-white">180-Second Settlement SLA</strong>. If an approved TRC-20 payout takes longer than 3 minutes, our smart treasury automatically doubles the payout (2X).
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 4. WITHDRAWAL HISTORY & TRANSACTION TABLE */}
      <div className="rounded-2xl bg-[#111114] border border-white/10 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider font-mono">
              Withdrawal History & Transaction Ledger
            </h3>
            <p className="text-xs text-slate-400">
              Complete audit log of requested payouts, 10% processing fees, net settlements, and blockchain/SWIFT references.
            </p>
          </div>

          {/* Status Filter Buttons */}
          <div className="flex flex-wrap gap-1 bg-[#0a0a0a] p-1 rounded-xl border border-white/10 font-mono text-[11px]">
            {(['ALL', 'PAID', 'PROCESSING', 'PENDING', 'REJECTED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setHistoryFilter(st);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  historyFilter === st
                    ? 'bg-[#ff8800] text-slate-950 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table data-testid="withdrawal-history-table" className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="bg-[#0a0a0a] text-slate-400 text-[10px] uppercase tracking-wider border-b border-white/10">
                <th className="py-3 px-4">Payout ID & Account</th>
                <th className="py-3 px-4">Method & Destination</th>
                <th className="py-3 px-4">TX Hash / Reference</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Requested</th>
                <th className="py-3 px-4 text-right">10% Fee</th>
                <th className="py-3 px-4 text-right">Net Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No withdrawal transactions match the selected filter ({historyFilter}).
                  </td>
                </tr>
              ) : (
                filteredWithdrawals.map((item) => {
                  const statusLabel = normalizeStatusLabel(item.status);
                  const gross = item.amount;
                  const fee = item.withdrawalFee ?? Number((gross * 0.1).toFixed(2));
                  const net = item.netReceivedAmount ?? Number((gross - fee).toFixed(2));
                  const isBank = item.paymentMethod === 'bank_transfer';
                  const hashOrRef = item.txHash || item.referenceNumber || 'PENDING-REF';

                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-black text-white">{item.id}</div>
                        <div className="text-[10px] text-slate-400">{item.accountId}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-200 flex items-center gap-1.5">
                          {isBank ? (
                            <>
                              <Building2 className="w-3.5 h-3.5 text-[#ff8800]" />
                              <span>Bank Transfer</span>
                            </>
                          ) : (
                            <>
                              <Wallet className="w-3.5 h-3.5 text-[#00e676]" />
                              <span>Crypto (USDT TRC-20)</span>
                            </>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[190px]" title={item.trc20Address}>
                          {item.trc20Address}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-300 truncate max-w-[140px]" title={hashOrRef}>
                            {hashOrRef.length > 18 ? `${hashOrRef.slice(0, 16)}...` : hashOrRef}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyHash(hashOrRef)}
                            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                            title="Copy Reference / TX Hash"
                          >
                            {copiedHash === hashOrRef ? (
                              <Check className="w-3 h-3 text-[#00e676]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        {item.rejectionReason && (
                          <div className="text-[10px] text-rose-400 mt-0.5 max-w-[200px] truncate" title={item.rejectionReason}>
                            {item.rejectionReason}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-[11px] text-slate-300">
                        <div>{new Date(item.requestedAt).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(item.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-300">
                        ${gross.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-rose-400">
                        -${fee.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-black text-white text-sm">
                        ${net.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {statusLabel === 'PAID' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#00c853]/20 text-[#00e676] border border-[#00e676]/40 text-[10px] font-black uppercase">
                            <ArrowUpRight className="w-3 h-3" />
                            Paid
                          </span>
                        )}
                        {statusLabel === 'PROCESSING' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-black uppercase">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Processing
                          </span>
                        )}
                        {statusLabel === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40 text-[10px] font-black uppercase">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                        {statusLabel === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-black uppercase">
                            <Ban className="w-3 h-3" />
                            Rejected
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (inlineMode) {
    return dashboardContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="my-4 w-full max-w-6xl">{dashboardContent}</div>
    </div>
  );
};
