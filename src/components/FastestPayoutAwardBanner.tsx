import React from 'react';
import { Award, Zap, ShieldCheck, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

interface FastestPayoutAwardBannerProps {
  onClaimDiscount?: () => void;
  onOpenWithdrawals?: () => void;
}

export const FastestPayoutAwardBanner: React.FC<FastestPayoutAwardBannerProps> = ({
  onClaimDiscount,
  onOpenWithdrawals,
}) => {
  return (
    <section className="py-10 sm:py-16 bg-[#070709] border-b border-white/10 relative overflow-hidden">
      {/* Background Subtle Cyber Grid & Ambient Highlights */}
      <div className="absolute inset-0 bg-cyber-grid opacity-30 pointer-events-none" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#ff8800]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Top Header Pill */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#16120b] border border-[#ff8800]/60 text-[#ffaa00] text-xs font-mono font-black uppercase tracking-wider shadow-lg animate-bft-entry">
            <Award className="w-4 h-4 text-[#ff8800] fill-[#ff8800]" />
            <span>GLOBAL INDUSTRY RECOGNITION • 2026</span>
            <Sparkles className="w-3.5 h-3.5 text-[#ffaa00]" />
          </div>
        </div>

        {/* Animated Banner Container */}
        <div className="relative group rounded-3xl p-1 bg-gradient-to-r from-[#ff8800]/80 via-amber-500/40 to-[#ff8800]/80 transition-all duration-500 shadow-2xl hover:shadow-[0_0_30px_rgba(255,136,0,0.25)] animate-bft-float">
          <div className="relative rounded-[22px] bg-[#0a0a0d] overflow-hidden border border-white/10 flex flex-col items-center">
            
            {/* Top Floating Badge Bar */}
            <div className="w-full bg-[#0e0c0a] border-b border-[#ff8800]/30 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-[#ffaa00] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
                <span>OFFICIAL VERIFIED AWARD: "FASTEST PAYOUT PROP FIRM"</span>
              </div>
              <div className="flex items-center gap-4 text-slate-300 text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 30s - 3m SLA Guarantee
                </span>
                <span className="hidden sm:inline text-slate-500">|</span>
                <span className="hidden sm:inline font-bold text-white">TRC-20 USDT Automated Payouts</span>
              </div>
            </div>

            {/* Main Award Image with Smooth Ambient Floating Animation & Glass Shine Overlay */}
            <div className="relative w-full overflow-hidden flex items-center justify-center p-2 sm:p-4 bg-[#050507]">
              <div className="relative w-full max-w-6xl rounded-2xl overflow-hidden border border-white/15 shadow-2xl group-hover:border-[#ff8800]/60 transition-colors duration-300">
                
                {/* Award Image Asset */}
                <img
                  src="/assets/aistudio/Gemini_Generated_Image_cd6mk8cd6mk8cd6m_b651c85f.jpg"
                  alt="Awarded As Fastest Payout Prop Firm"
                  className="w-full h-auto object-cover rounded-xl transition-transform duration-700 ease-out group-hover:scale-[1.015]"
                />

                {/* Animated Glass Shine Sweep Layer */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                {/* Subtle Interactive Corner Badge */}
                <div className="absolute top-3 right-3 sm:top-5 sm:right-5 bg-black/85 backdrop-blur-md border border-[#ff8800]/60 text-white px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono font-black shadow-xl">
                  <Zap className="w-3.5 h-3.5 text-[#ff8800] fill-[#ff8800]" />
                  <span>3-MIN SLA PROOF</span>
                </div>
              </div>
            </div>

            {/* Bottom Interactive Action & Metrics Bar */}
            <div className="w-full p-4 sm:p-6 bg-[#0d0c10] border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-xs font-mono">
                <div className="px-3 py-1.5 rounded-xl bg-[#151419] border border-white/10 text-slate-300">
                  ⚡ Fastest Payout Time: <strong className="text-emerald-400">30 seconds</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-[#151419] border border-white/10 text-slate-300">
                  🛡️ Max Guaranteed SLA: <strong className="text-[#ffaa00]">3 Minutes</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-[#151419] border border-white/10 text-slate-300">
                  🏆 Total Funded Payouts: <strong className="text-white">$4,850,000+</strong>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {onOpenWithdrawals && (
                  <button
                    type="button"
                    onClick={onOpenWithdrawals}
                    className="px-4 py-2.5 rounded-xl bg-[#181820] hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#ff8800]" />
                    <span>View Payout SLA</span>
                  </button>
                )}

                {onClaimDiscount && (
                  <button
                    type="button"
                    onClick={onClaimDiscount}
                    className="px-5 py-2.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-mono text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                  >
                    <span>Get Funded Now</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};
