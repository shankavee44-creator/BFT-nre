import React, { useState, useEffect } from 'react';
import {
  Clock,
  ChevronUp,
  ChevronDown,
  ShieldAlert,
  Target,
  CheckCircle2,
  Activity,
  History,
  X,
} from 'lucide-react';
import { BinaryTrade, TradingAccount } from '../types';
import { calculateDrawdownMetrics } from '../utils/propRules';
import { DEFAULT_ASSETS, findAssetBySymbol } from '../utils/storage';
import { getAssetMarketState } from '../utils/priceFeedEngine';
import { AssetFlagIcon } from './CountryFlagIcon';

interface TradingDrawerProps {
  account: TradingAccount;
  trades: BinaryTrade[];
  currentPrice: number;
  onDoubleUp?: (trade: BinaryTrade) => void;
  onSettleTrade?: (trade: BinaryTrade) => void;
  onInspectClosedTrade?: (trade: BinaryTrade) => void;
  initialTab?: 'open' | 'history' | 'risk';
  onTabChange?: (tab: 'open' | 'history' | 'risk') => void;
  onClose?: () => void;
}

export const TradingDrawer: React.FC<TradingDrawerProps> = ({
  account,
  trades,
  currentPrice,
  onDoubleUp,
  onSettleTrade,
  onInspectClosedTrade,
  initialTab = 'open',
  onTabChange,
  onClose,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'open' | 'history' | 'risk'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
    setIsCollapsed(false);
  }, [initialTab]);

  const openTrades = trades.filter((t) => t.status === 'active');
  const closedTrades = trades
    .filter((t) => t.status !== 'active')
    .sort((a, b) => b.endTime - a.endTime);

  // Risk metrics
  const metrics = calculateDrawdownMetrics(account);
  const dailyLossLimitDollars = (account.startingDayEquity * account.dailyLossLimitPercent) / 100;
  const remainingDailyBuffer = Math.max(0, dailyLossLimitDollars - metrics.dailyDrawdownAmount);
  const dailyBufferPercent =
    dailyLossLimitDollars > 0
      ? Math.max(0, Math.min(100, (remainingDailyBuffer / dailyLossLimitDollars) * 100))
      : 100;

  // Profit target metrics (for challenges)
  const currentNetProfit = Math.max(0, account.currentBalance - account.initialBalance);
  const targetProfitDollars =
    (account.initialBalance *
      (account.tier === 'one-step' ? 15 : account.tier === 'two-step' ? 15 : 0)) /
    100;
  const targetPercent =
    targetProfitDollars > 0
      ? Math.min(100, Math.round((currentNetProfit / targetProfitDollars) * 100))
      : 100;

  const handleSelectTab = (tabId: 'open' | 'history' | 'risk') => {
    setActiveTab(tabId);
    if (isCollapsed) setIsCollapsed(false);
    onTabChange?.(tabId);
  };

  return (
    <div
      data-testid="trading-drawer-panel"
      className="w-full bg-[#0e1016] border-t border-white/15 overflow-hidden select-none font-mono"
    >
      {/* Drawer Control Header */}
      <div className="px-3 py-2 bg-[#0a0a0a] border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            {
              id: 'open' as const,
              testId: 'drawer-tab-trades',
              label: `Trades (${openTrades.length})`,
              icon: Activity,
            },
            {
              id: 'history' as const,
              testId: 'drawer-tab-history',
              label: `History (${closedTrades.length})`,
              icon: History,
            },
            {
              id: 'risk' as const,
              testId: 'drawer-tab-risk',
              label: 'Risk Meter',
              icon: Target,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id && !isCollapsed;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={tab.testId}
                onClick={() => handleSelectTab(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#ff8800] text-slate-950 font-black'
                    : 'text-slate-400 hover:text-white bg-[#141720] border border-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="drawer-collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg bg-[#141720] hover:bg-[#1c202c] border border-white/10 text-slate-400 hover:text-white flex items-center gap-1 text-xs cursor-pointer"
            title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
          >
            <span className="text-[10px] hidden sm:inline">
              {isCollapsed ? 'Expand' : 'Collapse'}
            </span>
            {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {onClose && (
            <button
              type="button"
              data-testid="drawer-close-btn"
              onClick={onClose}
              aria-label="Close trades drawer"
              className="p-1.5 rounded-lg bg-[#141720] hover:bg-[#1c202c] border border-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Drawer Content */}
      {!isCollapsed && (
        <div className="p-2 sm:p-3 max-h-[60vh] md:max-h-56 overflow-y-auto bg-[#0e1016]">
          {/* TAB 1: OPEN TRADES */}
          {activeTab === 'open' && (
            <div data-testid="drawer-open-trades-content">
              {openTrades.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {openTrades.map((t) => {
                    const secondsLeft = Math.max(0, Math.ceil((t.endTime - Date.now()) / 1000));
                    const isCall = t.direction === 'CALL';
                    const assetObj = findAssetBySymbol(t.asset);
                    const tradeMarket = getAssetMarketState(t.asset);
                    const livePrice = tradeMarket?.lastPrice ?? t.strikePrice;
                    const isInTheMoney = isCall ? livePrice > t.strikePrice : livePrice < t.strikePrice;
                    const percentRemaining = Math.max(
                      0,
                      Math.min(100, (secondsLeft / t.durationSeconds) * 100)
                    );

                    return (
                      <div
                        key={t.id}
                        data-testid={`open-trade-card-${t.id}`}
                        className={`p-2 rounded-xl border transition-colors ${
                          isInTheMoney
                            ? 'bg-[#081a14] border-[#00e676]/50'
                            : 'bg-[#1a0a0e] border-[#ff334b]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[11px] text-white flex items-center gap-1.5 truncate">
                            <AssetFlagIcon symbol={t.asset} category={assetObj?.category} flagEmoji={assetObj?.flag} size="xs" />
                            <span className="truncate">{t.asset}</span>
                          </span>
                          <span
                            className={`text-[9.5px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                              isCall
                                ? 'bg-emerald-500/20 text-[#00e676] border border-[#00e676]/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {isCall ? '▲ BUY' : '▼ SELL'} ${t.investment}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1 text-[10.5px] my-1 font-mono">
                          <div>
                            <span className="text-slate-400 text-[9px] block">Strike</span>
                            <span className="text-white tabular-nums">{t.strikePrice.toFixed(assetObj.pipDecimals)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 text-[9px] block">Current</span>
                            <span
                              className={`tabular-nums font-bold ${
                                isInTheMoney ? 'text-[#00e676]' : 'text-rose-400'
                              }`}
                            >
                              {livePrice.toFixed(assetObj.pipDecimals)}
                            </span>
                          </div>
                        </div>

                        <div className="w-full h-1 bg-[#141720] rounded-full overflow-hidden my-1">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isInTheMoney ? 'bg-[#00e676]' : 'bg-[#ff334b]'
                            }`}
                            style={{ width: `${percentRemaining}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10.5px] pt-0.5 font-mono">
                          <span className="text-slate-300 flex items-center gap-1 font-bold tabular-nums">
                            <Clock className="w-3 h-3 text-[#ff8800]" /> {secondsLeft}s
                          </span>
                          <div className="flex items-center gap-1">
                            <span
                              data-testid={`trade-locked-badge-${t.id}`}
                              className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-white/10 text-[8.5px] font-bold uppercase tracking-wider"
                              title="Trades are strictly locked until full expiration duration is met"
                            >
                              LOCKED
                            </span>
                            {onDoubleUp && (
                              <button
                                type="button"
                                onClick={() => onDoubleUp(t)}
                                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/15 text-white border border-white/20 text-[9px] font-bold cursor-pointer"
                                title="Place another trade with identical parameters"
                              >
                                x2
                              </button>
                            )}
                            <span
                              className={`font-black tabular-nums ${
                                isInTheMoney ? 'text-[#00e676]' : 'text-rose-400'
                              }`}
                            >
                              {isInTheMoney
                                ? `+$${t.potentialPayout.toFixed(2)}`
                                : `-$${t.investment.toFixed(2)}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-5 text-xs text-slate-400">
                  <Activity className="w-5 h-5 text-slate-500 mx-auto mb-1.5 opacity-60" />
                  <span>No active positions open. Tap Buy or Sell to execute an OTC trade.</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLOSED HISTORY (Quotex Clean Date Grouped Format) */}
          {activeTab === 'history' && (
            <div data-testid="drawer-history-content">
              {closedTrades.length > 0 ? (
                <div className="space-y-2">
                  {(() => {
                    const groups = closedTrades.slice(0, 30).reduce((acc, t) => {
                      const dateStr = new Date(t.endTime || t.startTime)
                        .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                        .toUpperCase();
                      if (!acc[dateStr]) acc[dateStr] = [];
                      acc[dateStr].push(t);
                      return acc;
                    }, {} as Record<string, typeof closedTrades>);

                    return Object.entries(groups).map(([dateLabel, items]) => (
                      <div key={dateLabel} className="space-y-1">
                        {/* Section Header Date Badge */}
                        <div className="flex items-center justify-center my-1">
                          <div className="px-2.5 py-0.5 rounded-full bg-[#1c202e] border border-[#2a2e39] text-[9px] font-black text-slate-400 font-mono tracking-wider flex items-center gap-1.5">
                            <span>{dateLabel}</span>
                            <span className="w-3.5 h-3.5 rounded-full bg-[#262b3d] text-white flex items-center justify-center text-[8px] font-bold">
                              {items.length}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                          {items.map((t) => {
                            const isWin = t.status === 'won';
                            const isTie = t.status === 'tie';
                            const isCall = t.direction === 'CALL';
                            const assetObj = findAssetBySymbol(t.asset);
                            const netPnl = t.pnl ?? (isWin ? (t.investment * t.payoutPercentage) / 100 : isTie ? 0 : -t.investment);

                            return (
                              <div
                                key={t.id}
                                data-testid={`history-trade-row-${t.id}`}
                                onClick={() => onInspectClosedTrade?.(t)}
                                className="p-2 rounded-xl bg-[#141720] hover:bg-[#191d28] border border-white/10 flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 font-bold text-white text-[10.5px]">
                                    <span
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        isWin ? 'bg-[#00e676]' : isTie ? 'bg-amber-400' : 'bg-[#ff334b]'
                                      }`}
                                    />
                                    <AssetFlagIcon symbol={t.asset} category={assetObj?.category} flagEmoji={assetObj?.flag} size="xs" />
                                    <span className="truncate">{t.asset}</span>
                                    <span className="text-[9.5px] text-[#ff8800] font-black shrink-0">
                                      {t.payoutPercentage}%
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 mt-0.5 tabular-nums">
                                    <span className={isCall ? 'text-[#00e676] font-bold' : 'text-rose-400 font-bold'}>
                                      {isCall ? '▲ Buy' : '▼ Sell'} ${t.investment}
                                    </span>
                                    <span>·</span>
                                    <span>
                                      {new Date(t.endTime || t.startTime).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0 tabular-nums">
                                  <div
                                    className={`font-black text-[11px] ${
                                      isWin ? 'text-[#00e676]' : isTie ? 'text-amber-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {isWin
                                      ? `+$${Math.abs(netPnl).toFixed(2)}`
                                      : isTie
                                      ? '±$0.00'
                                      : `-$${Math.abs(t.investment).toFixed(2)}`}
                                  </div>
                                  <div className="text-[9px] text-slate-500">
                                    {isWin
                                      ? `Payout: $${(t.investment + Math.abs(netPnl)).toFixed(2)}`
                                      : isTie
                                      ? `Refund: $${t.investment.toFixed(2)}`
                                      : '$0.00'}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className="text-center py-5 text-xs text-slate-400">
                  <History className="w-5 h-5 text-slate-500 mx-auto mb-1.5 opacity-60" />
                  <span>No completed trade history on this account yet.</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RISK ANALYTICS METER */}
          {activeTab === 'risk' && (
            <div data-testid="drawer-risk-content" className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-[#141720] border border-white/10">
                <div className="flex items-center justify-between text-xs font-bold text-white mb-1.5">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#ff8800]" />
                    Daily Loss Buffer
                  </span>
                  <span className="text-[#00e676] tabular-nums">
                    ${remainingDailyBuffer.toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-2 bg-[#0a0a0a] rounded-full overflow-hidden border border-white/10 my-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      dailyBufferPercent > 50
                        ? 'bg-[#00e676]'
                        : dailyBufferPercent > 25
                        ? 'bg-[#ff8800]'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${dailyBufferPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 tabular-nums">
                  <span>
                    Limit: {account.dailyLossLimitPercent}% (${dailyLossLimitDollars.toFixed(0)})
                  </span>
                  <span>Safety: {dailyBufferPercent.toFixed(0)}%</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#141720] border border-white/10">
                <div className="flex items-center justify-between text-xs font-bold text-white mb-1.5">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Target className="w-3.5 h-3.5 text-[#ff8800]" />
                    Profit Target
                  </span>
                  <span className="text-[#ff8800] tabular-nums">{targetPercent}%</span>
                </div>
                <div className="w-full h-2 bg-[#0a0a0a] rounded-full overflow-hidden border border-white/10 my-1.5">
                  <div
                    className="h-full rounded-full bg-[#ff8800] transition-all duration-300"
                    style={{ width: `${targetPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 tabular-nums">
                  <span>Profit: ${currentNetProfit.toFixed(2)}</span>
                  <span>
                    Target: ${targetProfitDollars > 0 ? targetProfitDollars.toFixed(0) : 'Unrestricted'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#141720] border border-white/10">
                <div className="flex items-center justify-between text-xs font-bold text-white mb-1.5">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00e676]" />
                    Execution Status
                  </span>
                  <span className="text-[#00e676]">Compliant</span>
                </div>
                <div className="space-y-1 text-[10px] text-slate-300 mt-1.5 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Min Duration (30s):</span>
                    <span className="text-[#00e676] font-bold">Active</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Max Overall Loss:</span>
                    <span className="text-[#00e676] font-bold">
                      {account.maxOverallLossPercent > 0 ? `${account.maxOverallLossPercent}%` : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

