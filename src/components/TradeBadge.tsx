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
  const bgColor = isInTheMoney
    ? 'bg-[#00E676] text-black border border-[#00E676]'
    : 'bg-[#FF1744] text-white border border-[#FF1744]';
  const progressPct = totalDuration > 0 ? Math.max(0, Math.min(100, (remainingSeconds / totalDuration) * 100)) : 100;

  return (
    <div
      className={`absolute z-30 px-2.5 py-1.5 rounded-lg flex flex-col gap-1 font-mono text-[11px] font-bold select-none shadow-lg backdrop-blur-sm transition-colors duration-75 trade-badge hw-accelerate ${bgColor}`}
      style={{
        top: `${top - 18}px`,
        left: `${left + 15}px`,
        minWidth: '110px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        transform: 'translateZ(0)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {isCall ? (
            <ArrowUp className="w-3.5 h-3.5 stroke-[3] text-current" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 stroke-[3] text-current" />
          )}
          <span className="tracking-wide">${investment}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="opacity-95">{formattedTimer}</span>
          <span className="font-extrabold">{formattedPnl}</span>
        </div>
      </div>
      {/* Animated progress bar tracking settlement time */}
      <div className="w-full h-1 bg-black/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-current transition-all duration-300 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
});
