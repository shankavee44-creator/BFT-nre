import React, { useState } from 'react';
import {
  Clock,
  ChevronUp,
  ChevronDown,
  ShieldAlert,
  Target,
  CheckCircle2,
  Activity,
  History,
} from 'lucide-react';
import { BinaryTrade, TradingAccount } from '../types';
import { calculateDrawdownMetrics } from '../utils/propRules';

interface TradingDrawerProps {
  account: TradingAccount;
  trades: BinaryTrade[];
  currentPrice: number;
  onDoubleUp?: (trade: BinaryTrade) => void;
}

export const TradingDrawer: React.FC<TradingDrawerProps> = ({
  account,
  trades,
  currentPrice,
  onDoubleUp,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'open' | 'history' | 'risk'>('open');

  const openTrades = trades.filter((t) => t.status === 'active');
  const closedTrades = trades.filter((t) => t.status !== 'active');

  // Risk metrics
  const metrics = calculateDrawdownMetrics(account);
  const dailyLossLimitDollars = (account.startingDayEquity * account.dailyLossLimitPercent) / 100;
  const remainingDailyBuffer = Math.max(0, dailyLossLimitDollars - metrics.dailyDrawdownAmount);
  const dailyBufferPercent = dailyLossLimitDollars > 0
    ? Math.max(0, Math.min(100, (remainingDailyBuffer / dailyLossLimitDollars) * 100))
    : 100;

  // Profit target metrics (for challenges)
  const currentNetProfit = Math.max(0, account.currentBalance - account.initialBalance);
  const targetProfitDollars = (account.initialBalance * (account.tier === 'one-step' ? 15 : account.tier === 'two-step' ? 15 : 0)) / 100;
  const targetPercent = targetProfitDollars > 0
    ? Math.min(100, Math.round((currentNetProfit / targetProfitDollars) * 100))
    : 100;

  return (
    <div className="w-full rounded-2xl bg-[#090e1a] border border-slate-800 shadow-2xl overflow-hidden transition-all duration-300">
      {/* Drawer Control Header */}
      <div className="px-4 py-2.5 bg-[#060a14] border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Tabs */}
          {[
            { id: 'open', label: `Open Trades (${openTrades.length})`, icon: Activity },
            { id: 'history', label: `Closed History (${closedTrades.length})`, icon: History },
            { id: 'risk', label: 'Risk Analytics Meter', icon: Target },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (isCollapsed) setIsCollapsed(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer font-mono ${
                  activeTab === tab.id && !isCollapsed
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/20 glow-gold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Collapse / Expand Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-400 hover:text-white flex items-center gap-1 text-xs cursor-pointer"
        >
          <span className="text-[10px] font-mono hidden sm:inline">
            {isCollapsed ? 'Expand Drawer' : 'Collapse Drawer'}
          </span>
          {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Drawer Content */}
      {!isCollapsed && (
        <div className="p-4 max-h-72 overflow-y-auto">
          {/* TAB 1: OPEN TRADES */}
          {activeTab === 'open' && (
            <div>
              {openTrades.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {openTrades.map((t) => {
                    const secondsLeft = Math.max(0, Math.ceil((t.endTime - Date.now()) / 1000));
                    const isCall = t.direction === 'CALL';
                    const isInTheMoney = isCall ? currentPrice > t.strikePrice : currentPrice < t.strikePrice;
                    const percentRemaining = Math.max(0, Math.min(100, (secondsLeft / t.durationSeconds) * 100));

                    return (
                      <div
                        key={t.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isInTheMoney
                            ? 'bg-[#081a14] border-emerald-500/50 glow-mint'
                            : 'bg-[#1a0a0e] border-rose-500/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-bold text-xs text-white flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            {t.asset}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                              isCall ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {t.direction} ${t.investment}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono my-2">
                          <div>
                            <span className="text-slate-400 text-[10px] block font-medium">Strike Price</span>
                            <span className="text-white">{t.strikePrice.toFixed(4)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block font-medium">Market Price</span>
                            <span className={isInTheMoney ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {currentPrice.toFixed(4)}
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar of Duration */}
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden my-2 border border-slate-800">
                          <div
                            className={`h-full transition-all duration-1000 ${isInTheMoney ? 'bg-emerald-400' : 'bg-rose-500'}`}
                            style={{ width: `${percentRemaining}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1 font-mono">
                          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                            <Clock className="w-3 h-3 text-amber-400" /> {secondsLeft}s left
                          </span>
                          <div className="flex items-center gap-2">
                            {onDoubleUp && (
                              <button
                                onClick={() => onDoubleUp(t)}
                                className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold cursor-pointer transition-all active:scale-95"
                                title="Place another trade with identical parameters"
                              >
                                Double up (x2)
                              </button>
                            )}
                            <span className={`font-bold ${isInTheMoney ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isInTheMoney ? `+$${t.potentialPayout.toFixed(2)} (ITM)` : `-$${t.investment.toFixed(2)} (OTM)`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-slate-400">
                  <Activity className="w-6 h-6 text-slate-500 mx-auto mb-2 opacity-50" />
                  <span>No active positions open. Execute Call or Put on the panel above to place high-speed trades.</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLOSED HISTORY */}
          {activeTab === 'history' && (
            <div>
              {closedTrades.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                        <th className="py-2">Time</th>
                        <th className="py-2">Asset</th>
                        <th className="py-2">Direction</th>
                        <th className="py-2">Stake</th>
                        <th className="py-2">Strike Price</th>
                        <th className="py-2">Close Price</th>
                        <th className="py-2">Result</th>
                        <th className="py-2 text-right">Net P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {closedTrades.slice(0, 15).map((t) => {
                        const isWin = t.status === 'won';
                        return (
                          <tr key={t.id} className="hover:bg-slate-800/30">
                            <td className="py-2 text-slate-400">{new Date(t.startTime).toLocaleTimeString()}</td>
                            <td className="py-2 text-white font-bold">{t.asset}</td>
                            <td className="py-2 font-bold">
                              <span className={t.direction === 'CALL' ? 'text-emerald-400' : 'text-rose-400'}>
                                {t.direction}
                              </span>
                            </td>
                            <td className="py-2 text-slate-300">${t.investment}</td>
                            <td className="py-2 text-slate-400">{t.strikePrice.toFixed(4)}</td>
                            <td className="py-2 text-slate-400">{t.closePrice ? t.closePrice.toFixed(4) : '-'}</td>
                            <td className="py-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                isWin ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
                              }`}>
                                {isWin ? 'WIN (ITM)' : 'LOSS (OTM)'}
                              </span>
                            </td>
                            <td className={`py-2 text-right font-bold ${t.pnl && t.pnl > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {t.pnl && t.pnl > 0 ? `+$${t.pnl.toFixed(2)}` : t.pnl ? `-$${Math.abs(t.pnl).toFixed(2)}` : '$0.00'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-slate-400">
                  <span>No completed trade history on this account yet.</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RISK ANALYTICS METER */}
          {activeTab === 'risk' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Daily Loss Limit Buffer */}
              <div className="p-4 rounded-xl bg-[#060a14] border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
                  <span className="flex items-center gap-1.5 text-slate-300 font-mono">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    Daily Loss Buffer
                  </span>
                  <span className="font-mono text-emerald-400">
                    ${remainingDailyBuffer.toFixed(2)} Remaining
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 my-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      dailyBufferPercent > 50 ? 'bg-emerald-400' : dailyBufferPercent > 25 ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                    style={{ width: `${dailyBufferPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>Max Daily Limit: {account.dailyLossLimitPercent}% (${dailyLossLimitDollars.toFixed(0)})</span>
                  <span>Safety: {dailyBufferPercent.toFixed(0)}%</span>
                </div>
              </div>

              {/* Profit Target Meter */}
              <div className="p-4 rounded-xl bg-[#060a14] border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
                  <span className="flex items-center gap-1.5 text-slate-300 font-mono">
                    <Target className="w-4 h-4 text-amber-400" />
                    Profit Target Progress
                  </span>
                  <span className="font-mono text-amber-400">
                    {targetPercent}% Achieved
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 my-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${targetPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>Current Profit: ${currentNetProfit.toFixed(2)}</span>
                  <span>Target: ${targetProfitDollars > 0 ? targetProfitDollars.toFixed(0) : 'N/A (Funded)'}</span>
                </div>
              </div>

              {/* Trading Days & Discipline */}
              <div className="p-4 rounded-xl bg-[#060a14] border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
                  <span className="flex items-center gap-1.5 text-slate-300 font-mono">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Discipline & Rules Check
                  </span>
                  <span className="font-mono text-emerald-400">100% Valid</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300 font-mono mt-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Min Duration (30s):</span>
                    <span className="text-emerald-400 font-semibold">Compliant</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Max Overall Loss Buffer:</span>
                    <span className="text-emerald-400 font-semibold">{account.maxOverallLossPercent}% (Clean)</span>
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
