import type { TradingAccount, UserProfile, WithdrawalRequest, BinaryTrade, AssetInfo, Candle } from '../types/index.ts';
import { OTC_ASSETS_CATALOG } from './otcAssetsCatalog.ts';

export const DEFAULT_ASSETS: AssetInfo[] = OTC_ASSETS_CATALOG;

/**
 * Computes a realistic live fluctuating payout percentage around the asset's base payout (79% - 97%).
 */
export function getLivePayoutPercentage(asset: AssetInfo, tickSeed: number = Math.floor(Date.now() / 3000)): number {
  let hash = 0;
  for (let i = 0; i < asset.symbol.length; i++) {
    hash = (hash * 31 + asset.symbol.charCodeAt(i)) | 0;
  }
  const wave = Math.sin(tickSeed * 0.7 + hash);
  const delta = Math.round(wave * 2); // -2% to +2% live institutional liquidity fluctuation
  return Math.max(79, Math.min(97, asset.payout + delta));
}

export function getFlagForCountry(countryName: string): string {
  const found = SUPPORTED_COUNTRIES.find((c) => c.name.toLowerCase() === countryName.toLowerCase());
  return found ? found.flag : '🌐';
}

export const BUILTIN_AVATARS: string[] = [
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff8800"/><stop offset="100%" stop-color="#ffaa00"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#141414"/><circle cx="60" cy="44" r="22" fill="url(#g1)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g1)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#121816"/><circle cx="60" cy="44" r="22" fill="url(#g2)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g2)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#101720"/><circle cx="60" cy="44" r="22" fill="url(#g3)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g3)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#18121e"/><circle cx="60" cy="44" r="22" fill="url(#g4)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g4)"/></svg>`
  )}`,
];

export const SUPPORTED_COUNTRIES: Array<{ name: string; code: string; flag: string }> = [
  { name: 'United States', code: 'US', flag: '🇺🇸' },
  { name: 'Sri Lanka', code: 'LK', flag: '🇱🇰' },
  { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' },
  { name: 'United Arab Emirates', code: 'AE', flag: '🇦🇪' },
  { name: 'India', code: 'IN', flag: '🇮🇳' },
  { name: 'Malaysia', code: 'MY', flag: '🇲🇾' },
  { name: 'Singapore', code: 'SG', flag: '🇸🇬' },
  { name: 'Australia', code: 'AU', flag: '🇦🇺' },
  { name: 'Canada', code: 'CA', flag: '🇨🇦' },
  { name: 'Germany', code: 'DE', flag: '🇩🇪' },
  { name: 'France', code: 'FR', flag: '🇫🇷' },
  { name: 'Japan', code: 'JP', flag: '🇯🇵' },
  { name: 'Brazil', code: 'BR', flag: '🇧🇷' },
];

/**
 * Canonical symbol aliases map for common shorthand user inputs across views and tabs
 */
const SYMBOL_ALIASES: Record<string, string> = {
  'gold': 'XAU/USD (OTC)',
  'xau/usd': 'XAU/USD (OTC)',
  'silver': 'XAG/USD (OTC)',
  'xag/usd': 'XAG/USD (OTC)',
  'oil': 'WTI/USD (OTC)',
  'crude': 'CRUDE OIL (OTC)',
  'crude oil': 'CRUDE OIL (OTC)',
  'us oil': 'WTI/USD (OTC)',
  'us oil (otc)': 'WTI/USD (OTC)',
  'brent': 'BRENT/USD (OTC)',
  'brent oil': 'BRENT/USD (OTC)',
  'brent oil (otc)': 'BRENT/USD (OTC)',
  'gas': 'NGAS/USD (OTC)',
  'natural gas': 'NGAS/USD (OTC)',
  'natural gas (otc)': 'NGAS/USD (OTC)',
  'nasdaq': 'NAS100 (OTC)',
  'ndx': 'NAS100 (OTC)',
  'spx': 'SPX500 (OTC)',
  'sp500': 'SPX500 (OTC)',
  's&p500': 'SPX500 (OTC)',
  'dow': 'US30 (OTC)',
  'dji': 'US30 (OTC)',
  'btc': 'BTC/USD (OTC)',
  'btc/usdt': 'BTC/USDT (OTC)',
  'eth': 'ETH/USD (OTC)',
  'eth/usdt': 'ETH/USDT (OTC)',
  'sol': 'SOL/USD (OTC)',
  'sol/usdt': 'SOL/USDT (OTC)',
  'eurusd': 'EUR/USD (OTC)',
  'gbpjpy': 'GBP/JPY (OTC)',
  'gbpusd': 'GBP/USD (OTC)',
  'usdjpy': 'USD/JPY (OTC)',
};

/**
 * Normalizes any asset symbol variant (e.g. "EUR/USD", "eur/usd", "Gold", "BTC/USD")
 * to its canonical OTC representation in DEFAULT_ASSETS.
 */
export function normalizeAssetSymbol(symbol: string): string {
  const fallback = 'EUR/USD (OTC)';
  if (!symbol || typeof symbol !== 'string') return fallback;
  const cleaned = symbol.trim();
  const lower = cleaned.toLowerCase();

  const allAssets = dynamicAssetsRegistry.length > 0 ? dynamicAssetsRegistry : DEFAULT_ASSETS;

  // 1. Direct alias match
  if (SYMBOL_ALIASES[lower]) {
    return SYMBOL_ALIASES[lower];
  }

  // 2. Exact match in Registry
  const exact = allAssets.find((a) => a.symbol === cleaned);
  if (exact) return exact.symbol;

  // 3. Case-insensitive exact match
  const caseMatch = allAssets.find((a) => a.symbol.toLowerCase() === lower);
  if (caseMatch) return caseMatch.symbol;

  // 4. Strip OTC suffix comparison
  const withoutOtc = lower.replace(/\s*\(otc\)/gi, '').trim();
  if (SYMBOL_ALIASES[withoutOtc]) {
    return SYMBOL_ALIASES[withoutOtc];
  }
  const strippedMatch = allAssets.find(
    (a) => a.symbol.toLowerCase().replace(/\s*\(otc\)/gi, '').trim() === withoutOtc
  );
  if (strippedMatch) return strippedMatch.symbol;

  // 5. If it already has (OTC), return cleaned; otherwise append (OTC)
  return cleaned.includes('(OTC)') ? cleaned : `${cleaned} (OTC)`;
}

let dynamicAssetsRegistry: AssetInfo[] = [...OTC_ASSETS_CATALOG];

/**
 * Registers externally fetched assets into the local lookup registry while preserving the 260+ catalog.
 */
export function registerDynamicAssets(assets: AssetInfo[]): void {
  if (!assets || assets.length === 0) {
    dynamicAssetsRegistry = [...OTC_ASSETS_CATALOG];
    return;
  }
  const bySymbol = new Map<string, AssetInfo>();
  for (const catAsset of OTC_ASSETS_CATALOG) {
    bySymbol.set(catAsset.symbol, catAsset);
  }
  for (const extAsset of assets) {
    if (extAsset && extAsset.symbol) {
      bySymbol.set(extAsset.symbol, extAsset);
    }
  }
  dynamicAssetsRegistry = Array.from(bySymbol.values());
}

/**
 * Returns all currently registered dynamic assets (268+ synchronized markets).
 */
export function getDynamicAssets(): AssetInfo[] {
  return dynamicAssetsRegistry.length > 0 ? dynamicAssetsRegistry : OTC_ASSETS_CATALOG;
}

/**
 * Finds the complete AssetInfo object for any symbol variant.
 * Guarantees a valid, fully-formed AssetInfo is ALWAYS returned without throwing or returning undefined.
 */
export function findAssetBySymbol(symbol: string): AssetInfo {
  const allAssets = getDynamicAssets();
  if (!symbol) return allAssets[0];

  const canonicalSymbol = normalizeAssetSymbol(symbol);
  
  // 1. Check dynamic registry first
  const foundDynamic = allAssets.find((a) => a.symbol === canonicalSymbol);
  if (foundDynamic) return foundDynamic;

  // 2. Search by name contains
  const lower = symbol.trim().toLowerCase();
  const byName = allAssets.find((a) => 
    a.name.toLowerCase().includes(lower)
  );
  if (byName) return byName;

  // Resilient organic fallback asset info
  return {
    symbol: canonicalSymbol,
    name: canonicalSymbol,
    payout: 92,
    category: canonicalSymbol.includes('/') ? 'Forex (OTC)' : 'Stocks (OTC)',
    basePrice: 100.0,
    volatility: 0.05,
    pipDecimals: canonicalSymbol.includes('JPY') ? 3 : canonicalSymbol.includes('/') ? 5 : 2,
    flag: '📈',
  };
}

const STORAGE_KEYS = {
  PROFILE: 'bft_profile_v1',
  PROFILES_BY_EMAIL: 'bft_profiles_by_email_v1',
  ACCOUNTS: 'bft_accounts_v1',
  ACTIVE_ACCOUNT: 'bft_active_account_v1',
  WITHDRAWALS: 'bft_withdrawals_v1',
  TRADES: 'bft_trades_v1',
  AFFILIATE_USERS: 'bft_affiliate_users_v1',
  AFFILIATE_REFERRALS: 'bft_affiliate_referrals_v1',
  AFFILIATE_PAYOUTS: 'bft_affiliate_payouts_v1',
  SELECTED_ASSET_SYMBOL: 'bft_selected_asset_symbol_v1',
  OPEN_ASSET_TABS: 'bft_open_asset_tabs_v1',
  SELECTED_TIMEFRAME: 'bft_selected_timeframe_v1',
  CHART_TYPE: 'bft_chart_type_v1',
  FAVORITES: 'bft_favorites_v1',
};

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return {
    id: 'trader_' + Math.floor(Math.random() * 900000 + 100000),
    email: 'trader@bft.io',
    fullName: 'Elite Trader',
    avatarUrl: BUILTIN_AVATARS[0],
    telegramHandle: '@elitetrader',
    country: 'United States',
    kycStatus: 'unverified',
    kycDocumentType: 'Passport',
    profileLocked: false,
    twoFactorEnabled: false,
    activeAccountId: '',
    isLoggedIn: false,
  };
}

export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    if (profile.email) {
      const emailKey = profile.email.toLowerCase().trim();
      const mapRaw = localStorage.getItem(STORAGE_KEYS.PROFILES_BY_EMAIL);
      const map: Record<string, UserProfile> = mapRaw ? JSON.parse(mapRaw) : {};
      map[emailKey] = profile;
      localStorage.setItem(STORAGE_KEYS.PROFILES_BY_EMAIL, JSON.stringify(map));
    }
  } catch (e) {
    console.error('Failed to save profile', e);
  }
}

export function clearAuthSession(): void {
  try {
    const current = loadProfile();
    const cleared: UserProfile = {
      ...current,
      isLoggedIn: false,
    };
    saveProfile(cleared);
  } catch {
    // fallback
  }
}

export function loadOrCreateUserProfileByEmail(params: {
  email: string;
  fullName: string;
  userId?: string;
  referralCode?: string;
  referredBy?: string;
  kycStatus?: 'verified' | 'pending' | 'unverified';
  kycDocType?: string;
  kycDocumentNumber?: string;
  kycFrontDocumentUrl?: string;
  kycBackDocumentUrl?: string;
  kycDocumentFileName?: string;
  kycBackDocumentFileName?: string;
  kycSubmittedAt?: string;
  address?: string;
  dateOfBirth?: string;
  country?: string;
  telegramHandle?: string;
  avatarUrl?: string;
  rememberMe?: boolean;
  profileLocked?: boolean;
  isNewRegistration?: boolean;
}): UserProfile {
  const emailKey = params.email.toLowerCase().trim();
  try {
    if (!params.isNewRegistration) {
      const mapRaw = localStorage.getItem(STORAGE_KEYS.PROFILES_BY_EMAIL);
      if (mapRaw) {
        const map: Record<string, UserProfile> = JSON.parse(mapRaw);
        const existing = map[emailKey];
        if (existing) {
          const updated: UserProfile = {
            ...existing,
            id: params.userId || existing.id,
            fullName: params.fullName || existing.fullName,
            referralCode: params.referralCode || existing.referralCode,
            referredBy: params.referredBy ?? existing.referredBy,
            kycStatus:
              params.kycStatus === 'verified' || existing.kycStatus === 'verified'
                ? 'verified'
                : params.kycStatus === 'pending' || existing.kycStatus === 'pending'
                ? 'pending'
                : 'unverified',
            kycDocumentType: params.kycDocType || existing.kycDocumentType || 'ID Card',
            kycDocumentNumber: params.kycDocumentNumber || existing.kycDocumentNumber,
            kycFrontDocumentUrl: params.kycFrontDocumentUrl || existing.kycFrontDocumentUrl,
            kycBackDocumentUrl: params.kycBackDocumentUrl || existing.kycBackDocumentUrl,
            kycDocumentFileName: params.kycDocumentFileName || existing.kycDocumentFileName,
            kycBackDocumentFileName: params.kycBackDocumentFileName || existing.kycBackDocumentFileName,
            kycSubmittedAt: params.kycSubmittedAt || existing.kycSubmittedAt,
            profileLocked: Boolean(
              params.profileLocked ||
                existing.profileLocked ||
                params.kycStatus === 'verified' ||
                params.kycStatus === 'pending'
            ),
            address: params.address || existing.address || '',
            dateOfBirth: params.dateOfBirth || existing.dateOfBirth || '',
            country: params.country || existing.country || 'United States',
            telegramHandle: params.telegramHandle || existing.telegramHandle || '',
            avatarUrl: params.avatarUrl || existing.avatarUrl || BUILTIN_AVATARS[0],
            isLoggedIn: true,
            rememberMe: params.rememberMe,
          };
          saveProfile(updated);
          return updated;
        }
      }
    }
  } catch {
    // fallback to creating fresh profile
  }

  const freshProfile: UserProfile = {
    id: params.userId || 'trader_' + Math.floor(Math.random() * 900000 + 100000),
    email: params.email.trim(),
    fullName: params.fullName.trim(),
    address: params.address || '',
    dateOfBirth: params.dateOfBirth || '',
    profileLocked: Boolean(
      params.profileLocked || params.kycStatus === 'verified' || params.kycStatus === 'pending'
    ),
    country: params.country || 'United States',
    avatarUrl: params.avatarUrl || BUILTIN_AVATARS[0],
    telegramHandle: params.telegramHandle || '',
    kycStatus:
      params.kycStatus === 'verified'
        ? 'verified'
        : params.kycStatus === 'pending'
        ? 'pending'
        : 'unverified',
    kycDocumentType: params.kycDocType || 'ID Card',
    kycDocumentNumber: params.kycDocumentNumber,
    kycFrontDocumentUrl: params.kycFrontDocumentUrl,
    kycBackDocumentUrl: params.kycBackDocumentUrl,
    kycDocumentFileName: params.kycDocumentFileName,
    kycBackDocumentFileName: params.kycBackDocumentFileName,
    kycSubmittedAt: params.kycSubmittedAt,
    twoFactorEnabled: false,
    activeAccountId: '',
    referralCode: params.referralCode,
    referredBy: params.referredBy,
    isLoggedIn: true,
    rememberMe: params.rememberMe,
  };
  saveProfile(freshProfile);
  return freshProfile;
}

export function loadAccounts(): TradingAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (raw) {
      const parsed: TradingAccount[] = JSON.parse(raw).map((a: TradingAccount) =>
        a.tier === 'instant'
          ? { ...a, dailyLossLimitPercent: 6, maxOverallLossPercent: 12 }
          : a
      );
      return parsed;
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveAccounts(accounts: TradingAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save accounts', e);
  }
}

export function loadActiveAccountId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEYS.ACTIVE_ACCOUNT);
    if (id) return id;
  } catch {
    // fallback
  }
  return '';
}

export function saveActiveAccountId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ACCOUNT, id);
  } catch (e) {
    console.error('Failed to save active account id', e);
  }
}

export function loadWithdrawals(): WithdrawalRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WITHDRAWALS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

export function saveWithdrawals(withdrawals: WithdrawalRequest[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WITHDRAWALS, JSON.stringify(withdrawals));
  } catch (e) {
    console.error('Failed to save withdrawals', e);
  }
}

export function loadTrades(): BinaryTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRADES);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

export function saveTrades(trades: BinaryTrade[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));
  } catch (e) {
    console.error('Failed to save trades', e);
  }
}

const inMemoryStore: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return inMemoryStore[key] ?? null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  inMemoryStore[key] = value;
}

export function loadSelectedAssetSymbol(): string {
  try {
    const sym = safeGetItem(STORAGE_KEYS.SELECTED_ASSET_SYMBOL);
    if (sym) return normalizeAssetSymbol(sym);
  } catch {
    // fallback
  }
  const all = getDynamicAssets();
  return all.length > 0 ? all[0].symbol : 'EUR/USD (OTC)';
}

export function saveSelectedAssetSymbol(symbol: string): void {
  try {
    safeSetItem(STORAGE_KEYS.SELECTED_ASSET_SYMBOL, normalizeAssetSymbol(symbol));
  } catch (e) {
    console.error('Failed to save selected asset symbol', e);
  }
}

export function loadOpenAssetTabSymbols(): string[] {
  try {
    const raw = safeGetItem(STORAGE_KEYS.OPEN_ASSET_TABS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s) => normalizeAssetSymbol(String(s)));
      }
    }
  } catch {
    // fallback
  }
  
  const all = getDynamicAssets();
  if (all.length >= 6) {
    return all.slice(0, 6).map(a => a.symbol);
  }
  
  return [
    'EUR/USD (OTC)',
    'GBP/JPY (OTC)',
    'BTC/USD (OTC)',
    'ETH/USD (OTC)',
    'XAU/USD (OTC)',
    'TSLA (OTC)',
  ];
}

export function saveOpenAssetTabSymbols(symbols: string[]): void {
  try {
    const normalized = symbols.map((s) => normalizeAssetSymbol(s));
    safeSetItem(STORAGE_KEYS.OPEN_ASSET_TABS, JSON.stringify(normalized));
  } catch (e) {
    console.error('Failed to save open asset tabs', e);
  }
}

export function loadFavoritesFromStorage(): string[] {
  try {
    const raw = safeGetItem(STORAGE_KEYS.FAVORITES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => normalizeAssetSymbol(String(s)));
      }
    }
  } catch {}
  return [
    'EUR/USD (OTC)',
    'GBP/JPY (OTC)',
    'BTC/USD (OTC)',
    'XAU/USD (OTC)',
    'TSLA (OTC)',
  ];
}

export function saveFavoritesToStorage(favorites: string[]): void {
  try {
    const normalized = favorites.map((s) => normalizeAssetSymbol(s));
    safeSetItem(STORAGE_KEYS.FAVORITES, JSON.stringify(normalized));
  } catch (e) {
    console.error('Failed to save favorites', e);
  }
}

export function loadSelectedTimeframe(): string {
  try {
    const tf = safeGetItem(STORAGE_KEYS.SELECTED_TIMEFRAME);
    if (tf) return tf;
  } catch {
    // fallback
  }
  return '1m';
}

export function saveSelectedTimeframe(tf: string): void {
  try {
    safeSetItem(STORAGE_KEYS.SELECTED_TIMEFRAME, tf);
  } catch (e) {
    console.error('Failed to save selected timeframe', e);
  }
}

export function loadChartType(): string {
  try {
    const ct = safeGetItem(STORAGE_KEYS.CHART_TYPE);
    if (ct) return ct;
  } catch {
    // fallback
  }
  return 'candles';
}

export function saveChartType(ct: string): void {
  try {
    safeSetItem(STORAGE_KEYS.CHART_TYPE, ct);
  } catch (e) {
    console.error('Failed to save chart type', e);
  }
}

export function saveAssetHistoryToStorage(symbol: string, candles: Candle[], timeframeSeconds: number): void {
  try {
    const canonical = normalizeAssetSymbol(symbol);
    const key = `bft_candles_${canonical}_${timeframeSeconds}`;
    const recentCandles = candles.slice(-1500);
    safeSetItem(key, JSON.stringify(recentCandles));
  } catch (e) {
    console.error('Failed to save asset history', e);
  }
}

export function loadAssetHistoryFromStorage(symbol: string, timeframeSeconds: number): Candle[] | null {
  try {
    const canonical = normalizeAssetSymbol(symbol);
    const key = `bft_candles_${canonical}_${timeframeSeconds}`;
    const raw = safeGetItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return null;
}


