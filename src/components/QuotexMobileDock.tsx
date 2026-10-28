import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Layers,
  Clock,
  Lock,
} from 'lucide-react';
import { AssetInfo } from '../types';
import { soundEngine } from '../utils/soundEffects';

interface QuotexMobileDockProps {
  selectedAsset: AssetInfo;
  currentPrice: number;
  effectiveInvestment: number;
  duration: number;
  investment: number;
  investmentMode: 'usd' | 'percent';
  pendingOrderEnabled: boolean;
  isSoftBreached: boolean;
  isHardBreached: boolean;
  riskBarricaded: boolean;
  activeTradesCount: number;
  closedTradesCount: number;
  dailyDrawdownPercent: number;
  isTradesDrawerOpen: boolean;
  onOpenAssetModal: () => void;
  onTogglePendingTrade: () => void;
  onChangeDuration: (duration: number) => void;
  onChangeInvestment: (investment: number) => void;
  onToggleInvestmentMode: () => void;
  onTriggerTrade: (direction: 'CALL' | 'PUT') => void;
  onToggleTradesDrawer: () => void;
}

export function formatSecondsToTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:00`;
}

export const QuotexMobileDock: React.FC<QuotexMobileDockProps> = ({
  selectedAsset,
  effectiveInvestment,
  duration,
  investment,
  investmentMode,
  pendingOrderEnabled,
  isSoftBreached,
  isHardBreached,
  riskBarricaded,
  activeTradesCount,
  closedTradesCount,
  dailyDrawdownPercent,
  isTradesDrawerOpen,
  onOpenAssetModal,
  onTogglePendingTrade,
  onChangeDuration,
  onChangeInvestment,
  onToggleInvestmentMode,
  onTriggerTrade,
  onToggleTradesDrawer,
}) => {
  const potentialProfit = (effectiveInvestment * selectedAsset.payout) / 100;
  const totalPayout = effectiveInvestment + potentialProfit;

  return (
    <div
      data-testid="quotex-mobile-dock"
      className="md:hidden bg-[#0e1015] border-t border-white/10 px-2.5 py-2 z-20 shrink-0 font-mono select-none"
    >
      {/* 1. Asset Selector Bar with Payout % & PENDING TRADE Switch */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10">
        <button
          type="button"
          data-testid="mobile-dock-asset-btn"
          onClick={() => {
            soundEngine.playUiClick();
            onOpenAssetModal();
          }}
          className="flex items-center gap-1.5 text-left py-1 px-2.5 rounded-lg bg-[#161922] border border-white/10 active:bg-[#1e222d] text-white cursor-pointer"
        >
          <span className="text-xs shrink-0">{selectedAsset.flag || '📈'}</span>
          <span className="font-black text-xs tracking-tight">{selectedAsset.symbol}</span>
          <span className="text-xs font-black text-[#ff8800] ml-0.5">{selectedAsset.payout}%</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        <button
          type="button"
          data-testid="mobile-dock-pending-trade"
          onClick={() => {
            soundEngine.playUiClick();
            onTogglePendingTrade();
          }}
          className="flex items-center gap-1.5 py-1 px-2 rounded-lg bg-[#161922] border border-white/10 active:bg-[#1e222d] text-[10px] font-bold text-blue-400 cursor-pointer"
        >
          <span>PENDING TRADE</span>
          <div
            className={`w-6 h-3.5 rounded-full p-0.5 transition-colors flex items-center ${
              pendingOrderEnabled ? 'bg-[#ff8800] justify-end' : 'bg-[#2a2e39] justify-start'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
          </div>
        </button>
      </div>

      {/* 2. Side-by-Side Control Boxes (Time Box on Left, Investment Box on Right) */}
      <div className="grid grid-cols-2 gap-2 mb-1.5">
        {/* Time / Expiry Box */}
        <div className="px-2 py-1.5 rounded-xl bg-[#161922] border border-white/10">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span className="font-semibold">Time</span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                const times = [30, 60, 300, 900];
                const next = times[(times.indexOf(duration) + 1) % times.length];
                onChangeDuration(next);
              }}
              className="text-blue-400 uppercase font-black text-[9px] hover:text-blue-300 cursor-pointer"
            >
              SWITCH TIME
            </button>
          </div>
          <div className="flex items-center justify-between bg-[#0a0a0a] border border-white/10 rounded-lg px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onChangeDuration(Math.max(30, duration - (duration <= 60 ? 5 : 60)));
              }}
              className="w-6 h-6 rounded-md bg-[#1e222d] active:bg-[#2a3040] text-white font-black flex items-center justify-center text-sm cursor-pointer"
              title="Decrease Time"
            >
              -
            </button>
            <span
              data-testid="mobile-dock-time-value"
              className="font-black text-white text-xs tracking-wider"
            >
              {formatSecondsToTimer(duration)}
            </span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onChangeDuration(duration + (duration < 60 ? 5 : 60));
              }}
              className="w-6 h-6 rounded-md bg-[#1e222d] active:bg-[#2a3040] text-white font-black flex items-center justify-center text-sm cursor-pointer"
              title="Increase Time"
            >
              +
            </button>
          </div>
        </div>

        {/* Investment Box */}
        <div className="px-2 py-1.5 rounded-xl bg-[#161922] border border-white/10">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span className="font-semibold">Investment</span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onToggleInvestmentMode();
              }}
              className="text-blue-400 uppercase font-black text-[9px] hover:text-blue-300 cursor-pointer"
            >
              SWITCH
            </button>
          </div>
          <div className="flex items-center justify-between bg-[#0a0a0a] border border-white/10 rounded-lg px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onChangeInvestment(Math.max(1, investment - (investment <= 10 ? 1 : 10)));
              }}
              className="w-6 h-6 rounded-md bg-[#1e222d] active:bg-[#2a3040] text-white font-black flex items-center justify-center text-sm cursor-pointer"
              title="Decrease Investment"
            >
              -
            </button>
            <span
              data-testid="mobile-dock-investment-value"
              className="font-black text-white text-xs tracking-wider"
            >
              {investmentMode === 'usd' ? `${investment} $` : `${investment} %`}
            </span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onChangeInvestment(investment + (investment < 10 ? 1 : 10));
              }}
              className="w-6 h-6 rounded-md bg-[#1e222d] active:bg-[#2a3040] text-white font-black flex items-center justify-center text-sm cursor-pointer"
              title="Increase Investment"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 3. Live Payout Calculation Display */}
      <div
        data-testid="mobile-payout-display"
        className="flex items-center justify-between px-3 py-1 mb-1.5 rounded-lg bg-[#161922] border border-white/10 text-xs"
      >
        <span className="text-slate-400 text-[11px]">Your payout:</span>
        <div className="flex items-center gap-1.5">
          <span className="font-black text-white text-xs">{totalPayout.toFixed(2)} $</span>
          <span className="text-[10px] font-black text-[#00e676]">
            (+${potentialProfit.toFixed(2)})
          </span>
        </div>
      </div>

      {/* 4. Full-Width Side-by-Side Action Buttons: Buy & Sell */}
      {isSoftBreached ? (
        <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/60 text-center font-mono text-xs text-amber-200">
          <div className="font-black uppercase flex items-center justify-center gap-1.5 text-white">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Daily Pause (Soft Breach)</span>
          </div>
        </div>
      ) : isHardBreached ? (
        <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/60 text-center font-mono text-xs text-rose-200">
          <div className="font-black uppercase flex items-center justify-center gap-1.5 text-white">
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            <span>Terminal Locked (Hard Breach)</span>
          </div>
        </div>
      ) : riskBarricaded ? (
        <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-500 text-center text-xs text-amber-300 font-bold">
          Risk Barricade Active: Orders blocked at 80% loss threshold.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {/* Big Bright Green "Buy" Button */}
          <button
            type="button"
            data-testid="quotex-mobile-buy-btn"
            onClick={() => {
              soundEngine.playTradePlacement('CALL');
              onTriggerTrade('CALL');
            }}
            className="h-11 rounded-xl bg-[#00b865] hover:bg-[#00cf72] active:scale-[0.98] text-white font-black text-sm flex items-center justify-between px-4 cursor-pointer transition-all"
          >
            <span>Buy</span>
            <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 stroke-[3]" />
            </span>
          </button>

          {/* Big Bright Red "Sell" Button */}
          <button
            type="button"
            data-testid="quotex-mobile-sell-btn"
            onClick={() => {
              soundEngine.playTradePlacement('PUT');
              onTriggerTrade('PUT');
            }}
            className="h-11 rounded-xl bg-[#ff3d2e] hover:bg-[#ff5245] active:scale-[0.98] text-white font-black text-sm flex items-center justify-between px-4 cursor-pointer transition-all"
          >
            <span>Sell</span>
            <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5 stroke-[3]" />
            </span>
          </button>
        </div>
      )}

      {/* 5. Compact Positions & History Collapsible Trigger */}
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/10 text-[10px]">
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            onToggleTradesDrawer();
          }}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white font-bold cursor-pointer"
        >
          <Layers className="w-3 h-3 text-[#ff8800]" />
          <span>Trades ({activeTradesCount})</span>
          <span className="text-slate-500">• History ({closedTradesCount})</span>
          <ChevronUp
            className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
              isTradesDrawerOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className="text-[10px] text-slate-400">
          Daily DD:{' '}
          <span
            className={`font-black ${
              dailyDrawdownPercent >= 8 ? 'text-rose-400' : 'text-[#00e676]'
            }`}
          >
            {dailyDrawdownPercent.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
};
