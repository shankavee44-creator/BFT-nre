import type { BinaryTrade } from '../types';
import { findAssetBySymbol, normalizeAssetSymbol } from './storage';

export type MarketCategoryTab = 'Forex' | 'Crypto' | 'Stocks' | 'Commodities';

export interface TradingViewSymbolResolution {
  bftSymbol: string;
  cleanTicker: string;
  tvSymbol: string;
  exchange: string;
  marketCategory: MarketCategoryTab;
  description: string;
}

const NYSE_STOCK_TICKERS = new Set([
  'JPM',
  'BAC',
  'GS',
  'MS',
  'C',
  'WFC',
  'V',
  'MA',
  'AXP',
  'BLK',
  'BRK.B',
  'XOM',
  'CVX',
  'JNJ',
  'LLY',
  'UNH',
  'PFE',
  'ABBV',
  'MRK',
  'WMT',
  'HD',
  'MCD',
  'NKE',
  'KO',
  'PG',
  'DIS',
  'BA',
  'CAT',
  'GE',
  'LMT',
  'BABA',
  'NIO',
  'UBER',
  'SPOT',
  'SQ',
  'SHOP',
  'SNOW',
  'TSM',
]);

const GLOBAL_INDEX_MAP: Record<string, { tvSymbol: string; exchange: string }> = {
  US30: { tvSymbol: 'FOREXCOM:DJI', exchange: 'FOREXCOM' },
  SPX500: { tvSymbol: 'FOREXCOM:SPX500', exchange: 'FOREXCOM' },
  NAS100: { tvSymbol: 'FOREXCOM:NSXUSD', exchange: 'FOREXCOM' },
  US2000: { tvSymbol: 'TVC:RUT', exchange: 'TVC' },
  UK100: { tvSymbol: 'TVC:UKX', exchange: 'TVC' },
  GER40: { tvSymbol: 'XETR:DAX', exchange: 'XETR' },
  FRA40: { tvSymbol: 'EURONEXT:PX1', exchange: 'EURONEXT' },
  EU50: { tvSymbol: 'TVC:SX5E', exchange: 'TVC' },
  JPN225: { tvSymbol: 'TVC:NI225', exchange: 'TVC' },
  HK50: { tvSymbol: 'TVC:HSI', exchange: 'TVC' },
};

const COMMODITY_TV_MAP: Record<string, { tvSymbol: string; exchange: string }> = {
  'XAU/USD': { tvSymbol: 'OANDA:XAUUSD', exchange: 'OANDA' },
  GOLD: { tvSymbol: 'OANDA:XAUUSD', exchange: 'OANDA' },
  'XAG/USD': { tvSymbol: 'OANDA:XAGUSD', exchange: 'OANDA' },
  SILVER: { tvSymbol: 'OANDA:XAGUSD', exchange: 'OANDA' },
  'WTI/USD': { tvSymbol: 'TVC:USOIL', exchange: 'TVC' },
  'CRUDE OIL': { tvSymbol: 'TVC:USOIL', exchange: 'TVC' },
  'BRENT/USD': { tvSymbol: 'TVC:UKOIL', exchange: 'TVC' },
  'NGAS/USD': { tvSymbol: 'NYMEX:NG1!', exchange: 'NYMEX' },
  'XPT/USD': { tvSymbol: 'OANDA:XPTUSD', exchange: 'OANDA' },
  'XPD/USD': { tvSymbol: 'OANDA:XPDUSD', exchange: 'OANDA' },
  'HG/USD': { tvSymbol: 'COMEX:HG1!', exchange: 'COMEX' },
  'CORN/USD': { tvSymbol: 'CBOT:ZC1!', exchange: 'CBOT' },
  'WHEAT/USD': { tvSymbol: 'CBOT:ZW1!', exchange: 'CBOT' },
  'SOY/USD': { tvSymbol: 'CBOT:ZS1!', exchange: 'CBOT' },
  'COFFEE/USD': { tvSymbol: 'ICEUS:KC1!', exchange: 'ICEUS' },
  'COCOA/USD': { tvSymbol: 'ICEUS:CC1!', exchange: 'ICEUS' },
  'SUGAR/USD': { tvSymbol: 'ICEUS:SB1!', exchange: 'ICEUS' },
  'COTTON/USD': { tvSymbol: 'ICEUS:CT1!', exchange: 'ICEUS' },
  'OATS/USD': { tvSymbol: 'CBOT:ZO1!', exchange: 'CBOT' },
  'HO/USD': { tvSymbol: 'NYMEX:HO1!', exchange: 'NYMEX' },
  'RBOB/USD': { tvSymbol: 'NYMEX:RB1!', exchange: 'NYMEX' },
};

/**
 * Resolves any platform asset symbol (across Forex, Crypto, Stocks, and Commodities)
 * into its canonical TradingView symbol, exchange, and category so selecting any asset
 * from the native platform menu seamlessly drives the TradingView chart.
 */
export function resolveTradingViewSymbol(
  rawSymbol: string,
  categoryHint?: string
): TradingViewSymbolResolution {
  const canonicalBft = normalizeAssetSymbol(rawSymbol || 'EUR/USD (OTC)');
  const assetInfo = findAssetBySymbol(canonicalBft);
  const effectiveCategoryRaw = categoryHint || assetInfo.category || 'Forex (OTC)';
  const cleanTicker = canonicalBft.replace(/\s*\(OTC\)/gi, '').trim().toUpperCase();

  let marketCategory: MarketCategoryTab = 'Forex';
  if (effectiveCategoryRaw.toLowerCase().includes('crypto')) {
    marketCategory = 'Crypto';
  } else if (
    effectiveCategoryRaw.toLowerCase().includes('stock') ||
    effectiveCategoryRaw.toLowerCase().includes('indices')
  ) {
    marketCategory = 'Stocks';
  } else if (effectiveCategoryRaw.toLowerCase().includes('commodit')) {
    marketCategory = 'Commodities';
  } else if (effectiveCategoryRaw.toLowerCase().includes('forex')) {
    marketCategory = 'Forex';
  }

  // 1. Commodities resolution
  if (marketCategory === 'Commodities' || COMMODITY_TV_MAP[cleanTicker]) {
    marketCategory = 'Commodities';
    const mapped = COMMODITY_TV_MAP[cleanTicker];
    if (mapped) {
      return {
        bftSymbol: canonicalBft,
        cleanTicker,
        tvSymbol: mapped.tvSymbol,
        exchange: mapped.exchange,
        marketCategory,
        description: assetInfo.name || cleanTicker,
      };
    }
    const compact = cleanTicker.replace(/[^A-Z0-9]/g, '');
    return {
      bftSymbol: canonicalBft,
      cleanTicker,
      tvSymbol: `TVC:${compact}`,
      exchange: 'TVC',
      marketCategory,
      description: assetInfo.name || cleanTicker,
    };
  }

  // 2. Crypto resolution
  if (marketCategory === 'Crypto') {
    const baseCoin = cleanTicker.split('/')[0].replace(/[^A-Z0-9]/g, '');
    const tvTicker = `${baseCoin}USDT`;
    return {
      bftSymbol: canonicalBft,
      cleanTicker,
      tvSymbol: `BINANCE:${tvTicker}`,
      exchange: 'BINANCE',
      marketCategory: 'Crypto',
      description: assetInfo.name || `${baseCoin} / Tether USDT`,
    };
  }

  // 3. Stocks & Global Indices resolution
  if (marketCategory === 'Stocks') {
    if (GLOBAL_INDEX_MAP[cleanTicker]) {
      const idx = GLOBAL_INDEX_MAP[cleanTicker];
      return {
        bftSymbol: canonicalBft,
        cleanTicker,
        tvSymbol: idx.tvSymbol,
        exchange: idx.exchange,
        marketCategory: 'Stocks',
        description: assetInfo.name || cleanTicker,
      };
    }
    const exchange = NYSE_STOCK_TICKERS.has(cleanTicker) ? 'NYSE' : 'NASDAQ';
    return {
      bftSymbol: canonicalBft,
      cleanTicker,
      tvSymbol: `${exchange}:${cleanTicker}`,
      exchange,
      marketCategory: 'Stocks',
      description: assetInfo.name || cleanTicker,
    };
  }

  // 4. Forex resolution (default)
  const fxPair = cleanTicker.replace(/[^A-Z]/g, '');
  return {
    bftSymbol: canonicalBft,
    cleanTicker,
    tvSymbol: `FX:${fxPair || 'EURUSD'}`,
    exchange: 'FX',
    marketCategory: 'Forex',
    description: assetInfo.name || cleanTicker,
  };
}

/**
 * Complete state representation of a TradingView Order Line (`createOrderLine`) primitive
 */
export interface OrderLineState {
  tradeId: string;
  assetSymbol: string;
  tvSymbol: string;
  price: number;
  direction: 'CALL' | 'PUT';
  directionBadge: 'CALL ▲' | 'PUT ▼';
  investment: number;
  formattedAmount: string;
  payoutPercentage: number;
  potentialProfit: number;
  formattedPnl: string;
  secondsRemaining: number;
  formattedTimer: string;
  isInTheMoney: boolean;
  isTie: boolean;
  statusLabel: 'ITM' | 'OTM' | 'TIED';
  lineColor: '#00e676' | '#ff334b';
  bodyBackgroundColor: string;
  bodyBorderColor: '#00e676' | '#ff334b';
  bodyTextColor: string;
  quantityBackgroundColor: string;
  quantityBorderColor: '#00e676' | '#ff334b';
  quantityTextColor: string;
  lineWidth: number;
  lineStyle: number;
  extendLeft: boolean;
  extendRight: boolean;
  cancellable: false;
  text: string;
  quantity: string;
  tooltip: string;
  isExpired: boolean;
}

/**
 * Computes the live state of a chart order line for an active Call/Put binary trade.
 * Enforces green (#00e676) when In-The-Money (ITM) and red (#ff334b) when Out-Of-The-Money (OTM).
 */
export function computeOrderLineState(
  trade: Pick<
    BinaryTrade,
    | 'id'
    | 'asset'
    | 'direction'
    | 'strikePrice'
    | 'investment'
    | 'payoutPercentage'
    | 'startTime'
    | 'endTime'
  >,
  currentPrice: number,
  nowMs: number = Date.now(),
  pipDecimals: number = 5
): OrderLineState {
  const isCall = trade.direction === 'CALL';
  const priceDiff = currentPrice - trade.strikePrice;
  const isTie = Math.abs(priceDiff) < 1e-7;
  const isInTheMoney = isTie
    ? isCall
    : (isCall && priceDiff > 0) || (!isCall && priceDiff < 0);

  const statusLabel: 'ITM' | 'OTM' | 'TIED' = isTie ? 'TIED' : isInTheMoney ? 'ITM' : 'OTM';
  const lineColor: '#00e676' | '#ff334b' = isInTheMoney ? '#00e676' : '#ff334b';
  const directionBadge: 'CALL ▲' | 'PUT ▼' = isCall ? 'CALL ▲' : 'PUT ▼';

  const secondsRemaining = Math.max(0, Math.ceil((trade.endTime - nowMs) / 1000));
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const formattedTimer = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const formattedAmount = `$${trade.investment.toFixed(2)}`;
  const potentialProfit = Number(((trade.investment * trade.payoutPercentage) / 100).toFixed(2));
  const formattedPnl = isInTheMoney
    ? `+$${potentialProfit.toFixed(2)}`
    : `-$${trade.investment.toFixed(2)}`;

  const tvResolved = resolveTradingViewSymbol(trade.asset);
  const text = `${directionBadge} • ${formattedAmount} • ${formattedTimer} (${statusLabel} ${formattedPnl})`;
  const tooltip = `${tvResolved.tvSymbol} | ${trade.direction} @ ${trade.strikePrice.toFixed(pipDecimals)} | Stake: ${formattedAmount} | Expiry: ${formattedTimer} | Locked until settlement`;

  return {
    tradeId: trade.id,
    assetSymbol: trade.asset,
    tvSymbol: tvResolved.tvSymbol,
    price: trade.strikePrice,
    direction: trade.direction,
    directionBadge,
    investment: trade.investment,
    formattedAmount,
    payoutPercentage: trade.payoutPercentage,
    potentialProfit,
    formattedPnl,
    secondsRemaining,
    formattedTimer,
    isInTheMoney,
    isTie,
    statusLabel,
    lineColor,
    bodyBackgroundColor: isInTheMoney ? 'rgba(5, 46, 22, 0.96)' : 'rgba(59, 7, 18, 0.96)',
    bodyBorderColor: lineColor,
    bodyTextColor: isInTheMoney ? '#00e676' : '#ff4d63',
    quantityBackgroundColor: lineColor,
    quantityBorderColor: lineColor,
    quantityTextColor: isInTheMoney ? '#04130a' : '#ffffff',
    lineWidth: 2,
    lineStyle: 0, // Solid line
    extendLeft: true,
    extendRight: true,
    cancellable: false,
    text,
    quantity: formattedAmount,
    tooltip,
    isExpired: nowMs >= trade.endTime,
  };
}

/**
 * Underlying price-line host interface (compatible with lightweight-charts ISeriesApi & unit test mocks)
 */
export interface OrderLineSeriesHost {
  createPriceLine: (options: Record<string, any>) => {
    applyOptions: (opts: Record<string, any>) => void;
  };
  removePriceLine: (line: any) => void;
}

/**
 * TradingView `createOrderLine()` primitive controller.
 * Provides the chainable TradingView OrderLine API while synchronizing directly with
 * the chart series price line and locked settlement lifecycle.
 */
export interface ITradingViewOrderLine {
  setPrice(price: number): this;
  setText(text: string): this;
  setQuantity(quantity: string): this;
  setDirection(direction: 'CALL' | 'PUT'): this;
  setTimer(formattedTimer: string): this;
  setLineColor(color: '#00e676' | '#ff334b'): this;
  setBodyBackgroundColor(color: string): this;
  setBodyBorderColor(color: '#00e676' | '#ff334b'): this;
  setBodyTextColor(color: string): this;
  setQuantityBackgroundColor(color: string): this;
  setQuantityBorderColor(color: '#00e676' | '#ff334b'): this;
  setQuantityTextColor(color: string): this;
  setLineWidth(width: number): this;
  setLineStyle(style: number): this;
  setExtendLeft(extend: boolean): this;
  setExtendRight(extend: boolean): this;
  setCancellable(cancellable: false): this;
  setTooltip(tooltip: string): this;
  applyState(nextState: OrderLineState, compactTitle?: boolean): this;
  getState(): OrderLineState;
  isRemoved(): boolean;
  remove(): void;
}

export function createTradingViewOrderLine(
  seriesHost: OrderLineSeriesHost,
  initialState: OrderLineState,
  compactTitle: boolean = false
): ITradingViewOrderLine {
  let state: OrderLineState = { ...initialState, cancellable: false };
  let removed = false;

  const underlyingLine = seriesHost.createPriceLine({
    price: state.price,
    color: state.lineColor,
    lineWidth: state.lineWidth,
    lineStyle: state.lineStyle,
    axisLabelVisible: true,
    title: compactTitle ? '' : state.text,
  });

  const syncToHost = (useCompact = compactTitle) => {
    if (removed) return;
    try {
      underlyingLine.applyOptions({
        price: state.price,
        color: state.lineColor,
        lineWidth: state.lineWidth,
        lineStyle: state.lineStyle,
        axisLabelVisible: true,
        title: useCompact ? '' : state.text,
      });
    } catch {
      // ignore if series was disposed
    }
  };

  const controller: ITradingViewOrderLine = {
    setPrice(price: number) {
      state = { ...state, price };
      syncToHost();
      return this;
    },
    setText(text: string) {
      state = { ...state, text };
      syncToHost();
      return this;
    },
    setQuantity(quantity: string) {
      state = { ...state, quantity, formattedAmount: quantity };
      syncToHost();
      return this;
    },
    setDirection(direction: 'CALL' | 'PUT') {
      state = {
        ...state,
        direction,
        directionBadge: direction === 'CALL' ? 'CALL ▲' : 'PUT ▼',
      };
      syncToHost();
      return this;
    },
    setTimer(formattedTimer: string) {
      state = { ...state, formattedTimer };
      syncToHost();
      return this;
    },
    setLineColor(color: '#00e676' | '#ff334b') {
      state = { ...state, lineColor: color };
      syncToHost();
      return this;
    },
    setBodyBackgroundColor(color: string) {
      state = { ...state, bodyBackgroundColor: color };
      return this;
    },
    setBodyBorderColor(color: '#00e676' | '#ff334b') {
      state = { ...state, bodyBorderColor: color };
      return this;
    },
    setBodyTextColor(color: string) {
      state = { ...state, bodyTextColor: color };
      return this;
    },
    setQuantityBackgroundColor(color: string) {
      state = { ...state, quantityBackgroundColor: color };
      return this;
    },
    setQuantityBorderColor(color: '#00e676' | '#ff334b') {
      state = { ...state, quantityBorderColor: color };
      return this;
    },
    setQuantityTextColor(color: string) {
      state = { ...state, quantityTextColor: color };
      return this;
    },
    setLineWidth(width: number) {
      state = { ...state, lineWidth: width };
      syncToHost();
      return this;
    },
    setLineStyle(style: number) {
      state = { ...state, lineStyle: style };
      syncToHost();
      return this;
    },
    setExtendLeft(extend: boolean) {
      state = { ...state, extendLeft: extend };
      return this;
    },
    setExtendRight(extend: boolean) {
      state = { ...state, extendRight: extend };
      return this;
    },
    setCancellable(_cancellable: false) {
      state = { ...state, cancellable: false };
      return this;
    },
    setTooltip(tooltip: string) {
      state = { ...state, tooltip };
      return this;
    },
    applyState(nextState: OrderLineState, useCompact: boolean = compactTitle) {
      state = { ...nextState, cancellable: false };
      syncToHost(useCompact);
      return this;
    },
    getState() {
      return { ...state };
    },
    isRemoved() {
      return removed;
    },
    remove() {
      if (removed) return;
      removed = true;
      try {
        seriesHost.removePriceLine(underlyingLine);
      } catch {
        // ignore if already removed
      }
    },
  };

  return controller;
}

export interface LockedTradeSettlementEvaluation {
  isLocked: boolean;
  canCloseEarly: false;
  shouldSettleNow: boolean;
  shouldRemoveOrderLine: boolean;
  outcome: 'pending' | 'won' | 'lost' | 'tie';
  creditedAmount: number;
  netPnl: number;
  updatedBalance: number;
}

/**
 * Evaluates locked trade settlement at any timestamp:
 * - While `nowMs < trade.endTime`, the trade is strictly locked (`isLocked: true`, `canCloseEarly: false`, `shouldRemoveOrderLine: false`).
 * - Once `nowMs >= trade.endTime`, the trade automatically settles against `closePrice`, computes `updatedBalance`, and signals `shouldRemoveOrderLine: true`.
 */
export function evaluateLockedTradeSettlement(
  trade: Pick<
    BinaryTrade,
    'direction' | 'strikePrice' | 'investment' | 'payoutPercentage' | 'endTime'
  >,
  closePrice: number,
  currentBalance: number,
  nowMs: number = Date.now()
): LockedTradeSettlementEvaluation {
  if (nowMs < trade.endTime) {
    return {
      isLocked: true,
      canCloseEarly: false,
      shouldSettleNow: false,
      shouldRemoveOrderLine: false,
      outcome: 'pending',
      creditedAmount: 0,
      netPnl: 0,
      updatedBalance: Number(currentBalance.toFixed(2)),
    };
  }

  const diff = closePrice - trade.strikePrice;
  const isTie = Math.abs(diff) < 1e-8;
  const isWin =
    !isTie &&
    ((trade.direction === 'CALL' && diff > 0) ||
      (trade.direction === 'PUT' && diff < 0));

  if (isTie) {
    const creditedAmount = Number(trade.investment.toFixed(2));
    return {
      isLocked: false,
      canCloseEarly: false,
      shouldSettleNow: true,
      shouldRemoveOrderLine: true,
      outcome: 'tie',
      creditedAmount,
      netPnl: 0,
      updatedBalance: Number((currentBalance + creditedAmount).toFixed(2)),
    };
  }

  if (isWin) {
    const profit = Number(((trade.investment * trade.payoutPercentage) / 100).toFixed(2));
    const creditedAmount = Number((trade.investment + profit).toFixed(2));
    return {
      isLocked: false,
      canCloseEarly: false,
      shouldSettleNow: true,
      shouldRemoveOrderLine: true,
      outcome: 'won',
      creditedAmount,
      netPnl: profit,
      updatedBalance: Number((currentBalance + creditedAmount).toFixed(2)),
    };
  }

  return {
    isLocked: false,
    canCloseEarly: false,
    shouldSettleNow: true,
    shouldRemoveOrderLine: true,
    outcome: 'lost',
    creditedAmount: 0,
    netPnl: -Number(trade.investment.toFixed(2)),
    updatedBalance: Number(currentBalance.toFixed(2)),
  };
}
