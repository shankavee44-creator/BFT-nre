import React, { useState, useEffect } from 'react';
import { Search, X, Star, TrendingUp, Sparkles, Activity } from 'lucide-react';
import { AssetInfo } from '../types';
import { getDynamicAssets, getLivePayoutPercentage } from '../utils/storage';
import { getAssetMarketState } from '../utils/priceFeedEngine';
import { soundEngine } from '../utils/soundEffects';

interface QuotexAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (asset: AssetInfo) => void;
  currentAssetSymbol: string;
}

type ModalCategoryTab =
  | 'Forex (OTC)'
  | 'Crypto (OTC)'
  | 'Commodities (OTC)'
  | 'Stocks (OTC)'
  | 'All'
  | 'Favorites';

export const QuotexAssetModal: React.FC<QuotexAssetModalProps> = ({
  isOpen,
  onClose,
  onSelectAsset,
  currentAssetSymbol,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ModalCategoryTab>('All');
  const [favorites, setFavorites] = useState<string[]>([
    'EUR/USD (OTC)',
    'GBP/JPY (OTC)',
    'BTC/USD (OTC)',
    'XAU/USD (OTC)',
    'TSLA (OTC)',
  ]);
  const [payoutSeed, setPayoutSeed] = useState<number>(() => Math.floor(Date.now() / 2500));

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setPayoutSeed(Math.floor(Date.now() / 500));
    }, 500);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleFavorite = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    soundEngine.playUiClick();
    if (favorites.includes(symbol)) {
      setFavorites(favorites.filter((s) => s !== symbol));
    } else {
      setFavorites([...favorites, symbol]);
    }
  };

  const categoryTabs: { id: ModalCategoryTab; label: string; count: number }[] = [
    {
      id: 'All',
      label: 'All Markets',
      count: getDynamicAssets().length,
    },
    {
      id: 'Favorites',
      label: '★ Watchlist',
      count: favorites.length,
    },
  ];

  const filteredAssets = getDynamicAssets().filter((asset) => {
    const matchesSearch =
      asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (searchQuery.trim().length > 0) {
      return matchesSearch;
    }

    if (activeCategory === 'Favorites') return favorites.includes(asset.symbol);
    return true; // Show all for 'All' or any other tab
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-bft-modal">
      <div className="w-full max-w-3xl rounded-2xl bg-[#0e0e12] border border-[#ff8800]/40 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        {/* Header */}
        <div className="p-4 bg-[#0a0a0d] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800]">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white font-mono flex items-center gap-2">
                Select OTC Trading Instrument
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                  {getDynamicAssets().length}+ Live OTC Feeds • Up to 95% Payout
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Explore a wide range of institutional OTC instruments including Forex, Crypto, and Commodities.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Category Tabs */}
        <div className="p-4 border-b border-white/10 space-y-3 bg-[#111116]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search 100+ OTC markets (e.g. EUR/USD, BTC, Gold, Silver, Tesla, Apple, NVIDIA)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0d] border border-white/15 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#ff8800] transition-colors font-mono"
              autoFocus
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 font-mono text-xs">
            {categoryTabs.map((tab) => {
              const isActive = activeCategory === tab.id && searchQuery.trim().length === 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    soundEngine.playUiClick();
                    setSearchQuery('');
                    setActiveCategory(tab.id);
                  }}
                  className={`px-3 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 border ${
                    isActive
                      ? 'bg-[#ff8800] text-slate-950 font-black border-[#ff8800]'
                      : 'bg-[#16161d] text-slate-300 hover:text-white hover:bg-[#1f1f29] border-white/10'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-black ${
                      isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-black/40 text-[#ffaa00]'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Asset List */}
        <div className="p-3 overflow-y-auto divide-y divide-white/5 font-mono flex-1">
          {filteredAssets.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No matching OTC trading instruments found.
            </div>
          ) : (
            filteredAssets.map((asset) => {
              const isSelected = asset.symbol === currentAssetSymbol;
              const isFav = favorites.includes(asset.symbol);
              const livePayout = getLivePayoutPercentage(asset, payoutSeed);
              const marketState = getAssetMarketState(asset.symbol);
              const displayPrice = marketState?.lastPrice ?? asset.basePrice;

              return (
                <div
                  key={asset.symbol}
                  onClick={() => {
                    soundEngine.playUiClick();
                    onSelectAsset({ ...asset, payout: livePayout });
                    onClose();
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#ff8800]/15 border border-[#ff8800]/50 text-white'
                      : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => toggleFavorite(e, asset.symbol)}
                      className="p-1 hover:text-[#ff8800] text-slate-600 transition-colors cursor-pointer"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          isFav ? 'fill-[#ff8800] text-[#ff8800]' : ''
                        }`}
                      />
                    </button>

                    <div className="w-9 h-9 rounded-xl bg-[#16161d] border border-white/10 flex items-center justify-center text-sm font-bold shrink-0">
                      {asset.flag || '📈'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm">
                          {asset.symbol}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#ffaa00] border border-[#ff8800]/25 uppercase font-bold">
                          {asset.category}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block font-mono">
                        {asset.name} • {displayPrice.toFixed(asset.pipDecimals)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans flex items-center justify-end gap-1">
                        <Activity className="w-2.5 h-2.5 text-emerald-400" /> Live Payout
                      </span>
                      <span className="text-sm font-black text-emerald-400 bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-0.5 rounded inline-block mt-0.5">
                        +{livePayout}%
                      </span>
                    </div>

                    <button
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-sans transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#ff8800] text-slate-950 font-black'
                          : 'bg-[#1a1a22] hover:bg-[#ff8800] hover:text-slate-950 text-slate-200 border border-white/10'
                      }`}
                    >
                      {isSelected ? 'Active' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-[#0a0a0d] border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5 text-[#ffaa00]">
            <Sparkles className="w-3.5 h-3.5 text-[#ff8800]" /> 24/7 Institutional Algorithmic OTC Feeds ({filteredAssets.length} active)
          </span>
          <span className="text-emerald-400 font-bold">Zero Slippage • Global Sync Enabled</span>
        </div>
      </div>
    </div>
  );
};
