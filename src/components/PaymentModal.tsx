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
} from 'lucide-react';
import { EvaluationPackage, TradingAccount, PromoCodeType } from '../types';
import { generateAccountCredentials, calculateDiscountedPrice } from '../utils/propRules';
import { getStoredReferralCode } from '../utils/affiliateEngine';

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

  const trc20Address = 'TKs4g9Ew7XyM8Vp3Q5ZbnR2L1Hd6AcF9Jq';

  if (!packageToBuy) return null;

  const pricing = calculateDiscountedPrice(packageToBuy.price, promoCode, unlockDailyWithdrawals);
  const courtesyAmount = courtesyDiscountActive
    ? Number((pricing.totalFinalPrice * 0.1).toFixed(2))
    : 0;
  const finalPrice = Number((pricing.totalFinalPrice - courtesyAmount).toFixed(2));

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(trc20Address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleSimulatePayment = () => {
    setStep('verifying');

    setTimeout(() => {
      const { loginId, password } = generateAccountCredentials('BFT');
      const now = new Date().toISOString().split('T')[0];

      const newAccount: TradingAccount = {
        id: loginId,
        loginId,
        passwordHash: password,
        tier: packageToBuy.tier,
        tierName: packageToBuy.tierName,
        size: packageToBuy.size,
        initialBalance: packageToBuy.size,
        currentBalance: packageToBuy.size,
        startingDayEquity: packageToBuy.size,
        equity: packageToBuy.size,
        dailyLossLimitPercent: packageToBuy.maxDailyDrawdown,
        maxOverallLossPercent: packageToBuy.maxOverallLoss,
        maxRiskPerTradePercent: packageToBuy.maxRiskPerTradePercent || 5,
        status: 'active',
        createdDate: now,
        lastActiveDate: now,
        phase: packageToBuy.tier === 'instant' ? 'funded' : 'phase_1',
        tradingDaysCompleted: 0,
        tradesCount: 0,
        winRate: 0,
        dailyWithdrawalsUnlocked: unlockDailyWithdrawals,
        monthsCompleted: 1,
        scalingActive: false,
      };

      setGeneratedAccount(newAccount);
      setStep('completed');

      onCommissionsProcessed?.({
        buyerUserId: loginId,
        buyerName: `Trader ${loginId.slice(-4)}`,
        buyerEmail: `trader.${loginId.toLowerCase()}@client-bft.com`,
        packageTier: packageToBuy.tier,
        packageName: `${packageToBuy.tierName} ($${packageToBuy.size.toLocaleString()})`,
        packagePrice: finalPrice,
        referralCodeUsed: activeReferralCode,
      });
    }, 1800);
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
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0e0e12] border border-[#ff8800]/40 shadow-2xl p-6 sm:p-8 my-8 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'checkout' && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ffaa00] shadow-lg">
                <Zap className="w-6 h-6 fill-[#ff8800]" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#ffaa00] bg-[#ff8800]/15 border border-[#ff8800]/30 px-2 py-0.5 rounded-full font-mono">
                  TRC-20 USDT Instant Checkout
                </span>
                <h3 className="text-xl font-black text-white mt-1">Activate Funded Evaluation</h3>
              </div>
            </div>

            {/* Promo Code Toggle Inside Checkout */}
            <div className="mb-4 p-3 rounded-xl bg-[#141210] border border-[#ff8800]/30 flex items-center justify-between gap-2 font-mono text-xs">
              <span className="flex items-center gap-1.5 text-[#ffaa00] font-bold">
                <Tag className="w-3.5 h-3.5" /> Promo Code:
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPromoCode('SPOOKY40')}
                  className={`px-2.5 py-1 rounded-lg font-black cursor-pointer ${
                    promoCode === 'SPOOKY40' || promoCode === 'BFT40'
                      ? 'bg-[#ff8800] text-slate-950'
                      : 'bg-black/40 text-slate-400 border border-white/10'
                  }`}
                >
                  SPOOKY40 (40% OFF)
                </button>
                <button
                  type="button"
                  onClick={() => setPromoCode('SPOOKY20')}
                  className={`px-2.5 py-1 rounded-lg font-black cursor-pointer ${
                    promoCode === 'SPOOKY20' || promoCode === 'BFT20'
                      ? 'bg-[#ff8800] text-slate-950'
                      : 'bg-black/40 text-slate-400 border border-white/10'
                  }`}
                >
                  SPOOKY20 (20% OFF)
                </button>
              </div>
            </div>

            {/* Order Summary */}
            <div className="p-4 rounded-xl bg-[#09090c] border border-white/10 mb-5 space-y-2 font-mono">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-sans">Selected Package:</span>
                <span className="text-white font-bold">
                  {packageToBuy.tierName} (${packageToBuy.size.toLocaleString()})
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-sans">Profit Split & Scaling:</span>
                <span className="text-emerald-400 font-bold">80% (M1-3) → 90% + Scaling</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-sans">Drawdown & Risk Limits:</span>
                <span className="text-slate-200 font-bold">
                  {packageToBuy.maxDailyDrawdown}% Daily • {packageToBuy.maxOverallLoss}% Max • 5% Trade
                </span>
              </div>

              <div className="flex justify-between text-xs pt-2 border-t border-white/10">
                <span className="text-slate-400 font-sans">Standard Package Price:</span>
                <span className="text-slate-400 line-through">${pricing.originalPrice.toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-400">
                <span className="font-sans">Promo Discount ({promoCode}):</span>
                <span className="font-bold">-${pricing.discountSaved.toFixed(2)} USDT</span>
              </div>

              {/* Daily Withdrawals Optional Checkbox */}
              <div className="pt-2 border-t border-white/10">
                <label className="flex items-center justify-between text-xs cursor-pointer p-2.5 rounded-lg bg-[#16120c] border border-[#ff8800]/40">
                  <span className="flex items-center gap-2 text-[#ffaa00] font-sans font-bold">
                    <input
                      type="checkbox"
                      checked={unlockDailyWithdrawals}
                      onChange={(e) => setUnlockDailyWithdrawals(e.target.checked)}
                      className="rounded accent-[#ff8800] cursor-pointer"
                    />
                    <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                    <span>Pay an extra 15% fee to unlock Daily Withdrawals</span>
                  </span>
                  <span className="text-white font-bold">
                    +${(pricing.discountedBasePrice * 0.15).toFixed(2)}
                  </span>
                </label>
              </div>

              {/* Reset Courtesy 10% Discount */}
              <div className="pt-1">
                <label className="flex items-center justify-between text-xs cursor-pointer p-2 rounded-lg bg-white/5 border border-white/10">
                  <span className="flex items-center gap-2 text-slate-300 font-sans font-semibold">
                    <input
                      type="checkbox"
                      checked={courtesyDiscountActive}
                      onChange={(e) => setCourtesyDiscountActive(e.target.checked)}
                      className="rounded accent-[#ff8800] cursor-pointer"
                    />
                    <span>Hard Breach Reset Courtesy (10% Off)</span>
                  </span>
                  {courtesyDiscountActive && (
                    <span className="text-emerald-400 font-bold">-${courtesyAmount.toFixed(2)}</span>
                  )}
                </label>
              </div>

              <div className="border-t border-white/10 pt-2 flex justify-between items-baseline">
                <span className="text-xs font-bold text-slate-200 font-sans">Final Total Due:</span>
                <span className="text-2xl font-black text-[#ffaa00] font-mono">
                  ${finalPrice.toFixed(2)} USDT
                </span>
              </div>
            </div>

            {/* QR & Depository Address */}
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#09090c] border border-white/10 mb-5">
              <div className="w-36 h-36 bg-white p-2 rounded-xl shadow-lg mb-3 flex items-center justify-center">
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
                  Official TRC-20 Depository Address
                </span>
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#141418] border border-white/15 font-mono text-xs text-slate-200">
                  <span className="truncate">{trc20Address}</span>
                  <button
                    onClick={handleCopyAddress}
                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-[#ffaa00] transition-colors shrink-0 cursor-pointer"
                  >
                    {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {activeReferralCode && (
              <div className="mb-4 p-3 rounded-xl bg-[#16120c] border border-[#ff8800]/40 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#ffaa00] font-bold">
                  <Gift className="w-4 h-4 shrink-0" />
                  <span>
                    Sponsor Attribution: <strong className="text-white font-mono">{activeReferralCode}</strong>
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                  17% 3-Tier + 8% Payout
                </span>
              </div>
            )}

            <button
              onClick={handleSimulatePayment}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] hover:brightness-110 text-slate-950 font-black text-sm shadow-xl glow-gold flex items-center justify-center gap-2 cursor-pointer transition-all font-mono uppercase"
            >
              <span>I Have Sent ${finalPrice.toFixed(2)} USDT (Confirm Payment)</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}

        {step === 'verifying' && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center mx-auto mb-6 glow-gold animate-pulse">
              <RefreshCw className="w-8 h-8 text-[#ffaa00] animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 font-mono">Scanning TRON Blockchain...</h3>
            <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed mb-6 font-mono">
              Verifying ${finalPrice.toFixed(2)} USDT TRC-20 transfer...
            </p>
          </div>
        )}

        {step === 'completed' && generatedAccount && (
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-emerald-950/80 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-xl glow-mint">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-500/30 font-mono">
                PAYMENT CONFIRMED • ACCOUNT DEPLOYED
              </span>
              <h3 className="text-2xl font-black text-white mt-2">Welcome to BFT Prime</h3>
              <p className="text-xs text-slate-300">
                Your ${generatedAccount.size.toLocaleString()} {generatedAccount.tierName} account is live.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#09090c] border border-white/15 mb-6 space-y-3 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs text-slate-400 flex items-center gap-1.5 font-sans">
                  <KeyRound className="w-3.5 h-3.5 text-[#ffaa00]" /> Account ID
                </span>
                <span className="text-sm font-black text-white bg-white/10 px-2.5 py-0.5 rounded">
                  {generatedAccount.loginId}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs text-slate-400 font-sans">Trading Password</span>
                <span className="text-sm font-black text-[#ffaa00] bg-white/10 px-2.5 py-0.5 rounded">
                  {generatedAccount.passwordHash}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-sans">Withdrawal Schedule</span>
                <span className="text-xs font-bold text-emerald-400">
                  {generatedAccount.dailyWithdrawalsUnlocked ? 'Daily Withdrawals Unlocked' : 'Weekly (7-Day Cycle)'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleCopyCredentials}
                className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[#ffaa00] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer font-mono"
              >
                {copiedCredentials ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCredentials ? 'Credentials Copied!' : 'Copy Account Credentials'}</span>
              </button>

              <button
                onClick={() => {
                  onSuccess(generatedAccount);
                  onClose();
                }}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black text-sm flex items-center justify-center gap-2 glow-gold cursor-pointer shadow-lg font-mono uppercase"
              >
                <span>Launch Trading Terminal Now</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
