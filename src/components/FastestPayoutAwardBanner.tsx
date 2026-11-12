import React, { useState, useEffect, useRef } from 'react';
import { Award, Zap, ShieldCheck, ArrowRight, Sparkles, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

interface FastestPayoutAwardBannerProps {
  onClaimDiscount?: () => void;
  onOpenWithdrawals?: () => void;
}

const AWARD_SLIDES = [
  {
    id: 'fastest-payout',
    badge: 'OFFICIAL VERIFIED AWARD: "FASTEST PAYOUT PROP FIRM 2026"',
    image: '/assets/aistudio/Gemini_Generated_Image_cd6mk8cd6mk8cd6m_b651c85f.jpg',
    title: 'Awarded as Fastest Payout Prop Firm',
    metrics: [
      { label: 'Fastest Payout', value: '30 seconds', highlight: 'emerald' },
      { label: 'Max SLA', value: '3 Minutes', highlight: 'amber' },
      { label: 'Total Payouts', value: '$4.85M+', highlight: 'white' },
    ],
    slaProof: '3-MIN SLA PROOF',
  },
  {
    id: 'best-binary-firm',
    badge: 'OFFICIAL VERIFIED AWARD: "BEST BINARY PROP FIRM 2026"',
    image: '/assets/aistudio/Gemini_Generated_Image_unvvjtunvvjtunvv_f0b85906.jpg',
    title: 'Awarded as Best Binary Prop Firm 2026',
    metrics: [
      { label: 'Avg Payout', value: '$2,300', highlight: 'emerald' },
      { label: 'Funds Funded', value: '$15M+', highlight: 'amber' },
      { label: 'Active Traders', value: '10K+', highlight: 'white' },
    ],
    slaProof: '10K+ ACTIVE TRADERS',
  },
];

export const FastestPayoutAwardBanner: React.FC<FastestPayoutAwardBannerProps> = ({
  onClaimDiscount,
  onOpenWithdrawals,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  // Auto-scrolling interval timer (every 5 seconds)
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % AWARD_SLIDES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isHovered]);

  const currentSlide = AWARD_SLIDES[currentIndex];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? AWARD_SLIDES.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % AWARD_SLIDES.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches[0]) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    if (e.changedTouches && e.changedTouches[0]) {
      const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
      if (Math.abs(diffX) > 40) {
        if (diffX > 0) {
          handlePrev();
        } else {
          handleNext();
        }
      }
    }
    touchStartXRef.current = null;
  };

  return (
    <section className="py-8 sm:py-20 bg-[#07090e] border-b border-white/[0.08] relative overflow-hidden">
      {/* Background Subtle Cyber Grid */}
      <div className="absolute inset-0 bg-cyber-grid opacity-20 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
        {/* Section Top Header Pill */}
        <div className="text-center mb-6 sm:mb-10 font-sans">
          <div className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full bg-[#111827] border border-[#ff8800]/60 text-[#ffaa00] text-[10px] sm:text-xs font-bold uppercase tracking-wider shadow-lg">
            <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ff8800] fill-[#ff8800]" />
            <span>GLOBAL INDUSTRY RECOGNITION • 2026</span>
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#ffaa00]" />
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-[42px] font-extrabold text-white font-sans mt-3 tracking-[-0.02em] leading-[1.12]">
            Certified Excellence &amp; Verified Payout Speed
          </h2>
          <p className="text-xs sm:text-base text-slate-200 font-medium leading-relaxed mt-2 px-2 max-w-2xl mx-auto">
            Independently audited and recognized across global institutional prop trading networks.
          </p>
        </div>

        {/* Animated Auto-Scrolling Carousel Banner Container with Touch Swipe Support */}
        <div
          className="relative group rounded-2xl sm:rounded-3xl p-1 sm:p-1.5 bg-gradient-to-r from-[#0066ff]/60 via-[#ff8800]/60 to-[#0066ff]/60 transition-all duration-700 shadow-[0_0_30px_rgba(0,102,255,0.15)] hover:shadow-[0_0_60px_rgba(0,102,255,0.28)]"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="relative rounded-[16px] sm:rounded-[20px] bg-[#0b0f19] overflow-hidden border border-white/[0.08] flex flex-col items-center">
            
            {/* Top Floating Badge Bar with Slide Indicators */}
            <div className="w-full bg-[#111827] border-b border-white/[0.08] px-3 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs font-sans">
              <div className="flex items-center gap-1.5 text-[#ffaa00] font-bold tracking-wide truncate max-w-[65%] sm:max-w-none">
                <span className="w-2 h-2 rounded-full bg-[#00e676] animate-ping shrink-0" />
                <span key={currentSlide.id} className="animate-in fade-in duration-500 truncate">
                  {currentSlide.badge}
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-[#9ca3af] text-[10px] sm:text-[11px] shrink-0">
                <div className="flex items-center gap-1.5">
                  {AWARD_SLIDES.map((slide, idx) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-2 rounded-full transition-all duration-500 cursor-pointer ${
                        idx === currentIndex ? 'w-6 sm:w-8 bg-[#0066ff] shadow-[0_0_10px_#0066ff]' : 'w-1.5 sm:w-2 bg-white/25 hover:bg-white/50'
                      }`}
                      title={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
                <span className="text-[#9ca3af] hidden sm:inline">|</span>
                <span className="hidden sm:inline font-bold text-white">TRC-20 Instant</span>
              </div>
            </div>

            {/* Main Award Image with Smooth Horizontal Sliding Marquee Container */}
            <div className="relative w-full overflow-hidden flex items-center justify-center p-2 sm:p-6 bg-[#07090e]">
              <div className="relative w-full max-w-6xl rounded-xl sm:rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#111827]">
                
                {/* Sliding Track */}
                <div
                  className="flex transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] w-full"
                  style={{ transform: `translateX(-${currentIndex * 100}%)` }}
                >
                  {AWARD_SLIDES.map((slide) => (
                    <div key={slide.id} className="w-full shrink-0 relative group/slide">
                      <img
                        src={slide.image}
                        alt={slide.title}
                        className="w-full h-auto object-cover rounded-lg sm:rounded-xl transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                    </div>
                  ))}
                </div>

                {/* Animated Glass Shine Sweep Layer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none animate-pulse" />

                {/* Left/Right Carousel Navigation Arrows (Compact on mobile) */}
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-8 sm:w-12 h-8 sm:h-12 rounded-xl sm:rounded-2xl bg-[#111827] hover:bg-[#0066ff] text-white border border-white/20 flex items-center justify-center transition-all shadow-2xl cursor-pointer z-25"
                  title="Previous Award"
                >
                  <ChevronLeft className="w-4 h-4 sm:w-6 sm:h-6 stroke-[2.5]" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-8 sm:w-12 h-8 sm:h-12 rounded-xl sm:rounded-2xl bg-[#111827] hover:bg-[#0066ff] text-white border border-white/20 flex items-center justify-center transition-all shadow-2xl cursor-pointer z-25"
                  title="Next Award"
                >
                  <ChevronRight className="w-4 h-4 sm:w-6 sm:h-6 stroke-[2.5]" />
                </button>

                {/* Floating SLA Proof / Badge */}
                <div className="absolute top-2.5 right-2.5 sm:top-6 sm:right-6 bg-[#0b0f19] border border-[#ff8800]/80 text-white px-2.5 py-1 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl flex items-center gap-1.5 text-[10px] sm:text-xs font-mono font-black shadow-2xl z-20">
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-[#ff8800] fill-[#ff8800]" />
                  <span key={currentSlide.id} className="animate-in fade-in duration-300">
                    {currentSlide.slaProof}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Interactive Action & Metrics Bar */}
            <div className="w-full p-3 sm:p-6 bg-[#111827] border-t border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
              <div
                key={currentSlide.id}
                className="flex flex-wrap items-center justify-center md:justify-start gap-2 sm:gap-3 text-[11px] sm:text-xs font-mono animate-in fade-in slide-in-from-bottom-2 duration-500 w-full md:w-auto"
              >
                {currentSlide.metrics.map((m, i) => (
                  <div
                    key={i}
                    className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#0b0f19] border border-white/[0.08] text-[#9ca3af] shadow-inner flex items-center gap-1.5 sm:gap-2 flex-1 md:flex-initial justify-center"
                  >
                    <span className="text-[#0066ff] text-[10px]">◆</span>
                    <span className="text-[#9ca3af]">{m.label}:</span>
                    <strong
                      className={
                        m.highlight === 'emerald'
                          ? 'text-emerald-400 font-black'
                          : m.highlight === 'amber'
                          ? 'text-[#ffaa00] font-black'
                          : 'text-white font-black'
                      }
                    >
                      {m.value}
                    </strong>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0 w-full md:w-auto justify-center">
                {onOpenWithdrawals && (
                  <button
                    type="button"
                    onClick={onOpenWithdrawals}
                    className="flex-1 md:flex-initial px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#0b0f19] hover:bg-[#161f33] border border-white/[0.08] text-white font-mono text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#ff8800]" />
                    <span>Payout SLA</span>
                  </button>
                )}

                {onClaimDiscount && (
                  <button
                    type="button"
                    onClick={onClaimDiscount}
                    className="flex-1 md:flex-initial px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] text-white font-mono text-[11px] sm:text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_4px_14px_rgba(0,102,255,0.35)] active:scale-95"
                  >
                    <span>Get Funded</span>
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
