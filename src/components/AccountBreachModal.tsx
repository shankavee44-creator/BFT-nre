import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  ShieldAlert,
  ShoppingBag,
  Clock,
  TrendingDown,
  X,
  FileText,
  Lock,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { TradingAccount } from '../types';
import { resetSoftBreachedAccount } from '../utils/propRules';

interface AccountBreachModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: TradingAccount;
  accounts?: TradingAccount[];
  onSelectAccount?: (id: string) => void;
  onOpenChallengeModal?: () => void;
  onResetSoftBreach?: (account: TradingAccount) => void;
}

export const AccountBreachModal: React.FC<AccountBreachModalProps> = ({
  isOpen,
  onClose,
  account,
  accounts = [],
  onSelectAccount,
  onOpenChallengeModal,
  onResetSoftBreach,
}) => {
  if (!isOpen) return null;

  const isSoft = account.status === 'soft-breached' || account.breachType === 'soft';
  const logs = account.violationLogs || [];
  const latestLog = logs[logs.length - 1];

  const dailyDrawdownAmount = Math.max(0, account.startingDayEquity - account.equity);
  const dailyDrawdownPercent = account.startingDayEquity > 0
    ? ((dailyDrawdownAmount / account.startingDayEquity) * 100).toFixed(2)
    : '0.00';

  const overallLossAmount = Math.max(0, account.initialBalance - account.equity);
  const overallLossPercent = account.initialBalance > 0
    ? ((overallLossAmount / account.initialBalance) * 100).toFixed(2)
    : '0.00';

  // Live countdown timer for soft breach reset
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const target = account.softBreachResetTime || Date.now() + 5 * 3600 * 1000;
    return Math.max(0, Math.floor((target - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!isSoft) return;
    const interval = setInterval(() => {
      const target = account.softBreachResetTime || Date.now() + 5 * 3600 * 1000;
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecondsRemaining(left);

      // Auto-unlock when countdown hits 0
      if (left === 0 && onResetSoftBreach) {
        onResetSoftBreach(resetSoftBreachedAccount(account));
        onClose();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSoft, account, onResetSoftBreach, onClose]);

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h < 10 ? '0' : ''}${h}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const handleSimulateNextDay = () => {
    if (onResetSoftBreach) {
      onResetSoftBreach(resetSoftBreachedAccount(account));
      onClose();
    }
  };

  // Find other active, non-breached accounts owned by user
  const otherActiveAccounts = accounts.filter(
    (a) => a.id !== account.id && a.status === 'active'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200">
      <div
        className={`w-full max-w-xl rounded-3xl bg-[#080d1a] border-2 p-6 sm:p-8 shadow-2xl relative overflow-hidden font-mono ${
          isSoft
            ? 'border-amber-500/80 shadow-[0_0_60px_rgba(245,158,11,0.3)]'
            : 'border-rose-500/80 shadow-[0_0_60px_rgba(244,63,94,0.35)]'
        }`}
      >
        {/* Ambient Top Glow Bar */}
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${
            isSoft
              ? 'from-amber-600 via-amber-400 to-yellow-300'
              : 'from-rose-600 via-rose-500 to-amber-500'
          }`}
        />

        {/* Close Button only if other active accounts exist or soft breach */}
        {(otherActiveAccounts.length > 0 || isSoft) && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Dismiss Modal"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Breach Alert Header */}
        <div className="flex items-start gap-4 mb-6">
          <div
            className={`w-14 h-14 rounded-2xl border flex items-center justify-center shrink-0 shadow-xl ${
              isSoft
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-amber-950/60'
                : 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-rose-950/60'
            }`}
          >
            {isSoft ? (
              <Clock className="w-7 h-7 text-amber-400 animate-pulse" />
            ) : (
              <Lock className="w-7 h-7 text-rose-400 animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider ${
                  isSoft
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {isSoft ? 'Soft Breach: Daily Drawdown Paused' : 'Permanent Hard Breach Enforced'}
              </span>
              <span className="text-xs text-slate-400 font-bold">{account.id}</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white mt-1.5 tracking-tight font-sans">
              {isSoft ? 'Trading Paused Until Daily Reset' : 'Account Breached! Terminal Locked'}
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed font-sans font-medium">
              {isSoft
                ? `Your account hit the daily loss limit of ${account.dailyLossLimitPercent}%. To safeguard your evaluation capital, trading is temporarily locked until the next daily trading cycle begins.`
                : 'Your evaluation/funded account has failed due to maximum overall loss or core rule violations. Under strict institutional compliance, breached accounts cannot be reset or retried.'}
            </p>
          </div>
        </div>

        {/* Soft Breach Live Countdown or Hard Breach Notice */}
        {isSoft ? (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 mb-5 text-xs text-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-amber-300 font-bold text-xs uppercase tracking-wider">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Next Trading Day Reset In:</span>
              </span>
              <span className="text-xs font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/40">
                {formatCountdown(secondsRemaining)}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              Once the daily reset triggers, your daily drawdown will automatically reset to 0.0%, and your trading terminal will unlock immediately.
            </p>

            {/* Test Simulation Fast-Forward Button */}
            <div className="mt-3 pt-2 border-t border-amber-500/30 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-sans">Testing / Evaluation Mode:</span>
              <button
                onClick={handleSimulateNextDay}
                className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] font-sans flex items-center gap-1.5 shadow cursor-pointer transition-all"
              >
                <Zap className="w-3 h-3 fill-slate-950" />
                <span>Simulate Next Day (Instant Auto-Unlock)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/50 mb-5 text-xs text-slate-200">
            <div className="flex items-center gap-2 text-rose-300 font-bold mb-1">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="uppercase tracking-wider">Mandatory Re-Purchase Policy</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              Under institutional guidelines, overall loss violations result in account termination. You qualify for a{' '}
              <strong className="text-amber-400">10% Reset Courtesy Discount</strong> when purchasing a new challenge account.
            </p>
          </div>
        )}

        {/* Live Metrics at Breach Snapshot */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-2xl bg-[#060a14] border border-slate-800 mb-5 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Daily Drawdown</span>
            <span className={`text-sm font-black ${isSoft ? 'text-amber-400' : 'text-rose-400'}`}>
              -{dailyDrawdownPercent}%
            </span>
            <span className="text-[10px] text-slate-500 block">
              Limit: {account.dailyLossLimitPercent}%
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Overall Loss</span>
            <span className={`text-sm font-black ${isSoft ? 'text-slate-300' : 'text-rose-400'}`}>
              -{overallLossPercent}%
            </span>
            <span className="text-[10px] text-slate-500 block">
              Limit: {account.maxOverallLossPercent}%
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Current Equity</span>
            <span className="text-sm font-black text-white">
              ${account.equity.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Start: ${account.startingDayEquity.toFixed(0)}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Account Status</span>
            <span
              className={`text-sm font-black uppercase flex items-center gap-1 ${
                isSoft ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 inline" />
              {isSoft ? 'Paused' : 'Terminated'}
            </span>
            <span className="text-[10px] text-slate-500 block">
              {isSoft ? 'Auto-Resets' : 'No Reset'}
            </span>
          </div>
        </div>

        {/* Violation Log Details */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-2 font-semibold">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Violation Log Snapshot
            </span>
            <span className="text-[10px] text-slate-400">
              {logs.length} Recorded Breach{logs.length !== 1 ? 'es' : ''}
            </span>
          </div>

          <div className="max-h-24 overflow-y-auto space-y-2 pr-1 rounded-xl">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-xl bg-[#0d1424] border border-slate-800 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                          log.severity === 'critical'
                            ? 'bg-rose-950 text-rose-300 border-rose-500/40'
                            : 'bg-amber-950 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {log.ruleName}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-200 mt-1">{log.message}</p>
                    {log.details && (
                      <p className="text-[10px] text-amber-300/80 mt-0.5">{log.details}</p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                      log.severity === 'critical'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {log.severity}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-3 rounded-xl bg-[#0d1424] border border-slate-800 text-xs text-slate-400 text-center">
                {latestLog?.message || account.breachReason || 'Daily Loss Limit exceeded threshold.'}
              </div>
            )}
          </div>
        </div>

        {/* CTA & Account Switcher */}
        <div className="space-y-3 pt-3 border-t border-slate-800">
          {/* Main Action Button */}
          {isSoft ? (
            <button
              onClick={handleSimulateNextDay}
              className="w-full py-4 px-6 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 glow-gold transition-all cursor-pointer font-sans uppercase tracking-wide"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Simulate Daily Reset & Resume Trading</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
          ) : (
            <button
              onClick={() => {
                onClose();
                onOpenChallengeModal?.();
              }}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:brightness-110 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 glow-gold transition-all cursor-pointer font-sans uppercase tracking-wide"
            >
              <ShoppingBag className="w-5 h-5 fill-slate-950" />
              <span>Buy New Account (10% Reset Courtesy Applied)</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
          )}

          {/* Switch to active account if trader has another active account */}
          {otherActiveAccounts.length > 0 && (
            <div className="pt-1">
              <div className="text-[10px] text-slate-400 text-center mb-1.5 uppercase font-medium">
                Or Switch to Another Active Account:
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {otherActiveAccounts.map((act) => (
                  <button
                    key={act.id}
                    onClick={() => {
                      onSelectAccount?.(act.id);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#0f182d] hover:bg-[#162340] border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>{act.id} (${(act?.currentBalance ?? 0).toLocaleString()})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
