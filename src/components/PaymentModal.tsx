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
import { EvaluationPackage, TradingAccount, PromoCodeType } from '../types';
import { calculateDiscountedPrice } from '../utils/propRules';
import { getStoredReferralCode } from '../utils/affiliateEngine';
import { DIRECT_USDT_TRC20_CONFIG } from '../config/directDeposit';
import { apiPurchaseAccount } from '../utils/apiClient';

interface PaymentModalProps {
  packageToBuy: EvaluationPackage | null;
  activePromoCode?: PromoCodeType;
  initialDailyWithdrawals?: boolean;
  onClose: () => void;
  onSuccess: (newAccount: TradingAccount) => void;
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
  activePromoCode = 'SPOOKY40',
  initialDailyWithdrawals = false,
  onClose,
  onSuccess,
  onCommissionsProcessed,
  applyBreachDiscount = false,
}) => {
  const [step, setStep] = useState<'checkout' | 'verifying' | 'completed'>('checkout');
  const [promoCode, setPromoCode] = useState<PromoCodeType>(activePromoCode);
  const [unlockDailyWithdrawals, setUnlockDailyWithdrawals] = useState<boolean>(initialDailyWithdrawals);
  const [courtesyDiscountActive, setCourtesyDiscountActive] = useState(Boolean(applyBreachDiscount));
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [generatedAccount, setGeneratedAccount] = useState<TradingAccount | null>(null);
  const [activeReferralCode, setActiveReferralCode] = useState<string | null>(null);
  const [txHashInput, setTxHashInput] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

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

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(trc20Address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleExecutePayment = async () => {
    setPaymentError(null);
    setStep('verifying');

    try {
      // Provision challenge/funded account via Direct USDT TRC-20 deposit confirmation
      const res = await apiPurchaseAccount({
        tier: packageToBuy.tier,
        tierName: packageToBuy.tierName,
        size: packageToBuy.size,
        sku: `${packageToBuy.tier.toUpperCase()}-${packageToBuy.size}`,
        price: finalPrice,
        referralCode: activeReferralCode,
        dailyWithdrawalsUnlocked: unlockDailyWithdrawals,
        txHash: txHashInput.trim() || undefined,
      });

      if (!res.ok || !res.account) {
        throw new Error(
          res.error || 'Direct payment confirmation failed. Please verify your transfer.'
        );
      }

      setGeneratedAccount(res.account);
      setStep('completed');
      onCommissionsProcessed?.({
        buyerUserId: res.account.id,
        buyerName: `Trader ${res.account.id.slice(-4)}`,
        buyerEmail: `trader.${res.account.id.toLowerCase()}@client-bft.com`,
        packageTier: packageToBuy.tier,
        packageName: `${packageToBuy.tierName} ($${packageToBuy.size.toLocaleString()})`,
        packagePrice: finalPrice,
        referralCodeUsed: activeReferralCode,
      });
    } catch (err: any) {
      setStep('checkout');
      setPaymentError(
        err?.message ||
          'Payment could not be verified. Please ensure you have sent USDT (TRC-20) to the depository wallet.'
      );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/50 shadow-2xl p-6 sm:p-8 my-8">
        <button
          onClick={onClose}
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
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#00e676] bg-[#00e676]/15 border border-[#00e676]/30 px-2 py-0.5 rounded-full font-mono">
                    DIRECT USDT DEPOSIT • TRC-20
                  </span>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    TRON Network
                  </span>
                </div>
                <h3 className="text-xl font-black text-white mt-1">Activate Funded Evaluation</h3>
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

            {/* Plan Details Card */}
            <div className="p-4 rounded-2xl bg-[#141418] border border-white/10 mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{packageToBuy.tierName}</span>
                <span className="text-xs font-mono font-bold text-[#ff8800] uppercase">
                  {packageToBuy.tier}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Account Capital</span>
                <span className="text-white font-bold">${packageToBuy.size.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Base Fee</span>
                <span className="text-white">${packageToBuy.price.toFixed(2)}</span>
              </div>

              {pricing.promoDiscountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-emerald-400 font-mono font-bold">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Promo ({promoCode})
                  </span>
                  <span>-${pricing.promoDiscountAmount.toFixed(2)}</span>
                </div>
              )}

              {courtesyAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-purple-400 font-mono font-bold">
                  <span className="flex items-center gap-1">
                    <Gift className="w-3 h-3" /> Retest Courtesy (10%)
                  </span>
                  <span>-${courtesyAmount.toFixed(2)}</span>
                </div>
              )}

              {unlockDailyWithdrawals && (
                <div className="flex items-center justify-between text-xs text-[#ff8800] font-mono font-bold">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" /> Daily Payouts Add-On (+15%)
                  </span>
                  <span>+${pricing.dailyWithdrawalAddOnFee.toFixed(2)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-300">Total Deposit Due</span>
                <span className="text-lg font-mono font-black text-emerald-400">
                  ${finalPrice.toFixed(2)} USDT
                </span>
              </div>
            </div>

            {/* QR Code and TRC-20 Address */}
            <div className="p-4 rounded-2xl bg-[#12141c] border border-white/10 mb-4 flex flex-col items-center gap-3">
              <div className="w-28 h-28 rounded-xl bg-white p-2 flex items-center justify-center shadow-lg border border-white/20">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <rect x="5" y="5" width="26" height="26" fill="#000" />
                  <rect x="9" y="9" width="18" height="18" fill="#fff" />
                  <rect x="13" y="13" width="10" height="10" fill="#000" />
                  <rect x="69" y="5" width="26" height="26" fill="#000" />
                  <rect x="73" y="9" width="18" height="18" fill="#fff" />
                  <rect x="77" y="13" width="10" height="10" fill="#000" />
                  <rect x="5" y="69" width="26" height="26" fill="#000" />
                  <rect x="9" y="73" width="18" height="18" fill="#fff" />
                  <rect x="13" y="77" width="10" height="10" fill="#000" />
                  <rect x="36" y="36" width="28" height="28" fill="#000" />
                  <rect x="42" y="42" width="16" height="16" fill="#ff8800" />
                  <rect x="36" y="12" width="18" height="6" fill="#000" />
                  <rect x="12" y="42" width="16" height="8" fill="#000" />
                  <rect x="70" y="44" width="18" height="8" fill="#000" />
                  <rect x="42" y="74" width="24" height="10" fill="#000" />
                </svg>
              </div>

              <div className="w-full text-center">
                <span className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider block mb-1 font-mono">
                  Official BFT USDT (TRC-20) Depository Address
                </span>
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#0a0a0a] border border-white/15 font-mono text-xs text-slate-200">
                  <span className="truncate">{trc20Address}</span>
                  <button
                    onClick={handleCopyAddress}
                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-[#ff8800] transition-colors shrink-0 cursor-pointer"
                  >
                    {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Optional TxHash Input */}
            <div className="mb-4">
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                TRON Transaction Hash (TxID) - Optional:
              </label>
              <input
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
                    Sponsor Attribution: <strong className="text-white font-mono">{activeReferralCode}</strong>
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                  10%/5%/2% 3-Tier + 8% Payout
                </span>
              </div>
            )}

            <button
              data-testid="confirm-challenge-payment-btn"
              onClick={handleExecutePayment}
              className="w-full py-4 rounded-xl bg-[#00e676] hover:bg-[#00c853] text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors font-mono uppercase tracking-wider"
            >
              <span>I Have Sent ${finalPrice.toFixed(2)} USDT (Verify & Provision Account)</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}

        {step === 'verifying' && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#00e676]/15 border border-[#00e676]/40 flex items-center justify-center mx-auto mb-6">
              <RefreshCw className="w-8 h-8 text-[#00e676] animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 font-mono">Verifying USDT (TRC-20) Transfer...</h3>
            <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed mb-6 font-mono">
              Confirming ${finalPrice.toFixed(2)} USDT TRC-20 deposit on the TRON Blockchain...
            </p>
          </div>
        )}

        {step === 'completed' && generatedAccount && (
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-emerald-950/80 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-500/30 font-mono">
                USDT (TRC-20) VERIFIED • ACCOUNT DEPLOYED
              </span>
              <h3 className="text-2xl font-black text-white mt-2">Welcome to BFT Prime</h3>
              <p className="text-xs text-slate-300">
                Your ${generatedAccount.size.toLocaleString()} {generatedAccount.tierName} account is live.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#111115] border border-white/15 mb-6 space-y-3 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs text-slate-400 flex items-center gap-1.5 font-sans">
                  <KeyRound className="w-3.5 h-3.5 text-[#ff8800]" /> Account ID
                </span>
                <span className="text-sm font-bold text-white">{generatedAccount.loginId}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs text-slate-400 font-sans">Server</span>
                <span className="text-xs text-slate-200">BFT-Live-TRC</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs text-slate-400 font-sans">Phase</span>
                <span className="text-xs text-[#ff8800] font-bold uppercase">
                  {generatedAccount.phase}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-sans">Capital</span>
                <span className="text-xs text-emerald-400 font-bold">
                  ${generatedAccount.size.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleCopyCredentials}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
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
                onClick={() => {
                  onSuccess(generatedAccount);
                  onClose();
                }}
                className="w-full py-3.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
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
