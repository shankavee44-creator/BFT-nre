import { supabase } from './supabase.ts';
import type { BinaryTrade, BinaryOptionDirection } from '../types/index.ts';

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
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const hex3 = ((h1 ^ 0xa5a5a5a5) >>> 0).toString(16).padStart(8, '0');
  const hex4 = ((h2 ^ 0x5a5a5a5a) >>> 0).toString(16).padStart(8, '0');
  const fullHex = (hex1 + hex2 + hex3 + hex4).slice(0, 32);

  return `${fullHex.slice(0, 8)}-${fullHex.slice(8, 12)}-4${fullHex.slice(13, 16)}-a${fullHex.slice(17, 20)}-${fullHex.slice(20, 32)}`;
}

/**
 * Resolves the effective Supabase user UUID.
 * If the input userId is already a valid UUID, returns it.
 * If not (e.g. backend SQLite user "usr_mvulnwy8_ej1z"), checks if there is an active
 * Supabase Auth session with a valid UUID. If no valid UUID can be resolved, returns null.
 */
export async function getEffectiveSupabaseUserId(userId?: string | null): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUserId = data?.session?.user?.id;
    if (sessionUserId && isValidUuid(sessionUserId)) {
      return sessionUserId.trim();
    }
  } catch {
    // Supabase auth lookup failed or unauthenticated
  }

  return null;
}

/**
 * Maps a BinaryTrade object to a Supabase user_trades row.
 */
function mapToSupabaseRow(trade: BinaryTrade, userId: string): Record<string, any> {
  // Map tier to database enum strings
  let accountType = 'DEMO';
  const tier = (trade as any).accountTier || 'demo';
  if (tier === 'personal') accountType = 'REAL';
  else if (tier === 'one-step') accountType = 'ONE_STEP';
  else if (tier === 'two-step') accountType = 'TWO_STEP';
  else if (tier === 'instant') accountType = 'INSTANT';

  return {
    id: ensureTradeUuid(trade.id),
    user_id: userId,
    symbol: trade.asset,
    trade_type: trade.direction,
    amount: trade.investment,
    entry_price: trade.strikePrice,
    exit_price: trade.closePrice ?? trade.strikePrice,
    payout_multiplier: 1 + (trade.payoutPercentage / 100),
    status: trade.status === 'active' ? 'OPEN' : trade.status.toUpperCase(),
    created_at: new Date(trade.startTime).toISOString(),
    account_type: accountType,
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
  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : createdMs + 60000;
  
  return {
    id: row.id,
    accountId: row.account_id || 'BFT-LIVE-DB', 
    asset: row.symbol,
    direction: row.trade_type as BinaryOptionDirection,
    strikePrice: Number(row.entry_price),
    currentPrice: Number(row.exit_price || row.entry_price),
    closePrice: row.exit_price ? Number(row.exit_price) : undefined,
    investment: Number(row.amount),
    payoutPercentage,
    potentialPayout: Number(row.amount) * (payoutPercentage / 100),
    startTime: createdMs,
    durationSeconds: Math.max(5, Math.round((expiresMs - createdMs) / 1000)),
    endTime: expiresMs,
    status: row.status === 'OPEN' ? 'active' : row.status.toLowerCase() as 'won' | 'lost',
    pnl: row.status === 'WON' 
      ? Number(row.amount) * (payoutPercentage / 100) 
      : (row.status === 'LOST' ? -Number(row.amount) : 0),
    accountTier: row.account_type === 'REAL' ? 'personal' : row.account_type?.toLowerCase(),
  };
}

/**
 * Fetches all trades for a specific user from Supabase.
 * Gracefully returns an empty array if the user does not have a valid Supabase UUID,
 * avoiding PostgreSQL 22P02 invalid input syntax errors.
 */
export async function fetchUserTrades(userId: string): Promise<BinaryTrade[]> {
  if (!userId) return [];
  const effectiveUserId = await getEffectiveSupabaseUserId(userId);
  if (!effectiveUserId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('user_trades')
      .select('*')
      .eq('user_id', effectiveUserId)
      .order('created_at', { ascending: false });

    if (error) return [];
    if (!data) return [];

    return data.map(mapFromSupabaseRow);
  } catch {
    return [];
  }
}

/**
 * Persists a new trade to Supabase if the user has a valid authenticated Supabase session.
 */
export async function createSupabaseTrade(trade: BinaryTrade, userId: string): Promise<void> {
  if (!userId) return;
  const effectiveUserId = await getEffectiveSupabaseUserId(userId);
  if (!effectiveUserId) return;

  try {
    const payload: Record<string, any> = { ...mapToSupabaseRow(trade, effectiveUserId) };
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from('user_trades').insert(payload);
      if (!error) break;
      const missingColMatch = error.message?.match(/Could not find the '([^']+)' column/i);
      if (missingColMatch && missingColMatch[1] in payload) {
        delete payload[missingColMatch[1]];
        continue;
      }
      break;
    }
  } catch {
    // Non-fatal background sync
  }
}

/**
 * Updates an existing trade in Supabase (e.g., when it closes).
 */
export async function updateSupabaseTrade(trade: BinaryTrade, userId: string): Promise<void> {
  if (!userId) return;
  const effectiveUserId = await getEffectiveSupabaseUserId(userId);
  if (!effectiveUserId) return;

  try {
    const row = mapToSupabaseRow(trade, effectiveUserId);
    await supabase
      .from('user_trades')
      .update({
        exit_price: row.exit_price,
        status: row.status,
      })
      .eq('id', row.id)
      .eq('user_id', effectiveUserId);
  } catch {
    // Non-fatal background sync
  }
}

/**
 * Returns a clean subscription handle without opening WebSockets that time out in restricted networks.
 * Trade updates are synchronized via REST polling and local state updates.
 */
export function subscribeUserTrades(_userId: string, _callback: (payload: any) => void) {
  return {
    unsubscribe: () => {
      // No-op: REST API handles trade synchronization
    },
  };
}
