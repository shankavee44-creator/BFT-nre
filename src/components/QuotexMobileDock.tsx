import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Layers,
  Clock,
  Lock,
  History,
} from 'lucide-react';
import { AssetInfo } from '../types';
import { soundEngine } from '../utils/soundEffects';
import { MobileTradesTab } from '../utils/quotexMobile';
import { AssetFlagIcon } from './CountryFlagIcon';

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
  activeTradesTab?: MobileTradesTab;
  onOpenAssetModal: () => void;
  onTogglePendingTrade: () => void;
  onChangeDuration: (duration: number) => void;
  onChangeInvestment: (investment: number) => void;
  onToggleInvestmentMode: () => void;
  onTriggerTrade: (direction: 'CALL' | 'PUT') => void;
  onToggleTradesDrawer: () => void;
  onSelectTradesTab?: (tab: MobileTradesTab) => void;
}

export function formatSecondsToTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:00`;
}

export const QuotexMobileDock: React.FC<QuotexMobileDockProps> = React.memo(({
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
  activeTradesTab = 'trades',
  onOpenAssetModal,
  onTogglePendingTrade,
  onChangeDuration,
  onChangeInvestment,
  onToggleInvestmentMode,
  onTriggerTrade,
  onToggleTradesDrawer,
  onSelectTradesTab,
}) => {
  const potentialProfit = (effectiveInvestment * selectedAsset.payout) / 100;
  const totalPayout = effectiveInvestment + potentialProfit;

  return (
    <div
      data-testid="quotex-mobile-dock"
      className="md:hidden fixed bottom-[48px] left-0 right-0 z-40 bg-[#0e1015] border-t border-white/15 px-2 py-1 shrink-0 font-mono select-none w-full max-w-[100vw] overflow-x-hidden mobile-trading-controls shadow-[0_-8px_24px_rgba(0,0,0,0.9)] space-y-1"
    >
      {/* 1. Compact Asset Selector, Inline Payout Pill & Pending Switch */}
      <div className="flex items-center justify-between gap-1.5">
        <button
          type="button"
          data-testid="mobile-dock-asset-btn"
          onClick={() => {
            soundEngine.playUiClick();
            onOpenAssetModal();
          }}
          className="flex items-center gap-1 text-left py-0.5 px-2 rounded-md bg-[#161922] border border-white/10 active:bg-[#1e222d] text-white cursor-pointer min-w-0 shrink bft-touch-scale"
        >
          <AssetFlagIcon symbol={selectedAsset.symbol} category={selectedAsset.category} flagEmoji={selectedAsset.flag} size="xs" />
          <span className="font-black text-[11px] tracking-tight truncate">{selectedAsset.symbol}</span>
          <span className="text-[10px] font-black text-[#00e676] ml-0.5 shrink-0">
            {selectedAsset.payout}%
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        </button>

        {/* Inline Compact Payout Display */}
        <div
          data-testid="mobile-payout-display"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#161922] border border-white/10 text-[9.5px] font-mono tabular-nums shrink-0"
        >
          <span className="text-slate-400 font-bold hidden xs:inline">Payout</span>
          <span className="font-black text-white text-[10.5px]">${totalPayout.toFixed(2)}</span>
          <span className="text-[9px] font-black text-[#00e676]">
            (+${potentialProfit.toFixed(2)})
          </span>
        </div>

        <button
          type="button"
          data-testid="mobile-dock-pending-trade"
          onClick={() => {
            soundEngine.playUiClick();
            onTogglePendingTrade();
          }}
          className="flex items-center gap-1 py-0.5 px-1.5 rounded-md bg-[#161922] border border-white/10 active:bg-[#1e222d] text-[9px] font-bold text-slate-300 cursor-pointer shrink-0 bft-touch-scale"
        >
          <span className="text-blue-400 font-bold text-[8.5px]">PENDING</span>
          <div
            className={`w-5 h-2.5 rounded-full p-0.5 transition-colors flex items-center ${
              pendingOrderEnabled ? 'bg-blue-500 justify-end' : 'bg-[#2a2e39] justify-start'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
        </button>
      </div>

      {/* 2. Ultra-Compact Sticky Duration & Amount Selectors */}
      <div className="grid grid-cols-2 gap-1.5">
        {/* Duration / Time Box */}
        <div className="px-1.5 py-0.5 rounded-md bg-[#161922] border border-white/10 font-mono">
          <div className="flex items-center justify-between text-[8.5px] text-slate-400 leading-tight mb-0.5">
            <span>Duration</span>
            <div className="flex gap-0.5">
              {[30, 60, 300].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    onChangeDuration(s);
                  }}
                  className={`px-1 rounded text-[8px] font-bold cursor-pointer ${
                    duration === s ? 'bg-[#ff8800] text-slate-950 font-black' : 'bg-[#0a0a0a] text-slate-300'
                  }`}
                >
                  {s >= 60 ? `${s / 60}m` : `${s}s`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between bg-[#0a0a0a] border border-white/10 rounded px-1 py-0.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onChangeDuration(Math.max(15, duration - (duration <= 60 ? 15 : 60)));
              }}
              className="w-4 h-4 rounded bg-[#1e222d] text-white font-black flex items-center justify-center text-[11px] cursor-pointer active:bg-slate-700"
            >
              -
            </button>
            <span
              data-testid="mobile-dock-time-value"
              className="font-black text-white text-[10.5px] tracking-wider tabular-nums"
            >
              {formatSecondsToTimer(duration)}
            </span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onChangeDuration(duration + (duration < 60 ? 15 : 60));
              }}
              className="w-4 h-4 rounded bg-[#1e222d] text-white font-black flex items-center justify-center text-[11px] cursor-pointer active:bg-slate-700"
            >
              +
            </button>
          </div>
        </div>

        {/* Investment / Amount Box */}
        <div className="px-1.5 py-0.5 rounded-md bg-[#161922] border border-white/10 font-mono">
          <div className="flex items-center justify-between text-[8.5px] text-slate-400 leading-tight mb-0.5">
            <span>Amount</span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onToggleInvestmentMode();
              }}
              className="text-blue-400 font-bold hover:underline cursor-pointer text-[8px]"
            >
              {investmentMode === 'usd' ? '$ → %' : '% → $'}
            </button>
          </div>
          <div className="flex items-center justify-between bg-[#0a0a0a] border border-white/10 rounded px-1 py-0.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onChangeInvestment(Math.max(1, investment - (investment <= 10 ? 1 : 10)));
              }}
              className="w-4 h-4 rounded bg-[#1e222d] text-white font-black flex items-center justify-center text-[11px] cursor-pointer active:bg-slate-700"
            >
              -
            </button>
            <div className="flex items-center gap-0.5 font-black text-white text-[10.5px]">
              <input
                aria-label="Trade Investment Amount"
                type="number"
                min={1}
                value={investment}
                onChange={(e) => onChangeInvestment(Math.max(1, Number(e.target.value)))}
                className="w-11 bg-transparent text-center focus:outline-none font-black text-white"
              />
              <span className="text-[10px] text-slate-300">{investmentMode === 'usd' ? '$' : '%'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onChangeInvestment(investment + (investment < 10 ? 1 : 10));
              }}
              className="w-4 h-4 rounded bg-[#1e222d] text-white font-black flex items-center justify-center text-[11px] cursor-pointer active:bg-slate-700"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 3. Prominent Instant-Touch Buy & Sell Action Buttons */}
      {isSoftBreached ? (
        <div className="p-1 rounded-md bg-amber-950/60 border border-amber-500/60 text-center font-mono text-[9.5px] text-amber-200">
          <div className="font-black uppercase flex items-center justify-center gap-1 text-white">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Daily Pause (Soft Breach)</span>
          </div>
        </div>
      ) : isHardBreached ? (
        <div className="p-1 rounded-md bg-rose-950/60 border border-rose-500/60 text-center font-mono text-[9.5px] text-rose-200">
          <div className="font-black uppercase flex items-center justify-center gap-1 text-white">
            <Lock className="w-3 h-3 text-rose-400" />
            <span>Terminal Locked (Hard Breach)</span>
          </div>
        </div>
      ) : riskBarricaded ? (
        <div className="p-1 rounded-md bg-amber-950/60 border border-amber-500 text-center text-[9.5px] text-amber-300 font-bold">
          Risk Barricade Active: Orders blocked at 80% loss threshold.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 font-sans">
          {/* Green "Buy" Button */}
          <button
            type="button"
            data-testid="quotex-mobile-buy-btn"
            onClick={() => {
              soundEngine.playTradePlacement('CALL');
              onTriggerTrade('CALL');
            }}
            style={{ willChange: 'transform' }}
            className="h-9 rounded-lg bg-[#00c853] hover:bg-[#00e676] active:scale-[0.98] text-white font-black text-xs flex items-center justify-between px-3 cursor-pointer transition-transform shadow-sm"
          >
            <span>Buy</span>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-3 h-3 stroke-[3]" />
            </span>
          </button>

          {/* Red "Sell" Button */}
          <button
            type="button"
            data-testid="quotex-mobile-sell-btn"
            onClick={() => {
              soundEngine.playTradePlacement('PUT');
              onTriggerTrade('PUT');
            }}
            style={{ willChange: 'transform' }}
            className="h-9 rounded-lg bg-[#ff334b] hover:bg-[#ff4d63] active:scale-[0.98] text-white font-black text-xs flex items-center justify-between px-3 cursor-pointer transition-transform shadow-sm"
          >
            <span>Sell</span>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <TrendingDown className="w-3 h-3 stroke-[3]" />
            </span>
          </button>
        </div>
      )}

      {/* 4. Compact Trades & History Drawer Toggle Bar */}
      <div className="flex items-center justify-between pt-0.5 border-t border-white/10 text-[9.5px] gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="mobile-dock-trades-tab"
            onClick={() => {
              soundEngine.playUiClick();
              if (onSelectTradesTab) {
                onSelectTradesTab('trades');
              } else {
                onToggleTradesDrawer();
              }
            }}
            className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-1 cursor-pointer transition-colors ${
              isTradesDrawerOpen && activeTradesTab === 'trades'
                ? 'bg-[#ff8800] text-slate-950 font-black'
                : activeTradesCount > 0
                ? 'active-trade-badge-pulse active-trade-badge-pulse-win bg-[#0c1a14] text-[#00e676] border border-[#00e676]/50'
                : 'bg-[#161922] text-slate-200 hover:text-white border border-white/10'
            }`}
          >
            {activeTradesCount > 0 ? (
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="active-trade-dot-pulse absolute inline-flex h-full w-full rounded-full bg-[#00e676]" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00e676]" />
              </span>
            ) : (
              <Layers className="w-2.5 h-2.5 shrink-0" />
            )}
            <span>Trades ({activeTradesCount})</span>
          </button>

          <button
            type="button"
            data-testid="mobile-dock-history-tab"
            onClick={() => {
              soundEngine.playUiClick();
              if (onSelectTradesTab) {
                onSelectTradesTab('history');
              } else {
                onToggleTradesDrawer();
              }
            }}
            className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-1 cursor-pointer transition-colors ${
              isTradesDrawerOpen && activeTradesTab === 'history'
                ? 'bg-[#ff8800] text-slate-950 font-black'
                : 'bg-[#161922] text-slate-200 hover:text-white border border-white/10'
            }`}
          >
            <History className="w-2.5 h-2.5 shrink-0" />
            <span>History ({closedTradesCount})</span>
          </button>

          <button
            type="button"
            data-testid="mobile-dock-drawer-toggle"
            aria-label="Toggle Trades and History Panel"
            onClick={() => {
              soundEngine.playUiClick();
              onToggleTradesDrawer();
            }}
            className="p-0.5 rounded bg-[#161922] border border-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <ChevronUp
              className={`w-3 h-3 transition-transform duration-200 ${
                isTradesDrawerOpen ? 'rotate-180 text-[#ff8800]' : ''
              }`}
            />
          </button>
        </div>

        <div className="text-[9px] text-slate-400 shrink-0 tabular-nums">
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
}, (prev, next) => {
  return (
    prev.selectedAsset.symbol === next.selectedAsset.symbol &&
    prev.selectedAsset.payout === next.selectedAsset.payout &&
    prev.effectiveInvestment === next.effectiveInvestment &&
    prev.duration === next.duration &&
    prev.investment === next.investment &&
    prev.investmentMode === next.investmentMode &&
    prev.pendingOrderEnabled === next.pendingOrderEnabled &&
    prev.isSoftBreached === next.isSoftBreached &&
    prev.isHardBreached === next.isHardBreached &&
    prev.riskBarricaded === next.riskBarricaded &&
    prev.activeTradesCount === next.activeTradesCount &&
    prev.closedTradesCount === next.closedTradesCount &&
    prev.dailyDrawdownPercent === next.dailyDrawdownPercent &&
    prev.isTradesDrawerOpen === next.isTradesDrawerOpen &&
    prev.activeTradesTab === next.activeTradesTab
  );
});

QuotexMobileDock.displayName = 'QuotexMobileDock';

