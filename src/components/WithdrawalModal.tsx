import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Lock,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  Plus,
  LineChart,
  CreditCard,
  History,
  User,
  Trophy,
  BarChart3,
  Store,
  XCircle,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { TradingAccount, WithdrawalRequest, WithdrawalPaymentMethod, UserProfile, BinaryTrade } from '../types';
import {
  validateWithdrawalRequest,
  evaluateWithdrawalGuarantee,
  calculateWithdrawalBreakdown,
  MIN_WITHDRAWAL_PROFIT,
  FIRST_WITHDRAWAL_WAITING_DAYS,
  WITHDRAWAL_GUARANTEE_NOTICE,
  WITHDRAWAL_FEE_PERCENT,
  checkFirstWithdrawalWaitingPeriod,
  isLiveFundedAccount,
  isPersonalLiveAccount,
  isDemoAccount,
  getAccountStatusBadgeLabel,
} from '../utils/propRules';
import { canUserWithdraw, KYC_WITHDRAWAL_LOCK_MESSAGE } from '../utils/kycVerification';
import {
  QuotexPortalTab,
  QuotexCryptoNetwork,
  QuotexPaymentMethodOption,
  QUOTEX_WITHDRAWAL_FAQS,
  buildMergedTransactionLedger,
  paginateTransactions,
  calculateQuotexAccountSummary,
  validateQuotexPurseAddress,
} from '../utils/quotexWithdrawalPortal';
import { soundEngine } from '../utils/soundEffects';
import { apiSubmitWithdrawal, apiCancelWithdrawal, apiValidate2fa, safeJsonResponse } from '../utils/apiClient';
import { supabase } from '../utils/supabase';
import {
  insertSupabaseWithdrawal,
  fetchSupabaseWithdrawalsForUser,
  mapSupabaseWithdrawalToRequest,
  computeWithdrawalDeduction,
  computeWithdrawalRefund,
  hasActivePendingWithdrawal,
  getActivePendingWithdrawal,
  PENDING_WITHDRAWAL_WARNING_MESSAGE,
  commitProfileBalanceToSupabase,
} from '../utils/supabaseRealtimeSync';

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
  onUpdateProfile?: (updated: UserProfile) => void;
  onNavigateToKyc?: () => void;
  onOpenChallengeModal?: () => void;
  onOpenDepositModal?: () => void;
  onNavigateTab?: (tab: string) => void;
  trades?: BinaryTrade[];
  initialPortalTab?: QuotexPortalTab;
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
  onUpdateProfile,
  onNavigateToKyc,
  onOpenChallengeModal,
  onOpenDepositModal,
  onNavigateTab,
  trades = [],
  initialPortalTab = 'withdrawal',
}) => {
  const [activePortalTab, setActivePortalTab] = useState<QuotexPortalTab>(initialPortalTab);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [mobilePortalDropdownOpen, setMobilePortalDropdownOpen] = useState(false);

  const kycCheck = canUserWithdraw(userProfile);
  const accountSummary = useMemo(() => calculateQuotexAccountSummary(account), [account]);
  const netProfit = accountSummary.availableForWithdrawal;
  const firstWithdrawalCheck = useMemo(() => checkFirstWithdrawalWaitingPeriod(account), [account]);

  // Quotex Form State (Minimum withdrawal $10 for Personal Live, $250 for Funded)
  const isPersonal = isPersonalLiveAccount(account);
  const minThreshold = isPersonal ? 10 : MIN_WITHDRAWAL_PROFIT;
  const [amount, setAmount] = useState<number>(
    netProfit >= minThreshold ? Math.max(minThreshold, Math.min(350, netProfit)) : minThreshold
  );
  const [monthsActive] = useState<number>(account?.monthsCompleted || 1);
  const [quotexMethod, setQuotexMethod] = useState<QuotexPaymentMethodOption>('USDT');
  const [paymentMethod, setPaymentMethod] = useState<WithdrawalPaymentMethod>('crypto_trc20');
  const [network, setNetwork] = useState<QuotexCryptoNetwork>('BSC (BEP20)');
  const [purseAddress, setPurseAddress] = useState<string>('');

  // Bank fallback fields when Bank Transfer is chosen
  const [bankName, setBankName] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>(userProfile?.fullName || '');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [swiftCode, setSwiftCode] = useState<string>('');

  // Accordion & UI States
  const [expandedFaqIds, setExpandedFaqIds] = useState<Record<string, boolean>>({
    'q-faq-1': true,
    'q-faq-2': true,
    'q-faq-3': true,
    'q-faq-4': true,
    'q-faq-5': true,
    'q-faq-6': true,
  });
  const [latestRequestsExpanded, setLatestRequestsExpanded] = useState<boolean>(true);

  // Payments / History Pagination & Filter State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Payout' | 'Deposit'>('ALL');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // 2FA Mandatory Check & Verification States
  const is2faActive = Boolean(
    userProfile?.twoFactorEnabled ||
    (userProfile as any)?.is2faEnabled ||
    (userProfile as any)?.is_2fa_enabled
  );
  const [showTwoFactorModal, setShowTwoFactorModal] = useState<boolean>(false);
  const [withdrawalTotpCode, setWithdrawalTotpCode] = useState<string>('');
  const [isVerifyingTotp, setIsVerifyingTotp] = useState<boolean>(false);
  const [totpError, setTotpError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync user's latest withdrawals from Supabase on mount
  useEffect(() => {
    let isMounted = true;
    
    // 1. Force clear stale local cache on mount
    try {
      localStorage.removeItem('bft_withdrawals_v1');
    } catch {}

    fetchSupabaseWithdrawalsForUser({
      userId: userProfile?.id || account?.ownerId,
      userEmail: userProfile?.email,
    })
      .then((rows) => {
        if (!isMounted) return;
        // Even if rows is empty, we have cleared the cache above.
        if (!Array.isArray(rows) || rows.length === 0) return;
        for (const row of rows) {
          const mapped = mapSupabaseWithdrawalToRequest(row);
          const exists = withdrawals.some((w) => String(w.id) === String(mapped.id));
          if (exists) {
            onUpdateWithdrawal(mapped);
          } else {
            onAddWithdrawal(mapped);
          }
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [userProfile?.id, userProfile?.email]);

  const formatCountdownRemaining = (countdownEndsAtMs?: number): string => {
    if (!countdownEndsAtMs || !Number.isFinite(countdownEndsAtMs)) return '59:59';
    const diffSec = Math.max(0, Math.floor((countdownEndsAtMs - nowTick) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleCancelWithdrawalRequest = async (withdrawalId: string) => {
    if (!withdrawalId || cancellingId) return;
    setCancellingId(withdrawalId);
    setError(null);
    soundEngine.playUiClick();

    try {
      const targetReq = withdrawals.find((w) => String(w.id) === String(withdrawalId));

      // Direct Supabase client cancellation (bypasses unstable Edge Function CORS errors)
      const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const res = await apiCancelWithdrawal({
        withdrawalId,
        token: session?.access_token,
        userId: userProfile?.id || account?.ownerId,
        userEmail: userProfile?.email,
        amount: targetReq?.amount,
        accountType: targetReq?.accountType,
        refundInSupabase: !userProfile,
      });

      if (!res.ok) {
        setError(res.error || 'Failed to cancel withdrawal request.');
        return;
      }

      const refundAmount = Number(
        res.refundedAmount || targetReq?.amount || (targetReq as any)?.grossAmount || 0
      );
      const resolvedAccountType =
        targetReq?.accountType ||
        res.withdrawal?.account_type ||
        (account && isPersonalLiveAccount(account) ? 'self' : 'funded');

      if (refundAmount > 0 && userProfile) {
        const refundResult = computeWithdrawalRefund({
          amount: refundAmount,
          accountType: resolvedAccountType,
          account,
          userProfile,
        });

        if (refundResult.updatedAccount) {
          onUpdateAccount(refundResult.updatedAccount);
        }
        if (onUpdateProfile) {
          onUpdateProfile(refundResult.updatedProfile);
        }

        await commitProfileBalanceToSupabase({
          userId: userProfile.id || account?.ownerId,
          userEmail: userProfile.email,
          column: refundResult.column,
          newBalance: refundResult.newBalance,
        });
      }

      // Refresh withdrawals from Supabase source to ensure UI ledger is in sync
      const rows = await fetchSupabaseWithdrawalsForUser({
        userId: userProfile?.id || account?.ownerId,
        userEmail: userProfile?.email,
      });
      if (Array.isArray(rows)) {
        for (const row of rows) {
          onUpdateWithdrawal(mapSupabaseWithdrawalToRequest(row));
        }
      }

      if (targetReq) {
        onUpdateWithdrawal({
          ...targetReq,
          status: 'cancelled',
        });
        setSuccessBanner(
          `Withdrawal request #${String(withdrawalId).slice(0, 8)} cancelled! Successfully refunded $${refundAmount.toFixed(2)} USD back to your active balance.`
        );
      } else {
        setSuccessBanner(
          `Withdrawal #${String(withdrawalId).slice(0, 8)} cancellation processed. Balance refunded.`
        );
      }
      setForceCleared(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel withdrawal request.');
      setForceCleared(true);
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    if (!account) return;
    const isPersonalAcc = isPersonalLiveAccount(account);
    const minVal = isPersonalAcc ? 10 : MIN_WITHDRAWAL_PROFIT;
    const updatedWithdrawable = isPersonalAcc
      ? Math.max(0, Number(account.currentBalance.toFixed(2)))
      : Math.max(0, Number((account.currentBalance - account.initialBalance).toFixed(2)));
    if (updatedWithdrawable >= minVal) {
      setAmount(Math.max(minVal, Math.min(350, updatedWithdrawable)));
    } else {
      setAmount(minVal);
    }
    setError(null);
    setSuccessBanner(null);
  }, [account?.id]);

  // Synchronize paymentMethod when quotexMethod changes
  const handleChangeQuotexMethod = (nextMethod: QuotexPaymentMethodOption) => {
    setQuotexMethod(nextMethod);
    if (nextMethod === 'Bank Transfer') {
      setPaymentMethod('bank_transfer');
    } else {
      setPaymentMethod('crypto_trc20');
    }
  };

  const handleChangeNetwork = (nextNet: QuotexCryptoNetwork) => {
    setNetwork(nextNet);
  };

  // Breakdown calculation (includes 10% Withdrawal Fee deduction)
  const breakdown = useMemo(
    () => calculateWithdrawalBreakdown(Math.max(0, amount), monthsActive, isPersonalLiveAccount(account)),
    [amount, monthsActive, account]
  );

  // Single Active Withdrawal Constraint: Check for pending/processing request matching this account type
  const [forceCleared, setForceCleared] = useState(false);
  useEffect(() => {
    setForceCleared(false);
  }, [withdrawals]);
  const activePendingRequest = useMemo(
    () => {
        if (forceCleared) return null;
        const req = getActivePendingWithdrawal(withdrawals, account);
        return req && req.status === 'pending' ? req : null;
    },
    [withdrawals, account, forceCleared]
  );
  
  const hasActivePending = Boolean(activePendingRequest);
  const activeRequest = activePendingRequest;

  // Merged Transaction Ledger & Pagination (strictly real user withdrawals, no fake demo rows)
  const allTransactions = useMemo(() => buildMergedTransactionLedger(withdrawals, false), [withdrawals]);
  const filteredTransactions = useMemo(() => {
    if (typeFilter === 'ALL') return allTransactions;
    return allTransactions.filter((t) => t.type === typeFilter);
  }, [allTransactions, typeFilter]);

  const pagination = useMemo(
    () => paginateTransactions(filteredTransactions, currentPage, 5),
    [filteredTransactions, currentPage]
  );

  const toggleFaq = (id: string) => {
    soundEngine.playUiClick();
    setExpandedFaqIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyText = (text: string) => {
    soundEngine.playUiClick();
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  const handlePortalTabClick = (tab: QuotexPortalTab) => {
    soundEngine.playUiClick();
    if (tab === 'account' && onNavigateToKyc) {
      onNavigateToKyc();
      return;
    }
    if (tab === 'market' && onNavigateTab) {
      onNavigateTab('terminal');
      return;
    }
    if (tab === 'tournaments' && onNavigateTab) {
      onNavigateTab('home');
      return;
    }
    setActivePortalTab(tab);
  };

  const proceedWithdrawalSubmission = async () => {
    if (!account) return;
    const walletAddr =
      paymentMethod === 'crypto_trc20'
        ? purseAddress.trim()
        : `${bankName.trim()} • ${accountNumber.trim()}`;

    try {
      const isPersonalAcc = isPersonalLiveAccount(account);
      const accountTypeCol: 'self' | 'funded' = isPersonalAcc ? 'self' : 'funded';
      const payoutMethodCol: 'crypto' | 'bank' = paymentMethod === 'bank_transfer' ? 'bank' : 'crypto';
      const feeVal = breakdown.withdrawalFeeAmount;
      const netVal = breakdown.netPayoutToReceive;
      const grossVal = breakdown.requestedAmount;
      const nowMs = Date.now();
      const countdownEndsAtMs = nowMs + 60 * 60 * 1000;
      const countdownEndsAtIso = new Date(countdownEndsAtMs).toISOString();

      // 1. Insert into Supabase `withdrawals` table using the exact column schema
      const supaInsertRes = await insertSupabaseWithdrawal({
        userId: userProfile?.id || account.ownerId,
        userEmail: userProfile?.email,
        accountType: accountTypeCol,
        amount: grossVal,
        fee: feeVal,
        netAmount: netVal,
        status: 'pending',
        countdownEndsAtIso,
        nowMs,
        payoutMethod: payoutMethodCol,
        walletAddress: payoutMethodCol === 'crypto' ? purseAddress.trim() : null,
        networkType: payoutMethodCol === 'crypto' ? network : null,
        bankName: payoutMethodCol === 'bank' ? bankName.trim() : null,
        accountHolderName: payoutMethodCol === 'bank' ? accountHolder.trim() : null,
        bankAccountNumber: payoutMethodCol === 'bank' ? accountNumber.trim() : null,
        branchName: payoutMethodCol === 'bank' ? swiftCode.trim() : null,
      });

      if (!supaInsertRes.ok) {
        console.error('Supabase withdrawal insert failed:', supaInsertRes.error, supaInsertRes);
        setError(`Failed to save withdrawal request: ${supaInsertRes.error || 'Unknown database error'}`);
        soundEngine.playErrorAlert();
        return;
      }

      // 2. Non-blocking sync to local backend API (never block valid Supabase withdrawal if local SQLite balance differs)
      try {
        await apiSubmitWithdrawal({
          accountId: account.id,
          amount,
          walletAddress: walletAddr,
          network: paymentMethod === 'crypto_trc20' ? network : 'SWIFT/SEPA',
          paymentMethod,
        });
      } catch {
        // Non-blocking fallback
      }

      // Keep status: 'pending' until admin marks it as 'completed' in Supabase.
      const insertedRowId = supaInsertRes.row?.id ? String(supaInsertRes.row.id) : null;
      const reqId = insertedRowId || `WD-${Math.floor(1000000 + Math.random() * 8999999)}`;
      const refNum =
        paymentMethod === 'crypto_trc20'
          ? `0x${Math.random().toString(16).substring(2, 14)}${Math.random().toString(16).substring(2, 14)}`
          : `SWIFT-BFT-${Math.floor(100000 + Math.random() * 900000)}`;

      const newRequest: WithdrawalRequest = {
        id: reqId,
        userId: supaInsertRes.row?.user_id ? String(supaInsertRes.row.user_id) : userProfile?.id,
        accountId: account.id,
        accountType: accountTypeCol,
        amount: grossVal,
        withdrawalFee: feeVal,
        netReceivedAmount: netVal,
        profitSplitApplied: breakdown.profitSplitPercent,
        paymentMethod,
        payoutMethod: payoutMethodCol,
        networkType: payoutMethodCol === 'crypto' ? network : undefined,
        trc20Address: walletAddr,
        bankDetails:
          paymentMethod === 'bank_transfer'
            ? {
                bankName: bankName.trim(),
                accountHolder: accountHolder.trim(),
                accountNumber: accountNumber.trim(),
                swiftCode: swiftCode.trim(),
                branchName: swiftCode.trim(),
              }
            : undefined,
        referenceNumber: refNum,
        requestedAt: nowMs,
        countdownEndsAt: countdownEndsAtMs,
        status: 'pending',
        isDoublePayoutEligible: false,
        timeElapsedSeconds: 0,
      };

      // 3. Immediately deduct requested amount from active account balance in local UI and database
      if (userProfile) {
        const deductionRes = computeWithdrawalDeduction({
          account,
          userProfile,
          amount: grossVal,
          nowMs,
        });

        onUpdateAccount(deductionRes.updatedAccount);
        if (onUpdateProfile) {
          onUpdateProfile(deductionRes.updatedProfile);
        }

        commitProfileBalanceToSupabase({
          userId: userProfile?.id || account.ownerId,
          userEmail: userProfile?.email,
          column: deductionRes.column,
          newBalance: deductionRes.newBalance,
        }).catch((e: any) => console.warn('Supabase profile balance deduction error:', e));
      } else {
        const newBal = Math.max(0, Number((account.currentBalance - grossVal).toFixed(2)));
        onUpdateAccount({
          ...account,
          currentBalance: newBal,
          equity: newBal,
        });
      }

      onAddWithdrawal(newRequest);
      soundEngine.playWithdrawalSuccess();
      setSuccessBanner(
        `Withdrawal Request Submitted! Status: Pending Approval. $${grossVal.toFixed(2)} USD deducted from your balance. Your payout of $${netVal.toFixed(2)} USD is recorded with a 1-hour settlement timer.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to submit withdrawal request.');
      soundEngine.playErrorAlert();
    }
  };

  const handleConfirmWithdrawalWith2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = withdrawalTotpCode.replace(/\D/g, '').trim();
    if (cleanCode.length !== 6) {
      setTotpError('Please enter the full 6-digit code from Google Authenticator.');
      soundEngine.playErrorAlert();
      return;
    }

    setIsVerifyingTotp(true);
    setTotpError(null);

    try {
      const data = await apiValidate2fa({
        userId: userProfile?.id || account?.ownerId,
        email: userProfile?.email,
        code: cleanCode,
        secret: (userProfile as any)?.totp_secret || (userProfile as any)?.totpSecret,
      });

      if (!data.isValid) {
        setTotpError(data.error || 'Invalid 6-digit verification code. Please check your Google Authenticator app and try again.');
        soundEngine.playErrorAlert();
        setIsVerifyingTotp(false);
        return;
      }

      setShowTwoFactorModal(false);
      setIsVerifyingTotp(false);
      await proceedWithdrawalSubmission();
    } catch (err: any) {
      setTotpError(err?.message || '2FA verification failed. Please try again.');
      setIsVerifyingTotp(false);
    }
  };

  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessBanner(null);

    // Mandatory 2FA Check: Completely block if 2FA is not enabled
    if (!is2faActive) {
      setError(
        'Two-Factor Authentication (2FA) is mandatory for withdrawals. Please enable Google Authenticator in your Security & 2FA settings before requesting a payout.'
      );
      soundEngine.playErrorAlert();
      return;
    }

    if (!kycCheck.allowed) {
      setError(KYC_WITHDRAWAL_LOCK_MESSAGE);
      soundEngine.playErrorAlert();
      return;
    }

    if (!account) {
      setError('No Active Account available for withdrawal. Please purchase or select an active account.');
      soundEngine.playErrorAlert();
      return;
    }

    // Single Active Withdrawal Constraint Guard (Per User / Account Type)
    if (hasActivePending) {
      setError(PENDING_WITHDRAWAL_WARNING_MESSAGE);
      soundEngine.playErrorAlert();
      return;
    }

    const validation = validateWithdrawalRequest(account, amount, { enforceFirstWithdrawalLock: true });
    if (!validation.valid) {
      setError(validation.reason || 'Withdrawal validation failed.');
      soundEngine.playErrorAlert();
      return;
    }

    // Enforce strict 80% Net Generated Profit Payout Ceiling Rule ONLY for Prop Funded accounts
    if (!isPersonalLiveAccount(account)) {
      const maxAllowedProfitCeiling = Math.max(0, Number((netProfit * 0.80).toFixed(2)));
      if (amount > maxAllowedProfitCeiling) {
        setError(
          `Withdrawal exceeds the 80% profit payout ceiling. Maximum allowable withdrawal is $${maxAllowedProfitCeiling.toFixed(2)} (80% of $${netProfit.toFixed(2)} net generated profit).`
        );
        soundEngine.playErrorAlert();
        return;
      }
    }

    if (paymentMethod === 'crypto_trc20') {
      const purseValidation = validateQuotexPurseAddress(purseAddress, network, quotexMethod);
      if (!purseValidation.valid) {
        setError(purseValidation.reason || 'Invalid purse address.');
        soundEngine.playErrorAlert();
        return;
      }
    } else {
      if (!bankName.trim() || !accountHolder.trim() || accountNumber.trim().length < 6 || swiftCode.trim().length < 6) {
        setError('Please complete all required Bank Transfer fields.');
        soundEngine.playErrorAlert();
        return;
      }
    }

    // All validation passed: Prompt user for 6-digit Google Authenticator code
    setShowTwoFactorModal(true);
    setWithdrawalTotpCode('');
    setTotpError(null);
    soundEngine.triggerWithdrawalHaptic();
    soundEngine.playUiClick();
  };

  const portalNavTabs: { id: QuotexPortalTab; label: string }[] = [
    { id: 'withdrawal', label: 'Withdrawal' },
    { id: 'payments', label: 'Payments' },
    { id: 'trades', label: 'Trades' },
    { id: 'account', label: 'My account' },
    { id: 'market', label: 'Market' },
    { id: 'tournaments', label: 'Tournaments' },
    { id: 'analytics', label: 'Analytics' },
  ];

  const portalContent = (
    <div
      data-testid="withdrawal-dashboard"
      className="w-full min-h-[720px] bg-[#0a0a0a] text-[#e2e8f0] font-sans rounded-xl border border-[#1e2330] overflow-hidden flex flex-col justify-between pb-16 md:pb-0"
    >
      <div>
        {/* =====================================================================
            1. TOP NAVIGATION HEADER (Desktop & Mobile Quotex Sub-Header Bar)
            ===================================================================== */}
        <div className="bg-[#12151e] border-b border-[#1e2330] px-3 sm:px-6">
          {/* Mobile Compact Top Row: Live Balance Dropdown + Deposit Button */}
          <div className="flex md:hidden items-center justify-between py-2.5 border-b border-[#1e2330]">
            <div className="relative">
              <button
                type="button"
                data-testid="mobile-portal-balance-dropdown"
                onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#181c26] border border-[#262c3a] text-left cursor-pointer"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    account && isLiveFundedAccount(account) ? 'bg-[#00c853]' : 'bg-[#ff8800]'
                  }`}
                />
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#8c96a6] leading-none">
                    {account ? getAccountStatusBadgeLabel(account) : 'LIVE ACCOUNT'}
                  </div>
                  <div className="text-xs font-bold font-mono tabular-nums text-white leading-tight mt-0.5">
                    {accountSummary.inTheAccountFormatted}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#8c96a6]" />
              </button>

              {accountDropdownOpen && accounts.length > 0 && (
                <div className="absolute left-0 mt-2 w-64 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-[#ff8800]/40 shadow-[0_16px_36px_rgba(0,0,0,0.85),0_0_16px_rgba(255,136,0,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150">
                  {accounts.map((acc) => {
                    const isAccActive = account?.id === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiClick();
                          onSelectAccount?.(acc.id);
                          setAccountDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs transition-all cursor-pointer bft-touch-scale ${
                          isAccActive
                            ? 'bg-gradient-to-r from-[#ff8800]/20 via-[#ff8800]/10 to-transparent border border-[#ff8800]/50 text-white shadow-sm'
                            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white border border-transparent'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-white font-mono flex items-center gap-1.5">
                            <span>{acc.id}</span>
                            {isAccActive && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40 font-black">
                                ✓ Active
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#8c96a6]">{acc.tierName}</div>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-[#00e676]">
                          ${acc.currentBalance.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="mobile-portal-deposit-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  if (onOpenDepositModal) onOpenDepositModal();
                  else if (onOpenChallengeModal) onOpenChallengeModal();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#00b853] hover:bg-[#00c853] text-white font-bold text-xs cursor-pointer transition-colors bft-touch-scale"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Deposit</span>
              </button>

              {!inlineMode && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Portal"
                  className="p-1.5 rounded-lg bg-[#181c26] border border-[#262c3a] text-[#8c96a6] hover:text-white cursor-pointer bft-touch-scale"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Standard Quotex Sub-Navigation Bar (Desktop Tab Strip vs Modern BFT Dark Glassmorphism Mobile Dropdown) */}
          <div className="flex items-center justify-between gap-4">
            {/* Desktop Tabs (>= 768px) */}
            <nav
              aria-label="Quotex Account Navigation"
              className="hidden md:flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-2 md:py-0"
            >
              {portalNavTabs.map((tab) => {
                const isActive = activePortalTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`quotex-tab-${tab.id}`}
                    onClick={() => handlePortalTabClick(tab.id)}
                    className={`px-3 sm:px-4 py-2.5 md:py-4 text-xs sm:text-[13px] font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                      isActive
                        ? 'border-[#2b70ff] text-white bg-[#181c26]/60'
                        : 'border-transparent text-[#8c96a6] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {/* Mobile Modern Dark Glassmorphism Dropdown Menu (< 768px) */}
            <div className="md:hidden py-2 w-full relative">
              <label htmlFor="mobile-portal-tab-select" className="sr-only">
                Select Portal Section
              </label>
              {/* Synchronized sr-only native select for accessibility & automated form selectors */}
              <select
                id="mobile-portal-tab-select"
                data-testid="mobile-portal-tab-select"
                value={activePortalTab}
                onChange={(e) => {
                  setMobilePortalDropdownOpen(false);
                  handlePortalTabClick(e.target.value as QuotexPortalTab);
                }}
                className="sr-only"
              >
                {portalNavTabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label} {activePortalTab === tab.id ? '✓ (Active)' : ''}
                  </option>
                ))}
              </select>

              {/* Custom BFT Dark Theme Dropdown Trigger Button */}
              <button
                type="button"
                data-testid="mobile-portal-dropdown-trigger"
                aria-expanded={mobilePortalDropdownOpen}
                onClick={() => {
                  soundEngine.playUiClick();
                  setMobilePortalDropdownOpen((prev) => !prev);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/95 backdrop-blur-md border transition-all duration-200 flex items-center justify-between cursor-pointer bft-touch-scale ${
                  mobilePortalDropdownOpen
                    ? 'border-[#ff8800] shadow-[0_0_20px_rgba(255,136,0,0.2)]'
                    : 'border-[#ff8800]/40 hover:border-[#ff8800]/70 shadow-[0_4px_16px_rgba(0,0,0,0.6)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800] shrink-0">
                    {activePortalTab === 'withdrawal' && <CreditCard className="w-3.5 h-3.5" />}
                    {activePortalTab === 'payments' && <History className="w-3.5 h-3.5" />}
                    {activePortalTab === 'trades' && <LineChart className="w-3.5 h-3.5" />}
                    {activePortalTab === 'account' && <User className="w-3.5 h-3.5" />}
                    {activePortalTab === 'market' && <Store className="w-3.5 h-3.5" />}
                    {activePortalTab === 'tournaments' && <Trophy className="w-3.5 h-3.5" />}
                    {activePortalTab === 'analytics' && <BarChart3 className="w-3.5 h-3.5" />}
                  </span>
                  <span className="font-mono text-xs font-black text-white tracking-wide truncate">
                    {portalNavTabs.find((t) => t.id === activePortalTab)?.label || 'Withdrawal'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#00e676]/15 border border-[#00e676]/40 text-[#00e676] font-mono text-[9.5px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(0,230,118,0.15)]">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                    <span>Active</span>
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-[#ff8800] transition-transform duration-200 shrink-0 ${
                    mobilePortalDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Smooth Open/Close Animated Glassmorphism Dropdown Menu */}
              <div
                data-testid="mobile-portal-dropdown-menu"
                className={`bft-accordion-grid transition-all duration-200 ${
                  mobilePortalDropdownOpen
                    ? 'bft-accordion-open opacity-100 scale-100 translate-y-0 mt-2'
                    : 'bft-accordion-closed opacity-0 scale-95 -translate-y-1 pointer-events-none'
                }`}
              >
                <div className="bft-accordion-inner">
                  <div className="rounded-xl bg-zinc-900/95 backdrop-blur-md border border-[#ff8800]/45 shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_24px_rgba(255,136,0,0.14)] p-1.5 space-y-1 z-50">
                    {portalNavTabs.map((tab) => {
                      const isTabActive = activePortalTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          data-testid={`mobile-portal-option-${tab.id}`}
                          onClick={() => {
                            setMobilePortalDropdownOpen(false);
                            handlePortalTabClick(tab.id);
                          }}
                          className={`w-full px-3 py-2.5 rounded-lg flex items-center justify-between font-mono text-xs transition-all duration-150 cursor-pointer bft-touch-scale ${
                            isTabActive
                              ? 'bg-gradient-to-r from-[#ff8800]/25 via-[#ff8800]/10 to-transparent border border-[#ff8800]/60 text-white font-black shadow-[0_0_14px_rgba(255,136,0,0.18)]'
                              : 'text-slate-300 hover:text-white hover:bg-white/[0.06] border border-transparent font-semibold'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                                isTabActive
                                  ? 'bg-[#ff8800] text-slate-950 shadow-sm'
                                  : 'bg-white/5 text-slate-400 border border-white/10'
                              }`}
                            >
                              {tab.id === 'withdrawal' && <CreditCard className="w-3.5 h-3.5" />}
                              {tab.id === 'payments' && <History className="w-3.5 h-3.5" />}
                              {tab.id === 'trades' && <LineChart className="w-3.5 h-3.5" />}
                              {tab.id === 'account' && <User className="w-3.5 h-3.5" />}
                              {tab.id === 'market' && <Store className="w-3.5 h-3.5" />}
                              {tab.id === 'tournaments' && <Trophy className="w-3.5 h-3.5" />}
                              {tab.id === 'analytics' && <BarChart3 className="w-3.5 h-3.5" />}
                            </span>
                            <span className="truncate">{tab.label}</span>
                          </div>

                          {isTabActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#00e676]/15 border border-[#00e676]/45 text-[#00e676] text-[10px] font-black tracking-wide shrink-0 shadow-[0_0_10px_rgba(0,230,118,0.2)]">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>✓ (Active)</span>
                            </span>
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Right Account Balance Indicator + Deposit + Withdrawal Buttons */}
            <div className="hidden md:flex items-center gap-2.5 py-2 shrink-0">
              {/* Account Balance Switcher */}
              <div className="relative">
                <button
                  type="button"
                  data-testid="desktop-portal-balance-dropdown"
                  onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#181c26] border border-[#262c3a] hover:border-[#363f54] transition-colors cursor-pointer"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      account && isLiveFundedAccount(account) ? 'bg-[#00c853]' : 'bg-[#ff8800]'
                    }`}
                  />
                  <div className="text-left">
                    <div
                      data-testid={account ? 'withdrawal-account-badge' : 'withdrawal-no-account-badge'}
                      className="text-[10px] font-bold uppercase tracking-wider text-[#8c96a6] leading-none"
                    >
                      {account ? `${account.id} • ${getAccountStatusBadgeLabel(account)}` : 'LIVE ACCOUNT'}
                    </div>
                    <div className="text-xs font-bold font-mono tabular-nums text-white mt-0.5">
                      {accountSummary.inTheAccountFormatted}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#8c96a6]" />
                </button>

                {accountDropdownOpen && accounts.length > 0 && (
                  <div className="absolute right-0 mt-1.5 w-64 rounded-lg bg-[#161922] border border-[#262c3a] p-1.5 z-50">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#8c96a6] px-2 py-1">
                      Switch Account
                    </div>
                    {accounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          onSelectAccount?.(acc.id);
                          setAccountDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded text-left text-xs cursor-pointer ${
                          account?.id === acc.id ? 'bg-[#212634] text-white' : 'text-[#94a3b8] hover:bg-[#1c202b]'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-white font-mono">{acc.id}</div>
                          <div className="text-[10px] text-[#8c96a6]">{acc.tierName}</div>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-[#00c853]">
                          ${acc.currentBalance.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Prominent Green Deposit Button */}
              <button
                type="button"
                data-testid="portal-deposit-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  if (onOpenDepositModal) onOpenDepositModal();
                  else if (onOpenChallengeModal) onOpenChallengeModal();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00b853] hover:bg-[#00c853] text-white font-bold text-xs cursor-pointer transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Deposit</span>
              </button>

              {/* Secondary Withdrawal Tab Button */}
              <button
                type="button"
                onClick={() => setActivePortalTab('withdrawal')}
                className="px-3.5 py-2 rounded-lg bg-[#1c202b] hover:bg-[#252a38] border border-[#282e3d] text-white font-semibold text-xs cursor-pointer transition-colors whitespace-nowrap"
              >
                Withdrawal
              </button>

              {!inlineMode && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Withdrawal Dashboard"
                  className="p-2 rounded-lg bg-[#181c26] border border-[#262c3a] text-[#8c96a6] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================================
            KYC COMPLIANCE NOTICE BANNER (Preserved for Unverified Traders)
            ===================================================================== */}
        {!kycCheck.allowed && (
          <div
            data-testid="kyc-withdrawal-lock-banner"
            className="mx-3 sm:mx-6 mt-4 p-3.5 sm:p-4 rounded-xl bg-[#141720] border border-[#ff8800]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center shrink-0 text-[#ff8800]">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#ff8800]">
                    KYC Verification Required
                  </span>
                  <span
                    data-testid="withdrawal-kyc-badge"
                    className="text-[10px] font-mono font-bold text-[#94a3b8]"
                  >
                    · Status: {userProfile?.kycStatus ? userProfile.kycStatus.toUpperCase() : 'UNVERIFIED'}
                  </span>
                </div>
                <p data-testid="kyc-withdrawal-lock-text" className="text-xs sm:text-sm font-bold text-white mt-0.5">
                  {KYC_WITHDRAWAL_LOCK_MESSAGE}
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
                className="px-3.5 py-2 rounded-lg bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-bold text-xs shrink-0 cursor-pointer transition-colors whitespace-nowrap"
              >
                Complete KYC Verification →
              </button>
            )}
          </div>
        )}

        {/* =====================================================================
            CHALLENGE PHASE WITHDRAWAL LOCK BANNER (One-Step / Two-Step Challenge)
            ===================================================================== */}
        {account && !isLiveFundedAccount(account) && (
          <div
            data-testid="challenge-phase-withdrawal-lock-banner"
            className="mx-3 sm:mx-6 mt-4 p-3.5 sm:p-4 rounded-xl bg-[#14100a] border border-[#ff8800] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center shrink-0 text-[#ff8800]">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#ff8800]">
                  Challenge Phase Account • Withdrawals Locked
                </div>
                <p className="text-xs sm:text-sm font-bold text-white mt-0.5">
                  Account <span className="font-mono text-[#ff8800]">{account.id}</span> is currently in the Evaluation Challenge phase ({account.tierName}). Withdrawals are strictly locked on Challenge accounts. Trade to hit your profit target to receive your Completion Certificate and unlock your Live Funded Account!
                </p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('terminal')}
                className="px-3.5 py-2 rounded-lg bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-bold text-xs shrink-0 cursor-pointer transition-colors whitespace-nowrap font-mono uppercase"
              >
                Trade to Pass Challenge →
              </button>
            )}
          </div>
        )}

        {/* =====================================================================
            VIEW 1: WITHDRAWAL INTERFACE (Desktop 2-Column Split / Mobile Stacked)
            ===================================================================== */}
        {activePortalTab === 'withdrawal' && (
          <div className="p-3 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN (7 Cols): Account Summary + Withdrawal Form + Security Badges */}
              <div className="lg:col-span-7 bg-[#141720] border border-[#1e2330] rounded-xl p-4 sm:p-6 space-y-6">
                {/* 3-Minute Double Payout Guarantee Banner */}
                <div
                  data-testid="withdrawal-guarantee-notice"
                  className="p-3.5 sm:p-4 rounded-xl bg-[#0e1017] border border-[#00c853]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#00c853]/15 border border-[#00c853]/40 flex items-center justify-center shrink-0 text-[#00c853]">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00c853]">
                        Contractual 3-Minute Payout Guarantee
                      </div>
                      <p className="text-xs sm:text-sm font-black text-white mt-0.5">
                        "{WITHDRAWAL_GUARANTEE_NOTICE}"
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-[#00c853]/15 border border-[#00c853]/40 text-[#00c853] text-[10px] font-mono font-bold uppercase shrink-0 self-start sm:self-center">
                    2X SLA Active
                  </span>
                </div>

                {/* First Withdrawal 14-Day Mandatory Lock OR Personal Live Unrestricted Policy Banner */}
                {isPersonalLiveAccount(account) ? (
                  <div
                    data-testid="personal-live-withdrawal-banner"
                    className="p-3.5 sm:p-4 rounded-xl bg-[#0a0a0a] border border-[#ff8800] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 shrink-0 text-[#00c853]" />
                        <span className="text-xs font-bold text-white">
                          Personal Live Account (Self-Funded) • Unrestricted Capital & Profit Withdrawal
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded bg-[#ff8800] text-slate-950 border border-[#ff8800] uppercase">
                        100% Retention • No Prop Split Lock
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                      You are withdrawing from your <strong className="text-[#ff8800]">Personal Live Balance ({account?.id})</strong>. Personal Live accounts are not bound by challenge target phases, 14-day waiting periods, or prop profit split ceilings—withdraw both your <strong className="text-white">personal trading profits and deposited capital</strong> anytime following the <strong className="text-[#00c853]">$10.00 minimum threshold</strong> and <strong className="text-white">3% withdrawal fee</strong>.
                    </p>
                  </div>
                ) : (
                  <div
                    data-testid="first-withdrawal-14day-banner"
                    className={`p-3.5 sm:p-4 rounded-xl bg-[#0e1017] border ${
                      firstWithdrawalCheck.eligible ? 'border-[#1e2330]' : 'border-[#ff8800]/60'
                    } space-y-2`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Lock
                          className={`w-4 h-4 shrink-0 ${
                            firstWithdrawalCheck.eligible ? 'text-[#00c853]' : 'text-[#ff8800]'
                          }`}
                        />
                        <span className="text-xs font-bold text-white">
                          First Withdrawal Rule: Mandatory {FIRST_WITHDRAWAL_WAITING_DAYS}-Day Waiting Period
                        </span>
                      </div>
                      <span
                        data-testid="first-withdrawal-status-badge"
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                          firstWithdrawalCheck.eligible
                            ? 'bg-[#00c853]/15 text-[#00c853] border-[#00c853]/40'
                            : 'bg-[#ff8800]/15 text-[#ff8800] border-[#ff8800]/40'
                        }`}
                      >
                        {firstWithdrawalCheck.eligible
                          ? `14-Day Lock Satisfied (${firstWithdrawalCheck.daysElapsed}/${FIRST_WITHDRAWAL_WAITING_DAYS}d)`
                          : `${firstWithdrawalCheck.daysRemaining} Days Remaining (${firstWithdrawalCheck.daysElapsed}/${FIRST_WITHDRAWAL_WAITING_DAYS}d)`}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                      A mandatory <strong className="text-white">14-day waiting period</strong> applies for the very first withdrawal across all account types. After your first withdrawal is completed, users who purchased the{' '}
                      <strong className="text-[#00c853]">Daily Withdrawal Add-On (+15%)</strong> or{' '}
                      <strong className="text-white">Weekly Plan</strong> can proceed according to their package rules (Current Account Schedule:{' '}
                      <strong className="text-[#2b70ff] font-mono">{firstWithdrawalCheck.subsequentCycleLabel}</strong>).
                    </p>
                  </div>
                )}

                {/* Account Balance Summary Rows (Exact Quotex Layout) */}
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white mb-3">Account:</h2>
                  <div className="bg-[#0e1017] border border-[#1e2330] rounded-lg divide-y divide-[#1e2330]">
                    <div
                      data-testid="card-in-the-account"
                      className="flex items-center justify-between px-4 py-3 text-xs sm:text-sm"
                    >
                      <span className="text-[#8c96a6]">In the account:</span>
                      <span className="font-bold font-mono tabular-nums text-white">
                        {accountSummary.inTheAccountFormatted}
                      </span>
                    </div>
                    <div
                      data-testid="card-available-balance"
                      className="flex items-center justify-between px-4 py-3 text-xs sm:text-sm"
                    >
                      <span className="text-[#8c96a6]">
                        {isPersonalLiveAccount(account)
                          ? 'Available for withdrawal (Capital + Profit):'
                          : 'Available for withdrawal (Net Profit):'}
                      </span>
                      <span className="font-bold font-mono tabular-nums text-white">
                        {accountSummary.availableForWithdrawalFormatted}
                      </span>
                    </div>
                    <div
                      data-testid="card-profit-ceiling-80"
                      className="flex items-center justify-between px-4 py-3 text-xs sm:text-sm bg-[#121622]/60"
                    >
                      <span className="text-[#8c96a6] flex items-center gap-1.5">
                        <span>{isPersonalLiveAccount(account) ? 'Personal Live Retention:' : '80% Profit Ceiling:'}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/30 font-bold">
                          {isPersonalLiveAccount(account) ? '100% Capital + Profit' : 'Max 80%'}
                        </span>
                      </span>
                      <span className="font-bold font-mono tabular-nums text-[#ff8800]">
                        $
                        {(isPersonalLiveAccount(account)
                          ? accountSummary.availableForWithdrawal
                          : Math.max(0, Number((netProfit * 0.8).toFixed(2)))
                        ).toFixed(2)}{' '}
                        USD
                      </span>
                    </div>
                    <div
                      data-testid="card-withdrawal-commission"
                      className="flex items-center justify-between px-4 py-3 text-xs sm:text-sm"
                    >
                      <span className="text-[#8c96a6]">Withdrawal Fee (Deducted):</span>
                      <span className="font-bold font-mono tabular-nums text-[#ff8800]">
                        {breakdown.withdrawalFeePercent}% (-${breakdown.withdrawalFeeAmount.toFixed(2)})
                      </span>
                    </div>
                    <div
                      data-testid="card-net-payout-receive"
                      className="flex items-center justify-between px-4 py-3 text-xs sm:text-sm bg-[#121622]"
                    >
                      <span className="text-[#cbd5e1] font-semibold">Net Payout to Receive (After {breakdown.withdrawalFeePercent}% Fee):</span>
                      <span className="font-black font-mono tabular-nums text-[#00c853]">
                        {breakdown.netPayoutToReceive.toFixed(2)} $
                      </span>
                    </div>
                  </div>
                </div>

                {/* Withdrawal Form */}
                <form onSubmit={handleRequestWithdrawal} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm sm:text-base font-bold text-white">Withdrawal:</h3>
                    <span
                      data-testid="min-withdrawal-250-badge"
                      className="text-[11px] font-mono font-bold text-[#cbd5e1] bg-[#0e1017] px-2.5 py-1 rounded border border-[#262c3a]"
                    >
                      Minimum Withdrawal: <strong className="text-[#00c853]">${isPersonalLiveAccount(account) ? '10.00' : '250.00'}</strong> • Fee:{' '}
                      <strong className="text-[#ff8800]">{breakdown.withdrawalFeePercent}%</strong>
                    </span>
                  </div>

                  {/* Feedback Banners */}
                  {error && (
                    <div
                      data-testid="withdrawal-error-banner"
                      className="p-3 rounded-lg bg-rose-950/80 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {successBanner && (
                    <div
                      data-testid="withdrawal-success-banner"
                      className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-xs text-emerald-200 flex items-start justify-between gap-2"
                    >
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#00c853] shrink-0 mt-0.5" />
                        <span>{successBanner}</span>
                      </div>
                      <button
                        type="button"
                        aria-label="Dismiss banner"
                        onClick={() => setSuccessBanner(null)}
                        className="text-emerald-400 hover:text-white cursor-pointer p-0.5 shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Amount (USD) */}
                    <div>
                      <label
                        htmlFor="withdrawal-amount-input"
                        className="block text-xs text-[#8c96a6] mb-1.5 font-medium"
                      >
                        Amount (USD) — Min $250
                      </label>
                      <div className="relative">
                        <input
                          id="withdrawal-amount-input"
                          data-testid="withdrawal-amount-input"
                          type="number"
                          min={0}
                          step="1"
                          value={amount}
                          onChange={(e) => {
                            setAmount(Math.max(0, Number(e.target.value)));
                            if (!hasActivePending) setSuccessBanner(null);
                          }}
                          className="w-full px-3.5 py-2.5 bg-[#0e1017] border border-[#262c3a] focus:border-[#2b70ff] rounded-lg text-sm font-mono tabular-nums font-bold text-white focus:outline-none transition-colors"
                        />
                        <span className="absolute right-3.5 top-2.5 text-xs font-mono text-[#8c96a6]">USD</span>
                      </div>
                    </div>

                    {/* Payment Method Dropdown */}
                    <div>
                      <label
                        htmlFor="quotex-payment-method-select"
                        className="block text-xs text-[#8c96a6] mb-1.5 font-medium"
                      >
                        Payment method
                      </label>
                      <div className="relative">
                        <select
                          id="quotex-payment-method-select"
                          data-testid="quotex-payment-method-select"
                          value={quotexMethod}
                          onChange={(e) => handleChangeQuotexMethod(e.target.value as QuotexPaymentMethodOption)}
                          className="w-full px-3.5 py-2.5 bg-[#0e1017] border border-[#262c3a] focus:border-[#2b70ff] rounded-lg text-sm font-semibold text-white focus:outline-none transition-colors cursor-pointer"
                        >
                          <option value="USDT">USDT</option>
                          <option value="Binance Pay">Binance Pay</option>
                          <option value="Bitcoin (BTC)">Bitcoin (BTC)</option>
                          <option value="Ethereum (ETH)">Ethereum (ETH)</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {paymentMethod === 'crypto_trc20' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Wallet Purse Address Input */}
                      <div>
                        <label
                          htmlFor="trc20-wallet-input"
                          className="block text-xs text-[#8c96a6] mb-1.5 font-medium"
                        >
                          Purse
                        </label>
                        <input
                          id="trc20-wallet-input"
                          data-testid="trc20-wallet-input"
                          type="text"
                          value={purseAddress}
                          onChange={(e) => setPurseAddress(e.target.value)}
                          placeholder="Enter wallet purse address..."
                          className="w-full px-3.5 py-2.5 bg-[#0e1017] border border-[#262c3a] focus:border-[#2b70ff] rounded-lg text-xs sm:text-sm font-mono text-white focus:outline-none transition-colors"
                        />
                      </div>

                      {/* Network Selector Dropdown */}
                      <div>
                        <label
                          htmlFor="quotex-network-select"
                          className="block text-xs text-[#8c96a6] mb-1.5 font-medium"
                        >
                          Network
                        </label>
                        <select
                          id="quotex-network-select"
                          data-testid="quotex-network-select"
                          value={network}
                          onChange={(e) => handleChangeNetwork(e.target.value as QuotexCryptoNetwork)}
                          className="w-full px-3.5 py-2.5 bg-[#0e1017] border border-[#262c3a] focus:border-[#2b70ff] rounded-lg text-sm font-semibold text-white focus:outline-none transition-colors cursor-pointer"
                        >
                          <option value="BSC (BEP20)">BSC (BEP20)</option>
                          <option value="TRON (TRC-20)">TRON (TRC-20)</option>
                          <option value="Ethereum (ERC-20)">Ethereum (ERC-20)</option>
                          <option value="Polygon (MATIC)">Polygon (MATIC)</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[#8c96a6] mb-1">Bank Name</label>
                        <input
                          name="bank_name"
                          data-testid="bank-name-input"
                          type="text"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0e1017] border border-[#262c3a] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#8c96a6] mb-1">Account Holder Name</label>
                        <input
                          name="account_holder_name"
                          data-testid="bank-holder-input"
                          type="text"
                          value={accountHolder}
                          onChange={(e) => setAccountHolder(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0e1017] border border-[#262c3a] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#8c96a6] mb-1">Bank Account Number / IBAN</label>
                        <input
                          name="bank_account_number"
                          data-testid="bank-iban-input"
                          type="text"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0e1017] border border-[#262c3a] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#8c96a6] mb-1">Branch Name / SWIFT Code</label>
                        <input
                          name="branch_name"
                          data-testid="bank-swift-input"
                          type="text"
                          value={swiftCode}
                          onChange={(e) => setSwiftCode(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0e1017] border border-[#262c3a] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Live 10% Withdrawal Fee & Net Payout Summary Box */}
                  <div
                    data-testid="withdrawal-fee-breakdown"
                    className="p-3 rounded-lg bg-[#0e1017] border border-[#1e2330] grid grid-cols-3 gap-2 text-xs font-mono tabular-nums"
                  >
                    <div>
                      <span className="block text-[10px] text-[#8c96a6]">Requested Gross</span>
                      <strong className="text-white">${breakdown.requestedAmount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#8c96a6]">10% Withdrawal Fee</span>
                      <strong className="text-rose-400">-${breakdown.withdrawalFeeAmount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#8c96a6]">Net Payout Dispatched</span>
                      <strong className="text-[#00c853]">${breakdown.netPayoutToReceive.toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Single Active Withdrawal Warning Banner (per account type) */}
                  {hasActivePending && (
                    <div
                      data-testid="active-pending-withdrawal-warning"
                      className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/50 space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400">
                            Single Active Withdrawal Constraint
                          </div>
                          <p
                            data-testid="pending-withdrawal-warning-text"
                            className="text-xs sm:text-sm font-bold text-white mt-0.5"
                          >
                            {PENDING_WITHDRAWAL_WARNING_MESSAGE}
                          </p>
                        </div>
                      </div>

                      {activePendingRequest && (
                        <div className="bg-[#0e1017] p-3 rounded-lg border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white">
                                #{String(activePendingRequest.id).slice(0, 8)}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 uppercase">
                                {activePendingRequest.status}
                              </span>
                              <span className="text-[10px] text-slate-400 uppercase font-mono">
                                {activePendingRequest.accountType === 'self'
                                  ? 'Personal Live (Self)'
                                  : 'Prop Funded'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                              <span>
                                Amount: <strong className="text-white">${activePendingRequest.amount.toFixed(2)}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Net Payout: <strong className="text-emerald-400">${(activePendingRequest.netReceivedAmount ?? (activePendingRequest.amount - (activePendingRequest.withdrawalFee ?? 0))).toFixed(2)}</strong>
                              </span>
                              {activePendingRequest.countdownEndsAt && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-300 font-mono flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatCountdownRemaining(activePendingRequest.countdownEndsAt)} remaining
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {activePendingRequest.status === 'pending' && (
                            <button
                              type="button"
                              data-testid="cancel-pending-withdrawal-banner-btn"
                              disabled={cancellingId === activePendingRequest.id}
                              onClick={() => handleCancelWithdrawalRequest(activePendingRequest.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-300 text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>
                                {cancellingId === activePendingRequest.id
                                  ? 'Cancelling...'
                                  : 'Cancel Request & Refund'}
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mandatory 2FA Notice Banner */}
                  {!is2faActive && (
                    <div
                      data-testid="withdrawal-2fa-warning-card"
                      className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-start gap-3"
                    >
                      <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs">
                        <strong className="block text-white font-bold mb-0.5 font-mono uppercase tracking-wider text-amber-400">
                          Two-Factor Authentication (2FA) Required
                        </strong>
                        <p className="text-amber-200/90 mb-2.5 font-mono text-xs">
                          For institutional security, Google Authenticator 2FA is mandatory before requesting any payout. Please enable 2FA in your Security settings.
                        </p>
                        <button
                          type="button"
                          data-testid="withdrawal-goto-security-btn"
                          onClick={() => {
                            if (onNavigateTab) {
                              onClose();
                              onNavigateTab('security');
                            } else {
                              onClose();
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs uppercase cursor-pointer transition-colors font-mono inline-flex items-center gap-1.5 shadow"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Enable 2FA in Security & 2FA Settings →</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Submission Button (Disabled when a pending request exists or 2FA is disabled) */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      data-testid="submit-withdrawal-btn"
                      disabled={hasActivePending || !is2faActive}
                      title={
                        !is2faActive
                          ? 'Google Authenticator 2FA is required before submitting a withdrawal'
                          : hasActivePending
                          ? PENDING_WITHDRAWAL_WARNING_MESSAGE
                          : undefined
                      }
                      className={`w-full sm:w-auto min-w-[200px] px-7 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2.5 transition-colors ${
                        hasActivePending || !is2faActive
                          ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-60'
                          : 'bg-[#2b70ff] hover:bg-[#3b82f6] text-white cursor-pointer'
                      }`}
                    >
                      <span>
                        {!is2faActive
                          ? '2FA Setup Required'
                          : hasActivePending
                          ? 'Pending Withdrawal Active'
                          : 'Confirm Payout Request'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>

                {/* Footer Security Badges & Minimum Withdrawal Limit Notices */}
                <div className="pt-5 border-t border-[#1e2330] space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-[#8c96a6]">
                    <div>
                      <span className="block text-[#64748b]">Minimum withdrawal amount:</span>
                      <strong className="text-white font-mono tabular-nums">
                        ${isPersonalLiveAccount(account) ? '10.00' : '250.00'} USD
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[#64748b]">Withdrawal Fee:</span>
                      <strong className="text-[#ff8800] font-mono tabular-nums">
                        {isPersonalLiveAccount(account) ? '3%' : '10%'} Deducted
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[#64748b]">First Withdrawal Lock:</span>
                      <strong className="text-white font-mono">
                        {isPersonalLiveAccount(account) ? 'None (Instant Unlocked)' : '14 Days Mandatory'}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[#64748b]">Settlement SLA:</span>
                      <strong className="text-[#00c853] font-mono">
                        {isPersonalLiveAccount(account) ? '1 Hour (Pending Review)' : '3 Min (2x Guarantee)'}
                      </strong>
                    </div>
                  </div>

                  {/* Institutional Security Badges Row */}
                  <div
                    data-testid="withdrawal-security-badges"
                    className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-[#8c96a6]"
                  >
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0e1017] border border-[#1e2330]">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#2b70ff]" />
                      <span className="font-semibold text-[#cbd5e1]">Verified by VISA</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0e1017] border border-[#1e2330]">
                      <Lock className="w-3.5 h-3.5 text-[#00c853]" />
                      <span className="font-semibold text-[#cbd5e1]">Secure Payment</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0e1017] border border-[#1e2330]">
                      <CreditCard className="w-3.5 h-3.5 text-[#ff8800]" />
                      <span className="font-semibold text-[#cbd5e1]">MasterCard SecureCode</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0e1017] border border-[#1e2330]">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#00c853]" />
                      <span className="font-semibold text-[#cbd5e1]">3D Secure</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0e1017] border border-[#1e2330]">
                      <Lock className="w-3.5 h-3.5 text-[#38bdf8]" />
                      <span className="font-semibold text-[#cbd5e1]">256-Bit SSL Encryption</span>
                    </div>
                  </div>
                </div>

                {/* Collapsible "Some of your latest requests" Section */}
                <div className="pt-4 border-t border-[#1e2330]">
                  <button
                    type="button"
                    data-testid="toggle-latest-requests-btn"
                    onClick={() => setLatestRequestsExpanded(!latestRequestsExpanded)}
                    className="w-full flex items-center justify-between py-2 text-left cursor-pointer"
                  >
                    <span className="text-sm font-bold text-white">Some of your latest requests</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#8c96a6] transition-transform duration-200 ${
                        latestRequestsExpanded ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  </button>

                  {latestRequestsExpanded && (
                    <div data-testid="latest-requests-list" className="mt-3 space-y-2">
                      {allTransactions.filter((t) => t.type === 'Payout').length === 0 ? (
                        <div className="p-4 rounded-lg bg-[#0e1017] border border-[#1e2330] text-center text-xs text-[#8c96a6] font-mono">
                          No withdrawal requests submitted yet.
                        </div>
                      ) : (
                        allTransactions
                          .filter((t) => t.type === 'Payout')
                          .slice(0, 4)
                          .map((req) => {
                            const rawReq = withdrawals.find((w) => String(w.id) === String(req.id));
                            const isStrictlyPending =
                              (rawReq ? rawReq.status === 'pending' : req.rawStatus === 'pending') &&
                              req.status !== 'Succeeded' &&
                              req.status !== 'Canceled';
                            const isTerminal =
                              rawReq?.status === 'success' ||
                              rawReq?.status === 'completed' ||
                              rawReq?.status === 'rejected' ||
                              rawReq?.status === 'cancelled' ||
                              req.status === 'Succeeded' ||
                              req.status === 'Canceled';
                            return (
                              <div
                                key={req.id}
                                data-testid={`latest-withdrawal-item-${req.id}`}
                                className="p-3 rounded-lg bg-[#0e1017] border border-[#1e2330] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                              >
                                <div className="flex flex-wrap items-center gap-3">
                                  <div className="flex items-center gap-1.5 font-mono font-bold text-white">
                                    {req.status === 'Succeeded' ? (
                                      <CheckCircle2 className="w-4 h-4 text-[#00c853] shrink-0" />
                                    ) : req.status === 'Canceled' ? (
                                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    ) : (
                                      <Clock className="w-4 h-4 text-[#ff8800] shrink-0" />
                                    )}
                                    <span>#{req.orderNumber}</span>
                                  </div>
                                  <span className="text-[#8c96a6] font-mono tabular-nums">
                                    {req.dateFormatted} {req.timeFormatted}
                                  </span>
                                  <span className="text-[#cbd5e1] font-medium">
                                    {req.paymentSystem} ({req.network})
                                  </span>
                                  {isStrictlyPending && rawReq?.countdownEndsAt && (
                                    <span
                                      data-testid={`withdrawal-countdown-${req.id}`}
                                      className="px-2 py-0.5 rounded bg-[#ff8800]/15 border border-[#ff8800]/30 text-[#ff8800] font-mono text-[10px] font-bold"
                                    >
                                      SLA Timer: {formatCountdownRemaining(rawReq.countdownEndsAt)}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                  <span
                                    className={`font-semibold ${
                                      req.status === 'Succeeded'
                                        ? 'text-[#00c853]'
                                        : req.status === 'Canceled'
                                        ? 'text-rose-400'
                                        : 'text-[#ff8800]'
                                    }`}
                                  >
                                    {req.status}
                                  </span>
                                  <span className="font-mono tabular-nums font-bold text-rose-400">
                                    {req.signedAmountFormatted}
                                  </span>
                                  {isStrictlyPending && !isTerminal && (
                                    <button
                                      type="button"
                                      data-testid={`cancel-withdrawal-btn-${req.id}`}
                                      disabled={cancellingId === req.id}
                                      onClick={() => handleCancelWithdrawalRequest(req.id)}
                                      className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold cursor-pointer transition-colors"
                                    >
                                      {cancellingId === req.id ? 'Cancelling...' : 'Cancel'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                      )}

                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setActivePortalTab('payments')}
                          className="text-xs font-semibold text-[#2b70ff] hover:text-[#3b82f6] flex items-center gap-1 cursor-pointer"
                        >
                          <span>View all payment transactions</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN (5 Cols): Collapsible FAQ Section */}
              <div className="lg:col-span-5 bg-[#141720] border border-[#1e2330] rounded-xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base sm:text-lg font-bold text-white">FAQ:</h2>
                </div>

                <div data-testid="withdrawal-faq-list" className="divide-y divide-[#1e2330]">
                  {QUOTEX_WITHDRAWAL_FAQS.map((faq) => {
                    const isOpen = Boolean(expandedFaqIds[faq.id]);
                    return (
                      <div key={faq.id} className="py-3 first:pt-0">
                        <button
                          type="button"
                          data-testid={`withdrawal-faq-btn-${faq.id}`}
                          aria-expanded={isOpen}
                          onClick={() => toggleFaq(faq.id)}
                          className="w-full flex items-start justify-between gap-3 text-left cursor-pointer group"
                        >
                          <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#2b70ff] transition-colors">
                            {faq.question}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-[#8c96a6] shrink-0 mt-0.5 transition-transform duration-200 ${
                              isOpen ? 'rotate-180 text-[#2b70ff]' : ''
                            }`}
                          />
                        </button>

                        {isOpen && (
                          <p className="mt-2 text-xs text-[#94a3b8] leading-relaxed">{faq.answer}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-[#1e2330] flex justify-end">
                  <button
                    type="button"
                    data-testid="quotex-full-faq-link"
                    onClick={() => {
                      soundEngine.playUiClick();
                      if (onNavigateTab) {
                        onNavigateTab('faq');
                      } else {
                        const allOpen: Record<string, boolean> = {};
                        QUOTEX_WITHDRAWAL_FAQS.forEach((f) => {
                          allOpen[f.id] = true;
                        });
                        setExpandedFaqIds(allOpen);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2b70ff] hover:text-[#3b82f6] transition-colors cursor-pointer"
                  >
                    <span>Check out full FAQ</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 2: PAYMENTS & TRANSACTION HISTORY TABLE VIEW (Full Page & Mobile Feed)
            ===================================================================== */}
        {activePortalTab === 'payments' && (
          <div data-testid="payments-history-view" className="p-3 sm:p-6 space-y-4">
            {/* Top Bar: Filter Controls + Pagination ("1/2 Next") */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#141720] border border-[#1e2330] rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5">
                {(['ALL', 'Payout', 'Deposit'] as const).map((filterOpt) => (
                  <button
                    key={filterOpt}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setTypeFilter(filterOpt);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      typeFilter === filterOpt
                        ? 'bg-[#2b70ff] text-white'
                        : 'bg-[#0e1017] text-[#8c96a6] hover:text-white border border-[#1e2330]'
                    }`}
                  >
                    {filterOpt === 'ALL' ? 'All Transactions' : `${filterOpt}s`}
                  </button>
                ))}
              </div>

              {/* Quotex Pagination Controls ("1/2 Next") */}
              <div
                data-testid="payments-pagination"
                className="flex items-center gap-2 text-xs font-mono tabular-nums ml-auto"
              >
                {pagination.hasPrev && (
                  <button
                    type="button"
                    data-testid="pagination-prev-btn"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setCurrentPage((p) => Math.max(1, p - 1));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1c202b] hover:bg-[#252a38] border border-[#282e3d] text-white font-semibold cursor-pointer transition-colors"
                  >
                    Prev
                  </button>
                )}

                <span
                  data-testid="pagination-page-indicator"
                  className="px-3 py-1.5 rounded-lg bg-[#0e1017] border border-[#1e2330] text-[#cbd5e1] font-bold"
                >
                  {pagination.currentPage}/{pagination.totalPages}
                </span>

                <button
                  type="button"
                  data-testid="pagination-next-btn"
                  disabled={!pagination.hasNext}
                  onClick={() => {
                    soundEngine.playUiClick();
                    if (pagination.hasNext) {
                      setCurrentPage((p) => p + 1);
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-colors ${
                    pagination.hasNext
                      ? 'bg-[#2b70ff] hover:bg-[#3b82f6] text-white cursor-pointer'
                      : 'bg-[#181c26] text-[#475569] border border-[#1e2330] cursor-not-allowed'
                  }`}
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* DESKTOP TABLE VIEW (md:block) */}
            <div className="hidden md:block bg-[#141720] border border-[#1e2330] rounded-xl overflow-hidden">
              <table
                data-testid="withdrawal-history-table"
                className="w-full text-left border-collapse text-xs"
              >
                <thead>
                  <tr className="bg-[#10131b] text-[#8c96a6] border-b border-[#1e2330] font-semibold">
                    <th className="py-3.5 px-5">Transaction ID</th>
                    <th className="py-3.5 px-5">Date and time</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5">Transaction type</th>
                    <th className="py-3.5 px-5">Payment system</th>
                    <th className="py-3.5 px-5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2330]">
                  {pagination.pageItems.map((tx) => {
                    const isPayout = tx.type === 'Payout';
                    return (
                      <tr key={tx.id} className="hover:bg-[#181c27] transition-colors">
                        {/* Transaction ID */}
                        <td className="py-4 px-5 font-mono tabular-nums font-bold text-white align-top">
                          <div>{tx.orderNumber}</div>
                          <div className="text-[11px] text-[#64748b] font-normal mt-0.5">{tx.accountId}</div>
                        </td>

                        {/* Date and time */}
                        <td className="py-4 px-5 font-mono tabular-nums text-[#cbd5e1] align-top">
                          <div>{tx.dateFormatted}</div>
                          <div className="text-[11px] text-[#64748b] mt-0.5">{tx.timeFormatted}</div>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-5 align-top">
                          {tx.status === 'Succeeded' && (
                            <div className="inline-flex items-center gap-1.5 text-[#00c853] font-semibold">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>Succeeded</span>
                            </div>
                          )}
                          {tx.status === 'Waiting confirmation' && (
                            <div className="inline-flex items-center gap-1.5 text-[#ff8800] font-semibold">
                              <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                              <span>Waiting confirmation</span>
                            </div>
                          )}
                          {tx.status === 'Pending' && (
                            <div className="inline-flex items-center gap-1.5 text-[#ff8800] font-semibold">
                              <Clock className="w-4 h-4 shrink-0" />
                              <span>Pending</span>
                            </div>
                          )}
                          {tx.status === 'Canceled' && (
                            <div className="inline-flex items-center gap-1.5 text-rose-400 font-semibold">
                              <XCircle className="w-4 h-4 shrink-0" />
                              <span>Canceled</span>
                            </div>
                          )}
                        </td>

                        {/* Transaction type */}
                        <td className="py-4 px-5 text-white font-semibold align-top">{tx.type}</td>

                        {/* Payment system */}
                        <td className="py-4 px-5 align-top">
                          <div className="font-bold text-white">{tx.paymentSystem}</div>
                          {tx.network && <div className="text-[11px] text-[#8c96a6] mt-0.5">{tx.network}</div>}
                        </td>

                        {/* Amount + Fee + Purse + Hash */}
                        <td className="py-4 px-5 text-right font-mono tabular-nums align-top">
                          <div
                            className={`text-sm font-bold ${
                              isPayout ? 'text-rose-400' : 'text-[#00c853]'
                            }`}
                          >
                            {tx.signedAmountFormatted}
                          </div>
                          {tx.feeFormatted && (
                            <div className="text-[11px] text-[#8c96a6] mt-0.5">{tx.feeFormatted}</div>
                          )}
                          {tx.purse && (
                            <div
                              className="text-[11px] text-[#94a3b8] mt-1 truncate max-w-[240px] ml-auto"
                              title={tx.purse}
                            >
                              {tx.purse}
                            </div>
                          )}
                          {tx.txHash && (
                            <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-[#2b70ff]">
                              <span className="truncate max-w-[180px]" title={tx.txHash}>
                                {tx.txHash}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(tx.txHash!)}
                                className="p-0.5 hover:text-white cursor-pointer"
                                title="Copy Transaction Hash"
                              >
                                {copiedHash === tx.txHash ? (
                                  <Check className="w-3 h-3 text-[#00c853]" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBILE PAYMENTS / HISTORY VERTICAL CARD FEED (md:hidden) */}
            <div data-testid="mobile-payments-feed" className="md:hidden space-y-3">
              {pagination.pageItems.map((tx) => {
                const isPayout = tx.type === 'Payout';
                return (
                  <div
                    key={tx.id}
                    className="bg-[#141720] border border-[#1e2330] rounded-xl p-4 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-[#1e2330] pb-2">
                      <span className="font-mono tabular-nums font-bold text-white">#{tx.orderNumber}</span>
                      <span className="font-mono tabular-nums text-[#8c96a6]">
                        {tx.dateFormatted} {tx.timeFormatted}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#8c96a6]">Status:</span>
                      {tx.status === 'Succeeded' ? (
                        <span className="inline-flex items-center gap-1 text-[#00c853] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Succeeded</span>
                        </span>
                      ) : tx.status === 'Canceled' ? (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Canceled</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#ff8800] font-semibold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{tx.status}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#8c96a6]">Transaction type:</span>
                      <span className="font-semibold text-white">{tx.type}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#8c96a6]">Payment system:</span>
                      <span className="font-semibold text-white">
                        {tx.paymentSystem} {tx.network ? `· ${tx.network}` : ''}
                      </span>
                    </div>

                    <div className="flex items-start justify-between pt-2 border-t border-[#1e2330]">
                      <span className="text-[#8c96a6]">Amount:</span>
                      <div className="text-right font-mono tabular-nums">
                        <div className={`text-sm font-bold ${isPayout ? 'text-rose-400' : 'text-[#00c853]'}`}>
                          {tx.signedAmountFormatted}
                        </div>
                        {tx.feeFormatted && <div className="text-[11px] text-[#8c96a6]">{tx.feeFormatted}</div>}
                        {tx.purse && (
                          <div className="text-[10px] text-[#94a3b8] truncate max-w-[190px] mt-0.5">
                            {tx.purse}
                          </div>
                        )}
                        {tx.txHash && (
                          <div className="text-[10px] text-[#2b70ff] truncate max-w-[190px] mt-0.5">
                            {tx.txHash}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 3: TRADES TAB (Inline Trade History Table inside Quotex Portal)
            ===================================================================== */}
        {activePortalTab === 'trades' && (
          <div data-testid="portal-trades-view" className="p-3 sm:p-6 space-y-4">
            <div className="bg-[#141720] border border-[#1e2330] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white">Closed & Active OTC Trades</h2>
                  <p className="text-xs text-[#8c96a6]">
                    Real-time execution log for account {account?.id || 'BFT-91823'}.
                  </p>
                </div>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('terminal')}
                    className="px-3.5 py-2 rounded-lg bg-[#2b70ff] hover:bg-[#3b82f6] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <LineChart className="w-3.5 h-3.5" />
                    <span>Open Trading Terminal</span>
                  </button>
                )}
              </div>

              {trades.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#8c96a6]">
                  No binary options trades recorded in this session yet. Launch the OTC Trading Terminal to execute CALL/PUT contracts.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                    <thead>
                      <tr className="border-b border-[#1e2330] text-[#8c96a6]">
                        <th className="py-2.5 px-3">Asset</th>
                        <th className="py-2.5 px-3">Direction</th>
                        <th className="py-2.5 px-3">Investment</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Net P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2330]">
                      {trades
                        .filter((t) => !account || t.accountId === account.id)
                        .slice(0, 15)
                        .map((t) => (
                        <tr key={t.id}>
                          <td className="py-2.5 px-3 font-bold text-white">{t.asset}</td>
                          <td
                            className={`py-2.5 px-3 font-bold ${
                              t.direction === 'CALL' ? 'text-[#00c853]' : 'text-rose-400'
                            }`}
                          >
                            {t.direction}
                          </td>
                          <td className="py-2.5 px-3 text-white">${t.investment.toFixed(2)}</td>
                          <td className="py-2.5 px-3 uppercase">{t.status}</td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold ${
                              (t.pnl ?? 0) >= 0 ? 'text-[#00c853]' : 'text-rose-400'
                            }`}
                          >
                            {(t.pnl ?? 0) >= 0 ? `+$${(t.pnl ?? 0).toFixed(2)}` : `-$${Math.abs(t.pnl ?? 0).toFixed(2)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 4: ANALYTICS TAB (Account Telemetry Summary)
            ===================================================================== */}
        {activePortalTab === 'analytics' && (
          <div data-testid="portal-analytics-view" className="p-3 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#141720] border border-[#1e2330] rounded-xl p-4">
                <span className="text-xs text-[#8c96a6]">Account Win Rate</span>
                <div className="text-xl font-bold font-mono tabular-nums text-[#00c853] mt-1">
                  {account?.winRate ?? 73.6}%
                </div>
              </div>
              <div className="bg-[#141720] border border-[#1e2330] rounded-xl p-4">
                <span className="text-xs text-[#8c96a6]">Completed Trading Days</span>
                <div className="text-xl font-bold font-mono tabular-nums text-white mt-1">
                  {account?.tradingDaysCompleted ?? 14} Days
                </div>
              </div>
              <div className="bg-[#141720] border border-[#1e2330] rounded-xl p-4">
                <span className="text-xs text-[#8c96a6]">Applicable Profit Split</span>
                <div className="text-xl font-bold font-mono tabular-nums text-[#2b70ff] mt-1">
                  {breakdown.profitSplitPercent}% Split
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          MOBILE FIXED BOTTOM NAVIGATION BAR (md:hidden)
          ===================================================================== */}
      <nav
        aria-label="Mobile Bottom Navigation"
        data-testid="portal-mobile-bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-[#12151e] border-t border-[#1e2330] px-2 py-1.5 flex items-center justify-around z-40"
      >
        <button
          type="button"
          onClick={() => onNavigateTab?.('terminal')}
          className="flex flex-col items-center justify-center py-1 px-2 text-[#8c96a6] hover:text-white cursor-pointer"
        >
          <LineChart className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Trade</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePortalTab('withdrawal')}
          className={`flex flex-col items-center justify-center py-1 px-2 cursor-pointer ${
            activePortalTab === 'withdrawal' ? 'text-[#2b70ff]' : 'text-[#8c96a6] hover:text-white'
          }`}
        >
          <CreditCard className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Withdrawal</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePortalTab('payments')}
          className={`flex flex-col items-center justify-center py-1 px-2 cursor-pointer ${
            activePortalTab === 'payments' ? 'text-[#2b70ff]' : 'text-[#8c96a6] hover:text-white'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Payments</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToKyc?.()}
          className="flex flex-col items-center justify-center py-1 px-2 text-[#8c96a6] hover:text-white cursor-pointer"
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Account</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePortalTab('analytics')}
          className={`flex flex-col items-center justify-center py-1 px-2 cursor-pointer ${
            activePortalTab === 'analytics' ? 'text-[#2b70ff]' : 'text-[#8c96a6] hover:text-white'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Analytics</span>
        </button>
      </nav>

      {/* 2FA Google Authenticator Verification Prompt Modal */}
      {showTwoFactorModal && (
        <div
          data-testid="withdrawal-2fa-modal-overlay"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#0c0d12] border border-[#ff8800]/50 p-6 shadow-2xl space-y-5 font-mono text-left">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Google Authenticator (2FA)</h3>
                  <span className="text-[10px] text-slate-400">Withdrawal Security Verification</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTwoFactorModal(false);
                  setTotpError(null);
                  setWithdrawalTotpCode('');
                }}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              To authorize payout of <strong className="text-emerald-400 font-bold">${breakdown.netPayoutToReceive.toFixed(2)} USD</strong>, please enter the current 6-digit code from your Google Authenticator app:
            </p>

            {totpError && (
              <div
                data-testid="withdrawal-2fa-error"
                className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{totpError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmWithdrawalWith2fa} className="space-y-4">
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  maxLength={6}
                  data-testid="withdrawal-2fa-code-input"
                  value={withdrawalTotpCode}
                  onChange={(e) => setWithdrawalTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-4 py-3 rounded-xl bg-[#050608] border border-white/20 text-white text-center tracking-[0.5em] font-mono text-2xl font-black focus:outline-none focus:border-[#ff8800]"
                />
                <span className="text-[10px] text-slate-500 block text-center mt-1.5">
                  {withdrawalTotpCode.length}/6 digits entered
                </span>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={withdrawalTotpCode.length !== 6 || isVerifyingTotp}
                  data-testid="confirm-withdrawal-2fa-btn"
                  className="flex-1 py-3 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-50 text-slate-950 font-black text-xs uppercase cursor-pointer transition-colors flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                  <span>{isVerifyingTotp ? 'Verifying...' : 'Authorize Payout'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTwoFactorModal(false);
                    setTotpError(null);
                    setWithdrawalTotpCode('');
                  }}
                  className="px-4 py-3 rounded-xl bg-[#141418] hover:bg-[#1c1c22] border border-white/10 text-slate-400 hover:text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  if (inlineMode) {
    return portalContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-6 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="my-2 sm:my-4 w-full max-w-6xl">{portalContent}</div>
    </div>
  );
};
