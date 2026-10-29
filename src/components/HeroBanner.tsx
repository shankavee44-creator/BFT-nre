import React, { useState } from 'react';
import {
  Zap,
  ShieldCheck,
  TrendingUp,
  Clock,
  Award,
  ArrowRight,
  DollarSign,
  Tag,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import { PromoCodeType } from '../types';

interface HeroBannerProps {
  activePromoCode: PromoCodeType;
  onSelectPromoCode: (code: PromoCodeType) => void;
  onSelectTier: () => void;
  onOpenTerminal: () => void;
  onOpenWithdrawals: () => void;
  onOpenAuthModal?: (mode: 'login' | 'register') => void;
  isLoggedIn?: boolean;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  activePromoCode,
  onSelectPromoCode,
  onSelectTier,
  onOpenTerminal,
  onOpenWithdrawals,
  onOpenAuthModal,
  isLoggedIn = false,
}) => {
  const img1Url = '/assets/aistudio/1793209787676.jpg_5e442646.jpeg';
  const img2Url = '/assets/aistudio/1793209776304.jpg_c5bccaaa.jpeg';

  return (
    <div className="relative overflow-hidden py-10 sm:py-16 md:py-24 border-b border-white/10 bg-[#0a0a0a] animate-bft-entry">
      {/* Animated Spooky Dual Background Image Layers */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        {/* Layer 1: Moonlit Jack-O'-Lantern & Tree */}
        <div
          className="absolute inset-0 mobile-spooky-bg-1 animate-bft-bg-1"
          style={{ backgroundImage: `url("${img1Url}")` }}
        />

        {/* Layer 2: Spooky Haunted Mansion & Graveyard */}
        <div
          className="absolute inset-0 mobile-spooky-bg-2 animate-bft-bg-2"
          style={{ backgroundImage: `url("${img2Url}")` }}
        />

        {/* Dark Radial & Vertical Gradient Vignettes for High Contrast Text Legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/80 via-[#0a0a0a]/65 to-[#0a0a0a]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/80 via-transparent to-[#0a0a0a]/80" />
        <div className="absolute inset-0 bg-cyber-grid opacity-30 mix-blend-overlay" />

        {/* Ambient Solid Orange Accent Background */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[600px] h-[200px] sm:h-[300px] bg-[#ff8800]/10 rounded-full blur-[120px] pointer-events-none" />

        {/* Floating Spooky Ember Particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-10 left-[10%] sm:left-[15%] w-2 h-2 rounded-full bg-[#ff8800] blur-[1px] animate-spooky-ember" style={{ animationDelay: '0s' }} />
          <div className="absolute bottom-20 left-[30%] sm:left-[35%] w-2.5 h-2.5 rounded-full bg-[#ffaa00] blur-[1px] animate-spooky-ember" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-12 left-[60%] sm:left-[65%] w-1.5 h-1.5 rounded-full bg-[#ff8800] blur-[1px] animate-spooky-ember" style={{ animationDelay: '4s' }} />
          <div className="absolute bottom-16 left-[85%] sm:left-[82%] w-2 h-2 rounded-full bg-[#ffbb00] blur-[1px] animate-spooky-ember" style={{ animationDelay: '1.5s' }} />
        </div>
      </div>

      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 text-center">

        {/* Top BFT Institutional Badge */}
        <div className="inline-flex flex-wrap items-center justify-center gap-2 px-5 py-2 rounded-full bg-[#12100e]/90 border border-[#ff8800]/60 mb-6 backdrop-blur-sm">
          <Zap className="w-4 h-4 text-[#ff8800] fill-[#ff8800]" />
          <span className="text-xs sm:text-sm font-black tracking-wider text-[#ff8800] uppercase font-mono">
            BFT INSTITUTIONAL PROP • 80% → 90% SCALING SPLIT
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-400 font-bold font-mono">3-MIN TRC-20 PAYOUTS</span>
        </div>

        {/* Brand Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-[1.08] mb-5">
          Trade Binary Options With{' '}
          <span className="text-[#ff8800]">
            Institutional Prop Capital
          </span>
        </h1>

        <p className="text-sm sm:text-base lg:text-lg text-slate-300 max-w-2xl mx-auto mb-6 font-normal leading-relaxed">
          Get funded up to <strong className="text-white font-bold">$100,000</strong> with{' '}
          <strong className="text-[#ff8800]">Binary Funded Trader (BFT)</strong>. Withdraw{' '}
          <strong className="text-emerald-400 font-bold">80% profit split</strong> in your first 3 months, automatically scaling to{' '}
          <strong className="text-[#ff8800] font-bold">90% profit split + Account Scaling</strong> after Month 3.
        </p>

        {/* Active Discount Promo Codes Selector Banner */}
        <div className="max-w-3xl mx-auto mb-8 p-4 rounded-2xl bg-[#111013] border border-[#ff8800]/40 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800] shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-[#ff8800] uppercase tracking-wider">
                Live Promotional Discount Applied to Packages Below
              </div>
              <div className="text-xs text-slate-300">
                Click a code to toggle live discounted package pricing across all tiers:
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 font-mono">
            <button
              onClick={() => onSelectPromoCode('SPOOKY40')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                activePromoCode === 'SPOOKY40' || activePromoCode === 'BFT40'
                  ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                  : 'bg-[#18181c] text-slate-300 border-white/10 hover:text-white'
              }`}
            >
              SPOOKY40 (40% OFF New)
            </button>
            <button
              onClick={() => onSelectPromoCode('SPOOKY20')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                activePromoCode === 'SPOOKY20' || activePromoCode === 'BFT20'
                  ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                  : 'bg-[#18181c] text-slate-300 border-white/10 hover:text-white'
              }`}
            >
              SPOOKY20 (20% OFF Existing)
            </button>
          </div>
        </div>

        {/* Double Payout Guarantee Card */}
        <div
          onClick={onOpenWithdrawals}
          className="cursor-pointer max-w-2xl mx-auto mb-10 p-4 sm:p-5 rounded-2xl bg-[#111115] border-2 border-[#ff8800]/60 hover:border-[#ffaa00] transition-colors duration-200 group"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-left">
              <div className="w-12 h-12 rounded-xl bg-[#ff8800] flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-[#ffaa00] flex items-center gap-1.5 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#ffaa00]" />
                  Contractual 3-Minute Payout Warranty
                </div>
                <div className="text-sm sm:text-base font-extrabold text-white leading-tight">
                  "We process payouts within 3 minutes; if we fail, we pay{' '}
                  <span className="text-[#ffaa00] underline decoration-[#ff8800] decoration-2 font-black">
                    double!
                  </span>
                  "
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-[#1a1610] px-4 py-2 rounded-xl border border-[#ff8800]/40 text-xs font-mono font-bold text-[#ffaa00] shrink-0">
              <span>Withdrawal Portal</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#ff8800]" />
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
          <button
            onClick={onSelectTier}
            className="px-8 py-4 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-sm sm:text-base cursor-pointer transition-colors"
          >
            Claim {activePromoCode} Discounted Challenge
          </button>
          <button
            onClick={onOpenTerminal}
            className="px-8 py-4 rounded-xl bg-[#141418] hover:bg-[#1c1c22] border border-white/15 hover:border-[#ff8800]/50 text-slate-100 hover:text-white font-bold text-sm sm:text-base transition-colors cursor-pointer flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Launch Live OTC Terminal
          </button>
          {!isLoggedIn && onOpenAuthModal && (
            <button
              onClick={() => onOpenAuthModal('login')}
              data-testid="hero-google-signin-btn"
              className="px-6 py-4 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-black text-sm sm:text-base transition-colors cursor-pointer flex items-center gap-2 font-mono"
            >
              <UserPlus className="w-4 h-4" />
              Sign in with Google
            </button>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
          <div className="p-4 rounded-xl bg-[#111115] border border-white/10 shadow-md">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#ff8800]/15 text-[#ffaa00] mx-auto mb-2 border border-[#ff8800]/30">
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">$4,850,000+</div>
            <div className="text-xs font-semibold text-slate-400 mt-1">Total Trader Payouts</div>
          </div>

          <div className="p-4 rounded-xl bg-[#111115] border border-white/10 shadow-md">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#ff8800]/15 text-[#ffaa00] mx-auto mb-2 border border-[#ff8800]/30">
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#ffaa00] font-mono">1m 42s</div>
            <div className="text-xs font-semibold text-slate-400 mt-1">Average Withdrawal Speed</div>
          </div>

          <div className="p-4 rounded-xl bg-[#111115] border border-white/10 shadow-md">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 mx-auto mb-2 border border-emerald-500/20">
              <Award className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">80% → 90%</div>
            <div className="text-xs font-semibold text-slate-400 mt-1">3-Month Scaling Profit Split</div>
          </div>

          <div className="p-4 rounded-xl bg-[#111115] border border-white/10 shadow-md">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 mx-auto mb-2 border border-emerald-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">17% + 8%</div>
            <div className="text-xs font-semibold text-slate-400 mt-1">Package & Payout Affiliate</div>
          </div>
        </div>
      </div>
    </div>
  );
};
