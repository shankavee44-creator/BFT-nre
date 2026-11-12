import React, { useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { PromoCodeType } from '../types';

export const HERO_BACKGROUND_VIDEO_SRC =
  '/assets/aistudio/Santa_Claus_riding_sleigh_ce499b44_1080p_fa553f65.mp4';

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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) {
      vid.muted = true;
      vid.defaultMuted = true;
      vid.play().catch(() => {
        // Autoplay fallback if browser defers until interaction
      });
    }
  }, []);

  return (
    <section
      data-testid="hero-section"
      className="relative overflow-hidden py-10 sm:py-16 md:py-24 border-b border-white/[0.08] bg-[#0b0f19] animate-bft-entry"
    >
      {/* Full-Screen Background Video Container (z-0, pointer-events-none) */}
      <div
        data-testid="hero-video-container"
        className="absolute inset-0 z-0 w-full h-full pointer-events-none overflow-hidden select-none"
      >
        <video
          ref={videoRef}
          data-testid="hero-background-video"
          src={HERO_BACKGROUND_VIDEO_SRC}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        >
          <source src={HERO_BACKGROUND_VIDEO_SRC} type="video/mp4" />
        </video>

        {/* High-Contrast Dark Scrims for 100% Foreground Readability */}
        <div
          data-testid="hero-video-overlay"
          className="absolute inset-0 bg-[#07090e]/75 pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0f19]/85 via-[#07090e]/65 to-[#0b0f19] pointer-events-none" />
        <div className="absolute inset-0 bg-cyber-grid opacity-15 pointer-events-none" />
      </div>

      {/* Foreground Hero Content (z-10) */}
      <div
        data-testid="hero-foreground-content"
        className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 text-center font-sans"
      >
        {/* Top BFT Institutional Badge */}
        <div className="inline-flex flex-wrap items-center justify-center gap-2 px-5 py-2 rounded-full bg-[#111827] border border-[#ff8800]/60 mb-6">
          <Zap className="w-4 h-4 text-[#ff8800] fill-[#ff8800]" />
          <span className="text-xs sm:text-sm font-extrabold tracking-wider text-[#ff8800] uppercase">
            BFT INSTITUTIONAL PROP • 80% → 90% SCALING SPLIT
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
            3-MIN TRC-20 PAYOUTS
          </span>
        </div>

        {/* Brand Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-[-0.02em] text-white max-w-4xl mx-auto leading-[1.1] mb-5 font-sans">
          Trade Binary Options With{' '}
          <span className="text-[#ff8800]">
            Institutional Prop Capital
          </span>
        </h1>

        <p className="text-sm sm:text-base lg:text-lg text-slate-200 max-w-2xl mx-auto mb-6 font-medium leading-relaxed">
          Get funded up to <strong className="text-white font-bold">$100,000</strong> with{' '}
          <strong className="text-[#ff8800] font-bold">Binary Funded Trader (BFT)</strong>. Withdraw{' '}
          <strong className="text-emerald-400 font-bold">80% profit split</strong> in your first 3 months, automatically scaling to{' '}
          <strong className="text-[#ff8800] font-bold">90% profit split + Account Scaling</strong> after Month 3.
        </p>

        {/* Active Discount Promo Codes Selector Banner */}
        <div className="max-w-3xl mx-auto mb-8 p-4 rounded-2xl bg-[#111827] border border-[#ff8800]/40 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800] shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#ff8800] uppercase tracking-wider">
                Live Promotional Discount Applied to Packages Below
              </div>
              <div className="text-xs text-slate-200 font-medium">
                Click a code to toggle live discounted package pricing across all tiers:
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onSelectPromoCode('SPOOKY40')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                activePromoCode === 'SPOOKY40' || activePromoCode === 'BFT40'
                  ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                  : 'bg-[#0b0f19] text-slate-200 border-white/[0.12] hover:text-white'
              }`}
            >
              SPOOKY40 (40% OFF New)
            </button>
            <button
              onClick={() => onSelectPromoCode('SPOOKY20')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                activePromoCode === 'SPOOKY20' || activePromoCode === 'BFT20'
                  ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                  : 'bg-[#0b0f19] text-slate-200 border-white/[0.12] hover:text-white'
              }`}
            >
              SPOOKY20 (20% OFF Existing)
            </button>
          </div>
        </div>

        {/* Double Payout Guarantee Card */}
        <div
          onClick={onOpenWithdrawals}
          className="cursor-pointer max-w-2xl mx-auto mb-10 p-4 sm:p-5 rounded-2xl bg-[#111827] border-2 border-[#ff8800]/60 hover:border-[#ffaa00] transition-colors duration-200 group"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-left">
              <div className="w-12 h-12 rounded-xl bg-[#ff8800] flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#ffaa00] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#ffaa00]" />
                  <span>Contractual 3-Minute Payout Warranty</span>
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

            <div className="flex items-center gap-2 bg-[#0b0f19] px-4 py-2 rounded-xl border border-[#ff8800]/40 text-xs font-bold text-[#ffaa00] shrink-0">
              <span>Withdrawal Portal</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#ff8800]" />
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
          <button
            onClick={onSelectTier}
            className="px-8 py-4 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] text-white font-extrabold text-sm sm:text-base shadow-[0_4px_18px_rgba(0,102,255,0.35)] cursor-pointer transition-colors"
          >
            Claim {activePromoCode} Discounted Challenge
          </button>
          <button
            onClick={onOpenTerminal}
            className="px-8 py-4 rounded-xl bg-[#111827] hover:bg-[#161f33] border border-white/[0.12] hover:border-white/25 text-white font-bold text-sm sm:text-base transition-colors cursor-pointer flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Launch Live OTC Terminal</span>
          </button>
          {!isLoggedIn && onOpenAuthModal && (
            <button
              onClick={() => onOpenAuthModal('register')}
              data-testid="hero-auth-register-btn"
              className="px-6 py-4 rounded-xl bg-[#111827] hover:bg-[#161f33] border border-[#0066ff]/50 hover:border-[#0066ff] text-white font-extrabold text-sm sm:text-base transition-colors cursor-pointer flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4 text-[#0066ff]" />
              <span>Register Trader Account</span>
            </button>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
          <div className="p-4 sm:p-5 rounded-2xl bg-[#111827] border border-white/[0.12] shadow-md">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#0066ff]/15 text-[#0066ff] mx-auto mb-2.5 border border-[#0066ff]/30">
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums">$4,850,000+</div>
            <div className="text-xs font-semibold text-slate-200 mt-1">Total Trader Payouts</div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#111827] border border-white/[0.12] shadow-md">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#ff8800]/15 text-[#ffaa00] mx-auto mb-2.5 border border-[#ff8800]/30">
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#ffaa00] tracking-tight tabular-nums">1m 42s</div>
            <div className="text-xs font-semibold text-slate-200 mt-1">Average Withdrawal Speed</div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#111827] border border-white/[0.12] shadow-md">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 mx-auto mb-2.5 border border-emerald-500/20">
              <Award className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums">80% → 90%</div>
            <div className="text-xs font-semibold text-slate-200 mt-1">3-Month Scaling Profit Split</div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#111827] border border-white/[0.12] shadow-md">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 mx-auto mb-2.5 border border-emerald-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight tabular-nums">17% + 8%</div>
            <div className="text-xs font-semibold text-slate-200 mt-1">Package &amp; Payout Affiliate</div>
          </div>
        </div>
      </div>
    </section>
  );
};
