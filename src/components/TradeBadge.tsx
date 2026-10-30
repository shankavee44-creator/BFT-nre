import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface TradeBadgeProps {
  direction: 'CALL' | 'PUT';
  investment: number;
  formattedTimer: string;
  formattedPnl: string;
  isInTheMoney: boolean;
  top: number;
  left: number;
}

export const TradeBadge: React.FC<TradeBadgeProps> = ({
  direction,
  investment,
  formattedTimer,
  formattedPnl,
  isInTheMoney,
  top,
  left,
}) => {
  const colorClass = isInTheMoney ? 'bg-[#00e676] text-[#04130a]' : 'bg-[#ff334b] text-white';
  
  return (
    <div
      className={`absolute z-20 px-2 py-1 rounded flex items-center gap-1.5 font-mono text-[10px] font-bold select-none ${colorClass}`}
      style={{
        top: `${top - 12}px`, // Center vertically
        left: `${left + 10}px`, // Offset from entry point
        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
      }}
    >
      {direction === 'CALL' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      <span>${investment}</span>
      <span>{formattedTimer}</span>
      <span className="ml-1 font-black">{formattedPnl}</span>
    </div>
  );
};
