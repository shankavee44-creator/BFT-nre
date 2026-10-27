import React, { useState, useEffect } from 'react';
import { X, Sliders, Check, Palette } from 'lucide-react';
import { IndicatorSettings } from '../utils/technicalIndicators';
import { soundEngine } from '../utils/soundEffects';

interface IndicatorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: IndicatorSettings;
  onSave: (newSettings: IndicatorSettings) => void;
}

const COLOR_PALETTE = [
  '#2962ff', // Neon Blue
  '#00e5ff', // Cyan
  '#00e676', // Mint Green
  '#ff9800', // Gold/Amber
  '#ff334b', // Crimson Red
  '#e040fb', // Purple
  '#ffffff', // White
];

export const IndicatorSettingsModal: React.FC<IndicatorSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [current, setCurrent] = useState<IndicatorSettings>(settings);
  const [activeTab, setActiveTab] = useState<'ma' | 'bb' | 'rsi' | 'macd'>('ma');

  useEffect(() => {
    setCurrent(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playUiClick();
    onSave(current);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 font-sans">
      <div className="w-full max-w-lg rounded-2xl bg-[#1e222d] border border-[#2a2e39] p-6 shadow-2xl text-xs font-mono">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2a2e39] mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-black text-white">Technical Indicator Parameters</h4>
          </div>
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-[#252b3b] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Indicator Category Tabs */}
        <div className="flex gap-1.5 mb-4 bg-[#131722] p-1 rounded-xl border border-[#2a2e39]">
          {[
            { id: 'ma', label: 'Moving Averages' },
            { id: 'bb', label: 'Bollinger Bands' },
            { id: 'rsi', label: 'RSI' },
            { id: 'macd', label: 'MACD' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveTab(t.id as any);
              }}
              className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                activeTab === t.id
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* TAB 1: MOVING AVERAGES (SMA / EMA) */}
          {activeTab === 'ma' && (
            <div className="space-y-3.5">
              {/* SMA Section */}
              <div className="p-3.5 rounded-xl bg-[#131722] border border-[#2a2e39] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">Simple Moving Average (SMA)</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={current.showSma}
                      onChange={(e) => setCurrent({ ...current, showSma: e.target.checked })}
                      className="accent-cyan-500 rounded cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-300">Visible</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Period</label>
                    <input
                      type="number"
                      min="2"
                      max="200"
                      value={current.smaPeriod}
                      onChange={(e) => setCurrent({ ...current, smaPeriod: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Line Width</label>
                    <select
                      value={current.smaWidth}
                      onChange={(e) => setCurrent({ ...current, smaWidth: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                    >
                      <option value="1">1px (Thin)</option>
                      <option value="2">2px (Medium)</option>
                      <option value="3">3px (Bold)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1.5">Color</label>
                  <div className="flex gap-2">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrent({ ...current, smaColor: c })}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          current.smaColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* EMA Section */}
              <div className="p-3.5 rounded-xl bg-[#131722] border border-[#2a2e39] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">Exponential Moving Average (EMA)</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={current.showEma}
                      onChange={(e) => setCurrent({ ...current, showEma: e.target.checked })}
                      className="accent-cyan-500 rounded cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-300">Visible</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Period</label>
                    <input
                      type="number"
                      min="2"
                      max="200"
                      value={current.emaPeriod}
                      onChange={(e) => setCurrent({ ...current, emaPeriod: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Line Width</label>
                    <select
                      value={current.emaWidth}
                      onChange={(e) => setCurrent({ ...current, emaWidth: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                    >
                      <option value="1">1px (Thin)</option>
                      <option value="2">2px (Medium)</option>
                      <option value="3">3px (Bold)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1.5">Color</label>
                  <div className="flex gap-2">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrent({ ...current, emaColor: c })}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          current.emaColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BOLLINGER BANDS */}
          {activeTab === 'bb' && (
            <div className="p-3.5 rounded-xl bg-[#131722] border border-[#2a2e39] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">Bollinger Bands</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={current.showBollinger}
                    onChange={(e) => setCurrent({ ...current, showBollinger: e.target.checked })}
                    className="accent-cyan-500 rounded cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-300">Visible</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Period</label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={current.bollingerPeriod}
                    onChange={(e) => setCurrent({ ...current, bollingerPeriod: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Std Deviation (σ)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.5"
                    value={current.bollingerStd}
                    onChange={(e) => setCurrent({ ...current, bollingerStd: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1.5">Band Color</label>
                <div className="flex gap-2">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrent({ ...current, bollingerColor: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                        current.bollingerColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RSI */}
          {activeTab === 'rsi' && (
            <div className="p-3.5 rounded-xl bg-[#131722] border border-[#2a2e39] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">Relative Strength Index (RSI)</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={current.showRsi}
                    onChange={(e) => setCurrent({ ...current, showRsi: e.target.checked })}
                    className="accent-cyan-500 rounded cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-300">Visible</span>
                </label>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">RSI Period</label>
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={current.rsiPeriod}
                  onChange={(e) => setCurrent({ ...current, rsiPeriod: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1.5">Line Color</label>
                <div className="flex gap-2">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrent({ ...current, rsiColor: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                        current.rsiColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MACD */}
          {activeTab === 'macd' && (
            <div className="p-3.5 rounded-xl bg-[#131722] border border-[#2a2e39] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">MACD (Moving Average Convergence Divergence)</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={current.showMacd}
                    onChange={(e) => setCurrent({ ...current, showMacd: e.target.checked })}
                    className="accent-cyan-500 rounded cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-300">Visible</span>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Fast Period</label>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={current.macdFast}
                    onChange={(e) => setCurrent({ ...current, macdFast: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Slow Period</label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={current.macdSlow}
                    onChange={(e) => setCurrent({ ...current, macdSlow: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Signal Period</label>
                  <input
                    type="number"
                    min="2"
                    max="30"
                    value={current.macdSignal}
                    onChange={(e) => setCurrent({ ...current, macdSignal: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:border-cyan-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1.5">MACD Line Color</label>
                  <div className="flex gap-1.5">
                    {COLOR_PALETTE.slice(0, 5).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrent({ ...current, macdColor: c })}
                        className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                          current.macdColor === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1.5">Signal Line Color</label>
                  <div className="flex gap-1.5">
                    {COLOR_PALETTE.slice(2, 7).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrent({ ...current, macdSignalColor: c })}
                        className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                          current.macdSignalColor === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-[#131722] hover:bg-[#252b3b] border border-[#2a2e39] text-slate-300 font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-black shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
            >
              Apply Indicators
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
