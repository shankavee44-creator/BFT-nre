import { supabase } from './supabase';
import { BinaryTrade, BinaryOptionDirection } from '../types';

/**
 * Maps a BinaryTrade object to a Supabase user_trades row.
 * Schema based on supabase_setup.sql:
 * - id: UUID
 * - user_id: UUID
 * - symbol: TEXT
 * - trade_type: TEXT ('CALL', 'PUT', 'HIGHER', 'LOWER')
 * - amount: NUMERIC
 * - entry_price: NUMERIC
 * - exit_price: NUMERIC
 * - payout_multiplier: NUMERIC (e.g. 1.82 for 82% payout)
 * - status: TEXT ('OPEN', 'WON', 'LOST', 'TIE')
 * - created_at: TIMESTAMPTZ
 * - expires_at: TIMESTAMPTZ
 */
function mapToSupabaseRow(trade: BinaryTrade, userId: string): any {
  return {
    id: trade.id,
    user_id: userId,
    symbol: trade.asset,
    trade_type: trade.direction,
    amount: trade.investment,
    entry_price: trade.strikePrice,
    exit_price: trade.closePrice,
    payout_multiplier: 1 + (trade.payoutPercentage / 100),
    status: trade.status === 'active' ? 'OPEN' : trade.status.toUpperCase(),
    created_at: new Date(trade.startTime).toISOString(),
    expires_at: new Date(trade.endTime).toISOString(),
  };
}

/**
 * Maps a Supabase user_trades row back to a BinaryTrade object.
 */
export function mapFromSupabaseRow(row: any): BinaryTrade {
  const payoutPercentage = Math.round((Number(row.payout_multiplier) - 1) * 100);
  
  return {
    id: row.id,
    accountId: 'BFT-LIVE-DB', // Placeholder since DB row doesn't store account_id explicitly in this schema
    asset: row.symbol,
    direction: row.trade_type as BinaryOptionDirection,
    strikePrice: Number(row.entry_price),
    currentPrice: Number(row.exit_price || row.entry_price),
    closePrice: row.exit_price ? Number(row.exit_price) : undefined,
    investment: Number(row.amount),
    payoutPercentage,
    potentialPayout: Number(row.amount) * (payoutPercentage / 100),
    startTime: new Date(row.created_at).getTime(),
    durationSeconds: Math.round((new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 1000),
    endTime: new Date(row.expires_at).getTime(),
    status: row.status === 'OPEN' ? 'active' : row.status.toLowerCase() as 'won' | 'lost',
    pnl: row.status === 'WON' 
      ? Number(row.amount) * (payoutPercentage / 100) 
      : (row.status === 'LOST' ? -Number(row.amount) : 0),
  };
}

/**
 * Fetches all trades for a specific user from Supabase.
 */
export async function fetchUserTrades(userId: string): Promise<BinaryTrade[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('user_trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data) return [];

    return data.map(mapFromSupabaseRow);
  } catch (err) {
    console.error('Error fetching user trades from Supabase:', err);
    return [];
  }
}

/**
 * Persists a new trade to Supabase.
 */
export async function createSupabaseTrade(trade: BinaryTrade, userId: string): Promise<void> {
  if (!userId) return;
  try {
    const row = mapToSupabaseRow(trade, userId);
    const { error } = await supabase.from('user_trades').insert(row);
    if (error) throw error;
  } catch (err) {
    console.error('Error creating trade in Supabase:', err);
  }
}

/**
 * Updates an existing trade in Supabase (e.g., when it closes).
 */
export async function updateSupabaseTrade(trade: BinaryTrade, userId: string): Promise<void> {
  if (!userId) return;
  try {
    const row = mapToSupabaseRow(trade, userId);
    const { error } = await supabase
      .from('user_trades')
      .update({
        exit_price: row.exit_price,
        status: row.status,
        settled_at: new Date().toISOString()
      })
      .eq('id', trade.id)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('Error updating trade in Supabase:', err);
  }
}

/**
 * Subscribes to realtime updates for user trades.
 */
export function subscribeUserTrades(userId: string, callback: (payload: any) => void) {
  if (!userId) return null;
  
  return supabase
    .channel(`user-trades-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_trades',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
}
