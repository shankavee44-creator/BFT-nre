import React, { useState } from 'react';
import { Bell, BellRing, Plus, Trash2, X, Check, AlertCircle } from 'lucide-react';
import { AssetInfo } from '../types';
import { soundEngine } from '../utils/soundEffects';

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
  createdAt: number;
  triggered: boolean;
  active: boolean;
}

interface PriceAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAsset: AssetInfo;
  currentPrice: number;
  alerts: PriceAlert[];
  onAddAlert: (alert: PriceAlert) => void;
  onDeleteAlert: (id: string) => void;
  onToggleAlert: (id: string) => void;
}

export const PriceAlertModal: React.FC<PriceAlertModalProps> = ({
  isOpen,
  onClose,
  selectedAsset,
  currentPrice,
  alerts,
  onAddAlert,
  onDeleteAlert,
  onToggleAlert,
}) => {
  const [targetPrice, setTargetPrice] = useState<string>(currentPrice.toString());
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [notificationNote, setNotificationNote] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(targetPrice);
    if (isNaN(priceNum) || priceNum <= 0) return;

    soundEngine.playUiClick();
    const newAlert: PriceAlert = {
      id: `ALT-${Date.now().toString().slice(-6)}`,
      symbol: selectedAsset.symbol,
      targetPrice: priceNum,
      condition,
      createdAt: Date.now(),
      triggered: false,
      active: true,
    };

    onAddAlert(newAlert);
    setNotificationNote(`Price alert set for ${selectedAsset.symbol} ${condition} ${priceNum.toFixed(selectedAsset.pipDecimals)}`);
    setTimeout(() => setNotificationNote(null), 3000);

    // Request native notification permission if available
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  const currentAssetAlerts = alerts.filter((a) => a.symbol === selectedAsset.symbol);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-[#090e1a] border border-slate-700/80 shadow-2xl p-6 font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white font-sans">
                Real-Time Price Alerts
              </h3>
              <p className="text-slate-400 text-[11px]">
                Instant browser & audio notifications when threshold is crossed
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Asset Spot Price Banner */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#060a14] border border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">{selectedAsset.flag || '📈'}</span>
            <span className="font-bold text-white text-sm">{selectedAsset.symbol}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase">Spot Price</span>
            <span className="text-amber-400 font-bold text-sm">
              {currentPrice.toFixed(selectedAsset.pipDecimals)}
            </span>
          </div>
        </div>

        {/* Create Alert Form */}
        <form onSubmit={handleCreate} className="space-y-3 mb-5 p-3.5 rounded-xl bg-[#0d1424] border border-slate-800">
          <div className="text-[11px] font-bold text-white uppercase">Set New Alert</div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCondition('ABOVE')}
              className={`py-2 rounded-lg font-bold transition-all cursor-pointer ${
                condition === 'ABOVE'
                  ? 'bg-emerald-500 text-slate-950 font-black glow-mint'
                  : 'bg-[#060a14] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Price Rises Above (≥)
            </button>
            <button
              type="button"
              onClick={() => setCondition('BELOW')}
              className={`py-2 rounded-lg font-bold transition-all cursor-pointer ${
                condition === 'BELOW'
                  ? 'bg-rose-500 text-white font-black glow-red'
                  : 'bg-[#060a14] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Price Drops Below (≤)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="Target price threshold..."
              className="flex-1 px-3 py-2 rounded-lg bg-[#060a14] border border-slate-700 text-white font-mono focus:outline-none focus:border-amber-400"
              required
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black cursor-pointer glow-gold transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Set Alert</span>
            </button>
          </div>

          {notificationNote && (
            <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>{notificationNote}</span>
            </div>
          )}
        </form>

        {/* Existing Alerts for Current Asset */}
        <div>
          <div className="flex items-center justify-between text-slate-300 font-semibold mb-2">
            <span>Active Alerts for {selectedAsset.symbol} ({currentAssetAlerts.length})</span>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
            {currentAssetAlerts.length === 0 ? (
              <div className="p-4 text-center text-slate-500 bg-[#060a14] rounded-xl border border-slate-800/80">
                No active price alerts set for this pair.
              </div>
            ) : (
              currentAssetAlerts.map((alt) => (
                <div
                  key={alt.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#060a14] border border-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        alt.condition === 'ABOVE'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {alt.condition === 'ABOVE' ? '≥ ABOVE' : '≤ BELOW'}
                    </span>
                    <span className="font-bold text-white text-xs">
                      {alt.targetPrice.toFixed(selectedAsset.pipDecimals)}
                    </span>
                    {alt.triggered && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                        Triggered
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleAlert(alt.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        alt.active
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {alt.active ? 'ACTIVE' : 'MUTED'}
                    </button>
                    <button
                      onClick={() => onDeleteAlert(alt.id)}
                      className="p-1 rounded hover:bg-rose-950 text-slate-500 hover:text-rose-400 cursor-pointer"
                      title="Delete Alert"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
