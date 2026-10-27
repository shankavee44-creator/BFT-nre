import React, { useState } from 'react';
import {
  Calculator,
  Zap,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { AccountSize, ChallengeTier, EvaluationPackage } from '../types';
import { PACKAGES } from '../utils/propRules';
import { calculateProfitSimulation } from '../utils/profitCalculator';

interface ProfitCalculatorProps {
  onSelectPackage: (pkg: EvaluationPackage) => void;
}

export const ProfitCalculator: React.FC<ProfitCalculatorProps> = ({ onSelectPackage }) => {
  const [selectedSize, setSelectedSize] = useState<AccountSize>(10000);
  const [selectedTier, setSelectedTier] = useState<ChallengeTier>('one-step');
  const [winRate, setWinRate] = useState<number>(72);
  const [tradesPerDay, setTradesPerDay] = useState<number>(5);
  const [riskPercent, setRiskPercent] = useState<number>(1.5);

  // Find matching package
  const matchedPkg =
    PACKAGES.find((p) => p.tier === selectedTier && p.size === selectedSize) ||
    PACKAGES.find((p) => p.size === selectedSize) ||
    PACKAGES[0];

  const simulation = calculateProfitSimulation({
    accountSize: selectedSize,
    winRatePercent: winRate,
    tradesPerDay,
    tradingDaysPerMonth: 20,
    riskPerTradePercent: riskPercent,
    averagePayoutPercent: 90,
    profitSplitPercent: matchedPkg.payoutSplit,
    challengeFee: matchedPkg.price,
  });

  const winRatePresets = [
    { label: '58% Baseline', value: 58 },
    { label: '65% Consistent', value: 65 },
    { label: '72% Pro Trader', value: 72 },
    { label: '80% Elite', value: 80 },
  ];

  return (
    <div className="mt-14 p-6 sm:p-10 rounded-3xl bg-[#090e1a] border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Decorative ambient lighting - Subtle Navy & Gold */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Calculator Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 pb-8 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#11192e] border border-amber-500/30 text-amber-400 text-xs font-bold mb-3 font-mono">
            <Calculator className="w-3.5 h-3.5 text-amber-400" />
            <span>INTERACTIVE FINANCIAL MODELING</span>
          </div>
          <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Profit Potential Simulator
          </h3>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl">
            Simulate your expected monthly binary options earnings based on account size, win rate, and disciplined position sizing.
          </p>
        </div>

        {/* Selected Tier Badge */}
        <div className="flex items-center gap-2 bg-[#060a14] p-2 rounded-2xl border border-slate-800 shrink-0">
          {(['one-step', 'two-step', 'instant'] as ChallengeTier[]).map((tier) => (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize font-mono ${
                selectedTier === tier
                  ? 'bg-amber-400 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tier.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Account Size Toggle */}
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2 font-mono">
              1. Choose Funded Account Capital
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {([2500, 5000, 10000, 25000, 50000, 100000] as AccountSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`p-3 rounded-xl border transition-all text-left cursor-pointer ${
                    selectedSize === size
                      ? 'bg-[#101728] border-amber-500/80 text-white shadow-lg glow-gold'
                      : 'bg-[#060a14] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[10px] text-slate-400 uppercase font-semibold font-mono">Account</div>
                  <div className="text-base font-black font-mono mt-0.5">${size >= 1000 ? `${size / 1000}k` : size}</div>
                  <div className="text-[10px] text-amber-400 font-mono mt-1 font-bold">
                    ${PACKAGES.find((p) => p.tier === selectedTier && p.size === size)?.price || 100}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Win Rate Slider & Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                2. Hypothetical Win Rate: <span className="text-emerald-400 font-mono font-black text-sm">{winRate}%</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                {simulation.winningTrades} Wins / {simulation.losingTrades} Losses
              </span>
            </div>

            <input
              type="range"
              min="50"
              max="85"
              step="1"
              value={winRate}
              onChange={(e) => setWinRate(Number(e.target.value))}
              className="w-full accent-amber-500 mb-3"
            />

            {/* Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {winRatePresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setWinRate(preset.value)}
                  className={`py-1.5 px-2 rounded-xl text-xs font-mono font-semibold transition-colors cursor-pointer border ${
                    winRate === preset.value
                      ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold shadow'
                      : 'bg-[#060a14] text-slate-300 hover:text-white border-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Controls: Trades/Day & Stake Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Trades per day */}
            <div className="p-4 rounded-2xl bg-[#060a14] border border-slate-800">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="font-semibold text-slate-300">Daily Trade Count</span>
                <span className="font-mono font-bold text-amber-400 text-sm">{tradesPerDay} Trades/day</span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                step="1"
                value={tradesPerDay}
                onChange={(e) => setTradesPerDay(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <span className="text-[10px] text-slate-400 block mt-2 font-mono">
                {simulation.totalMonthlyTrades} Total Trades/Month (20 Days)
              </span>
            </div>

            {/* Risk per trade */}
            <div className="p-4 rounded-2xl bg-[#060a14] border border-slate-800">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="font-semibold text-slate-300">Risk Stake per Trade</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {riskPercent}% (${simulation.stakePerTrade})
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.5"
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <span className="text-[10px] text-slate-400 block mt-2 font-mono">
                Compliant with 4% daily loss limits
              </span>
            </div>
          </div>

          {/* Win/Loss Bar Visualizer */}
          <div className="p-4 rounded-2xl bg-[#060a14] border border-slate-800">
            <div className="flex justify-between text-xs text-slate-400 mb-2 font-mono">
              <span className="text-emerald-400 font-bold">Winning Trades: {simulation.winningTrades}</span>
              <span className="text-rose-400 font-bold">Losing Trades: {simulation.losingTrades}</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-900 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${winRate}%` }}
              />
              <div
                className="h-full bg-rose-500 transition-all duration-300"
                style={{ width: `${100 - winRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right Output Dashboard Cards (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Main Simulated Payout Card - Matte Black with Subtle Gold Border */}
          <div className="p-6 rounded-3xl bg-[#0b1120] border-2 border-amber-500/70 shadow-2xl glow-gold text-center sm:text-left relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Trader Net Take-Home Share
              </span>
              <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {matchedPkg.payoutSplit}% Split
              </span>
            </div>

            <div className="text-4xl sm:text-5xl font-black text-white font-mono tracking-tight mb-2">
              ${simulation.traderPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-sm font-sans font-normal text-slate-300 block sm:inline sm:ml-2">/ month</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-6 font-medium">
              Net simulated monthly withdrawal based on {winRate}% win rate on a ${selectedSize.toLocaleString()} {matchedPkg.tierName} account.
            </p>

            {/* Breakdown Sub-metrics */}
            <div className="grid grid-cols-2 gap-2.5 p-3.5 rounded-2xl bg-[#060a14] border border-slate-800 mb-6 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Gross Trading Profit</span>
                <span className="font-bold text-white">${simulation.netMonthlyProfit.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Return On Fee</span>
                <span className="font-bold text-emerald-400">+{simulation.roiOnFeePercent}% ROI</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Annualized Payout</span>
                <span className="font-bold text-amber-300">
                  ${simulation.annualizedPotentialPayout.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Withdrawal Speed</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" /> &lt; 3 Minutes
                </span>
              </div>
            </div>

            {/* Instant 3-Min Withdrawal Guarantee Callout */}
            <div className="p-3 rounded-xl bg-[#091020] border border-amber-500/30 text-xs text-slate-200 flex items-center gap-2 mb-6">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 fill-amber-400" />
              <span>
                Withdraw up to <strong className="text-amber-400">${(simulation.traderPayout / 4).toFixed(0)} weekly</strong> in under 180s guaranteed!
              </span>
            </div>

            {/* Direct CTA Button - Mint Green for Instant Conversion */}
            <button
              onClick={() => onSelectPackage(matchedPkg)}
              className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl glow-mint cursor-pointer transition-all transform hover:-translate-y-0.5"
            >
              <span>Unlock ${selectedSize.toLocaleString()} Account (${matchedPkg.price} USDT)</span>
              <ArrowRight className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
