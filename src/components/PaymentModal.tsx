import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Zap,
  ArrowRight,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  Gift,
  Tag,
  CalendarClock,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { EvaluationPackage, TradingAccount, PromoCodeType, UserProfile } from '../types';
import { calculateDiscountedPrice } from '../utils/propRules';
import { getStoredReferralCode } from '../utils/affiliateEngine';
import {
  DIRECT_USDT_TRC20_CONFIG,
  buildPackageSku,
  buildCryptoDepositPayload,
  fetchTronGridTrc20Transfers,
  matchPendingDepositToTronGridTx,
  mapPurchaseRecord,
  NormalizedPurchaseRecord,
} from '../config/directDeposit';
import { apiPurchaseAccount, apiVerifyCryptoDeposits } from '../utils/apiClient';
import { supabase } from '../utils/supabase';
import {
  insertSupabaseUserPurchase,
  insertSupabaseTradingAccount,
  insertSupabaseCryptoDeposit,
} from '../utils/supabaseRealtimeSync';

interface PaymentModalProps {
  packageToBuy: EvaluationPackage | null;
  userProfile?: UserProfile | null;
  activePromoCode?: PromoCodeType;
  initialDailyWithdrawals?: boolean;
  onClose: () => void;
  onSuccess: (newAccount: TradingAccount, purchaseRecord?: NormalizedPurchaseRecord) => void;
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
  applyBreachDiscount?: boolean;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  packageToBuy,
  userProfile,
  activePromoCode = 'SPOOKY40',
  initialDailyWithdrawals = false,
  onClose,
  onSuccess,
  onPurchaseRecorded,
  onCommissionsProcessed,
  applyBreachDiscount = false,
}) => {
  const [step, setStep] = useState<'checkout' | 'verifying' | 'completed'>('checkout');
  const [promoCode, setPromoCode] = useState<PromoCodeType>(activePromoCode);
  const [unlockDailyWithdrawals, setUnlockDailyWithdrawals] = useState<boolean>(
    initialDailyWithdrawals
  );
  const [courtesyDiscountActive] = useState(Boolean(applyBreachDiscount));
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [generatedAccount, setGeneratedAccount] = useState<TradingAccount | null>(null);
  const [savedDepositRecord, setSavedDepositRecord] = useState<any | null>(null);
  const [activeReferralCode, setActiveReferralCode] = useState<string | null>(null);
  const [txHashInput, setTxHashInput] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [qrImgFailed, setQrImgFailed] = useState<boolean>(false);
  const [isVerifyingTronGrid, setIsVerifyingTronGrid] = useState<boolean>(false);
  const [tronGridStatusNote, setTronGridStatusNote] = useState<string | null>(null);

  useEffect(() => {
    setPromoCode(activePromoCode);
  }, [activePromoCode]);

  useEffect(() => {
    setUnlockDailyWithdrawals(initialDailyWithdrawals);
  }, [initialDailyWithdrawals]);

  useEffect(() => {
    const code = getStoredReferralCode();
    if (code) setActiveReferralCode(code);
  }, []);

  if (!packageToBuy) return null;

  const pricing = calculateDiscountedPrice(packageToBuy.price, promoCode, unlockDailyWithdrawals);
  const courtesyAmount = courtesyDiscountActive
    ? Number((pricing.totalFinalPrice * 0.1).toFixed(2))
    : 0;
  const finalPrice = Number((pricing.totalFinalPrice - courtesyAmount).toFixed(2));

  const trc20Address = DIRECT_USDT_TRC20_CONFIG.walletAddress;
  const accountType = 'challenge' as const;
  const packageName = `${packageToBuy.tierName} ($${packageToBuy.size.toLocaleString()})`;
  const packageSku = buildPackageSku({
    accountType,
    tier: packageToBuy.tier,
    sizeOrAmount: packageToBuy.size,
  });

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(trc20Address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleCopyAmount = () => {
    navigator.clipboard.writeText(finalPrice.toFixed(2));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const handleExecutePayment = async () => {
    setPaymentError(null);
    setStep('verifying');

    try {
      const cryptoPayload = buildCryptoDepositPayload({
        userId: userProfile?.id || undefined,
        walletAddress: trc20Address,
        amount: finalPrice,
        packageName,
        sku: packageSku,
        accountType,
        txHash: txHashInput.trim() || undefined,
      });

      // 1. Insert transaction details (user_id, package_id, amount, status) into Supabase user_purchases & crypto_deposits
      let supaPurchaseRow: NormalizedPurchaseRecord | null = null;
      try {
        const supaInsertRes = await insertSupabaseUserPurchase({
          userId: userProfile?.id,
          userEmail: userProfile?.email,
          walletAddress: trc20Address,
          packageId: packageSku,
          packageName,
          packageSku,
          amount: finalPrice,
          packageAmount: finalPrice,
          accountType,
          status: 'completed',
          txHash: txHashInput.trim() || null,
        });
        if (supaInsertRes.ok && supaInsertRes.row) {
          supaPurchaseRow = supaInsertRes.row;
        }
      } catch {
        // Fallback handled by backend /api/accounts/purchase
      }

      // 2. Save record in backend user_purchases & crypto_deposits tables. Account creation is deferred until verification.
      const res = await apiPurchaseAccount({
        userId: userProfile?.id,
        email: userProfile?.email,
        tier: packageToBuy.tier,
        tierName: packageToBuy.tierName,
        packageName,
        size: packageToBuy.size,
        sku: packageSku,
        accountType,
        price: finalPrice,
        referralCode: activeReferralCode,
        dailyWithdrawalsUnlocked: unlockDailyWithdrawals,
        txHash: txHashInput.trim() || undefined,
      });

      if (!res.ok) {
        throw new Error(
          res.error || 'Direct payment confirmation failed. Please verify your transfer.'
        );
      }

      if (res.account && !res.account.supabaseAccountId) {
        // Persist purchased trading account into Supabase tables if not already persisted
        insertSupabaseTradingAccount({
          account: res.account,
          userId: userProfile?.id,
          userEmail: userProfile?.email,
        }).catch(() => {});
      }

      const finalPurchaseRecord = mapPurchaseRecord(
        res.purchase ||
          supaPurchaseRow || {
            id: res.deposit?.id || `PUR-${Date.now().toString(36).toUpperCase()}`,
            user_id: userProfile?.id || res.account?.ownerId || 'usr_bft_001',
            account_id: res.account?.id || null,
            package_id: packageSku,
            package_name: packageName,
            package_sku: packageSku,
            amount: finalPrice,
            package_amount: finalPrice,
            account_type: accountType,
            status: res.status || 'pending',
            created_at: new Date().toISOString(),
          }
      );

      if (res.account) setGeneratedAccount(res.account);
      setSavedDepositRecord(
        res.deposit || {
          ...cryptoPayload,
          id: finalPurchaseRecord.id,
          status: res.status || 'pending',
        }
      );
      onPurchaseRecorded?.(finalPurchaseRecord);
      
      if (res.status === 'completed') {
        setStep('completed');
        if (res.account) {
          onCommissionsProcessed?.({
            buyerUserId: res.account.id,
            buyerName: userProfile?.fullName || `Trader ${res.account.id.slice(-4)}`,
            buyerEmail: userProfile?.email || `trader.${res.account.id.toLowerCase()}@client-bft.com`,
            packageTier: packageToBuy.tier,
            packageName,
            packagePrice: finalPrice,
            referralCodeUsed: activeReferralCode,
          });
        }
      } else {
        setTronGridStatusNote('Verification in progress. Your account will be activated once the payment is confirmed on the blockchain.');
      }
    } catch (err: any) {
      setStep('checkout');
      setPaymentError(
        err?.message ||
          'Payment could not be recorded. Please ensure you have sent USDT (TRC-20) to the depository wallet.'
      );
    }
  };

  const handleVerifyOnTronGrid = async () => {
    setIsVerifyingTronGrid(true);
    setTronGridStatusNote(null);
    try {
      // 1. Check backend TronGrid verification endpoint
      const verifyRes = await apiVerifyCryptoDeposits();
      if (verifyRes?.ok && Array.isArray(verifyRes.deposits) && savedDepositRecord?.id) {
        const updated = verifyRes.deposits.find((d: any) => d.id === savedDepositRecord.id);
        if (updated) {
          setSavedDepositRecord(updated);
          if (updated.status === 'completed') {
            setTronGridStatusNote(
              `Verified on TronGrid TRC-20! Deposit status updated to completed.`
            );
            setIsVerifyingTronGrid(false);
            return;
          }
        }
      }

      // 2. Also check Supabase crypto_deposits where status = 'pending' directly against TronGrid API
      const fetched = await fetchTronGridTrc20Transfers({
        walletAddress: trc20Address,
        apiKey: DIRECT_USDT_TRC20_CONFIG.tronGridApiKey,
      });

      if (fetched.ok && fetched.transactions.length > 0 && savedDepositRecord) {
        const matched = matchPendingDepositToTronGridTx(
          {
            id: String(savedDepositRecord.id || 'pending'),
            wallet_address: trc20Address,
            amount: finalPrice,
            package_name: packageName,
            sku: packageSku,
            account_type: accountType,
            tx_hash: txHashInput.trim() || savedDepositRecord.tx_hash,
            status: savedDepositRecord.status || 'pending',
          },
          fetched.transactions
        );

        if (matched) {
          setSavedDepositRecord((prev: any) => ({
            ...prev,
            status: 'completed',
            tx_hash: matched.transaction_id,
          }));
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const supaUserId = sessionData?.session?.user?.id;
            if (supaUserId) {
              await supabase
                .from('crypto_deposits')
                .update({ status: 'completed' })
                .eq('user_id', supaUserId)
                .eq('status', 'pending')
                .eq('amount', finalPrice);
            }
          } catch {}
          setTronGridStatusNote(
            `Confirmed on TronGrid (${matched.transaction_id.slice(0, 12)}...) · Status: completed`
          );
          setIsVerifyingTronGrid(false);
          return;
        }
      }

      setTronGridStatusNote(
        `Checked TronGrid (${DIRECT_USDT_TRC20_CONFIG.walletAddress.slice(0, 8)}...): awaiting matching $${finalPrice.toFixed(2)} USDT TRC-20 transfer.`
      );
    } catch {
      setTronGridStatusNote('TronGrid verification check completed; awaiting confirmation.');
    } finally {
      setIsVerifyingTronGrid(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!generatedAccount) return;
    const text = `Binary Funded Trader (BFT) Account Credentials:\nAccount ID: ${generatedAccount.loginId}\nPassword: ${generatedAccount.passwordHash}\nServer: BFT-Live-TRC\nSize: $${generatedAccount.size.toLocaleString()}`;
    navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Package Purchase USDT TRC-20 Modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/50 shadow-2xl p-6 sm:p-8 my-8 text-white">
        <button
          onClick={onClose}
          aria-label="Close purchase modal"
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'checkout' && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#00e676]/15 border border-[#00e676]/40 flex items-center justify-center text-[#00e676]">
                <Zap className="w-6 h-6 fill-[#00e676]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                  <span className="text-[#00e676] font-bold">USDT (TRC-20)</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 text-slate-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#ff8800]" />
                    TRON Network
                  </span>
                </div>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Package Purchase & USDT Transfer
                </h3>
              </div>
            </div>

            {paymentError && (
              <div
                data-testid="payment-verification-error"
                className="mb-4 p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/60 text-xs text-rose-200 font-mono flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Package Metadata Summary: Package Name, SKU, Account Type, Exact Amount */}
            <div className="p-4 rounded-2xl bg-[#141418] border border-white/10 mb-4 space-y-2.5 font-mono tabular-nums">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Package Name</span>
                <span
                  data-testid="purchase-package-name"
                  className="text-white font-bold text-right"
                >
                  {packageName}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Package SKU</span>
                <span
                  data-testid="purchase-package-sku"
                  className="text-[#ff8800] font-bold"
                >
                  {packageSku}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Account Type</span>
                <span
                  data-testid="purchase-account-type"
                  className="text-emerald-400 font-bold"
                >
                  {accountType}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
                <span>Base Package Price</span>
                <span className="text-white">${packageToBuy.price.toFixed(2)} USDT</span>
              </div>

              {pricing.promoDiscountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Promo ({promoCode})
                  </span>
                  <span>-${pricing.promoDiscountAmount.toFixed(2)} USDT</span>
                </div>
              )}

              {courtesyAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-purple-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Gift className="w-3 h-3" /> Retest Courtesy (10%)
                  </span>
                  <span>-${courtesyAmount.toFixed(2)} USDT</span>
                </div>
              )}

              {unlockDailyWithdrawals && (
                <div className="flex items-center justify-between text-xs text-[#ff8800] font-bold">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" /> Daily Payouts Add-On (+15%)
                  </span>
                  <span>+${pricing.dailyWithdrawalAddOnFee.toFixed(2)} USDT</span>
                </div>
              )}

              <div className="pt-2.5 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Exact Amount to Transfer</span>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="purchase-exact-amount"
                    className="text-lg font-black text-[#00e676]"
                  >
                    ${finalPrice.toFixed(2)} USDT
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAmount}
                    aria-label="Copy exact USDT amount"
                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
                    title="Copy exact amount"
                  >
                    {copiedAmount ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Static USDT TRC-20 Wallet Address & QR Code */}
            <div className="p-4 rounded-2xl bg-[#12141c] border border-white/10 mb-4 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-32 h-32 shrink-0 rounded-xl bg-white p-2 flex items-center justify-center shadow-lg border border-white/20 overflow-hidden">
                {!qrImgFailed ? (
                  <img
                    src={DIRECT_USDT_TRC20_CONFIG.qrCodeImageUrl}
                    alt={`USDT TRC-20 QR Code for ${trc20Address}`}
                    referrerPolicy="no-referrer"
                    onError={() => setQrImgFailed(true)}
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <QRCodeSVG
                    value={trc20Address}
                    size={112}
                    level="M"
                    includeMargin={false}
                  />
                )}
              </div>

              <div className="flex-1 w-full space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Static USDT (TRC-20) Wallet Address</span>
                  <a
                    href={`${DIRECT_USDT_TRC20_CONFIG.explorerAddressUrl}${trc20Address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#ff8800] hover:underline inline-flex items-center gap-1"
                  >
                    <span>TronScan</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#0a0a0a] border border-white/15 font-mono text-xs text-[#ffaa00] font-bold">
                  <span
                    data-testid="static-trc20-wallet-address"
                    className="break-all select-all"
                  >
                    {trc20Address}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    aria-label="Copy USDT TRC-20 wallet address"
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-[#ff8800] transition-colors shrink-0 cursor-pointer"
                  >
                    {copiedAddress ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  Send only <strong className="text-white">USDT (TRC-20)</strong> of exactly{' '}
                  <strong className="text-[#00e676]">${finalPrice.toFixed(2)} USDT</strong> to this
                  address.
                </p>
              </div>
            </div>

            {/* Optional TxHash Input */}
            <div className="mb-4">
              <label
                htmlFor="purchase-txhash-input"
                className="block text-[11px] font-mono text-slate-400 mb-1"
              >
                TRON Transaction Hash (TxID) - Optional:
              </label>
              <input
                id="purchase-txhash-input"
                type="text"
                value={txHashInput}
                onChange={(e) => setTxHashInput(e.target.value)}
                placeholder="Paste TRON TxHash (e.g. 8f7d6a5e4c3b...)"
                className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
              />
            </div>

            {activeReferralCode && (
              <div className="mb-4 p-3 rounded-xl bg-[#16120c] border border-[#ff8800]/40 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#ff8800] font-bold">
                  <Gift className="w-4 h-4 shrink-0" />
                  <span>
                    Sponsor Attribution:{' '}
                    <strong className="text-white font-mono">{activeReferralCode}</strong>
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                  10%/5%/2% 3-Tier + 8% Payout
                </span>
              </div>
            )}

            <button
              type="button"
              data-testid="confirm-challenge-payment-btn"
              onClick={handleExecutePayment}
              className="w-full py-4 px-6 rounded-xl bg-[#00e676] hover:bg-[#00c853] text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors font-mono whitespace-nowrap"
            >
              <span>I have made the payment</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}

        {step === 'verifying' && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#00e676]/15 border border-[#00e676]/40 flex items-center justify-center mx-auto mb-6">
              <RefreshCw className="w-8 h-8 text-[#00e676] animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 font-mono">
              Recording Pending USDT (TRC-20) Deposit...
            </h3>
            <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed mb-6 font-mono">
              Saving pending deposit record of ${finalPrice.toFixed(2)} USDT ({packageSku}) to
              crypto_deposits...
            </p>
          </div>
        )}

        {step === 'completed' && generatedAccount && (
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-emerald-950/80 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-xs font-mono text-emerald-400 font-bold">
                crypto_deposits Record Saved · Status: {savedDepositRecord?.status || 'pending'}
              </div>
              <h3 className="text-2xl font-black text-white mt-1">
                {savedDepositRecord?.status === 'completed'
                  ? 'USDT Payment Verified & Challenge Activated'
                  : 'Payment Submitted & Account Provisioned'}
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Your {packageName} ({packageSku}) deposit is logged in crypto_deposits.
              </p>
            </div>

            {tronGridStatusNote && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-[11px] font-mono text-emerald-200">
                {tronGridStatusNote}
              </div>
            )}

            <div className="p-5 rounded-xl bg-[#111115] border border-white/15 mb-6 space-y-2.5 font-mono tabular-nums text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-slate-400 flex items-center gap-1.5 font-sans">
                  <KeyRound className="w-3.5 h-3.5 text-[#ff8800]" /> Account ID
                </span>
                <span className="text-sm font-bold text-white">{generatedAccount.loginId}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-slate-400 font-sans">Package Name</span>
                <span className="text-slate-200 font-bold">{packageName}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-slate-400 font-sans">SKU / Account Type</span>
                <span className="text-[#ff8800] font-bold">
                  {packageSku} · {accountType}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-slate-400 font-sans">Deposit Status</span>
                <span
                  data-testid="purchase-deposit-status"
                  className={
                    savedDepositRecord?.status === 'completed'
                      ? 'text-emerald-400 font-bold uppercase'
                      : 'text-amber-400 font-bold uppercase'
                  }
                >
                  {savedDepositRecord?.status || 'pending'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Amount Transferred</span>
                <span className="text-emerald-400 font-bold">${finalPrice.toFixed(2)} USDT</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {savedDepositRecord?.status !== 'completed' && (
                <button
                  type="button"
                  onClick={handleVerifyOnTronGrid}
                  disabled={isVerifyingTronGrid}
                  data-testid="verify-trongrid-purchase-btn"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingTronGrid ? 'animate-spin' : ''}`} />
                  <span>
                    {isVerifyingTronGrid
                      ? 'Checking TronGrid TRC-20 Transfers...'
                      : 'Verify USDT (TRC-20) Transfer via TronGrid'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyCredentials}
                className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {copiedCredentials ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Credentials Copied to Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#ff8800]" />
                    <span>Copy Account Credentials</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  onSuccess(generatedAccount);
                  onClose();
                }}
                className="w-full py-3.5 px-4 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <span>Launch Trading Terminal</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
