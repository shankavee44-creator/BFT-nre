/**
 * Demo Balance Manager & Quotex Account Switcher Utilities
 * Handles validation, formatting, 8-digit numeric Trader IDs, and Supabase persistence.
 */

import { supabase } from './supabase';
import { UserProfile, TradingAccount } from '../types';

export const MIN_DEMO_BALANCE = 1;
export const MAX_DEMO_BALANCE = 10000;

export interface ValidationResult {
  isValid: boolean;
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
      isValid: false,
      normalizedBalance: 10000,
      error: 'Please enter a valid numeric balance.',
    };
  }

  if (parsed < MIN_DEMO_BALANCE) {
    return {
      isValid: false,
      normalizedBalance: MIN_DEMO_BALANCE,
      error: `Minimum demo balance allowed is $${MIN_DEMO_BALANCE.toFixed(2)}.`,
    };
  }

  if (parsed > MAX_DEMO_BALANCE) {
    return {
      isValid: false,
      normalizedBalance: MAX_DEMO_BALANCE,
      error: `Maximum demo balance allowed is $${MAX_DEMO_BALANCE.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
    };
  }

  // Rounded to 2 decimal places
  const normalized = Math.round(parsed * 100) / 100;
  return {
    isValid: true,
    normalizedBalance: normalized,
  };
}

/**
 * Computes a stable, 8-digit numeric trader ID from user id or email (e.g., 90259973).
 */
export function getNumericTraderId(userIdentifier: string | undefined | null): string {
  if (!userIdentifier) return '90259973';
  
  let hash = 0;
  for (let i = 0; i < userIdentifier.length; i++) {
    hash = (hash << 5) - hash + userIdentifier.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  
  const positive = Math.abs(hash);
  const eightDigits = (positive % 90000000) + 10000000;
  return String(eightDigits);
}

/**
 * Formats account balance with privacy toggle support.
 */
export function formatAccountBalance(balance: number, hideBalance: boolean = false): string {
  if (hideBalance) {
    return '••••••';
  }
  return '$' + balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    if (params.userId) {
      await supabase
        .from('profiles')
        .update({ demo_balance: normalized })
        .eq('id', params.userId);
    } else if (params.userEmail) {
      await supabase
        .from('profiles')
        .update({ demo_balance: normalized })
        .eq('email', params.userEmail);
    }
  } catch (err) {
    console.warn('[DemoBalanceManager] Supabase direct update non-blocking error:', err);
  }

  // 3. Server-side persistence route (/api/profile/demo-balance)
  try {
    const res = await fetch('/api/profile/demo-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.userId,
        email: params.userEmail,
        demoBalance: normalized,
      }),
    });
    if (!res.ok) {
      console.warn('[DemoBalanceManager] Server route responded with status:', res.status);
    }
  } catch (err) {
    // Non-blocking if offline/mock
  }

  return { success: true, balance: normalized };
}
