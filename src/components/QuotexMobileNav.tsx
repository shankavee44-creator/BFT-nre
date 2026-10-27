import React, { useState } from 'react';
import {
  LineChart,
  Zap,
  MessageSquare,
  User,
  MoreHorizontal,
  Trophy,
  BookOpen,
  Volume2,
  VolumeX,
  Target,
  ExternalLink,
  Shield,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';
import { soundEngine } from '../utils/soundEffects';

interface QuotexMobileNavProps {
  activeTab: 'chart' | 'signals' | 'chat' | 'hub';
  onChangeTab: (tab: 'chart' | 'signals' | 'chat' | 'hub') => void;
  onOpenSignalsDrawer: () => void;
  onOpenLeaderboard: () => void;
  onOpenRules: () => void;
  onNavigateToHub: () => void;
  onResetChartPan: () => void;
  isSoundMuted: boolean;
  onToggleSound: () => void;
  signalsCount?: number;
}

export const QuotexMobileNav: React.FC<QuotexMobileNavProps> = ({
  activeTab,
  onChangeTab,
  onOpenSignalsDrawer,
  onOpenLeaderboard,
  onOpenRules,
  onNavigateToHub,
  onResetChartPan,
  isSoundMuted,
  onToggleSound,
  signalsCount = 3,
}) => {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  return (
    <>
      {/* Fixed Bottom Navigation Bar for Mobile */}
      <nav
        data-testid="quotex-mobile-nav"
        className="md:hidden flex items-center justify-around bg-[#0c0e14] border-t border-[#1e222d] py-1.5 px-1 z-40 shrink-0 select-none safe-area-pb"
      >
        {/* Chart Button */}
        <button
          type="button"
          data-testid="mobile-nav-chart"
          onClick={() => {
            onChangeTab('chart');
            soundEngine.playUiClick();
          }}
          className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 transition-colors cursor-pointer ${
            activeTab === 'chart'
              ? 'text-[#ff8800]'
              : 'text-[#848e9c] hover:text-[#d1d4dc]'
          }`}
        >
          <LineChart className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium tracking-tight">Chart</span>
        </button>

        {/* Support / Live Chat Button */}
        <button
          type="button"
          data-testid="mobile-nav-chat"
          onClick={() => {
            onChangeTab('chat');
            soundEngine.playUiClick();
          }}
          className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 relative transition-colors cursor-pointer ${
            activeTab === 'chat'
              ? 'text-[#ff8800]'
              : 'text-[#848e9c] hover:text-[#d1d4dc]'
          }`}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5 mb-0.5" />
            <span className="absolute -top-1 -right-2 bg-[#00e676] text-black text-[8px] font-black px-1 rounded-full min-w-[13px] text-center leading-3">
              1
            </span>
          </div>
          <span className="text-[10px] font-medium tracking-tight">Support</span>
        </button>

        {/* Profile / KYC Button */}
        <button
          type="button"
          data-testid="mobile-nav-hub"
          onClick={() => {
            onChangeTab('hub');
            onNavigateToHub();
            soundEngine.playUiClick();
          }}
          className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 transition-colors cursor-pointer ${
            activeTab === 'hub'
              ? 'text-[#ff8800]'
              : 'text-[#848e9c] hover:text-[#d1d4dc]'
          }`}
        >
          <User className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium tracking-tight">Profile/KYC</span>
        </button>

        {/* Leaderboard / Achievements Button */}
        <button
          type="button"
          data-testid="mobile-nav-leaderboard"
          onClick={() => {
            onOpenLeaderboard();
            soundEngine.playUiClick();
          }}
          className="flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 relative text-[#848e9c] hover:text-[#d1d4dc] transition-colors cursor-pointer"
        >
          <div className="relative">
            <Trophy className="w-5 h-5 mb-0.5" />
            <span className="absolute -top-1 -right-2.5 bg-[#ff8800] text-black text-[8px] font-black px-1 rounded-full min-w-[14px] text-center leading-3">
              20
            </span>
          </div>
          <span className="text-[10px] font-medium tracking-tight">Leaders</span>
        </button>

        {/* Signals Quick Tab */}
        <button
          type="button"
          data-testid="mobile-nav-signals"
          onClick={() => {
            onChangeTab('signals');
            onOpenSignalsDrawer();
            soundEngine.playUiClick();
          }}
          className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 relative transition-colors cursor-pointer ${
            activeTab === 'signals'
              ? 'text-[#ff8800]'
              : 'text-[#848e9c] hover:text-[#d1d4dc]'
          }`}
        >
          <div className="relative">
            <Zap className="w-5 h-5 mb-0.5" />
            {signalsCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-[#ff8800] text-black text-[9px] font-black px-1 rounded-full min-w-[14px] text-center leading-3">
                {signalsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium tracking-tight">Signals</span>
        </button>

        {/* More Menu (...) */}
        <button
          type="button"
          data-testid="mobile-nav-more"
          onClick={() => {
            setIsMoreMenuOpen(true);
            soundEngine.playUiClick();
          }}
          className="flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 text-[#848e9c] hover:text-[#d1d4dc] transition-colors cursor-pointer"
        >
          <MoreHorizontal className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium tracking-tight">More</span>
        </button>
      </nav>

      {/* Slide-Up Bottom Sheet for More Options */}
      {isMoreMenuOpen && (
        <div
          data-testid="mobile-more-sheet-overlay"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex flex-col justify-end md:hidden animate-fade-in"
          onClick={() => setIsMoreMenuOpen(false)}
        >
          <div
            data-testid="mobile-more-sheet"
            className="bg-[#12151d] border-t border-[#232733] rounded-t-2xl p-4 shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-10 h-1 bg-[#2a2e39] rounded-full mx-auto mb-3" />

            <div className="flex items-center justify-between pb-3 border-b border-[#1e222d] mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-wide">Terminal Controls & Tools</span>
                <span className="text-[10px] bg-[#ff8800]/20 text-[#ff8800] px-2 py-0.5 rounded font-mono font-semibold">BFT OTC</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen(false)}
                className="text-[#848e9c] hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Leaderboard */}
              <button
                type="button"
                data-testid="mobile-sheet-leaderboard"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onOpenLeaderboard();
                  soundEngine.playUiClick();
                }}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-[#181b24] hover:bg-[#1f2430] border border-[#232733] text-left transition-colors"
              >
                <Trophy className="w-4 h-4 text-[#ff8800] shrink-0" />
                <div>
                  <div className="font-semibold text-white">Leaderboard</div>
                  <div className="text-[10px] text-[#848e9c]">Top payouts & rank</div>
                </div>
              </button>

              {/* Trading Rules */}
              <button
                type="button"
                data-testid="mobile-sheet-rules"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onOpenRules();
                  soundEngine.playUiClick();
                }}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-[#181b24] hover:bg-[#1f2430] border border-[#232733] text-left transition-colors"
              >
                <BookOpen className="w-4 h-4 text-[#ff8800] shrink-0" />
                <div>
                  <div className="font-semibold text-white">Trading Rules</div>
                  <div className="text-[10px] text-[#848e9c]">Drawdowns & limits</div>
                </div>
              </button>

              {/* Reset Chart View */}
              <button
                type="button"
                data-testid="mobile-sheet-reset-chart"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onResetChartPan();
                  soundEngine.playUiClick();
                }}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-[#181b24] hover:bg-[#1f2430] border border-[#232733] text-left transition-colors"
              >
                <Target className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Reset Chart</div>
                  <div className="text-[10px] text-[#848e9c]">Snap to latest tick</div>
                </div>
              </button>

              {/* Sound Effects Toggle */}
              <button
                type="button"
                data-testid="mobile-sheet-sound-toggle"
                onClick={() => {
                  onToggleSound();
                  soundEngine.playUiClick();
                }}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-[#181b24] hover:bg-[#1f2430] border border-[#232733] text-left transition-colors"
              >
                {isSoundMuted ? (
                  <VolumeX className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-white">
                    Sound: {isSoundMuted ? 'Muted' : 'Active'}
                  </div>
                  <div className="text-[10px] text-[#848e9c]">Toggle FX audio</div>
                </div>
              </button>
            </div>

            {/* Quick System Status & Institutional badge */}
            <div className="mt-3 p-3 rounded-xl bg-[#0f1117] border border-[#1e222d] flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 text-[#848e9c]">
                <Shield className="w-3.5 h-3.5 text-[#ff8800]" />
                <span>BFT Ultra-Low Latency Engine</span>
              </div>
              <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                Live 60fps
              </span>
            </div>

            {/* Return to Main Portal Button */}
            <button
              type="button"
              data-testid="mobile-sheet-return-portal"
              onClick={() => {
                setIsMoreMenuOpen(false);
                onNavigateToHub();
              }}
              className="mt-3 w-full py-2.5 px-4 rounded-xl bg-[#232733] hover:bg-[#2b3040] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#848e9c]" />
              Return to Trader Portal & Dashboard
            </button>
          </div>
        </div>
      )}
    </>
  );
};
