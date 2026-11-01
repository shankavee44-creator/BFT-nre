import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Wallet,
  ExternalLink,
  History,
  ArrowRight,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { TradingAccount, UserProfile } from '../types';
import { isPersonalLiveAccount } from '../utils/propRules';
import {
  DIRECT_USDT_TRC20_CONFIG,
  CryptoDepositAccountType,
  buildPackageSku,
  buildCryptoDepositPayload,
  validateDirectDepositAmount,
  fetchTronGridTrc20Transfers,
  matchPendingDepositToTronGridTx,
  mapPurchaseRecord,
  NormalizedPurchaseRecord,
} from '../config/directDeposit';
import { apiSubmitCryptoDeposit, apiVerifyCryptoDeposits, safeJsonResponse } from '../utils/apiClient';
import { supabase } from '../utils/supabase';
import { insertSupabaseUserPurchase } from '../utils/supabaseRealtimeSync';

interface DirectDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile | null;
  activeAccount: TradingAccount | null;
  accounts: TradingAccount[];
  onSelectAccount?: (accountId: string) => void;
  onCreditAccountDeposit: (accountId: string, amountUsdt: number, details?: any) => void;
  onPurchaseRecorded?: (purchase: NormalizedPurchaseRecord) => void;
}

const PRESET_AMOUNTS = [50, 100, 250, 500, 1000, 2500];

export const DirectDepositModal: React.FC<DirectDepositModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  activeAccount,
  accounts,
  onCreditAccountDeposit,
  onPurchaseRecorded,
}) => {
  const [amountInput, setAmountInput] = useState<string>('250');
  const [accountType, setAccountType] = useState<CryptoDepositAccountType>('self_funded');
  const [txHashInput, setTxHashInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'address' | 'amount' | null>(null);
  const [activeTab, setActiveTab] = useState<'deposit' | 'history'>('deposit');
  const [depositHistory, setDepositHistory] = useState<any[]>([]);
  const [qrImgFailed, setQrImgFailed] = useState<boolean>(false);
  const [isVerifyingTronGrid, setIsVerifyingTronGrid] = useState<boolean>(false);

  const personalLiveAccount = accounts.find((acc) => isPersonalLiveAccount(acc)) || null;
  const targetAccount =
    (activeAccount && isPersonalLiveAccount(activeAccount) ? activeAccount : null) ||
    personalLiveAccount ||
    activeAccount ||
    accounts[0] ||
    null;

  const depositoryAddress = DIRECT_USDT_TRC20_CONFIG.walletAddress;

  const numericAmount = Math.max(0, parseFloat(amountInput) || 0);
  const computedPackageName =
    accountType === 'self_funded'
      ? `Self-Funded Live Deposit ($${numericAmount.toFixed(2)} USDT)`
      : targetAccount && !isPersonalLiveAccount(targetAccount)
      ? `${targetAccount.tierName} ($${targetAccount.size.toLocaleString()})`
      : `Funded Challenge Evaluation ($${numericAmount.toFixed(2)} USDT)`;

  const computedSku = buildPackageSku({
    accountType,
    tier: targetAccount?.tier,
    sizeOrAmount:
      accountType === 'challenge' && targetAccount?.size ? targetAccount.size : numericAmount,
  });

  // Load crypto_deposits history when modal is opened or tab switched
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('bft_jwt_session') || '';
        const res = await fetch('/api/crypto-deposits', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await safeJsonResponse(res);
          if (Array.isArray(data.deposits)) {
            setDepositHistory(data.deposits);
          }
        }
      } catch {
        // ignore offline error
      }
    };

    fetchHistory();
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(depositoryAddress);
    setCopiedField('address');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCopyAmount = () => {
    navigator.clipboard.writeText(numericAmount.toFixed(2));
    setCopiedField('amount');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePresetSelect = (val: number) => {
    setAmountInput(String(val));
    setErrorMessage(null);
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const numAmount = parseFloat(amountInput);
    const validation = validateDirectDepositAmount(numAmount);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid deposit amount.');
      return;
    }

    setIsSubmitting(true);

    try {
      const cleanAmount = Number(numAmount.toFixed(2));
      const cryptoPayload = buildCryptoDepositPayload({
        userId: userProfile?.id || undefined,
        accountId: targetAccount?.id || null,
        walletAddress: depositoryAddress,
        amount: cleanAmount,
        packageName: computedPackageName,
        sku: computedSku,
        accountType,
        txHash: txHashInput.trim() || undefined,
      });

      // 1. Insert transaction details (user_id, package_id, amount, status) into Supabase user_purchases & crypto_deposits
      let supaPurchaseRow: NormalizedPurchaseRecord | null = null;
      try {
        const supaInsertRes = await insertSupabaseUserPurchase({
          userId: userProfile?.id,
          userEmail: userProfile?.email,
          accountId: targetAccount?.id || null,
          walletAddress: depositoryAddress,
          packageId: computedSku,
          packageName: computedPackageName,
          packageSku: computedSku,
          amount: cleanAmount,
          packageAmount: cleanAmount,
          accountType,
          status: 'pending',
          txHash: txHashInput.trim() || null,
        });
        if (supaInsertRes.ok && supaInsertRes.row) {
          supaPurchaseRow = supaInsertRes.row;
        }
      } catch {
        // Backend /api/crypto-deposits persists into SQLite & Supabase REST
      }

      // 2. Submit to backend /api/crypto-deposits
      const data = await apiSubmitCryptoDeposit({
        userId: userProfile?.id,
        email: userProfile?.email,
        amount: cleanAmount,
        packageName: computedPackageName,
        sku: computedSku,
        accountType,
        accountId: targetAccount?.id || undefined,
        walletAddress: depositoryAddress,
        txHash: txHashInput.trim() || undefined,
      });

      if (!data.ok) {
        throw new Error(data.error || 'Failed to save pending deposit record.');
      }

      const savedRecord = data.deposit || {
        ...cryptoPayload,
        id: supaPurchaseRow?.id || `DEP-${Date.now().toString(36).toUpperCase()}`,
        status: 'pending',
        created_at: Date.now(),
      };

      const statusLabel = savedRecord.status || 'pending';
      const normalizedPurchase = mapPurchaseRecord({
        ...(supaPurchaseRow || {}),
        ...savedRecord,
        package_id: computedSku,
        package_sku: computedSku,
        package_name: computedPackageName,
        amount: cleanAmount,
        package_amount: cleanAmount,
        account_type: accountType,
        status: statusLabel,
      });
      onPurchaseRecorded?.(normalizedPurchase);

      setSuccessMessage(
        statusLabel === 'completed'
          ? `TronGrid TRC-20 transfer verified! Deposit ${savedRecord.id} marked completed (${savedRecord.sku} • ${savedRecord.account_type} • $${cleanAmount.toFixed(2)} USDT).`
          : `Pending record saved to crypto_deposits (${savedRecord.sku} • ${savedRecord.account_type} • $${cleanAmount.toFixed(2)} USDT). Automated TronGrid TRC-20 verification is monitoring ${depositoryAddress}.`
      );
      setTxHashInput('');

      // Prepend to deposit history
      setDepositHistory((prev) => [savedRecord, ...prev]);

      // Notify parent account handler when verified or self-funded
      if (targetAccount && statusLabel === 'completed') {
        onCreditAccountDeposit(targetAccount.id, cleanAmount, savedRecord);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Deposit submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyPendingWithTronGrid = async () => {
    setIsVerifyingTronGrid(true);
    setErrorMessage(null);
    try {
      // 1. Trigger backend TronGrid verification for pending rows in crypto_deposits
      const verifyData = await apiVerifyCryptoDeposits();
      if (verifyData?.ok && Array.isArray(verifyData.deposits)) {
        setDepositHistory(verifyData.deposits);
      }

      if (verifyData?.matchedCount > 0 && Array.isArray(verifyData.completedDeposits)) {
        for (const comp of verifyData.completedDeposits) {
          if (comp.accountType === 'self_funded' && targetAccount && comp.amount > 0) {
            onCreditAccountDeposit(targetAccount.id, Number(comp.amount), comp.deposit);
          }
        }
        setSuccessMessage(
          `Verified ${verifyData.matchedCount} USDT (TRC-20) payment(s) via TronGrid! Status updated to completed.`
        );
        setIsVerifyingTronGrid(false);
        return;
      }

      // 2. Also check Supabase crypto_deposits where status = 'pending' against TronGrid API
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const supaUserId = sessionData?.session?.user?.id;
        if (supaUserId) {
          const { data: pendingRows } = await supabase
            .from('crypto_deposits')
            .select('*')
            .eq('user_id', supaUserId)
            .eq('status', 'pending');

          if (Array.isArray(pendingRows) && pendingRows.length > 0) {
            const fetched = await fetchTronGridTrc20Transfers({
              walletAddress: depositoryAddress,
              apiKey: DIRECT_USDT_TRC20_CONFIG.tronGridApiKey,
            });
            if (fetched.ok && fetched.transactions.length > 0) {
              const claimed = new Set<string>();
              let supaMatchedCount = 0;
              for (const row of pendingRows) {
                const matched = matchPendingDepositToTronGridTx(
                  {
                    id: String(row.id),
                    user_id: row.user_id,
                    wallet_address: row.wallet_address || depositoryAddress,
                    amount: Number(row.amount),
                    package_name: row.package_name,
                    sku: row.package_sku || row.sku,
                    package_sku: row.package_sku || row.sku,
                    account_type: row.account_type,
                    status: row.status || 'pending',
                  },
                  fetched.transactions,
                  claimed
                );
                if (matched) {
                  claimed.add(matched.transaction_id);
                  supaMatchedCount += 1;
                  await supabase
                    .from('crypto_deposits')
                    .update({ status: 'completed' })
                    .eq('id', row.id);
                  if (row.account_type === 'self_funded' && targetAccount) {
                    onCreditAccountDeposit(targetAccount.id, Number(row.amount), {
                      ...row,
                      status: 'completed',
                      tx_hash: matched.transaction_id,
                    });
                  }
                }
              }
              if (supaMatchedCount > 0) {
                setSuccessMessage(
                  `Verified ${supaMatchedCount} USDT (TRC-20) transfer(s) via TronGrid! Deposit status updated to completed.`
                );
                setIsVerifyingTronGrid(false);
                return;
              }
            }
          }
        }
      } catch {
        // Ignore Supabase fallback error
      }

      setSuccessMessage(
        `Checked TronGrid TRC-20 endpoint for ${depositoryAddress}: ${
          verifyData?.remainingPendingCount ??
          depositHistory.filter((d) => d.status === 'pending').length
        } pending deposit(s) awaiting matching blockchain transfer.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'TronGrid TRC-20 verification failed.');
    } finally {
      setIsVerifyingTronGrid(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Direct USDT TRC-20 Deposit Modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#0d0f14] border border-[#ff8800]/50 shadow-2xl p-6 sm:p-8 my-8 text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close deposit modal"
          data-testid="direct-deposit-close-btn"
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-[#00e676]/15 border border-[#00e676]/40 flex items-center justify-center text-[#00e676]">
            <Zap className="w-6 h-6 fill-[#00e676]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
              <span className="text-[#00e676] font-bold">STATIC USDT (TRC-20)</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1 text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-[#ff8800]" />
                TRON Network
              </span>
            </div>
            <h3 className="text-xl font-black text-white mt-0.5">
              USDT (TRC-20) Deposit & Package Transfer
            </h3>
          </div>
        </div>

        {/* Tabs: Deposit vs History + TronGrid Verification Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('deposit')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'deposit'
                  ? 'bg-[#ff8800] text-slate-950 shadow-md'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Make Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-[#ff8800] text-slate-950 shadow-md'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>crypto_deposits History ({depositHistory.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleVerifyPendingWithTronGrid}
            disabled={isVerifyingTronGrid}
            data-testid="verify-trongrid-deposits-btn"
            className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingTronGrid ? 'animate-spin' : ''}`} />
            <span>{isVerifyingTronGrid ? 'Checking TronGrid...' : 'Verify via TronGrid'}</span>
          </button>
        </div>

        {/* Error / Success Banners */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/60 text-xs text-rose-200 font-mono flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            data-testid="crypto-deposit-success-banner"
            className="mb-4 p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-xs text-emerald-200 font-mono flex items-start gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {activeTab === 'deposit' ? (
          <div className="space-y-5">
            {/* Transfer Summary Card: Exact Amount, Package Name, SKU, Account Type */}
            <div className="p-4 rounded-2xl bg-[#141720] border border-white/10 space-y-2.5 font-mono tabular-nums">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Package Name</span>
                <span
                  data-testid="deposit-package-name"
                  className="text-white font-bold text-right"
                >
                  {computedPackageName}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">SKU</span>
                <span
                  data-testid="deposit-package-sku"
                  className="text-[#ff8800] font-bold"
                >
                  {computedSku}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Account Type</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAccountType('self_funded')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      accountType === 'self_funded'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    self_funded
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('challenge')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      accountType === 'challenge'
                        ? 'bg-[#ff8800] text-slate-950'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    challenge
                  </button>
                </div>
              </div>

              <div className="pt-2.5 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Exact Amount to Transfer</span>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="deposit-exact-amount"
                    className="text-lg font-black text-[#00e676]"
                  >
                    ${numericAmount.toFixed(2)} USDT
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAmount}
                    aria-label="Copy exact deposit amount"
                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
                    title="Copy exact amount"
                  >
                    {copiedField === 'amount' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Static USDT TRC-20 Wallet Address & QR Code */}
            <div className="p-5 rounded-2xl bg-[#12141c] border border-[#ff8800]/30 flex flex-col md:flex-row gap-6 items-center">
              {/* QR Code Container */}
              <div className="w-36 h-36 shrink-0 rounded-xl bg-white p-2 flex items-center justify-center shadow-lg border border-white/20 overflow-hidden">
                {!qrImgFailed ? (
                  <img
                    src={DIRECT_USDT_TRC20_CONFIG.qrCodeImageUrl}
                    alt={`USDT TRC-20 QR Code for ${depositoryAddress}`}
                    referrerPolicy="no-referrer"
                    onError={() => setQrImgFailed(true)}
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <QRCodeSVG
                    value={depositoryAddress}
                    size={128}
                    level="M"
                    includeMargin={false}
                  />
                )}
              </div>

              {/* Wallet Info & Copy */}
              <div className="flex-1 space-y-3 w-full">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 block mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#ff8800]" />
                    <span>Static USDT (TRC-20) Depository Wallet Address</span>
                  </span>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090b0e] border border-white/15">
                    <span
                      data-testid="trc20-depository-address"
                      className="font-mono text-xs sm:text-sm text-[#ffaa00] font-black break-all select-all flex-1"
                    >
                      {depositoryAddress}
                    </span>
                    <button
                      type="button"
                      data-testid="copy-depository-address-btn"
                      aria-label="Copy TRC-20 depository address"
                      onClick={handleCopyAddress}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-[#ff8800] transition-colors shrink-0 cursor-pointer"
                      title="Copy TRC-20 Address"
                    >
                      {copiedField === 'address' ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
                  <span>
                    Network: <strong className="text-white">TRON (TRC-20)</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Account Type: <strong className="text-emerald-400">{accountType}</strong>
                  </span>
                  <a
                    href={`${DIRECT_USDT_TRC20_CONFIG.explorerAddressUrl}${depositoryAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#ff8800] hover:underline flex items-center gap-1 ml-auto"
                  >
                    <span>TronScan Explorer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Deposit Form */}
            <form onSubmit={handleSubmitDeposit} className="space-y-4">
              <div>
                <label
                  htmlFor="direct-deposit-amount-input"
                  className="block text-xs font-mono font-bold text-slate-300 mb-1.5 flex items-center justify-between"
                >
                  <span>1. Enter Exact USDT (TRC-20) Amount to Transfer</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Limits: $10 - $100,000 USDT
                  </span>
                </label>

                {/* Preset Amounts */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2.5">
                  {PRESET_AMOUNTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={`py-1.5 px-3 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        amountInput === String(preset)
                          ? 'bg-[#ff8800] text-slate-950 font-black'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                      }`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>

                {/* Custom Input */}
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold">
                    $
                  </span>
                  <input
                    id="direct-deposit-amount-input"
                    type="number"
                    min="10"
                    max="100000"
                    step="any"
                    required
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="250.00"
                    className="w-full pl-8 pr-16 py-3 bg-[#0a0a0a] border border-white/20 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-[#ff8800]"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 font-bold">
                    USDT
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="direct-deposit-txhash-input"
                  className="block text-xs font-mono font-bold text-slate-300 mb-1.5 flex items-center justify-between"
                >
                  <span>2. Transaction Hash (TxID)</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Optional but recommended
                  </span>
                </label>
                <input
                  id="direct-deposit-txhash-input"
                  type="text"
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  placeholder="Paste TRON TxHash (e.g. 8f7d6a5e4c3b...)"
                  className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/20 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="submit-direct-deposit-btn"
                className="w-full py-4 px-6 rounded-xl bg-[#00e676] hover:bg-[#00c853] disabled:opacity-60 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors font-mono whitespace-nowrap"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving Pending Deposit...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>I have made the payment</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* crypto_deposits History Tab */
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {depositHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-mono text-xs">
                No crypto_deposits records found yet.
              </div>
            ) : (
              depositHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#141720] border border-white/10 flex items-center justify-between text-xs font-mono tabular-nums"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">
                        ${Number(item.amount).toFixed(2)} USDT
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#ff8800] font-bold">
                        {item.sku || 'BFT-SELF'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-400">
                        {item.account_type || 'self_funded'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {item.package_name || 'USDT (TRC-20) Deposit'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Wallet: {item.wallet_address || depositoryAddress}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-bold uppercase ${
                        item.status === 'completed' || item.status === 'approved'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {item.status || 'pending'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {item.network || 'TRC-20'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
