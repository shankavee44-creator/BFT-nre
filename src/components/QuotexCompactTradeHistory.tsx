import React, { useState, useEffect } from 'react';
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Repeat,
  Activity,
  History as HistoryIcon,
  Crosshair,
} from 'lucide-react';
import { BinaryTrade } from '../types';
import { findAssetBySymbol } from '../utils/storage';
import { getAssetMarketState } from '../utils/priceFeedEngine';
import { liveMarketFeed } from '../utils/liveMarketFeed';
import { isTradeActiveOrOpen, resolveOptimisticTradeResult } from '../utils/supabaseTradeSync';
import { AssetFlagIcon } from './CountryFlagIcon';
import { soundEngine } from '../utils/soundEffects';

export interface QuotexCompactTradeHistoryProps {
  trades: BinaryTrade[];
  currentPrice: number;
  selectedAssetSymbol?: string;
  onDoubleUp?: (trade: BinaryTrade) => void;
  onSelectTradeForChart?: (trade: BinaryTrade) => void;
  initialTab?: 'trades' | 'history';
  onTabChange?: (tab: 'trades' | 'history') => void;
  className?: string;
}

/**
 * Formats duration seconds into HH:MM:SS format (e.g., 5s -> "00:00:05", 60s -> "00:01:00").
 */
export function formatDurationToClock(durationSeconds: number): string {
  const secs = Math.max(0, Math.floor(durationSeconds || 0));
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const remSecs = secs % 60;

  const hh = hrs.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  const ss = remSecs.toString().padStart(2, '0');

  return hrs > 0 ? `${hh}:${mm}:${ss}` : `00:${mm}:${ss}`;
}

/**
 * Formats date into uppercase Quotex date string e.g. "5 NOVEMBER 24".
 */
export function formatDateGroupTitle(timestampMs: number): string {
  if (!timestampMs || isNaN(timestampMs)) return 'TODAY';
  const date = new Date(timestampMs);
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' }).toUpperCase();
  const year = date.getFullYear().toString().slice(-2);
  return `${day} ${month} ${year}`;
}

export const QuotexCompactTradeHistory: React.FC<QuotexCompactTradeHistoryProps> = ({
  trades = [],
  currentPrice,
  selectedAssetSymbol = 'EUR/USD (OTC)',
  onDoubleUp,
  onSelectTradeForChart,
  initialTab = 'trades',
  onTabChange,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'trades' | 'history'>(initialTab);
  const [expandedTradeIds, setExpandedTradeIds] = useState<Set<string>>(new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Periodic tick for live open trade timers
  useEffect(() => {
    const hasOpen = trades.some((t) => isTradeActiveOrOpen(t));
    if (!hasOpen) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, [trades]);

  const activeTrades = React.useMemo(() => {
    return trades.filter((t) => isTradeActiveOrOpen(t) && nowMs < t.endTime);
  }, [trades, nowMs]);

  const closedTrades = React.useMemo(() => {
    return trades
      .filter((t) => !isTradeActiveOrOpen(t) || nowMs >= t.endTime)
      .map((t) => {
        if (isTradeActiveOrOpen(t) && nowMs >= t.endTime) {
          const livePriceFromFeed = liveMarketFeed.getLatestPrice(t.asset);
          const tradeMarket = getAssetMarketState(t.asset);
          const livePrice =
            (t.asset === selectedAssetSymbol ? currentPrice : undefined) ??
            livePriceFromFeed ??
            tradeMarket?.lastPrice ??
            (t.closePrice && t.closePrice !== t.strikePrice ? t.closePrice : undefined) ??
            t.strikePrice;
          return resolveOptimisticTradeResult(t, livePrice);
        }
        return t;
      })
      .sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime));
  }, [trades, nowMs, currentPrice, selectedAssetSymbol]);

  const handleSelectTab = (tab: 'trades' | 'history') => {
    soundEngine.playUiClick();
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const toggleExpandTrade = (tradeId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    soundEngine.playUiClick();
    setExpandedTradeIds((prev) => {
      const next = new Set(prev);
      if (next.has(tradeId)) {
        next.delete(tradeId);
      } else {
        next.add(tradeId);
      }
      return next;
    });
  };

  // Group closed trades by Date Headers (e.g. "5 NOVEMBER 24")
  const dateGroups = React.useMemo(() => {
    const groups: Array<{ dateLabel: string; items: BinaryTrade[] }> = [];
    const map = new Map<string, BinaryTrade[]>();

    for (const t of closedTrades) {
      const ts = t.endTime || t.startTime || Date.now();
      const label = formatDateGroupTitle(ts);
      if (!map.has(label)) {
        map.set(label, []);
      }
      map.get(label)!.push(t);
    }

    map.forEach((items, dateLabel) => {
      groups.push({ dateLabel, items });
    });

    return groups;
  }, [closedTrades]);

  return (
    <div
      data-testid="quotex-compact-trade-panel"
      className={`flex flex-col w-full h-full bg-[#181f2c] text-slate-200 select-none font-sans border border-[#242b3b] rounded-lg overflow-hidden shadow-lg ${className}`}
    >
      {/* 1. Header Tabs ("Trades (X)" vs "Clock (Y)") matching Quotex image */}
      <div className="flex items-center bg-[#131722] border-b border-[#242b3b] text-[11px] font-mono shrink-0">
        <button
          type="button"
          data-testid="right-tab-trades"
          onClick={() => handleSelectTab('trades')}
          className={`flex-1 py-2 px-3 font-bold flex items-center justify-center gap-1.5 cursor-pointer relative transition-colors ${
            activeTab === 'trades'
              ? 'bg-[#1b2231] text-white font-extrabold border-b-2 border-[#0088ff]'
              : 'text-slate-400 hover:text-white hover:bg-[#151c28]'
          }`}
        >
          <span className="tracking-tight">Trades</span>
          <span
            data-testid="active-trades-count-pill"
            className={`px-1.5 py-0.2 rounded-full text-[9px] font-black font-mono ${
              activeTrades.length > 0
                ? 'bg-[#00c853] text-slate-950 animate-pulse'
                : 'bg-[#222938] text-slate-400'
            }`}
          >
            {activeTrades.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="right-tab-history"
          onClick={() => handleSelectTab('history')}
          className={`flex-1 py-2 px-3 font-bold flex items-center justify-center gap-1.5 cursor-pointer relative transition-colors ${
            activeTab === 'history'
              ? 'bg-[#1b2231] text-white font-extrabold border-b-2 border-[#0088ff]'
              : 'text-slate-400 hover:text-white hover:bg-[#151c28]'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span
            data-testid="closed-trades-count-pill"
            className="px-1.5 py-0.2 rounded-full text-[9px] bg-[#222938] text-slate-300 font-bold font-mono"
          >
            {closedTrades.length}
          </span>
        </button>
      </div>

      {/* 2. Scrollable Trades Content */}
      <div className="flex-1 overflow-y-auto min-h-[140px] divide-y divide-[#212738] no-scrollbar">
        {/* ACTIVE TRADES LIST */}
        {activeTab === 'trades' && (
          <div className="divide-y divide-[#212738]">
            {activeTrades.length === 0 ? (
              <div
                data-testid="empty-active-trades-msg"
                className="p-5 text-center text-xs text-slate-400 space-y-1 font-mono"
              >
                <Activity className="w-5 h-5 text-slate-500 mx-auto opacity-50" />
                <div className="text-slate-300 font-bold text-[11px]">No Active Trades</div>
                <p className="text-[10px] text-slate-500">
                  Select an asset and tap Buy or Sell to enter a live position.
                </p>
              </div>
            ) : (
              activeTrades.map((t) => {
                const isExpanded = expandedTradeIds.has(t.id);
                const isCall = t.direction === 'CALL';
                const assetObj = findAssetBySymbol(t.asset);
                const tradeMarket = getAssetMarketState(t.asset);
                const livePrice =
                  t.asset === selectedAssetSymbol
                    ? currentPrice
                    : tradeMarket?.lastPrice ?? t.strikePrice;
                const isInTheMoney = isCall
                  ? livePrice > t.strikePrice
                  : livePrice < t.strikePrice;
                const secondsRemaining = Math.max(0, Math.ceil((t.endTime - nowMs) / 1000));
                const potentialPayout =
                  t.potentialPayout || (t.investment * (1 + (t.payoutPercentage || 85) / 100));
                const durationStr = t.durationSeconds
                  ? formatDurationToClock(t.durationSeconds)
                  : '00:00:05';

                return (
                  <div
                    key={t.id}
                    data-testid={`active-trade-row-${t.id}`}
                    onClick={(e) => toggleExpandTrade(t.id, e)}
                    className="px-2.5 py-2 bg-transparent hover:bg-[#1e2536] cursor-pointer transition-colors"
                  >
                    {/* Top Micro-Row: Chevron + Asset Flag(s) + Asset Name + Duration */}
                    <div className="flex items-center justify-between text-[11px] font-bold text-white mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          data-testid={`toggle-expand-${t.id}`}
                          onClick={(e) => toggleExpandTrade(t.id, e)}
                          className="p-0.5 rounded text-slate-400 hover:text-white shrink-0"
                          aria-label="Toggle active trade details"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <AssetFlagIcon
                          symbol={t.asset}
                          category={assetObj?.category}
                          flagEmoji={assetObj?.flag}
                          size="xs"
                        />
                        <span className="truncate text-[11px] font-extrabold tracking-tight">
                          {t.asset}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 font-medium shrink-0">
                        {durationStr}
                      </span>
                    </div>

                    {/* Bottom Micro-Row: Direction Arrow + Invested Amount (Left) & Countdown + Potential Payout (Right) */}
                    <div className="flex items-center justify-between font-mono text-[11px] pl-5">
                      <div className="flex items-center gap-1 font-bold">
                        <span className={isCall ? 'text-[#00c853]' : 'text-[#ff334b]'}>
                          {isCall ? '↑' : '↓'} {t.investment} $
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9.5px] font-bold font-mono px-1 rounded ${
                            isInTheMoney ? 'text-[#00c853]' : 'text-[#ff334b]'
                          }`}
                        >
                          {secondsRemaining > 0 ? `${secondsRemaining}s` : 'EXP'}
                        </span>
                        <span
                          data-testid={`active-trade-payout-${t.id}`}
                          className={`font-black text-xs tabular-nums ${
                            isInTheMoney ? 'text-[#00c853]' : 'text-[#ff334b]'
                          }`}
                        >
                          {isInTheMoney ? `+$${potentialPayout.toFixed(2)}` : '0.00 $'}
                        </span>
                      </div>
                    </div>

                    {/* Expanded Detail Box */}
                    {isExpanded && (
                      <div
                        data-testid={`active-trade-details-${t.id}`}
                        className="mt-2 pt-2 border-t border-[#232838] bg-[#121622] rounded-lg p-2.5 text-[10px] font-mono space-y-1.5 text-slate-400"
                      >
                        <div className="flex items-center justify-between">
                          <span>Strike (Entry):</span>
                          <span className="text-white font-bold">
                            {t.strikePrice.toFixed(assetObj?.pipDecimals ?? 2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Live Price:</span>
                          <span
                            className={`font-bold ${
                              isInTheMoney ? 'text-[#00c853]' : 'text-[#ff334b]'
                            }`}
                          >
                            {livePrice.toFixed(assetObj?.pipDecimals ?? 2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Payout Rate:</span>
                          <span className="text-amber-400 font-bold">
                            {t.payoutPercentage || 85}%
                          </span>
                        </div>
                        {onDoubleUp && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              soundEngine.playUiClick();
                              onDoubleUp(t);
                            }}
                            className="w-full mt-1.5 py-1 px-2 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer border border-white/15"
                          >
                            <Repeat className="w-3 h-3 text-[#ff8800]" />
                            <span>Repeat Trade (x2)</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* CLOSED TRADE HISTORY LIST */}
        {activeTab === 'history' && (
          <div>
            {closedTrades.length === 0 ? (
              <div
                data-testid="empty-closed-trades-msg"
                className="p-5 text-center text-xs text-slate-400 font-mono space-y-1"
              >
                <HistoryIcon className="w-5 h-5 text-slate-500 mx-auto opacity-50" />
                <div className="text-slate-300 font-bold text-[11px]">No Trade History</div>
                <p className="text-[10px] text-slate-500">
                  Completed binary options trades will appear here grouped by date.
                </p>
              </div>
            ) : (
              dateGroups.map(({ dateLabel, items }) => (
                <div key={dateLabel} className="space-y-0">
                  {/* Date Header Pill (Quotex Style e.g. "5 NOVEMBER 24") */}
                  <div className="py-1.5 px-3 bg-[#131824] border-y border-[#202738] flex items-center justify-center gap-2 text-[9.5px] font-mono font-black text-slate-400 tracking-wider">
                    <span className="uppercase">{dateLabel}</span>
                    <span className="w-4 h-4 rounded-full bg-[#242b3d] text-white flex items-center justify-center text-[8.5px] font-bold">
                      {items.length}
                    </span>
                  </div>

                  {/* Compact Trade Items */}
                  <div className="divide-y divide-[#212738]">
                    {items.map((t) => {
                      const isWin = t.status === 'won';
                      const isTie = t.status === 'tie';
                      const isCall = t.direction === 'CALL';
                      const isExpanded = expandedTradeIds.has(t.id);
                      const assetObj = findAssetBySymbol(t.asset);
                      const exitPrice = t.closePrice ?? t.currentPrice ?? t.strikePrice;
                      const payoutRate = t.payoutPercentage || 85;

                      // Calculate payout display
                      const grossPayout = isWin
                        ? t.potentialPayout || Number((t.investment * (1 + payoutRate / 100)).toFixed(2))
                        : isTie
                        ? t.investment
                        : 0;

                      const formattedPayout = isWin
                        ? `+${grossPayout.toFixed(2)} $`
                        : isTie
                        ? `${grossPayout.toFixed(2)} $`
                        : '0.00 $';

                      const durationStr = t.durationSeconds
                        ? formatDurationToClock(t.durationSeconds)
                        : '00:00:05';

                      return (
                        <div
                          key={t.id}
                          data-testid={`history-trade-row-${t.id}`}
                          onClick={(e) => {
                            onSelectTradeForChart?.(t);
                            toggleExpandTrade(t.id, e);
                          }}
                          className="px-2.5 py-2 bg-transparent hover:bg-[#1e2536] cursor-pointer transition-colors"
                        >
                          {/* Top Micro-Row: Chevron + Asset Flag(s) + Asset Name + Duration */}
                          <div className="flex items-center justify-between text-[11px] font-bold text-white mb-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                                type="button"
                                data-testid={`toggle-history-expand-${t.id}`}
                                onClick={(e) => toggleExpandTrade(t.id, e)}
                                className="p-0.5 rounded text-slate-400 hover:text-white shrink-0"
                                aria-label="Toggle trade history details"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <AssetFlagIcon
                                symbol={t.asset}
                                category={assetObj?.category}
                                flagEmoji={assetObj?.flag}
                                size="xs"
                              />
                              <span className="truncate text-xs font-extrabold tracking-tight">
                                {t.asset}
                              </span>
                            </div>
                            <span className="font-mono text-[10.5px] text-slate-400 font-medium shrink-0">
                              {durationStr}
                            </span>
                          </div>

                          {/* Bottom Micro-Row: Direction Arrow + Invested Amount (Left) & Payout / Outcome (Right) */}
                          <div className="flex items-center justify-between font-mono text-[11px] pl-5">
                            <div className="flex items-center gap-1 font-bold">
                              <span className={isCall ? 'text-[#00c853]' : 'text-[#ff334b]'}>
                                {isCall ? '↑' : '↓'} {t.investment} $
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                data-testid={`history-trade-payout-${t.id}`}
                                className={`font-black text-xs tabular-nums ${
                                  isWin
                                    ? 'text-[#00c853]'
                                    : isTie
                                    ? 'text-amber-400'
                                    : 'text-[#ff334b]'
                                }`}
                              >
                                {formattedPayout}
                              </span>
                            </div>
                          </div>

                          {/* Expanded Detail Box */}
                          {isExpanded && (
                            <div
                              data-testid={`history-trade-details-${t.id}`}
                              className="mt-2 pt-2 border-t border-[#232838] bg-[#121622] rounded-lg p-2.5 text-[10px] font-mono space-y-1.5 text-slate-400"
                            >
                              <div className="flex items-center justify-between">
                                <span>Strike (Entry):</span>
                                <span className="text-white font-bold">
                                  {t.strikePrice.toFixed(assetObj?.pipDecimals ?? 2)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Exit (Close):</span>
                                <span
                                  className={`font-bold ${
                                    isWin
                                      ? 'text-[#00c853]'
                                      : isTie
                                      ? 'text-amber-400'
                                      : 'text-[#ff334b]'
                                  }`}
                                >
                                  {exitPrice.toFixed(assetObj?.pipDecimals ?? 2)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Payout Rate:</span>
                                <span className="text-amber-400 font-bold">{payoutRate}%</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Outcome:</span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider ${
                                    isWin
                                      ? 'bg-emerald-500/20 text-[#00c853] border border-emerald-500/40'
                                      : isTie
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                      : 'bg-rose-500/20 text-[#ff334b] border border-rose-500/40'
                                  }`}
                                >
                                  {isWin ? 'WIN' : isTie ? 'TIE' : 'LOSS'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Order Time:</span>
                                <span className="text-slate-300">
                                  {new Date(t.startTime).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Expiration Time:</span>
                                <span className="text-slate-300">
                                  {new Date(t.endTime).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                {onDoubleUp && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      soundEngine.playUiClick();
                                      onDoubleUp(t);
                                    }}
                                    className="flex-1 py-1 px-2 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer border border-white/15"
                                  >
                                    <Repeat className="w-3 h-3 text-[#ff8800]" />
                                    <span>Repeat (x2)</span>
                                  </button>
                                )}
                                {onSelectTradeForChart && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      soundEngine.playUiClick();
                                      onSelectTradeForChart(t);
                                    }}
                                    className="flex-1 py-1 px-2 rounded bg-[#0088ff]/20 hover:bg-[#0088ff]/30 text-[#0088ff] font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer border border-[#0088ff]/40"
                                  >
                                    <Crosshair className="w-3 h-3" />
                                    <span>On Chart</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
