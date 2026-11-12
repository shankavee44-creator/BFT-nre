import React, { useState, useEffect, useCallback } from 'react';
import {
  Compass,
  TrendingUp,
  Trophy,
  CreditCard,
  Users,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  ONBOARDING_TOUR_STEPS,
  OnboardingStepId,
  resolveNextTourStepIndex,
  persistOnboardingCompletedToSupabase,
} from '../utils/onboardingTour';
import { soundEngine } from '../utils/soundEffects';

interface OnboardingTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onUpdateProfile: (updated: UserProfile) => void;
  currentTab: string;
  onNavigateTab: (tabId: string) => void;
  onOpenLeaderboard?: () => void;
  onOpenDepositModal?: () => void;
  onOpenCopyTrading?: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const STEP_ICONS: Record<OnboardingStepId, React.ReactNode> = {
  welcome: <Compass className="w-5 h-5 text-[#0066ff]" />,
  terminal: <TrendingUp className="w-5 h-5 text-[#00e676]" />,
  leaderboard: <Trophy className="w-5 h-5 text-[#ff8800]" />,
  deposits: <CreditCard className="w-5 h-5 text-[#00e676]" />,
  copy_trading: <Users className="w-5 h-5 text-[#0066ff]" />,
  security_kyc: <ShieldCheck className="w-5 h-5 text-[#ff8800]" />,
};

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onUpdateProfile,
  currentTab,
  onNavigateTab,
  onOpenLeaderboard,
  onOpenDepositModal,
  onOpenCopyTrading,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [isPersisting, setIsPersisting] = useState<boolean>(false);

  const currentStep = ONBOARDING_TOUR_STEPS[currentIndex] || ONBOARDING_TOUR_STEPS[0];
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === ONBOARDING_TOUR_STEPS.length - 1;

  // Reset to Step 1 when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
    }
  }, [isOpen]);

  // Synchronize recommended view / sub-tab when step changes so target UI elements are visible
  useEffect(() => {
    if (!isOpen) return;

    if (
      currentStep.recommendedTab &&
      currentTab !== currentStep.recommendedTab &&
      currentTab !== 'dashboard' &&
      currentTab !== 'terminal'
    ) {
      onNavigateTab(currentStep.recommendedTab);
    }

    if (currentStep.dashboardSubTab && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bft-select-dashboard-subtab', {
          detail: { subTab: currentStep.dashboardSubTab },
        })
      );
    }
  }, [isOpen, currentIndex, currentStep, currentTab, onNavigateTab]);

  // Locate and measure the target UI element for the active step
  const updateTargetSpotlight = useCallback(() => {
    if (!isOpen || typeof document === 'undefined') {
      setSpotlightRect(null);
      return;
    }

    let matchedEl: HTMLElement | null = null;
    for (const selector of currentStep.targetSelectors) {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          matchedEl = el;
          break;
        }
      }
    }

    if (!matchedEl) {
      setSpotlightRect(null);
      return;
    }

    const rect = matchedEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Scroll into view if target is outside comfortable viewport bounds
    if (rect.top < 8 || rect.bottom > vh - 8) {
      try {
        matchedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        // ignore scroll errors
      }
    }

    const updatedRect = matchedEl.getBoundingClientRect();
    const pad = 6;
    setSpotlightRect({
      top: Math.max(4, updatedRect.top - pad),
      left: Math.max(4, updatedRect.left - pad),
      width: Math.min(vw - 8, updatedRect.width + pad * 2),
      height: Math.min(vh - 8, updatedRect.height + pad * 2),
    });
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (!isOpen) return;

    const timer1 = setTimeout(updateTargetSpotlight, 60);
    const timer2 = setTimeout(updateTargetSpotlight, 260);

    window.addEventListener('resize', updateTargetSpotlight);
    window.addEventListener('scroll', updateTargetSpotlight, true);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', updateTargetSpotlight);
      window.removeEventListener('scroll', updateTargetSpotlight, true);
    };
  }, [isOpen, currentIndex, currentTab, updateTargetSpotlight]);

  const handleCompleteOrSkipTour = async () => {
    if (isPersisting) return;
    setIsPersisting(true);
    soundEngine.playUiClick();

    const updatedProfile: UserProfile = {
      ...userProfile,
      onboarding_completed: true,
      onboardingCompleted: true,
    };
    onUpdateProfile(updatedProfile);

    await persistOnboardingCompletedToSupabase({
      userId: userProfile.id,
      email: userProfile.email,
    }).catch(() => {});

    setIsPersisting(false);
    onClose();
  };

  const handleNext = () => {
    soundEngine.playUiClick();
    const { nextIndex, isCompleted } = resolveNextTourStepIndex({
      currentIndex,
      action: 'next',
    });
    if (isCompleted) {
      handleCompleteOrSkipTour();
      return;
    }
    setCurrentIndex(nextIndex);
  };

  const handleBack = () => {
    soundEngine.playUiClick();
    const { nextIndex } = resolveNextTourStepIndex({
      currentIndex,
      action: 'back',
    });
    setCurrentIndex(nextIndex);
  };

  const handleStepDotClick = (targetIdx: number) => {
    soundEngine.playUiClick();
    const { nextIndex } = resolveNextTourStepIndex({
      currentIndex,
      action: 'goto',
      targetIndex: targetIdx,
    });
    setCurrentIndex(nextIndex);
  };

  if (!isOpen) return null;

  // Compute smart tooltip position anchored near the spotlight target on desktop, or centered safely
  const getTooltipPositionClasses = (): React.CSSProperties => {
    if (typeof window === 'undefined' || !spotlightRect || window.innerWidth < 768) {
      return {};
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardWidth = 460;
    const estimatedCardHeight = 380;

    // Place below target if target is in top half, otherwise place above or centered
    const preferBelow = spotlightRect.top + spotlightRect.height + estimatedCardHeight + 28 < vh;
    const topPos = preferBelow
      ? Math.max(24, spotlightRect.top + spotlightRect.height + 16)
      : Math.max(24, Math.min(vh - estimatedCardHeight - 24, spotlightRect.top - estimatedCardHeight - 16));

    const centeredLeft = spotlightRect.left + spotlightRect.width / 2 - cardWidth / 2;
    const clampedLeft = Math.max(24, Math.min(vw - cardWidth - 24, centeredLeft));

    return {
      position: 'fixed',
      top: `${Math.round(topPos)}px`,
      left: `${Math.round(clampedLeft)}px`,
      width: `${cardWidth}px`,
    };
  };

  const desktopPositionStyle = getTooltipPositionClasses();
  const hasAnchoredPosition = Object.keys(desktopPositionStyle).length > 0;

  return (
    <div
      data-testid="onboarding-tour-overlay"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
    >
      {/* Backdrop & Spotlight Cutout */}
      <div
        className="fixed inset-0 bg-[#060911]/75 backdrop-blur-[2px]"
        onClick={handleCompleteOrSkipTour}
        aria-hidden="true"
      />
      {spotlightRect && (
        <div
          data-testid="onboarding-spotlight-ring"
          style={{
            position: 'fixed',
            top: `${spotlightRect.top}px`,
            left: `${spotlightRect.left}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
          }}
          className="rounded-xl border-2 border-[#0066ff] bg-[#0066ff]/10 shadow-[0_0_24px_rgba(0,102,255,0.5)] pointer-events-none transition-all duration-200 z-[121]"
        >
          <span className="absolute -top-6 left-0 px-2 py-0.5 rounded bg-[#0066ff] text-white text-[10px] font-mono font-bold tracking-wider whitespace-nowrap shadow-md">
            Step {currentStep.stepNumber} Focus
          </span>
        </div>
      )}

      {/* Interactive Tooltip / Modal Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-step-title"
        data-testid="onboarding-tour-dialog"
        style={hasAnchoredPosition ? desktopPositionStyle : undefined}
        className={`relative z-[122] w-full max-w-[460px] rounded-2xl bg-[#111827] border border-white/15 shadow-[0_24px_64px_rgba(0,0,0,0.85)] p-5 sm:p-6 text-white font-sans transition-all duration-200`}
      >
        {/* Top Header: Step Progress & Prominent Skip Tour Button */}
        <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span
              data-testid="onboarding-step-counter"
              className="text-xs font-mono font-bold text-[#0066ff] tabular-nums"
            >
              Step {currentStep.stepNumber} of {ONBOARDING_TOUR_STEPS.length}
            </span>
            <span className="text-white/20" aria-hidden="true">
              ·
            </span>
            {/* Interactive Step Progress Dots */}
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Onboarding Tour Steps">
              {ONBOARDING_TOUR_STEPS.map((step, idx) => {
                const isActive = idx === currentIndex;
                const isDone = idx < currentIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Go to Step ${step.stepNumber}: ${step.title}`}
                    data-testid={`onboarding-step-dot-${step.stepNumber}`}
                    onClick={() => handleStepDotClick(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      isActive
                        ? 'w-6 bg-[#0066ff]'
                        : isDone
                        ? 'w-2 bg-[#00e676]'
                        : 'w-2 bg-white/20 hover:bg-white/40'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="onboarding-skip-btn"
              onClick={handleCompleteOrSkipTour}
              className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Skip Tour
            </button>
            <button
              type="button"
              aria-label="Close Onboarding Tour"
              onClick={handleCompleteOrSkipTour}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step Content Body */}
        <div className="py-4 space-y-3.5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0b0f19] border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
              {STEP_ICONS[currentStep.id]}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-mono text-slate-400">
                {currentStep.kicker}
              </div>
              <h2
                id="onboarding-tour-step-title"
                data-testid="onboarding-step-title"
                className="text-base sm:text-lg font-bold text-white leading-snug mt-0.5"
              >
                {currentStep.title}
              </h2>
            </div>
          </div>

          <p
            data-testid="onboarding-step-description"
            className="text-xs sm:text-sm text-slate-300 leading-relaxed"
          >
            {currentStep.description}
          </p>

          {/* Key Highlights List */}
          <div className="rounded-xl bg-[#0b0f19] border border-white/[0.08] p-3.5 space-y-2">
            {currentStep.highlights.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00e676] shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Contextual Interactive Action Shortcut per Step */}
          <div className="pt-0.5 flex flex-wrap items-center gap-2">
            {currentStep.id === 'terminal' && currentTab !== 'terminal' && (
              <button
                type="button"
                data-testid="onboarding-action-open-terminal"
                onClick={() => {
                  soundEngine.playUiClick();
                  onNavigateTab('terminal');
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#00e676] hover:underline cursor-pointer"
              >
                <span>Switch to Trading Terminal View</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}

            {currentStep.id === 'leaderboard' && onOpenLeaderboard && (
              <button
                type="button"
                data-testid="onboarding-action-open-leaderboard"
                onClick={() => {
                  soundEngine.playUiClick();
                  onOpenLeaderboard();
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#ff8800] hover:underline cursor-pointer"
              >
                <span>Preview Top 15 Leaderboard</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}

            {currentStep.id === 'deposits' && onOpenDepositModal && (
              <button
                type="button"
                data-testid="onboarding-action-open-deposit"
                onClick={() => {
                  soundEngine.playUiClick();
                  onOpenDepositModal();
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#00e676] hover:underline cursor-pointer"
              >
                <span>Preview NOWPayments Deposit Modal</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}

            {currentStep.id === 'copy_trading' && onOpenCopyTrading && (
              <button
                type="button"
                data-testid="onboarding-action-open-copy"
                onClick={() => {
                  soundEngine.playUiClick();
                  onOpenCopyTrading();
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0066ff] hover:underline cursor-pointer"
              >
                <span>Open Copy Trading Hub</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}

            {currentStep.id === 'security_kyc' && (
              <button
                type="button"
                data-testid="onboarding-action-open-security"
                onClick={() => {
                  soundEngine.playUiClick();
                  if (currentTab !== 'dashboard') {
                    onNavigateTab('dashboard');
                  }
                  window.dispatchEvent(
                    new CustomEvent('bft-select-dashboard-subtab', {
                      detail: { subTab: 'security' },
                    })
                  );
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#ff8800] hover:underline cursor-pointer"
              >
                <span>Open Security &amp; 2FA Settings</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Footer Controls: Skip Tour, Back, Next / Complete Tour */}
        <div className="pt-3.5 border-t border-white/10 flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="onboarding-footer-skip-btn"
            onClick={handleCompleteOrSkipTour}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer whitespace-nowrap"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="onboarding-back-btn"
              disabled={isFirstStep}
              onClick={handleBack}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border transition-colors whitespace-nowrap ${
                isFirstStep
                  ? 'border-white/5 bg-white/[0.02] text-slate-600 cursor-not-allowed'
                  : 'border-white/15 bg-[#0b0f19] hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            {isLastStep ? (
              <button
                type="button"
                data-testid="onboarding-finish-btn"
                onClick={handleCompleteOrSkipTour}
                className="px-4 py-2 rounded-xl bg-[#00e676] hover:bg-[#00c853] text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete Tour</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="onboarding-next-btn"
                onClick={handleNext}
                className="px-4 py-2 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] text-white text-xs font-extrabold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
