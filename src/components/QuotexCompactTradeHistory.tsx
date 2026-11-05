import React, { useState, useEffect } from 'react';
import {
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Repeat,
  Activity,
  History as HistoryIcon,
} from 'lucide-react';
import { BinaryTrade } from '../types';
import { findAssetBySymbol } from '../utils/storage';
import { getAssetMarketState } from '../utils/priceFeedEngine';
import { liveMarketFeed } from '../utils/liveMarketFeed';
import { isTradeActiveOrOpen, resolveOptimisticTradeResult } from '../utils/supabaseTradeSync';
import { AssetFlagIcon } from './CountryFlagIcon';
import { soundEngine } from '../utils/soundEffects';

interface QuotexCompactTradeHistoryProps {
  trades: BinaryTrade[];
  currentPrice: number;
  selectedAssetSymbol?: string;
  onDoubleUp?: (trade: BinaryTrade) => void;
  onSelectTradeForChart?: (trade: BinaryTrade) => void;
  initialTab?: 'trades' | 'history';
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
 * Formats date into uppercase Quotex date string e.g. "5 NOVEMBER 26".
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

  const toggleExpandTrade = (tradeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Group closed trades by Date Headers (e.g. "5 NOVEMBER 26")
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
      className={`flex flex-col w-full bg-[#131722] text-slate-200 select-none font-sans border border-[#2a2e39] rounded-xl overflow-hidden ${className}`}
    >
      {/* 1. Header Tabs ("Trades (X)" vs "Clock (Y)") matching Quotex image */}
      <div className="flex items-center bg-[#0e1118] border-b border-[#242938] text-[11px] font-mono shrink-0">
        <button
          type="button"
          data-testid="quotex-tab-trades"
          onClick={() => {
            soundEngine.playUiClick();
            setActiveTab('trades');
          }}
          className={`flex-1 py-2 px-3 font-bold flex items-center justify-center gap-1.5 cursor-pointer relative transition-colors ${
            activeTab === 'trades'
              ? 'bg-[#181d2b] text-white font-black border-b-2 border-[#0088ff]'
              : 'text-slate-400 hover:text-white hover:bg-[#141824]'
          }`}
        >
          <span className="tracking-tight">Trades</span>
          <span
            data-testid="active-trades-count-pill"
            className={`px-1.5 py-0.2 rounded-full text-[9px] font-black font-mono ${
              activeTrades.length > 0
                ? 'bg-[#00c853] text-slate-950 animate-pulse'
                : 'bg-[#212738] text-slate-400'
            }`}
          >
            {activeTrades.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="quotex-tab-history"
          onClick={() => {
            soundEngine.playUiClick();
            setActiveTab('history');
          }}
          className={`flex-1 py-2 px-3 font-bold flex items-center justify-center gap-1.5 cursor-pointer relative transition-colors ${
            activeTab === 'history'
              ? 'bg-[#181d2b] text-white font-black border-b-2 border-[#0088ff]'
              : 'text-slate-400 hover:text-white hover:bg-[#141824]'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span
            data-testid="closed-trades-count-pill"
            className="px-1.5 py-0.2 rounded-full text-[9px] bg-[#212738] text-slate-300 font-bold font-mono"
          >
            {closedTrades.length}
          </span>
        </button>
      </div>

      {/* 2. Scrollable Trades Content */}
      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-280px)] min-h-[140px] divide-y divide-[#202535] no-scrollbar">
        {/* ACTIVE TRADES LIST */}
        {activeTab === 'trades' && (
          <div>
            {activeTrades.length === 0 ? (
              <div
                data-testid="empty-active-trades-msg"
                className="p-4 text-center text-xs text-slate-400 space-y-1 font-mono"
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

                return (
                  <div
                    key={t.id}
                    data-testid={`active-trade-row-${t.id}`}
                    onClick={(e) => toggleExpandTrade(t.id, e)}
                    className="p-2 bg-[#121622] hover:bg-[#161b2a] cursor-pointer transition-colors border-b border-[#1f2434] last:border-0"
                  >
                    {/* Top Line: Chevron + Asset Icon + Asset Name + Duration */}
                    <div className="flex items-center justify-between text-[11px] font-bold text-white mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          data-testid={`toggle-expand-${t.id}`}
                          onClick={(e) => toggleExpandTrade(t.id, e)}
                          className="p-0.5 rounded text-slate-400 hover:text-white shrink-0"
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
                      <span className="font-mono text-[10.5px] text-slate-400 font-semibold shrink-0">
                        {formatDurationToClock(t.durationSeconds || 60)}
                      </span>
                    </div>

                    {/* Bottom Line: Direction Icon + Amount (Left) & Return Payout (Right) */}
                    <div className="flex items-center justify-between font-mono text-[11px] pl-5">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            isCall
                              ? 'bg-[#00c853]/20 text-[#00c853] border border-[#00c853]/50'
                              : 'bg-[#ff334b]/20 text-[#ff334b] border border-[#ff334b]/50'
                          }`}
                        >
                          {isCall ? (
                            <ArrowUp className="w-2.5 h-2.5 stroke-[3]" />
                          ) : (
                            <ArrowDown className="w-2.5 h-2.5 stroke-[3]" />
                          )}
                        </span>
                        <span className={isCall ? 'text-[#00c853]' : 'text-[#ff334b]'}>
                          {t.investment} $
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold font-mono px-1 rounded ${
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
                        className="mt-2 pt-2 border-t border-[#232838] bg-[#0c0e17] rounded-lg p-2 text-[10px] font-mono space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Strike (Entry):</span>
                          <span className="text-white font-bold">
                            {t.strikePrice.toFixed(assetObj?.pipDecimals ?? 2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Live Price:</span>
                          <span
                            className={`font-bold ${
                              isInTheMoney ? 'text-[#00c853]' : 'text-[#ff334b]'
                            }`}
                          >
                            {livePrice.toFixed(assetObj?.pipDecimals ?? 2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
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
                            className="w-full mt-1 py-1 px-2 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer border border-white/15"
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
                className="p-4 text-center text-xs text-slate-400 font-mono space-y-1"
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
                  {/* Date Header Pill (Quotex Style e.g. "5 NOVEMBER 26") */}
                  <div className="py-1 px-3 bg-[#0d101a] border-y border-[#1e2333] flex items-center justify-center gap-2 text-[9.5px] font-mono font-black text-slate-400 tracking-wider">
                    <span className="uppercase">{dateLabel}</span>
                    <span className="w-4 h-4 rounded-full bg-[#202638] text-white flex items-center justify-center text-[8.5px] font-bold">
                      {items.length}
                    </span>
                  </div>

                  {/* Compact Trade Items */}
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

                    return (
                      <div
                        key={t.id}
                        data-testid={`history-trade-row-${t.id}`}
                        onClick={(e) => {
                          onSelectTradeForChart?.(t);
                          toggleExpandTrade(t.id, e);
                        }}
                        className="p-2 bg-[#121622] hover:bg-[#161b2a] cursor-pointer transition-colors border-b border-[#1f2434] last:border-0"
                      >
                        {/* Top Line: Chevron Icon + Asset Flag + Asset Name + Expiration Duration */}
                        <div className="flex items-center justify-between text-[11px] font-bold text-white mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <button
                              type="button"
                              data-testid={`toggle-expand-history-${t.id}`}
                              onClick={(e) => toggleExpandTrade(t.id, e)}
                              className="p-0.5 rounded text-slate-400 hover:text-white shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-slate-300" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
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

                          <span className="font-mono text-[10.5px] text-slate-400 font-semibold shrink-0">
                            {formatDurationToClock(t.durationSeconds || 60)}
                          </span>
                        </div>

                        {/* Bottom Line: Direction Icon + Invested Amount (Left) & Return Payout Amount (Right) */}
                        <div className="flex items-center justify-between font-mono text-[11px] pl-5">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                isCall
                                  ? 'bg-[#00c853]/20 text-[#00c853] border border-[#00c853]/50'
                                  : 'bg-[#ff334b]/20 text-[#ff334b] border border-[#ff334b]/50'
                              }`}
                            >
                              {isCall ? (
                                <ArrowUp className="w-2.5 h-2.5 stroke-[3]" />
                              ) : (
                                <ArrowDown className="w-2.5 h-2.5 stroke-[3]" />
                              )}
                            </span>
                            <span className={isCall ? 'text-[#00c853]' : 'text-[#ff334b]'}>
                              {t.investment} $
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
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
                            className="mt-2 pt-2 border-t border-[#232838] bg-[#0c0e17] rounded-lg p-2 text-[10px] font-mono space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Strike Price:</span>
                              <span className="text-white font-bold">
                                {t.strikePrice.toFixed(assetObj?.pipDecimals ?? 2)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Close Price:</span>
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
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Payout Percentage:</span>
                              <span className="text-amber-400 font-bold">{payoutRate}%</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Order Time:</span>
                              <span className="text-slate-300">
                                {new Date(t.startTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Expiration Time:</span>
                              <span className="text-slate-300">
                                {new Date(t.endTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
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
                                className="w-full mt-1 py-1 px-2 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer border border-white/15"
                              >
                                <Repeat className="w-3 h-3 text-[#ff8800]" />
                                <span>Re-order Trade (x2)</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
