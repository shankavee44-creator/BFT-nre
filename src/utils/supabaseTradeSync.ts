import { supabase } from './supabase.ts';
import type { BinaryTrade, BinaryOptionDirection } from '../types/index.ts';
import { liveMarketFeed } from './liveMarketFeed.ts';
import { getAssetMarketState } from './priceFeedEngine.ts';
import { getIsCopyExecutedTradesTableAvailable, setIsCopyExecutedTradesTableAvailable } from './copyTradingSync.ts';

/**
 * UUID validator utility (RFC 4122 standard).
 */
export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

/**
 * Converts a non-UUID trade identifier (e.g., 'TRD-123456') into a deterministic valid UUID format,
 * or leaves already valid UUIDs unchanged.
 */
export function ensureTradeUuid(tradeId: string): string {
  if (isValidUuid(tradeId)) return tradeId.trim();

  // Deterministic 32-char hex digest generator
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < tradeId.length; i++) {
    const ch = tradeId.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = ((h1 ^ (h1 >>> 16)) >>> 0);
  h2 = ((h2 ^ (h2 >>> 13)) >>> 0);

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (hex1 + (h2 >>> 0).toString(16)).slice(0, 8);
  const hex3 = ((h1 ^ 0xa5a5a5a5) >>> 0).toString(16).padStart(8, '0');
  const hex4 = ((h2 ^ 0x5a5a5a5a) >>> 0).toString(16).padStart(8, '0');
  const fullHex = (hex1 + hex2 + hex3 + hex4).slice(0, 32);

  return `${fullHex.slice(0, 8)}-${fullHex.slice(8, 12)}-4${fullHex.slice(13, 16)}-a${fullHex.slice(17, 20)}-${fullHex.slice(20, 32)}`;
}

const cachedEmailUuidMap = new Map<string, string>();

/**
 * Resolves the effective Supabase user UUID.
 * If input userId is a valid UUID, returns it. Otherwise checks auth session or browser profile email lookup.
 */
export async function getEffectiveSupabaseUserId(
  userId?: string | null,
  userEmail?: string | null
): Promise<string | null> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const authUid = userData?.user?.id;
    if (authUid && isValidUuid(authUid)) {
      return authUid.trim();
    }
  } catch {
    // ignore
  }

  if (userId && isValidUuid(userId)) {
    return userId.trim();
  }
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUserId = data?.session?.user?.id;
    if (sessionUserId && isValidUuid(sessionUserId)) {
      return sessionUserId.trim();
    }
  } catch {
    // Supabase auth lookup failed or unauthenticated
  }

  // In browser context, check stored profile UUID or resolve UUID via profiles email lookup
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const rawProfile = localStorage.getItem('bft_user_profile');
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile);
        if (parsed?.id && isValidUuid(parsed.id)) {
          return parsed.id.trim();
        }
        const effectiveEmail = String(userEmail || parsed?.email || '').toLowerCase().trim();
        if (effectiveEmail && effectiveEmail.includes('@')) {
          if (cachedEmailUuidMap.has(effectiveEmail)) {
            return cachedEmailUuidMap.get(effectiveEmail)!;
          }
          const { data: profRow } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', effectiveEmail)
            .maybeSingle();
          if (profRow?.id && isValidUuid(profRow.id)) {
            const resolvedId = profRow.id.trim();
            cachedEmailUuidMap.set(effectiveEmail, resolvedId);
            return resolvedId;
          }
        }
      }
    } catch {
      // ignore storage/lookup fallback error
    }
  }

  return null;
}

const unsupportedTradeColumns = new Set<string>();
const requiredTradeColumns = new Set<string>();

function extractMissingTradeColumn(error: any): string | null {
  const msg = String(error?.message || error?.details || '');
  const m1 = msg.match(/Could not find the '([^']+)' column/i);
  if (m1?.[1]) return m1[1];
  const m2 = msg.match(/column "?([a-zA-Z0-9_]+)"? of relation "?user_trades"? does not exist/i);
  if (m2?.[1]) return m2[1];
  return null;
}

function extractNotNullTradeColumn(error: any): string | null {
  const msg = String(error?.message || error?.details || '');
  const m = msg.match(/null value in column "?([a-zA-Z0-9_]+)"? .*violates not-null constraint/i);
  return m?.[1] || null;
}

export type CanonicalTradeAccountType = 'DEMO' | 'SELF_FUNDED' | 'FUNDED';

export function resolveSupabaseAccountType(tradeOrAccount: any): CanonicalTradeAccountType {
  if (!tradeOrAccount) return 'DEMO';

  if (typeof tradeOrAccount === 'string') {
    const raw = tradeOrAccount.toUpperCase().trim();
    if (raw === 'DEMO') return 'DEMO';
    if (raw === 'SELF_FUNDED' || raw === 'PERSONAL' || raw === 'REAL' || raw === 'SELF') {
      return 'SELF_FUNDED';
    }
    if (
      raw === 'FUNDED' ||
      raw === 'ONE_STEP' ||
      raw === 'ONE-STEP' ||
      raw === 'TWO_STEP' ||
      raw === 'TWO-STEP' ||
      raw === 'INSTANT' ||
      raw === 'CHALLENGE'
    ) {
      return 'FUNDED';
    }
    return 'DEMO';
  }

  const tier = String(
    tradeOrAccount?.accountTier ||
      tradeOrAccount?.tier ||
      tradeOrAccount?.accountType ||
      tradeOrAccount?.account_type ||
      tradeOrAccount?.accountCategory ||
      ''
  )
    .toLowerCase()
    .trim();
  const phase = String(tradeOrAccount?.phase || '').toLowerCase().trim();
  const accIdStr = String(tradeOrAccount?.accountId || tradeOrAccount?.id || '').trim();

  if (
    tier === 'demo' ||
    phase === 'demo' ||
    accIdStr.startsWith('BFT-DEMO') ||
    accIdStr === 'BFT-10000'
  ) {
    return 'DEMO';
  }
  if (
    tier === 'personal' ||
    tier === 'personal_live' ||
    tier === 'real' ||
    tier === 'self_funded' ||
    tier === 'self' ||
    accIdStr.includes('PERS') ||
    accIdStr === 'personal_live' ||
    accIdStr === 'BFT-LIVE-DB'
  ) {
    return 'SELF_FUNDED';
  }
  if (
    tier === 'one-step' ||
    tier === 'one_step' ||
    tier === 'two-step' ||
    tier === 'two_step' ||
    tier === 'instant' ||
    tier === 'funded' ||
    tier === 'challenge' ||
    phase === 'phase_1' ||
    phase === 'phase_2' ||
    phase === 'funded' ||
    (accIdStr.startsWith('BFT-') && !accIdStr.startsWith('BFT-DEMO') && accIdStr !== 'BFT-10000')
  ) {
    return 'FUNDED';
  }
  return 'DEMO';
}

/**
 * Maps a BinaryTrade object to a Supabase user_trades row.
 */
function mapToSupabaseRow(trade: BinaryTrade, userId: string): Record<string, any> {
  const accountType = resolveSupabaseAccountType(trade);
  const durationSeconds = Number(trade.durationSeconds) || 60;
  const startTime = Number(trade.startTime) || Date.now();
  const rawAccountUuid = (trade as any).supabaseAccountId || trade.accountId;
  const accountIdUuid = isValidUuid(rawAccountUuid) ? rawAccountUuid!.trim() : null;

  const dbStatus =
    trade.status === 'active'
      ? 'OPEN'
      : trade.status === 'won'
      ? 'WIN'
      : trade.status === 'lost'
      ? 'LOSS'
      : 'TIE';

  const row: Record<string, any> = {
    id: ensureTradeUuid(trade.id),
    user_id: userId,
    asset_symbol: trade.asset,
    trade_type: trade.direction,
    amount: Number(trade.investment),
    entry_price: Number(trade.strikePrice),
    duration_seconds: durationSeconds,
    status: dbStatus,
    account_type: accountType,
    account_id: accountIdUuid,
    created_at: new Date(startTime).toISOString(),
  };

  if (trade.status !== 'active' && (trade.closePrice !== undefined || trade.currentPrice !== undefined)) {
    row.exit_price = Number(trade.closePrice ?? trade.currentPrice);
  }

  if (requiredTradeColumns.has('symbol')) {
    row.symbol = trade.asset;
  }
  if (requiredTradeColumns.has('payout_multiplier')) {
    row.payout_multiplier = Number((1 + Number(trade.payoutPercentage || 85) / 100).toFixed(4));
  }
  if (requiredTradeColumns.has('expires_at')) {
    row.expires_at = new Date(startTime + durationSeconds * 1000).toISOString();
  }

  for (const col of Array.from(unsupportedTradeColumns)) {
    delete row[col];
  }

  return row;
}

/**
 * Optimistically determines the real-time Win / Loss / Tie result of a trade
 * upon timer expiry (0:00) using the latest market exit price vs entry price:
 * - BUY (CALL): Exit Price > Entry Price => WIN (Payout applied), else LOSS ($0 payout)
 * - SELL (PUT): Exit Price < Entry Price => WIN (Payout applied), else LOSS ($0 payout)
 * - TIE: Exit Price === Entry Price => TIE (Refund $0 PnL)
 */
export function resolveOptimisticTradeResult(
  trade: BinaryTrade,
  latestExitPrice?: number
): BinaryTrade {
  const isAlreadySettled =
    trade.status === 'won' || trade.status === 'lost' || trade.status === 'tie';
  if (isAlreadySettled) {
    return trade;
  }

  const strike = Number(trade.strikePrice || 0);

  // Live price feed lookup if latestExitPrice is not passed directly
  let liveFeedPrice: number | undefined = undefined;
  if (typeof window !== 'undefined') {
    try {
      const feedPrice = liveMarketFeed.getLatestPrice(trade.asset);
      const marketState = getAssetMarketState(trade.asset);
      liveFeedPrice = feedPrice ?? marketState?.lastPrice;
    } catch {
      // ignore
    }
  }

  const exitPrice =
    latestExitPrice !== undefined && Number.isFinite(latestExitPrice) && latestExitPrice > 0
      ? Number(latestExitPrice)
      : trade.closePrice !== undefined && trade.closePrice !== null && Number(trade.closePrice) > 0
      ? Number(trade.closePrice)
      : liveFeedPrice !== undefined && Number.isFinite(liveFeedPrice) && liveFeedPrice > 0
      ? Number(liveFeedPrice)
      : trade.currentPrice !== undefined &&
        trade.currentPrice !== null &&
        Number(trade.currentPrice) > 0 &&
        Number(trade.currentPrice) !== strike
      ? Number(trade.currentPrice)
      : strike;

  const priceDiff = exitPrice - strike;
  const isTie = Math.abs(priceDiff) < 1e-7;
  const isCall = trade.direction === 'CALL';
  const isWin = !isTie && ((isCall && priceDiff > 0) || (!isCall && priceDiff < 0));
  const status: 'won' | 'lost' | 'tie' = isTie ? 'tie' : isWin ? 'won' : 'lost';

  const stake = Number(trade.investment || 0);
  const payoutPct = Number(trade.payoutPercentage || 85);
  const pnl = isWin
    ? Number(((stake * payoutPct) / 100).toFixed(2))
    : isTie
    ? 0
    : -stake;

  const potentialPayout = Number(((stake * payoutPct) / 100).toFixed(2));

  return {
    ...trade,
    status,
    currentPrice: exitPrice,
    closePrice: exitPrice,
    potentialPayout,
    pnl,
  };
}

/**
 * Maps a Supabase user_trades row back to a BinaryTrade object.
 */
export function mapFromSupabaseRow(row: any): BinaryTrade {
  const payoutPercentage = row.payout_multiplier
    ? Math.round((Number(row.payout_multiplier) - 1) * 100)
    : 85;
  const createdMs = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const durationSec = Number(row.duration_seconds) || 60;
  const expiresMs = row.expires_at
    ? new Date(row.expires_at).getTime()
    : createdMs + durationSec * 1000;
  const now = Date.now();

  const isExpired = now >= expiresMs;
  const rawStatus = String(row.status || 'OPEN').toUpperCase().trim();
  const entryPrice = Number(row.entry_price || 0);
  const exitPrice =
    row.exit_price !== undefined && row.exit_price !== null
      ? Number(row.exit_price)
      : entryPrice;
  const direction = (row.trade_type || 'CALL') as BinaryOptionDirection;

  let status: 'active' | 'won' | 'lost' | 'tie';
  if (rawStatus === 'OPEN' || rawStatus === 'ACTIVE') {
    const hasExitPrice =
      row.exit_price !== undefined &&
      row.exit_price !== null &&
      Number(row.exit_price) > 0 &&
      Number(row.exit_price) !== entryPrice;

    if (!isExpired) {
      status = 'active';
    } else if (hasExitPrice) {
      const exitP = Number(row.exit_price);
      const diff = exitP - entryPrice;
      const isTie = Math.abs(diff) < 1e-7;
      if (isTie) {
        status = 'tie';
      } else if (direction === 'CALL') {
        status = diff > 0 ? 'won' : 'lost';
      } else {
        status = diff < 0 ? 'won' : 'lost';
      }
    } else {
      // Do NOT arbitrarily mark as 'lost' when exit_price hasn't been written to Supabase yet.
      // Leave as 'active' so client optimistic settlement calculates the actual win/loss from the live tick.
      status = 'active';
    }
  } else if (rawStatus === 'WIN' || rawStatus === 'WON') {
    status = 'won';
  } else if (rawStatus === 'LOSS' || rawStatus === 'LOST') {
    status = 'lost';
  } else if (rawStatus === 'TIE') {
    status = 'tie';
  } else {
    status = isExpired ? 'lost' : 'active';
  }


  const rawAccType = String(row.account_type || 'DEMO').toUpperCase().trim();
  let accountTier = 'demo';
  if (rawAccType === 'REAL' || rawAccType === 'SELF_FUNDED' || rawAccType === 'SELF') {
    accountTier = 'personal';
  } else if (rawAccType === 'ONE_STEP') {
    accountTier = 'one-step';
  } else if (rawAccType === 'TWO_STEP') {
    accountTier = 'two-step';
  } else if (rawAccType === 'INSTANT') {
    accountTier = 'instant';
  } else if (rawAccType === 'FUNDED') {
    accountTier = 'funded';
  }

  const defaultAccountId =
    accountTier === 'personal'
      ? 'BFT-PERS-LIVE'
      : accountTier === 'demo'
      ? 'BFT-DEMO-001'
      : `BFT-${rawAccType}`;

  const explicitPayout = row.payout !== undefined && row.payout !== null ? Number(row.payout) : undefined;
  const amount = Number(row.amount || 0);
  const computedPnl =
    status === 'won'
      ? explicitPayout !== undefined && explicitPayout > amount
        ? Number((explicitPayout - amount).toFixed(2))
        : Number((amount * (payoutPercentage / 100)).toFixed(2))
      : status === 'lost'
      ? -amount
      : 0;

  return {
    id: row.id,
    accountId: row.account_id || defaultAccountId,
    asset: row.asset_symbol || row.symbol || 'EUR/USD',
    direction,
    strikePrice: entryPrice,
    currentPrice: exitPrice,
    closePrice: row.exit_price !== undefined && row.exit_price !== null ? Number(row.exit_price) : undefined,
    investment: amount,
    payoutPercentage,
    potentialPayout: Number((amount * (payoutPercentage / 100)).toFixed(2)),
    startTime: createdMs,
    durationSeconds: Math.max(5, durationSec),
    endTime: expiresMs,
    status,
    pnl: computedPnl,
    accountTier,
  };
}

/**
 * Reconciles trades loaded from localStorage on app mount:
 * - Unexpired active trades (`endTime > nowMs`) remain `'active'` so countdown timers resume seamlessly on refresh!
 * - Expired active trades (`endTime <= nowMs`) are settled deterministically into history (`'won'` / `'lost'` / `'tie'`)
 *   so they never vanish on refresh.
 */
export function reconcileLoadedTradesOnMount(
  loadedTrades: BinaryTrade[],
  nowMs: number = Date.now(),
  getFallbackClosePrice?: (assetSymbol: string, strikePrice: number) => number
): {
  reconciledTrades: BinaryTrade[];
  newlyExpiredTrades: BinaryTrade[];
  newlySettledTrades: BinaryTrade[];
} {
  if (!Array.isArray(loadedTrades) || loadedTrades.length === 0) {
    return { reconciledTrades: [], newlyExpiredTrades: [], newlySettledTrades: [] };
  }

  const reconciledTrades: BinaryTrade[] = [];
  const newlyExpiredTrades: BinaryTrade[] = [];
  const seenKeys = new Set<string>();

  for (const t of loadedTrades) {
    if (!t || !t.id) continue;
    const canonicalKey = ensureTradeUuid(t.id);
    if (seenKeys.has(canonicalKey)) continue;
    seenKeys.add(canonicalKey);

    const startMs = Number(t.startTime) || nowMs;
    const durSec = Math.max(5, Number(t.durationSeconds) || 60);
    const endMs = Number(t.endTime) || startMs + durSec * 1000;
    const st = String(t.status || '').toUpperCase().trim();
    const isCurrentlyOpen = st === 'ACTIVE' || st === 'OPEN';

    if (isCurrentlyOpen) {
      if (nowMs < endMs) {
        // Still running! Preserve as 'active' so countdown resumes seamlessly after refresh
        reconciledTrades.push({
          ...t,
          startTime: startMs,
          durationSeconds: durSec,
          endTime: endMs,
          status: 'active',
        });
      } else {
        // Expired while tab was closed or refreshing -> settle into history
        const strike = Number(t.strikePrice || 0);
        const closeP =
          t.closePrice !== undefined && t.closePrice !== null && Number(t.closePrice) !== strike
            ? Number(t.closePrice)
            : t.currentPrice !== undefined && t.currentPrice !== null && Number(t.currentPrice) !== strike
            ? Number(t.currentPrice)
            : getFallbackClosePrice
            ? getFallbackClosePrice(t.asset, strike)
            : strike;

        const isCall = t.direction === 'CALL';
        let settledStatus: 'won' | 'lost' | 'tie' = 'lost';
        if (closeP !== strike) {
          settledStatus =
            (isCall && closeP > strike) || (!isCall && closeP < strike) ? 'won' : 'lost';
        }
        const payoutPct = Number(t.payoutPercentage || 85);
        const stake = Number(t.investment || 0);
        const settledPnl =
          settledStatus === 'won'
            ? Number(((stake * payoutPct) / 100).toFixed(2))
            : settledStatus === 'lost'
            ? -stake
            : 0;

        const settledTrade: BinaryTrade = {
          ...t,
          startTime: startMs,
          durationSeconds: durSec,
          endTime: endMs,
          closePrice: closeP,
          currentPrice: closeP,
          status: settledStatus,
          pnl: settledPnl,
        };
        reconciledTrades.push(settledTrade);
        newlyExpiredTrades.push(settledTrade);
      }
    } else {
      reconciledTrades.push(t);
    }
  }

  reconciledTrades.sort((a, b) => b.startTime - a.startTime);
  return {
    reconciledTrades,
    newlyExpiredTrades,
    newlySettledTrades: newlyExpiredTrades,
  };
}

/**
 * Merges local trades with authoritative trades fetched from Supabase `user_trades`
 * using canonical UUID deduplication so neither active trades nor settled history trades vanish.
 */
export function mergeTradesAuthoritatively(
  localTrades: BinaryTrade[],
  remoteTrades: BinaryTrade[],
  nowMs: number = Date.now()
): BinaryTrade[] {
  const byCanonicalId = new Map<string, BinaryTrade>();

  // 1. Seed with remote trades from Supabase
  if (Array.isArray(remoteTrades)) {
    for (const remote of remoteTrades) {
      if (!remote || !remote.id) continue;
      const key = ensureTradeUuid(remote.id);
      byCanonicalId.set(key, remote);
    }
  }

  // 2. Merge local trades
  if (Array.isArray(localTrades)) {
    for (const local of localTrades) {
      if (!local || !local.id) continue;
      const key = ensureTradeUuid(local.id);
      const existingRemote = byCanonicalId.get(key);

      if (!existingRemote) {
        // Local trade not yet in remote list (e.g. just placed, demo mode, or offline) -> keep it!
        const endMs = Number(local.endTime) || Number(local.startTime) + Number(local.durationSeconds || 60) * 1000;
        if (local.status === 'active' && nowMs >= endMs) {
          // Expired locally; reconcile it so it stays in history
          const { reconciledTrades } = reconcileLoadedTradesOnMount([local], nowMs);
          if (reconciledTrades[0]) {
            byCanonicalId.set(key, reconciledTrades[0]);
          }
        } else {
          byCanonicalId.set(key, local);
        }
      } else {
        // Both exist:
        // Priority 1: Remote is definitively settled ('won'|'lost'|'tie') -> accept settled outcome
        if (existingRemote.status !== 'active') {
          byCanonicalId.set(key, {
            ...existingRemote,
            id: local.id || existingRemote.id,
            accountId: local.accountId || existingRemote.accountId,
            accountTier: local.accountTier || existingRemote.accountTier,
            closePrice: existingRemote.closePrice ?? local.closePrice,
            pnl: existingRemote.pnl ?? local.pnl,
          });
        }
        // Priority 2: Local trade is already settled ('won'|'lost'|'tie') while remote was still 'active' -> preserve local settled result!
        else if (local.status !== 'active' && existingRemote.status === 'active') {
          byCanonicalId.set(key, {
            ...existingRemote,
            id: local.id || existingRemote.id,
            accountId: local.accountId || existingRemote.accountId,
            status: local.status,
            closePrice: local.closePrice ?? existingRemote.closePrice,
            pnl: local.pnl ?? existingRemote.pnl,
          });
        }
        // Priority 3: Both still 'active' but timer reached expiry -> resolve optimistically so it immediately appears in history
        else if (nowMs >= (Number(local.endTime) || Number(existingRemote.endTime) || 0)) {
          const optimistic = resolveOptimisticTradeResult(local);
          byCanonicalId.set(key, {
            ...existingRemote,
            ...optimistic,
            id: local.id || existingRemote.id,
          });
        } else {
          // Preserve original local accountId if remote had generic fallback accountId
          byCanonicalId.set(key, {
            ...existingRemote,
            id: local.id || existingRemote.id,
            accountId:
              local.accountId && !existingRemote.accountId?.startsWith('BFT-DEMO')
                ? local.accountId
                : local.accountId || existingRemote.accountId,
            accountTier: local.accountTier || existingRemote.accountTier,
          });
        }
      }

    }
  }

  return Array.from(byCanonicalId.values()).sort((a, b) => b.startTime - a.startTime);
}

/**
 * Filters a list of trades for the currently active trading account mode
 * (Demo, Self-Funded / Personal Live, or Prop Challenge / Funded).
 */
export function filterTradesForActiveAccount(
  trades: BinaryTrade[],
  activeAccount?: any | null
): BinaryTrade[] {
  if (!Array.isArray(trades) || trades.length === 0) return [];

  // When activeAccount is null/undefined, TradingTerminal uses its Demo Practice account ('BFT-10000' / 'BFT-DEMO-001')
  if (!activeAccount) {
    return trades.filter((t) => resolveSupabaseAccountType(t) === 'DEMO');
  }

  const activeId = String(activeAccount.id || '').trim();
  const activeSupaId = String(activeAccount.supabaseAccountId || '').trim();
  const targetAccountType = resolveSupabaseAccountType(activeAccount);

  return trades.filter((t) => {
    const tAccId = String(t.accountId || '').trim();
    const tSupaId = String((t as any).supabaseAccountId || '').trim();

    // Direct account ID match always wins
    if (activeId && (tAccId === activeId || tSupaId === activeId)) return true;
    if (activeSupaId && (tAccId === activeSupaId || tSupaId === activeSupaId)) return true;

    const tradeAccountType = resolveSupabaseAccountType(t);
    if (tradeAccountType !== targetAccountType) {
      return false;
    }

    if (targetAccountType === 'DEMO' || targetAccountType === 'SELF_FUNDED') {
      return true;
    }

    // For FUNDED / Challenge accounts:
    // If the trade came from Supabase without a specific local BFT-XXXXX account ID
    // (e.g., 'BFT-FUNDED', 'BFT-ONE_STEP', 'BFT-TWO_STEP', 'BFT-INSTANT', or empty),
    // or matches the active prop account, include it.
    const isGenericFundedId =
      !tAccId ||
      tAccId === 'BFT-FUNDED' ||
      tAccId === 'BFT-ONE_STEP' ||
      tAccId === 'BFT-TWO_STEP' ||
      tAccId === 'BFT-INSTANT' ||
      tAccId === 'BFT-CHALLENGE';

    if (isGenericFundedId) return true;

    const activeTier = String(activeAccount.tier || activeAccount.accountType || '').toLowerCase().trim();
    const tTier = String(t.accountTier || '').toLowerCase().trim();
    if (activeTier && tTier === activeTier) return true;

    return false;
  });
}

/**
 * Fetches trades for a specific user from Supabase `user_trades`.
 * When `accountOrType` is provided, explicitly filters by both `user_id` AND `account_type`
 * (and falls back to include legacy `account_type` aliases if present).
 * Automatically settles any stale `'OPEN'` rows in Supabase whose duration has already elapsed.
 */
export async function fetchUserTrades(
  userId?: string | null,
  accountOrType?: any | null
): Promise<BinaryTrade[]> {
  const effectiveUserId = await getEffectiveSupabaseUserId(userId);
  if (!effectiveUserId || !isValidUuid(effectiveUserId)) {
    return [];
  }

  try {
    let rows: any[] = [];

    if (accountOrType) {
      const currentAccountType = resolveSupabaseAccountType(accountOrType);
      const { data, error } = await supabase
        .from('user_trades')
        .select('*')
        .eq('user_id', effectiveUserId)
        .eq('account_type', currentAccountType)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        rows = data;
      }

      // Also check legacy account_type aliases (e.g., REAL for SELF_FUNDED, ONE_STEP/TWO_STEP/INSTANT for FUNDED)
      const legacyAliases =
        currentAccountType === 'SELF_FUNDED'
          ? ['REAL', 'PERSONAL', 'SELF']
          : currentAccountType === 'FUNDED'
          ? ['ONE_STEP', 'TWO_STEP', 'INSTANT', 'CHALLENGE']
          : [];

      if (legacyAliases.length > 0) {
        const { data: aliasData } = await supabase
          .from('user_trades')
          .select('*')
          .eq('user_id', effectiveUserId)
          .in('account_type', legacyAliases)
          .order('created_at', { ascending: false });

        if (Array.isArray(aliasData) && aliasData.length > 0) {
          const seenIds = new Set(rows.map((r) => r.id));
          for (const r of aliasData) {
            if (!seenIds.has(r.id)) {
              rows.push(r);
            }
          }
        }
      }
    } else {
      const { data, error } = await supabase
        .from('user_trades')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[SupabaseTradeSync] fetchUserTrades warning:', error.message);
        return [];
      }
      if (Array.isArray(data)) {
        rows = data;
      }
    }

    if (rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null) {
      for (const col of Object.keys(rows[0])) {
        unsupportedTradeColumns.delete(col);
      }
    }

    const mapped = rows.map((row) => {
      const trade = mapFromSupabaseRow(row);
      const rawSt = String(row.status || '').toUpperCase().trim();
      if ((rawSt === 'OPEN' || rawSt === 'ACTIVE') && trade.status !== 'active') {
        // Row was still marked OPEN in DB after expiry -> update DB in background so history persists permanently
        updateSupabaseTrade(trade, effectiveUserId).catch(() => {});
      }
      return trade;
    });

    // Also include mirrored copy trades from `copy_executed_trades` so they appear seamlessly in terminal & chart
    try {
      const currentAccountType = accountOrType ? resolveSupabaseAccountType(accountOrType) : null;
      if ((!currentAccountType || currentAccountType !== 'DEMO') && getIsCopyExecutedTradesTableAvailable()) {
        let { data: copyRows, error: copyErr } = await supabase
          .from('copy_executed_trades')
          .select('*')
          .eq('user_id', effectiveUserId)
          .order('created_at', { ascending: false });

        if (copyErr) {
          const text = `${copyErr.message || ''} ${copyErr.code || ''}`;
          if (copyErr.code === '42P01' || copyErr.code === 'PGRST204' || text.includes('does not exist') || text.includes('Could not find')) {
            setIsCopyExecutedTradesTableAvailable(false);
          } else {
            const fallbackRes = await supabase
              .from('copy_executed_trades')
              .select('*')
              .eq('copier_user_id', effectiveUserId);
            copyRows = fallbackRes.data;
            if (fallbackRes.error) {
              const fbText = `${fallbackRes.error.message || ''} ${fallbackRes.error.code || ''}`;
              if (fallbackRes.error.code === '42P01' || fallbackRes.error.code === 'PGRST204' || fbText.includes('does not exist')) {
                setIsCopyExecutedTradesTableAvailable(false);
              }
            }
          }
        }

        if (Array.isArray(copyRows) && copyRows.length > 0) {
          const seenIds = new Set(mapped.map((m) => ensureTradeUuid(m.id)));
          for (const cr of copyRows as any[]) {
            const mappedCopy = mapFromSupabaseRow({
              ...cr,
              user_id: cr.user_id || cr.copier_user_id || effectiveUserId,
              account_id: cr.account_id || cr.copier_account_id,
              account_type: currentAccountType || 'FUNDED',
            });
            const canonId = ensureTradeUuid(mappedCopy.id);
            if (!seenIds.has(canonId)) {
              seenIds.add(canonId);
              mapped.push(mappedCopy);
            }
          }
        }
      }
    } catch {
      // ignore if copy_executed_trades is empty or unavailable
    }

    return mapped.sort((a, b) => b.startTime - a.startTime);
  } catch (err) {
    console.warn('[SupabaseTradeSync] fetchUserTrades exception:', err);
    return [];
  }
}

/**
 * Queries active (`status = 'OPEN'`) trades from Supabase `user_trades` and `copy_executed_trades` for the current user and active account.
 */
export async function fetchActiveOpenTradesFromSupabase(
  userId?: string | null,
  activeAccount?: any | null
): Promise<BinaryTrade[]> {
  const effectiveUserId = await getEffectiveSupabaseUserId(userId);
  if (!effectiveUserId || !isValidUuid(effectiveUserId)) {
    return [];
  }

  try {
    let query = supabase
      .from('user_trades')
      .select('*')
      .eq('user_id', effectiveUserId)
      .in('status', ['OPEN', 'ACTIVE']);

    if (activeAccount) {
      const currentAccountType = resolveSupabaseAccountType(activeAccount);
      const acceptedTypes =
        currentAccountType === 'SELF_FUNDED'
          ? ['SELF_FUNDED', 'REAL', 'PERSONAL', 'SELF']
          : currentAccountType === 'FUNDED'
          ? ['FUNDED', 'ONE_STEP', 'TWO_STEP', 'INSTANT', 'CHALLENGE']
          : ['DEMO'];
      query = query.in('account_type', acceptedTypes);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    const activeList: BinaryTrade[] = [];
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const trade = mapFromSupabaseRow(row);
        if (trade.status === 'active') {
          activeList.push(trade);
        } else {
          // Trade expired while page was closed -> settle it in DB so it moves to history
          updateSupabaseTrade(trade, effectiveUserId).catch(() => {});
        }
      }
    }

    // Also include active 'OPEN' trades from `copy_executed_trades`
    try {
      const currentAccountType = activeAccount ? resolveSupabaseAccountType(activeAccount) : 'FUNDED';
      if (currentAccountType !== 'DEMO' && getIsCopyExecutedTradesTableAvailable()) {
        let { data: openCopyRows, error: openCopyErr } = await supabase
          .from('copy_executed_trades')
          .select('*')
          .eq('user_id', effectiveUserId)
          .in('status', ['OPEN', 'ACTIVE'])
          .order('created_at', { ascending: false });

        if (openCopyErr) {
          const text = `${openCopyErr.message || ''} ${openCopyErr.code || ''}`;
          if (openCopyErr.code === '42P01' || openCopyErr.code === 'PGRST204' || text.includes('does not exist') || text.includes('Could not find')) {
            setIsCopyExecutedTradesTableAvailable(false);
          } else {
            const fallbackRes = await supabase
              .from('copy_executed_trades')
              .select('*')
              .eq('copier_user_id', effectiveUserId)
              .in('status', ['OPEN', 'ACTIVE']);
            openCopyRows = fallbackRes.data;
            if (fallbackRes.error) {
              const fbText = `${fallbackRes.error.message || ''} ${fallbackRes.error.code || ''}`;
              if (fallbackRes.error.code === '42P01' || fallbackRes.error.code === 'PGRST204' || fbText.includes('does not exist')) {
                setIsCopyExecutedTradesTableAvailable(false);
              }
            }
          }
        }

        if (Array.isArray(openCopyRows) && openCopyRows.length > 0) {
          const seenIds = new Set(activeList.map((t) => ensureTradeUuid(t.id)));
          for (const cr of openCopyRows as any[]) {
            const trade = mapFromSupabaseRow({
              ...cr,
              user_id: cr.user_id || cr.copier_user_id || effectiveUserId,
              account_id: cr.account_id || cr.copier_account_id,
              account_type: currentAccountType,
            });
            const canonId = ensureTradeUuid(trade.id);
            if (trade.status === 'active' && !seenIds.has(canonId)) {
              seenIds.add(canonId);
              activeList.push(trade);
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return activeAccount ? filterTradesForActiveAccount(activeList, activeAccount) : activeList;
  } catch {
    return [];
  }
}

/**
 * Queries completed trade history (`status` in `['WIN', 'WON', 'LOSS', 'LOST', 'TIE']`) from Supabase `user_trades`.
 */
export async function fetchCompletedHistoryTradesFromSupabase(
  userId?: string | null,
  activeAccount?: any | null
): Promise<BinaryTrade[]> {
  const all = await fetchUserTrades(userId, activeAccount);
  const completed = all.filter(
    (t) => t.status === 'won' || t.status === 'lost' || t.status === 'tie'
  );
  return activeAccount ? filterTradesForActiveAccount(completed, activeAccount) : completed;
}

/**
 * Persists a new trade to Supabase `user_trades`.
 */
export async function createSupabaseTrade(
  trade: BinaryTrade,
  userId?: string | null
): Promise<boolean> {
  const effectiveUserId = await getEffectiveSupabaseUserId(userId);
  if (!effectiveUserId || !isValidUuid(effectiveUserId)) {
    console.warn('[SupabaseTradeSync] createSupabaseTrade: No valid authenticated UUID available');
    return false;
  }

  try {
    const payload: Record<string, any> = { ...mapToSupabaseRow(trade, effectiveUserId) };
    const startTime = Number(trade.startTime) || Date.now();
    const durationSeconds = Number(trade.durationSeconds) || 60;

    for (let attempt = 0; attempt < 6; attempt++) {
      const { error } = await supabase.from('user_trades').insert([payload]);
      if (!error) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bft-supabase-trade-synced', { detail: { type: 'INSERT', trade } }));
        }
        return true;
      }

      console.error(
        `[SupabaseTradeSync] Trade Insert Error (attempt ${attempt + 1}):`,
        JSON.stringify(error),
        'Payload:',
        payload
      );

      const missingCol = extractMissingTradeColumn(error);
      if (missingCol && missingCol in payload) {
        unsupportedTradeColumns.add(missingCol);
        delete payload[missingCol];
        continue;
      }

      const notNullCol = extractNotNullTradeColumn(error);
      if (notNullCol && !(notNullCol in payload)) {
        requiredTradeColumns.add(notNullCol);
        unsupportedTradeColumns.delete(notNullCol);
        if (notNullCol === 'symbol') {
          payload.symbol = trade.asset;
          continue;
        }
        if (notNullCol === 'asset_symbol') {
          payload.asset_symbol = trade.asset;
          continue;
        }
        if (notNullCol === 'expires_at') {
          payload.expires_at = new Date(startTime + durationSeconds * 1000).toISOString();
          continue;
        }
        if (notNullCol === 'payout_multiplier') {
          payload.payout_multiplier = Number((1 + Number(trade.payoutPercentage || 85) / 100).toFixed(4));
          continue;
        }
      }

      if (error.code === '22P02' || error.code === '23503') {
        if (payload.account_id !== null && payload.account_id !== undefined) {
          payload.account_id = null;
          continue;
        }
      }

      if (error.code === '23514') {
        const errMsg = String(error.message || '').toLowerCase();
        if (errMsg.includes('account_type') && payload.account_type !== 'DEMO') {
          payload.account_type =
            payload.account_type === 'SELF_FUNDED' ? 'REAL' : 'FUNDED';
          continue;
        }
      }

      break;
    }
  } catch (err: any) {
    console.error('[SupabaseTradeSync] Exception in createSupabaseTrade:', err);
  }
  return false;
}

/**
 * Updates an existing trade in Supabase (e.g., when it expires/settles).
 */
export async function updateSupabaseTrade(
  trade: BinaryTrade,
  userId?: string | null
): Promise<boolean> {
  const effectiveUserId = await getEffectiveSupabaseUserId(userId);
  if (!effectiveUserId || !isValidUuid(effectiveUserId)) return false;

  try {
    const row = mapToSupabaseRow(trade, effectiveUserId);
    const payoutAmount =
      trade.status === 'won'
        ? Number((Number(trade.investment) * (1 + Number(trade.payoutPercentage || 85) / 100)).toFixed(2))
        : trade.status === 'tie'
        ? Number(trade.investment)
        : 0;

    const updatePayload: Record<string, any> = {
      status: row.status,
    };

    if (!unsupportedTradeColumns.has('exit_price')) {
      updatePayload.exit_price = Number(trade.closePrice ?? trade.currentPrice ?? trade.strikePrice);
    }
    if (!unsupportedTradeColumns.has('payout')) {
      updatePayload.payout = payoutAmount;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase
        .from('user_trades')
        .update(updatePayload)
        .eq('id', row.id)
        .eq('user_id', effectiveUserId);

      if (!error) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bft-supabase-trade-synced', { detail: { type: 'UPDATE', trade } }));
        }
        return true;
      }

      console.error(
        `[SupabaseTradeSync] Trade Update Error (attempt ${attempt + 1}):`,
        JSON.stringify(error),
        'UpdatePayload:',
        updatePayload
      );

      const missingCol = extractMissingTradeColumn(error);
      if (missingCol && missingCol in updatePayload) {
        unsupportedTradeColumns.add(missingCol);
        delete updatePayload[missingCol];
        continue;
      }

      if (error.code === '23514') {
        if (updatePayload.status === 'WIN') {
          updatePayload.status = 'WON';
          continue;
        }
        if (updatePayload.status === 'LOSS') {
          updatePayload.status = 'LOST';
          continue;
        }
      }

      break;
    }
  } catch (err: any) {
    console.error('[SupabaseTradeSync] Exception in updateSupabaseTrade:', err);
  }
  return false;
}

/**
 * Subscribes to Supabase Realtime `postgres_changes` on `public.user_trades` for the user,
 * paired with local custom event sync and a background REST poll fallback so trades update
 * instantaneously without requiring a page refresh.
 */
export function subscribeUserTrades(userId: string, callback: (payload: any) => void) {
  let active = true;
  let realtimeChannel: any = null;

  // 1. Set up Supabase Realtime postgres_changes subscription on `user_trades`
  if (typeof window !== 'undefined') {
    getEffectiveSupabaseUserId(userId)
      .then((effectiveUserId) => {
        if (!active || !effectiveUserId || !isValidUuid(effectiveUserId)) return;
        try {
          realtimeChannel = supabase
            .channel(`bft_user_trades_${effectiveUserId}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_trades',
                filter: `user_id=eq.${effectiveUserId}`,
              },
              (payload: any) => {
                if (!active) return;
                callback({
                  eventType: 'UPDATE',
                  new: payload.new,
                  old: payload.old,
                });
              }
            )
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'user_trades',
                filter: `user_id=eq.${effectiveUserId}`,
              },
              (payload: any) => {
                if (!active) return;
                callback({
                  eventType: 'INSERT',
                  new: payload.new,
                  old: payload.old,
                });
              }
            )
            .on(
              'postgres_changes',
              {
                event: 'DELETE',
                schema: 'public',
                table: 'user_trades',
                filter: `user_id=eq.${effectiveUserId}`,
              },
              (payload: any) => {
                if (!active) return;
                callback({
                  eventType: 'DELETE',
                  new: payload.new,
                  old: payload.old,
                });
              }
            )
            .subscribe();
        } catch {
          // Ignore Realtime WebSocket error if blocked by network; REST polling & local events will handle sync
        }
      })
      .catch(() => {});
  }

  // 2. Listen to immediate local Supabase trade sync events in the same browser window
  const handleLocalTradeSync = (e: Event) => {
    if (!active) return;
    const detail = (e as CustomEvent)?.detail;
    if (detail?.trade) {
      callback({
        eventType: detail.type || 'UPDATE',
        trades: [detail.trade],
        new: mapToSupabaseRow(detail.trade, userId),
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('bft-supabase-trade-synced', handleLocalTradeSync);
  }

  // 3. Periodic REST poll fallback
  const pollInterval =
    typeof window !== 'undefined'
      ? window.setInterval(async () => {
          if (!active) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
          const trades = await fetchUserTrades(userId);
          if (!active || trades.length === 0) return;
          callback({ eventType: 'SYNC', trades });
        }, 8000)
      : null;

  return {
    unsubscribe: () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('bft-supabase-trade-synced', handleLocalTradeSync);
      }
      if (pollInterval !== null && typeof window !== 'undefined') {
        window.clearInterval(pollInterval);
      }
      if (realtimeChannel) {
        try {
          supabase.removeChannel(realtimeChannel);
        } catch {
          try {
            realtimeChannel.unsubscribe();
          } catch {}
        }
      }
    },
  };
}

/**
 * Normalizes an asset symbol (e.g., 'EUR/USD (OTC)' -> 'EURUSD') so active trades
 * match their respective asset tabs regardless of formatting or (OTC) suffix.
 */
export function normalizeTradeAssetKey(symbol?: string | null): string {
  if (!symbol) return '';
  return String(symbol)
    .replace(/\s*\(OTC\)/gi, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .trim();
}

/**
 * Checks whether a trade record is currently active/open (`status === 'active'` or `status === 'OPEN'`).
 */
export function isTradeActiveOrOpen(trade?: BinaryTrade | Record<string, any> | null): boolean {
  if (!trade) return false;
  const st = String(trade.status || '').toUpperCase().trim();
  return st === 'ACTIVE' || st === 'OPEN';
}

/**
 * Filters and returns all currently running/active trades matching `assetSymbol`.
 */
export function getActiveTradesForAsset(
  assetSymbol: string,
  trades: BinaryTrade[] | undefined | null
): BinaryTrade[] {
  if (!assetSymbol || !Array.isArray(trades) || trades.length === 0) return [];
  const targetKey = normalizeTradeAssetKey(assetSymbol);
  if (!targetKey) return [];

  return trades.filter((t) => {
    if (!isTradeActiveOrOpen(t)) return false;
    const tradeAsset = (t as any).asset_symbol || t.asset || (t as any).symbol || '';
    return normalizeTradeAssetKey(tradeAsset) === targetKey;
  });
}

export interface AssetActiveTradeBadgeInfo {
  hasActiveTrades: boolean;
  activeCount: number;
  totalInvestment: number;
  netFloatingPnL: number;
  isWinning: boolean;
  nearestRemainingSeconds: number;
  formattedPnL: string;
}

/**
 * Computes Quotex-style active trade badge metrics for an asset tab/card:
 * - active trade count
 * - live mark-to-market profit/loss counter
 * - nearest remaining expiry countdown in seconds
 */
export function computeAssetActiveTradeBadge(
  assetSymbol: string,
  trades: BinaryTrade[] | undefined | null,
  currentAssetPrice: number,
  nowMs: number = Date.now()
): AssetActiveTradeBadgeInfo {
  const matched = getActiveTradesForAsset(assetSymbol, trades);
  if (matched.length === 0) {
    return {
      hasActiveTrades: false,
      activeCount: 0,
      totalInvestment: 0,
      netFloatingPnL: 0,
      isWinning: false,
      nearestRemainingSeconds: 0,
      formattedPnL: '$0.00',
    };
  }

  let totalInvestment = 0;
  let netFloatingPnL = 0;
  let nearestRemainingSeconds = Infinity;

  for (const t of matched) {
    const stake = Number(t.investment ?? (t as any).amount ?? 0);
    const strike = Number(t.strikePrice ?? (t as any).entry_price ?? currentAssetPrice);
    const payoutPct = Number(t.payoutPercentage ?? 85);
    const dir = String(t.direction || (t as any).trade_type || 'CALL').toUpperCase();
    const livePrice =
      Number.isFinite(currentAssetPrice) && currentAssetPrice > 0 ? currentAssetPrice : strike;

    totalInvestment += stake;

    const isCall = dir === 'CALL';
    if ((isCall && livePrice > strike) || (!isCall && livePrice < strike)) {
      netFloatingPnL += stake * (payoutPct / 100);
    } else if ((isCall && livePrice < strike) || (!isCall && livePrice > strike)) {
      netFloatingPnL -= stake;
    }

    const endMs =
      Number(t.endTime) ||
      Number(t.startTime || nowMs) + Number(t.durationSeconds || 60) * 1000;
    const remSec = Math.max(0, Math.ceil((endMs - nowMs) / 1000));
    if (remSec < nearestRemainingSeconds) {
      nearestRemainingSeconds = remSec;
    }
  }

  const roundedPnL = Number(netFloatingPnL.toFixed(2));
  const isWinning = roundedPnL >= 0;
  const formattedPnL =
    roundedPnL > 0
      ? `+$${roundedPnL.toFixed(2)}`
      : roundedPnL < 0
      ? `-$${Math.abs(roundedPnL).toFixed(2)}`
      : '$0.00';

  return {
    hasActiveTrades: true,
    activeCount: matched.length,
    totalInvestment: Number(totalInvestment.toFixed(2)),
    netFloatingPnL: roundedPnL,
    isWinning,
    nearestRemainingSeconds: Number.isFinite(nearestRemainingSeconds)
      ? nearestRemainingSeconds
      : 0,
    formattedPnL,
  };
}

export interface UserTradingSummaryMetrics {
  totalTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  totalCompletedTrades: number;
  winRatePercent: number;
  formattedWinRate: string;
  totalNetProfitLoss: number;
  formattedNetProfitLoss: string;
  totalVolumeTraded: number;
  formattedVolumeTraded: string;
  hasActiveTradesData?: boolean;
}

/**
 * Strict Conditional Account Filter:
 * Evaluates whether an account is eligible to contribute to live trading statistics.
 * Rules:
 * 1. Must not be a Demo account.
 * 2. If a live account has a balance of 0 (unfunded/empty) or zero completed trades, its metrics
 *    must NOT corrupt the overall summary.
 * 3. Overall summary stats should only calculate data from accounts that actually have active funds
 *    (balance > 0) AND active trade histories (completed trades > 0).
 */
export function isAccountEligibleForTradingSummary(
  account: any,
  trades: Array<BinaryTrade | Record<string, any>> = []
): boolean {
  if (!account || typeof account !== 'object') return false;
  if (resolveSupabaseAccountType(account) === 'DEMO') return false;

  const currentBalance = Number(account.currentBalance ?? account.equity ?? 0);
  if (currentBalance <= 0) return false; // Strict conditional check: balance of 0 is excluded

  // Count completed trades belonging to this account
  const accountTrades = trades.filter((t: any) => {
    if (t.accountId) return t.accountId === account.id;
    const tTier = String(t.accountTier || t.accountType || '').toLowerCase();
    const aTier = String(account.tier || account.accountType || '').toLowerCase();
    return tTier.length > 0 && tTier === aTier;
  });

  const completedTradesCount = accountTrades.filter((t: any) => {
    const s = String(t.status || '').toUpperCase();
    return s === 'WON' || s === 'WIN' || s === 'LOST' || s === 'LOSS' || s === 'TIE';
  }).length;

  // Strict conditional check: zero completed trades excluded
  if (completedTradesCount === 0 && (!account.tradesCount || account.tradesCount <= 0)) {
    return false;
  }

  return true;
}

/**
 * Filters a raw list of trades strictly to those belonging to eligible funded live accounts
 * with completed trade histories.
 */
export function filterTradesFromEligibleAccounts(
  trades: Array<BinaryTrade | Record<string, any>> = [],
  accounts: Array<any> = []
): Array<BinaryTrade | Record<string, any>> {
  if (!Array.isArray(trades) || trades.length === 0) return [];
  if (!Array.isArray(accounts) || accounts.length === 0) return trades;

  const eligibleAccountIds = new Set<string>();
  for (const acc of accounts) {
    if (isAccountEligibleForTradingSummary(acc, trades)) {
      eligibleAccountIds.add(acc.id);
    }
  }

  if (eligibleAccountIds.size === 0) {
    return [];
  }

  return trades.filter((t: any) => t.accountId && eligibleAccountIds.has(t.accountId));
}

/**
 * Dynamically computes the user's real trading statistics from Supabase `user_trades` records:
 * - Total Trades Count
 * - Win Rate (%) = (Winning Trades / Total Completed Trades) * 100
 * - Total Net Profit/Loss ($)
 * - Total Volume Traded ($)
 * When the user has no trade history yet, returns `$0.00` and `0%` (or `N/A`) accurately.
 */
export function computeUserTradingSummary(
  trades: Array<BinaryTrade | Record<string, any>> | undefined | null,
  accounts?: Array<any> | null
): UserTradingSummaryMetrics {
  // If accounts list is provided, strictly filter trades to eligible funded live accounts
  if (Array.isArray(accounts) && accounts.length > 0) {
    trades = filterTradesFromEligibleAccounts(trades || [], accounts);
  }

  if (!Array.isArray(trades) || trades.length === 0) {
    return {
      totalTradesCount: 0,
      winningTradesCount: 0,
      losingTradesCount: 0,
      totalCompletedTrades: 0,
      winRatePercent: 0,
      formattedWinRate: accounts !== undefined ? 'N/A' : '0%',
      totalNetProfitLoss: 0,
      formattedNetProfitLoss: '$0.00',
      totalVolumeTraded: 0,
      formattedVolumeTraded: '$0.00',
      hasActiveTradesData: false,
    };
  }

  let totalTradesCount = 0;
  let winningTradesCount = 0;
  let losingTradesCount = 0;
  let tieTradesCount = 0;
  let netProfitLoss = 0;
  let totalVolume = 0;

  for (const rawTrade of trades) {
    if (!rawTrade || typeof rawTrade !== 'object') continue;
    totalTradesCount += 1;

    const stake = Math.max(0, Number((rawTrade as any).investment ?? (rawTrade as any).amount ?? 0) || 0);
    totalVolume += stake;

    const rawStatus = String((rawTrade as any).status || '')
      .toUpperCase()
      .trim();

    const isWin = rawStatus === 'WON' || rawStatus === 'WIN';
    const isLoss = rawStatus === 'LOST' || rawStatus === 'LOSS';
    const isTie = rawStatus === 'TIE';

    if (isWin) {
      winningTradesCount += 1;
      const explicitPnl = (rawTrade as any).pnl;
      if (typeof explicitPnl === 'number' && Number.isFinite(explicitPnl)) {
        netProfitLoss += explicitPnl;
      } else {
        const payoutPct = Number((rawTrade as any).payoutPercentage ?? 85) || 85;
        const potential = Number((rawTrade as any).potentialPayout ?? (stake * payoutPct) / 100) || 0;
        netProfitLoss += potential;
      }
    } else if (isLoss) {
      losingTradesCount += 1;
      const explicitPnl = (rawTrade as any).pnl;
      if (typeof explicitPnl === 'number' && Number.isFinite(explicitPnl) && explicitPnl < 0) {
        netProfitLoss += explicitPnl;
      } else {
        netProfitLoss -= stake;
      }
    } else if (isTie) {
      tieTradesCount += 1;
    }
  }

  const totalCompletedTrades = winningTradesCount + losingTradesCount + tieTradesCount;
  const rawWinRate =
    totalCompletedTrades > 0 ? (winningTradesCount / totalCompletedTrades) * 100 : 0;
  const winRatePercent = Number(rawWinRate.toFixed(1));
  const formattedWinRate =
    totalCompletedTrades === 0
      ? (accounts !== undefined ? 'N/A' : '0%')
      : Number.isInteger(winRatePercent)
      ? `${winRatePercent}%`
      : `${winRatePercent.toFixed(1)}%`;

  const totalNetProfitLoss = Number(netProfitLoss.toFixed(2));
  const formattedNetProfitLoss =
    totalTradesCount === 0 || totalNetProfitLoss === 0
      ? '$0.00'
      : totalNetProfitLoss > 0
      ? `+$${totalNetProfitLoss.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : `-$${Math.abs(totalNetProfitLoss).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

  const totalVolumeTraded = Number(totalVolume.toFixed(2));
  const formattedVolumeTraded = `$${totalVolumeTraded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return {
    totalTradesCount,
    winningTradesCount,
    losingTradesCount,
    totalCompletedTrades,
    winRatePercent,
    formattedWinRate,
    totalNetProfitLoss,
    formattedNetProfitLoss,
    totalVolumeTraded,
    formattedVolumeTraded,
    hasActiveTradesData: totalTradesCount > 0,
  };
}


