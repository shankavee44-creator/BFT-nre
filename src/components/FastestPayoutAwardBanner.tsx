import React, { useState, useEffect } from 'react';
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
      { label: 'Fastest Payout Time', value: '30 seconds', highlight: 'emerald' },
      { label: 'Max Guaranteed SLA', value: '3 Minutes', highlight: 'amber' },
      { label: 'Total Funded Payouts', value: '$4,850,000+', highlight: 'white' },
    ],
    slaProof: '3-MIN SLA PROOF',
  },
  {
    id: 'best-binary-firm',
    badge: 'OFFICIAL VERIFIED AWARD: "BEST BINARY PROP FIRM 2026"',
    image: '/assets/aistudio/Gemini_Generated_Image_7qfzwq7qfzwq7qfz_b8de2414.jpg',
    title: 'Awarded as Best Binary Prop Firm 2026',
    metrics: [
      { label: 'Average Payout', value: '$2,300', highlight: 'emerald' },
      { label: 'Total Funds Funded', value: '$15M+', highlight: 'amber' },
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
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');

  // Auto-scrolling interval timer (every 5 seconds)
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      setSlideDirection('right');
      setCurrentIndex((prev) => (prev + 1) % AWARD_SLIDES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isHovered]);

  const currentSlide = AWARD_SLIDES[currentIndex];

  const handlePrev = () => {
    setSlideDirection('left');
    setCurrentIndex((prev) => (prev === 0 ? AWARD_SLIDES.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setSlideDirection('right');
    setCurrentIndex((prev) => (prev + 1) % AWARD_SLIDES.length);
  };

  return (
    <section className="py-12 sm:py-20 bg-[#070709] border-b border-white/10 relative overflow-hidden">
      {/* Background Subtle Cyber Grid & Ambient Highlights */}
      <div className="absolute inset-0 bg-cyber-grid opacity-30 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#ff8800]/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Top Header Pill */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#16120b] border border-[#ff8800]/60 text-[#ffaa00] text-xs font-mono font-black uppercase tracking-wider shadow-lg animate-bft-entry">
            <Award className="w-4 h-4 text-[#ff8800] fill-[#ff8800]" />
            <span>GLOBAL INDUSTRY RECOGNITION • 2026</span>
            <Sparkles className="w-3.5 h-3.5 text-[#ffaa00]" />
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white font-sans mt-3 tracking-tight">
            Certified Excellence & Verified Payout Speed
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-mono mt-1">
            Independently audited and recognized across global institutional prop trading networks.
          </p>
        </div>

        {/* Animated Auto-Scrolling Carousel Banner Container */}
        <div
          className="relative group rounded-3xl p-1.5 bg-gradient-to-r from-[#ff8800] via-amber-500/50 to-[#ff8800] transition-all duration-700 shadow-[0_0_50px_rgba(255,136,0,0.18)] hover:shadow-[0_0_70px_rgba(255,136,0,0.32)]"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="relative rounded-[20px] bg-[#0a0a0d] overflow-hidden border border-white/15 flex flex-col items-center">
            
            {/* Top Floating Badge Bar with Slide Indicators */}
            <div className="w-full bg-[#0e0c0a] border-b border-[#ff8800]/30 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-[#ffaa00] font-bold tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00e676] animate-ping" />
                <span>{currentSlide.badge}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-[11px]">
                <div className="flex items-center gap-1.5">
                  {AWARD_SLIDES.map((slide, idx) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => {
                        setSlideDirection(idx > currentIndex ? 'right' : 'left');
                        setCurrentIndex(idx);
                      }}
                      className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                        idx === currentIndex ? 'w-8 bg-[#ff8800] shadow-[0_0_10px_#ff8800]' : 'w-2 bg-white/25 hover:bg-white/50'
                      }`}
                      title={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
                <span className="text-slate-500 hidden sm:inline">|</span>
                <span className="hidden sm:inline font-bold text-white">TRC-20 USDT Instant Gateway</span>
              </div>
            </div>

            {/* Main Award Image with Smooth Slide/Fade Animation & Glass Shine Overlay */}
            <div className="relative w-full overflow-hidden flex items-center justify-center p-3 sm:p-6 bg-[#050507]">
              <div className="relative w-full max-w-6xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-[#0c0d12]">
                
                {/* Award Image Asset with buttery-smooth transition */}
                <div className="relative overflow-hidden group">
                  <img
                    key={currentSlide.id}
                    src={currentSlide.image}
                    alt={currentSlide.title}
                    className="w-full h-auto object-cover rounded-xl transition-all duration-700 ease-out transform hover:scale-[1.012] animate-in fade-in zoom-in-95 duration-500"
                  />
                  {/* Subtle vignette gradient overlay for cinematic look */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Animated Glass Shine Sweep Layer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none animate-pulse" />

                {/* Left/Right Carousel Navigation Arrows with Glassmorphism */}
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-black/80 hover:bg-[#ff8800] text-white hover:text-slate-950 border border-white/25 flex items-center justify-center transition-all shadow-2xl cursor-pointer opacity-75 hover:opacity-100 backdrop-blur-md active:scale-95"
                  title="Previous Award"
                >
                  <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-black/80 hover:bg-[#ff8800] text-white hover:text-slate-950 border border-white/25 flex items-center justify-center transition-all shadow-2xl cursor-pointer opacity-75 hover:opacity-100 backdrop-blur-md active:scale-95"
                  title="Next Award"
                >
                  <ChevronRight className="w-6 h-6 stroke-[2.5]" />
                </button>

                {/* Floating SLA Proof Badge */}
                <div className="absolute top-4 right-4 sm:top-6 sm:right-6 bg-black/90 backdrop-blur-md border border-[#ff8800]/80 text-white px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-mono font-black shadow-2xl">
                  <Zap className="w-4 h-4 text-[#ff8800] fill-[#ff8800] animate-bounce" />
                  <span>{currentSlide.slaProof}</span>
                </div>
              </div>
            </div>

            {/* Bottom Interactive Action & Metrics Bar */}
            <div className="w-full p-4 sm:p-6 bg-[#0d0c10] border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-xs font-mono">
                {currentSlide.metrics.map((m, i) => (
                  <div
                    key={i}
                    className="px-3.5 py-2 rounded-xl bg-[#151419] border border-white/10 text-slate-300 shadow-inner flex items-center gap-2"
                  >
                    <span className="text-slate-500">◆</span>
                    <span>{m.label}:</span>
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

              <div className="flex items-center gap-3 shrink-0">
                {onOpenWithdrawals && (
                  <button
                    type="button"
                    onClick={onOpenWithdrawals}
                    className="px-4 py-2.5 rounded-xl bg-[#181820] hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#ff8800]" />
                    <span>View Payout SLA</span>
                  </button>
                )}

                {onClaimDiscount && (
                  <button
                    type="button"
                    onClick={onClaimDiscount}
                    className="px-5 py-2.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-mono text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-lg active:scale-95"
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
