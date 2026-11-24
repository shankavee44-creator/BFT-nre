import React, { useEffect, useState } from 'react';
import {
  Info,
  Calendar,
  Timer,
  Banknote,
  Target,
  TrendingDown,
  Plus,
  ShieldCheck,
  CalendarClock,
  ShieldAlert,
  Layers,
  Award,
  Tag,
  X,
  CheckCircle2,
} from 'lucide-react';
import { EvaluationPackage, PromoCodeType } from '../types';
import { PROMO_CODES, validatePromoCode } from '../utils/propRules';
import {
  PricingCurrencyCode,
  PRICING_CURRENCIES,
  getCurrencyConfig,
  getUnifiedChallengeCards,
  formatFtmoCurrencyAmount,
  formatMetricValue,
  BftPricingCardSpec,
} from '../utils/ftmoPricingCatalog';

interface PricingTiersProps {
  activePromoCode: PromoCodeType;
  onSelectPromoCode: (code: PromoCodeType) => void;
  onSelectPackage: (pkg: EvaluationPackage, unlockDailyWithdrawals?: boolean) => void;
  onOpenRules: () => void;
}

const UsFlagCircle: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 rounded-full shrink-0 overflow-hidden" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#ffffff" />
    <path
      d="M0 3h24v2H0zm0 4h24v2H0zm0 4h24v2H0zm0 4h24v2H0zm0 4h24v2H0z"
      fill="#d80027"
    />
    <rect width="12" height="12" fill="#0052b4" />
    <circle cx="4" cy="4" r="0.9" fill="#ffffff" />
    <circle cx="8" cy="4" r="0.9" fill="#ffffff" />
    <circle cx="6" cy="6.5" r="0.9" fill="#ffffff" />
    <circle cx="4" cy="9" r="0.9" fill="#ffffff" />
    <circle cx="8" cy="9" r="0.9" fill="#ffffff" />
  </svg>
);

const EuFlagCircle: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 rounded-full shrink-0 overflow-hidden" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#003399" />
    <g fill="#ffcc00">
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="7" cy="7" r="1" />
      <circle cx="17" cy="7" r="1" />
      <circle cx="7" cy="17" r="1" />
      <circle cx="17" cy="17" r="1" />
    </g>
  </svg>
);

const UkFlagCircle: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 rounded-full shrink-0 overflow-hidden" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#012169" />
    <path d="M0 0L24 24M24 0L0 24" stroke="#ffffff" strokeWidth="4" />
    <path d="M0 0L24 24M24 0L0 24" stroke="#c8102e" strokeWidth="2" />
    <path d="M12 0V24M0 12H24" stroke="#ffffff" strokeWidth="6" />
    <path d="M12 0V24M0 12H24" stroke="#c8102e" strokeWidth="3.5" />
  </svg>
);


const DiscountPercentBadge: React.FC = () => (
  <span
    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#ff7b00] text-[#0b0d13] text-[10px] font-black shrink-0"
    aria-hidden="true"
  >
    %
  </span>
);

export const PricingTiers: React.FC<PricingTiersProps> = ({
  activePromoCode,
  onSelectPromoCode,
  onSelectPackage,
  onOpenRules,
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<PricingCurrencyCode>('USD');
  const [showNumbers, setShowNumbers] = useState<boolean>(true);
  const [isMoreCurrenciesOpen, setIsMoreCurrenciesOpen] = useState<boolean>(false);
  const [dailyWithdrawalsAddOn, setDailyWithdrawalsAddOn] = useState<boolean>(false);
  const [promoCodeInput, setPromoCodeInput] = useState<string>(
    activePromoCode && activePromoCode !== 'NONE' ? String(activePromoCode) : ''
  );
  const [promoFeedbackError, setPromoFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    if (activePromoCode && activePromoCode !== 'NONE') {
      setPromoCodeInput(String(activePromoCode));
      setPromoFeedbackError(null);
    } else if (activePromoCode === 'NONE') {
      const currentValid = validatePromoCode(promoCodeInput);
      if (currentValid.valid) {
        setPromoCodeInput('');
      }
    }
  }, [activePromoCode]);

  const activePromoValidation = validatePromoCode(activePromoCode);
  const effectivePromoCode: PromoCodeType = activePromoValidation.valid ? activePromoValidation.code : 'NONE';

  const currencyCfg = getCurrencyConfig(selectedCurrency);
  const cards = getUnifiedChallengeCards(effectivePromoCode, dailyWithdrawalsAddOn);

  const handleStartNow = (spec: BftPricingCardSpec) => {
    onSelectPackage(spec.pkg, dailyWithdrawalsAddOn);
  };

  const handleApplyPromoCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const validation = validatePromoCode(promoCodeInput);
    if (validation.valid) {
      setPromoFeedbackError(null);
      setPromoCodeInput(String(validation.code));
      onSelectPromoCode(validation.code);
    } else {
      onSelectPromoCode('NONE');
      setPromoFeedbackError(validation.isCleared ? null : validation.error || 'Invalid bonus code.');
    }
  };

  const handleClearPromoCode = () => {
    setPromoCodeInput('');
    setPromoFeedbackError(null);
    onSelectPromoCode('NONE');
  };

  const primaryCurrencies = PRICING_CURRENCIES.filter((c) => c.isPrimaryPill);
  const extraCurrencies = PRICING_CURRENCIES.filter((c) => !c.isPrimaryPill);
  const activePromoInfo =
    effectivePromoCode && effectivePromoCode !== 'NONE' && PROMO_CODES[effectivePromoCode]
      ? PROMO_CODES[effectivePromoCode]
      : null;

  return (
    <section
      id="pricing"
      data-testid="ftmo-pricing-section"
      className="pt-8 pb-20 md:pt-12 md:pb-28 relative bg-[#07090e] border-b border-white/[0.08] overflow-hidden select-none font-sans"
    >
      {/* Top Spotlight Beam & Conical Cyan-Blue Glow */}
      <div className="relative max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 z-10">
        <div className="relative flex flex-col items-center text-center pt-6 pb-8">
          {/* Horizontal Cyan Light Bar */}
          <div
            aria-hidden="true"
            className="w-[240px] sm:w-[330px] h-[2px] bg-gradient-to-r from-cyan-400/10 via-[#00e5ff] to-cyan-400/10 relative z-20"
          />

          {/* Main Section Heading */}
          <h2
            data-testid="pricing-main-heading"
            className="relative z-10 text-3xl sm:text-5xl font-extrabold text-white tracking-[-0.02em] leading-[1.12] mt-7 text-balance font-sans"
          >
            BFT Unified Funded Challenge
          </h2>
          <p className="relative z-10 text-slate-200 text-sm sm:text-base mt-3 font-medium leading-[1.65] max-w-3xl">
            One transparent path from <strong className="text-white font-bold">$5,000 up to $200,000</strong>. Reach the{' '}
            <strong className="text-[#00e5ff] font-bold">30% profit target</strong> across{' '}
            <strong className="text-white font-bold">5 qualifying trading days (≥1% profit/day)</strong> within a{' '}
            <strong className="text-rose-400 font-bold">10% max overall loss limit</strong> to automatically graduate to your Real Funded Account.
          </p>

          {/* Unified Funded Challenge Criteria Strip */}
          <div
            data-testid="unified-challenge-badge"
            className="relative z-10 mt-6 inline-flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-4 py-2.5 rounded-2xl bg-[#111827] border border-[#38BDF8]/35 shadow-2xl text-xs font-bold"
          >
            <span className="inline-flex items-center gap-1.5 text-[#00e5ff]">
              <Award className="w-4 h-4 shrink-0" />
              <span>Single Funded Challenge</span>
            </span>
            <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-white/15" />
            <span className="text-white">30% Profit Target</span>
            <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-white/15" />
            <span className="text-rose-300">10% Max Overall Loss</span>
            <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-white/15" />
            <span className="text-emerald-300">5 Min Days (≥1%/day)</span>
            <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-white/15" />
            <span className="text-[#ffaa00]">Auto-Pass → Real Funded</span>
          </div>
        </div>

        {/* Filter & Controls Toolbar: Currency Pills + Daily Add-on (Left) & Show Numbers (Right) */}
        <div className="border-y border-white/[0.08] py-3.5 mb-8 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 relative z-20">
          {/* Left: USD, EUR, GBP, More + Original BFT Promo Code & Daily Withdrawals Toggles */}
          <div className="flex flex-wrap items-center gap-2 relative">
            {primaryCurrencies.map((curr) => {
              const isActive = selectedCurrency === curr.code;
              return (
                <button
                  key={curr.code}
                  type="button"
                  data-testid={`currency-pill-${curr.code}`}
                  onClick={() => {
                    setSelectedCurrency(curr.code);
                    setIsMoreCurrenciesOpen(false);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#161f33] border border-[#0066ff]/60 text-white shadow-sm'
                      : 'bg-[#111827] border border-white/[0.08] text-[#9ca3af] hover:text-white hover:border-white/25'
                  }`}
                >
                  {curr.code === 'USD' && <UsFlagCircle />}
                  {curr.code === 'EUR' && <EuFlagCircle />}
                  {curr.code === 'GBP' && <UkFlagCircle />}
                  <span>{curr.label}</span>
                </button>
              );
            })}

            {/* More Currencies Popover Button */}
            <div className="relative">
              <button
                type="button"
                data-testid="currency-pill-more"
                aria-expanded={isMoreCurrenciesOpen}
                onClick={() => setIsMoreCurrenciesOpen((prev) => !prev)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  !primaryCurrencies.some((c) => c.code === selectedCurrency) || isMoreCurrenciesOpen
                    ? 'bg-[#161f33] border border-[#0066ff]/60 text-white'
                    : 'bg-[#111827] border border-white/[0.08] text-[#9ca3af] hover:text-white hover:border-white/25'
                }`}
              >
                <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-white/10 text-[10px]">
                  <Plus className="w-3 h-3" />
                </span>
                <span>
                  {!primaryCurrencies.some((c) => c.code === selectedCurrency)
                    ? selectedCurrency
                    : 'More'}
                </span>
              </button>

              {isMoreCurrenciesOpen && (
                <div
                  data-testid="more-currencies-popover"
                  className="absolute left-0 top-11 z-30 w-60 rounded-2xl bg-[#111827] border border-white/15 shadow-2xl p-3 space-y-2.5"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                    Additional Currencies
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {extraCurrencies.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        data-testid={`currency-option-${c.code}`}
                        onClick={() => {
                          setSelectedCurrency(c.code);
                          setIsMoreCurrenciesOpen(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold text-left cursor-pointer ${
                          selectedCurrency === c.code
                            ? 'bg-[#0066ff] text-white'
                            : 'bg-white/5 text-[#9ca3af] hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-white/15 mx-1" />

            {/* Daily Withdrawals (+15%) Add-On Toggle */}
            <label
              data-testid="daily-withdrawals-addon-label"
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                dailyWithdrawalsAddOn
                  ? 'bg-[#ff7b00]/15 border-[#ff7b00]/50 text-[#ffaa00]'
                  : 'bg-[#111827] border-white/[0.08] text-[#9ca3af] hover:text-white'
              }`}
            >
              <input
                type="checkbox"
                checked={dailyWithdrawalsAddOn}
                onChange={(e) => setDailyWithdrawalsAddOn(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-[#ff7b00] cursor-pointer"
              />
              <CalendarClock className="w-3.5 h-3.5 text-[#ffaa00] shrink-0" />
              <span>Daily Withdrawals (+15%)</span>
            </label>

            <span className="px-3 py-1.5 rounded-xl bg-[#111827] border border-white/[0.08] text-[11px] font-semibold text-slate-300 whitespace-nowrap">
              Standard: Weekly Payouts • 7-Day 1st Wait
            </span>
          </div>

          {/* Right: Bonus Code Entry + Show Numbers Switch */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-4">
            <form
              onSubmit={handleApplyPromoCode}
              data-testid="pricing-promo-code-form"
              className="flex flex-wrap items-center gap-2"
            >
              <div className="relative flex items-center">
                <Tag className="w-3.5 h-3.5 text-[#ff8800] absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  data-testid="promo-code-input"
                  value={promoCodeInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPromoCodeInput(val);
                    if (!val.trim()) {
                      setPromoFeedbackError(null);
                      onSelectPromoCode('NONE');
                    }
                  }}
                  placeholder="Bonus code"
                  aria-label="Bonus code"
                  className="w-32 sm:w-36 pl-7 pr-7 py-1.5 rounded-xl bg-[#111827] border border-white/[0.12] text-xs font-bold text-white placeholder:text-slate-500 uppercase focus:outline-none focus:border-[#ff8800]"
                />
                {(promoCodeInput || activePromoValidation.valid) && (
                  <button
                    type="button"
                    data-testid="remove-promo-code-btn"
                    onClick={handleClearPromoCode}
                    title="Remove bonus code"
                    className="absolute right-2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                data-testid="apply-promo-code-btn"
                className="px-3 py-1.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
              >
                Apply
              </button>

              {activePromoValidation.valid && (
                <span
                  data-testid="promo-code-status"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-[11px] font-bold whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{activePromoValidation.code} ({activePromoValidation.discountPercent}% OFF)</span>
                </span>
              )}

              {!activePromoValidation.valid && promoFeedbackError && (
                <span
                  data-testid="promo-code-status"
                  className="text-rose-400 text-[11px] font-bold whitespace-nowrap"
                >
                  {promoFeedbackError}
                </span>
              )}
            </form>

            <button
              type="button"
              role="switch"
              aria-checked={showNumbers}
              data-testid="toggle-show-numbers"
              onClick={() => setShowNumbers((prev) => !prev)}
              className="flex items-center gap-2.5 cursor-pointer group whitespace-nowrap shrink-0"
            >
              <span
                className={`w-10 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                  showNumbers ? 'bg-[#0066ff] justify-end' : 'bg-[#2a2f3d] justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow-sm transition-transform" />
              </span>
              <span className="text-xs sm:text-[13px] font-bold text-white group-hover:text-slate-200">
                Show Numbers
              </span>
            </button>
          </div>
        </div>

        {/* Main 6-Column Unified Funded Challenge Grid ($200k, $100k, $50k, $25k, $10k Best Value, $5k) */}
        <div
          data-testid="ftmo-pricing-cards-grid"
          className="bft-packages-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[175px_repeat(6,minmax(0,1fr))] gap-4 xl:gap-2.5 items-stretch"
        >
          {/* Left Labels Column (Desktop XL) */}
          <div className="hidden xl:flex flex-col justify-between pr-1">
            <div>
              {/* Top Header Spacer matching Account Card Header */}
              <div className="h-[108px]" />

              {/* 8 Aligned Metric Labels */}
              <div className="py-3 space-y-0">
                <div className="h-[46px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Target className="w-4 h-4 text-[#00e5ff] shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Profit Target
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Max Loss Limit
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <ShieldAlert className="w-4 h-4 text-[#ffaa00] shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Max Risk / Trade
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Layers className="w-4 h-4 text-[#ffaa00] shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Max Open Risk
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Timer className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Min Trading Days
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Trades / Pair
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Withdrawals
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Banknote className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Rewards Split
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Fee Label + Avg Reward Spacer */}
            <div>
              <div className="h-[126px] flex flex-col justify-center pr-2">
                <span className="text-xs text-[#9ca3af] font-medium leading-relaxed">
                  One-time challenge fee
                  <br />
                  {dailyWithdrawalsAddOn
                    ? '(+15% Daily Payouts Add-on)'
                    : activePromoInfo
                    ? `(${activePromoInfo.code}: ${activePromoInfo.label})`
                    : '(Auto-unlocks Real Funded)'}
                </span>
              </div>
              <div className="h-[74px] mt-3" />
            </div>
          </div>

          {/* 6 Unified Funded Challenge Pricing Cards ($200k | $100k | $50k | $25k | $10k Best Value | $5k) */}
          {cards.map((spec) => {
            const formattedAccountSize = formatFtmoCurrencyAmount(
              spec.size * currencyCfg.accountMultiplier,
              currencyCfg.accountSymbol
            );

            const profitTargetText = formatMetricValue({
              size: spec.size,
              percent: spec.phase1TargetPercent,
              showNumbers,
              accountSymbol: currencyCfg.accountSymbol,
              accountMultiplier: currencyCfg.accountMultiplier,
            });

            const maxLossText = formatMetricValue({
              size: spec.size,
              percent: spec.maxLossPercent,
              showNumbers,
              accountSymbol: currencyCfg.accountSymbol,
              accountMultiplier: currencyCfg.accountMultiplier,
            });

            const maxRiskText = formatMetricValue({
              size: spec.size,
              percent: spec.maxRiskPerTradePercent,
              showNumbers,
              accountSymbol: currencyCfg.accountSymbol,
              accountMultiplier: currencyCfg.accountMultiplier,
            });

            const finalFeeFormatted = formatFtmoCurrencyAmount(
              spec.finalPriceUsd * currencyCfg.feeMultiplier,
              currencyCfg.feeSymbol
            );

            const originalFeeFormatted = formatFtmoCurrencyAmount(
              spec.originalPriceUsd * currencyCfg.feeMultiplier,
              currencyCfg.feeSymbol
            );

            const avgRewardFormatted = formatFtmoCurrencyAmount(
              spec.avgRewardUsd * currencyCfg.feeMultiplier,
              currencyCfg.feeSymbol
            );

            const hasPromoDiscount = spec.discountSavedUsd > 0;

            return (
              <div
                key={`${spec.tier}-${spec.size}`}
                data-testid={`pricing-column-${spec.size}`}
                data-best-value={spec.isBestValue ? 'true' : 'false'}
                className="bft-package-card flex flex-col justify-between"
              >
                {/* Upper Main Dark Card */}
                <div
                  className={`bft-package-card-surface relative rounded-2xl flex-1 flex flex-col justify-between ${
                    spec.isBestValue
                      ? 'bg-[#111827] border border-[#ff7b00]/65 shadow-[0_0_35px_rgba(255,123,0,0.12)]'
                      : 'bg-[#111827] border border-white/[0.08]'
                  }`}
                >
                  {spec.isBestValue && (
                    <>
                      <div
                        data-testid="best-value-badge"
                        className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 px-3.5 py-0.5 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff8800] text-white text-[11px] font-extrabold tracking-wide shadow-[0_2px_12px_rgba(255,115,0,0.45)] whitespace-nowrap"
                      >
                        Best Value
                      </div>
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-2xl bg-[radial-gradient(ellipse_at_top,rgba(205,98,18,0.42)_0%,rgba(17,24,39,0)_72%)]"
                      />
                    </>
                  )}

                  <div>
                    {/* Account Size Header */}
                    <div className="relative z-10 h-[108px] flex flex-col items-center justify-center px-3 text-center">
                      <span className="text-[11px] text-[#38BDF8] font-bold uppercase tracking-wider mb-1">
                        Funded Challenge
                      </span>
                      <div
                        data-testid={`card-account-size-${spec.size}`}
                        className="text-xl sm:text-2xl font-extrabold text-white tracking-tight tabular-nums"
                      >
                        {formattedAccountSize}
                      </div>
                      <div className="w-full border-b border-white/[0.08] mt-4" />
                    </div>

                    {/* 8 Metric Rows */}
                    <div className="relative z-10 px-4 py-3 space-y-0">
                      {/* 1. Profit Target (30%) */}
                      <div
                        data-testid={`card-profit-target-${spec.size}`}
                        className="h-[46px] flex items-center justify-between xl:justify-start"
                      >
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Profit Target
                        </span>
                        <span className="text-xs font-extrabold text-[#00e5ff] tabular-nums">
                          {profitTargetText}
                        </span>
                      </div>

                      {/* 2. Max Overall Loss Limit (10% -> Hard Breach) */}
                      <div
                        data-testid={`card-max-loss-${spec.size}`}
                        className="h-[38px] flex items-center justify-between xl:justify-start"
                      >
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Max Loss Limit
                        </span>
                        <span className="text-xs font-bold text-rose-300 tabular-nums">
                          {maxLossText}
                        </span>
                      </div>

                      {/* 3. Max Risk Per Trade (5% of Current Balance) */}
                      <div
                        data-testid={`card-max-risk-${spec.size}`}
                        className="h-[38px] flex items-center justify-between xl:justify-start"
                      >
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Max Risk / Trade
                        </span>
                        <span className="text-xs font-semibold text-[#ffaa00] tabular-nums">
                          {maxRiskText}
                        </span>
                      </div>

                      {/* 4. Max Combined Open Risk (5% Total) */}
                      <div
                        data-testid={`card-combined-risk-${spec.size}`}
                        className="h-[38px] flex items-center justify-between xl:justify-start"
                      >
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Max Open Risk
                        </span>
                        <span className="text-xs font-semibold text-[#ffaa00] tabular-nums">
                          5% Combined
                        </span>
                      </div>

                      {/* 5. Min Trading Days (5 Days >= 1%/day) */}
                      <div
                        data-testid={`card-min-days-${spec.size}`}
                        className="h-[38px] flex items-center justify-between xl:justify-start"
                      >
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Min Trading Days
                        </span>
                        <span className="text-xs font-semibold text-emerald-300">
                          5 days (≥1%/day)
                        </span>
                      </div>

                      {/* 6. Max Open Trades / Currency Pair */}
                      <div className="h-[38px] flex items-center justify-between xl:justify-start">
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Trades / Pair
                        </span>
                        <span className="text-xs font-semibold text-[#e5e7eb]">
                          Max 1 / Pair
                        </span>
                      </div>

                      {/* 7. Withdrawals (Weekly / +15% Daily) */}
                      <div className="h-[38px] flex items-center justify-between xl:justify-start">
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Withdrawals
                        </span>
                        <span className="text-xs font-semibold text-[#e5e7eb]">
                          {dailyWithdrawalsAddOn ? 'Daily (+15%)' : 'Weekly (7d Wait)'}
                        </span>
                      </div>

                      {/* 8. Rewards Split (80% -> 90%) */}
                      <div className="h-[38px] flex items-center justify-between xl:justify-start">
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Rewards Split
                        </span>
                        <span className="text-xs font-bold text-[#22e57a]">
                          {spec.rewardsLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Exact Package Price + Bright Blue "Start now" CTA Button */}
                  <div className="relative z-10 px-4 pb-5 pt-1 h-[126px] flex flex-col justify-end">
                    <div className="w-full border-t border-white/[0.08] mb-3.5" />

                    {/* Price Row */}
                    <div
                      data-testid={`card-fee-${spec.size}`}
                      className="flex items-center justify-center gap-1.5 mb-3 h-7"
                    >
                      {hasPromoDiscount && <DiscountPercentBadge />}
                      <span
                        className={`text-lg sm:text-xl font-extrabold leading-none pb-0.5 tabular-nums ${
                          spec.isBestValue
                            ? 'text-[#ff7b00] border-b-2 border-dashed border-[#ff7b00]'
                            : 'text-white'
                        }`}
                      >
                        {finalFeeFormatted}
                      </span>
                      {hasPromoDiscount && (
                        <span className="text-[11px] font-semibold text-[#9ca3af] line-through tabular-nums">
                          {originalFeeFormatted}
                        </span>
                      )}
                    </div>

                    {/* Bright Blue "Start now" CTA Button */}
                    <button
                      type="button"
                      data-testid={`start-now-btn-${spec.size}`}
                      onClick={() => handleStartNow(spec)}
                      className="w-full py-2.5 px-3 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] active:scale-[0.99] text-white font-bold text-xs sm:text-[13px] transition-all shadow-[0_4px_14px_rgba(0,102,255,0.35)] cursor-pointer whitespace-nowrap"
                    >
                      Start now
                    </button>
                  </div>
                </div>

                {/* Detached Bottom Footer Card: Avg. Reward */}
                <div
                  data-testid={`avg-reward-card-${spec.size}`}
                  className="bft-package-subcard mt-3 h-[74px] rounded-2xl bg-[#111827] border border-white/[0.08] px-3 py-2.5 flex flex-col items-center justify-center text-center"
                >
                  <span className="px-2.5 py-0.5 rounded-md bg-[#161f33] text-white text-xs font-extrabold tabular-nums mb-1">
                    {avgRewardFormatted}
                  </span>
                  <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-[#9ca3af]">
                    <span>Avg. Reward</span>
                    <Info className="w-3 h-3 text-[#9ca3af] shrink-0" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Strict Risk & Auto-Graduation Summary Bar */}
        <div className="mt-10 p-4 sm:p-5 rounded-2xl bg-[#111827] border border-white/[0.08] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0066ff]/15 border border-[#0066ff]/30 flex items-center justify-center text-[#0066ff] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-white">
                Strict Funded Risk Rules (Immediate Hard Breach on Violation)
              </div>
              <div className="text-[11px] sm:text-xs text-[#9ca3af] leading-relaxed mt-0.5">
                Max <strong className="text-white">5% risk per single trade</strong> &amp;{' '}
                <strong className="text-white">5% max combined open risk</strong> of current wallet balance •{' '}
                <strong className="text-white">Max 1 open trade per currency pair</strong> •{' '}
                <strong className="text-rose-300">No Martingale &amp; No Hedging</strong> •{' '}
                <strong className="text-rose-300">10% Max Overall Loss</strong> •{' '}
                <strong className="text-emerald-300">Weekly withdrawals (7-day 1st wait, +15% for Daily)</strong>.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenRules}
              className="px-3.5 py-2 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shadow-[0_2px_10px_rgba(0,102,255,0.3)]"
            >
              Review Prop Firm Rulebook
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
