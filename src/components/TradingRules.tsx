import React, { useState } from 'react';
import {
  Shield,
  AlertTriangle,
  Clock,
  TrendingUp,
  CheckCircle,
  Ban,
  DollarSign,
  Award,
  Flame,
} from 'lucide-react';
import { checkMaxRiskPerTradeViolation } from '../utils/propRules';

export const TradingRules: React.FC = () => {
  const [testAccountSize, setTestAccountSize] = useState<number>(10000);
  const [testStake, setTestStake] = useState<number>(350);
  const [testDuration, setTestDuration] = useState<number>(60);
  const [testProfitDays, setTestProfitDays] = useState<number>(5);

  const riskCheck = checkMaxRiskPerTradeViolation(testStake, testAccountSize, 5);
  const isDurationValid = testDuration >= 30;
  const isDaysValid = testProfitDays >= 5;

  return (
    <div className="py-16 md:py-20 relative bg-[#0a0a0a] border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#16120c] border border-[#ff8800]/40 text-[#ff8800] text-xs font-bold mb-3 font-mono">
            <Shield className="w-3.5 h-3.5 text-[#ff8800]" />
            <span>BFT INSTITUTIONAL RISK ENGINE & CHALLENGE SPECIFICATIONS</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
            Strict Prop Firm Rules & Challenge Tiers
          </h2>
          <p className="text-slate-300 text-base">
            Every Binary Funded Trader account is governed by automated real-time risk guardrails, Dual-Breach protection, and verifiable certificate progression.
          </p>
        </div>

        {/* 3 Challenge Tier Specifications Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14 font-mono">
          {/* 1. One-Step Challenge */}
          <div className="p-6 rounded-3xl bg-[#111115] border border-[#ff8800]/40 shadow-xl">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-[#ff8800]/20 text-[#ffaa00] border border-[#ff8800]/30">
              1. ONE-STEP CHALLENGE
            </span>
            <h3 className="text-xl font-black text-white mt-3 mb-4 font-sans">Single Evaluation Phase</h3>
            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Profit Target:</span>
                <strong className="text-[#ffaa00]">30%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Daily Drawdown (Soft):</span>
                <strong className="text-[#ffaa00]">10%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Max Overall Drawdown:</span>
                <strong className="text-rose-400">15%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Max Risk Per Trade:</span>
                <strong className="text-rose-300">5%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Min Profitable Days:</span>
                <strong className="text-emerald-400">5 Days (≥0.5%/day)</strong>
              </li>
              <li className="pt-2 text-[11px] font-sans text-slate-400 leading-relaxed">
                Passing Step 1 issues a custom <strong>Achievement Certificate</strong>, locks the challenge account, and deploys a clean <strong>Real Account</strong> with accumulated balance.
              </li>
            </ul>
          </div>

          {/* 2. Two-Step Challenge */}
          <div className="p-6 rounded-3xl bg-[#111115] border border-[#ff8800]/40 shadow-xl">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-[#ff8800]/20 text-[#ffaa00] border border-[#ff8800]/30">
              2. TWO-STEP CHALLENGE
            </span>
            <h3 className="text-xl font-black text-white mt-3 mb-4 font-sans">Two-Phase Verification</h3>
            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Profit Targets:</span>
                <strong className="text-[#ffaa00]">Phase 1: 25% | Phase 2: 15%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Daily Drawdown (Soft):</span>
                <strong className="text-[#ffaa00]">8%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Max Overall Drawdown:</span>
                <strong className="text-rose-400">20%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Max Risk Per Trade:</span>
                <strong className="text-rose-300">5%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Min Profitable Days:</span>
                <strong className="text-emerald-400">5 Days (≥0.5%/day)</strong>
              </li>
              <li className="pt-2 text-[11px] font-sans text-slate-400 leading-relaxed">
                Passing Phase 1 locks it and deploys Phase 2. Passing Phase 2 generates an <strong>Achievement Certificate</strong> and deploys a <strong>Real Account</strong>.
              </li>
            </ul>
          </div>

          {/* 3. Instant Funded Account */}
          <div className="p-6 rounded-3xl bg-[#111115] border border-emerald-500/40 shadow-xl">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              3. INSTANT FUNDED ACCOUNT
            </span>
            <h3 className="text-xl font-black text-white mt-3 mb-4 font-sans">Direct Real Capital</h3>
            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Evaluation Phase:</span>
                <strong className="text-emerald-400">None (Direct Live)</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Daily Drawdown (Soft):</span>
                <strong className="text-[#ffaa00]">6%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Max Overall Drawdown:</span>
                <strong className="text-rose-400">12%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Max Risk Per Trade:</span>
                <strong className="text-rose-300">5%</strong>
              </li>
              <li className="flex justify-between py-1 border-b border-white/10">
                <span>Profit Split:</span>
                <strong className="text-emerald-400">80% (M1-3) → 90%</strong>
              </li>
              <li className="pt-2 text-[11px] font-sans text-slate-400 leading-relaxed">
                Skip evaluation phases completely. Trade live prop liquidity from Day 1 with weekly or optional daily withdrawals.
              </li>
            </ul>
          </div>
        </div>

        {/* 6 Core Institutional Rules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          <div className="p-6 rounded-2xl bg-[#111115] border border-white/10 hover:border-[#ff8800]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
                <Flame className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">1. Strict 5% Max Risk Per Trade</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Across all One-Step, Two-Step, and Instant Funded accounts, no single binary option contract may risk more than <strong className="text-rose-400">5% of the initial account capital</strong>. Violating 5% per-trade risk triggers a Hard Breach.
              </p>
            </div>
            <div className="text-[11px] font-mono text-rose-300 font-bold bg-rose-950/40 border border-rose-500/30 px-3 py-1.5 rounded-lg">
              Rule: Max Trade Stake ≤ 5% of Account Size
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111115] border border-white/10 hover:border-[#ff8800]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/30 flex items-center justify-center text-[#ffaa00] mb-4">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">2. 5 Min Profitable Trading Days</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Challenge phases require a minimum of <strong className="text-white">5 profitable trading days</strong>. A trading day is counted as profitable when net realized daily profit reaches at least <strong className="text-[#ffaa00]">0.5% of initial balance</strong>.
              </p>
            </div>
            <div className="text-[11px] font-mono text-[#ffaa00] font-bold bg-[#1a130a] border border-[#ff8800]/30 px-3 py-1.5 rounded-lg">
              Requirement: 5 Days with ≥ 0.5% Daily Profit
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111115] border border-white/10 hover:border-[#ff8800]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-4">
                <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">3. 80%→90% Split & 10% Payout Fee</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Traders earn <strong className="text-emerald-400">80% profit split</strong> for the first 3 months, automatically scaling to <strong className="text-[#ffaa00]">90% + Account Scaling</strong> after Month 3. A flat <strong>10% Withdrawal Fee</strong> is deducted at payout.
              </p>
            </div>
            <div className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
              Net Received: 90% of Requested Payout
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111115] border border-white/10 hover:border-[#ff8800]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/25 flex items-center justify-center text-[#ffaa00] mb-4">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">4. 30-Second Minimum Expiry</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                To prevent tick-scalping latency abuse, all binary contracts must have an expiration duration of <strong className="text-white">at least 30 seconds</strong>.
              </p>
            </div>
            <div className="text-[11px] font-mono text-[#ffaa00] font-bold bg-[#1a130a] border border-[#ff8800]/30 px-3 py-1.5 rounded-lg">
              Rule: Expiry Duration ≥ 30 Seconds
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111115] border border-white/10 hover:border-[#ff8800]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 mb-4">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">5. Soft Breach vs Hard Breach</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Exceeding Daily Drawdown causes a temporary <strong>Soft Breach</strong> (unlocks at next daily reset). Exceeding Max Overall Drawdown or 5% per-trade risk causes a permanent <strong>Hard Breach</strong> (10% Reset Courtesy offered).
              </p>
            </div>
            <div className="text-[11px] font-mono text-amber-300 font-bold bg-amber-950/40 border border-amber-500/30 px-3 py-1.5 rounded-lg">
              Protection: Dual-Breach Risk Engine
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111115] border border-white/10 hover:border-[#ff8800]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 mb-4">
                <Ban className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">6. No Martingale or Hedging</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Exponential stake doubling after losses (Martingale) or simultaneous opposing CALL/PUT positions on the same asset are automatically blocked by the terminal.
              </p>
            </div>
            <div className="text-[11px] font-mono text-rose-400 font-bold bg-rose-950/40 border border-rose-500/30 px-3 py-1.5 rounded-lg">
              Status: Real-Time Pre-Trade Guardrail
            </div>
          </div>
        </div>

        {/* Interactive Compliance Simulator */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#111115] border border-[#ff8800]/30 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-[#ff8800]/20 border border-[#ff8800]/40 flex items-center justify-center text-[#ffaa00]">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Interactive Prop Rule Compliance Simulator</h3>
              <p className="text-xs text-slate-400">
                Test your trade stake against the strict 5% Max Risk Per Trade rule, 30s expiry, and 5 profitable days requirement.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Test 1: 5% Max Risk Per Trade */}
            <div className="p-4 rounded-xl bg-[#09090c] border border-white/10">
              <div className="flex justify-between text-xs font-mono mb-2">
                <span className="text-slate-300">Account: ${testAccountSize.toLocaleString()}</span>
                <span className="text-[#ffaa00] font-bold">Stake: ${testStake} ({riskCheck.riskPercent}%)</span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="25"
                value={testStake}
                onChange={(e) => setTestStake(Number(e.target.value))}
                className="w-full accent-[#ff8800] mb-3"
              />
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Max 5% (${riskCheck.maxAllowedStake}):</span>
                <span className={`font-bold flex items-center gap-1 ${!riskCheck.violated ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {!riskCheck.violated ? <CheckCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                  {!riskCheck.violated ? 'Compliant (≤5%)' : 'Hard Breach (>5%)'}
                </span>
              </div>
            </div>

            {/* Test 2: Trade Expiry */}
            <div className="p-4 rounded-xl bg-[#09090c] border border-white/10">
              <label className="text-xs font-semibold text-slate-300 block mb-2 font-mono">
                Trade Expiry Duration: <span className="text-[#ffaa00] font-bold">{testDuration}s</span>
              </label>
              <input
                type="range"
                min="10"
                max="300"
                step="5"
                value={testDuration}
                onChange={(e) => setTestDuration(Number(e.target.value))}
                className="w-full accent-[#ff8800] mb-3"
              />
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Minimum 30s rule:</span>
                <span className={`font-bold flex items-center gap-1 ${isDurationValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isDurationValid ? <CheckCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                  {isDurationValid ? 'Compliant' : 'Rejected (<30s)'}
                </span>
              </div>
            </div>

            {/* Test 3: Profitable Days */}
            <div className="p-4 rounded-xl bg-[#09090c] border border-white/10">
              <label className="text-xs font-semibold text-slate-300 block mb-2 font-mono">
                Profitable Days (≥0.5%): <span className="text-emerald-400 font-bold">{testProfitDays} / 5 Days</span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={testProfitDays}
                onChange={(e) => setTestProfitDays(Number(e.target.value))}
                className="w-full accent-emerald-500 mb-3"
              />
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Min 5 Days to Pass:</span>
                <span className={`font-bold flex items-center gap-1 ${isDaysValid ? 'text-emerald-400' : 'text-[#ffaa00]'}`}>
                  {isDaysValid ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  {isDaysValid ? 'Certificate Ready' : `${5 - testProfitDays} More Needed`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
