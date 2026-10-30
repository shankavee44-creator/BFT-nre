import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  CheckCircle2,
  Zap,
  Activity,
  ChevronDown,
  Sliders,
  ToggleLeft,
  ToggleRight,
  AlertOctagon,
  ShieldAlert,
  Volume2,
  VolumeX,
  X,
  Plus,
  Radio,
  Trophy,
  Layers,
  ZoomIn,
  ZoomOut,
  HelpCircle,
  ShieldCheck,
  BellRing,
  Lock,
  Keyboard,
  RotateCcw,
  Globe,
  Headphones,
  User,
  PenTool,
  Move,
  Trash2,
  Minus,
  Sparkles,
  Users,
  ChevronLeft,
  ChevronUp,
  MoreHorizontal,
  Target,
  Pencil,
  Copy,
} from 'lucide-react';
import {
  TradingAccount,
  BinaryTrade,
  BinaryOptionDirection,
  AssetInfo,
  Candle,
  UserProfile,
} from '../types';
import {
  DEFAULT_ASSETS,
  getLivePayoutPercentage,
  findAssetBySymbol,
  normalizeAssetSymbol,
  loadSelectedAssetSymbol,
  saveSelectedAssetSymbol,
  loadOpenAssetTabSymbols,
  saveOpenAssetTabSymbols,
  loadSelectedTimeframe,
  saveSelectedTimeframe,
  loadChartType,
  saveChartType,
  registerDynamicAssets,
} from '../utils/storage';
import { broadcastSyncEvent, subscribeToSyncEvents } from '../utils/crossTabSync';
import {
  isValidTradeDuration,
  isPositionSizeSpike,
  calculateDrawdownMetrics,
  isMartingalePattern,
  isHedgingViolation,
  isRiskBarricadeActive,
  evaluateAccountBreach,
  getNextDailyResetTimestamp,
  resetSoftBreachedAccount,
  isDuringRestrictedNewsWindow,
  checkMaxRiskPerTradeViolation,
  isLiveFundedAccount,
  isPersonalLiveAccount,
  isDemoAccount,
  getAccountStatusBadgeLabel,
  getChallengeProfitTarget,
} from '../utils/propRules';
import {
  calculateHeikinAshi,
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  calculateFibonacciLevels,
  IndicatorSettings,
  DEFAULT_INDICATOR_SETTINGS,
} from '../utils/technicalIndicators';
import {
  getOrCreateMasterHistory,
  stepOrganicLiveTick,
  aggregateCandlesForTimeframe,
  prependHistoricalCandles,
  getAssetMarketState,
  getAssetTimeOffsetMs,
} from '../utils/priceFeedEngine';
import {
  calculateVisibleWindow,
  computeReleaseVelocity,
  stepMomentum,
  calculateAnchoredZoom,
  translatePanOffsetForTimeframe,
  DragSample,
} from '../utils/chartVirtualizationEngine';
import {
  computeTradeHistoryChartMarkers,
  findHoveredTradeMarker,
  generateSeededPastTradesForCandles,
  TradeChartMarkerPoint,
  computeInlineTradeResultBadgeBox,
  formatInlineTradeResultBadge,
  priceToCanvasY,
  timestampToCanvasX,
} from '../utils/tradeChartOverlay';
import {
  DrawingToolId,
  DrawingLineStyle,
  ChartDrawingObject,
  QUOTEX_DRAWING_TOOLS,
  DRAWING_COLOR_PALETTE,
  createInitialDrawing,
  updateDrawingOnDrag,
  finalizeDrawingObject,
  translateDrawing,
  updateDrawingHandle,
  findHitDrawing,
  findHitDrawingHandle,
  renderDrawingOnCanvas,
} from '../utils/drawingToolsEngine';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';
import { TradingDrawer } from './TradingDrawer';
import { AccountBreachModal } from './AccountBreachModal';
import { QuotexAssetModal } from './QuotexAssetModal';
import { QuotexSignalsDrawer } from './QuotexSignalsDrawer';
import { QuotexLeaderboardModal } from './QuotexLeaderboardModal';
import { QuotexMobileDock } from './QuotexMobileDock';
import { QuotexMobileNav } from './QuotexMobileNav';
import { PriceAlertModal, PriceAlert } from './PriceAlertModal';
import { LightweightTradingChart } from './LightweightTradingChart';
import { soundEngine } from '../utils/soundEffects';
import { supabaseMarketSync } from '../utils/supabaseMarketSync';
import { supabase } from '../utils/supabase';
import { appendLiveTick } from '../utils/priceFeedEngine';
import {
  liveMarketFeed,
  LiveFeedStatus,
  calculateTradeSettlement,
  computeAccountWinRate,
} from '../utils/liveMarketFeed';
import {
  apiPlaceTrade,
  apiSettleTrade,
  apiUpdateAccountState,
} from '../utils/apiClient';

import {
  calculateCandleCountdown,
  calculatePinchZoomLevel,
  calculateTouchPanOffset,
  formatMobileAccountBalance,
  resolveMobileTradesDrawerAction,
  MobileTradesTab,
} from '../utils/quotexMobile';

interface TradingTerminalProps {
  account?: TradingAccount | null;
  accounts?: TradingAccount[];
  onSelectAccount?: (id: string) => void;
  onUpdateAccount: (updated: TradingAccount) => void;
  trades: BinaryTrade[];
  onAddTrade: (trade: BinaryTrade) => void;
  onUpdateTrade: (trade: BinaryTrade) => void;
  onOpenWithdrawalModal: () => void;
  onOpenDepositModal?: () => void;
  onOpenChallengeModal?: () => void;
  onNavigateTab?: (tab: string) => void;
  userProfile?: UserProfile;
  onPassChallengePhase?: (account: TradingAccount) => void;
}

export type ChartType = 'candles' | 'heikin-ashi' | 'line' | 'bars';
export type Timeframe = '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1D';
export type DrawingTool = DrawingToolId;
export type ChartDrawing = ChartDrawingObject;

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '5s': 5,
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
};

const EXPIRY_PRESETS = [5, 15, 30, 60, 120, 300, 900, 1800, 3600, 14400];

function formatTimerDisplay(seconds: number): string {
  if (seconds < 60) {
    return `00:00:${seconds < 10 ? '0' : ''}${seconds}`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `00:${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function getClockExpiry(seconds: number): string {
  const d = new Date(Date.now() + seconds * 1000);
  return d.toTimeString().split(' ')[0];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  } else {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

export const TradingTerminal: React.FC<TradingTerminalProps> = ({
  account,
  accounts = [],
  onSelectAccount,
  onUpdateAccount,
  trades,
  onAddTrade,
  onUpdateTrade,
  onOpenWithdrawalModal,
  onOpenDepositModal,
  onOpenChallengeModal,
  onNavigateTab,
  userProfile,
  onPassChallengePhase,
}) => {
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  // Quotex Open OTC Asset Tabs across Forex, Crypto, Commodities & Stocks
  const [openTabs, setOpenTabs] = useState<AssetInfo[]>(() => {
    const savedSymbols = loadOpenAssetTabSymbols();
    const resolved = savedSymbols.map((s) => findAssetBySymbol(s)).filter(Boolean) as AssetInfo[];
    if (resolved.length > 0) return resolved;
    return [
      findAssetBySymbol('EUR/USD (OTC)'),
      findAssetBySymbol('GBP/JPY (OTC)'),
      findAssetBySymbol('BTC/USDT (OTC)'),
      findAssetBySymbol('XAU/USD (OTC)'),
      findAssetBySymbol('AAPL (OTC)'),
    ];
  });
  const [selectedAsset, setSelectedAsset] = useState<AssetInfo>(() => {
    const savedSym = loadSelectedAssetSymbol();
    return findAssetBySymbol(savedSym);
  });
  const selectedAssetRef = useRef(selectedAsset);
  useEffect(() => {
    selectedAssetRef.current = selectedAsset;
  }, [selectedAsset]);
  const [currentPrice, setCurrentPrice] = useState<number>(() => {
    const store = getAssetMarketState(selectedAsset?.symbol || 'EUR/USD (OTC)');
    return store?.lastPrice ?? selectedAsset?.basePrice ?? 1.08425;
  });
  const [candles, setCandles] = useState<Candle[]>([]);
  const [payoutSeed, setPayoutSeed] = useState<number>(() => Math.floor(Date.now() / 3000));

  // Charting controls & Asset-Specific State Isolation for Indicators & Drawings
  const [timeframe, setTimeframe] = useState<Timeframe>(() => {
    const savedTf = loadSelectedTimeframe() as Timeframe;
    if (savedTf && TIMEFRAME_SECONDS[savedTf]) return savedTf;
    return '1m';
  });
  const prevTimeframeRef = useRef<Timeframe>(timeframe);
  const [chartType, setChartType] = useState<ChartType>(() => {
    const savedCt = loadChartType() as ChartType;
    if (savedCt && ['candles', 'heikin-ashi', 'line', 'bars'].includes(savedCt)) return savedCt;
    return 'candles';
  });
  const [indicatorsByAsset, setIndicatorsByAsset] = useState<Record<string, IndicatorSettings>>({});
  const indicators = indicatorsByAsset[selectedAsset.symbol] || DEFAULT_INDICATOR_SETTINGS;
  const setIndicators: React.Dispatch<React.SetStateAction<IndicatorSettings>> = React.useCallback(
    (updater) => {
      const sym = selectedAsset.symbol;
      setIndicatorsByAsset((prev) => {
        const cur = prev[sym] || DEFAULT_INDICATOR_SETTINGS;
        const next = typeof updater === 'function' ? updater(cur) : updater;
        return { ...prev, [sym]: next };
      });
    },
    [selectedAsset.symbol]
  );
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Mobile Responsiveness, Practice Fallback Account & Canvas Resize State
  const [isMobileMoreMenuOpen, setIsMobileMoreMenuOpen] = useState<boolean>(false);
  const [mobileNavTab, setMobileNavTab] = useState<'chart' | 'signals' | 'chat' | 'hub'>('chart');
  const [isMobileQuickToolsOpen, setIsMobileQuickToolsOpen] = useState<boolean>(false);
  const [candleCountdown, setCandleCountdown] = useState(() =>
    calculateCandleCountdown(Date.now(), TIMEFRAME_SECONDS['1m'])
  );
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [demoPracticeAccount, setDemoPracticeAccount] = useState<TradingAccount>(() => ({
    id: 'BFT-10000',
    loginId: 'BFT-10000',
    passwordHash: '',
    tier: 'two-step',
    tierName: 'Challenge Account',
    size: 10000,
    initialBalance: 10000.9,
    currentBalance: 10000.9,
    startingDayEquity: 10000.9,
    equity: 10000.9,
    dailyLossLimitPercent: 8,
    maxOverallLossPercent: 20,
    maxRiskPerTradePercent: 5,
    status: 'active',
    createdDate: '2026-10-27',
    lastActiveDate: '2026-10-27',
    phase: 'phase_1',
    tradingDaysCompleted: 1,
    tradesCount: 0,
    winRate: 100,
  }));
  const effectiveAccount = account || demoPracticeAccount;
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStartDistRef = useRef<number | null>(null);
  const initialTouchZoomRef = useRef<number>(1);

  // Technical Drawing Suite & Pencil Side-Drawer State (Isolated Per Asset Pair)
  const [isDrawingDrawerOpen, setIsDrawingDrawerOpen] = useState<boolean>(false);
  const [drawerActiveSection, setDrawerActiveSection] = useState<'drawings' | 'indicators'>('drawings');
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool>('none');
  const [lastUsedDrawingTool, setLastUsedDrawingTool] = useState<DrawingTool>('trendline');
  const [drawingColor, setDrawingColor] = useState<string>('#ff8800');
  const [drawingWidth, setDrawingWidth] = useState<number>(2);
  const [drawingLineStyle, setDrawingLineStyle] = useState<DrawingLineStyle>('solid');
  const [drawingsByAsset, setDrawingsByAsset] = useState<Record<string, ChartDrawing[]>>({});
  const drawings = drawingsByAsset[selectedAsset.symbol] || [];
  const setDrawings: React.Dispatch<React.SetStateAction<ChartDrawing[]>> = React.useCallback(
    (updater) => {
      const sym = selectedAsset.symbol;
      setDrawingsByAsset((prev) => {
        const cur = prev[sym] || [];
        const next = typeof updater === 'function' ? updater(cur) : updater;
        return { ...prev, [sym]: next };
      });
    },
    [selectedAsset.symbol]
  );
  const [currentDrawing, setCurrentDrawing] = useState<ChartDrawing | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null);
  const draggingDrawingRef = useRef<{
    id: string;
    mode: 'move' | 'start' | 'end' | 'control';
    lastX: number;
    lastY: number;
  } | null>(null);

  // Reset active selection when switching asset pair so drawings never bleed across markets
  useEffect(() => {
    setCurrentDrawing(null);
    setSelectedDrawingId(null);
    setHoveredDrawingId(null);
  }, [selectedAsset.symbol]);

  // Smooth 60fps interpolated price state
  const [smoothPrice, setSmoothPrice] = useState<number>(1.08425);
  const targetPriceRef = useRef<number>(1.08425);
  const smoothPriceRef = useRef<number>(1.08425);
  const lastSmoothStateUpdateRef = useRef<number>(0);
  const bgTickCounterRef = useRef<number>(0);
  const candleSyncCounterRef = useRef<number>(0);

  // Chart Navigation, 60fps Inertia Panning & TradingView Crosshair / OHLC Inspector
  const [panOffset, setPanOffset] = useState<number>(0);
  const panOffsetFloatRef = useRef<number>(0);
  const panVelocityRef = useRef<number>(0);
  const dragSamplesRef = useRef<DragSample[]>([]);
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const dragStartXRef = useRef<number>(0);
  const initialPanOffsetRef = useRef<number>(0);

  // Dual-Mode Expiry: 'timer' (duration) vs 'time' (clock expiry)
  const [expiryMode, setExpiryMode] = useState<'timer' | 'time'>('timer');
  const [duration, setDuration] = useState<number>(60);

  // Investment parameters & Quotex Right-Panel controls
  const [investment, setInvestment] = useState<number>(50);
  const [investmentMode, setInvestmentMode] = useState<'usd' | 'percent'>('usd');
  const [pendingOrderEnabled, setPendingOrderEnabled] = useState<boolean>(false);
  const [pendingTriggerPrice, setPendingTriggerPrice] = useState<string>('');
  const [rightPanelTab, setRightPanelTab] = useState<'trades' | 'history'>('trades');
  const [oneClickTrading, setOneClickTrading] = useState<boolean>(true);
  const [pendingTradeDirection, setPendingTradeDirection] = useState<BinaryOptionDirection | null>(null);

  // Notifications & Modals
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isSignalsDrawerOpen, setIsSignalsDrawerOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isBreachModalOpen, setIsBreachModalOpen] = useState(false);
  const [isIndicatorModalOpen, setIsIndicatorModalOpen] = useState(false);
  const [isPriceAlertModalOpen, setIsPriceAlertModalOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [isTradesDrawerOpen, setIsTradesDrawerOpen] = useState(false);
  const [mobileTradesTab, setMobileTradesTab] = useState<MobileTradesTab>('trades');
  const [soundEnabled, setSoundEnabled] = useState(soundEngine.isEnabled());

  // Real-time Price Alerts state
  const [alerts, setAlerts] = useState<PriceAlert[]>([
    {
      id: 'ALT-EURUSD-UP',
      symbol: 'EUR/USD (OTC)',
      targetPrice: 1.0865,
      condition: 'ABOVE',
      createdAt: Date.now() - 3600000,
      triggered: false,
      active: true,
    },
    {
      id: 'ALT-EURUSD-DN',
      symbol: 'EUR/USD (OTC)',
      targetPrice: 1.0825,
      condition: 'BELOW',
      createdAt: Date.now() - 1800000,
      triggered: false,
      active: true,
    },
  ]);
  const [activeAlertToast, setActiveAlertToast] = useState<string | null>(null);

  // Precise Inline Trade Outcome Badge State (Anchored at exact trade entry/expiration coordinate)
  const [tradeResultOverlay, setTradeResultOverlay] = useState<{
    id: string;
    isWin: boolean;
    isTie?: boolean;
    profitAmount: number;
    investment: number;
    asset: string;
    direction: BinaryOptionDirection;
    strikePrice: number;
    closePrice: number;
    payoutPercentage: number;
    startTime: number;
    endTime: number;
  } | null>(null);

  // Live Market Feed Status State (Binance WebSocket & Interbank FX)
  const [feedStatus, setFeedStatus] = useState<LiveFeedStatus>(liveMarketFeed.getStatus());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interactive Chart Trade History Overlay State (Disabled by default; no hardcoded history dots clutter)
  const [showHistoryOverlay, setShowHistoryOverlay] = useState<boolean>(false);
  const [hoveredTradeMarker, setHoveredTradeMarker] = useState<TradeChartMarkerPoint | null>(null);
  const [selectedTradeMarker, setSelectedTradeMarker] = useState<TradeChartMarkerPoint | null>(null);
  const tradeMarkersRef = useRef<TradeChartMarkerPoint[]>([]);

  // Active and real closed trades for this account (zero fake seeded trades)
  const activeTrades = React.useMemo(() => trades.filter((t) => t.status === 'active'), [trades]);
  const closedTrades = React.useMemo(() => {
    return trades
      .filter((t) => t.status === 'won' || t.status === 'lost' || t.status === 'tie')
      .sort((a, b) => b.endTime - a.endTime);
  }, [trades]);

  const activeInspectedMarker = hoveredTradeMarker || selectedTradeMarker;
  const effectiveInvestment =
    investmentMode === 'percent'
      ? Math.max(1, Number(((effectiveAccount.currentBalance * investment) / 100).toFixed(2)))
      : investment;

  // Calculate live unrealized P&L on every tick with isolated asset pricing
  const liveUnrealizedPnL = activeTrades.reduce((sum, t) => {
    let inTheMoney = false;
    const tradeMarket = getAssetMarketState(t.asset);
    const assetPrice = t.asset === selectedAsset.symbol ? currentPrice : (tradeMarket?.lastPrice ?? t.strikePrice);
    if (t.direction === 'CALL' && assetPrice > t.strikePrice) inTheMoney = true;
    if (t.direction === 'PUT' && assetPrice < t.strikePrice) inTheMoney = true;
    const itemPnL = inTheMoney ? (t.investment * t.payoutPercentage) / 100 : -t.investment;
    return sum + itemPnL;
  }, 0);

  const liveEquity = Number(((effectiveAccount?.currentBalance || 0) + liveUnrealizedPnL).toFixed(2));

  // Real-time drawdown & barricade calculations synchronized with liveEquity on every tick
  const metrics = calculateDrawdownMetrics({
    ...effectiveAccount,
    equity: liveEquity,
  });

  // Dual-Breach System vs No Active Account State
  const hasNoAccount = !account;
  const isSoftBreached = Boolean(account && (account.status === 'soft-breached' || account.breachType === 'soft'));
  const isHardBreached = Boolean(
    account &&
      (account.status === 'hard-breached' ||
        account.status === 'breached' ||
        (!isSoftBreached && account.status !== 'active' && account.status !== 'passed'))
  );
  const isBreached = isSoftBreached || isHardBreached;
  const otherActiveAccounts = accounts.filter((a) => a.id !== account?.id && a.status === 'active');

  // Live countdown timer for soft breach daily reset
  const [softResetSecondsRemaining, setSoftResetSecondsRemaining] = useState<number>(() => {
    if (!account?.softBreachResetTime) return 0;
    return Math.max(0, Math.floor((account.softBreachResetTime - Date.now()) / 1000));
  });

  const handleResetSoftBreach = () => {
    if (!account) return;
    const unbreached = resetSoftBreachedAccount(account);
    onUpdateAccount(unbreached);
    soundEngine.playTradeWin();
  };

  useEffect(() => {
    if (!isSoftBreached) return;
    const interval = setInterval(() => {
      const target = account?.softBreachResetTime || Date.now() + 5 * 3600 * 1000;
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSoftResetSecondsRemaining(left);
      if (left === 0 && account) {
        handleResetSoftBreach();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSoftBreached, account]);

  const riskBarricade = isRiskBarricadeActive(
    metrics.dailyDrawdownPercent,
    account?.dailyLossLimitPercent || 6,
    metrics.overallLossPercent,
    account?.maxOverallLossPercent || 12,
    0.8
  );

  // Auto-Breach check on equity fluctuation
  useEffect(() => {
    if (!account || account.status === 'breached' || account.status === 'hard-breached' || account.status === 'soft-breached') return;
    const evaluatedAccount: TradingAccount = {
      ...account,
      equity: liveEquity,
    };
    const breachEval = evaluateAccountBreach(evaluatedAccount);
    if (breachEval.isBreached) {
      soundEngine.playTradeLoss();
      if (breachEval.breachCategory === 'soft') {
        const nextReset = breachEval.autoUnlockTimestamp || getNextDailyResetTimestamp();
        const breachLog = {
          id: `VIO-DAILY-${Date.now()}`,
          rule: 'DAILY_LOSS' as const,
          ruleName: 'Daily Loss Limit (Soft Breach)',
          severity: 'warning' as const,
          message: breachEval.reason || 'Daily drawdown threshold reached.',
          timestamp: Date.now(),
          details: `Equity dropped to $${liveEquity.toFixed(2)} (Auto-resets next trading day)`,
        };
        const updated: TradingAccount = {
          ...account,
          status: 'soft-breached',
          breachType: 'soft',
          softBreachResetTime: nextReset,
          equity: liveEquity,
          breachReason: breachEval.reason,
          breachedAt: Date.now(),
          violationLogs: [...(account.violationLogs || []), breachLog],
        };
        onUpdateAccount(updated);
        setIsBreachModalOpen(true);
      } else {
        const breachLog = {
          id: `VIO-OVERALL-${Date.now()}`,
          rule: 'OVERALL_LOSS' as const,
          ruleName: 'Max Overall Loss (Hard Breach)',
          severity: 'critical' as const,
          message: breachEval.reason || 'Maximum overall loss limit breached.',
          timestamp: Date.now(),
          details: `Equity dropped to $${liveEquity.toFixed(2)} (Permanent Hard Breach)`,
        };
        const updated: TradingAccount = {
          ...account,
          status: 'hard-breached',
          breachType: 'hard',
          discountEligible: true,
          equity: liveEquity,
          breachReason: breachEval.reason,
          breachedAt: Date.now(),
          violationLogs: [...(account.violationLogs || []), breachLog],
        };
        onUpdateAccount(updated);
        setIsBreachModalOpen(true);
      }
    }
  }, [liveEquity, account, onUpdateAccount]);

  // Sound toggle handler
  const handleToggleSound = () => {
    const newState = soundEngine.toggle();
    setSoundEnabled(newState);
  };

  // 1. Centralized Deterministic Candle Engine & Timeframe Scaling
  const prevAssetSymbolRef = useRef<string>(selectedAsset.symbol);

  useEffect(() => {
    const isNewAsset = prevAssetSymbolRef.current !== selectedAsset.symbol;
    prevAssetSymbolRef.current = selectedAsset.symbol;

    const store = getOrCreateMasterHistory(selectedAsset);
    const prevSec = TIMEFRAME_SECONDS[prevTimeframeRef.current];
    const nextSec = TIMEFRAME_SECONDS[timeframe];
    prevTimeframeRef.current = timeframe;

    const aggregated = aggregateCandlesForTimeframe(selectedAsset, nextSec);
    setCandles(aggregated);
    setCurrentPrice(store.lastPrice);
    setSmoothPrice(store.lastPrice);
    targetPriceRef.current = store.lastPrice;

    // Immediately synchronize candle expiry countdown for the newly selected timeframe and asset phase
    const symbolOffsetSec = Math.floor(getAssetTimeOffsetMs(selectedAsset.symbol, nextSec) / 1000);
    const immediateCountdown = calculateCandleCountdown(Date.now(), nextSec, symbolOffsetSec);
    setCandleCountdown(immediateCountdown);

    // Preserve relative historical scroll position when switching timeframes on same asset;
    // Reset to 0 when switching asset pairs
    setPanOffset((prevOffset) => {
      if (isNewAsset || prevOffset <= 0) {
        panOffsetFloatRef.current = 0;
        return 0;
      }
      const translated = translatePanOffsetForTimeframe(
        prevOffset,
        prevSec,
        nextSec
      );
      panOffsetFloatRef.current = translated;
      return Math.round(translated);
    });
    panVelocityRef.current = 0;
  }, [selectedAsset, timeframe]);

  useEffect(() => {
    saveSelectedTimeframe(timeframe);
  }, [timeframe]);

  useEffect(() => {
    saveChartType(chartType);
  }, [chartType]);

  // 1a-2. Live External Market REST Feed Subscription (Binance REST + Interbank FX + Authoritative Backend)
  useEffect(() => {
    liveMarketFeed.setActiveSymbol(selectedAsset.symbol);
    const unsubStatus = liveMarketFeed.addStatusListener((status) => {
      setFeedStatus(status);
    });

    const unsubLiveTicks = liveMarketFeed.addTickListener((tick) => {
      const matchedAsset = findAssetBySymbol(tick.symbol);
      if (matchedAsset) {
        appendLiveTick(matchedAsset, tick.price, true);
      }
      if (normalizeAssetSymbol(tick.symbol) === normalizeAssetSymbol(selectedAsset.symbol)) {
        setCurrentPrice(tick.price);
        targetPriceRef.current = tick.price;

        const sec = TIMEFRAME_SECONDS[timeframe];
        const liveCandlesSeries = aggregateCandlesForTimeframe(selectedAsset, sec);
        setCandles(liveCandlesSeries);

        const symbolOffsetSec = Math.floor(getAssetTimeOffsetMs(selectedAsset.symbol, sec) / 1000);
        const nextCountdown = calculateCandleCountdown(Date.now(), sec, symbolOffsetSec);
        setCandleCountdown((prev) =>
          prev.remainingSeconds === nextCountdown.remainingSeconds ? prev : nextCountdown
        );
      }
    });

    // Subscribe to synchronized market broadcast ticks from backend REST sync
    const unsubscribe = supabaseMarketSync.subscribeTicks((payload) => {
      if (normalizeAssetSymbol(payload.symbol) === normalizeAssetSymbol(selectedAsset.symbol)) {
        setCurrentPrice(payload.price);
        targetPriceRef.current = payload.price;

        const sec = TIMEFRAME_SECONDS[timeframe];
        const liveCandlesSeries = aggregateCandlesForTimeframe(selectedAsset, sec);
        setCandles(liveCandlesSeries);

        const symbolOffsetSec = Math.floor(getAssetTimeOffsetMs(selectedAsset.symbol, sec) / 1000);
        const nextCountdown = calculateCandleCountdown(Date.now(), sec, symbolOffsetSec);
        setCandleCountdown((prev) =>
          prev.remainingSeconds === nextCountdown.remainingSeconds ? prev : nextCountdown
        );
      }
    });

    // Fetch latest snapshot on mount / asset pair switch for instant state recovery
    supabaseMarketSync.fetchMarketSnapshot(selectedAsset.symbol).then((snapshot) => {
      if (snapshot && snapshot.lastPrice) {
        const store = getOrCreateMasterHistory(selectedAsset);
        store.prevPrice = snapshot.prevPrice || snapshot.lastPrice;
        store.lastPrice = snapshot.lastPrice;
        setCurrentPrice(snapshot.lastPrice);
        targetPriceRef.current = snapshot.lastPrice;

        const sec = TIMEFRAME_SECONDS[timeframe];
        const liveCandlesSeries = aggregateCandlesForTimeframe(selectedAsset, sec);
        setCandles(liveCandlesSeries);
      }
    });

    return () => {
      unsubStatus();
      unsubLiveTicks();
      unsubscribe();
    };
  }, [selectedAsset, timeframe]);


  // 1b. Butter-Smooth 60fps Price & Inertia Momentum Panning Loop
  useEffect(() => {
    targetPriceRef.current = currentPrice;
  }, [currentPrice]);

  useEffect(() => {
    let rafId: number;
    const animate60fps = () => {
      const target = targetPriceRef.current;
      const prev = smoothPriceRef.current;
      const diff = target - prev;
      if (Math.abs(diff) < 1e-6) {
        smoothPriceRef.current = target;
      } else {
        smoothPriceRef.current = prev + diff * 0.28;
      }

      // Throttle React state update to ~30fps (every 33ms) so React doesn't re-render entire tree 60fps
      const now = performance.now();
      if (now - lastSmoothStateUpdateRef.current >= 33) {
        lastSmoothStateUpdateRef.current = now;
        setSmoothPrice((cur) => {
          const next = smoothPriceRef.current;
          return Math.abs(next - cur) > 1e-5 ? next : cur;
        });
      }

      // Step momentum inertia panning when user releases drag with velocity
      if (Math.abs(panVelocityRef.current) >= 0.05) {
        const maxVis = Math.max(
          18,
          Math.floor(((canvasRef.current?.width || 800) - 75) / (11 * zoomLevel))
        );
        const maxPan = Math.max(0, candles.length - maxVis);
        const step = stepMomentum(panOffsetFloatRef.current, panVelocityRef.current, 0.93, 0.012, maxPan);
        panOffsetFloatRef.current = step.nextPanOffset;
        panVelocityRef.current = step.nextVelocity;
        const rounded = Math.round(step.nextPanOffset);
        setPanOffset((prevOffset) => (prevOffset === rounded ? prevOffset : rounded));
      }

      rafId = requestAnimationFrame(animate60fps);
    };
    rafId = requestAnimationFrame(animate60fps);
    return () => cancelAnimationFrame(rafId);
  }, [candles.length, zoomLevel]);

  // 1. Initial Market Bootstrap & Realtime Price Pulse
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const initialSyncDoneRef = useRef(false);

  useEffect(() => {
    // Bootstrap: Fetch all 250+ assets from Supabase and subscribe to global real-time price updates
    const bootstrapGlobalMarket = async () => {
      const allAssets = await supabaseMarketSync.fetchAllOtcAssets();
      if (allAssets.length > 0) {
        registerDynamicAssets(allAssets);
        
        // Update current tabs and selected asset with fresh DB data
        setOpenTabs((prev) => {
          return prev.map((tab) => {
            const fresh = allAssets.find((a) => a.symbol === tab.symbol);
            return fresh ? { ...tab, payout: fresh.payout, basePrice: fresh.basePrice } : tab;
          });
        });
        setSelectedAsset((prev) => {
          if (!prev || !prev.symbol) {
            selectedAssetRef.current = allAssets[0];
            return allAssets[0];
          }
          const fresh = allAssets.find((a) => a.symbol === prev.symbol);
          const next = fresh ? { ...prev, payout: fresh.payout, basePrice: fresh.basePrice } : prev;
          selectedAssetRef.current = next;
          return next;
        });

        if (openTabsRef.current.length === 0) {
          const defaultSymbols = ['EUR/USD (OTC)', 'GBP/JPY (OTC)', 'BTC/USD (OTC)', 'XAU/USD (OTC)', 'TSLA (OTC)'];
          const defaults = defaultSymbols.map(s => allAssets.find(a => a.symbol === s)).filter(Boolean) as AssetInfo[];
          setOpenTabs(defaults);
          if (defaults.length > 0) setSelectedAsset(defaults[0]);
        }
      }

      // Enable Supabase Realtime Subscription for 'otc_assets' table
      supabaseMarketSync.initGlobalMarketSync((updated) => {
        if (selectedAssetRef.current && updated.symbol === selectedAssetRef.current.symbol) {
          if (updated.payout !== undefined) {
            setSelectedAsset(prev => ({ ...prev, payout: updated.payout! }));
          }
          if (updated.basePrice !== undefined) {
            setCurrentPrice(updated.basePrice);
            targetPriceRef.current = updated.basePrice;
            
            // Immediately update candles on price change if not already done by interval
            const sec = TIMEFRAME_SECONDS[timeframe];
            const liveCandlesSeries = aggregateCandlesForTimeframe(selectedAssetRef.current, sec);
            setCandles(liveCandlesSeries);
          }
        }
      });

      // Initial candle population for the selected asset
      const initialSec = TIMEFRAME_SECONDS[timeframe];
      const initialCandles = aggregateCandlesForTimeframe(selectedAssetRef.current, initialSec);
      setCandles(initialCandles);

      setIsLoadingAssets(false);
      initialSyncDoneRef.current = true;
    };

    bootstrapGlobalMarket();

    const interval = setInterval(() => {
      const sec = TIMEFRAME_SECONDS[timeframe];
      const nowMs = Date.now();
      const assetActiveTrades = activeTradesRef.current.filter(
        (t) => t.asset === selectedAsset.symbol && t.status === 'active'
      );

      // stepOrganicLiveTick now handles synchronization internally via master store updates from Supabase
      const newPrice = stepOrganicLiveTick(selectedAsset, {
        timeframeSeconds: sec,
        activeTrades: assetActiveTrades,
        nowMs,
      });
      setCurrentPrice(newPrice);
      targetPriceRef.current = newPrice;

      const liveCandlesSeries = aggregateCandlesForTimeframe(selectedAsset, sec);
      setCandles(liveCandlesSeries);

      const symbolOffsetSec = Math.floor(getAssetTimeOffsetMs(selectedAsset.symbol, sec) / 1000);
      const nextCountdown = calculateCandleCountdown(nowMs, sec, symbolOffsetSec);
      setCandleCountdown((prev) =>
        prev.remainingSeconds === nextCountdown.remainingSeconds ? prev : nextCountdown
      );

      // Stagger background tab updates to every 10 ticks (~1.5s) instead of 7x every second
      bgTickCounterRef.current = (bgTickCounterRef.current + 1) % 10;
      if (bgTickCounterRef.current === 0) {
        openTabsRef.current.forEach((tab) => {
          if (tab.symbol !== selectedAsset.symbol) {
            const tabTrades = activeTradesRef.current.filter(
              (t) => t.asset === tab.symbol && t.status === 'active'
            );
            stepOrganicLiveTick(tab, {
              timeframeSeconds: sec,
              activeTrades: tabTrades,
              nowMs,
            });
          }
        });
      }

      // Check real-time price alerts
      const currentAlerts = alertsRef.current;
      let anyAlertTriggered = false;
      const updatedAlerts = currentAlerts.map((alt) => {
        if (!alt.active || alt.triggered || alt.symbol !== selectedAsset.symbol) {
          return alt;
        }
        let triggered = false;
        if (alt.condition === 'ABOVE' && newPrice >= alt.targetPrice) {
          triggered = true;
        } else if (alt.condition === 'BELOW' && newPrice <= alt.targetPrice) {
          triggered = true;
        }

        if (triggered) {
          anyAlertTriggered = true;
          soundEngine.playTradeWin();
          const msg = `🔔 Alert: ${alt.symbol} reached ${alt.targetPrice.toFixed(selectedAsset.pipDecimals)} (${alt.condition})`;
          setActiveAlertToast(msg);
          setTimeout(() => setActiveAlertToast(null), 5000);

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('BFT Prop Alert', { body: msg });
            } catch {
              // Ignore error
            }
          }
          return { ...alt, triggered: true };
        }
        return alt;
      });

      if (anyAlertTriggered) {
        setAlerts(updatedAlerts);
      }

      const nextSeed = Math.floor(Date.now() / 3000);
      setPayoutSeed((prev) => (prev === nextSeed ? prev : nextSeed));
    }, 100);

    return () => {
      clearInterval(interval);
      supabaseMarketSync.cleanup();
    };
  }, [selectedAsset, timeframe]);

  // 3. Trade resolution timer with stable refs & Inline On-Chart Coordinate Outcome Badge
  const currentPriceRef = useRef(currentPrice);
  currentPriceRef.current = currentPrice;

  const activeTradesRef = useRef(activeTrades);
  activeTradesRef.current = activeTrades;

  const accountRef = useRef(effectiveAccount);
  accountRef.current = effectiveAccount;

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const currentPriceVal = currentPriceRef.current;
      const tradesList = activeTradesRef.current;
      const curAccount = accountRef.current;
      if (!curAccount) return;

      tradesList.forEach((trade) => {
        if (now >= trade.endTime) {
          const livePriceFromFeed = liveMarketFeed.getLatestPrice(trade.asset);
          const tradeMarket = getAssetMarketState(trade.asset);
          const finalPrice = trade.asset === selectedAsset.symbol
            ? currentPriceVal
            : (livePriceFromFeed ?? tradeMarket?.lastPrice ?? trade.strikePrice);

          const settlement = calculateTradeSettlement({
            direction: trade.direction,
            strikePrice: trade.strikePrice,
            closePrice: finalPrice,
            investment: trade.investment,
            payoutPercentage: trade.payoutPercentage,
          });

          if (settlement.status === 'won') {
            soundEngine.playTradeWin();
          } else if (settlement.status === 'lost') {
            soundEngine.playTradeLoss();
          } else {
            soundEngine.playUiClick();
          }

          // Trigger inline floating badge anchored directly at trade entry/expiration coordinate on the chart
          // only if the expired trade belongs to the currently viewed market
          if (trade.asset === selectedAsset.symbol) {
            setTradeResultOverlay({
              id: trade.id,
              isWin: settlement.status === 'won',
              isTie: settlement.status === 'tie',
              profitAmount: settlement.pnl,
              investment: trade.investment,
              asset: trade.asset,
              direction: trade.direction,
              strikePrice: trade.strikePrice,
              closePrice: finalPrice,
              payoutPercentage: trade.payoutPercentage,
              startTime: trade.startTime,
              endTime: trade.endTime,
            });
            setTimeout(() => {
              setTradeResultOverlay((prev) => (prev?.id === trade.id ? null : prev));
            }, 4200);
          }

          const updatedTrade: BinaryTrade = {
            ...trade,
            status: settlement.status,
            closePrice: finalPrice,
            pnl: settlement.pnl,
          };
          onUpdateTrade(updatedTrade);

          // Settle in persistent SQLite backend
          apiSettleTrade({
            tradeId: trade.id,
            closePrice: finalPrice,
            status: settlement.status,
          }).catch(() => {});

          const newBalance = Number((curAccount.currentBalance + settlement.creditedAmount).toFixed(2));
          const allTradesList = [...trades.filter((t) => t.id !== trade.id), updatedTrade];
          const newWinRate = computeAccountWinRate(allTradesList);

          const updatedAccount: TradingAccount = {
            ...curAccount,
            currentBalance: newBalance,
            tradesCount: curAccount.tradesCount + 1,
            winRate: newWinRate,
            equity: newBalance,
          };

          if (account) {
            onUpdateAccount(updatedAccount);
            apiUpdateAccountState(curAccount.id, {
              currentBalance: newBalance,
              equity: newBalance,
              tradesCount: updatedAccount.tradesCount,
              winRate: newWinRate,
            }).catch(() => {});

            // Check if a One-Step or Two-Step Challenge account just hit its profit target!
            if (settlement.status === 'won' && !isLiveFundedAccount(updatedAccount)) {
              const targetStatus = getChallengeProfitTarget(updatedAccount);
              if (targetStatus.isTargetMet) {
                setTimeout(() => {
                  onPassChallengePhase?.(updatedAccount);
                }, 900);
              }
            }
          } else {
            setDemoPracticeAccount(updatedAccount);
          }
        }
      });
    }, 250);

    return () => clearInterval(timer);
  }, [account, onUpdateTrade, onUpdateAccount, onPassChallengePhase, trades, selectedAsset.symbol]);

  // Asset Tab Switching with Persistent Cross-View Synchronization
  const handleSelectTabAsset = (asset: AssetInfo) => {
    soundEngine.playUiClick();
    setSelectedAsset(asset);
    saveSelectedAssetSymbol(asset.symbol);
    broadcastSyncEvent('ASSET_SELECTED', asset.symbol);
    if (!openTabs.find((t) => t.symbol === asset.symbol)) {
      const updatedTabs = [...openTabs, asset];
      setOpenTabs(updatedTabs);
      saveOpenAssetTabSymbols(updatedTabs.map((t) => t.symbol));
      broadcastSyncEvent('TABS_UPDATED', updatedTabs.map((t) => t.symbol));
    }
  };

  const handleCloseTab = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    soundEngine.playUiClick();
    const remaining = openTabs.filter((t) => t.symbol !== symbol);
    if (remaining.length === 0) return;
    setOpenTabs(remaining);
    saveOpenAssetTabSymbols(remaining.map((t) => t.symbol));
    broadcastSyncEvent('TABS_UPDATED', remaining.map((t) => t.symbol));
    if (selectedAsset.symbol === symbol) {
      setSelectedAsset(remaining[0]);
      saveSelectedAssetSymbol(remaining[0].symbol);
      broadcastSyncEvent('ASSET_SELECTED', remaining[0].symbol);
    }
  };

  // Trade Execution with Prop Firm Guardrails
  const executeTradeAction = (
    direction: BinaryOptionDirection,
    targetAsset?: AssetInfo,
    targetDuration?: number,
    customInvestment?: number
  ) => {
    if (hasNoAccount) {
      soundEngine.playErrorAlert();
      setTradeError('Trading Terminal Locked: Please purchase a Challenge or Instant Funded plan to unlock live trading.');
      return;
    }
    const activeAcc = effectiveAccount;
    if (activeAcc.status === 'breached' || activeAcc.status === 'hard-breached') {
      soundEngine.playTradeLoss();
      setTradeError('Account is locked due to rule breach. Trading is disabled.');
      setIsBreachModalOpen(true);
      return;
    }

    const assetToTrade = targetAsset || selectedAsset;
    const durationToUse = targetDuration || duration;
    const stakeToUse = customInvestment || effectiveInvestment;

    setTradeError(null);
    setTradeSuccess(null);

    const isUnrestrictedPersonalOrDemo =
      isPersonalLiveAccount(activeAcc) || isDemoAccount(activeAcc);

    if (!isUnrestrictedPersonalOrDemo && riskBarricade.barricaded) {
      soundEngine.playTradeLoss();
      setTradeError('Risk Barricade Active: Account is within 80% of max loss limit. Orders locked to protect capital.');
      return;
    }

    if (!isValidTradeDuration(durationToUse)) {
      soundEngine.playTradeLoss();
      setTradeError('Rule Violation: Minimum trade duration is 30 seconds to prevent tick scalping.');
      return;
    }

    if (stakeToUse <= 0) {
      setTradeError('Please enter a valid investment stake ($1+).');
      return;
    }

    if (stakeToUse > activeAcc.currentBalance) {
      setTradeError(`Insufficient balance. Available capital: $${activeAcc.currentBalance.toFixed(2)}`);
      return;
    }

    // Strict Prop Guardrails apply ONLY to Prop Trading Accounts (Challenge & Funded)
    // Personal Live (Self-Funded) and Demo accounts trade without prop drawdown or risk-per-trade locks
    if (!isUnrestrictedPersonalOrDemo) {
      // Strict 5% Max Risk Per Trade Check (Hard Breach if violated)
      const maxRiskCheck = checkMaxRiskPerTradeViolation(
        stakeToUse,
        activeAcc.initialBalance || activeAcc.size,
        activeAcc.maxRiskPerTradePercent || 5
      );
      if (maxRiskCheck.violated) {
        soundEngine.playTradeLoss();
        const breachReason = `Max Risk Per Trade Violated: Stake of $${stakeToUse.toFixed(2)} (${maxRiskCheck.riskPercent}%) exceeds the strict ${activeAcc.maxRiskPerTradePercent || 5}% ($${maxRiskCheck.maxAllowedStake.toFixed(2)}) per-trade risk limit. Permanent Hard Breach enforced.`;
        const breachLog = {
          id: `VIO-RISK5-${Date.now()}`,
          rule: 'MAX_RISK_PER_TRADE' as const,
          ruleName: '5% Max Risk Per Trade (Hard Breach)',
          severity: 'critical' as const,
          message: breachReason,
          timestamp: Date.now(),
          details: `Stake: $${stakeToUse} / Max Allowed: $${maxRiskCheck.maxAllowedStake} (5% Rule)`,
        };
        const breachedUpdate: TradingAccount = {
          ...activeAcc,
          status: 'hard-breached',
          breachType: 'hard',
          discountEligible: true,
          breachReason,
          breachedAt: Date.now(),
          violationLogs: [...(activeAcc.violationLogs || []), breachLog],
        };
        if (account) {
          onUpdateAccount(breachedUpdate);
        } else {
          setDemoPracticeAccount(breachedUpdate);
        }
        setTradeError(breachReason);
        setIsBreachModalOpen(true);
        return;
      }

      const hedgingCheck = isHedgingViolation(direction, assetToTrade.symbol, activeTrades);
      if (hedgingCheck.detected) {
        soundEngine.playTradeLoss();
        setTradeError(hedgingCheck.reason || `Hedging Prohibited: You already have an active opposing trade on ${assetToTrade.symbol}.`);
        return;
      }

      const martingaleCheck = isMartingalePattern(stakeToUse, trades);
      if (martingaleCheck.detected) {
        soundEngine.playTradeLoss();
        setTradeError(martingaleCheck.reason || 'Martingale Strategy Violation: Explosive stake doubling (≥1.8x) following a loss is strictly prohibited.');
        return;
      }

      if (isDuringRestrictedNewsWindow(Date.now()).restricted) {
        soundEngine.playTradeLoss();
        setTradeError('Economic News Window: Trading within 2 minutes of High-Impact Macro Releases is restricted.');
        return;
      }

      if (isPositionSizeSpike(stakeToUse, trades.map((t) => t.investment))) {
        soundEngine.playTradeLoss();
        setTradeError('Volume Spike Violation: Stake exceeds 5x your recent average trading volume.');
        return;
      }
    }

    // Deduct stake optimistically
    soundEngine.playTradePlacement(direction);
    const newBalance = Number((activeAcc.currentBalance - stakeToUse).toFixed(2));
    const deductedAcc: TradingAccount = {
      ...activeAcc,
      currentBalance: newBalance,
      equity: newBalance,
    };
    if (account) {
      onUpdateAccount(deductedAcc);
      apiUpdateAccountState(activeAcc.id, {
        currentBalance: newBalance,
        equity: newBalance,
      }).catch(() => {});
    } else {
      setDemoPracticeAccount(deductedAcc);
    }

    // Accurately determine trade strike price from synchronized live feed or isolated market state
    const tradeMarket = getAssetMarketState(assetToTrade.symbol);
    const liveFeedPrice = liveMarketFeed.getLatestPrice(assetToTrade.symbol);
    const assetLivePrice =
      assetToTrade.symbol === selectedAsset.symbol
        ? currentPrice
        : (liveFeedPrice ?? tradeMarket?.lastPrice ?? assetToTrade.basePrice);

    const newTrade: BinaryTrade = {
      id: `TRD-${Date.now().toString().slice(-6)}`,
      accountId: activeAcc.id,
      asset: assetToTrade.symbol,
      direction,
      strikePrice: assetLivePrice,
      currentPrice: assetLivePrice,
      investment: stakeToUse,
      payoutPercentage: assetToTrade.payout,
      potentialPayout: Number((stakeToUse + (stakeToUse * assetToTrade.payout) / 100).toFixed(2)),
      startTime: Date.now(),
      durationSeconds: durationToUse,
      endTime: Date.now() + durationToUse * 1000,
      status: 'active',
      accountTier: activeAcc.tier,
    };

    onAddTrade(newTrade);

    if (account) {
      apiPlaceTrade({
        id: newTrade.id,
        accountId: activeAcc.id,
        asset: newTrade.asset,
        direction: newTrade.direction,
        strikePrice: newTrade.strikePrice,
        investment: newTrade.investment,
        payoutPercentage: newTrade.payoutPercentage,
        durationSeconds: newTrade.durationSeconds,
        startTime: newTrade.startTime,
        endTime: newTrade.endTime,
        accountTier: newTrade.accountTier,
      }).catch(() => {});
    }


    setTradeSuccess(`Trade opened with price: ${assetLivePrice.toFixed(assetToTrade.pipDecimals)} ${assetToTrade.symbol}`);
    setTimeout(() => setTradeSuccess(null), 4000);
  };

  // Quotex "Double up (x2)" Feature: Replicate an open trade
  const handleDoubleUp = (trade: BinaryTrade) => {
    soundEngine.playUiClick();
    const targetAssetObj = openTabs.find((a) => a.symbol === trade.asset) || selectedAsset;
    executeTradeAction(trade.direction, targetAssetObj, trade.durationSeconds, trade.investment);
  };

  const handleTriggerTrade = (direction: BinaryOptionDirection) => {
    if (oneClickTrading) {
      executeTradeAction(direction);
    } else {
      soundEngine.playUiClick();
      setPendingTradeDirection(direction);
    }
  };

  // Step duration up or down through presets (5s to 4h)
  const handleStepDuration = (dir: 'up' | 'down') => {
    soundEngine.playUiClick();
    const currentIndex = EXPIRY_PRESETS.indexOf(duration);
    if (dir === 'up') {
      if (currentIndex === -1 || currentIndex === EXPIRY_PRESETS.length - 1) {
        setDuration(EXPIRY_PRESETS[EXPIRY_PRESETS.length - 1]);
      } else {
        setDuration(EXPIRY_PRESETS[currentIndex + 1]);
      }
    } else {
      if (currentIndex <= 0) {
        setDuration(EXPIRY_PRESETS[0]);
      } else {
        setDuration(EXPIRY_PRESETS[currentIndex - 1]);
      }
    }
  };

  // 4. Global Keyboard Shortcuts ('B' for Buy/Higher, 'S' for Sell/Lower, '1-5' for Timeframe)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toUpperCase();
      if (key === 'B') {
        e.preventDefault();
        handleTriggerTrade('CALL');
      } else if (key === 'S') {
        e.preventDefault();
        handleTriggerTrade('PUT');
      } else if (e.key === '1') {
        e.preventDefault();
        soundEngine.playUiClick();
        setTimeframe('5s');
      } else if (e.key === '2') {
        e.preventDefault();
        soundEngine.playUiClick();
        setTimeframe('15s');
      } else if (e.key === '3') {
        e.preventDefault();
        soundEngine.playUiClick();
        setTimeframe('30s');
      } else if (e.key === '4') {
        e.preventDefault();
        soundEngine.playUiClick();
        setTimeframe('1m');
      } else if (e.key === '5') {
        e.preventDefault();
        soundEngine.playUiClick();
        setTimeframe('5m');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [oneClickTrading, duration, investment, selectedAsset, account, activeTrades, trades]);

  // Helper to arm any technical analysis drawing tool from the side drawer or toolbar
  const handleSelectDrawingTool = (tool: DrawingTool) => {
    soundEngine.playUiClick();
    if (tool === 'none') {
      setActiveDrawingTool('none');
      setCurrentDrawing(null);
      return;
    }
    setLastUsedDrawingTool(tool);
    setCurrentDrawing(null);
    setSelectedDrawingId(null);
    // Always arm the tool immediately for a fresh drawing action on the canvas
    setActiveDrawingTool(tool);
  };

  const selectedDrawing = React.useMemo(
    () => drawings.find((d) => d.id === selectedDrawingId) || null,
    [drawings, selectedDrawingId]
  );

  // 5. Interactive Mouse Handlers for Panning & Technical Drawing Suite
  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    const canvas = canvasRef.current;
    const width = canvas?.width || 900;
    const height = canvas?.height || 500;

    // 1. If a drawing tool is armed, begin drawing immediately on canvas
    if (activeDrawingTool !== 'none') {
      setIsInteracting(true);
      const newDraw = createInitialDrawing(
        activeDrawingTool,
        coords.x,
        coords.y,
        drawingColor,
        drawingWidth,
        drawingLineStyle
      );
      setCurrentDrawing(newDraw);
      setSelectedDrawingId(null);
      return;
    }

    // 2. Check if user clicked a resize handle of the currently selected drawing
    if (selectedDrawing) {
      const hitHandle = findHitDrawingHandle(coords.x, coords.y, selectedDrawing, 12);
      if (hitHandle) {
        soundEngine.playUiClick();
        draggingDrawingRef.current = {
          id: selectedDrawing.id,
          mode: hitHandle,
          lastX: coords.x,
          lastY: coords.y,
        };
        setIsInteracting(true);
        return;
      }
    }

    // 3. Check if user clicked on any drawn object on the chart to select/move it
    const hitDrawing = findHitDrawing(coords.x, coords.y, drawings, width, height, 10);
    if (hitDrawing) {
      soundEngine.playUiClick();
      setSelectedDrawingId(hitDrawing.id);
      draggingDrawingRef.current = {
        id: hitDrawing.id,
        mode: 'move',
        lastX: coords.x,
        lastY: coords.y,
      };
      setIsInteracting(true);
      return;
    }

    // 4. Check if user clicked an execution or settlement dot marker on the chart history overlay
    if (showHistoryOverlay) {
      const hitMarker = findHoveredTradeMarker(coords.x, coords.y, tradeMarkersRef.current, 13);
      if (hitMarker) {
        soundEngine.playUiClick();
        setSelectedTradeMarker((prev) => (prev?.id === hitMarker.id ? null : hitMarker));
        return;
      }
    }

    // Deselect drawing when clicking empty chart background & start panning
    if (selectedDrawingId) {
      setSelectedDrawingId(null);
    }
    setIsInteracting(true);
    dragStartXRef.current = e.clientX;
    initialPanOffsetRef.current = panOffset;
    panOffsetFloatRef.current = panOffset;
    panVelocityRef.current = 0;
    dragSamplesRef.current = [{ x: e.clientX, time: performance.now() }];
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    // Support horizontal trackpad two-finger swipe panning
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
      const candleWidthEst = Math.max(4, 11 * zoomLevel);
      const offsetDiff = Math.round(e.deltaX / candleWidthEst);
      setPanOffset((prev) => {
        const next = Math.max(0, Math.min(Math.max(0, candles.length - 18), prev - offsetDiff));
        panOffsetFloatRef.current = next;
        return next;
      });
      return;
    }

    const zoomFactor = e.deltaY < 0 ? 0.16 : -0.16;
    if (canvas && candles.length > 0) {
      const coords = getCanvasCoords(e);
      const focalRatio = Math.max(0, Math.min(1, coords.x / Math.max(1, canvas.width)));
      const anchored = calculateAnchoredZoom(
        zoomLevel,
        zoomFactor,
        focalRatio,
        panOffset
      );
      setZoomLevel(anchored.nextZoom);
      const clampedPan = Math.max(0, Math.min(Math.max(0, candles.length - 18), Math.round(anchored.nextPanOffset)));
      setPanOffset(clampedPan);
      panOffsetFloatRef.current = clampedPan;
    } else {
      setZoomLevel((prev) => Number(Math.max(0.35, Math.min(3.5, prev + zoomFactor)).toFixed(2)));
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    const canvas = canvasRef.current;

    if (canvas && candles.length > 0) {
      const width = canvas.width;
      const maxVisibleCandles = Math.max(18, Math.floor((width - 75) / (11 * zoomLevel)));
      const endIndex = Math.max(maxVisibleCandles, candles.length - panOffset);
      const startIndex = Math.max(0, endIndex - maxVisibleCandles);
      const visibleSlice = candles.slice(startIndex, endIndex);
      const slotWidth = (width - 78) / Math.max(1, visibleSlice.length);
      const idx = Math.min(
        visibleSlice.length - 1,
        Math.max(0, Math.floor((coords.x - 10) / Math.max(1, slotWidth)))
      );
      setHoveredCandle(visibleSlice[idx] || null);
      setCrosshairPos(coords);
    }

    if (!isInteracting) {
      if (activeDrawingTool === 'none') {
        const hitDraw = findHitDrawing(
          coords.x,
          coords.y,
          drawings,
          canvas?.width || 900,
          canvas?.height || 500,
          10
        );
        setHoveredDrawingId((prev) => (prev === (hitDraw?.id || null) ? prev : hitDraw?.id || null));
      } else if (hoveredDrawingId) {
        setHoveredDrawingId(null);
      }

      if (showHistoryOverlay && activeDrawingTool === 'none') {
        const hitMarker = findHoveredTradeMarker(coords.x, coords.y, tradeMarkersRef.current, 13);
        setHoveredTradeMarker((prev) => (prev?.id === hitMarker?.id ? prev : hitMarker));
      } else if (hoveredTradeMarker) {
        setHoveredTradeMarker(null);
      }
      return;
    }

    // Moving or resizing an existing selected drawing
    if (draggingDrawingRef.current) {
      const dragState = draggingDrawingRef.current;
      const dx = coords.x - dragState.lastX;
      const dy = coords.y - dragState.lastY;
      draggingDrawingRef.current = {
        ...dragState,
        lastX: coords.x,
        lastY: coords.y,
      };
      setDrawings((prev) =>
        prev.map((d) => {
          if (d.id !== dragState.id) return d;
          if (dragState.mode === 'move') {
            return translateDrawing(d, dx, dy);
          }
          return updateDrawingHandle(d, dragState.mode, coords.x, coords.y);
        })
      );
      return;
    }

    if (activeDrawingTool === 'none') {
      // Pan chart history smoothly at 60fps + record velocity samples
      const nowMs = performance.now();
      dragSamplesRef.current.push({ x: e.clientX, time: nowMs });
      if (dragSamplesRef.current.length > 8) {
        dragSamplesRef.current.shift();
      }

      const deltaX = e.clientX - dragStartXRef.current;
      const candleWidthEst = Math.max(4, 11 * zoomLevel);
      const offsetDiff = deltaX / candleWidthEst;
      const maxOffset = Math.max(0, candles.length - 18);
      const floatOffset = Math.max(0, Math.min(maxOffset, initialPanOffsetRef.current + offsetDiff));
      const newOffset = Math.round(floatOffset);
      panOffsetFloatRef.current = floatOffset;
      setPanOffset(newOffset);

      // Dynamically prepend older historical candles if user pans near the start of history
      if (newOffset >= candles.length - 120 && candles.length < 5000) {
        setCandles((prev) =>
          prev.length < 5000
            ? prependHistoricalCandles(selectedAsset, TIMEFRAME_SECONDS[timeframe], 500)
            : prev
        );
      }
    } else if (currentDrawing) {
      setCurrentDrawing((prev) => (prev ? updateDrawingOnDrag(prev, coords.x, coords.y) : null));
    }
  };

  const handleMouseUp = () => {
    if (draggingDrawingRef.current) {
      draggingDrawingRef.current = null;
    }
    if (currentDrawing) {
      const finalized = finalizeDrawingObject(currentDrawing);
      const canvas = canvasRef.current;
      const width = canvas?.width || 800;
      const height = canvas?.height || 500;
      const subPaneH = (indicators.showRsi ? 60 : 0) + (indicators.showMacd ? 70 : 0);
      const chartH = Math.max(180, height - subPaneH - 25);
      const maxVis = Math.max(18, Math.floor((width - 75) / (11 * zoomLevel)));
      const endIdx = Math.max(maxVis, candles.length - panOffset);
      const startIdx = Math.max(0, endIdx - maxVis);
      const visibleSlice = candles.slice(startIdx, endIdx);
      const slotW = (width - 78) / Math.max(1, visibleSlice.length);

      const prices = visibleSlice.map((c) => [c.high, c.low]).flat();
      let minP = Math.min(...prices);
      let maxP = Math.max(...prices);
      const pad = (maxP - minP) * 0.14 || 0.0005;
      minP -= pad;
      maxP += pad;

      const sCandle = startIdx + Math.max(0, (finalized.startX - 10) / Math.max(0.001, slotW));
      const sPrice = maxP - ((finalized.startY - 10) / Math.max(1, chartH)) * (maxP - minP);
      const eCandle = startIdx + Math.max(0, (finalized.endX - 10) / Math.max(0.001, slotW));
      const ePrice = maxP - ((finalized.endY - 10) / Math.max(1, chartH)) * (maxP - minP);
      let cCandle = finalized.controlX !== undefined ? startIdx + Math.max(0, (finalized.controlX - 10) / Math.max(0.001, slotW)) : undefined;
      let cPrice = finalized.controlY !== undefined ? maxP - ((finalized.controlY - 10) / Math.max(1, chartH)) * (maxP - minP) : undefined;

      const lockedDrawing = {
        ...finalized,
        startCandleIndex: sCandle,
        startPrice: sPrice,
        endCandleIndex: eCandle,
        endPrice: ePrice,
        controlCandleIndex: cCandle,
        controlPrice: cPrice,
      };

      setDrawings((prev) => [...prev, lockedDrawing]);
      setSelectedDrawingId(lockedDrawing.id);
      setCurrentDrawing(null);
      // Disarm after completing the drawing; clicking the tool again in the drawer immediately re-arms it
      setActiveDrawingTool('none');
    } else if (activeDrawingTool === 'none' && dragSamplesRef.current.length >= 2) {
      const releaseVel = computeReleaseVelocity(dragSamplesRef.current, Math.max(4, 11 * zoomLevel));
      if (Math.abs(releaseVel) >= 0.15) {
        panVelocityRef.current = releaseVel;
      }
    }
    dragSamplesRef.current = [];
    setIsInteracting(false);
  };

  const handleMouseLeave = () => {
    if (draggingDrawingRef.current) {
      draggingDrawingRef.current = null;
    }
    if (currentDrawing) {
      const finalized = finalizeDrawingObject(currentDrawing);
      setDrawings((prev) => [...prev, finalized]);
      setSelectedDrawingId(finalized.id);
      setCurrentDrawing(null);
      setActiveDrawingTool('none');
    }
    dragSamplesRef.current = [];
    setHoveredDrawingId(null);
    setHoveredTradeMarker(null);
    setHoveredCandle(null);
    setCrosshairPos(null);
    setIsInteracting(false);
  };

  // 6. Seamless Mobile Touch Gestures (Single-Finger Pan & Two-Finger Pinch-to-Zoom)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      dragStartXRef.current = touch.clientX;
      initialPanOffsetRef.current = panOffset;
      panOffsetFloatRef.current = panOffset;
      panVelocityRef.current = 0;
      dragSamplesRef.current = [{ x: touch.clientX, time: performance.now() }];
      setIsInteracting(true);

      if (showHistoryOverlay && activeDrawingTool === 'none') {
        const hitMarker = findHoveredTradeMarker(x, y, tradeMarkersRef.current, 18);
        if (hitMarker) {
          soundEngine.playUiClick();
          setSelectedTradeMarker((prev) => (prev?.id === hitMarker.id ? null : hitMarker));
        }
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDistRef.current = Math.hypot(dx, dy);
      initialTouchZoomRef.current = zoomLevel;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isInteracting) {
      const touch = e.touches[0];
      dragSamplesRef.current.push({ x: touch.clientX, time: performance.now() });
      if (dragSamplesRef.current.length > 8) {
        dragSamplesRef.current.shift();
      }
      const deltaX = touch.clientX - dragStartXRef.current;
      const newOffset = calculateTouchPanOffset(
        initialPanOffsetRef.current,
        deltaX,
        zoomLevel,
        candles.length
      );
      panOffsetFloatRef.current = newOffset;
      setPanOffset(newOffset);

      if (newOffset >= candles.length - 120 && candles.length < 5000) {
        setCandles((prev) =>
          prev.length < 5000
            ? prependHistoricalCandles(selectedAsset, TIMEFRAME_SECONDS[timeframe], 500)
            : prev
        );
      }

      const canvas = canvasRef.current;
      if (canvas && candles.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const coords = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        const width = canvas.width;
        const maxVisibleCandles = Math.max(18, Math.floor((width - 75) / (11 * zoomLevel)));
        const endIndex = Math.max(maxVisibleCandles, candles.length - newOffset);
        const startIndex = Math.max(0, endIndex - maxVisibleCandles);
        const visibleSlice = candles.slice(startIndex, endIndex);
        const slotWidth = (width - 78) / Math.max(1, visibleSlice.length);
        const idx = Math.min(
          visibleSlice.length - 1,
          Math.max(0, Math.floor((coords.x - 10) / Math.max(1, slotWidth)))
        );
        setHoveredCandle(visibleSlice[idx] || null);
        setCrosshairPos(coords);
      }
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newZoom = calculatePinchZoomLevel(
        initialTouchZoomRef.current,
        touchStartDistRef.current,
        dist
      );
      setZoomLevel(newZoom);
    }
  };

  const handleTouchEnd = () => {
    if (dragSamplesRef.current.length >= 2) {
      const releaseVel = computeReleaseVelocity(dragSamplesRef.current, zoomLevel);
      if (Math.abs(releaseVel) >= 0.15) {
        panVelocityRef.current = releaseVel;
      }
    }
    dragSamplesRef.current = [];
    setIsInteracting(false);
    touchStartDistRef.current = null;
  };

  // 6. High-Performance Hardware-Accelerated Canvas Chart Renderer with Drawing Suite & MACD
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const containerRect =
      chartContainerRef.current?.getBoundingClientRect() || canvas.getBoundingClientRect();
    const width = Math.max(300, Math.floor(containerRect.width || canvasSize.width || 390));
    const height = Math.max(220, Math.floor(containerRect.height || canvasSize.height || 360));

    const dpr = Math.max(1, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const targetWidth = Math.floor(width * dpr);
    const targetHeight = Math.floor(height * dpr);

    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
    }
    if (canvas.height !== targetHeight) {
      canvas.height = targetHeight;
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      ctx.save();
      ctx.scale(dpr, dpr);

    // Terminal Background: Deep Matte Black `#0a0a0a`
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Compute visible slice of candles based on panOffset and zoomLevel
    const maxVisibleCandles = Math.max(18, Math.floor((width - 75) / (11 * zoomLevel)));
    const totalCandles = candles.length;
    const endIndex = Math.max(maxVisibleCandles, totalCandles - panOffset);
    const startIndex = Math.max(0, endIndex - maxVisibleCandles);
    const rawVisibleCandles = candles.slice(startIndex, endIndex);
    // Apply 60fps smoothPrice interpolation to the active live candle when at latest view
    const visibleCandles =
      panOffset === 0 && rawVisibleCandles.length > 0
        ? rawVisibleCandles.map((c, idx) =>
            idx === rawVisibleCandles.length - 1
              ? {
                  ...c,
                  close: smoothPrice,
                  high: Math.max(c.high, smoothPrice),
                  low: Math.min(c.low, smoothPrice),
                }
              : c
          )
        : rawVisibleCandles;

    const displayCandles = chartType === 'heikin-ashi' ? calculateHeikinAshi(visibleCandles) : visibleCandles;

    // Price scaling isolated strictly to current asset
    const prices = displayCandles.map((c) => [c.high, c.low]).flat();
    const currentAssetActiveTrades = activeTrades.filter((t) => t.asset === selectedAsset.symbol);
    if (panOffset === 0) {
      prices.push(smoothPrice);
      currentAssetActiveTrades.forEach((t) => prices.push(t.strikePrice));
    }

    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.14 || 0.0005;
    minPrice -= padding;
    maxPrice += padding;

    const subPaneHeight = (indicators.showRsi ? 60 : 0) + (indicators.showMacd ? 70 : 0);
    const chartHeight = height - subPaneHeight - 25;

    const getY = (val: number) => {
      return chartHeight - ((val - minPrice) / (maxPrice - minPrice)) * chartHeight + 10;
    };

    // 1. Grid Lines & Right Price Scale
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridCount = 5;
    for (let i = 0; i <= gridCount; i++) {
      const y = (chartHeight / gridCount) * i + 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width - 65, y);
      ctx.stroke();

      const priceAtY = maxPrice - (i / gridCount) * (maxPrice - minPrice);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(priceAtY.toFixed(selectedAsset.pipDecimals), width - 8, y + 3);
    }

    // 2. Candlestick / Line / Bars rendering (Crisp Mint Green `#00e676` & Crimson Red `#ff3355` with prominent wicks)
    const slotWidth = (width - 78) / Math.max(1, displayCandles.length);
    const candleGap = Math.max(2, Math.round(slotWidth * 0.24));
    const candleWidth = Math.max(4, Math.floor(slotWidth - candleGap));
    const getCandleCenterX = (idx: number) => Math.floor(Math.round(idx * slotWidth + 10) + candleWidth / 2) + 0.5;

    if (chartType === 'line') {
      // Smooth Institutional Area + Price Line
      ctx.beginPath();
      displayCandles.forEach((c, idx) => {
        const cx = getCandleCenterX(idx);
        const cy = getY(c.close);
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      if (displayCandles.length > 1) {
        const firstX = getCandleCenterX(0);
        const lastX = getCandleCenterX(displayCandles.length - 1);
        ctx.lineTo(lastX, chartHeight + 10);
        ctx.lineTo(firstX, chartHeight + 10);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 10, 0, chartHeight + 10);
        grad.addColorStop(0, 'rgba(255, 136, 0, 0.22)');
        grad.addColorStop(1, 'rgba(255, 136, 0, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();
      }
    } else if (chartType === 'bars') {
      // Institutional OHLC Bars
      displayCandles.forEach((c, idx) => {
        const x = Math.round(idx * slotWidth + 10);
        const centerX = getCandleCenterX(idx);
        const openY = getY(c.open);
        const closeY = getY(c.close);
        const highY = getY(c.high);
        const lowY = getY(c.low);
        const isGreen = c.close >= c.open;
        const barColor = isGreen ? '#00e676' : '#ff3355';

        ctx.strokeStyle = barColor;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(centerX, highY);
        ctx.lineTo(centerX, lowY);
        ctx.moveTo(x, openY);
        ctx.lineTo(centerX, openY);
        ctx.moveTo(centerX, closeY);
        ctx.lineTo(x + candleWidth, closeY);
        ctx.stroke();
      });
    } else {
      displayCandles.forEach((c, idx) => {
        const x = Math.round(idx * slotWidth + 10);
        const centerX = getCandleCenterX(idx);
        const openY = getY(c.open);
        const closeY = getY(c.close);
        const highY = getY(c.high);
        const lowY = getY(c.low);
        const isGreen = c.close >= c.open;

        const candleColor = isGreen ? '#00e676' : '#ff3355';
        const topBodyY = Math.min(openY, closeY);
        const bottomBodyY = Math.max(openY, closeY);
        const bodyH = Math.max(1, Math.round(bottomBodyY - topBodyY));

        // Upper & Lower Wicks (Shadow Rejections from highY down to lowY)
        ctx.strokeStyle = candleColor;
        ctx.lineWidth = Math.max(1.2, Math.min(2.0, candleWidth * 0.18));
        ctx.beginPath();
        ctx.moveTo(centerX, highY);
        ctx.lineTo(centerX, lowY);
        ctx.stroke();

        // Candle Body
        ctx.fillStyle = candleColor;
        ctx.fillRect(x, Math.round(topBodyY), candleWidth, bodyH);
      });
    }

    // 3. Technical Indicators (SMA, EMA, Bollinger Bands)
    if (indicators.showSma) {
      const smaValues = calculateSMA(displayCandles, indicators.smaPeriod);
      ctx.strokeStyle = indicators.smaColor || '#2962ff';
      ctx.lineWidth = indicators.smaWidth || 2;
      ctx.beginPath();
      let started = false;
      smaValues.forEach((val, idx) => {
        if (val !== null) {
          const x = getCandleCenterX(idx);
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    if (indicators.showEma) {
      const emaValues = calculateEMA(displayCandles, indicators.emaPeriod);
      ctx.strokeStyle = indicators.emaColor || '#ff9800';
      ctx.lineWidth = indicators.emaWidth || 2;
      ctx.beginPath();
      let started = false;
      emaValues.forEach((val, idx) => {
        if (val !== null) {
          const x = getCandleCenterX(idx);
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    if (indicators.showBollinger) {
      const { upper, middle, lower } = calculateBollingerBands(
        displayCandles,
        indicators.bollingerPeriod,
        indicators.bollingerStd
      );
      const bandColor = indicators.bollingerColor || '#00e5ff';
      ctx.strokeStyle = bandColor;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      [upper, lower].forEach((band) => {
        ctx.beginPath();
        let started = false;
        band.forEach((val, idx) => {
          if (val !== null) {
            const x = getCandleCenterX(idx);
            const y = getY(val);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Middle Bollinger Band
      ctx.strokeStyle = bandColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let startedMid = false;
      middle.forEach((val, idx) => {
        if (val !== null) {
          const x = getCandleCenterX(idx);
          const y = getY(val);
          if (!startedMid) {
            ctx.moveTo(x, y);
            startedMid = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    if (indicators.showFib && displayCandles.length >= 2) {
      const fibLevels = calculateFibonacciLevels(maxPrice, minPrice);
      if (fibLevels && fibLevels.length > 0) {
        ctx.save();
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        fibLevels.forEach((lvl) => {
          const y = getY(lvl.price);
          ctx.strokeStyle = 'rgba(255, 136, 0, 0.55)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(10, y);
          ctx.lineTo(width - 68, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#ff8800';
          ctx.fillText(`Fib ${lvl.label} (${lvl.price.toFixed(selectedAsset.pipDecimals)})`, width - 72, y - 3);
        });
        ctx.restore();
      }
    }

    // 4. Current Market Price 60fps Line, Axis Badge & Live Candle Expiry Countdown Timer
    const curY = getY(smoothPrice);
    ctx.strokeStyle = '#ff8800'; // Solid BFT Neon Amber
    ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(0, curY);
    ctx.lineTo(width - 65, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Right Axis Price Tag
    ctx.fillStyle = '#ff8800';
    ctx.fillRect(width - 65, curY - 10, 65, 20);
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(currentPrice.toFixed(selectedAsset.pipDecimals), width - 32, curY + 4);

    // Live Candle Expiry Countdown Timer rendered directly next to/above the active live candle & on price axis
    if (displayCandles.length > 0 && panOffset === 0) {
      const liveCandle = displayCandles[displayCandles.length - 1];
      const liveCandleCenterX = getCandleCenterX(displayCandles.length - 1);
      const liveHighY = getY(liveCandle.high);
      const timerBadgeW = 54;
      const timerBadgeH = 17;
      const timerBadgeX = Math.max(
        10,
        Math.min(width - 68 - timerBadgeW, liveCandleCenterX - timerBadgeW / 2)
      );
      const timerBadgeY = Math.max(14, liveHighY - 24);

      ctx.save();
      ctx.fillStyle = '#141722';
      ctx.fillRect(timerBadgeX, timerBadgeY, timerBadgeW, timerBadgeH);
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1;
      ctx.strokeRect(timerBadgeX, timerBadgeY, timerBadgeW, timerBadgeH);
      ctx.fillStyle = '#ff8800';
      ctx.font = 'bold 9.5px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `⏱ ${candleCountdown.formatted}`,
        timerBadgeX + timerBadgeW / 2,
        timerBadgeY + 12
      );

      // Right-axis synchronized candle expiry countdown tag right below live price pill
      const axisTimerY = Math.min(chartHeight - 8, curY + 12);
      ctx.fillStyle = '#141722';
      ctx.fillRect(width - 65, axisTimerY, 65, 16);
      ctx.strokeStyle = 'rgba(255, 136, 0, 0.65)';
      ctx.strokeRect(width - 65, axisTimerY, 65, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(candleCountdown.formatted, width - 32, axisTimerY + 11);
      ctx.restore();
    }

    // 5. Sleek Visual Trade Overlay (Quotex-style minimal compact badge, clean entry level, and unobtrusive markers)
    if (currentAssetActiveTrades.length > 0) {
      const isMobile = width < 560;
      const isCompactMobile = width < 420;

      const liveX = displayCandles.length > 0 ? getCandleCenterX(displayCandles.length - 1) : width - 120;
      const endLineX = Math.min(width - (isMobile ? 70 : 75), Math.max(liveX + (isMobile ? 36 : 55), width - (isMobile ? 80 : 95)));

      // Expiration vertical marker line ("End of trade")
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(endLineX, 10);
      ctx.lineTo(endLineX, chartHeight + 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Responsive top header for expiration vertical line (concise or hidden on tight mobile screens)
      if (width >= 350) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.font = isMobile ? '8px JetBrains Mono, monospace' : '8.5px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isMobile ? 'End' : 'End of trade', endLineX, 18);
      }
      ctx.restore();

      currentAssetActiveTrades.forEach((trade, index) => {
        const strikeY = getY(trade.strikePrice);
        const isCall = trade.direction === 'CALL';
        const tradeColor = isCall ? '#00c26f' : '#ff334b';

        // Check if trade entry point (startTime) is visible on canvas
        const timeframeSec = TIMEFRAME_SECONDS[timeframe] || 60;
        const entryX = timestampToCanvasX(trade.startTime, displayCandles, timeframeSec, width);

        // 1. If entry candle is in view, draw subtle vertical "Beginning of trade" line and entry node
        if (entryX && entryX >= 10 && entryX <= width - 70) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(entryX, 10);
          ctx.lineTo(entryX, chartHeight + 10);
          ctx.stroke();

          // Subtle top header for entry line (suppressed if too close to expiration header)
          const headerDistance = Math.abs(endLineX - entryX);
          if (width >= 380 && headerDistance >= 60) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.font = isMobile ? '8px JetBrains Mono, monospace' : '8.5px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(isMobile ? 'Start' : 'Beginning of trade', entryX, 18);
          }

          // Entry node at execution price
          ctx.fillStyle = tradeColor;
          ctx.beginPath();
          ctx.arc(entryX, strikeY, isMobile ? 2.5 : 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 2. Clean, thin dashed entry price line across chart (low opacity, thin dashed, never occludes candles)
        const lineStartX = entryX && entryX >= 10 && entryX <= width - 70 ? entryX : 0;
        ctx.save();
        ctx.strokeStyle = isCall ? 'rgba(0, 194, 111, 0.45)' : 'rgba(255, 51, 75, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(lineStartX, strikeY);
        ctx.lineTo(width - 65, strikeY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 3. Clean Entry Level Tag on Right Price Scale (Y-axis) - Scaled for mobile
        ctx.save();
        const axisTagW = isCompactMobile ? 58 : isMobile ? 60 : 63;
        const axisTagH = isCompactMobile ? 15 : 17;
        const axisTagX = width - axisTagW - 1;
        const axisTagY = Math.max(8, Math.min(chartHeight - axisTagH - 4, strikeY - axisTagH / 2));
        ctx.fillStyle = '#0084ff'; // Quotex standard clean blue entry level badge on price axis
        drawRoundedRect(ctx, axisTagX, axisTagY, axisTagW, axisTagH, 3);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = isCompactMobile ? 'bold 8px JetBrains Mono, monospace' : isMobile ? 'bold 8.5px JetBrains Mono, monospace' : 'bold 9.5px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(trade.strikePrice.toFixed(selectedAsset.pipDecimals), axisTagX + axisTagW / 2, axisTagY + axisTagH / 2 + 3);
        ctx.restore();

        // 4. Responsive compact badge displaying trade direction (PUT/CALL), amount, and live countdown timer
        const secondsLeft = Math.max(0, Math.ceil((trade.endTime - Date.now()) / 1000));
        const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
        const ss = (secondsLeft % 60).toString().padStart(2, '0');
        const timeFormatted = `${mm}:${ss}`;
        const dirLabel = isCall ? '▲ CALL' : '▼ PUT';

        // Adaptive typography & label sizing for mobile viewports
        const fontSize = isCompactMobile ? 8 : isMobile ? 8.5 : 9.5;
        ctx.save();
        ctx.font = `bold ${fontSize}px JetBrains Mono, -apple-system, monospace`;

        const badgeText = isCompactMobile && width < 360
          ? `${isCall ? '▲' : '▼'} $${trade.investment} ${timeFormatted}`
          : `${dirLabel} $${trade.investment}  ${timeFormatted}`;

        const textMetrics = ctx.measureText(badgeText);
        const pillPaddingH = isCompactMobile ? 10 : isMobile ? 12 : 16;
        const pillWidth = Math.ceil(textMetrics.width + pillPaddingH);
        const pillHeight = isCompactMobile ? 17 : isMobile ? 18.5 : 20;
        const pillRadius = isCompactMobile ? 8.5 : isMobile ? 9.2 : 10;

        // Position badge right next to the current price level or entry point without overflowing into axis or blocking candles
        const maxPillX = width - 66 - pillWidth;
        let pillX: number;
        if (liveX + 6 + pillWidth <= maxPillX) {
          pillX = liveX + 6;
        } else if (liveX - pillWidth - 6 >= 10) {
          pillX = liveX - pillWidth - 6;
        } else {
          pillX = Math.max(8, maxPillX);
        }

        // Slight vertical offset if multiple active trades share similar strike prices
        const yOffset = currentAssetActiveTrades.length > 1
          ? (index - (currentAssetActiveTrades.length - 1) / 2) * (pillHeight + 3)
          : 0;
        const pillY = Math.max(16, Math.min(chartHeight - pillHeight - 4, strikeY - pillHeight / 2 + yOffset));

        // Draw sleek pill background with subtle shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = isMobile ? 4 : 6;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = tradeColor;
        drawRoundedRect(ctx, pillX, pillY, pillWidth, pillHeight, pillRadius);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Crisp white text inside badge: direction (PUT/CALL), amount, and live countdown timer
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, pillX + pillWidth / 2, pillY + pillHeight / 2 + (fontSize >= 9 ? 3.5 : 3));

        // Small connection node circle at current price level / line
        ctx.fillStyle = tradeColor;
        ctx.beginPath();
        ctx.arc(liveX, strikeY + yOffset, isMobile ? 2 : 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Micro countdown tag on the vertical expiration line (shown when space allows on larger displays)
        if (!isCompactMobile && endLineX > pillX + pillWidth + 8 && endLineX + 38 < width - 66) {
          const microTagW = 34;
          const microTagH = 15;
          const microTagX = endLineX + 3;
          const microTagY = strikeY + yOffset - microTagH / 2;
          ctx.fillStyle = '#141722';
          drawRoundedRect(ctx, microTagX, microTagY, microTagW, microTagH, 3);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.font = 'bold 8.5px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(timeFormatted, microTagX + microTagW / 2, strikeY + yOffset + 3);
        }

        ctx.restore();
      });
    }

    // 5b. Interactive Trade History Overlay & Inline Coordinate Win/Loss Floating Badges (+1.80 $)
    if (showHistoryOverlay) {
      const { markers, trajectories } = computeTradeHistoryChartMarkers({
        trades: closedTrades,
        assetSymbol: selectedAsset.symbol,
        visibleCandles: displayCandles,
        timeframeSeconds: TIMEFRAME_SECONDS[timeframe],
        canvasWidth: width,
        chartHeight,
        minPrice,
        maxPrice,
      });
      tradeMarkersRef.current = markers;

      // Draw dashed trajectory connectors between Execution (startTime) and Settlement (endTime)
      trajectories.forEach((traj) => {
        const isHighlighted = activeInspectedMarker?.tradeId === traj.tradeId;
        ctx.save();
        ctx.strokeStyle = traj.color;
        ctx.globalAlpha = isHighlighted ? 0.95 : 0.65;
        ctx.lineWidth = isHighlighted ? 2.2 : 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(traj.entryPoint.x, traj.entryPoint.y);
        ctx.lineTo(traj.exitPoint.x, traj.exitPoint.y);
        ctx.stroke();
        ctx.restore();
      });

      // Draw crisp green (#00e676) and red (#ff334b) execution & settlement indicator dots + Inline Floating Profit/Loss Boxes
      markers.forEach((marker) => {
        const isExactHover = activeInspectedMarker?.id === marker.id;
        const isSameTradeHover = activeInspectedMarker?.tradeId === marker.tradeId;
        const dotRadius = isExactHover ? 6 : isSameTradeHover ? 5.2 : 4.2;

        ctx.save();
        // Outer subtle ring
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, isExactHover ? 10 : 7, 0, Math.PI * 2);
        ctx.fillStyle = marker.isWin
          ? isExactHover
            ? 'rgba(0, 230, 118, 0.32)'
            : 'rgba(0, 230, 118, 0.16)'
          : isExactHover
          ? 'rgba(255, 51, 75, 0.32)'
          : 'rgba(255, 51, 75, 0.16)';
        ctx.fill();

        // Main green/red dot indicator
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = marker.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#0a0a0a';
        ctx.stroke();

        if (marker.pointType === 'execution') {
          // Execution dot center pinpoint
          ctx.beginPath();
          ctx.arc(marker.x, marker.y, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        } else {
          // Settlement coordinate: Render Quotex-exact floating box badge ("+44.00 $" / "+1.80 $" bright green for wins, red/muted box for losses)
          const badgeBox = computeInlineTradeResultBadgeBox({
            anchorX: marker.x,
            anchorY: marker.y,
            canvasWidth: width,
            chartHeight,
            isWin: marker.isWin,
            profitOrPnl: marker.pnl,
            investment: marker.investment,
            direction: marker.direction,
          });

          // Connector stem from settlement coordinate to floating badge
          ctx.beginPath();
          ctx.strokeStyle = badgeBox.borderColor;
          ctx.lineWidth = 1.2;
          ctx.moveTo(marker.x, marker.y);
          ctx.lineTo(
            Math.max(badgeBox.boxX + 6, Math.min(badgeBox.boxX + badgeBox.boxWidth - 6, marker.x)),
            badgeBox.boxY < marker.y ? badgeBox.boxY + badgeBox.boxHeight : badgeBox.boxY
          );
          ctx.stroke();

          // Floating Box Fill & Crisp Border
          ctx.fillStyle = badgeBox.bgColor;
          ctx.fillRect(badgeBox.boxX, badgeBox.boxY, badgeBox.boxWidth, badgeBox.boxHeight);
          ctx.strokeStyle = badgeBox.borderColor;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(badgeBox.boxX, badgeBox.boxY, badgeBox.boxWidth, badgeBox.boxHeight);

          // Exact Profit / Loss Text (e.g. "+44.00 $" or "+1.80 $")
          ctx.fillStyle = badgeBox.textColor;
          ctx.font = 'bold 10px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(
            badgeBox.label,
            badgeBox.boxX + badgeBox.boxWidth / 2,
            badgeBox.boxY + 14.5
          );
        }
        ctx.restore();
      });
    } else {
      tradeMarkersRef.current = [];
    }

    // 6. User Technical Drawings Render (All 11 Quotex Drawing Tools + Selection Handles with Zoom/Pan Coordinate Lock)
    const allDrawings = [...drawings, ...(currentDrawing ? [currentDrawing] : [])].map((d) => {
      const maxVis = Math.max(18, Math.floor((width - 75) / (11 * zoomLevel)));
      const endIdx = Math.max(maxVis, candles.length - panOffset);
      const startIdx = Math.max(0, endIdx - maxVis);
      const visibleSlice = candles.slice(startIdx, endIdx);
      const slotW = (width - 78) / Math.max(1, visibleSlice.length);

      let sCandle = d.startCandleIndex;
      let sPrice = d.startPrice;
      let eCandle = d.endCandleIndex;
      let ePrice = d.endPrice;
      let cCandle = d.controlCandleIndex;
      let cPrice = d.controlPrice;

      if (sCandle === undefined || sPrice === undefined) {
        sCandle = startIdx + Math.max(0, (d.startX - 10) / Math.max(0.001, slotW));
        sPrice = maxPrice - ((d.startY - 10) / Math.max(1, chartHeight)) * (maxPrice - minPrice);
      }
      if (eCandle === undefined || ePrice === undefined) {
        eCandle = startIdx + Math.max(0, (d.endX - 10) / Math.max(0.001, slotW));
        ePrice = maxPrice - ((d.endY - 10) / Math.max(1, chartHeight)) * (maxPrice - minPrice);
      }
      if (d.controlX !== undefined && d.controlY !== undefined && (cCandle === undefined || cPrice === undefined)) {
        cCandle = startIdx + Math.max(0, (d.controlX - 10) / Math.max(0.001, slotW));
        cPrice = maxPrice - ((d.controlY - 10) / Math.max(1, chartHeight)) * (maxPrice - minPrice);
      }

      const startPx = (sCandle - startIdx) * slotW + 10;
      const startPy = chartHeight - ((sPrice - minPrice) / Math.max(1e-8, maxPrice - minPrice)) * chartHeight + 10;
      const endPx = (eCandle - startIdx) * slotW + 10;
      const endPy = chartHeight - ((ePrice - minPrice) / Math.max(1e-8, maxPrice - minPrice)) * chartHeight + 10;

      let ctrlPx = d.controlX;
      let ctrlPy = d.controlY;
      if (cCandle !== undefined && cPrice !== undefined) {
        ctrlPx = (cCandle - startIdx) * slotW + 10;
        ctrlPy = chartHeight - ((cPrice - minPrice) / Math.max(1e-8, maxPrice - minPrice)) * chartHeight + 10;
      }

      return {
        ...d,
        startCandleIndex: sCandle,
        startPrice: sPrice,
        endCandleIndex: eCandle,
        endPrice: ePrice,
        controlCandleIndex: cCandle,
        controlPrice: cPrice,
        startX: startPx,
        startY: startPy,
        endX: endPx,
        endY: endPy,
        controlX: ctrlPx,
        controlY: ctrlPy,
      };
    });

    allDrawings.forEach((d) => {
      const isSelectedOrHovered = d.id === selectedDrawingId || d.id === hoveredDrawingId;
      renderDrawingOnCanvas(
        ctx,
        d,
        width,
        height,
        chartHeight,
        minPrice,
        maxPrice,
        selectedAsset.pipDecimals,
        isSelectedOrHovered
      );
    });

    // 7. RSI Sub-Pane at Bottom (if enabled)
    let currentBottomY = height - 10;
    if (indicators.showRsi) {
      const rsiH = 55;
      const rsiYStart = currentBottomY - rsiH;
      currentBottomY = rsiYStart - 10;

      ctx.fillStyle = '#11141e';
      ctx.fillRect(0, rsiYStart, width, rsiH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeRect(0, rsiYStart, width, rsiH);

      const rsi70 = rsiYStart + rsiH * 0.3;
      const rsi30 = rsiYStart + rsiH * 0.7;
      ctx.strokeStyle = 'rgba(255, 51, 75, 0.4)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(0, rsi70);
      ctx.lineTo(width, rsi70);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0, 230, 118, 0.4)';
      ctx.beginPath();
      ctx.moveTo(0, rsi30);
      ctx.lineTo(width, rsi30);
      ctx.stroke();
      ctx.setLineDash([]);

      const rsiValues = calculateRSI(displayCandles, indicators.rsiPeriod);
      ctx.strokeStyle = indicators.rsiColor || '#00e5ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      rsiValues.forEach((val, idx) => {
        if (val !== null) {
          const x = getCandleCenterX(idx);
          const y = rsiYStart + rsiH - (val / 100) * rsiH;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      const lastRsi = rsiValues[rsiValues.length - 1];
      ctx.fillStyle = indicators.rsiColor || '#00e5ff';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`RSI (${indicators.rsiPeriod}): ${lastRsi ? lastRsi.toFixed(1) : '--'}`, width - 70, rsiYStart + 14);
    }

    // 8. MACD Sub-Pane at Bottom (if enabled)
    if (indicators.showMacd) {
      const macdH = 60;
      const macdYStart = currentBottomY - macdH;

      ctx.fillStyle = '#0f131c';
      ctx.fillRect(0, macdYStart, width, macdH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeRect(0, macdYStart, width, macdH);

      const macdData = calculateMACD(displayCandles, indicators.macdFast, indicators.macdSlow, indicators.macdSignal);
      const zeroY = macdYStart + macdH / 2;

      const allMacdMags = [
        ...macdData.macd.filter((v): v is number => v !== null).map((v) => Math.abs(v)),
        ...macdData.signal.filter((v): v is number => v !== null).map((v) => Math.abs(v)),
        ...macdData.histogram.filter((v): v is number => v !== null).map((v) => Math.abs(v)),
      ];
      const maxMacdAbs = Math.max(0.00001, ...allMacdMags);
      const macdScale = (macdH * 0.42) / maxMacdAbs;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(width, zeroY);
      ctx.stroke();

      // Histogram bars
      macdData.histogram.forEach((hist, idx) => {
        if (hist !== null) {
          const x = Math.round(idx * slotWidth + 10);
          const barH = hist * macdScale;
          ctx.fillStyle = hist >= 0 ? '#00e676' : '#ff334b';
          ctx.fillRect(x, zeroY - barH, Math.max(2, candleWidth - 1), barH);
        }
      });

      // MACD line
      ctx.strokeStyle = indicators.macdColor || '#2962ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let startedMacd = false;
      macdData.macd.forEach((val, idx) => {
        if (val !== null) {
          const x = getCandleCenterX(idx);
          const y = zeroY - val * macdScale;
          if (!startedMacd) {
            ctx.moveTo(x, y);
            startedMacd = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      // Signal line
      ctx.strokeStyle = indicators.macdSignalColor || '#ff334b';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      let startedSig = false;
      macdData.signal.forEach((val, idx) => {
        if (val !== null) {
          const x = getCandleCenterX(idx);
          const y = zeroY - val * macdScale;
          if (!startedSig) {
            ctx.moveTo(x, y);
            startedSig = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      ctx.fillStyle = '#00e5ff';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`MACD (${indicators.macdFast}, ${indicators.macdSlow}, ${indicators.macdSignal})`, width - 70, macdYStart + 12);
    }

    // 9. TradingView Interactive Crosshair & Axis Callout Labels on Hover
    if (crosshairPos && crosshairPos.x > 0 && crosshairPos.x < width - 65 && crosshairPos.y > 10 && crosshairPos.y < chartHeight + 10) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical crosshair line
      ctx.beginPath();
      ctx.moveTo(crosshairPos.x, 10);
      ctx.lineTo(crosshairPos.x, chartHeight + 10);
      ctx.stroke();

      // Horizontal crosshair line
      ctx.beginPath();
      ctx.moveTo(0, crosshairPos.y);
      ctx.lineTo(width - 65, crosshairPos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price callout pill on right price scale
      const hoverPrice =
        maxPrice - ((crosshairPos.y - 10) / Math.max(1, chartHeight)) * (maxPrice - minPrice);
      ctx.fillStyle = '#252b3d';
      ctx.fillRect(width - 64, crosshairPos.y - 9, 62, 18);
      ctx.strokeStyle = '#ff8800';
      ctx.strokeRect(width - 64, crosshairPos.y - 9, 62, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9.5px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(hoverPrice.toFixed(selectedAsset.pipDecimals), width - 33, crosshairPos.y + 3);
      ctx.restore();
    }
    } catch (err) {
      console.error('Canvas render error:', err);
      ctx.restore();
    }
  }, [
    candles,
    currentPrice,
    smoothPrice,
    selectedAsset,
    timeframe,
    chartType,
    indicators,
    activeTrades,
    closedTrades,
    showHistoryOverlay,
    activeInspectedMarker,
    crosshairPos,
    zoomLevel,
    panOffset,
    drawings,
    currentDrawing,
    selectedDrawingId,
    hoveredDrawingId,
    activeDrawingTool,
    drawingColor,
    canvasSize,
    candleCountdown.formatted,
  ]);

  // Observe chart container resize so canvas never collapses to 0x0 on mobile or desktop
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize((prev) => {
          const w = Math.floor(rect.width);
          const h = Math.floor(rect.height);
          return prev.width === w && prev.height === h ? prev : { width: w, height: h };
        });
      }
    };

    updateDimensions();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateDimensions());
      observer.observe(container);
    }
    window.addEventListener('resize', updateDimensions);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] md:h-[calc(100vh-60px)] md:min-h-[720px] bg-[#0a0a0a] text-slate-100 overflow-hidden font-sans select-none relative">
      {/* Global Assets Loading Overlay */}
      {isLoadingAssets && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a0a]/98 backdrop-blur-md pointer-events-auto font-mono text-center px-6">
          <div className="relative mb-8">
            <div className="w-20 h-20 rounded-full border-2 border-white/5 border-t-[#ff8800] animate-spin" />
            <Activity className="w-8 h-8 text-[#ff8800] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <div className="space-y-3">
            <h2 className="text-lg font-black text-white uppercase tracking-[0.3em] ml-1">
              Synchronizing Markets
            </h2>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest animate-pulse">
                Fetching 250+ Institutional OTC Feeds...
              </p>
              <p className="text-[10px] text-[#ff8800]/60 font-black tracking-tighter italic">
                Verifying Global Price Synchronization
              </p>
            </div>
          </div>
        </div>
      )}
      {/* 0. COMPACT MOBILE TOP NAVIGATION HEADER (Quotex Mobile View) */}
      <div
        data-testid="quotex-mobile-top-header"
        className="flex md:hidden h-10 bg-[#0a0a0a] border-b border-white/10 items-center justify-between px-2.5 shrink-0 z-30"
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onNavigateTab?.('home');
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141720] border border-white/10 text-xs font-mono font-bold text-slate-300"
            title="Return to BFT Portal"
          >
            <span className="font-black text-[#ff8800]">BFT</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-[#ff8800]/20 text-[#ff8800] font-bold">OTC</span>
          </button>

          {/* Mobile Account Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              data-testid="mobile-account-switcher"
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#141720] border border-white/10 text-xs font-mono"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isBreached
                    ? 'bg-rose-500 animate-pulse'
                    : isPersonalLiveAccount(effectiveAccount) || isLiveFundedAccount(effectiveAccount)
                    ? 'bg-[#00e676]'
                    : 'bg-[#ff8800]'
                }`}
              />
              <span className="text-[9px] uppercase font-black px-1 py-0.2 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/30">
                {isPersonalLiveAccount(effectiveAccount)
                  ? 'PERSONAL'
                  : isDemoAccount(effectiveAccount)
                  ? 'DEMO'
                  : isLiveFundedAccount(effectiveAccount)
                  ? 'LIVE'
                  : 'CHALLENGE'}
              </span>
              <span className="text-[11px] font-black font-mono text-white">
                ${formatMobileAccountBalance(effectiveAccount.currentBalance, 2)}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Account Switcher Dropdown Modal */}
            {accountDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#141824] border border-[#2a2e39] rounded-xl shadow-2xl p-2 z-50 font-mono">
                <div className="text-[10px] text-slate-400 font-bold px-2 py-1 uppercase tracking-wider">
                  Select Trading Account
                </div>
                {accounts && accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => {
                      onSelectAccount?.(acc.id);
                      setAccountDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors mb-1 ${
                      acc.id === account?.id
                        ? 'bg-[#252b3b] border border-[#ff8800]/50 text-white'
                        : 'hover:bg-[#1b1f2b] text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs">{acc.id}</div>
                      <div className="text-[10px] text-[#00e676] font-mono">
                        ${(acc?.currentBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                        isLiveFundedAccount(acc)
                          ? 'bg-[#00c853]/25 text-[#00e676]'
                          : 'bg-[#ff8800]/20 text-[#ff8800]'
                      }`}
                    >
                      {getAccountStatusBadgeLabel(acc)}
                    </span>
                  </button>
                ))}
                {onOpenChallengeModal && (
                  <div className="border-t border-[#2a2e39] mt-2 pt-2">
                    <button
                      onClick={() => {
                        setAccountDropdownOpen(false);
                        onOpenChallengeModal();
                      }}
                      className="w-full py-1.5 text-xs text-center font-bold text-[#ff8800] hover:text-amber-300 rounded bg-[#131722] border border-[#ff8800]/30"
                    >
                      + Buy New Evaluation Account
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="mobile-header-leaderboard-btn"
            onClick={() => {
              soundEngine.playUiClick();
              setIsLeaderboardOpen(true);
            }}
            className="p-1.5 rounded-lg bg-[#141720] border border-white/10 text-[#ff8800]"
            title="Top 20 Leaderboard"
          >
            <Trophy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="mobile-alerts-btn"
            onClick={() => {
              soundEngine.playUiClick();
              setIsPriceAlertModalOpen(true);
            }}
            className="p-1.5 rounded-lg bg-[#141720] border border-white/10 text-[#ff8800] relative"
            title="Price Alerts"
          >
            <BellRing className="w-3.5 h-3.5" />
            {alerts.filter((a) => a.active && !a.triggered).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#ff8800] absolute top-1 right-1 animate-ping" />
            )}
          </button>

          <button
            type="button"
            data-testid="mobile-deposit-btn"
            onClick={() => {
              soundEngine.playUiClick();
              if (onOpenDepositModal) {
                onOpenDepositModal();
              } else if (onOpenChallengeModal) {
                onOpenChallengeModal();
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-[#00e676] hover:bg-[#00c853] text-black font-black text-xs font-mono flex items-center gap-1 shadow-md"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Deposit</span>
          </button>
        </div>
      </div>

      {/* 1. MAIN NAVIGATION HEADER */}
      <div className="hidden md:flex h-12 bg-[#1e222d] border-b border-[#2a2e39] flex items-center justify-between px-3 shrink-0 z-20">
        {/* Left: Brand / Portal Button */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onNavigateTab?.('home');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161923] hover:bg-[#252a37] border border-[#2a2e39] text-xs font-mono font-bold cursor-pointer transition-colors text-slate-300 hover:text-white"
            title="Return to BFT Portal"
          >
            <span className="font-black text-[#ff8800]">BFT</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-[#ff8800]/20 text-[#ff8800] font-bold">
              TRADING TERMINAL
            </span>
          </button>
        </div>

        {/* Right Section: Real/Demo Account Switcher, Deposit (Green), Withdrawal, Price Alerts, Sound, Profile */}
        <div className="flex items-center gap-2 shrink-0 pl-2">
          {/* Price Alert Manager Button */}
          <button
            onClick={() => {
              soundEngine.playUiClick();
              setIsPriceAlertModalOpen(true);
            }}
            className="relative px-2.5 py-1.5 rounded-xl bg-[#181b25] hover:bg-[#222736] border border-[#2a2e39] text-amber-400 hover:text-amber-300 text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer"
            title="Real-Time Price Alerts"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-bold">Alerts</span>
            {alerts.filter((a) => a.active && !a.triggered).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          {/* Account Balance Switcher Dropdown (Quotex CHALLENGE vs LIVE ACCOUNT vs PERSONAL LIVE Badge) */}
          <div className="relative">
            <button
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              data-testid="terminal-account-switcher"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0a0a0a] hover:bg-[#141418] border border-white/15 hover:border-[#ff8800] text-xs font-mono transition-colors cursor-pointer"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  !account
                    ? 'bg-[#ff8800]'
                    : isBreached
                    ? 'bg-rose-500 animate-pulse'
                    : isPersonalLiveAccount(account)
                    ? 'bg-[#ff8800]'
                    : isDemoAccount(account)
                    ? 'bg-slate-400'
                    : isLiveFundedAccount(account)
                    ? 'bg-[#00e676]'
                    : 'bg-[#ff8800]'
                }`}
              />
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white text-[11px]">
                    {!account
                      ? 'No Active Account'
                      : isPersonalLiveAccount(account)
                      ? 'Personal Live Balance'
                      : isDemoAccount(account)
                      ? 'Demo'
                      : account.id}
                  </span>
                  {account && (
                    <span
                      data-testid="terminal-account-status-badge"
                      className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border ${
                        isPersonalLiveAccount(account)
                          ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                          : isDemoAccount(account)
                          ? 'bg-white/10 text-slate-300 border-white/20'
                          : isLiveFundedAccount(account)
                          ? 'bg-[#00c853]/25 text-[#00e676] border-[#00e676]/60'
                          : 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/50'
                      }`}
                    >
                      {getAccountStatusBadgeLabel(account)}
                    </span>
                  )}
                </div>
                <div className={`text-xs font-black ${!account ? 'text-[#ff8800]' : isBreached ? 'text-rose-400' : 'text-[#00e676]'}`}>
                  {account
                    ? `$${account.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : 'Choose a Plan'}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {/* Account Switcher Dropdown Menu */}
            {accountDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#1e222d] border border-[#2a2e39] shadow-2xl p-2 z-50 font-mono text-xs animate-in fade-in">
                <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                  Switch Prop Account
                </div>
                {accounts.map((acc) => {
                  const isLive = isLiveFundedAccount(acc);
                  return (
                    <button
                      key={acc.id}
                      onClick={() => {
                        soundEngine.playUiClick();
                        onSelectAccount?.(acc.id);
                        setAccountDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer ${
                        acc.id === account?.id ? 'bg-cyan-500/15 border border-cyan-500/30' : 'hover:bg-[#262b3a]'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{acc.id}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border ${
                              isLive
                                ? 'bg-[#00c853]/25 text-[#00e676] border-[#00e676]/60'
                                : 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/50'
                            }`}
                          >
                            {getAccountStatusBadgeLabel(acc)}
                          </span>
                          {acc.status === 'breached' && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">
                              BREACHED
                            </span>
                          )}
                        </div>
                        <div className="text-[#00e676] font-black mt-0.5">
                          ${acc.currentBalance.toFixed(2)} • {acc.tierName}
                        </div>
                      </div>
                      {acc.id === account?.id && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                    </button>
                  );
                })}
                {onOpenChallengeModal && (
                  <div className="border-t border-[#2a2e39] mt-2 pt-2">
                    <button
                      onClick={() => {
                        setAccountDropdownOpen(false);
                        onOpenChallengeModal();
                      }}
                      className="w-full py-1.5 text-xs text-center font-bold text-amber-400 hover:text-amber-300 rounded bg-[#131722] border border-amber-500/20 cursor-pointer"
                    >
                      + Buy New Evaluation Account
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Green "Deposit" Button (Cryptomus USDT TRC-20 Automated Gateway) */}
          <button
            type="button"
            data-testid="terminal-deposit-btn"
            onClick={() => {
              soundEngine.playUiClick();
              if (onOpenDepositModal) {
                onOpenDepositModal();
              } else if (onOpenChallengeModal) {
                onOpenChallengeModal();
              }
            }}
            className="px-3.5 py-1.5 rounded-lg bg-[#00e676] hover:bg-[#00c853] text-slate-950 font-black text-xs shadow-lg hover:brightness-105 transition-all cursor-pointer font-mono flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span className="font-black uppercase tracking-wider">Deposit</span>
          </button>

          {/* Instant "Withdrawal" Button */}
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onOpenWithdrawalModal();
            }}
            className="px-3 py-1.5 rounded-lg bg-[#252b3b] hover:bg-[#2e364a] text-slate-200 border border-[#2a2e39] font-bold text-xs transition-all cursor-pointer font-mono flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="hidden sm:inline">Withdrawal</span>
          </button>

          {/* Sound FX Toggle Button */}
          <button
            onClick={handleToggleSound}
            className={`p-2 rounded-lg border transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-[#252b3b] border-cyan-500/40 text-cyan-400'
                : 'bg-[#181b25] border-[#2a2e39] text-slate-500'
            }`}
            title={soundEnabled ? 'Mute Sound Effects' : 'Enable Sound Effects'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* Sleek Circular User Profile Avatar in TOP-RIGHT Corner */}
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onNavigateTab?.('dashboard');
            }}
            className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 text-white font-black text-xs border border-cyan-400/80 shadow-md hover:scale-105 transition-all cursor-pointer shrink-0 ml-1"
            title="User Profile & Settings"
          >
            <span>
              {userProfile?.fullName
                ? userProfile.fullName.slice(0, 2).toUpperCase()
                : 'TR'}
            </span>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#00e676] border-2 border-[#1e222d]" />
          </button>
        </div>
      </div>

      {/* Main Trading Stage: Left Sidebar + Central Chart + Right Execution Panel */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* 2. LEFT-SIDE ICON NAVIGATION BAR */}
        <div className="hidden md:flex w-14 bg-[#1e222d] border-r border-[#2a2e39] flex flex-col items-center justify-between py-3 shrink-0 z-10">
          <div className="flex flex-col items-center gap-3">
            {/* Trade / Terminal Icon (Active) */}
            <button
              className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center text-cyan-400 shadow-md cursor-pointer"
              title="Trade Terminal"
            >
              <Activity className="w-5 h-5" />
            </button>

            {/* Trades History Drawer Toggle */}
            <button
              onClick={() => {
                soundEngine.playUiClick();
                setIsTradesDrawerOpen(!isTradesDrawerOpen);
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                isTradesDrawerOpen
                  ? 'bg-[#252b3b] text-cyan-400 border border-[#2a2e39]'
                  : 'hover:bg-[#252a37] text-slate-400 hover:text-white'
              }`}
              title="Toggle Bottom Trades Drawer"
            >
              <Layers className="w-5 h-5" />
            </button>

            {/* Dedicated "BFT Trading Signals" Panel Button */}
            <button
              onClick={() => {
                soundEngine.playUiClick();
                setIsSignalsDrawerOpen(!isSignalsDrawerOpen);
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                isSignalsDrawerOpen
                  ? 'bg-emerald-500/20 text-[#00e676] border border-[#00e676]/40'
                  : 'hover:bg-[#252a37] text-slate-400 hover:text-white'
              }`}
              title="BFT Trading Signals"
            >
              <Radio className="w-5 h-5 text-[#00e676]" />
              <span className="w-2 h-2 rounded-full bg-[#00e676] absolute top-2 right-2 animate-ping" />
            </button>

            {/* Tournaments & Leaderboard */}
            <button
              type="button"
              data-testid="desktop-leaderboard-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setIsLeaderboardOpen(true);
              }}
              className="w-10 h-10 rounded-xl hover:bg-[#252a37] flex items-center justify-center text-slate-400 hover:text-amber-400 transition-all cursor-pointer"
              title="Tournaments & Leaderboard"
            >
              <Trophy className="w-5 h-5" />
            </button>

            {/* Market / Assets Catalog */}
            <button
              onClick={() => {
                soundEngine.playUiClick();
                setIsAssetModalOpen(true);
              }}
              className="w-10 h-10 rounded-xl hover:bg-[#252a37] flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-all cursor-pointer"
              title="OTC Market Assets"
            >
              <Globe className="w-5 h-5" />
            </button>

            {/* Prop Firm Rules & Guardrails */}
            <button
              onClick={() => {
                soundEngine.playUiClick();
                setIsRulesModalOpen(true);
              }}
              className="w-10 h-10 rounded-xl hover:bg-[#252a37] flex items-center justify-center text-slate-400 hover:text-sky-400 transition-all cursor-pointer"
              title="Risk & Prop Firm Rules"
            >
              <ShieldCheck className="w-5 h-5" />
            </button>

            {/* 3-Tier Multi-Level Affiliate System */}
            <button
              onClick={() => {
                soundEngine.playUiClick();
                onNavigateTab?.('affiliate');
              }}
              className="w-10 h-10 rounded-xl hover:bg-[#252a37] flex items-center justify-center text-slate-400 hover:text-purple-400 transition-all cursor-pointer relative"
              title="3-Tier Affiliate System (10% / 5% / 2% + 8%)"
            >
              <Users className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple-400" />
            </button>
          </div>

          {/* Bottom Icons: Drawing Pencil Drawer, Indicators, Support & FAQ, User Profile */}
          <div className="flex flex-col items-center gap-3">
            {/* Dedicated Pencil Icon Tool Drawer Toggle */}
            <button
              type="button"
              data-testid="sidebar-pencil-drawer-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setIsDrawingDrawerOpen((prev) => !prev);
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                isDrawingDrawerOpen || activeDrawingTool !== 'none'
                  ? 'bg-[#ff8800] text-slate-950 border border-[#ff8800]'
                  : 'hover:bg-[#252a37] text-slate-400 hover:text-[#ff8800]'
              }`}
              title="Drawing Tools Side-Drawer (11 Technical Tools)"
            >
              <Pencil className="w-4 h-4" />
              {drawings.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[15px] h-[15px] rounded-full bg-[#00e676] text-slate-950 font-mono font-black text-[9px] flex items-center justify-center">
                  {drawings.length}
                </span>
              )}
            </button>

            {/* Indicator Parameters */}
            <button
              onClick={() => {
                soundEngine.playUiClick();
                setIsIndicatorModalOpen(true);
              }}
              className="w-10 h-10 rounded-xl hover:bg-[#252a37] flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Technical Indicators"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Support / FAQ */}
            <button
              onClick={() => {
                soundEngine.playUiClick();
                onNavigateTab?.('faq');
              }}
              className="w-10 h-10 rounded-xl hover:bg-[#252a37] flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Support & FAQ Desk"
            >
              <Headphones className="w-4 h-4" />
            </button>

            {/* Profile Hub */}
            <button
              onClick={() => {
                soundEngine.playUiClick();
                onNavigateTab?.('dashboard');
              }}
              className="w-10 h-10 rounded-xl hover:bg-[#252a37] flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-all cursor-pointer"
              title="Account Profile & Settings"
            >
              <User className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3. CENTRAL SUPER-SMOOTH OTC ALGORITHMIC CHART ENGINE */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-[#0a0a0a] min-h-0">
          {/* 1. TOP MULTI-ASSET SCROLLING TICKER BAR (Quotex Style) */}
          <div
            data-testid="top-multi-asset-ticker-bar"
            className="flex items-center gap-1.5 overflow-x-auto px-2 py-1.5 md:px-3 md:py-2 bg-[#0a0a0a] border-b border-white/10 shrink-0 z-25 font-mono text-xs select-none no-scrollbar"
          >
            {openTabs.map((tabAsset) => {
              const isTabActive = tabAsset.symbol === selectedAsset.symbol;
              const livePayout = getLivePayoutPercentage(tabAsset, payoutSeed);
              const tabState = getAssetMarketState(tabAsset.symbol);
              const displayPrice = isTabActive
                ? smoothPrice
                : (tabState?.lastPrice ?? tabAsset.basePrice);
              return (
                <div
                  key={tabAsset.symbol}
                  onClick={() => {
                    soundEngine.playUiClick();
                    setSelectedAsset(tabAsset);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                    isTabActive
                      ? 'bg-[#141720] border-[#ff8800] text-white shadow-sm'
                      : 'bg-[#0e1016] hover:bg-[#141720] border-white/10 text-slate-300'
                  }`}
                >
                  <span className="text-sm shrink-0">{tabAsset.flag || '📈'}</span>
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-xs whitespace-nowrap">{tabAsset.symbol}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {displayPrice.toFixed(tabAsset.pipDecimals)}
                    </span>
                  </div>
                  <span className="text-[11px] font-black text-[#00e676] shrink-0 ml-1">
                    {livePayout}%
                  </span>
                  {openTabs.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Close tab ${tabAsset.symbol}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        soundEngine.playUiClick();
                        const nextTabs = openTabs.filter((t) => t.symbol !== tabAsset.symbol);
                        setOpenTabs(nextTabs);
                        if (isTabActive && nextTabs.length > 0) {
                          setSelectedAsset(nextTabs[0]);
                        }
                      }}
                      className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              data-testid="add-asset-ticker-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setIsAssetModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141822] hover:bg-[#1e2536] border border-dashed border-[#ff8800]/50 text-[#ff8800] font-bold text-xs cursor-pointer shrink-0 transition-colors"
              title="Add Asset Pair"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Asset</span>
            </button>

            {/* Real-Time Live Synchronized 268+ Market Feed Badge */}
            <div
              data-testid="live-market-feed-badge"
              className="ml-auto hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#141824] border border-[#2a2e39] shrink-0 text-xs font-mono select-none"
              title={`Synchronized REST Market Engine • ${feedStatus.activePairsCount} Active Assets • Real-Time Latency: ${feedStatus.latencyMs}ms`}
            >
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e676] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00e676]" />
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-200">
                  {feedStatus.activePairsCount}+ Markets Sync
                </span>
              </div>
              <span className="text-slate-600">|</span>
              <span className="text-[10px] font-bold text-slate-400">1s Tick Engine</span>
              <span className="text-slate-600">|</span>
              <span className="text-[10px] font-black font-mono text-[#00e676]">
                {feedStatus.latencyMs}ms
              </span>
            </div>
          </div>

          {/* Active Price Alert Floating Toast Notification */}
          {activeAlertToast && (
            <div className="absolute top-4 right-4 max-w-sm px-4 py-2.5 bg-slate-900/95 border border-cyan-400 text-cyan-300 font-bold text-xs font-mono rounded-xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 z-40 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-cyan-400 shrink-0 animate-bounce" />
                <span>{activeAlertToast}</span>
              </div>
              <button
                onClick={() => setActiveAlertToast(null)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          )}

          {/* SLEEK TECHNICAL ANALYSIS DRAWING TOOLS & INDICATORS SIDE-DRAWER MENU */}
          {isDrawingDrawerOpen && (
            <div
              data-testid="drawing-tools-side-drawer"
              className="absolute top-0 left-0 bottom-0 z-30 w-72 sm:w-80 bg-[#0d1017]/98 border-r border-[#262b38] flex flex-col font-mono text-xs text-slate-200 select-none"
            >
              {/* Drawer Header */}
              <div className="px-3.5 py-3 border-b border-[#222735] flex items-center justify-between bg-[#121620]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/50 flex items-center justify-center text-[#ff8800]">
                    <Pencil className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-black text-white text-xs tracking-wide uppercase">
                      Drawings & Indicators
                    </div>
                    <div className="text-[10px] text-[#ff8800]">
                      Asset: {selectedAsset.symbol} (Isolated State)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="close-drawing-drawer-btn"
                  onClick={() => setIsDrawingDrawerOpen(false)}
                  className="p-1.5 rounded-lg bg-[#1a1f2e] hover:bg-[#252c40] text-slate-400 hover:text-white cursor-pointer"
                  title="Close Drawing & Indicator Drawer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Section Switcher Tabs: Drawing Tools vs Indicators */}
              <div className="grid grid-cols-2 gap-1 p-1.5 bg-[#0a0c12] border-b border-[#1f2433]">
                <button
                  type="button"
                  data-testid="drawer-tab-drawings"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setDrawerActiveSection('drawings');
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    drawerActiveSection === 'drawings'
                      ? 'bg-[#ff8800] text-slate-950'
                      : 'text-slate-400 hover:text-white bg-[#131722]'
                  }`}
                >
                  <Pencil className="w-3 h-3" />
                  <span>Drawings ({drawings.length})</span>
                </button>
                <button
                  type="button"
                  data-testid="drawer-tab-indicators"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setDrawerActiveSection('indicators');
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    drawerActiveSection === 'indicators'
                      ? 'bg-[#ff8800] text-slate-950'
                      : 'text-slate-400 hover:text-white bg-[#131722]'
                  }`}
                >
                  <Sliders className="w-3 h-3" />
                  <span>Indicators</span>
                </button>
              </div>

              {drawerActiveSection === 'drawings' ? (
                <>
                  {/* Active Tool Status Banner & Pointer Reset */}
                  <div className="px-3.5 py-2 bg-[#10141d] border-b border-[#1f2433] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activeDrawingTool !== 'none' ? 'bg-[#00e676]' : 'bg-slate-500'
                        }`}
                      />
                      <span className="text-[10px] font-bold text-slate-300">
                        {activeDrawingTool !== 'none'
                          ? `Armed: ${
                              QUOTEX_DRAWING_TOOLS.find((t) => t.id === activeDrawingTool)?.label ||
                              activeDrawingTool
                            }`
                          : 'Mode: Pointer / Select'}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid="drawer-pointer-mode-btn"
                      onClick={() => handleSelectDrawingTool('none')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        activeDrawingTool === 'none'
                          ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                          : 'bg-[#181d2a] text-slate-300 border-[#2a3042] hover:text-white'
                      }`}
                    >
                      Pointer
                    </button>
                  </div>

                  {/* Default Styling Controls (Color, Thickness, Line Style) */}
                  <div className="px-3.5 py-2.5 border-b border-[#222735] space-y-2 bg-[#0f131c]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Stroke Color</span>
                      <div className="flex items-center gap-1.5">
                        {DRAWING_COLOR_PALETTE.map((c) => (
                          <button
                            key={c}
                            type="button"
                            data-testid={`drawer-color-${c.replace('#', '')}`}
                            onClick={() => {
                              setDrawingColor(c);
                              if (selectedDrawingId) {
                                setDrawings((prev) =>
                                  prev.map((d) => (d.id === selectedDrawingId ? { ...d, color: c } : d))
                                );
                              }
                            }}
                            className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                              (selectedDrawing?.color || drawingColor) === c
                                ? 'scale-125 border-white'
                                : 'border-white/20'
                            }`}
                            style={{ backgroundColor: c }}
                            title={`Select color ${c}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Width</span>
                        {[1, 2, 3, 4].map((w) => (
                          <button
                            key={w}
                            type="button"
                            data-testid={`drawer-width-${w}`}
                            onClick={() => {
                              setDrawingWidth(w);
                              if (selectedDrawingId) {
                                setDrawings((prev) =>
                                  prev.map((d) => (d.id === selectedDrawingId ? { ...d, width: w } : d))
                                );
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                              (selectedDrawing?.width || drawingWidth) === w
                                ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                                : 'bg-[#161b26] text-slate-400 border-[#262c3d] hover:text-white'
                            }`}
                          >
                            {w}px
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        {(['solid', 'dashed', 'dotted'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            data-testid={`drawer-style-${st}`}
                            onClick={() => {
                              setDrawingLineStyle(st);
                              if (selectedDrawingId) {
                                setDrawings((prev) =>
                                  prev.map((d) =>
                                    d.id === selectedDrawingId ? { ...d, lineStyle: st } : d
                                  )
                                );
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border cursor-pointer ${
                              (selectedDrawing?.lineStyle || drawingLineStyle) === st
                                ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                                : 'bg-[#161b26] text-slate-400 border-[#262c3d] hover:text-white'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Scrollable List of All 11 Technical Analysis Drawing Tools */}
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                    {QUOTEX_DRAWING_TOOLS.map((tool) => {
                      const isArmed = activeDrawingTool === tool.id;
                      const countOfType = drawings.filter((d) => d.type === tool.id).length;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          data-testid={`drawing-tool-${tool.id}`}
                          onClick={() => handleSelectDrawingTool(tool.id)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                            isArmed
                              ? 'bg-[#ff8800] text-slate-950 border-[#ff8800] font-black'
                              : 'bg-[#141822] hover:bg-[#1c2230] text-slate-200 border-[#242a38]'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs">{tool.label}</span>
                              {countOfType > 0 && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                                    isArmed
                                      ? 'bg-slate-950 text-[#ff8800]'
                                      : 'bg-[#ff8800]/20 text-[#ff8800]'
                                  }`}
                                >
                                  {countOfType} on chart
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-[10px] truncate mt-0.5 ${
                                isArmed ? 'text-slate-900 font-semibold' : 'text-slate-400'
                              }`}
                            >
                              {tool.description}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-1 rounded text-[9px] font-black uppercase shrink-0 ${
                              isArmed
                                ? 'bg-slate-950 text-[#ff8800]'
                                : 'bg-[#1c2232] text-[#ff8800] border border-[#ff8800]/30'
                            }`}
                          >
                            {isArmed ? 'ARMED' : 'DRAW'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Drawn Objects List & Footer Clear Controls */}
                  <div className="p-3 border-t border-[#222735] bg-[#121620] space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Drawn on {selectedAsset.symbol}: {drawings.length}</span>
                      {selectedDrawing && (
                        <span className="text-[#ff8800] font-bold">
                          Selected: {QUOTEX_DRAWING_TOOLS.find((t) => t.id === selectedDrawing.type)?.label || selectedDrawing.type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedDrawing && (
                        <button
                          type="button"
                          data-testid="drawer-delete-selected-btn"
                          onClick={() => {
                            soundEngine.playUiClick();
                            setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawing.id));
                            setSelectedDrawingId(null);
                          }}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Selected</span>
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="clear-all-drawings-btn"
                        disabled={drawings.length === 0}
                        onClick={() => {
                          soundEngine.playUiClick();
                          setDrawings([]);
                          setSelectedDrawingId(null);
                          setCurrentDrawing(null);
                        }}
                        className={`flex-1 py-1.5 px-2.5 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1 ${
                          drawings.length > 0
                            ? 'bg-[#1a202e] hover:bg-rose-950/60 border-[#2e364a] text-slate-200 hover:text-rose-300 cursor-pointer'
                            : 'bg-[#131722] border-[#1f2433] text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear All ({drawings.length})</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* INDICATORS TAB CONTENT INSIDE PENCIL SIDE-DRAWER */
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  <div className="text-[10px] text-slate-400 px-1">
                    Technical indicators are saved independently for <strong className="text-white">{selectedAsset.symbol}</strong>.
                  </div>

                  {[
                    {
                      key: 'showSma' as const,
                      label: `Simple Moving Average (SMA ${indicators.smaPeriod})`,
                      desc: 'Smooth trend direction overlay',
                      active: indicators.showSma,
                    },
                    {
                      key: 'showEma' as const,
                      label: `Exponential Moving Average (EMA ${indicators.emaPeriod})`,
                      desc: 'Fast-reacting momentum average',
                      active: indicators.showEma,
                    },
                    {
                      key: 'showBollinger' as const,
                      label: `Bollinger Bands (${indicators.bollingerPeriod}, ${indicators.bollingerStd}σ)`,
                      desc: 'Volatility channel & breakout bands',
                      active: indicators.showBollinger,
                    },
                    {
                      key: 'showRsi' as const,
                      label: `Relative Strength Index (RSI ${indicators.rsiPeriod})`,
                      desc: 'Overbought (70) & Oversold (30) oscillator',
                      active: indicators.showRsi,
                    },
                    {
                      key: 'showMacd' as const,
                      label: `MACD (${indicators.macdFast}, ${indicators.macdSlow}, ${indicators.macdSignal})`,
                      desc: 'Momentum histogram & signal crossover',
                      active: indicators.showMacd,
                    },
                    {
                      key: 'showFib' as const,
                      label: 'Fibonacci Retracement Levels',
                      desc: 'Auto 23.6%, 38.2%, 50%, 61.8% levels',
                      active: indicators.showFib,
                    },
                  ].map((ind) => (
                    <button
                      key={ind.key}
                      type="button"
                      data-testid={`drawer-indicator-${ind.key}`}
                      onClick={() => {
                        soundEngine.playUiClick();
                        setIndicators((prev) => ({ ...prev, [ind.key]: !prev[ind.key] }));
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        ind.active
                          ? 'bg-[#ff8800]/15 border-[#ff8800] text-white'
                          : 'bg-[#141822] hover:bg-[#1c2230] border-[#242a38] text-slate-300'
                      }`}
                    >
                      <div className="pr-2">
                        <div className="font-bold text-xs text-white">{ind.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{ind.desc}</div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-[9px] font-black uppercase shrink-0 ${
                          ind.active
                            ? 'bg-[#ff8800] text-slate-950'
                            : 'bg-[#1c2232] text-slate-400 border border-[#2a3042]'
                        }`}
                      >
                        {ind.active ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  ))}

                  <button
                    type="button"
                    data-testid="drawer-open-indicator-params-btn"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setIsIndicatorModalOpen(true);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#181d2a] hover:bg-[#22293a] border border-[#2e364a] text-[#ff8800] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Configure Indicator Periods</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* FLOATING ON-CHART DRAWING OBJECT CUSTOMIZATION & MOVE/DELETE BAR */}
          {selectedDrawing && (
            <div
              data-testid="drawing-customization-toolbar"
              className="absolute top-14 right-20 z-30 px-3 py-2 rounded-xl bg-[#121620]/95 border border-[#ff8800]/60 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-200 select-none"
            >
              <span className="text-[10px] font-black uppercase text-[#ff8800]">
                {QUOTEX_DRAWING_TOOLS.find((t) => t.id === selectedDrawing.type)?.label ||
                  selectedDrawing.type}
              </span>

              {/* Quick Color Swatches */}
              <div className="flex items-center gap-1 pl-1.5 border-l border-[#262c3d]">
                {DRAWING_COLOR_PALETTE.slice(0, 5).map((c) => (
                  <button
                    key={c}
                    type="button"
                    data-testid={`customize-drawing-color-${c.replace('#', '')}`}
                    onClick={() =>
                      setDrawings((prev) =>
                        prev.map((d) => (d.id === selectedDrawing.id ? { ...d, color: c } : d))
                      )
                    }
                    className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${
                      selectedDrawing.color === c ? 'scale-125 border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              {/* Nudge / Move Controls */}
              <div className="flex items-center gap-1 pl-1.5 border-l border-[#262c3d]">
                <button
                  type="button"
                  data-testid="move-drawing-up-btn"
                  onClick={() =>
                    setDrawings((prev) =>
                      prev.map((d) =>
                        d.id === selectedDrawing.id ? translateDrawing(d, 0, -12) : d
                      )
                    )
                  }
                  className="px-1.5 py-0.5 rounded bg-[#1b2130] hover:bg-[#262e42] text-[10px] font-bold text-slate-200 cursor-pointer"
                  title="Move Drawing Up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  data-testid="move-drawing-down-btn"
                  onClick={() =>
                    setDrawings((prev) =>
                      prev.map((d) =>
                        d.id === selectedDrawing.id ? translateDrawing(d, 0, 12) : d
                      )
                    )
                  }
                  className="px-1.5 py-0.5 rounded bg-[#1b2130] hover:bg-[#262e42] text-[10px] font-bold text-slate-200 cursor-pointer"
                  title="Move Drawing Down"
                >
                  ↓
                </button>
              </div>

              {/* Re-Arm Same Tool for Continuous Drawing */}
              <button
                type="button"
                data-testid="rearm-drawing-tool-btn"
                onClick={() => handleSelectDrawingTool(selectedDrawing.type)}
                className="px-2 py-0.5 rounded bg-[#ff8800] text-slate-950 font-black text-[10px] flex items-center gap-1 cursor-pointer"
                title="Arm tool to draw another instance"
              >
                <Copy className="w-3 h-3" />
                <span>Draw Again</span>
              </button>

              {/* Delete Selected Drawing */}
              <button
                type="button"
                data-testid="delete-selected-drawing-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawing.id));
                  setSelectedDrawingId(null);
                }}
                className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-400 hover:text-rose-200 border border-rose-500/40 cursor-pointer"
                title="Delete Selected Drawing"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* MOBILE UPPER-LEFT QUICK ACTION FLOATING BUTTONS (Tools, Indicators, Timeframe, History) */}
          <div className="flex md:hidden absolute top-2.5 left-2.5 z-20 items-center gap-1.5 font-mono text-xs select-none">
            <button
              type="button"
              data-testid="mobile-chart-tools-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setIsDrawingDrawerOpen((prev) => !prev);
              }}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                isDrawingDrawerOpen || activeDrawingTool !== 'none'
                  ? 'bg-[#ff8800] border-[#ff8800] text-slate-950'
                  : 'bg-[#141722]/95 border-white/10 text-slate-200'
              }`}
              title="Drawing Tools Side-Drawer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              data-testid="mobile-chart-indicators-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setIsIndicatorModalOpen(true);
              }}
              className="w-8 h-8 rounded-lg bg-[#141722]/95 border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
              title="Technical Indicators"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              data-testid="mobile-chart-timeframe-cycle-btn"
              onClick={() => {
                soundEngine.playUiClick();
                const order: Timeframe[] = ['5s', '15s', '30s', '1m', '5m', '15m'];
                const next = order[(order.indexOf(timeframe) + 1) % order.length] || '1m';
                setTimeframe(next);
              }}
              className="h-8 px-2.5 rounded-lg bg-[#141722]/95 border border-[#ff8800]/50 text-[#ff8800] font-black text-[11px] flex items-center gap-1 cursor-pointer"
              title="Cycle Chart Timeframe"
            >
              <span>{timeframe}</span>
            </button>
          </div>

          {/* LIVE CANDLE EXPIRY COUNTDOWN TIMER BADGE (Visible on Mobile & Desktop Chart Grid) */}
          <div
            data-testid="candle-expiry-timer"
            className="absolute top-2.5 right-18 z-20 px-2.5 py-1 rounded-lg bg-[#141722]/95 border border-[#ff8800]/60 flex items-center gap-1.5 font-mono text-[11px] pointer-events-none select-none"
            title="Remaining time until current candle closes"
          >
            <Clock className="w-3 h-3 text-[#ff8800] shrink-0" />
            <span className="text-[9px] uppercase font-bold text-slate-400 hidden sm:inline">
              Candle Close:
            </span>
            <span
              data-testid="candle-expiry-timer-value"
              className="font-black text-[#ff8800] tracking-wider"
            >
              {candleCountdown.formatted}
            </span>
          </div>

          {/* Top indicator & drawing toolbar removed from chart canvas; all drawings & indicators live inside the Pencil Side-Drawer */}

          {/* Risk Barricade Warning (80% threshold) */}
          {riskBarricade.barricaded && !isBreached && (
            <div className="px-4 py-1.5 bg-amber-950/90 border-b border-amber-500/60 flex items-center justify-between text-xs font-mono text-amber-300 z-20">
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <strong>Live Risk Barricade Active</strong>: Account loss is at 80% threshold. Orders locked to protect evaluation.
              </span>
            </div>
          )}

          {/* TradingView Live OHLCV Hover Inspector Bar */}
          {(() => {
            const inspectedCandle =
              hoveredCandle || (candles.length > 0 ? candles[candles.length - 1] : null);
            if (!inspectedCandle) return null;
            const isBull = inspectedCandle.close >= inspectedCandle.open;
            const changeAbs = inspectedCandle.close - inspectedCandle.open;
            const changePct =
              inspectedCandle.open !== 0
                ? (changeAbs / inspectedCandle.open) * 100
                : 0;
            return (
              <div
                data-testid="chart-ohlc-bar"
                className="absolute top-12 left-2.5 md:top-14 md:left-3 z-15 px-2.5 py-1 rounded-lg bg-[#141722]/90 backdrop-blur-md border border-white/10 flex flex-wrap items-center gap-2 md:gap-3 font-mono text-[10px] md:text-[11px] pointer-events-none select-none"
              >
                <span className="font-black text-white flex items-center gap-1">
                  <span>{selectedAsset.symbol}</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#ff8800]/20 text-[#ff8800] font-bold">
                    {timeframe}
                  </span>
                </span>
                <span className="text-slate-400">
                  O{' '}
                  <strong className={isBull ? 'text-[#00e676]' : 'text-[#ff334b]'}>
                    {inspectedCandle.open.toFixed(selectedAsset.pipDecimals)}
                  </strong>
                </span>
                <span className="text-slate-400">
                  H{' '}
                  <strong className={isBull ? 'text-[#00e676]' : 'text-[#ff334b]'}>
                    {inspectedCandle.high.toFixed(selectedAsset.pipDecimals)}
                  </strong>
                </span>
                <span className="text-slate-400">
                  L{' '}
                  <strong className={isBull ? 'text-[#00e676]' : 'text-[#ff334b]'}>
                    {inspectedCandle.low.toFixed(selectedAsset.pipDecimals)}
                  </strong>
                </span>
                <span className="text-slate-400">
                  C{' '}
                  <strong className={isBull ? 'text-[#00e676]' : 'text-[#ff334b]'}>
                    {inspectedCandle.close.toFixed(selectedAsset.pipDecimals)}
                  </strong>
                </span>
                <span
                  className={`font-bold hidden sm:inline ${
                    isBull ? 'text-[#00e676]' : 'text-[#ff334b]'
                  }`}
                >
                  {changeAbs >= 0 ? '+' : ''}
                  {changeAbs.toFixed(selectedAsset.pipDecimals)} ({changePct >= 0 ? '+' : ''}
                  {changePct.toFixed(2)}%)
                </span>
              </div>
            );
          })()}

          {/* Official TradingView Lightweight Charts Area with Live Trade Overlays */}
          <div
            ref={chartContainerRef}
            data-testid="otc-chart-container"
            className="flex-1 relative w-full h-full min-h-0 select-none overflow-hidden"
          >
            <LightweightTradingChart
              asset={selectedAsset}
              candles={candles}
              currentPrice={currentPrice}
              timeframe={timeframe}
              chartType={chartType}
              activeTrades={activeTrades}
              indicators={indicators}
              zoomLevel={zoomLevel}
              onHoverCandle={setHoveredCandle}
            />
            {/* Quotex-style sleek floating notification pill when trade is opened */}
            {tradeSuccess && (
              <div
                data-testid="chart-trade-opened-toast"
                className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 max-w-[calc(100%-70px)] sm:max-w-md z-30 flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#00c26f] text-slate-950 font-sans text-[11px] sm:text-xs font-semibold shadow-xl border border-[#00e676]/40 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-slate-950" />
                <span className="truncate">{tradeSuccess}</span>
                <button
                  type="button"
                  onClick={() => setTradeSuccess(null)}
                  className="ml-1 sm:ml-1.5 p-0.5 rounded hover:bg-black/15 text-slate-950/70 hover:text-slate-950 cursor-pointer transition-colors shrink-0"
                  aria-label="Close notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Mobile Floating Action Button: Reset Pan / Center Chart */}
            <button
              type="button"
              data-testid="mobile-center-chart-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setPanOffset(0);
              }}
              className="md:hidden absolute bottom-2.5 right-18 z-20 w-8 h-8 rounded-lg bg-[#141722]/95 border border-white/10 flex items-center justify-center text-[#ff8800] active:scale-95 cursor-pointer"
              title="Center Chart to Latest Price"
            >
              <Target className="w-4 h-4" />
            </button>

            {/* Interactive Chart Trade History Marker Tooltip (Hover / Click on Green/Red Execution & Settlement Dots) */}
            {showHistoryOverlay && activeInspectedMarker && (
              <div
                data-testid="chart-trade-history-tooltip"
                style={{
                  left: `${Math.max(16, Math.min(520, activeInspectedMarker.x - 130))}px`,
                  top: `${Math.max(58, Math.min(340, activeInspectedMarker.y + 16))}px`,
                }}
                className="absolute z-30 w-72 rounded-xl bg-[#141824]/95 border border-[#2a2e39] shadow-2xl p-3 font-mono text-xs text-slate-200 backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#2a2e39]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        activeInspectedMarker.isWin ? 'bg-[#00e676]' : 'bg-[#ff334b]'
                      }`}
                    />
                    <span
                      data-testid="tooltip-point-type"
                      className="text-[10px] font-black uppercase tracking-wider text-white"
                    >
                      {activeInspectedMarker.pointType === 'execution'
                        ? 'Execution Dot'
                        : 'Settlement Dot'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                        activeInspectedMarker.isWin
                          ? 'bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/40'
                          : 'bg-[#ff334b]/20 text-[#ff334b] border border-[#ff334b]/40'
                      }`}
                    >
                      {activeInspectedMarker.isWin ? 'WON' : 'LOST'}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Close trade marker tooltip"
                    onClick={() => {
                      setHoveredTradeMarker(null);
                      setSelectedTradeMarker(null);
                    }}
                    className="p-0.5 rounded hover:bg-[#252b3d] text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] mb-2">
                  <span className="font-bold text-white">{activeInspectedMarker.asset}</span>
                  <span
                    className={`font-black ${
                      activeInspectedMarker.direction === 'CALL'
                        ? 'text-[#00e676]'
                        : 'text-[#ff334b]'
                    }`}
                  >
                    {activeInspectedMarker.direction === 'CALL' ? '▲ BUY (CALL)' : '▼ SELL (PUT)'} • $
                    {activeInspectedMarker.investment.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-1.5 bg-[#0f131d] rounded-lg p-2 border border-[#222634] text-[10px]">
                  <div
                    className={`flex items-center justify-between p-1 rounded ${
                      activeInspectedMarker.pointType === 'execution'
                        ? 'bg-[#1e2538] border border-slate-600/50 text-white font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    <span>● Executed ({new Date(activeInspectedMarker.startTime).toLocaleTimeString()}):</span>
                    <span className="font-bold text-slate-200">
                      {activeInspectedMarker.strikePrice.toFixed(selectedAsset.pipDecimals)}
                    </span>
                  </div>
                  <div
                    className={`flex items-center justify-between p-1 rounded ${
                      activeInspectedMarker.pointType === 'settlement'
                        ? 'bg-[#1e2538] border border-slate-600/50 text-white font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    <span>◉ Settled ({new Date(activeInspectedMarker.endTime).toLocaleTimeString()}):</span>
                    <span className="font-bold text-slate-200">
                      {activeInspectedMarker.closePrice.toFixed(selectedAsset.pipDecimals)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[#2a2e39]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="switch-marker-point-btn"
                      onClick={() => {
                        const targetType =
                          activeInspectedMarker.pointType === 'execution'
                            ? 'settlement'
                            : 'execution';
                        const partner = tradeMarkersRef.current.find(
                          (m) =>
                            m.tradeId === activeInspectedMarker.tradeId &&
                            m.pointType === targetType
                        );
                        if (partner) {
                          setSelectedTradeMarker(partner);
                        }
                      }}
                      className="px-2 py-0.5 rounded bg-[#1e2538] hover:bg-[#283149] text-[9px] font-bold text-cyan-300 border border-cyan-500/30 cursor-pointer"
                    >
                      View {activeInspectedMarker.pointType === 'execution' ? 'Settlement' : 'Execution'} Dot
                    </button>
                  </div>
                  <div
                    data-testid="tooltip-net-pnl"
                    className={`text-xs font-black ${
                      activeInspectedMarker.isWin ? 'text-[#00e676]' : 'text-[#ff334b]'
                    }`}
                  >
                    {formatInlineTradeResultBadge(
                      activeInspectedMarker.isWin,
                      activeInspectedMarker.pnl,
                      activeInspectedMarker.investment
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Snap back to Live button when panned backwards */}
            {panOffset > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  soundEngine.playUiClick();
                  setPanOffset(0);
                }}
                className="absolute top-16 right-20 z-20 px-3 py-1.5 rounded-xl bg-cyan-400 text-slate-950 font-black text-xs font-mono flex items-center gap-1.5 shadow-xl hover:bg-cyan-300 cursor-pointer transition-all animate-bounce"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[3]" />
                <span>Snap to Live Chart</span>
              </button>
            )}

            {/* Bottom-Left Chart Controls (Pencil Drawing Drawer, Timeframe, Chart Type, Zoom) */}
            <div className="absolute bottom-2.5 left-2.5 md:bottom-4 md:left-4 z-10 flex items-center gap-1.5 md:gap-2 bg-[#141722]/90 backdrop-blur-md border border-white/10 rounded-xl p-1 md:p-1.5 font-mono text-xs">
              {/* Dedicated Pencil Icon Tool Drawer Button on Chart Toolbar */}
              <button
                type="button"
                data-testid="chart-toolbar-pencil-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  setIsDrawingDrawerOpen((prev) => !prev);
                }}
                className={`p-1.5 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                  isDrawingDrawerOpen || activeDrawingTool !== 'none'
                    ? 'bg-[#ff8800] border-[#ff8800] text-slate-950 font-black'
                    : 'bg-[#0a0a0a] border-white/10 text-slate-300 hover:text-[#ff8800]'
                }`}
                title="Open Technical Analysis Drawing Tools Side-Drawer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Chart Type Selector (Desktop) */}
              <div className="hidden md:flex bg-[#0a0a0a] rounded-lg p-0.5 border border-white/10">
                {(['candles', 'heikin-ashi', 'line', 'bars'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      soundEngine.playUiClick();
                      setChartType(type);
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      chartType === type
                        ? 'bg-[#ff8800] text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {type === 'heikin-ashi' ? 'H-Ashi' : type}
                  </button>
                ))}
              </div>

              {/* Timeframe Selector (TradingView 1m, 5m, 15m, 1h, 1D + Fast OTC Tick Timeframes) */}
              <div className="flex bg-[#0a0a0a] rounded-lg p-0.5 border border-white/10">
                {(
                  [
                    { tf: '5s' as const, key: '1', mobileVisible: true },
                    { tf: '15s' as const, key: '2', mobileVisible: true },
                    { tf: '30s' as const, key: '3', mobileVisible: false },
                    { tf: '1m' as const, key: '4', mobileVisible: true },
                    { tf: '5m' as const, key: '5', mobileVisible: true },
                    { tf: '15m' as const, key: '6', mobileVisible: false },
                    { tf: '1h' as const, key: '7', mobileVisible: false },
                    { tf: '1D' as const, key: '8', mobileVisible: false },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.tf}
                    type="button"
                    data-testid={`timeframe-${item.tf}`}
                    onClick={() => {
                      soundEngine.playUiClick();
                      setTimeframe(item.tf);
                    }}
                    className={`${
                      item.mobileVisible ? 'flex' : 'hidden sm:flex'
                    } px-1.5 md:px-2 py-1 rounded text-[10px] font-bold transition-all items-center gap-1 cursor-pointer ${
                      timeframe === item.tf
                        ? 'bg-[#ff8800] text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={`Switch timeframe (${item.tf})`}
                  >
                    <span>{item.tf}</span>
                  </button>
                ))}
              </div>

              {/* Zoom Controls (Smooth Touch-Friendly Zoom In / Zoom Out) */}
              <div className="flex items-center gap-1 pl-1 border-l border-white/10">
                <button
                  type="button"
                  data-testid="chart-zoom-in-btn"
                  onClick={() =>
                    setZoomLevel((z) => Number(Math.min(3.5, z + 0.2).toFixed(2)))
                  }
                  className="p-1.5 rounded bg-[#0a0a0a] hover:bg-[#1e222d] text-slate-300 hover:text-white cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid="chart-zoom-out-btn"
                  onClick={() =>
                    setZoomLevel((z) => Number(Math.max(0.35, z - 0.2).toFixed(2)))
                  }
                  className="p-1.5 rounded bg-[#0a0a0a] hover:bg-[#1e222d] text-slate-300 hover:text-white cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* PRECISE INLINE TRADE WIN/LOSS RESULT BADGE ANCHORED AT EXACT CHART COORDINATE (NO FULL-SCREEN OVERLAY) */}
            {tradeResultOverlay &&
              (() => {
                const canvasW = canvasRef.current?.width || canvasSize.width || 800;
                const canvasH = canvasRef.current?.height || canvasSize.height || 440;
                const subPaneH = (indicators.showRsi ? 60 : 0) + (indicators.showMacd ? 70 : 0);
                const chartH = Math.max(180, canvasH - subPaneH - 25);

                const maxVis = Math.max(18, Math.floor((canvasW - 75) / (11 * zoomLevel)));
                const endIdx = Math.max(maxVis, candles.length - panOffset);
                const startIdx = Math.max(0, endIdx - maxVis);
                const visSlice = candles.slice(startIdx, endIdx);
                const priceList = visSlice.map((c) => [c.high, c.low]).flat();
                priceList.push(tradeResultOverlay.closePrice, tradeResultOverlay.strikePrice);
                let minP = Math.min(...priceList);
                let maxP = Math.max(...priceList);
                const pad = (maxP - minP) * 0.14 || 0.0005;
                minP -= pad;
                maxP += pad;

                const coordX =
                  timestampToCanvasX(
                    tradeResultOverlay.endTime,
                    visSlice,
                    TIMEFRAME_SECONDS[timeframe],
                    canvasW
                  ) ?? canvasW - 140;
                const coordY = priceToCanvasY(tradeResultOverlay.closePrice, minP, maxP, chartH);

                const inlineBox = computeInlineTradeResultBadgeBox({
                  anchorX: coordX,
                  anchorY: coordY,
                  canvasWidth: canvasW,
                  chartHeight: chartH,
                  isWin: tradeResultOverlay.isWin,
                  profitOrPnl: tradeResultOverlay.profitAmount,
                  investment: tradeResultOverlay.investment,
                  direction: tradeResultOverlay.direction,
                });

                return (
                  <div
                    data-testid="trade-result-chart-overlay"
                    style={{
                      left: `${inlineBox.boxX}px`,
                      top: `${inlineBox.boxY}px`,
                    }}
                    className="absolute z-25 pointer-events-none select-none"
                  >
                    <div
                      data-testid="inline-trade-result-badge"
                      className={`px-2.5 py-1 rounded-md font-mono text-xs font-black flex items-center gap-1.5 border ${
                        tradeResultOverlay.isWin
                          ? 'bg-[#00e676] border-[#00e676] text-[#05140b]'
                          : 'bg-[#1c1015]/95 border-[#ff334b] text-[#ff4d63]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          tradeResultOverlay.isWin ? 'bg-[#05140b]' : 'bg-[#ff334b]'
                        }`}
                      />
                      <span>{inlineBox.label}</span>
                    </div>
                  </div>
                );
              })()}

            {/* BREACH OVERLAY */}
            {isSoftBreached ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-in fade-in duration-200">
                <div className="max-w-md w-full rounded-3xl bg-[#1e222d]/95 border-2 border-amber-500/80 p-8 shadow-[0_0_80px_rgba(245,158,11,0.35)] text-center font-mono">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center mx-auto mb-4 text-amber-400">
                    <Clock className="w-8 h-8 animate-pulse" />
                  </div>
                  <span className="px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase tracking-wider">
                    Soft Breach: Daily Drawdown Paused
                  </span>
                  <h3 className="text-xl font-black text-white font-sans mt-3">
                    Trading Paused Until Daily Reset
                  </h3>
                  <p className="text-xs text-slate-300 mt-2 font-sans leading-relaxed">
                    Your account ({account?.id}) reached the daily loss limit ({account?.dailyLossLimitPercent}%). To preserve your challenge, trading is temporarily locked until the next daily trading cycle begins.
                  </p>

                  {/* Live Countdown Timer */}
                  <div className="my-5 p-3.5 rounded-2xl bg-[#131722] border border-amber-500/40">
                    <div className="text-[10px] text-slate-400 uppercase font-mono mb-1">
                      Next Trading Day Auto-Reset In:
                    </div>
                    <div className="text-2xl font-black text-amber-400 font-mono tracking-widest">
                      {Math.floor(softResetSecondsRemaining / 3600).toString().padStart(2, '0')}:
                      {Math.floor((softResetSecondsRemaining % 3600) / 60).toString().padStart(2, '0')}:
                      {(softResetSecondsRemaining % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Account will automatically unlock and daily drawdown resets to 0.0%
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleResetSoftBreach}
                      className="w-full py-3.5 px-6 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 cursor-pointer uppercase font-sans tracking-wide transition-all"
                    >
                      <Zap className="w-4 h-4 fill-slate-950" />
                      <span>Simulate Daily Reset & Resume Trading</span>
                    </button>

                    {otherActiveAccounts.length > 0 && (
                      <div className="pt-2">
                        <div className="text-[10px] text-slate-400 mb-2 uppercase">
                          Or switch to another active account:
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {otherActiveAccounts.map((act) => (
                            <button
                              key={act.id}
                              onClick={() => onSelectAccount?.(act.id)}
                              className="px-3 py-1.5 rounded-xl bg-[#131722] hover:bg-[#252b3b] border border-[#00e676]/40 text-[#00e676] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <span className="w-2 h-2 rounded-full bg-[#00e676]" />
                              <span>{act.id} (${(act?.currentBalance ?? 0).toLocaleString()})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : isHardBreached ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-in fade-in duration-200">
                <div className="max-w-md w-full rounded-3xl bg-[#1e222d]/95 border-2 border-rose-500/80 p-8 shadow-[0_0_80px_rgba(244,63,94,0.35)] text-center font-mono">
                  <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center mx-auto mb-4 text-rose-400">
                    <Lock className="w-8 h-8 animate-pulse" />
                  </div>
                  <span className="px-3 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black uppercase tracking-wider">
                    Permanent Hard Breach: Rule Violation
                  </span>
                  <h3 className="text-xl font-black text-white font-sans mt-3">
                    Chart & Trading Permanently Locked
                  </h3>
                  <p className="text-xs text-slate-300 mt-2 font-sans leading-relaxed">
                    {account
                      ? `Your account (${account.id}) has breached maximum overall loss or risk rules. Under strict institutional compliance, accounts cannot be reset or retried.`
                      : 'You do not currently hold an active funded trading account.'}
                  </p>

                  {/* Reset Account Courtesy discount banner */}
                  <div className="my-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-left text-xs">
                    <div className="flex items-center gap-2 text-amber-300 font-bold mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>10% Reset Courtesy Discount Applied</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Get 10% off your replacement evaluation account with instant TRC-20 activation.
                    </p>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    <button
                      onClick={() => onOpenChallengeModal?.()}
                      className="w-full py-4 px-6 rounded-2xl bg-[#00e676] hover:bg-[#00c853] text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 cursor-pointer uppercase font-sans tracking-wide transition-all"
                    >
                      <Lock className="w-4 h-4 fill-slate-950" />
                      <span>Buy New Account (10% Courtesy Applied)</span>
                    </button>

                    <button
                      onClick={() => setIsBreachModalOpen(true)}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#131722] hover:bg-[#252b3b] text-slate-300 hover:text-white border border-[#2a2e39] text-xs font-bold transition-all cursor-pointer"
                    >
                      Review Breach Audit Log
                    </button>

                    {otherActiveAccounts.length > 0 && (
                      <div className="pt-2">
                        <div className="text-[10px] text-slate-400 mb-2 uppercase">
                          Or switch to another active account:
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {otherActiveAccounts.map((act) => (
                            <button
                              key={act.id}
                              onClick={() => onSelectAccount?.(act.id)}
                              className="px-3 py-1.5 rounded-xl bg-[#131722] hover:bg-[#252b3b] border border-[#00e676]/40 text-[#00e676] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <span className="w-2 h-2 rounded-full bg-[#00e676]" />
                              <span>{act.id} (${(act?.currentBalance ?? 0).toLocaleString()})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Bottom Collapsible Trades & History Drawer (Slide-Up Sheet on Mobile with Backdrop Overlay) */}
          {isTradesDrawerOpen && (
            <div
              data-testid="mobile-trades-history-panel-wrapper"
              className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none flex flex-col justify-end"
              onClick={() => setIsTradesDrawerOpen(false)}
            >
              <div
                className="w-full max-h-[75vh] md:max-h-60 border-t border-white/15 bg-[#0e1016] rounded-t-2xl md:rounded-none shrink-0 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Grab handle indicator for mobile sheet */}
                <div className="w-12 h-1 bg-white/20 rounded-full mx-auto my-2 md:hidden" />
                <TradingDrawer
                  account={{ ...effectiveAccount, equity: liveEquity }}
                  trades={trades}
                  currentPrice={currentPrice}
                  onDoubleUp={handleDoubleUp}
                  initialTab={mobileTradesTab === 'history' ? 'history' : 'open'}
                  onTabChange={(tab) => {
                    if (tab === 'open') setMobileTradesTab('trades');
                    else if (tab === 'history') setMobileTradesTab('history');
                  }}
                  onClose={() => setIsTradesDrawerOpen(false)}
                />
              </div>
            </div>
          )}

        </div>

        {/* Mobile Quotex Bottom Trade Execution Dock */}
        <QuotexMobileDock
          selectedAsset={selectedAsset}
          currentPrice={currentPrice}
          effectiveInvestment={effectiveInvestment}
          duration={duration}
          investment={investment}
          investmentMode={investmentMode}
          pendingOrderEnabled={pendingOrderEnabled}
          isSoftBreached={isSoftBreached}
          isHardBreached={isHardBreached}
          riskBarricaded={riskBarricade.barricaded}
          activeTradesCount={activeTrades.length}
          closedTradesCount={closedTrades.length}
          dailyDrawdownPercent={metrics.dailyDrawdownPercent}
          isTradesDrawerOpen={isTradesDrawerOpen}
          activeTradesTab={mobileTradesTab}
          onSelectTradesTab={(tab) => {
            const next = resolveMobileTradesDrawerAction(isTradesDrawerOpen, mobileTradesTab, tab);
            setIsTradesDrawerOpen(next.isOpen);
            setMobileTradesTab(next.activeTab);
          }}
          onOpenAssetModal={() => setIsAssetModalOpen(true)}
          onTogglePendingTrade={() => setPendingOrderEnabled(!pendingOrderEnabled)}
          onChangeDuration={(d) => setDuration(d)}
          onChangeInvestment={(inv) => setInvestment(inv)}
          onToggleInvestmentMode={() => setInvestmentMode(investmentMode === 'usd' ? 'percent' : 'usd')}
          onTriggerTrade={(dir) => handleTriggerTrade(dir)}
          onToggleTradesDrawer={() => {
            const next = resolveMobileTradesDrawerAction(isTradesDrawerOpen, mobileTradesTab, 'toggle');
            setIsTradesDrawerOpen(next.isOpen);
            setMobileTradesTab(next.activeTab);
          }}
        />
        {/* 4. RIGHT-SIDE QUOTEX TRADE EXECUTION & ACTIVE POSITIONS / HISTORY PANEL */}
        <div
          data-testid="quotex-right-panel"
          className="hidden md:flex w-72 sm:w-[280px] bg-[#1c202e] border-l border-[#2a2e39] flex flex-col justify-between p-2.5 shrink-0 z-10 overflow-y-auto"
        >
          <div className="space-y-2">
            {/* Top Row: Selected Asset | Payout % + PENDING TRADE Toggle Switch */}
            <div className="p-2 rounded-lg bg-[#141722] border border-[#2a2e39] space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  data-testid="open-asset-modal-btn"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setIsAssetModalOpen(true);
                  }}
                  className="flex items-center gap-1 text-left hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                >
                  <span className="text-xs shrink-0">{selectedAsset.flag || '📈'}</span>
                  <span className="font-black text-white text-[11px] font-mono whitespace-nowrap">
                    {selectedAsset.symbol}
                  </span>
                  <span className="text-[10px] font-mono font-black text-[#00e676] shrink-0 ml-0.5">
                    {selectedAsset.payout}%
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </button>

                {/* PENDING TRADE Toggle */}
                <button
                  type="button"
                  data-testid="pending-trade-toggle"
                  onClick={() => {
                    soundEngine.playUiClick();
                    if (!pendingOrderEnabled && !pendingTriggerPrice) {
                      setPendingTriggerPrice(currentPrice.toFixed(selectedAsset.pipDecimals));
                    }
                    setPendingOrderEnabled(!pendingOrderEnabled);
                  }}
                  className="flex items-center gap-1 shrink-0 cursor-pointer group"
                  title="Toggle Pending Trade Execution"
                >
                  <span className="text-[8.5px] font-black uppercase tracking-wider text-blue-400 group-hover:text-blue-300 font-mono">
                    PENDING TRADE
                  </span>
                  <div
                    className={`w-5.5 h-3 rounded-full p-0.5 transition-colors flex items-center ${
                      pendingOrderEnabled ? 'bg-blue-500 justify-end' : 'bg-[#2a2f42] justify-start'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                </button>
              </div>

              {pendingOrderEnabled && (
                <div className="pt-1.5 border-t border-[#2a2e39] flex items-center justify-between gap-2 font-mono text-[10px]">
                  <span className="text-slate-400">Trigger Price:</span>
                  <input
                    type="text"
                    value={pendingTriggerPrice}
                    onChange={(e) => setPendingTriggerPrice(e.target.value)}
                    className="w-24 px-1.5 py-0.5 rounded bg-[#1c202e] border border-blue-500/40 text-white text-right font-bold text-[11px] focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* TIME / EXPIRY CONTROL BOX (Slim Compact Quotex Reference) */}
            <div className="p-1.5 rounded-lg bg-[#141722] border border-[#2a2e39] font-mono">
              <div className="flex items-center justify-between mb-0.5 text-[9.5px]">
                <span className="text-slate-400 font-semibold">Duration / <span className="text-blue-400 font-bold">Time</span></span>
                <span className="text-[8.5px] text-amber-400/90 font-bold">Min 30s</span>
              </div>

              <div className="flex items-center justify-between bg-[#1c202e] border border-[#2a2e39] rounded-lg px-2 py-0.5 mb-1">
                <button
                  type="button"
                  onClick={() => handleStepDuration('down')}
                  className="w-5 h-5 rounded-md bg-[#262b3d] hover:bg-[#323950] text-slate-200 hover:text-white font-black text-xs flex items-center justify-center cursor-pointer transition-colors"
                  title="Decrease Expiry Time"
                >
                  -
                </button>
                <div
                  data-testid="quotex-time-display"
                  className="flex-1 text-center font-black text-white text-xs tracking-wider"
                >
                  {expiryMode === 'timer' ? formatTimerDisplay(duration) : getClockExpiry(duration)}
                </div>
                <button
                  type="button"
                  onClick={() => handleStepDuration('up')}
                  className="w-5 h-5 rounded-md bg-[#262b3d] hover:bg-[#323950] text-slate-200 hover:text-white font-black text-xs flex items-center justify-center cursor-pointer transition-colors"
                  title="Increase Expiry Time"
                >
                  +
                </button>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  data-testid="switch-time-btn"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setExpiryMode((prev) => (prev === 'timer' ? 'time' : 'timer'));
                  }}
                  className="text-[8.5px] font-black uppercase tracking-wider text-blue-400 hover:text-blue-300 cursor-pointer transition-colors"
                >
                  SWITCH TIME
                </button>

                <div className="flex items-center gap-0.5 text-[8.5px]">
                  {[
                    { label: '30s', val: 30 },
                    { label: '1m', val: 60 },
                    { label: '5m', val: 300 },
                    { label: '15m', val: 900 },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setDuration(p.val);
                      }}
                      className={`px-1 py-0.2 rounded font-bold cursor-pointer transition-colors ${
                        duration === p.val
                          ? 'bg-[#ff8800] text-slate-950 font-black'
                          : 'bg-[#1c202e] text-slate-400 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* INVESTMENT CONTROL BOX (Slim Compact Quotex Reference) */}
            <div className="p-1.5 rounded-lg bg-[#141722] border border-[#2a2e39] font-mono">
              <div className="flex items-center justify-between text-[9.5px] mb-0.5">
                <span className="text-slate-400 font-semibold">Amount / <span className="text-blue-400 font-bold">Percent</span></span>
                <span className="text-[8.5px] text-slate-400">
                  Max 5%: ${account ? ((account.initialBalance * 5) / 100).toFixed(0) : '500'}
                </span>
              </div>

              <div className="flex items-center justify-between bg-[#1c202e] border border-[#2a2e39] rounded-lg px-2 py-0.5 mb-1">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setInvestment((v) => Math.max(1, v - (v <= 10 ? 1 : 10)));
                  }}
                  className="w-5 h-5 rounded-md bg-[#262b3d] hover:bg-[#323950] text-slate-200 hover:text-white font-black text-xs flex items-center justify-center cursor-pointer transition-colors"
                  title="Decrease Investment"
                >
                  -
                </button>
                <div className="flex-1 flex items-center justify-center gap-1 font-black text-white text-xs">
                  <input
                    aria-label="Investment Amount"
                    type="number"
                    min={1}
                    value={investment}
                    onChange={(e) => setInvestment(Math.max(1, Number(e.target.value)))}
                    className="w-12 bg-transparent text-center focus:outline-none font-black text-white"
                  />
                  <span className="text-slate-300 text-xs font-black">
                    {investmentMode === 'usd' ? '$' : '%'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setInvestment((v) => v + (v < 10 ? 1 : 10));
                  }}
                  className="w-5 h-5 rounded-md bg-[#262b3d] hover:bg-[#323950] text-slate-200 hover:text-white font-black text-xs flex items-center justify-center cursor-pointer transition-colors"
                  title="Increase Investment"
                >
                  +
                </button>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  data-testid="switch-investment-btn"
                  onClick={() => {
                    soundEngine.playUiClick();
                    if (investmentMode === 'usd') {
                      setInvestmentMode('percent');
                      setInvestment(2);
                    } else {
                      setInvestmentMode('usd');
                      setInvestment(50);
                    }
                  }}
                  className="text-[8.5px] font-black uppercase tracking-wider text-blue-400 hover:text-blue-300 cursor-pointer transition-colors"
                >
                  SWITCH ({investmentMode === 'usd' ? '$ → %' : '% → $'})
                </button>

                <div className="flex items-center gap-0.5 text-[8.5px]">
                  {[2, 10, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setInvestmentMode('usd');
                        setInvestment(amt);
                      }}
                      className={`px-1 py-0.2 rounded font-bold cursor-pointer transition-colors ${
                        investmentMode === 'usd' && investment === amt
                          ? 'bg-[#ff8800] text-slate-950 font-black'
                          : 'bg-[#1c202e] text-slate-400 hover:text-white'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Notification messages */}
            {tradeError && (
              <div className="p-1.5 rounded-lg bg-rose-950/90 border border-rose-500/50 text-[10.5px] text-rose-200 flex items-start gap-1 font-mono">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span>{tradeError}</span>
              </div>
            )}
            {tradeSuccess && (
              <div className="p-1.5 rounded-lg bg-emerald-950/90 border border-[#00e676]/50 text-[10.5px] text-emerald-200 flex items-start gap-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00e676] shrink-0 mt-0.5" />
                <span>{tradeSuccess}</span>
              </div>
            )}

            {/* QUOTEX ACTION BUTTONS (Slim Streamlined "Buy" -> Live Payout -> Slim Streamlined "Sell") */}
            {hasNoAccount ? (
              <div className="p-2.5 rounded-lg bg-[#141722] border border-[#ff8800]/50 text-center space-y-1.5 font-mono">
                <Lock className="w-4 h-4 text-[#ff8800] mx-auto" />
                <div className="font-black text-white text-[10.5px] uppercase">Trading Panel Locked</div>
                <p className="text-[9.5px] text-slate-300 font-sans leading-tight">
                  Chart viewing unlocked. Choose a plan to trade.
                </p>
                <button
                  type="button"
                  data-testid="choose-plan-to-trade-btn"
                  onClick={() => onOpenChallengeModal?.()}
                  className="w-full py-2 rounded-md bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer transition-colors font-sans shadow-md"
                >
                  Choose a Plan to Trade
                </button>
              </div>
            ) : isSoftBreached ? (
              <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-500/60 text-center space-y-1.5 font-mono">
                <Clock className="w-4 h-4 text-amber-400 mx-auto animate-pulse" />
                <div className="font-black text-white text-[10.5px] uppercase">Daily Pause</div>
                <p className="text-[8.5px] text-amber-200">
                  Daily loss limit reached. Paused until next reset.
                </p>
                <button
                  onClick={handleResetSoftBreach}
                  className="w-full py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[10.5px] cursor-pointer uppercase font-sans"
                >
                  Simulate Daily Reset
                </button>
              </div>
            ) : isHardBreached ? (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/60 text-center space-y-1.5 font-mono">
                <AlertOctagon className="w-4 h-4 text-rose-400 mx-auto animate-pulse" />
                <div className="font-black text-white text-[10.5px] uppercase">Hard Breach</div>
                <button
                  onClick={() => setIsBreachModalOpen(true)}
                  className="w-full py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-black text-[10.5px] cursor-pointer uppercase"
                >
                  Review Audit Log
                </button>
                <button
                  onClick={() => onOpenChallengeModal?.()}
                  className="w-full py-2 rounded-md bg-[#00c853] hover:bg-[#00e676] text-slate-950 font-black text-[10.5px] cursor-pointer uppercase"
                >
                  Buy New Account (10% Off)
                </button>
              </div>
            ) : riskBarricade.barricaded ? (
              <div className="space-y-1 font-mono">
                <div className="p-1.5 rounded-lg bg-amber-950/50 border border-amber-500/50 text-[9.5px] text-amber-300 text-center">
                  ⚠️ <strong>Risk Barricade Active</strong>: Orders locked.
                </div>
                <button
                  disabled
                  className="w-full py-2 rounded-md bg-[#131722] text-slate-500 font-black text-xs cursor-not-allowed border border-[#2a2e39]"
                >
                  TRADING LOCKED
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 font-sans">
                {/* Slim Green "Buy" Button */}
                <button
                  type="button"
                  data-testid="quotex-buy-btn"
                  onClick={() => handleTriggerTrade('CALL')}
                  className="w-full py-1.5 px-3 rounded-md bg-[#00c853] hover:bg-[#00e676] active:scale-[0.99] text-white font-black text-sm flex items-center justify-between transition-all cursor-pointer shadow-sm"
                  title="Execute Buy / Higher Order (Shortcut: [B])"
                >
                  <span>Buy</span>
                  <span className="w-4.5 h-4.5 rounded-full bg-white/20 flex items-center justify-center">
                    <TrendingUp className="w-3 h-3 text-white stroke-[3]" />
                  </span>
                </button>

                {/* Live Payout Row Display (Exact Quotex Reference Dotted Line Layout) */}
                <div
                  data-testid="quotex-payout-display"
                  className="py-0.5 px-2 rounded bg-[#141722] border border-[#2a2e39] flex items-center justify-between text-[10px] font-mono"
                >
                  <span className="text-slate-400">Payout</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-black text-[11px]">
                      {(
                        effectiveInvestment +
                        (effectiveInvestment * selectedAsset.payout) / 100
                      ).toFixed(2)}{' '}
                      $
                    </span>
                    <span className="text-[9px] font-black text-[#00e676]">
                      (+${((effectiveInvestment * selectedAsset.payout) / 100).toFixed(2)})
                    </span>
                  </div>
                </div>

                {/* Slim Red "Sell" Button */}
                <button
                  type="button"
                  data-testid="quotex-sell-btn"
                  onClick={() => handleTriggerTrade('PUT')}
                  className="w-full py-1.5 px-3 rounded-md bg-[#ff334b] hover:bg-[#ff4d63] active:scale-[0.99] text-white font-black text-sm flex items-center justify-between transition-all cursor-pointer shadow-md shadow-rose-500/15"
                  title="Execute Sell / Lower Order (Shortcut: [S])"
                >
                  <span>Sell</span>
                  <span className="w-4.5 h-4.5 rounded-full bg-white/20 flex items-center justify-center">
                    <TrendingDown className="w-3 h-3 text-white stroke-[3]" />
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* BOTTOM SECTION OF RIGHT PANEL: ACTIVE TRADES & HISTORY TAB (Quotex Condensed List) */}
          <div className="mt-1.5 pt-1.5 border-t border-[#2a2e39] flex-1 flex flex-col min-h-[140px] font-mono">
            {/* Quotex Trades / History Tab Header */}
            <div className="flex items-center bg-[#141722] p-0.5 rounded-lg border border-[#2a2e39] mb-1 text-[10px]">
              <button
                type="button"
                data-testid="right-tab-trades"
                onClick={() => {
                  soundEngine.playUiClick();
                  setRightPanelTab('trades');
                }}
                className={`flex-1 py-1 px-1.5 rounded font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                  rightPanelTab === 'trades'
                    ? 'bg-[#252b3d] text-white font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Trades</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-black ${
                    activeTrades.length > 0 ? 'bg-[#00c853] text-slate-950' : 'bg-[#1c202e] text-slate-400'
                  }`}
                >
                  {activeTrades.length}
                </span>
              </button>

              <button
                type="button"
                data-testid="right-tab-history"
                onClick={() => {
                  soundEngine.playUiClick();
                  setRightPanelTab('history');
                }}
                className={`flex-1 py-1 px-1.5 rounded font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                  rightPanelTab === 'history'
                    ? 'bg-[#252b3d] text-white font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>History</span>
                <span className="px-1.5 py-0.2 rounded-full text-[8.5px] bg-[#1c202e] text-slate-400 font-bold">
                  {closedTrades.length}
                </span>
              </button>
            </div>

            {/* Tab Content: Active Trades vs Closed Trade History (Condensed Scrollable List) */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 max-h-[calc(100vh-420px)] min-h-[120px] no-scrollbar">
              {rightPanelTab === 'trades' ? (
                activeTrades.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-[#141722] border border-[#2a2e39] text-center text-[9.5px] text-slate-400 space-y-0.5">
                    <div className="text-slate-300 font-bold">No Active Trades</div>
                    <div>Click Buy or Sell above to open an order.</div>
                  </div>
                ) : (
                  activeTrades.map((t) => {
                    const secondsLeft = Math.max(0, Math.ceil((t.endTime - Date.now()) / 1000));
                    const isCall = t.direction === 'CALL';
                    const tradeMarket = getAssetMarketState(t.asset);
                    const livePrice = t.asset === selectedAsset.symbol ? currentPrice : (tradeMarket?.lastPrice ?? t.strikePrice);
                    const isInTheMoney = isCall ? livePrice > t.strikePrice : livePrice < t.strikePrice;
                    const percentRemaining = Math.max(0, Math.min(100, (secondsLeft / t.durationSeconds) * 100));
                    const assetObj = findAssetBySymbol(t.asset);

                    return (
                      <div
                        key={t.id}
                        className={`p-1.5 px-2 rounded-lg border text-xs transition-all ${
                          isInTheMoney
                            ? 'bg-[#081a14] border-[#00e676]/40'
                            : 'bg-[#1a0a0e] border-[#ff334b]/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1 font-bold text-white text-[10.5px] truncate">
                            <span>{assetObj?.flag || '📈'}</span>
                            <span className="truncate">{t.asset}</span>
                          </div>
                          <span className="text-[9.5px] font-bold text-cyan-300 font-mono">
                            {formatTimerDisplay(secondsLeft)}
                          </span>
                        </div>

                        {/* Live Countdown Progress Line */}
                        <div className="w-full h-0.5 bg-[#131722] rounded-full overflow-hidden my-0.5 border border-[#2a2e39]">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isInTheMoney ? 'bg-[#00e676]' : 'bg-[#ff334b]'
                            }`}
                            style={{ width: `${percentRemaining}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[9.5px] font-mono">
                          <span className={`font-bold ${isCall ? 'text-[#00e676]' : 'text-[#ff334b]'}`}>
                            {isCall ? '↑' : '↓'} ${t.investment}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDoubleUp(t)}
                              className="px-1 py-0.2 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[8.5px] font-bold cursor-pointer"
                              title="Double up position (x2)"
                            >
                              x2
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateTrade({
                                  ...t,
                                  endTime: Date.now() - 10,
                                })
                              }
                              className="px-1 py-0.2 rounded bg-[#ff8800]/20 hover:bg-[#ff8800]/30 text-[#ff8800] border border-[#ff8800]/40 text-[8.5px] font-bold cursor-pointer"
                              title="Settle trade immediately"
                            >
                              Settle
                            </button>
                            <span className={`font-black ${isInTheMoney ? 'text-[#00e676]' : 'text-rose-400'}`}>
                              {isInTheMoney ? `+$${t.potentialPayout.toFixed(2)}` : `-$${t.investment.toFixed(2)}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              ) : closedTrades.length === 0 ? (
                <div className="p-2.5 rounded-lg bg-[#141722] border border-[#2a2e39] text-center text-[9.5px] text-slate-400">
                  No settled trades yet.
                </div>
              ) : (
                (() => {
                  // Group history by date (Quotex Style Date Badges)
                  const groups = closedTrades.slice(0, 25).reduce((acc, t) => {
                    const dateStr = new Date(t.endTime)
                      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      .toUpperCase();
                    if (!acc[dateStr]) acc[dateStr] = [];
                    acc[dateStr].push(t);
                    return acc;
                  }, {} as Record<string, typeof closedTrades>);

                  return Object.entries(groups).map(([dateLabel, items]) => (
                    <div key={dateLabel} className="space-y-0.5">
                      {/* Quotex Date Section Header Pill */}
                      <div className="flex items-center justify-center my-0.5">
                        <div className="px-2 py-0.2 rounded-full bg-[#1c202e] border border-[#2a2e39] text-[8.5px] font-black text-slate-400 font-mono tracking-wider flex items-center gap-1">
                          <span>{dateLabel}</span>
                          <span className="w-3 h-3 rounded-full bg-[#262b3d] text-white flex items-center justify-center text-[7.5px] font-bold">
                            {items.length}
                          </span>
                        </div>
                      </div>

                      {items.map((t) => {
                        const isWin = t.status === 'won';
                        const isCall = t.direction === 'CALL';
                        const assetObj = findAssetBySymbol(t.asset);
                        const isHighlightedOnChart = activeInspectedMarker?.tradeId === t.id;

                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              soundEngine.playUiClick();
                              setShowHistoryOverlay(true);
                              const marker =
                                tradeMarkersRef.current.find(
                                  (m) => m.tradeId === t.id && m.pointType === 'settlement'
                                ) ||
                                tradeMarkersRef.current.find((m) => m.tradeId === t.id) ||
                                null;
                              if (marker) {
                                setSelectedTradeMarker(marker);
                              }
                            }}
                            className={`p-1 px-1.5 rounded-md border text-[11px] cursor-pointer transition-colors ${
                              isHighlightedOnChart
                                ? isWin
                                  ? 'bg-[#081a14] border-[#00e676]'
                                  : 'bg-[#1a0a0e] border-[#ff334b]'
                                : 'bg-[#141722] border-[#202533] hover:border-slate-600'
                            }`}
                            title="Click to highlight trade execution & settlement on chart"
                          >
                            <div className="flex items-center justify-between text-[10px] mb-0.5">
                              <div className="flex items-center gap-1 font-bold text-white truncate">
                                <span>{assetObj?.flag || '📈'}</span>
                                <span className="truncate text-[10px]">{t.asset}</span>
                              </div>
                              <span className="text-[9px] text-slate-400 font-mono">
                                {new Date(t.endTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[9.5px] font-mono">
                              <span className={`font-bold ${isCall ? 'text-[#00e676]' : 'text-[#ff334b]'}`}>
                                {isCall ? '↑' : '↓'} ${t.investment}
                              </span>
                              <span
                                className={`font-black ${
                                  isWin ? 'text-[#00e676]' : 'text-slate-400'
                                }`}
                              >
                                {isWin
                                  ? `+${(t.pnl ?? t.potentialPayout ?? 0).toFixed(2)} $`
                                  : '0.00 $'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. LIVE BOTTOM STATUS BAR (Drawdown & Capital Metrics - Desktop Only) */}
      <div className="hidden md:flex h-10 bg-[#0e1015] border-t border-white/10 px-4 items-center justify-between font-mono text-[11px] shrink-0 z-20">
        {/* Left: Capital & Drawdown Metrics */}
        <div className="flex items-center gap-5 overflow-x-auto no-scrollbar">
          {/* Current Capital / Balance */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-slate-400 uppercase text-[10px]">Capital:</span>
            <span className="text-white font-black text-xs">
              ${(account?.currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-slate-500 text-[10px]">
              (${liveEquity.toFixed(2)} Eq)
            </span>
          </div>

          {/* Live Daily Drawdown (Used % and remaining $ limit) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-slate-400 uppercase text-[10px]">Daily DD:</span>
            <span
              className={`font-black ${
                metrics.dailyDrawdownPercent >= (account?.dailyLossLimitPercent || 4)
                  ? 'text-rose-400'
                  : metrics.dailyDrawdownPercent >= (account?.dailyLossLimitPercent || 4) * 0.8
                  ? 'text-amber-400'
                  : 'text-[#00e676]'
              }`}
            >
              {metrics.dailyDrawdownPercent.toFixed(2)}% / {account?.dailyLossLimitPercent || 4}%
            </span>
            <span className="text-slate-500 text-[10px] hidden sm:inline">
              (Rem: $
              {Math.max(
                0,
                ((account?.startingDayEquity || 10000) * (account?.dailyLossLimitPercent || 4)) / 100 -
                  ((account?.startingDayEquity || 10000) - liveEquity)
              ).toFixed(0)}
              )
            </span>
          </div>

          {/* Live Overall Max Drawdown (Used % and remaining $ limit) */}
          <div className="flex items-center gap-1.5 shrink-0 hidden md:flex">
            <span className="text-slate-400 uppercase text-[10px]">Max DD:</span>
            <span
              className={`font-black ${
                metrics.overallLossPercent >= (account?.maxOverallLossPercent || 8)
                  ? 'text-rose-400'
                  : metrics.overallLossPercent >= (account?.maxOverallLossPercent || 8) * 0.8
                  ? 'text-amber-400'
                  : 'text-slate-200'
              }`}
            >
              {metrics.overallLossPercent.toFixed(2)}% / {account?.maxOverallLossPercent || 8}%
            </span>
            <span className="text-slate-500 text-[10px]">
              (Rem: $
              {Math.max(
                0,
                ((account?.initialBalance || 10000) * (account?.maxOverallLossPercent || 8)) / 100 -
                  ((account?.initialBalance || 10000) - liveEquity)
              ).toFixed(0)}
              )
            </span>
          </div>
        </div>

        {/* Right: Keyboard Shortcuts Hint & Account Status Badge & Latency */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Global Shortcuts Pill */}
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-slate-400 bg-[#1e222d] px-2.5 py-0.5 rounded-lg border border-[#2a2e39]">
            <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
            <span>[B] Up • [S] Down • [1-5] Timeframe</span>
          </div>

          {/* Account Status Badge */}
          <div className="flex items-center gap-1">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                account?.status === 'active'
                  ? 'bg-emerald-950 text-[#00e676] border border-[#00e676]/40'
                  : isSoftBreached
                  ? 'bg-amber-950 text-amber-400 border border-amber-500/40 animate-pulse'
                  : 'bg-rose-950 text-rose-400 border border-rose-500/40 animate-pulse'
              }`}
            >
              {isSoftBreached
                ? 'SOFT BREACH (DAILY PAUSE)'
                : isHardBreached
                ? 'HARD BREACH (PERMANENT)'
                : account?.status || 'LOCKED'}
            </span>
          </div>

          {/* Instant Ping / Network rail */}
          <div className="flex items-center gap-1.5 text-[10px] text-[#00e676]">
            <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
            <span className="hidden sm:inline font-mono">18ms • TRC-20 Ultra Low Latency</span>
          </div>
        </div>
      </div>

            {/* Quotex Mobile Bottom Navigation Bar */}
      <QuotexMobileNav
        activeTab={mobileNavTab}
        onChangeTab={setMobileNavTab}
        onOpenSignalsDrawer={() => setIsSignalsDrawerOpen(true)}
        onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
        onOpenRules={() => {
          setIsLeaderboardOpen(false);
          setIsAssetModalOpen(false);
          const rulesBtn = document.querySelector('[data-testid="rules-btn"]') as HTMLButtonElement | null;
          if (rulesBtn) rulesBtn.click();
        }}
        onNavigateToHub={() => onNavigateTab?.('dashboard')}
        onResetChartPan={() => setPanOffset(0)}
        isSoundMuted={!soundEnabled}
        onToggleSound={handleToggleSound}
        signalsCount={3}
      />
      {/* Confirmation Modal (only if One-Click is disabled) */}
      {pendingTradeDirection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e222d] border border-[#2a2e39] p-6 shadow-2xl text-center font-mono">
            <h4 className="text-base font-black text-white mb-2">Confirm Binary Option Order</h4>
            <p className="text-xs text-slate-300 mb-4">
              Place <strong>{pendingTradeDirection}</strong> on <strong>{selectedAsset.symbol}</strong> for{' '}
              <strong className="text-cyan-400">${investment}</strong> with {duration}s expiry?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingTradeDirection(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#131722] text-slate-300 hover:text-white font-bold text-xs cursor-pointer border border-[#2a2e39]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  executeTradeAction(pendingTradeDirection);
                  setPendingTradeDirection(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#00e676] text-slate-950 font-black text-xs glow-mint cursor-pointer"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quotex Asset Selector Modal */}
      <QuotexAssetModal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        onSelectAsset={handleSelectTabAsset}
        currentAssetSymbol={selectedAsset.symbol}
      />

      {/* Dedicated BFT Trading Signals Panel */}
      <QuotexSignalsDrawer
        isOpen={isSignalsDrawerOpen}
        onClose={() => setIsSignalsDrawerOpen(false)}
        onApplySignal={(asset, dir, dur) => {
          handleSelectTabAsset(asset);
          setDuration(dur);
          executeTradeAction(dir, asset, dur);
        }}
      />

      {/* Quotex Leaderboard Modal */}
      <QuotexLeaderboardModal
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        userProfit={Math.max(
          0,
          Number((effectiveAccount.currentBalance - effectiveAccount.initialBalance).toFixed(2))
        )}
        weeklyTradesCount={trades.filter((t) => t.status === 'won' || t.status === 'lost').length}
        userName={userProfile?.fullName || userProfile?.email || 'Trader'}
        userAccountId={effectiveAccount.id || 'UNRANKED'}
      />

      {/* Indicator Settings Modal */}
      <IndicatorSettingsModal
        isOpen={isIndicatorModalOpen}
        onClose={() => setIsIndicatorModalOpen(false)}
        settings={indicators}
        onSave={(s: IndicatorSettings) => setIndicators(s)}
      />

      {/* Real-Time Price Alerts Modal */}
      <PriceAlertModal
        isOpen={isPriceAlertModalOpen}
        onClose={() => setIsPriceAlertModalOpen(false)}
        selectedAsset={selectedAsset}
        currentPrice={currentPrice}
        alerts={alerts}
        onAddAlert={(alt) => setAlerts((prev) => [alt, ...prev])}
        onDeleteAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
        onToggleAlert={(id) =>
          setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)))
        }
      />

      {/* Account Breach Modal - Dual Breach System */}
      {account && (
        <AccountBreachModal
          isOpen={isBreachModalOpen}
          onClose={() => setIsBreachModalOpen(false)}
          account={account}
          accounts={accounts}
          onSelectAccount={onSelectAccount}
          onOpenChallengeModal={onOpenChallengeModal}
          onResetSoftBreach={handleResetSoftBreach}
        />
      )}
    </div>
  );
};
