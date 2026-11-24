import React from 'react';
import {
  Shield,
  AlertTriangle,
  Clock,
  TrendingUp,
  Ban,
  DollarSign,
  Award,
  Flame,
  Layers,
} from 'lucide-react';
import { PACKAGES } from '../utils/propRules';

export const TradingRules: React.FC = () => {
  return (
    <div className="py-16 md:py-24 relative bg-[#0b0f19] border-b border-white/[0.08] font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#111827] border border-[#0066ff]/40 text-[#0066ff] text-xs font-bold mb-3 tracking-wide">
            <Shield className="w-3.5 h-3.5 text-[#0066ff]" />
            <span>BFT INSTITUTIONAL RISK ENGINE &amp; FUNDED CHALLENGE SPECIFICATIONS</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-[-0.025em] leading-[1.1] mb-4">
            Unified Funded Challenge &amp; Strict Risk Rules
          </h2>
          <p className="text-[#9ca3af] text-base sm:text-[17px] font-normal sm:font-medium leading-relaxed">
            Every Binary Funded Trader challenge follows one clear set of rules with automated real-time risk enforcement, immediate hard-breach protection, and instant graduation to a Real Funded account.
          </p>
        </div>

        {/* Unified Funded Challenge Overview + Package Tiers + Withdrawal Policy */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-14 font-sans">
          {/* 1. Unified Challenge Criteria */}
          <div className="p-6 rounded-3xl bg-[#111827] border border-[#38BDF8]/35 shadow-xl">
            <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded bg-[#38BDF8]/15 text-[#00e5ff] border border-[#38BDF8]/35">
              1. UNIFIED FUNDED CHALLENGE
            </span>
            <h3 className="text-xl font-extrabold text-white mt-3 mb-4 tracking-tight">Completion Criteria</h3>
            <ul className="space-y-2.5 text-xs sm:text-[13px] text-[#9ca3af] font-medium">
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Profit Target:</span>
                <strong className="text-[#00e5ff] font-bold tabular-nums">30%</strong>
              </li>
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Max Loss Limit:</span>
                <strong className="text-rose-400 font-bold tabular-nums">10% Overall (Hard Breach)</strong>
              </li>
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Min Trading Days:</span>
                <strong className="text-emerald-400 font-bold tabular-nums">5 Days (≥1% profit/day)</strong>
              </li>
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Max Risk / Trade &amp; Open:</span>
                <strong className="text-[#ffaa00] font-bold tabular-nums">5% Current Balance</strong>
              </li>
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Auto-Graduation:</span>
                <strong className="text-white font-bold">Real Funded Account</strong>
              </li>
              <li className="pt-2 text-xs font-normal text-[#9ca3af] leading-relaxed">
                Reaching <strong className="text-white font-semibold">30% profit</strong> AND completing at least{' '}
                <strong className="text-white font-semibold">5 qualifying days (≥1%/day)</strong> automatically marks the challenge <strong className="text-emerald-400">PASSED</strong> and unlocks your Real Funded account.
              </li>
            </ul>
          </div>

          {/* 2. Exact Package Sizes & Pricing */}
          <div className="p-6 rounded-3xl bg-[#111827] border border-white/[0.08] hover:border-[#0066ff]/40 transition-colors shadow-xl">
            <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded bg-[#ff8800]/20 text-[#ffaa00] border border-[#ff8800]/30">
              2. CHALLENGE PACKAGES
            </span>
            <h3 className="text-xl font-extrabold text-white mt-3 mb-4 tracking-tight">Account Sizes &amp; Fees</h3>
            <ul className="space-y-2 text-xs sm:text-[13px] text-[#9ca3af] font-medium">
              {PACKAGES.map((pkg) => (
                <li
                  key={pkg.id}
                  className="flex justify-between py-1.5 border-b border-white/[0.08] last:border-b-0"
                >
                  <span className="text-white font-bold tabular-nums">
                    ${pkg.size.toLocaleString('en-US')} Account
                  </span>
                  <strong className="text-[#ffaa00] font-extrabold tabular-nums">
                    ${pkg.price.toLocaleString('en-US')}
                  </strong>
                </li>
              ))}
            </ul>
          </div>

          {/* 3. Withdrawal Terms */}
          <div className="p-6 rounded-3xl bg-[#111827] border border-emerald-500/40 shadow-xl">
            <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              3. REAL FUNDED WITHDRAWALS
            </span>
            <h3 className="text-xl font-extrabold text-white mt-3 mb-4 tracking-tight">Payout Schedule &amp; Split</h3>
            <ul className="space-y-2.5 text-xs sm:text-[13px] text-[#9ca3af] font-medium">
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Standard Cycle:</span>
                <strong className="text-emerald-400 font-bold">Weekly (Once / Week)</strong>
              </li>
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Daily Withdrawals Add-On:</span>
                <strong className="text-[#ffaa00] font-bold">+15% Package Fee</strong>
              </li>
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>1st Withdrawal Wait:</span>
                <strong className="text-white font-bold tabular-nums">7 Days Mandatory</strong>
              </li>
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Profit Split:</span>
                <strong className="text-emerald-400 font-bold tabular-nums">80% (M1-3) → 90%</strong>
              </li>
              <li className="flex justify-between py-1.5 border-b border-white/[0.08]">
                <span>Withdrawal Fee / Min:</span>
                <strong className="text-slate-200 font-bold tabular-nums">10% Fee • $250 Min</strong>
              </li>
              <li className="pt-2 text-xs font-normal text-[#9ca3af] leading-relaxed">
                Standard funded withdrawals are processed <strong className="text-white">weekly</strong> after the{' '}
                <strong className="text-white">7-day</strong> initial waiting period. Opting for Daily Withdrawals adds <strong className="text-[#ffaa00]">+15%</strong>.
              </li>
            </ul>
          </div>
        </div>

        {/* 6 Core Institutional Rules Grid (Immediate HARD_BREACH Enforcement) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          <div className="p-6 rounded-2xl bg-[#111827] border border-white/[0.08] hover:border-rose-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
                <Flame className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">1. Max 5% Single &amp; Combined Risk</h3>
              <p className="text-xs text-[#9ca3af] leading-relaxed mb-4">
                No single trade may risk more than <strong className="text-rose-400">5% of current wallet balance</strong>, and total combined risk across all currently open trades cannot exceed <strong className="text-rose-400">5% in aggregate</strong>. Any violation triggers an immediate <strong className="text-rose-400">HARD BREACH</strong>.
              </p>
            </div>
            <div className="text-[11px] font-mono text-rose-300 font-bold bg-[#07090e] border border-rose-500/30 px-3 py-1.5 rounded-lg">
              Enforcement: Immediate HARD_BREACH
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111827] border border-white/[0.08] hover:border-rose-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">2. 10% Max Overall Account Loss</h3>
              <p className="text-xs text-[#9ca3af] leading-relaxed mb-4">
                Funded Challenge and Real Funded accounts are governed by a <strong className="text-rose-400">10% overall account loss limit</strong> (with no separate daily-only cap). Reaching 10% total drawdown immediately triggers a permanent <strong className="text-rose-400">HARD BREACH</strong>.
              </p>
            </div>
            <div className="text-[11px] font-mono text-rose-300 font-bold bg-[#07090e] border border-rose-500/30 px-3 py-1.5 rounded-lg">
              Limit: 10% Max Overall Loss → HARD_BREACH
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111827] border border-white/[0.08] hover:border-rose-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">3. Max 1 Open Trade Per Pair</h3>
              <p className="text-xs text-[#9ca3af] leading-relaxed mb-4">
                Only <strong className="text-white">one open trade is allowed per currency pair</strong> at a time. Traders may hold multiple open trades simultaneously only across different currency pairs (while staying within the 5% combined risk limit).
              </p>
            </div>
            <div className="text-[11px] font-mono text-rose-300 font-bold bg-[#07090e] border border-rose-500/30 px-3 py-1.5 rounded-lg">
              Violation: Immediate HARD_BREACH
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111827] border border-white/[0.08] hover:border-rose-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 mb-4">
                <Ban className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">4. No Martingale or Hedging</h3>
              <p className="text-xs text-[#9ca3af] leading-relaxed mb-4">
                <strong className="text-rose-400">Martingale trading</strong> (stake doubling after losses) and <strong className="text-rose-400">Hedging</strong> (opposing positions on the same currency pair) are strictly prohibited and immediately trigger a permanent <strong className="text-rose-400">HARD BREACH</strong>.
              </p>
            </div>
            <div className="text-[11px] font-mono text-rose-400 font-bold bg-[#07090e] border border-rose-500/30 px-3 py-1.5 rounded-lg">
              Violation: Immediate HARD_BREACH
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111827] border border-white/[0.08] hover:border-[#0066ff]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/30 flex items-center justify-center text-[#ffaa00] mb-4">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">5. 5 Min Profitable Days (≥1%/Day)</h3>
              <p className="text-xs text-[#9ca3af] leading-relaxed mb-4">
                Challenge graduation requires hitting the <strong className="text-white">30% profit target</strong> AND completing at least <strong className="text-white">5 qualifying trading days</strong> where each day&apos;s profit reaches at least <strong className="text-[#ffaa00]">1% of initial balance</strong>.
              </p>
            </div>
            <div className="text-[11px] font-mono text-[#ffaa00] font-bold bg-[#07090e] border border-[#ff8800]/30 px-3 py-1.5 rounded-lg">
              Auto-Pass → Real Funded Account Unlocked
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#111827] border border-white/[0.08] hover:border-[#0066ff]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#0066ff]/15 border border-[#0066ff]/30 flex items-center justify-center text-[#0066ff] mb-4">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">6. 30s Min Expiry &amp; 7-Day 1st Payout</h3>
              <p className="text-xs text-[#9ca3af] leading-relaxed mb-4">
                Funded accounts require at least a <strong className="text-white">30-second</strong> trade duration (Self-Capital allows 5s+). First funded withdrawal unlocks after <strong className="text-emerald-400">7 days</strong>, followed by <strong className="text-white">Weekly</strong> payouts (or Daily with +15% add-on).
              </p>
            </div>
            <div className="text-[11px] font-mono text-[#0066ff] font-bold bg-[#07090e] border border-[#0066ff]/30 px-3 py-1.5 rounded-lg">
              Expiry ≥ 30s • 7-Day 1st Wait • Weekly
            </div>
          </div>
        </div>

        {/* Institutional Dual Affiliate & Turnover Commission Schedule */}
        <div
          data-testid="rules-affiliate-schedule"
          className="p-6 sm:p-8 rounded-3xl bg-[#111827] border border-white/[0.08]"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-[#0066ff]/15 border border-[#0066ff]/40 flex items-center justify-center text-[#0066ff]">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Dual Affiliate Commission Structure (Funded & Self-Funded Turnover)
              </h3>
              <p className="text-xs text-[#9ca3af]">
                Multi-level commissions on Funded Challenge purchases (Basic & VIP tiers) plus automatic 5% / 7% commissions on Self-Funded trading turnover.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 font-mono text-xs">
            <div className="p-4 rounded-xl bg-[#07090e] border border-emerald-500/30">
              <div className="text-emerald-400 font-black uppercase text-[11px] mb-1">
                Level 1 (Direct Ref)
              </div>
              <div className="text-2xl font-black text-white mb-1">10% / 15%</div>
              <p className="text-[11px] text-[#9ca3af] font-sans">
                10% Basic (15% VIP after 1,000 active funded traders) on direct referral challenge purchases.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#07090e] border border-cyan-500/30">
              <div className="text-cyan-400 font-black uppercase text-[11px] mb-1">
                Level 2 (Sub-Ref)
              </div>
              <div className="text-2xl font-black text-white mb-1">5% / 8%</div>
              <p className="text-[11px] text-[#9ca3af] font-sans">
                5% Basic (8% VIP) commission on challenge purchases by your Level 2 sub-referral network.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#07090e] border border-purple-500/30">
              <div className="text-purple-400 font-black uppercase text-[11px] mb-1">
                Level 3 (Network)
              </div>
              <div className="text-2xl font-black text-white mb-1">2% / 5%</div>
              <p className="text-[11px] text-[#9ca3af] font-sans">
                2% Basic (5% VIP) commission across your Level 3 extended trader network.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#07090e] border border-[#ff8800]/60">
              <div className="text-[#ff8800] font-black uppercase text-[11px] mb-1">
                Direct Payout Bonus
              </div>
              <div className="text-2xl font-black text-[#ffaa00] mb-1">8% / 10%</div>
              <p className="text-[11px] text-[#9ca3af] font-sans">
                8% Basic (10% VIP + $10K Milestone) earned on direct referrals&apos; profit withdrawals.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#07090e] border border-[#0ecb81]/50">
              <div className="text-[#0ecb81] font-black uppercase text-[11px] mb-1">
                Self-Funded Turnover
              </div>
              <div className="text-2xl font-black text-[#0ecb81] mb-1">5% → 7%</div>
              <p className="text-[11px] text-[#9ca3af] font-sans">
                5% of trading turnover for your first 200 referred traders; 7% from your 201st trader onwards.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
