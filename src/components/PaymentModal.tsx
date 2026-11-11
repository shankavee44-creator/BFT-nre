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
  Clock,
  Ban,
  Loader2,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { EvaluationPackage, TradingAccount, PromoCodeType, UserProfile } from '../types';
import { calculateDiscountedPrice } from '../utils/propRules';
import { getStoredReferralCode } from '../utils/affiliateEngine';
import {
  DIRECT_USDT_TRC20_CONFIG,
  DEPOSIT_EXPIRY_MS,
  buildPackageSku,
  buildCryptoDepositPayload,
  fetchTronGridTrc20Transfers,
  matchPendingDepositToTronGridTx,
  mapPurchaseRecord,
  NormalizedPurchaseRecord,
  evaluateDepositStatusWithExpiry,
  formatDepositCountdown,
} from '../config/directDeposit';
import { apiPurchaseAccount, apiVerifyCryptoDeposits, apiCreateNowPaymentsPayment } from '../utils/apiClient';
import { supabase } from '../utils/supabase';
import {
  insertSupabaseTradingAccount,
} from '../utils/supabaseRealtimeSync';
import {
  NowPaymentsCurrencyCode,
  NowPaymentsPaymentResponse,
  NOWPAYMENTS_CURRENCIES,
} from '../utils/nowpaymentsGateway';
import { NowPaymentsCheckout } from './NowPaymentsCheckout';
import { PaymentIcon } from './icons/PaymentLogos';

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

const PACKAGE_PAYMENT_OPTIONS: Array<{
  id: NowPaymentsCurrencyCode | 'commercial_bank';
  name: string;
  subtitle: string;
  badge: string;
  icon: string;
  isNowPayments?: boolean;
}> = [
  {
    id: 'usdttrc20',
    name: 'USDT (TRC-20)',
    subtitle: 'TRON Network · Instant Auto-Activation',
    badge: 'AUTOMATED',
    icon: 'usdttrc20',
    isNowPayments: true,
  },
  {
    id: 'usdtbsc',
    name: 'USDT (BEP-20 / BSC)',
    subtitle: 'BNB Smart Chain · Instant Auto-Activation',
    badge: 'AUTOMATED',
    icon: 'usdtbsc',
    isNowPayments: true,
  },
  {
    id: 'usdtmatic',
    name: 'USDT (Polygon)',
    subtitle: 'Polygon Network · Instant Auto-Activation',
    badge: 'AUTOMATED',
    icon: 'usdtmatic',
    isNowPayments: true,
  },
  {
    id: 'usdterc20',
    name: 'USDT (ERC-20)',
    subtitle: 'Ethereum Network · Instant Auto-Activation',
    badge: 'AUTOMATED',
    icon: 'usdterc20',
    isNowPayments: true,
  },
  {
    id: 'btc',
    name: 'Bitcoin (BTC)',
    subtitle: 'Bitcoin Network · Instant Auto-Activation',
    badge: 'AUTOMATED',
    icon: 'btc',
    isNowPayments: true,
  },
  {
    id: 'trx',
    name: 'TRON (TRX)',
    subtitle: 'TRON Network · Instant Auto-Activation',
    badge: 'AUTOMATED',
    icon: 'trx',
    isNowPayments: true,
  },
  {
    id: 'commercial_bank',
    name: 'Commercial Bank (Manual Transfer)',
    subtitle: 'Acc: 8174001908 · A.D.H.W Kumari (LKR $1 = 350.44)',
    badge: 'BANK SLIP',
    icon: 'commercial_bank',
    isNowPayments: false,
  },
];

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
  const [step, setStep] = useState<
    'checkout' | 'nowpayments_checkout' | 'verifying' | 'pending_verification' | 'completed'
  >('checkout');
  const [selectedPayCurrency, setSelectedPayCurrency] =
    useState<NowPaymentsCurrencyCode | 'commercial_bank'>('usdttrc20');
  const [nowPaymentsPayment, setNowPaymentsPayment] =
    useState<NowPaymentsPaymentResponse | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState<boolean>(false);
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
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

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

  useEffect(() => {
    if (step !== 'pending_verification') return;
    const timer = setInterval(() => {
      setNowTickMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

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

  const expiryState = savedDepositRecord
    ? evaluateDepositStatusWithExpiry(savedDepositRecord, nowTickMs, DEPOSIT_EXPIRY_MS)
    : { effectiveStatus: 'pending' as const, isExpired: false, remainingMs: DEPOSIT_EXPIRY_MS };

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

  const handleProceedPackagePayment = async () => {
    setPaymentError(null);

    const selectedOption = PACKAGE_PAYMENT_OPTIONS.find((opt) => opt.id === selectedPayCurrency);

    if (selectedOption?.isNowPayments) {
      setIsGeneratingInvoice(true);
      try {
        const res = await apiCreateNowPaymentsPayment({
          amount: finalPrice,
          price_currency: 'usd',
          pay_currency: selectedPayCurrency as NowPaymentsCurrencyCode,
          order_id: `PKG-${Date.now().toString(36).toUpperCase()}`,
          order_description: `${packageName} (${packageSku})`,
          account_type: accountType,
          packageName,
          sku: packageSku,
          tier: packageToBuy.tier,
          size: packageToBuy.size,
          userId: userProfile?.id,
          referralCode: activeReferralCode,
          dailyWithdrawalsUnlocked: unlockDailyWithdrawals,
        });

        if (!res.ok || !res.payment) {
          throw new Error(res.error || 'Failed to generate NOWPayments crypto invoice.');
        }

        setNowPaymentsPayment(res.payment);
        setStep('nowpayments_checkout');
      } catch (err: any) {
        setPaymentError(err?.message || 'Error initializing crypto payment invoice.');
      } finally {
        setIsGeneratingInvoice(false);
      }
      return;
    }

    // Commercial Bank Manual Transfer flow
    handleExecutePayment();
  };

  const handleNowPaymentsPackageFinished = (statusRes: any) => {
    const isFinished = statusRes?.status === 'finished' || statusRes?.status === 'confirmed';
    if (isFinished && statusRes?.account) {
      setGeneratedAccount(statusRes.account);
      setSavedDepositRecord(statusRes.deposit || { id: statusRes.paymentId, status: 'completed' });
      setStep('completed');
      onSuccess(statusRes.account, statusRes.purchase);
      onCommissionsProcessed?.({
        buyerUserId: userProfile?.id || statusRes.account.ownerId || statusRes.account.id,
        buyerName: userProfile?.fullName || `Trader ${statusRes.account.id.slice(-4)}`,
        buyerEmail: userProfile?.email || `trader.${statusRes.account.id.toLowerCase()}@client-bft.com`,
        packageTier: packageToBuy.tier,
        packageName,
        packagePrice: finalPrice,
        referralCodeUsed: activeReferralCode,
      });
    } else {
      setSavedDepositRecord(
        statusRes?.deposit || { id: statusRes?.paymentId, status: statusRes?.status || 'pending' }
      );
      setStep('pending_verification');
    }
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
          res.error || 'Direct payment submission failed. Please verify your transfer details.'
        );
      }

      const isVerifiedPaid = Boolean(
        res.verified &&
          (res.status === 'completed' || res.status === 'active') &&
          res.account
      );

      if (isVerifiedPaid && res.account && !res.account.supabaseAccountId) {
        insertSupabaseTradingAccount({
          account: res.account,
          userId: userProfile?.id,
          userEmail: userProfile?.email,
        }).catch(() => {});
      }

      const createdAtIso = new Date().toISOString();
      const finalPurchaseRecord = mapPurchaseRecord(
        res.purchase || {
          id: res.deposit?.id || `PUR-${Date.now().toString(36).toUpperCase()}`,
          user_id: userProfile?.id || 'usr_bft_001',
          account_id: isVerifiedPaid ? res.account?.id || null : null,
          package_id: packageSku,
          package_name: packageName,
          package_sku: packageSku,
          amount: finalPrice,
          package_amount: finalPrice,
          account_type: accountType,
          status: isVerifiedPaid ? 'completed' : 'pending',
          created_at: createdAtIso,
        }
      );

      const depositRecord = res.deposit || {
        ...cryptoPayload,
        id: finalPurchaseRecord.id,
        status: isVerifiedPaid ? 'completed' : 'pending',
        created_at: Date.now(),
        expires_at: Date.now() + DEPOSIT_EXPIRY_MS,
      };

      setSavedDepositRecord(depositRecord);
      onPurchaseRecorded?.(finalPurchaseRecord);

      if (isVerifiedPaid && res.account) {
        setGeneratedAccount(res.account);
        setStep('completed');
        const actualBuyerId = userProfile?.id || res.account.ownerId || res.account.id;
        onCommissionsProcessed?.({
          buyerUserId: actualBuyerId,
          buyerName: userProfile?.fullName || `Trader ${res.account.id.slice(-4)}`,
          buyerEmail: userProfile?.email || `trader.${res.account.id.toLowerCase()}@client-bft.com`,
          packageTier: packageToBuy.tier,
          packageName,
          packagePrice: finalPrice,
          referralCodeUsed: activeReferralCode,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('bft-affiliate-updated', {
              detail: {
                buyerUserId: actualBuyerId,
                packageName,
                packagePrice: finalPrice,
                packageSku,
              },
            })
          );
        }
      } else {
        setGeneratedAccount(null);
        setNowTickMs(Date.now());
        setStep('pending_verification');
        setTronGridStatusNote(
          res.message ||
            'Order logged as PENDING. Account provisioning will finalize automatically upon bank verification.'
        );
      }
    } catch (err: any) {
      setStep('checkout');
      setPaymentError(
        err?.message || 'Payment submission failed. Please try again.'
      );
    }
  };

  const handleVerifyOnTronGrid = async () => {
    setIsVerifyingTronGrid(true);
    setTronGridStatusNote(null);
    try {
      const currentEval = savedDepositRecord
        ? evaluateDepositStatusWithExpiry(savedDepositRecord, Date.now(), DEPOSIT_EXPIRY_MS)
        : null;

      if (currentEval?.isExpired || currentEval?.effectiveStatus === 'failed') {
        setSavedDepositRecord((prev: any) => (prev ? { ...prev, status: 'failed' } : prev));
        setTronGridStatusNote(
          'Payment window expired (> 60 minutes without blockchain confirmation). Order status has been updated to FAILED.'
        );
        setIsVerifyingTronGrid(false);
        return;
      }

      const verifyRes = await apiVerifyCryptoDeposits({
        userId: userProfile?.id,
        email: userProfile?.email,
      });

      if (verifyRes?.ok && Array.isArray(verifyRes.deposits) && savedDepositRecord?.id) {
        const updated = verifyRes.deposits.find((d: any) => d.id === savedDepositRecord.id);
        if (updated) {
          setSavedDepositRecord(updated);
          if (updated.status === 'failed') {
            setTronGridStatusNote(
              'Order expired after 60 minutes without network confirmation. Status updated to FAILED.'
            );
            setIsVerifyingTronGrid(false);
            return;
          }
          if (updated.status === 'completed' || updated.status === 'active') {
            const compEntry = Array.isArray(verifyRes.completedDeposits)
              ? verifyRes.completedDeposits.find((c: any) => c.deposit?.id === updated.id)
              : null;
            if (compEntry?.account) {
              setGeneratedAccount(compEntry.account);
              setStep('completed');
            }
            setTronGridStatusNote('Verified! Account provisioned.');
            setIsVerifyingTronGrid(false);
            return;
          }
        }
      }

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
            created_at: savedDepositRecord.created_at,
          },
          fetched.transactions,
          new Set(),
          Date.now()
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
                .update({ status: 'completed', tx_hash: matched.transaction_id })
                .eq('user_id', supaUserId)
                .eq('status', 'pending')
                .eq('amount', finalPrice);
            }
          } catch {}
          setTronGridStatusNote(
            `Confirmed on TronGrid (${matched.transaction_id.slice(0, 12)}...)`
          );
          setIsVerifyingTronGrid(false);
          return;
        }
      }

      setTronGridStatusNote('Gateway verification check completed: payment still unconfirmed.');
    } catch {
      setTronGridStatusNote('Gateway verification check completed: payment still unconfirmed.');
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
      aria-label="Package Purchase Modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0b0f19] border border-white/[0.08] shadow-2xl p-6 sm:p-8 my-8 text-white">
        <button
          onClick={onClose}
          aria-label="Close purchase modal"
          className="absolute top-4 right-4 p-2 rounded-xl text-[#9ca3af] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'nowpayments_checkout' && nowPaymentsPayment && (
          <NowPaymentsCheckout
            payment={nowPaymentsPayment}
            onPaymentFinished={handleNowPaymentsPackageFinished}
            onCancel={() => setStep('checkout')}
          />
        )}

        {step === 'checkout' && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#0066ff]/15 border border-[#0066ff]/40 flex items-center justify-center text-[#0066ff]">
                <Zap className="w-6 h-6 fill-[#0066ff]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#9ca3af] font-mono">
                  <span className="text-[#0066ff] font-bold">AUTOMATED GATEWAY</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 text-slate-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#ff7b00]" />
                    NOWPayments &amp; Commercial Bank
                  </span>
                </div>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Package Purchase Checkout
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

            {/* Package Metadata Summary */}
            <div className="p-4 rounded-2xl bg-[#111827] border border-white/[0.08] mb-4 space-y-2 font-mono tabular-nums">
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
                <span>Base Price</span>
                <span className="text-white">${packageToBuy.price.toFixed(2)} USD</span>
              </div>

              {pricing.promoDiscountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Promo ({promoCode})
                  </span>
                  <span>-${pricing.promoDiscountAmount.toFixed(2)} USD</span>
                </div>
              )}

              {courtesyAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-purple-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Gift className="w-3 h-3" /> Retest Courtesy (10%)
                  </span>
                  <span>-${courtesyAmount.toFixed(2)} USD</span>
                </div>
              )}

              {unlockDailyWithdrawals && (
                <div className="flex items-center justify-between text-xs text-[#ff8800] font-bold">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" /> Daily Payouts Add-On (+15%)
                  </span>
                  <span>+${pricing.dailyWithdrawalAddOnFee.toFixed(2)} USD</span>
                </div>
              )}

              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Exact Package Total</span>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="purchase-exact-amount"
                    className="text-lg font-black text-[#00e676]"
                  >
                    ${finalPrice.toFixed(2)} USD
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAmount}
                    aria-label="Copy exact amount"
                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
                    title="Copy amount"
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

            {/* Selectable Payment Options */}
            <div className="mb-4">
              <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-2">
                Select Payment Method
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {PACKAGE_PAYMENT_OPTIONS.map((method) => {
                  const isSelected = selectedPayCurrency === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPayCurrency(method.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#161f33] border-[#0066ff] text-white shadow-lg shadow-[#0066ff]/15'
                          : 'bg-[#111827] border-white/[0.08] text-slate-300 hover:border-white/20 hover:bg-[#161f33]'
                      }`}
                    >
                      <PaymentIcon id={method.icon} className="w-6 h-6 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold font-mono text-white truncate">
                            {method.name}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded uppercase ${
                              method.isNowPayments
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-[#0066ff]/20 text-blue-400 border border-[#0066ff]/40'
                            }`}
                          >
                            {method.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#9ca3af] font-mono truncate">
                          {method.subtitle}
                        </p>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isSelected ? 'text-[#0066ff] translate-x-0.5' : 'text-slate-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Commercial Bank is selected */}
            {selectedPayCurrency === 'commercial_bank' && (
              <div className="p-4 rounded-2xl bg-[#111827] border border-white/[0.08] mb-4 space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-blue-400 font-bold mb-1">
                  <Building2 className="w-4 h-4" /> Commercial Bank of Ceylon
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9ca3af]">Account Name:</span>
                  <span className="text-white font-bold">A.D.H.W Kumari</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9ca3af]">Account Number:</span>
                  <span className="text-[#ffaa00] font-bold">8174001908</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9ca3af]">LKR Deposit Rate:</span>
                  <span className="text-white">$1 USD = 350.44 LKR</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-white/[0.08] text-emerald-400 font-bold">
                  <span>Required LKR Amount:</span>
                  <span>Rs. {(finalPrice * 350.44).toLocaleString('en-US', { maximumFractionDigits: 2 })} LKR</span>
                </div>
              </div>
            )}

            {activeReferralCode && (
              <div className="mb-4 p-3 rounded-xl bg-[#111827] border border-[#ff8800]/40 flex items-center justify-between text-xs">
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
              onClick={handleProceedPackagePayment}
              disabled={isGeneratingInvoice}
              className="w-full py-4 px-6 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] disabled:opacity-60 text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors font-mono whitespace-nowrap shadow-[0_8px_24px_rgba(0,102,255,0.3)]"
            >
              {isGeneratingInvoice ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating NOWPayments Invoice...</span>
                </>
              ) : selectedPayCurrency === 'commercial_bank' ? (
                <>
                  <span>Submit Commercial Bank Transfer Order</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              ) : (
                <>
                  <span>Pay ${finalPrice.toFixed(2)} USD via NOWPayments</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
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
              Logging transaction (${finalPrice.toFixed(2)} USDT · {packageSku}) to
              crypto_deposits &amp; transactions and checking Cryptomus / TRC-20 gateway...
            </p>
          </div>
        )}

        {step === 'pending_verification' && (
          <div data-testid="payment-pending-verification-view">
            <div className="text-center mb-5">
              <div
                className={`w-16 h-16 rounded-full border-2 flex items-center justify-center mx-auto mb-4 ${
                  expiryState.effectiveStatus === 'failed'
                    ? 'bg-rose-950/80 border-rose-500 text-rose-400'
                    : 'bg-amber-950/80 border-[#ff8800] text-[#ff8800]'
                }`}
              >
                {expiryState.effectiveStatus === 'failed' ? (
                  <Ban className="w-8 h-8" />
                ) : (
                  <Clock className="w-8 h-8 animate-pulse" />
                )}
              </div>
              <div
                className={`text-xs font-mono font-bold uppercase ${
                  expiryState.effectiveStatus === 'failed' ? 'text-rose-400' : 'text-[#ff8800]'
                }`}
              >
                crypto_deposits &amp; transactions · Status: {expiryState.effectiveStatus}
              </div>
              <h3 className="text-xl font-black text-white mt-1">
                {expiryState.effectiveStatus === 'failed'
                  ? 'Payment Expired (1-Hour Timeout)'
                  : 'Awaiting Blockchain / Gateway Confirmation'}
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {expiryState.effectiveStatus === 'failed'
                  ? 'This deposit remained pending for over 60 minutes without network confirmation and was automatically marked as FAILED.'
                  : 'Security Notice: Funded & challenge accounts are NEVER provisioned on an unverified click. Your account will activate automatically once Cryptomus or the TRC-20 blockchain confirms your payment.'}
              </p>
            </div>

            {tronGridStatusNote && (
              <div
                data-testid="payment-gateway-status-note"
                className={`mb-4 p-3 rounded-xl border text-[11px] font-mono ${
                  expiryState.effectiveStatus === 'failed'
                    ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                    : 'bg-amber-950/50 border-[#ff8800]/40 text-amber-200'
                }`}
              >
                {tronGridStatusNote}
              </div>
            )}

            <div className="p-4 rounded-xl bg-[#111115] border border-white/15 mb-5 space-y-2.5 font-mono tabular-nums text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-slate-400 font-sans">Order ID</span>
                <span className="text-white font-bold">
                  {savedDepositRecord?.id || 'PENDING'}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-slate-400 font-sans">Package &amp; SKU</span>
                <span className="text-slate-200 font-bold">
                  {packageName} ({packageSku})
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-slate-400 font-sans">Required Transfer</span>
                <span className="text-[#00e676] font-bold">${finalPrice.toFixed(2)} USDT</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-slate-400 font-sans">Live Transaction Status</span>
                <span
                  data-testid="purchase-deposit-status"
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                    expiryState.effectiveStatus === 'failed'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/40'
                  }`}
                >
                  {expiryState.effectiveStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">1-Hour Expiry Window</span>
                <span
                  data-testid="payment-expiry-countdown"
                  className={`font-bold ${
                    expiryState.effectiveStatus === 'failed'
                      ? 'text-rose-400'
                      : 'text-[#ffaa00]'
                  }`}
                >
                  {expiryState.effectiveStatus === 'failed'
                    ? '00:00 (EXPIRED -> FAILED)'
                    : `${formatDepositCountdown(expiryState.remainingMs)} remaining`}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {expiryState.effectiveStatus !== 'failed' && (
                <button
                  type="button"
                  onClick={handleVerifyOnTronGrid}
                  disabled={isVerifyingTronGrid}
                  data-testid="verify-trongrid-purchase-btn"
                  className="w-full py-3 px-4 rounded-xl bg-[#00e676] hover:bg-[#00c853] disabled:opacity-60 text-slate-950 font-mono text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isVerifyingTronGrid ? 'animate-spin' : ''}`} />
                  <span>
                    {isVerifyingTronGrid
                      ? 'Checking Cryptomus / TronGrid Node...'
                      : 'Verify Blockchain Confirmation Now'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                data-testid="close-pending-payment-btn"
                className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <span>Close &amp; Monitor in Deposit History</span>
              </button>
            </div>
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
