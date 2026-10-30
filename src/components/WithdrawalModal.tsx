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
import { apiSubmitWithdrawal } from '../utils/apiClient';
import { supabase } from '../utils/supabase';

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
  onNavigateToKyc,
  onOpenChallengeModal,
  onOpenDepositModal,
  onNavigateTab,
  trades = [],
  initialPortalTab = 'withdrawal',
}) => {
  const [activePortalTab, setActivePortalTab] = useState<QuotexPortalTab>(initialPortalTab);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const kycCheck = canUserWithdraw(userProfile);
  const accountSummary = useMemo(() => calculateQuotexAccountSummary(account), [account]);
  const netProfit = accountSummary.availableForWithdrawal;
  const firstWithdrawalCheck = useMemo(() => checkFirstWithdrawalWaitingPeriod(account), [account]);

  // Quotex Form State (Minimum withdrawal strictly $250)
  const [amount, setAmount] = useState<number>(
    netProfit >= MIN_WITHDRAWAL_PROFIT ? Math.max(MIN_WITHDRAWAL_PROFIT, Math.min(350, netProfit)) : MIN_WITHDRAWAL_PROFIT
  );
  const [monthsActive] = useState<number>(account?.monthsCompleted || 1);
  const [quotexMethod, setQuotexMethod] = useState<QuotexPaymentMethodOption>('USDT');
  const [paymentMethod, setPaymentMethod] = useState<WithdrawalPaymentMethod>('crypto_trc20');
  const [network, setNetwork] = useState<QuotexCryptoNetwork>('BSC (BEP20)');
  const [purseAddress, setPurseAddress] = useState<string>('0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A');

  // Bank fallback fields when Bank Transfer is chosen
  const [bankName, setBankName] = useState<string>('Barclays Bank UK PLC');
  const [accountHolder, setAccountHolder] = useState<string>(userProfile?.fullName || 'Alex Mercer');
  const [accountNumber, setAccountNumber] = useState<string>('GB29NWBK60161331926819');
  const [swiftCode, setSwiftCode] = useState<string>('BARCGB22XXX');

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

  useEffect(() => {
    if (!account) return;
    const isPersonal = isPersonalLiveAccount(account);
    const updatedWithdrawable = isPersonal
      ? Math.max(0, Number(account.currentBalance.toFixed(2)))
      : Math.max(0, Number((account.currentBalance - account.initialBalance).toFixed(2)));
    if (updatedWithdrawable >= MIN_WITHDRAWAL_PROFIT) {
      setAmount(Math.max(MIN_WITHDRAWAL_PROFIT, Math.min(350, updatedWithdrawable)));
    } else {
      setAmount(MIN_WITHDRAWAL_PROFIT);
    }
    setError(null);
  }, [account?.id]);

  // Synchronize paymentMethod when quotexMethod changes
  const handleChangeQuotexMethod = (nextMethod: QuotexPaymentMethodOption) => {
    setQuotexMethod(nextMethod);
    if (nextMethod === 'Bank Transfer') {
      setPaymentMethod('bank_transfer');
    } else {
      setPaymentMethod('crypto_trc20');
      if (nextMethod === 'USDT' && network === 'TRON (TRC-20)' && purseAddress.startsWith('0x')) {
        setPurseAddress('TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2');
      }
    }
  };

  const handleChangeNetwork = (nextNet: QuotexCryptoNetwork) => {
    setNetwork(nextNet);
    if (nextNet === 'TRON (TRC-20)' && purseAddress.startsWith('0x')) {
      setPurseAddress('TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2');
    } else if (nextNet !== 'TRON (TRC-20)' && purseAddress.startsWith('T')) {
      setPurseAddress('0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A');
    }
  };

  // Breakdown calculation (includes 10% Withdrawal Fee deduction)
  const breakdown = useMemo(
    () => calculateWithdrawalBreakdown(Math.max(0, amount), monthsActive, isPersonalLiveAccount(account)),
    [amount, monthsActive, account]
  );

  // Manual Admin Verification Mode: Withdrawals remain pending until approved by admin in Supabase
  const activeRequest = withdrawals.find(
    (w) => (w.status === 'processing' || w.status === 'pending') && account && w.accountId === account.id
  );

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

  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessBanner(null);

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

    const validation = validateWithdrawalRequest(account, amount, { enforceFirstWithdrawalLock: true });
    if (!validation.valid) {
      setError(validation.reason || 'Withdrawal validation failed.');
      soundEngine.playErrorAlert();
      return;
    }

    // Enforce strict 80% Net Generated Profit Payout Ceiling Rule ONLY for Prop Funded accounts
    // Personal Live accounts can withdraw 100% of their personal profits and deposited capital
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

    const walletAddr =
      paymentMethod === 'crypto_trc20'
        ? purseAddress.trim()
        : `${bankName.trim()} • ${accountNumber.trim()}`;

    try {
      // Supabase persistent insertion into withdrawals table
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const candidateId = user?.id || userProfile?.id;
        const isCandidateUuid = candidateId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId.trim());
        if (isCandidateUuid) {
          const bankDetailsPayload =
            paymentMethod === 'bank_transfer'
              ? { bankName: bankName.trim(), accountHolder: accountHolder.trim(), accountNumber: accountNumber.trim(), swiftCode: swiftCode.trim().toUpperCase() }
              : { trc20Address: purseAddress.trim(), network, quotexMethod };

          await supabase.from('withdrawals').insert({
            user_id: candidateId.trim(),
            amount: amount,
            bank_details: bankDetailsPayload,
            status: 'pending',
          });
        }
      } catch (e) {
        console.warn('Supabase withdrawal insert notice:', e);
      }

      const apiRes = await apiSubmitWithdrawal({
        accountId: account.id,
        amount,
        walletAddress: walletAddr,
        network: paymentMethod === 'crypto_trc20' ? network : 'SWIFT/SEPA',
        paymentMethod,
      });

      if (!apiRes.ok) {
        setError(apiRes.error || 'Withdrawal validation failed.');
        soundEngine.playErrorAlert();
        return;
      }

      // Do NOT deduct balance automatically; keep status: 'pending' until admin marks it as 'completed' in Supabase.
      const reqId = `WD-${Math.floor(1000000 + Math.random() * 8999999)}`;
      const refNum =
        paymentMethod === 'crypto_trc20'
          ? `0x${Math.random().toString(16).substring(2, 14)}${Math.random().toString(16).substring(2, 14)}`
          : `SWIFT-BFT-${Math.floor(100000 + Math.random() * 900000)}`;

      const newRequest: WithdrawalRequest = {
        id: reqId,
        accountId: account.id,
        amount: breakdown.requestedAmount,
        withdrawalFee: breakdown.withdrawalFeeAmount,
        netReceivedAmount: breakdown.netPayoutToReceive,
        profitSplitApplied: breakdown.profitSplitPercent,
        paymentMethod,
        trc20Address: walletAddr,
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
        status: 'pending',
        isDoublePayoutEligible: false,
        timeElapsedSeconds: 0,
      };

      onAddWithdrawal(newRequest);
      soundEngine.playWithdrawalSuccess();
      setSuccessBanner(
        `Withdrawal Request Submitted! Status: Pending Approval. Your payout request of $${amount.toFixed(2)} USD is recorded in Supabase and awaiting manual admin review.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to submit withdrawal request.');
      soundEngine.playErrorAlert();
    }
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
                <div className="absolute left-0 mt-1.5 w-60 rounded-lg bg-[#161922] border border-[#262c3a] p-1.5 z-50">
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="mobile-portal-deposit-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  if (onOpenDepositModal) onOpenDepositModal();
                  else if (onOpenChallengeModal) onOpenChallengeModal();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#00b853] hover:bg-[#00c853] text-white font-bold text-xs cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Deposit</span>
              </button>

              {!inlineMode && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Portal"
                  className="p-1.5 rounded-lg bg-[#181c26] border border-[#262c3a] text-[#8c96a6] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Standard Quotex Sub-Navigation Bar (Desktop + Mobile Horizontal Strip) */}
          <div className="flex items-center justify-between gap-4">
            <nav
              aria-label="Quotex Account Navigation"
              className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-2 md:py-0"
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
                      You are withdrawing from your <strong className="text-[#ff8800]">Personal Live Balance ({account?.id})</strong>. Personal Live accounts are not bound by challenge target phases, 14-day waiting periods, or prop profit split ceilings—withdraw both your <strong className="text-white">personal trading profits and deposited capital</strong> anytime following the standard <strong className="text-[#00c853]">$250.00 minimum threshold</strong> and <strong className="text-white">10% withdrawal fee</strong>.
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
                        {WITHDRAWAL_FEE_PERCENT}% (-${breakdown.withdrawalFeeAmount.toFixed(2)})
                      </span>
                    </div>
                    <div
                      data-testid="card-net-payout-receive"
                      className="flex items-center justify-between px-4 py-3 text-xs sm:text-sm bg-[#121622]"
                    >
                      <span className="text-[#cbd5e1] font-semibold">Net Payout to Receive (After 10% Fee):</span>
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
                      Minimum Withdrawal: <strong className="text-[#00c853]">$250.00</strong> • Fee:{' '}
                      <strong className="text-[#ff8800]">10%</strong>
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
                      className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#00c853] shrink-0 mt-0.5" />
                      <span>{successBanner}</span>
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
                          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
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
                          data-testid="bank-name-input"
                          type="text"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0e1017] border border-[#262c3a] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#8c96a6] mb-1">Account Holder</label>
                        <input
                          data-testid="bank-holder-input"
                          type="text"
                          value={accountHolder}
                          onChange={(e) => setAccountHolder(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0e1017] border border-[#262c3a] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#8c96a6] mb-1">IBAN / Account Number</label>
                        <input
                          data-testid="bank-iban-input"
                          type="text"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0e1017] border border-[#262c3a] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#8c96a6] mb-1">SWIFT / BIC Code</label>
                        <input
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

                  {/* Prominent Blue "Confirm" Submission Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      data-testid="submit-withdrawal-btn"
                      className="w-full sm:w-auto min-w-[200px] px-7 py-3 rounded-lg bg-[#2b70ff] hover:bg-[#3b82f6] text-white font-bold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <span>Confirm</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>

                {/* Footer Security Badges & Minimum Withdrawal Limit Notices (Zero Deposit Mentions) */}
                <div className="pt-5 border-t border-[#1e2330] space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-[#8c96a6]">
                    <div>
                      <span className="block text-[#64748b]">Minimum withdrawal amount:</span>
                      <strong className="text-white font-mono tabular-nums">$250.00 USD</strong>
                    </div>
                    <div>
                      <span className="block text-[#64748b]">Withdrawal Fee:</span>
                      <strong className="text-[#ff8800] font-mono tabular-nums">10% Deducted</strong>
                    </div>
                    <div>
                      <span className="block text-[#64748b]">First Withdrawal Lock:</span>
                      <strong className="text-white font-mono">14 Days Mandatory</strong>
                    </div>
                    <div>
                      <span className="block text-[#64748b]">Settlement SLA:</span>
                      <strong className="text-[#00c853] font-mono">3 Min (2x Guarantee)</strong>
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
                          .map((req) => (
                            <div
                              key={req.id}
                              className="p-3 rounded-lg bg-[#0e1017] border border-[#1e2330] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-start sm:items-center gap-3">
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
                              </div>
                            </div>
                          ))
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
