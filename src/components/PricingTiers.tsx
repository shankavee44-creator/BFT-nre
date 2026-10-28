import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Zap,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Infinity as InfinityIcon,
  Gift,
  Tag,
  TrendingUp,
  CalendarClock,
} from 'lucide-react';
import { ChallengeTier, AccountSize, EvaluationPackage, PromoCodeType } from '../types';
import { PACKAGES, calculateDiscountedPrice, PROMO_CODES } from '../utils/propRules';
import { ProfitCalculator } from './ProfitCalculator';

interface PricingTiersProps {
  activePromoCode: PromoCodeType;
  onSelectPromoCode: (code: PromoCodeType) => void;
  onSelectPackage: (pkg: EvaluationPackage, unlockDailyWithdrawals?: boolean) => void;
  onOpenRules: () => void;
}

const ACCOUNT_SIZES: AccountSize[] = [2500, 5000, 10000, 25000, 50000, 100000];

export const PricingTiers: React.FC<PricingTiersProps> = ({
  activePromoCode,
  onSelectPromoCode,
  onSelectPackage,
  onOpenRules,
}) => {
  const [selectedTier, setSelectedTier] = useState<ChallengeTier>('one-step');
  const [selectedSize, setSelectedSize] = useState<AccountSize>(10000);
  const [dailyWithdrawalsAddOn, setDailyWithdrawalsAddOn] = useState<boolean>(false);

  const tierOptions: { id: ChallengeTier; title: string; subtitle: string; badge?: string }[] = [
    {
      id: 'one-step',
      title: 'One-Step Challenge',
      subtitle: '30% Target • 10% Daily / 15% Max Loss • 5% Max Risk/Trade',
    },
    {
      id: 'two-step',
      title: 'Two-Step Challenge',
      subtitle: '25% & 15% Targets • 8% Daily / 20% Max Loss • 5% Risk/Trade',
    },
    {
      id: 'instant',
      title: 'Instant Funded Account',
      subtitle: 'Direct Real Account • 6% Daily / 12% Max Loss • 5% Risk/Trade',
      badge: 'NO EVALUATION',
    },
  ];

  const currentPackages = PACKAGES.filter((p) => p.tier === selectedTier);

  const pricingImg1 = '/assets/aistudio/1793211282946.jpg_f6e12b47.jpeg';
  const pricingImg2 = '/assets/aistudio/1793211061879.jpg_eb93d08e.jpeg';

  return (
    <section id="pricing" className="py-16 md:py-24 relative bg-[#0a0a0a] border-b border-white/10 overflow-hidden">
      {/* Animated Spooky Pricing Background Layers */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        <div
          className="absolute inset-0 bg-cover bg-center animate-pricing-bg-1"
          style={{ backgroundImage: `url("${pricingImg1}")` }}
        />
        <div
          className="absolute inset-0 bg-cover bg-center animate-pricing-bg-2"
          style={{ backgroundImage: `url("${pricingImg2}")` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/95 via-[#0a0a0a]/85 to-[#0a0a0a]/95" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/90 via-transparent to-[#0a0a0a]/90" />
        <div className="absolute inset-0 bg-cyber-grid opacity-25 mix-blend-overlay" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#16120c] border border-[#ff8800]/50 text-[#ff8800] text-xs font-bold mb-4 font-mono"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#ff8800]" />
            <span>BFT INSTITUTIONAL CHALLENGES — FINAL DISCOUNTED PRICING</span>
          </motion.div>

          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
            Select Your Binary Funding Model
          </h2>
          <p className="text-slate-300 text-base sm:text-lg">
            All accounts feature <strong className="text-white">80% profit split for the first 3 months</strong>, automatically upgrading to{' '}
            <strong className="text-[#ff8800]">90% profit split + Account Scaling</strong> after Month 3.
          </p>
        </div>

        {/* Promo Code Selector Bar */}
        <div className="max-w-2xl mx-auto mb-8 p-3.5 rounded-2xl bg-[#111115] border border-[#ff8800]/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Tag className="w-4 h-4 text-[#ff8800]" />
            <span className="text-slate-200 font-bold">
              Active Promo Code ({(PROMO_CODES[activePromoCode] || PROMO_CODES.SPOOKY40).label}):
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono">
            <button
              onClick={() => onSelectPromoCode('SPOOKY40')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                activePromoCode === 'SPOOKY40' || activePromoCode === 'BFT40'
                  ? 'bg-[#ff8800] text-slate-950 shadow'
                  : 'bg-[#1a1a20] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              "SPOOKY40" (-40% New Users)
            </button>
            <button
              onClick={() => onSelectPromoCode('SPOOKY20')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                activePromoCode === 'SPOOKY20' || activePromoCode === 'BFT20'
                  ? 'bg-[#ff8800] text-slate-950 shadow'
                  : 'bg-[#1a1a20] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              "SPOOKY20" (-20% Existing)
            </button>
          </div>
        </div>

        {/* Tier Selector Tabs */}
        <div className="flex flex-wrap justify-center gap-2 p-1.5 bg-[#111115] border border-white/10 rounded-2xl max-w-2xl mx-auto mb-8 shadow-inner">
          {tierOptions.map((tier) => (
            <button
              key={tier.id}
              onClick={() => setSelectedTier(tier.id)}
              className={`flex-1 min-w-[170px] py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all relative cursor-pointer ${
                selectedTier === tier.id
                  ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black shadow-lg glow-gold scale-[1.02]'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-2.5 right-2 px-2 py-0.5 rounded-full bg-emerald-500 text-[9px] font-black tracking-wider text-slate-950 uppercase shadow">
                  {tier.badge}
                </span>
              )}
              <div className="leading-snug">{tier.title}</div>
            </button>
          ))}
        </div>

        {/* Daily Withdrawals Optional Add-On Toggle */}
        <div className="max-w-xl mx-auto mb-8 p-3.5 rounded-2xl bg-[#14110d] border border-[#ff8800]/40 flex items-center justify-between gap-4">
          <label className="flex items-center gap-3 cursor-pointer text-xs sm:text-sm text-white font-semibold">
            <input
              type="checkbox"
              checked={dailyWithdrawalsAddOn}
              onChange={(e) => setDailyWithdrawalsAddOn(e.target.checked)}
              className="w-4 h-4 rounded accent-[#ff8800] cursor-pointer"
            />
            <span className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#ffaa00] shrink-0" />
              <span>Pay an extra 15% fee to unlock Daily Withdrawals</span>
            </span>
          </label>
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-[#ff8800]/20 text-[#ffaa00] border border-[#ff8800]/30 shrink-0">
            {dailyWithdrawalsAddOn ? '+15% ACTIVE' : 'Standard: 7-Day Cycle'}
          </span>
        </div>

        {/* Account Size Quick Selector Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mr-1">
            Account Size:
          </span>
          {ACCOUNT_SIZES.map((size) => (
            <motion.button
              key={size}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedSize(size)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black font-mono transition-all cursor-pointer ${
                selectedSize === size
                  ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 shadow-md ring-2 ring-[#ffaa00]'
                  : 'bg-[#121216] text-slate-300 hover:text-white hover:bg-white/5 border border-white/10'
              }`}
            >
              ${size >= 1000 ? `${size / 1000}k` : size} (${size.toLocaleString()})
            </motion.button>
          ))}
        </div>

        {/* Packages Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedTier}-${activePromoCode}-${dailyWithdrawalsAddOn}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
          >
            {currentPackages.map((pkg, idx) => {
              const isSelected = pkg.size === selectedSize;
              const pricing = calculateDiscountedPrice(pkg.price, activePromoCode, dailyWithdrawalsAddOn);

              return (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                  whileHover={{ y: -5 }}
                  onClick={() => setSelectedSize(pkg.size)}
                  className={`relative rounded-3xl transition-all duration-300 cursor-pointer overflow-hidden p-6 sm:p-7 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-gradient-to-b from-[#1a130b] via-[#111115] to-[#0b0b0e] border-2 border-[#ff8800] glow-gold'
                      : 'bg-[#101014] hover:bg-[#141419] border border-white/10 hover:border-[#ff8800]/50 shadow-xl'
                  }`}
                >
                  {pkg.popular && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-bl-2xl shadow-lg font-mono">
                        ★ BEST VALUE
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-[#ff8800]/15 text-[#ffaa00] uppercase tracking-wider font-mono border border-[#ff8800]/30">
                        {pkg.tierName}
                      </span>
                      <span className="text-xs text-slate-400 font-mono font-bold">
                        Code: <strong className="text-[#ffaa00]">{activePromoCode}</strong>
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 mb-2">
                      <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
                        ${pkg.size.toLocaleString()}
                      </div>
                      <span className="text-xs text-slate-400 font-bold uppercase font-mono">
                        Funded Capital
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mb-5 font-medium leading-relaxed">
                      First 3 Months: <strong className="text-emerald-400">80% Split</strong> • After 3 Months:{' '}
                      <strong className="text-[#ffaa00]">90% Split + Scaling Plan</strong>.
                    </p>

                    {/* Final Discounted Price Box */}
                    <div className="p-4 rounded-2xl bg-[#09090c] border border-[#ff8800]/30 mb-5 flex items-baseline justify-between shadow-inner">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 uppercase font-bold font-mono">
                            Final Price ({activePromoCode})
                          </span>
                          <span className="text-xs text-slate-500 line-through font-mono">
                            ${pricing.originalPrice}
                          </span>
                        </div>
                        <div className="text-2xl sm:text-3xl font-black text-[#ffaa00] font-mono mt-0.5">
                          ${pricing.totalFinalPrice.toFixed(2)}{' '}
                          <span className="text-xs text-white font-mono font-bold">USDT</span>
                        </div>
                        {dailyWithdrawalsAddOn && (
                          <div className="text-[10px] text-emerald-400 font-mono">
                            Includes +${pricing.dailyWithdrawalAddOnFee.toFixed(2)} Daily Withdrawals Add-On
                          </div>
                        )}
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <span className="text-[10px] text-slate-950 font-black bg-gradient-to-r from-[#ff8800] to-[#ffaa00] px-2 py-0.5 rounded font-mono">
                          SAVE ${pricing.discountSaved.toFixed(0)}
                        </span>
                        {pkg.refundOnFirstPayout && (
                          <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-1 font-mono">
                            <Gift className="w-2.5 h-2.5" /> 100% Fee Refund
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Exact Rules Breakdown */}
                    <div className="space-y-2 mb-6 text-xs font-mono">
                      <div className="flex items-center justify-between py-1 border-b border-white/10">
                        <span className="text-slate-400">Profit Target:</span>
                        <span className="text-white font-bold">
                          {pkg.tier === 'instant' ? (
                            <span className="text-emerald-400">None (Direct Real Account)</span>
                          ) : pkg.tier === 'one-step' ? (
                            <span className="text-[#ffaa00]">
                              30% (${((pkg.size * 30) / 100).toLocaleString()})
                            </span>
                          ) : (
                            <span className="text-[#ffaa00]">Phase 1: 25% | Phase 2: 15%</span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-white/10">
                        <span className="text-slate-400">Daily Drawdown (Soft):</span>
                        <span className="text-[#ffaa00] font-bold">
                          {pkg.maxDailyDrawdown}% (${((pkg.size * pkg.maxDailyDrawdown) / 100).toLocaleString()})
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-white/10">
                        <span className="text-slate-400">Max Overall Drawdown:</span>
                        <span className="text-rose-400 font-bold">
                          {pkg.maxOverallLoss}% ($
                          {((pkg.size * pkg.maxOverallLoss) / 100).toLocaleString()})
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-white/10">
                        <span className="text-slate-400">Max Risk Per Trade:</span>
                        <span className="text-rose-300 font-bold">
                          {pkg.maxRiskPerTradePercent || 5}% (${((pkg.size * 5) / 100).toLocaleString()})
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-white/10">
                        <span className="text-slate-400">Min Profitable Days:</span>
                        <span className="text-slate-200 font-bold">{pkg.minTradingDaysText}</span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-white/10">
                        <span className="text-slate-400">Profit Split & Scaling:</span>
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> 80% (M1-3) → 90%
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-400">Withdrawal Cycle:</span>
                        <span className="text-[#ffaa00] font-bold">
                          {dailyWithdrawalsAddOn ? 'Daily (Unlocked +15%)' : 'Weekly (7-Day Timer)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Buy Button */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPackage(pkg, dailyWithdrawalsAddOn);
                    }}
                    className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all font-mono uppercase ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 shadow-xl glow-gold hover:brightness-110'
                        : 'bg-[#18181f] hover:bg-[#22222c] text-white border border-[#ff8800]/30'
                    }`}
                  >
                    <span>
                      Buy ${pkg.size.toLocaleString()} Challenge (${pricing.totalFinalPrice.toFixed(2)})
                    </span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </motion.button>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Challenge Progression & Certificate Callout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12 font-mono text-xs">
          <div className="p-5 rounded-2xl bg-[#111115] border border-[#ff8800]/40">
            <div className="text-[#ffaa00] font-black text-sm mb-1.5">
              1. One-Step & Two-Step Progression
            </div>
            <p className="text-slate-300 font-sans text-xs leading-relaxed">
              Passing Step 1 (or Phase 2) automatically <strong>locks the evaluation account</strong>, issues your verifiable <strong>Achievement Certificate</strong>, and deploys a clean <strong>Real Funded Account</strong> with your accumulated balance.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#111115] border border-emerald-500/40">
            <div className="text-emerald-400 font-black text-sm mb-1.5">
              2. 80% → 90% Scaling & 10% Payout Fee
            </div>
            <p className="text-slate-300 font-sans text-xs leading-relaxed">
              Withdraw <strong>80% of profits</strong> in your first 3 months, upgrading to <strong>90% + Account Scaling</strong> after Month 3. A transparent <strong>10% Withdrawal Fee</strong> is deducted from requested payouts (you receive 90% net).
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#111115] border border-rose-500/40">
            <div className="text-rose-400 font-black text-sm mb-1.5">
              3. Dual-Breach & 5% Max Risk/Trade
            </div>
            <p className="text-slate-300 font-sans text-xs leading-relaxed">
              Daily Drawdown triggers a temporary <strong>Soft Breach</strong> (unlocks next trading day). Exceeding Max Overall Drawdown or <strong>5% Risk Per Trade</strong> triggers a Permanent <strong>Hard Breach</strong> (eligible for 10% Reset Courtesy).
            </p>
          </div>
        </div>

        {/* Profit Potential Calculator */}
        <ProfitCalculator onSelectPackage={(pkg) => onSelectPackage(pkg, dailyWithdrawalsAddOn)} />

        {/* Rules Shortcut */}
        <div className="mt-10 p-6 rounded-2xl bg-[#111115] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/30 flex items-center justify-center text-[#ffaa00] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Full Prop Firm Rulebook & Compliance Simulator</div>
              <div className="text-xs text-slate-400">
                Inspect 5% Max Risk Per Trade, 5 Minimum Profitable Days (≥0.5%/day), and Soft vs Hard Breach mechanics.
              </div>
            </div>
          </div>
          <button
            onClick={onOpenRules}
            className="px-4 py-2.5 rounded-xl bg-[#1a140c] hover:bg-[#241b10] text-[#ffaa00] text-xs font-bold border border-[#ff8800]/40 transition-colors shrink-0 cursor-pointer font-mono"
          >
            Review Prop Firm Rulebook
          </button>
        </div>
      </div>
    </section>
  );
};
