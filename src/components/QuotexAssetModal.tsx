import React, { useState, useEffect, useMemo, useDeferredValue, useCallback, useRef } from 'react';
import { Search, X, Star, TrendingUp, Sparkles, Activity } from 'lucide-react';
import { AssetInfo, BinaryTrade } from '../types';
import {
  getDynamicAssets,
  getLivePayoutPercentage,
  loadFavoritesFromStorage,
  saveFavoritesToStorage,
} from '../utils/storage';
import { getAssetMarketState } from '../utils/priceFeedEngine';
import { soundEngine } from '../utils/soundEffects';
import { resolveTradingViewSymbol } from '../utils/tradingViewOrderLineEngine';
import {
  computeAssetActiveTradeBadge,
  type AssetActiveTradeBadgeInfo,
} from '../utils/supabaseTradeSync';
import { AssetFlagIcon } from './CountryFlagIcon';

interface QuotexAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (asset: AssetInfo) => void;
  currentAssetSymbol: string;
  activeTrades?: BinaryTrade[];
}

type ModalCategoryTab =
  | 'All'
  | 'Favorites'
  | 'Forex'
  | 'Crypto'
  | 'Stocks'
  | 'Commodities';

interface AssetRowItemProps {
  asset: AssetInfo;
  isSelected: boolean;
  isFav: boolean;
  payoutSeed: number;
  activeBadge: AssetActiveTradeBadgeInfo;
  onSelect: (asset: AssetInfo, livePayout: number) => void;
  onToggleFavorite: (e: React.MouseEvent, symbol: string) => void;
}

const ROW_HEIGHT = 56; // px

const AssetRowItem: React.FC<AssetRowItemProps> = React.memo(({
  asset,
  isSelected,
  isFav,
  payoutSeed,
  activeBadge,
  onSelect,
  onToggleFavorite,
}) => {
  const livePayout = getLivePayoutPercentage(asset, payoutSeed);
  const marketState = getAssetMarketState(asset.symbol);
  const displayPrice = marketState?.lastPrice ?? asset.basePrice;
  const tvResolved = useMemo(
    () => resolveTradingViewSymbol(asset.symbol, asset.category),
    [asset.symbol, asset.category]
  );

  return (
    <div
      data-testid={`asset-row-${tvResolved.cleanTicker.replace(/[^A-Z0-9]/g, '')}`}
      data-has-active-trade={activeBadge.hasActiveTrades ? 'true' : 'false'}
      onClick={() => onSelect(asset, livePayout)}
      style={{ height: `${ROW_HEIGHT - 4}px`, willChange: 'transform' }}
      className={`flex items-center justify-between px-2 py-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-colors cursor-pointer hw-accelerate gpu-accelerated mb-1 ${
        isSelected
          ? 'bg-[#ff8800]/15 border border-[#ff8800]/50 text-white'
          : activeBadge.hasActiveTrades
          ? 'bg-[#00e676]/10 border border-[#00e676]/40 text-white'
          : 'hover:bg-white/5 text-slate-300'
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-1.5">
        <button
          type="button"
          onClick={(e) => onToggleFavorite(e, asset.symbol)}
          className="p-0.5 sm:p-1 hover:text-[#ff8800] text-slate-600 transition-colors cursor-pointer shrink-0"
        >
          <Star
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
              isFav ? 'fill-[#ff8800] text-[#ff8800]' : ''
            }`}
          />
        </button>

        <div className="relative w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-[#16161d] border border-white/10 flex items-center justify-center text-xs sm:text-sm font-bold shrink-0">
          <AssetFlagIcon symbol={asset.symbol} category={asset.category} flagEmoji={asset.flag} size="sm" />
          {activeBadge.hasActiveTrades && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2 sm:h-2.5 sm:w-2.5">
              <span className="active-trade-dot-pulse absolute inline-flex h-full w-full rounded-full bg-[#00e676]" />
              <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-[#00e676] border border-[#0e0e12]" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
            <span className="font-black text-white text-[11px] sm:text-sm truncate">
              {asset.symbol.includes('R_') ? asset.symbol : `${asset.symbol} (OTC)`}
            </span>
            <span className="text-[8.5px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold shrink-0 hidden xs:inline">
              {tvResolved.tvSymbol}
            </span>
            {activeBadge.hasActiveTrades && (
              <span
                data-testid={`modal-asset-active-trade-badge-${tvResolved.cleanTicker.replace(/[^A-Z0-9]/g, '')}`}
                className={`active-trade-badge-pulse inline-flex items-center gap-1 text-[8.5px] sm:text-[10px] px-1.5 py-0.2 rounded font-mono font-black shrink-0 border ${
                  activeBadge.isWinning
                    ? 'active-trade-badge-pulse-win bg-[#00e676]/20 text-[#00e676] border-[#00e676]/50'
                    : 'active-trade-badge-pulse-loss bg-[#ff334b]/20 text-[#ff334b] border-[#ff334b]/50'
                }`}
              >
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="active-trade-dot-pulse absolute inline-flex h-full w-full rounded-full bg-[#00e676]" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00e676]" />
                </span>
                <span>{activeBadge.activeCount} OPEN</span>
                <span>•</span>
                <span>{activeBadge.formattedPnL}</span>
              </span>
            )}
          </div>
          <span className="text-[9.5px] sm:text-[11px] text-slate-400 block font-mono truncate">
            {asset.symbol.includes('R_') ? asset.name : `${asset.name} (OTC)`} • {displayPrice.toFixed(asset.pipDecimals)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-4 text-right shrink-0">
        <div>
          <span className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:flex font-sans items-center justify-end gap-1">
            <Activity className="w-2.5 h-2.5 text-emerald-400" /> Live Payout
          </span>
          <span className="text-[11px] sm:text-sm font-black text-emerald-400 bg-emerald-950/70 border border-emerald-500/40 px-1.5 sm:px-2.5 py-0.5 rounded inline-block">
            +{livePayout}%
          </span>
        </div>

        <button
          className={`px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-md sm:rounded-xl text-[10px] sm:text-xs font-bold font-sans transition-all cursor-pointer ${
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
});

AssetRowItem.displayName = 'AssetRowItem';

export const QuotexAssetModal: React.FC<QuotexAssetModalProps> = React.memo(({
  isOpen,
  onClose,
  onSelectAsset,
  currentAssetSymbol,
  activeTrades = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [activeCategory, setActiveCategory] = useState<ModalCategoryTab>('All');
  const [favorites, setFavorites] = useState<string[]>(() => loadFavoritesFromStorage());
  const [payoutSeed, setPayoutSeed] = useState<number>(() => Math.floor(Date.now() / 2500));

  const listContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(480);

  useEffect(() => {
    if (!isOpen) return;
    setFavorites(loadFavoritesFromStorage());
    const interval = setInterval(() => {
      setPayoutSeed(Math.floor(Date.now() / 2500));
    }, 2500);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listContainerRef.current) return;
    const updateHeight = () => {
      if (listContainerRef.current) {
        setContainerHeight(listContainerRef.current.clientHeight || 480);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(listContainerRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    setScrollTop(0);
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [deferredSearch, activeCategory]);

  const toggleFavorite = useCallback((e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    soundEngine.playUiClick();
    setFavorites((prev) => {
      const next = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol];
      saveFavoritesToStorage(next);
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (asset: AssetInfo, livePayout: number) => {
      soundEngine.playUiClick();
      onClose();
      onSelectAsset({ ...asset, payout: livePayout });
    },
    [onSelectAsset, onClose]
  );

  const allAssets = useMemo(() => getDynamicAssets(), []);

  const categoryTabs: { id: ModalCategoryTab; label: string; count: number }[] = useMemo(() => [
    {
      id: 'All',
      label: 'All Markets',
      count: allAssets.length,
    },
    {
      id: 'Favorites',
      label: '★ Watchlist',
      count: favorites.length,
    },
    {
      id: 'Forex',
      label: 'Forex',
      count: allAssets.filter(a => a.category.includes('Forex')).length,
    },
    {
      id: 'Crypto',
      label: 'Crypto',
      count: allAssets.filter(a => a.category.includes('Crypto')).length,
    },
    {
      id: 'Stocks',
      label: 'Stocks & Indices',
      count: allAssets.filter(a => a.category.includes('Stocks') || a.category.includes('Indices')).length,
    },
    {
      id: 'Commodities',
      label: 'Commodities',
      count: allAssets.filter(a => a.category.includes('Commodities')).length,
    },
  ], [allAssets, favorites]);

  const filteredAssets = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return allAssets.filter((asset) => {
      if (q.length > 0) {
        const tvInfo = resolveTradingViewSymbol(asset.symbol, asset.category);
        return (
          asset.symbol.toLowerCase().includes(q) ||
          asset.name.toLowerCase().includes(q) ||
          tvInfo.tvSymbol.toLowerCase().includes(q)
        );
      }

      if (activeCategory === 'Favorites') return favorites.includes(asset.symbol);
      if (activeCategory === 'Forex') return asset.category.includes('Forex');
      if (activeCategory === 'Crypto') return asset.category.includes('Crypto');
      if (activeCategory === 'Stocks') return asset.category.includes('Stocks') || asset.category.includes('Indices');
      if (activeCategory === 'Commodities') return asset.category.includes('Commodities');

      return true; // 'All'
    });
  }, [allAssets, deferredSearch, activeCategory, favorites]);

  // Virtualized Window Calculation
  const totalListHeight = filteredAssets.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const visibleItemCount = Math.ceil(containerHeight / ROW_HEIGHT) + 4;
  const endIndex = Math.min(filteredAssets.length, startIndex + visibleItemCount);
  const visibleAssets = filteredAssets.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  if (!isOpen) return null;

  return (
    <div
      data-testid="native-asset-selector-modal"
      className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center p-0 sm:p-4 bg-black/95 sm:bg-black/90 hw-accelerate gpu-accelerated mobile-trading-controls animate-bft-modal"
    >
      <div className="w-full h-full sm:h-auto sm:max-w-3xl sm:rounded-2xl rounded-none bg-[#0e0e12] sm:border sm:border-[#ff8800]/40 shadow-2xl overflow-hidden flex flex-col max-h-full sm:max-h-[88vh] hw-accelerate gpu-accelerated">
        {/* Header */}
        <div className="px-3 py-2 sm:p-4 bg-[#0a0a0d] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800] shrink-0">
              <TrendingUp className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-base font-black text-white font-mono flex items-center gap-1.5 sm:gap-2 truncate">
                <span className="truncate">Select Market</span>
                <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 w-fit shrink-0">
                  {allAssets.length}+ Markets
                </span>
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block truncate">
                Select any Forex, Crypto, Stock, or Commodity market to instantly synchronize chart.
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-asset-modal-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Category Tabs */}
        <div className="px-3 py-2 sm:p-4 border-b border-white/10 space-y-2 sm:space-y-3 bg-[#111116] shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              data-testid="asset-modal-search-input"
              placeholder="Search 260+ markets or tickers (e.g. EURUSD, BTCUSDT, AAPL, XAUUSD)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 sm:py-2.5 bg-[#0a0a0d] border border-white/15 rounded-lg sm:rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#ff8800] transition-colors font-mono"
            />
          </div>

          <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-0.5 font-mono text-[11px] sm:text-xs touch-scroll no-scrollbar">
            {categoryTabs.map((tab) => {
              const isActive = activeCategory === tab.id && searchQuery.trim().length === 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`asset-category-tab-${tab.id}`}
                  onClick={() => {
                    soundEngine.playUiClick();
                    setSearchQuery('');
                    setActiveCategory(tab.id);
                  }}
                  className={`px-2.5 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl font-bold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 sm:gap-1.5 border ${
                    isActive
                      ? 'bg-[#ff8800] text-slate-950 font-black border-[#ff8800]'
                      : 'bg-[#16161d] text-slate-300 hover:text-white hover:bg-[#1f1f29] border-white/10'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded font-black ${
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

        {/* Virtualized Asset List */}
        <div
          ref={listContainerRef}
          onScroll={handleScroll}
          className="p-2 sm:p-3 overflow-y-auto font-mono flex-1 touch-scroll custom-scrollbar relative"
          style={{ minHeight: '240px' }}
        >
          {filteredAssets.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs">
              No matching trading instruments found.
            </div>
          ) : (
            <div style={{ height: `${totalListHeight}px`, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${offsetY}px)`,
                  willChange: 'transform',
                }}
              >
                {visibleAssets.map((asset) => {
                  const marketState = getAssetMarketState(asset.symbol);
                  const rowPrice = marketState?.lastPrice ?? asset.basePrice;
                  const activeBadge = computeAssetActiveTradeBadge(
                    asset.symbol,
                    activeTrades,
                    rowPrice
                  );
                  return (
                    <AssetRowItem
                      key={asset.symbol}
                      asset={asset}
                      isSelected={asset.symbol === currentAssetSymbol}
                      isFav={favorites.includes(asset.symbol)}
                      payoutSeed={payoutSeed}
                      activeBadge={activeBadge}
                      onSelect={handleSelect}
                      onToggleFavorite={toggleFavorite}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-3 py-2 sm:p-3 bg-[#0a0a0d] border-t border-white/10 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 font-mono shrink-0">
          <span className="flex items-center gap-1.5 text-[#ffaa00] truncate">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#ff8800] shrink-0" /> 24/7 OTC Feeds ({filteredAssets.length} active)
          </span>
          <span className="text-emerald-400 font-bold shrink-0">Zero Slippage</span>
        </div>
      </div>
    </div>
  );
});

QuotexAssetModal.displayName = 'QuotexAssetModal';


