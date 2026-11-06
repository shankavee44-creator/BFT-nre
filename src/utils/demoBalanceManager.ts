/**
 * Demo Balance Manager & Quotex Account Switcher Utilities
 * Handles validation, formatting, 8-digit numeric Trader IDs, and Supabase persistence.
 */

import { commitProfileBalanceToSupabase, recordDirectBalanceCommit } from './supabaseRealtimeSync';
import { UserProfile, TradingAccount } from '../types';

export const MIN_DEMO_BALANCE = 1;
export const MAX_DEMO_BALANCE = 10000;

export const DEMO_BALANCE_LIMITS = {
  min: MIN_DEMO_BALANCE,
  max: MAX_DEMO_BALANCE,
};

export interface ValidationResult {
  valid: boolean;
  isValid: boolean;
  normalized: number;
  normalizedBalance: number;
  error?: string;
}

/**
 * Validates and normalizes custom demo account balance strictly between $1.00 and $10,000.00.
 */
export function validateDemoBalance(rawInput: number | string): ValidationResult {
  const parsed = typeof rawInput === 'number' ? rawInput : parseFloat(String(rawInput).replace(/[^0-9.]/g, ''));

  if (isNaN(parsed) || !isFinite(parsed)) {
    return {
      valid: false,
      isValid: false,
      normalized: 10000,
      normalizedBalance: 10000,
      error: 'Please enter a valid numeric balance.',
    };
  }

  if (parsed < MIN_DEMO_BALANCE) {
    return {
      valid: false,
      isValid: false,
      normalized: MIN_DEMO_BALANCE,
      normalizedBalance: MIN_DEMO_BALANCE,
      error: `Minimum demo balance allowed is $${MIN_DEMO_BALANCE.toFixed(2)}.`,
    };
  }

  if (parsed > MAX_DEMO_BALANCE) {
    return {
      valid: false,
      isValid: false,
      normalized: MAX_DEMO_BALANCE,
      normalizedBalance: MAX_DEMO_BALANCE,
      error: `Maximum demo balance allowed is $${MAX_DEMO_BALANCE.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
    };
  }

  // Rounded to 2 decimal places
  const normalized = Math.round(parsed * 100) / 100;
  return {
    valid: true,
    isValid: true,
    normalized: normalized,
    normalizedBalance: normalized,
  };
}

import { resolveUserNumericId } from './p2pTransfer';

/**
 * Computes a stable, 8-digit numeric trader ID from user profile, user id, or email.
 * Synchronizes with resolveUserNumericId to guarantee the ID displayed in the profile menu
 * matches the numeric_id used in P2P transfers and the user dashboard.
 */
export function getNumericTraderId(
  userIdentifier: string | Partial<UserProfile> | undefined | null
): string {
  if (!userIdentifier) return '90259973';

  if (typeof userIdentifier === 'object') {
    return resolveUserNumericId(userIdentifier);
  }

  // If already a clean numeric string, return it directly
  const digits = String(userIdentifier).trim().replace(/^#/, '');
  if (/^\d{5,10}$/.test(digits)) {
    return digits;
  }

  return resolveUserNumericId(null, {
    numeric_id: userIdentifier,
    email: userIdentifier,
    id: userIdentifier,
  });
}

/**
 * Formats account balance with currency and privacy toggle support.
 */
export function formatAccountBalance(
  balance: number,
  currencyOrHide?: string | boolean,
  maybeHide?: boolean
): string {
  const isHidden = typeof currencyOrHide === 'boolean' ? currencyOrHide : (maybeHide ?? false);
  const currencySymbol = typeof currencyOrHide === 'string' && currencyOrHide === 'EUR' ? '€' : '$';

  if (isHidden) {
    return '••••••';
  }
  return currencySymbol + balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface PersistDemoBalanceParams {
  userId?: string;
  userEmail?: string;
  newBalance: number;
}

/**
 * Persists custom demo balance to Supabase `profiles.demo_balance`, local state, and API fallback.
 */
export async function persistCustomDemoBalance(params: PersistDemoBalanceParams): Promise<{ success: boolean; balance: number; error?: string }> {
  const validation = validateDemoBalance(params.newBalance);
  if (!validation.isValid) {
    return { success: false, balance: validation.normalizedBalance, error: validation.error };
  }

  const normalized = validation.normalizedBalance;

  // 1. Save to local storage for immediate zero-latency feedback
  try {
    localStorage.setItem('bft_custom_demo_balance', String(normalized));
    const cachedProfile = localStorage.getItem('bft_user_profile');
    if (cachedProfile) {
      const parsed = JSON.parse(cachedProfile);
      parsed.demoBalance = normalized;
      localStorage.setItem('bft_user_profile', JSON.stringify(parsed));
    }
  } catch (err) {
    console.warn('[DemoBalanceManager] LocalStorage update warning:', err);
  }

  // 2. Direct Supabase client-side update on profiles table under demo_balance
  try {
    recordDirectBalanceCommit('demo_balance', normalized);
    await commitProfileBalanceToSupabase({
      userId: params.userId,
      userEmail: params.userEmail,
      column: 'demo_balance',
      newBalance: normalized,
    });
  } catch (err) {
    console.warn('[DemoBalanceManager] Supabase direct update non-blocking error:', err);
  }

  return { success: true, balance: normalized };
}
