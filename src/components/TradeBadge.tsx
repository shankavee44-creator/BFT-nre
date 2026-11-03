import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface TradeBadgeProps {
  direction: 'CALL' | 'PUT';
  investment: number;
  formattedTimer: string;
  remainingSeconds?: number;
  totalDuration?: number;
  formattedPnl: string;
  isInTheMoney: boolean;
  top: number;
  left: number;
}

export const TradeBadge: React.FC<TradeBadgeProps> = React.memo(({
  direction,
  investment,
  formattedTimer,
  remainingSeconds = 0,
  totalDuration = 30,
  formattedPnl,
  isInTheMoney,
  top,
  left,
}) => {
  const isCall = direction === 'CALL';
  const progressPct = totalDuration > 0 ? Math.max(0, Math.min(100, (remainingSeconds / totalDuration) * 100)) : 100;

  return (
    <div
      className={`absolute z-30 px-3 py-2 rounded-xl flex flex-col gap-1.5 font-mono text-[11px] font-bold select-none shadow-2xl transition-colors duration-75 trade-badge hw-accelerate bg-zinc-900/95 border ${
        isInTheMoney ? 'border-emerald-500/50' : 'border-rose-500/50'
      }`}
      style={{
        top: `${top - 18}px`,
        left: `${left + 15}px`,
        minWidth: '120px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
        transform: 'translateZ(0)',
      }}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 text-slate-200">
          {isCall ? (
            <ArrowUp className="w-3.5 h-3.5 stroke-[3] text-emerald-400" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 stroke-[3] text-rose-400" />
          )}
          <span className="tracking-wide text-white">${investment}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-300 font-medium">{formattedTimer}</span>
          <span className={`font-black ${isInTheMoney ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formattedPnl}
          </span>
        </div>
      </div>
      {/* Animated progress bar tracking settlement time */}
      <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ease-linear ${
            isInTheMoney ? 'bg-emerald-400' : 'bg-rose-400'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
});

