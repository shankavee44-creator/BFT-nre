import React, { useState, useEffect } from 'react';
import { Clock, Timer, Plus, Minus, Lock, AlertCircle, X, Check } from 'lucide-react';
import {
  clampCustomTradeDuration,
  durationSecondsToHms,
  hmsToDurationSeconds,
  MIN_SELF_CAPITAL_DURATION_SECONDS,
  MIN_TRADE_DURATION_SECONDS,
  MAX_TRADE_DURATION_SECONDS,
} from '../utils/propRules';
import { soundEngine } from '../utils/soundEffects';

export interface TimeTimerSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  duration: number;
  expiryMode: 'timer' | 'time';
  onChangeDuration: (seconds: number) => void;
  onChangeExpiryMode: (mode: 'timer' | 'time') => void;
  isFundedRestricted: boolean;
  onNotifyViolation?: (message: string) => void;
}

const STANDARD_INTERVAL_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: '5s', seconds: 5 },
  { label: '10s', seconds: 10 },
  { label: '15s', seconds: 15 },
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '2h', seconds: 7200 },
  { label: '4h', seconds: 14400 },
];

export function formatDurationHmsLabel(seconds: number): string {
  const { hours, minutes, seconds: secs } = durationSecondsToHms(seconds);
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export const TimeTimerSelectorPopover: React.FC<TimeTimerSelectorPopoverProps> = ({
  isOpen,
  onClose,
  duration,
  expiryMode,
  onChangeDuration,
  onChangeExpiryMode,
  isFundedRestricted,
  onNotifyViolation,
}) => {
  const { hours, minutes, seconds } = durationSecondsToHms(duration);
  const [hoursInput, setHoursInput] = useState<string>(String(hours).padStart(2, '0'));
  const [minutesInput, setMinutesInput] = useState<string>(String(minutes).padStart(2, '0'));
  const [secondsInput, setSecondsInput] = useState<string>(String(seconds).padStart(2, '0'));
  const [localWarning, setLocalWarning] = useState<string | null>(null);

  useEffect(() => {
    const hms = durationSecondsToHms(duration);
    setHoursInput(String(hms.hours).padStart(2, '0'));
    setMinutesInput(String(hms.minutes).padStart(2, '0'));
    setSecondsInput(String(hms.seconds).padStart(2, '0'));
    if (!isFundedRestricted || duration >= MIN_TRADE_DURATION_SECONDS) {
      setLocalWarning(null);
    }
  }, [duration, isFundedRestricted]);

  if (!isOpen) return null;

  const applyCustomDuration = (rawSeconds: number) => {
    const clamped = clampCustomTradeDuration(rawSeconds);
    if (isFundedRestricted && clamped < MIN_TRADE_DURATION_SECONDS) {
      const msg =
        'Funded Account Restriction: Trade durations under 30 seconds are strictly blocked for Funded Accounts. Self-Capital accounts can place trades starting from 5 seconds.';
      setLocalWarning(msg);
      onNotifyViolation?.(msg);
      onChangeDuration(clamped);
      return;
    }
    setLocalWarning(null);
    onChangeDuration(clamped);
  };

  const handleAdjustUnit = (unit: 'h' | 'm' | 's', delta: number) => {
    soundEngine.playUiClick();
    let nextH = hours;
    let nextM = minutes;
    let nextS = seconds;

    if (unit === 'h') {
      nextH = Math.max(0, Math.min(4, nextH + delta));
      if (nextH === 4) {
        nextM = 0;
        nextS = 0;
      }
    } else if (unit === 'm') {
      const totalM = nextH * 60 + nextM + delta;
      const clampedTotalM = Math.max(0, Math.min(240, totalM));
      nextH = Math.floor(clampedTotalM / 60);
      nextM = clampedTotalM % 60;
      if (nextH === 4) nextS = 0;
    } else {
      const totalSec = clampCustomTradeDuration(duration + delta);
      applyCustomDuration(totalSec);
      return;
    }

    const computed = hmsToDurationSeconds(nextH, nextM, nextS);
    applyCustomDuration(computed);
  };

  const commitTypedInputs = (nextHStr: string, nextMStr: string, nextSStr: string) => {
    const h = Math.max(0, Math.min(4, parseInt(nextHStr || '0', 10) || 0));
    const m = h >= 4 ? 0 : Math.max(0, Math.min(59, parseInt(nextMStr || '0', 10) || 0));
    const s = h >= 4 ? 0 : Math.max(0, Math.min(59, parseInt(nextSStr || '0', 10) || 0));
    const computed = hmsToDurationSeconds(h, m, s);
    applyCustomDuration(computed);
  };

  return (
    <>
      <div
        data-testid="time-timer-selector-backdrop"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden="true"
      />
      <div
        data-testid="time-timer-selector-popup"
        role="dialog"
        aria-label="Time and Timer Selector"
        className="fixed inset-x-3 bottom-16 md:absolute md:inset-x-auto md:bottom-auto md:top-full md:right-0 md:mt-1.5 md:w-[264px] z-50 rounded-xl bg-[#161a26] border border-[#2c3347] shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-3 font-mono text-white select-none"
      >
        {/* Header & Mode Toggle */}
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#262c3d]">
          <div className="flex items-center gap-1.5">
            {expiryMode === 'timer' ? (
              <Timer className="w-3.5 h-3.5 text-[#3b82f6]" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-[#3b82f6]" />
            )}
            <span className="text-[11px] font-sans font-bold text-slate-100">
              {expiryMode === 'timer' ? 'Trade Timer' : 'Clock Expiry'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-[#0f131d] p-0.5 rounded-md border border-[#262c3d] text-[9px]">
              <button
                type="button"
                data-testid="popup-mode-timer-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  onChangeExpiryMode('timer');
                }}
                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                  expiryMode === 'timer'
                    ? 'bg-[#3b82f6] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Timer
              </button>
              <button
                type="button"
                data-testid="popup-mode-time-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  onChangeExpiryMode('time');
                }}
                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                  expiryMode === 'time'
                    ? 'bg-[#3b82f6] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Clock
              </button>
            </div>
            <button
              type="button"
              aria-label="Close Time Selector"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#23293a] cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Custom H : M : S Stepper & Direct Input Controls (5s to 4h) */}
        <div className="mb-2.5">
          <div className="flex items-center justify-between text-[9.5px] text-slate-400 mb-1.5 font-sans">
            <span>Custom Duration (5s – 4h)</span>
            <span className="font-mono font-bold text-cyan-400 tabular-nums">
              {formatDurationHmsLabel(duration)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 bg-[#0f131d] border border-[#262c3d] rounded-lg p-2">
            {/* HOURS (0-4) */}
            <div className="flex flex-col items-center">
              <span className="text-[8.5px] text-slate-400 font-sans uppercase mb-1">Hours</span>
              <button
                type="button"
                aria-label="Increase Hours"
                onClick={() => handleAdjustUnit('h', 1)}
                disabled={hours >= 4}
                className="w-full py-1 rounded bg-[#1d2232] hover:bg-[#272e42] disabled:opacity-40 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
              <input
                type="number"
                aria-label="Custom Hours"
                data-testid="custom-duration-hours-input"
                min={0}
                max={4}
                value={hoursInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setHoursInput(val);
                  if (val !== '') {
                    commitTypedInputs(val, minutesInput, secondsInput);
                  }
                }}
                onBlur={() => commitTypedInputs(hoursInput, minutesInput, secondsInput)}
                className="w-full my-1 py-1 bg-[#161a26] border border-[#2a3146] rounded text-center font-black text-xs text-white tabular-nums focus:outline-none focus:border-[#3b82f6]"
              />
              <button
                type="button"
                aria-label="Decrease Hours"
                onClick={() => handleAdjustUnit('h', -1)}
                disabled={hours <= 0}
                className="w-full py-1 rounded bg-[#1d2232] hover:bg-[#272e42] disabled:opacity-40 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
            </div>

            {/* MINUTES (0-59) */}
            <div className="flex flex-col items-center">
              <span className="text-[8.5px] text-slate-400 font-sans uppercase mb-1">Min</span>
              <button
                type="button"
                aria-label="Increase Minutes"
                onClick={() => handleAdjustUnit('m', 1)}
                disabled={duration >= MAX_TRADE_DURATION_SECONDS}
                className="w-full py-1 rounded bg-[#1d2232] hover:bg-[#272e42] disabled:opacity-40 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
              <input
                type="number"
                aria-label="Custom Minutes"
                data-testid="custom-duration-minutes-input"
                min={0}
                max={59}
                value={minutesInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setMinutesInput(val);
                  if (val !== '') {
                    commitTypedInputs(hoursInput, val, secondsInput);
                  }
                }}
                onBlur={() => commitTypedInputs(hoursInput, minutesInput, secondsInput)}
                className="w-full my-1 py-1 bg-[#161a26] border border-[#2a3146] rounded text-center font-black text-xs text-white tabular-nums focus:outline-none focus:border-[#3b82f6]"
              />
              <button
                type="button"
                aria-label="Decrease Minutes"
                onClick={() => handleAdjustUnit('m', -1)}
                disabled={hours === 0 && minutes <= 0}
                className="w-full py-1 rounded bg-[#1d2232] hover:bg-[#272e42] disabled:opacity-40 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
            </div>

            {/* SECONDS (0-59) */}
            <div className="flex flex-col items-center">
              <span className="text-[8.5px] text-slate-400 font-sans uppercase mb-1">Sec</span>
              <button
                type="button"
                aria-label="Increase Seconds"
                onClick={() => handleAdjustUnit('s', 5)}
                disabled={duration >= MAX_TRADE_DURATION_SECONDS}
                className="w-full py-1 rounded bg-[#1d2232] hover:bg-[#272e42] disabled:opacity-40 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
              <input
                type="number"
                aria-label="Custom Seconds"
                data-testid="custom-duration-seconds-input"
                min={0}
                max={59}
                value={secondsInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setSecondsInput(val);
                  if (val !== '') {
                    commitTypedInputs(hoursInput, minutesInput, val);
                  }
                }}
                onBlur={() => commitTypedInputs(hoursInput, minutesInput, secondsInput)}
                className="w-full my-1 py-1 bg-[#161a26] border border-[#2a3146] rounded text-center font-black text-xs text-white tabular-nums focus:outline-none focus:border-[#3b82f6]"
              />
              <button
                type="button"
                aria-label="Decrease Seconds"
                onClick={() => handleAdjustUnit('s', -5)}
                disabled={duration <= MIN_SELF_CAPITAL_DURATION_SECONDS}
                className="w-full py-1 rounded bg-[#1d2232] hover:bg-[#272e42] disabled:opacity-40 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Standard Interval Quick Presets (5s to 4h) */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-[9.5px] text-slate-400 mb-1.5 font-sans">
            <span>Quick Intervals</span>
            <span className="text-[8.5px] text-slate-400">
              {isFundedRestricted ? 'Funded Min: 30s' : 'Self-Capital Min: 5s'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 text-[10px]">
            {STANDARD_INTERVAL_PRESETS.map((preset) => {
              const isLockedForFunded =
                isFundedRestricted && preset.seconds < MIN_TRADE_DURATION_SECONDS;
              const isSelected = duration === preset.seconds;

              return (
                <button
                  key={preset.seconds}
                  type="button"
                  data-testid={`duration-preset-${preset.label}`}
                  onClick={() => {
                    soundEngine.playUiClick();
                    applyCustomDuration(preset.seconds);
                  }}
                  className={`py-1.5 px-1 rounded-md font-bold flex items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                    isSelected
                      ? isLockedForFunded
                        ? 'bg-rose-600 text-white font-black'
                        : 'bg-[#3b82f6] text-white font-black'
                      : isLockedForFunded
                      ? 'bg-[#121621] text-slate-400 hover:text-rose-300 border border-rose-500/30'
                      : 'bg-[#0f131d] text-slate-300 hover:text-white hover:bg-[#1d2333] border border-[#262c3d]'
                  }`}
                >
                  {isLockedForFunded && <Lock className="w-2.5 h-2.5 text-rose-400 shrink-0" />}
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rule 1 Inline Warning Notification if Funded Account attempts < 30s */}
        {(localWarning || (isFundedRestricted && duration < MIN_TRADE_DURATION_SECONDS)) && (
          <div
            data-testid="time-selector-funded-warning"
            className="mb-2 p-2 rounded-lg bg-rose-950/90 border border-rose-500/50 text-[9.5px] text-rose-200 flex items-start gap-1.5 font-sans leading-snug"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span>
              <strong>Funded Account Restriction:</strong> Durations under 30s are blocked on Funded Accounts. Self-Capital accounts can trade from 5s.
            </span>
          </div>
        )}

        {/* Done / Confirm Button */}
        <button
          type="button"
          data-testid="time-selector-apply-btn"
          onClick={() => {
            soundEngine.playUiClick();
            onClose();
          }}
          className="w-full py-1.5 rounded-lg bg-[#3b82f6] hover:bg-blue-500 text-white font-sans font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Done ({formatDurationHmsLabel(duration)})</span>
        </button>
      </div>
    </>
  );
};
