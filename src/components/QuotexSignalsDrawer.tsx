import React, { useState } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  ShieldCheck,
  Activity,
  Cpu,
  Sparkles,
  BarChart2,
  RefreshCw,
  Flame,
} from 'lucide-react';
import { AssetInfo } from '../types';
import { DEFAULT_ASSETS } from '../utils/storage';
import { soundEngine } from '../utils/soundEffects';
import { AssetFlagIcon } from './CountryFlagIcon';

export interface BFTSignalItem {
  id: string;
  symbol: string;
  direction: 'CALL' | 'PUT';
  timeframe: string;
  durationSeconds: number;
  confidence: number;
  strength: 'Strong' | 'Ultra' | 'High';
  volatilityIndex: string;
  indicator: string;
  aiRationale: string;
  createdAgo: string;
}

const INITIAL_BFT_SIGNALS: BFTSignalItem[] = [
  {
    id: 'BFT-SIG-01',
    symbol: 'EUR/USD (OTC)',
    direction: 'CALL',
    timeframe: '1m',
    durationSeconds: 60,
    confidence: 93.4,
    strength: 'Ultra',
    volatilityIndex: 'Low (Ideal Scalp)',
    indicator: 'RSI Oversold (27.2) + MACD Golden Crossover',
    aiRationale: 'Multi-timeframe momentum convergence with aggressive volume absorption at key support level.',
    createdAgo: 'Just now',
  },
  {
    id: 'BFT-SIG-02',
    symbol: 'AUD/CAD (OTC)',
    direction: 'PUT',
    timeframe: '1m',
    durationSeconds: 60,
    confidence: 89.8,
    strength: 'High',
    volatilityIndex: 'Medium (Trend Reversal)',
    indicator: 'Bollinger Upper Band Rejection + Bearish Exhaustion Wick',
    aiRationale: 'Heavy resistance ceiling confirmed by 3 consecutive failed breakout wicks.',
    createdAgo: '1m ago',
  },
  {
    id: 'BFT-SIG-03',
    symbol: 'GBP/JPY (OTC)',
    direction: 'CALL',
    timeframe: '3m',
    durationSeconds: 180,
    confidence: 91.5,
    strength: 'Ultra',
    volatilityIndex: 'High Momentum',
    indicator: 'EMA (9) > SMA (14) Expansion + Heikin-Ashi Green Trend',
    aiRationale: 'Breakout above 194.30 psychological barrier with strong institutional order flow.',
    createdAgo: '2m ago',
  },
  {
    id: 'BFT-SIG-04',
    symbol: 'BTC/USD (OTC)',
    direction: 'CALL',
    timeframe: '5m',
    durationSeconds: 300,
    confidence: 87.2,
    strength: 'Strong',
    volatilityIndex: 'High Volatility',
    indicator: 'Bullish Engulfing on $68,200 Major Support + Volume Spike',
    aiRationale: 'High-frequency algorithmic accumulation detected on 5m timeframe.',
    createdAgo: '3m ago',
  },
  {
    id: 'BFT-SIG-05',
    symbol: 'USD/JPY (OTC)',
    direction: 'PUT',
    timeframe: '1m',
    durationSeconds: 60,
    confidence: 90.1,
    strength: 'Ultra',
    volatilityIndex: 'Medium Volatility',
    indicator: 'RSI Overbought (78.9) + Bearish Divergence',
    aiRationale: 'Immediate mean-reversion wave expected after parabolic liquidity sweep.',
    createdAgo: '4m ago',
  },
  {
    id: 'BFT-SIG-06',
    symbol: 'XAU/USD (OTC)',
    direction: 'CALL',
    timeframe: '2m',
    durationSeconds: 120,
    confidence: 94.6,
    strength: 'Ultra',
    volatilityIndex: 'Surge Momentum',
    indicator: 'Gold Institutional Bid + Fibonacci 61.8% Golden Bounce',
    aiRationale: 'Bullish defense of $2,735 liquidity shelf with immediate upside continuation.',
    createdAgo: 'Just now',
  },
];

interface QuotexSignalsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySignal: (asset: AssetInfo, direction: 'CALL' | 'PUT', durationSeconds: number) => void;
}

export const QuotexSignalsDrawer: React.FC<QuotexSignalsDrawerProps> = ({
  isOpen,
  onClose,
  onApplySignal,
}) => {
  const [signals, setSignals] = useState<BFTSignalItem[]>(INITIAL_BFT_SIGNALS);
  const [filter, setFilter] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!isOpen) return null;

  const handleRefresh = () => {
    soundEngine.playUiClick();
    setIsRefreshing(true);
    setTimeout(() => {
      // Small simulated pulse
      setSignals((prev) =>
        prev.map((s) => ({
          ...s,
          confidence: Math.min(96, Math.max(86, Number((s.confidence + (Math.random() - 0.48) * 1.5).toFixed(1)))),
        }))
      );
      setIsRefreshing(false);
    }, 400);
  };

  const filteredSignals = signals.filter((s) => (filter === 'ALL' ? true : s.direction === filter));

  return (
    <div className="fixed inset-y-0 left-14 z-50 w-84 bg-[#181b25] border-r border-[#2a2e39] shadow-2xl flex flex-col animate-in slide-in-from-left duration-200 font-sans select-none">
      {/* Header */}
      <div className="p-4 bg-[#131722] border-b border-[#2a2e39] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-md">
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white font-mono flex items-center gap-1.5">
              BFT Trading Signals
              <span className="w-2 h-2 rounded-full bg-[#00e676] animate-ping" />
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">Algorithmic OTC Market Insights</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className={`p-1.5 rounded-lg hover:bg-[#252b3b] text-slate-400 hover:text-white transition-all cursor-pointer ${
              isRefreshing ? 'animate-spin text-cyan-400' : ''
            }`}
            title="Refresh AI Signals"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-[#252b3b] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Accuracy & Metric Banner */}
      <div className="p-3 bg-[#1e222d] border-b border-[#2a2e39] text-xs font-mono flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[#00e676] font-bold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>91.2% Backtested Win Rate</span>
        </div>
        <span className="text-[10px] text-cyan-400 font-bold flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Real-Time OTC
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="p-2.5 bg-[#131722] border-b border-[#2a2e39] flex gap-1.5 font-mono text-[11px]">
        {(['ALL', 'CALL', 'PUT'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              soundEngine.playUiClick();
              setFilter(t);
            }}
            className={`flex-1 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filter === t
                ? 'bg-cyan-500 text-slate-950 font-black'
                : 'bg-[#1e222d] text-slate-400 hover:text-white border border-[#2a2e39]'
            }`}
          >
            {t === 'ALL' ? 'All Signals' : t === 'CALL' ? '▲ Calls (Up)' : '▼ Puts (Down)'}
          </button>
        ))}
      </div>

      {/* Signals List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-mono">
        {filteredSignals.map((sig) => {
          const asset = DEFAULT_ASSETS.find((a) => a.symbol === sig.symbol) || DEFAULT_ASSETS[0];

          return (
            <div
              key={sig.id}
              className="p-3 rounded-xl bg-[#131722] border border-[#2a2e39] hover:border-cyan-500/50 transition-all text-xs space-y-2 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AssetFlagIcon symbol={asset.symbol} category={asset.category} flagEmoji={asset.flag} size="xs" />
                  <span className="font-black text-white text-sm">{sig.symbol}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-[#00e676] font-bold border border-[#00e676]/30">
                    +{asset.payout}%
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" /> {sig.createdAgo}
                </span>
              </div>

              {/* Direction & Confidence */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-black flex items-center gap-1 ${
                      sig.direction === 'CALL'
                        ? 'bg-emerald-950/80 text-[#00e676] border border-[#00e676]/40'
                        : 'bg-rose-950/80 text-[#ff334b] border border-[#ff334b]/40'
                    }`}
                  >
                    {sig.direction === 'CALL' ? (
                      <TrendingUp className="w-3.5 h-3.5 stroke-[3]" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 stroke-[3]" />
                    )}
                    {sig.direction === 'CALL' ? 'CALL (UP)' : 'PUT (DOWN)'}
                  </span>
                  <span className="text-[10px] text-slate-300 bg-[#1e222d] px-1.5 py-0.5 rounded border border-[#2a2e39]">
                    {sig.timeframe}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-black text-cyan-400">
                    {sig.confidence}%
                  </span>
                  <span className="text-[9px] text-slate-500 block uppercase">Confidence</span>
                </div>
              </div>

              {/* Technical Indicator Basis */}
              <div className="p-2 rounded-lg bg-[#181b25] border border-[#2a2e39]/80 space-y-1">
                <div className="text-[10px] text-cyan-300 font-bold">
                  {sig.indicator}
                </div>
                <div className="text-[10px] text-slate-400 leading-relaxed font-sans">
                  {sig.aiRationale}
                </div>
              </div>

              {/* Execution CTA Button */}
              <button
                onClick={() => {
                  soundEngine.playUiClick();
                  onApplySignal(asset, sig.direction, sig.durationSeconds);
                  onClose();
                }}
                className="w-full py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-98"
              >
                <Zap className="w-3.5 h-3.5 fill-slate-950" />
                <span>Trade BFT Signal ({sig.direction} {sig.timeframe})</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
