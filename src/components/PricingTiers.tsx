import React, { useState } from 'react';
import {
  Zap,
  Rocket,
  Eye,
  EyeOff,
  ArrowRight,
  Info,
  Calendar,
  Timer,
  Banknote,
  CircleDollarSign,
  Target,
  ArrowDownToLine,
  TrendingDown,
  Plus,
  ShieldCheck,
  Tag,
  CalendarClock,
  ShieldAlert,
} from 'lucide-react';
import { ChallengeTier, EvaluationPackage, PromoCodeType } from '../types';
import { PROMO_CODES } from '../utils/propRules';
import {
  PricingCurrencyCode,
  PRICING_CURRENCIES,
  getCurrencyConfig,
  getBftCardsForTier,
  formatFtmoCurrencyAmount,
  formatMetricValue,
  BftPricingCardSpec,
} from '../utils/ftmoPricingCatalog';
import { ProfitCalculator } from './ProfitCalculator';

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

const TwoStepIcon: React.FC<{ active?: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 20 20"
    className={`w-4 h-4 shrink-0 ${active ? 'text-[#0b0d13]' : 'text-white'}`}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M3 13.5L8.5 5.5L11 9.5L17 3.5L15.5 11.5L11.5 8.5L6.5 16.5L3 13.5Z" />
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
  const [selectedTier, setSelectedTier] = useState<ChallengeTier>('two-step');
  const [selectedCurrency, setSelectedCurrency] = useState<PricingCurrencyCode>('USD');
  const [showNumbers, setShowNumbers] = useState<boolean>(true);
  const [showPhases, setShowPhases] = useState<boolean>(true);
  const [isMoreCurrenciesOpen, setIsMoreCurrenciesOpen] = useState<boolean>(false);
  const [dailyWithdrawalsAddOn, setDailyWithdrawalsAddOn] = useState<boolean>(false);
  const [showSimulatorDrawer, setShowSimulatorDrawer] = useState<boolean>(false);

  const currencyCfg = getCurrencyConfig(selectedCurrency);
  const cards = getBftCardsForTier(selectedTier, activePromoCode, dailyWithdrawalsAddOn);

  const handleStartNow = (spec: BftPricingCardSpec) => {
    onSelectPackage(spec.pkg, dailyWithdrawalsAddOn);
  };

  const primaryCurrencies = PRICING_CURRENCIES.filter((c) => c.isPrimaryPill);
  const extraCurrencies = PRICING_CURRENCIES.filter((c) => !c.isPrimaryPill);
  const activePromoInfo =
    (activePromoCode && PROMO_CODES[activePromoCode]) || PROMO_CODES.SPOOKY40;

  return (
    <section
      id="pricing"
      data-testid="ftmo-pricing-section"
      className="pt-8 pb-20 md:pt-12 md:pb-28 relative bg-[#07090e] border-b border-white/[0.08] overflow-hidden select-none font-sans"
    >
      {/* Top Spotlight Beam & Conical Cyan-Blue Glow (FTMO Visual Styling) */}
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
            Choose Your Path with BFT
          </h2>
          <p className="relative z-10 text-slate-200 text-sm sm:text-base mt-3 font-medium leading-[1.65] max-w-2xl">
            Pick the way you start. All BFT accounts feature{' '}
            <strong className="text-white font-bold">80% profit split for the first 3 months</strong>, automatically upgrading to{' '}
            <strong className="text-[#ff8800] font-bold">90% profit split + Account Scaling</strong> after Month 3.
          </p>

          {/* 3-Tab Challenge Type Selector: 2-Step | 1-Step | Instant (New) */}
          <div
            role="tablist"
            aria-label="Challenge Type Selector"
            className="relative z-10 mt-7 inline-flex items-center p-1.5 rounded-2xl bg-[#111827] border border-white/[0.12] shadow-2xl"
          >
            {/* 2-Step Tab */}
            <button
              type="button"
              role="tab"
              aria-selected={selectedTier === 'two-step'}
              data-testid="tier-tab-two-step"
              onClick={() => setSelectedTier('two-step')}
              className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                selectedTier === 'two-step'
                  ? 'bg-white text-[#0b0d13] shadow-md'
                  : 'text-white hover:bg-white/5'
              }`}
            >
              <TwoStepIcon active={selectedTier === 'two-step'} />
              <span>2-Step</span>
            </button>

            {/* 1-Step Tab */}
            <button
              type="button"
              role="tab"
              aria-selected={selectedTier === 'one-step'}
              data-testid="tier-tab-one-step"
              onClick={() => setSelectedTier('one-step')}
              className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                selectedTier === 'one-step'
                  ? 'bg-white text-[#0b0d13] shadow-md'
                  : 'text-white hover:bg-white/5'
              }`}
            >
              <Rocket
                className={`w-4 h-4 shrink-0 ${
                  selectedTier === 'one-step' ? 'text-[#0b0d13]' : 'text-white'
                }`}
              />
              <span>1-Step</span>
            </button>

            <span aria-hidden="true" className="h-5 w-px bg-white/15 mx-0.5" />

            {/* Instant Tab with green "New" badge */}
            <button
              type="button"
              role="tab"
              aria-selected={selectedTier === 'instant'}
              data-testid="tier-tab-instant"
              onClick={() => setSelectedTier('instant')}
              className={`relative px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                selectedTier === 'instant'
                  ? 'bg-white text-[#0b0d13] shadow-md'
                  : 'text-white hover:bg-white/5'
              }`}
            >
              <span className="absolute -top-3 right-1.5 px-2 py-0.5 rounded-full bg-[#00c853] text-white text-[10px] font-extrabold tracking-wide shadow">
                New
              </span>
              <Zap
                className={`w-4 h-4 shrink-0 fill-current ${
                  selectedTier === 'instant' ? 'text-[#0b0d13]' : 'text-white'
                }`}
              />
              <span>Instant</span>
            </button>
          </div>
        </div>

        {/* Filter & Controls Toolbar: Currency Pills + Promo/Daily Add-on (Left) & Show Numbers / Show Phases (Right) */}
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

            {/* Original BFT Promo Code Quick Switcher (SPOOKY40 / SPOOKY20) */}
            <div className="inline-flex items-center gap-1.5 bg-[#111827] border border-white/[0.08] rounded-xl p-1">
              <Tag className="w-3.5 h-3.5 text-[#ff7b00] ml-2 shrink-0" />
              <button
                type="button"
                data-testid="promo-btn-spooky40"
                onClick={() => onSelectPromoCode('SPOOKY40')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  activePromoCode === 'SPOOKY40' || activePromoCode === 'BFT40'
                    ? 'bg-[#ff7b00] text-[#0b0d13]'
                    : 'text-[#9ca3af] hover:text-white'
                }`}
              >
                SPOOKY40 (-40%)
              </button>
              <button
                type="button"
                data-testid="promo-btn-spooky20"
                onClick={() => onSelectPromoCode('SPOOKY20')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  activePromoCode === 'SPOOKY20' || activePromoCode === 'BFT20'
                    ? 'bg-[#ff7b00] text-[#0b0d13]'
                    : 'text-[#9ca3af] hover:text-white'
                }`}
              >
                SPOOKY20 (-20%)
              </button>
            </div>

            {/* Original BFT Daily Withdrawals (+15%) Add-On Toggle */}
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
          </div>

          {/* Right: Show Numbers Switch | Show Phases Toggle | Profit Simulator -> */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 sm:gap-5">
            {/* Show Numbers Toggle Switch */}
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

            <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-white/15" />

            {/* Show Phases Button */}
            <button
              type="button"
              data-testid="toggle-show-phases"
              aria-pressed={showPhases}
              onClick={() => setShowPhases((prev) => !prev)}
              className={`flex items-center gap-2 text-xs sm:text-[13px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showPhases ? 'text-white' : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              {showPhases ? (
                <Eye className="w-4 h-4 text-slate-300" />
              ) : (
                <EyeOff className="w-4 h-4 text-[#9ca3af]" />
              )}
              <span>Show Phases</span>
            </button>

            <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-white/15" />

            {/* Profit Simulator / Rules Link */}
            <button
              type="button"
              data-testid="futures-pricing-link"
              onClick={() => setShowSimulatorDrawer((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs sm:text-[13px] font-bold text-[#0066ff] hover:text-[#1a75ff] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{showSimulatorDrawer ? 'Hide Simulator' : 'Profit Simulator'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Main FTMO-Styled Grid with All 6 Original BFT Packages ($100k, $50k, $25k, $10k Best Value, $5k, $2.5k) */}
        <div
          data-testid="ftmo-pricing-cards-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[175px_repeat(6,minmax(0,1fr))] gap-4 xl:gap-2.5 items-stretch"
        >
          {/* Left Labels Column (Desktop XL) */}
          <div className="hidden xl:flex flex-col justify-between pr-1">
            <div>
              {/* Top Header Spacer matching Account Card Header */}
              <div className="h-[108px]" />

              {/* 8 Aligned Metric Labels (including BFT's 5% Max Risk/Trade rule) */}
              <div className="py-3 space-y-0">
                <div className="h-[52px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Target className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Profit Target
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <ArrowDownToLine className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Max Daily Loss
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <TrendingDown className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Max Loss
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Max Risk / Trade
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Timer className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Min Trading days
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Trading Period
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <CircleDollarSign className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="border-b border-dotted border-slate-500 pb-0.5">
                    Refund
                  </span>
                </div>

                <div className="h-[38px] flex items-center gap-2 text-[#e5e7eb] text-[12.5px] font-bold">
                  <Banknote className="w-4 h-4 text-slate-400 shrink-0" />
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
                  One-time refundable fee
                  <br />
                  ({activePromoInfo.code}: {activePromoInfo.label})
                </span>
              </div>
              {/* Spacer matching detached Avg. Reward card */}
              <div className="h-[74px] mt-3" />
            </div>
          </div>

          {/* 6 Original BFT Pricing Cards ($100,000 | $50,000 | $25,000 | $10,000 Best Value | $5,000 | $2,500) */}
          {cards.map((spec) => {
            const formattedAccountSize = formatFtmoCurrencyAmount(
              spec.size * currencyCfg.accountMultiplier,
              currencyCfg.accountSymbol
            );

            const phase1Text =
              spec.phase1TargetPercent > 0
                ? formatMetricValue({
                    size: spec.size,
                    percent: spec.phase1TargetPercent,
                    showNumbers,
                    accountSymbol: currencyCfg.accountSymbol,
                    accountMultiplier: currencyCfg.accountMultiplier,
                  })
                : 'None (Direct Live)';

            const phase2Text =
              spec.phase2TargetPercent !== null
                ? formatMetricValue({
                    size: spec.size,
                    percent: spec.phase2TargetPercent,
                    showNumbers,
                    accountSymbol: currencyCfg.accountSymbol,
                    accountMultiplier: currencyCfg.accountMultiplier,
                  })
                : null;

            const maxDailyLossText = formatMetricValue({
              size: spec.size,
              percent: spec.maxDailyLossPercent,
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

            return (
              <div
                key={`${spec.tier}-${spec.size}`}
                data-testid={`pricing-column-${spec.size}`}
                className="flex flex-col justify-between"
              >
                {/* Upper Main Dark Card */}
                <div
                  className={`relative rounded-2xl flex-1 flex flex-col justify-between transition-all duration-200 ${
                    spec.isBestValue
                      ? 'bg-[#111827] border border-[#ff7b00]/65 shadow-[0_0_35px_rgba(255,123,0,0.12)]'
                      : 'bg-[#111827] border border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  {/* Orange "Best Value" Top Pill Badge on our popular $10,000 Card */}
                  {spec.isBestValue && (
                    <>
                      <div
                        data-testid="best-value-badge"
                        className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 px-3.5 py-0.5 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff8800] text-white text-[11px] font-extrabold tracking-wide shadow-[0_2px_12px_rgba(255,115,0,0.45)] whitespace-nowrap"
                      >
                        Best Value
                      </div>
                      {/* Subtle Warm Orange Top Radial Gradient inside Best Value Card */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-2xl bg-[radial-gradient(ellipse_at_top,rgba(205,98,18,0.42)_0%,rgba(17,24,39,0)_72%)]"
                      />
                    </>
                  )}

                  <div>
                    {/* Account Size Header */}
                    <div className="relative z-10 h-[108px] flex flex-col items-center justify-center px-3 text-center">
                      <span className="text-[11px] text-[#9ca3af] font-medium mb-1">
                        Account
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
                      {/* 1. Profit Target */}
                      <div
                        data-testid={`card-profit-target-${spec.size}`}
                        className="h-[52px] flex items-center justify-between xl:justify-start"
                      >
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Profit Target
                        </span>
                        {spec.phase1TargetPercent === 0 ? (
                          <div className="text-right xl:text-left">
                            <span className="text-xs font-extrabold text-[#22e57a] uppercase tracking-wider">
                              None (Direct Live)
                            </span>
                          </div>
                        ) : showPhases && phase2Text ? (
                          <div className="flex flex-col justify-center leading-tight text-right xl:text-left">
                            <div className="flex items-center justify-end xl:justify-start gap-1.5">
                              <span className="text-[10px] font-bold text-[#8e96a4] uppercase tracking-wider">
                                P1
                              </span>
                              <span className="text-[11.5px] font-extrabold text-white tabular-nums">
                                {phase1Text}
                              </span>
                            </div>
                            <div className="flex items-center justify-end xl:justify-start gap-1.5 mt-1">
                              <span className="text-[10px] font-bold text-[#8e96a4] uppercase tracking-wider">
                                P2
                              </span>
                              <span className="text-[11.5px] font-extrabold text-white tabular-nums">
                                {phase2Text}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end xl:justify-start gap-1.5">
                            {showPhases && (
                              <span className="text-[10px] font-bold text-[#8e96a4] uppercase tracking-wider">
                                P1
                              </span>
                            )}
                            <span className="text-xs font-extrabold text-white tabular-nums">
                              {phase2Text && !showPhases
                                ? `${phase1Text} / ${phase2Text}`
                                : phase1Text}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 2. Max Daily Loss */}
                      <div
                        data-testid={`card-daily-loss-${spec.size}`}
                        className="h-[38px] flex items-center justify-between xl:justify-start"
                      >
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Max Daily Loss
                        </span>
                        <span className="text-xs font-semibold text-[#e5e7eb] tabular-nums">
                          {maxDailyLossText}
                        </span>
                      </div>

                      {/* 3. Max Overall Loss */}
                      <div
                        data-testid={`card-max-loss-${spec.size}`}
                        className="h-[38px] flex items-center justify-between xl:justify-start"
                      >
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Max Loss
                        </span>
                        <span className="text-xs font-semibold text-[#e5e7eb] tabular-nums">
                          {maxLossText}
                        </span>
                      </div>

                      {/* 4. Max Risk Per Trade (5%) */}
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

                      {/* 5. Min Trading days */}
                      <div className="h-[38px] flex items-center justify-between xl:justify-start">
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Min Trading days
                        </span>
                        <span className="text-xs font-semibold text-[#e5e7eb]">
                          {spec.minTradingDaysLabel}
                        </span>
                      </div>

                      {/* 6. Trading Period */}
                      <div className="h-[38px] flex items-center justify-between xl:justify-start">
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Trading Period
                        </span>
                        <span className="text-xs font-semibold text-[#e5e7eb]">
                          {spec.tradingPeriodLabel}
                        </span>
                      </div>

                      {/* 7. Refund */}
                      <div className="h-[38px] flex items-center justify-between xl:justify-start">
                        <span className="xl:hidden text-xs text-slate-400 font-medium">
                          Refund
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#e5e7eb]">
                            {spec.refundLabel}
                          </span>
                          {spec.refundBadge && (
                            <span className="px-1.5 py-0.5 rounded bg-[#0c3b24] text-[#22e57a] text-[10px] font-extrabold">
                              {spec.refundBadge}
                            </span>
                          )}
                        </div>
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

                  {/* Card Footer: Original & Discounted Fee + Bright Blue "Start now" CTA Button */}
                  <div className="relative z-10 px-4 pb-5 pt-1 h-[126px] flex flex-col justify-end">
                    <div className="w-full border-t border-white/[0.08] mb-3.5" />

                    {/* Price Row (Uses exact BFT discounted price + crossed-out original price) */}
                    <div
                      data-testid={`card-fee-${spec.size}`}
                      className="flex items-center justify-center gap-1.5 mb-3 h-7"
                    >
                      <DiscountPercentBadge />
                      <span
                        className={`text-base sm:text-lg font-extrabold leading-none pb-0.5 tabular-nums ${
                          spec.isBestValue
                            ? 'text-[#ff7b00] border-b-2 border-dashed border-[#ff7b00]'
                            : 'text-white'
                        }`}
                      >
                        {finalFeeFormatted}
                      </span>
                      <span className="text-[11px] font-semibold text-[#9ca3af] line-through tabular-nums">
                        {originalFeeFormatted}
                      </span>
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
                  className="mt-3 h-[74px] rounded-2xl bg-[#111827] border border-white/[0.08] px-3 py-2.5 flex flex-col items-center justify-center text-center"
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

        {/* Optional Collapsible Profit Calculator */}
        {showSimulatorDrawer && (
          <div className="mt-10 animate-fade-in">
            <ProfitCalculator
              onSelectPackage={(pkg) => onSelectPackage(pkg, dailyWithdrawalsAddOn)}
            />
          </div>
        )}

        {/* Original BFT Progression & Rulebook Summary Bar */}
        <div className="mt-10 p-4 sm:p-5 rounded-2xl bg-[#111827] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0066ff]/15 border border-[#0066ff]/30 flex items-center justify-center text-[#0066ff] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-white">
                BFT Prop Firm Rulebook & Compliance Simulator
              </div>
              <div className="text-[11px] sm:text-xs text-[#9ca3af]">
                Inspect 5% Max Risk Per Trade, 5 Minimum Profitable Days (≥0.5%/day), 80% → 90% Scaling Split, and Soft vs Hard Breach rules.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSimulatorDrawer((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/[0.08] transition-colors cursor-pointer whitespace-nowrap"
            >
              {showSimulatorDrawer ? 'Hide Profit Simulator' : 'Open Profit Simulator'}
            </button>
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
