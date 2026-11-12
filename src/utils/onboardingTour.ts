import { supabase } from './supabase.ts';
import type { UserProfile } from '../types/index.ts';

export type OnboardingStepId =
  | 'welcome'
  | 'terminal'
  | 'leaderboard'
  | 'deposits'
  | 'copy_trading'
  | 'security_kyc';

export interface OnboardingTourStep {
  stepNumber: number;
  id: OnboardingStepId;
  kicker: string;
  title: string;
  description: string;
  highlights: string[];
  targetSelectors: string[];
  recommendedTab?: 'dashboard' | 'terminal' | 'home';
  dashboardSubTab?: 'accounts' | 'kyc' | 'security';
}

export const ONBOARDING_TOUR_STEPS: OnboardingTourStep[] = [
  {
    stepNumber: 1,
    id: 'welcome',
    kicker: 'Step 1 of 6 · Platform Introduction',
    title: 'Welcome to Binary Funded Trader',
    description:
      'Binary Funded Trader (BFT) is an institutional binary options prop firm and personal trading ecosystem. Trade Funded Evaluation Challenges up to $100,000 or fund your own Personal Live account with up to 97% contract payouts.',
    highlights: [
      'Choose between 1-Step, 2-Step, and Instant Funded prop challenges',
      'Keep up to 80%–90% profit split on funded accounts with fast crypto payouts',
      'Trade 260+ Forex, Crypto, Commodities, and OTC pairs 24/7',
    ],
    targetSelectors: [
      '[data-testid="header-brand-lockup"]',
      '[data-testid="dashboard-trades-summary-card"]',
    ],
    recommendedTab: 'dashboard',
    dashboardSubTab: 'accounts',
  },
  {
    stepNumber: 2,
    id: 'terminal',
    kicker: 'Step 2 of 6 · Execution Engine',
    title: 'Exploring the Live & Demo Trading Terminal',
    description:
      'Launch the high-speed Trading Terminal to analyze live multi-timeframe charts, apply technical indicators, and switch effortlessly between your $10,000 Demo Practice balance and Live accounts.',
    highlights: [
      'Instant 1-click CALL (Higher) and PUT (Lower) trade execution',
      'Switch between $10,000 Demo Practice, Self-Funded Live, and Prop Challenge accounts',
      'Custom expiry timers from 5 seconds to 4 hours with real-time P&L tracking',
    ],
    targetSelectors: [
      '[data-testid="nav-terminal-btn"]',
      '[data-testid="mobile-header-nav-select"]',
    ],
    recommendedTab: 'dashboard',
  },
  {
    stepNumber: 3,
    id: 'leaderboard',
    kicker: 'Step 3 of 6 · Global Rankings',
    title: 'Checking the Leaderboard (Funded vs Self-Funded)',
    description:
      'Track the Top 15 highest-performing traders globally across two dedicated tiers: Funded (Past Week Best) for weekly prop-firm elites and Self-Funded (Daily Active) for live intraday traders.',
    highlights: [
      'Funded Tab: Weekly snapshot of the Top 15 verified prop-firm traders',
      'Self-Funded Tab: Dynamic daily leaderboard updating live as traders profit',
      'Dedicated "Your Position" card displays your personal rank and net profit',
    ],
    targetSelectors: [
      '[data-testid="header-leaderboard-btn"]',
      '[data-testid="desktop-leaderboard-btn"]',
      '[data-testid="mobile-header-leaderboard-btn"]',
    ],
    recommendedTab: 'dashboard',
  },
  {
    stepNumber: 4,
    id: 'deposits',
    kicker: 'Step 4 of 6 · Instant Crypto Funding',
    title: 'Making Deposits via NOWPayments',
    description:
      'Fund your Self-Funded Personal Live account or purchase prop evaluation packages seamlessly using our integrated NOWPayments cryptocurrency gateway.',
    highlights: [
      'Instant USDT (TRC-20), BTC, ETH, and multi-chain crypto deposits via NOWPayments',
      '0% platform deposit fees with automated blockchain transaction verification',
      'Unlock promotional deposit bonuses with transparent turnover tracking',
    ],
    targetSelectors: [
      '[data-testid="header-deposit-btn"]',
      '[data-testid="dashboard-buy-challenge-btn"]',
    ],
    recommendedTab: 'dashboard',
  },
  {
    stepNumber: 5,
    id: 'copy_trading',
    kicker: 'Step 5 of 6 · Social & P2P Network',
    title: 'Copy Trading & Social Features',
    description:
      'Mirror verified Master Traders automatically in real time or transfer live Self-Capital balances instantly to other traders on the platform using your 8-digit Trader Numeric ID.',
    highlights: [
      'Browse 200+ ranked Master Traders filtered by 90-day verified win rate',
      'Configure custom copy risk controls: lot multiplier, max trade cap, and stop-loss',
      'Send 0%-fee instant P2P Balance Transfers using your unique Numeric ID',
    ],
    targetSelectors: [
      '[data-testid="dashboard-copy-trading-btn"]',
      '[data-testid="dashboard-p2p-transfer-card"]',
      '[data-testid="desktop-copy-trading-btn"]',
    ],
    recommendedTab: 'dashboard',
    dashboardSubTab: 'accounts',
  },
  {
    stepNumber: 6,
    id: 'security_kyc',
    kicker: 'Step 6 of 6 · Account Protection & Compliance',
    title: 'Setting Up 2FA & Verifying KYC',
    description:
      'Protect your trading capital and unlock unrestricted instant withdrawals by completing automated KYC identity verification and enabling Two-Factor Authentication (2FA).',
    highlights: [
      'Lock your personal details and upload dual-sided ID for 2-minute automated KYC',
      'Enable Google Authenticator TOTP or Email 6-digit OTP under Security & 2FA',
      'Verified KYC + active 2FA unlocks instant automated USDT TRC-20 payouts',
    ],
    targetSelectors: [
      '[data-testid="dashboard-kyc-lock-banner"]',
      '[data-testid="dashboard-tab-kyc"]',
      '[data-testid="dashboard-tab-security"]',
      '[data-testid="nav-dashboard-btn"]',
    ],
    recommendedTab: 'dashboard',
    dashboardSubTab: 'kyc',
  },
];

const ONBOARDING_STORAGE_PREFIX = 'bft_onboarding_completed_';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inMemoryOnboardingCompleted = new Set<string>();

function normalizeIdentityKeys(params: {
  userId?: string | null;
  email?: string | null;
}): string[] {
  const keys: string[] = [];
  const cleanId = String(params.userId || '').trim();
  const cleanEmail = String(params.email || '').trim().toLowerCase();
  if (cleanId) keys.push(`id:${cleanId}`);
  if (cleanEmail) keys.push(`email:${cleanEmail}`);
  return keys;
}

/**
 * Checks whether the given user has already completed or skipped the Onboarding Tour,
 * checking both the UserProfile fields (`onboarding_completed` / `onboardingCompleted`)
 * and persistent local storage flags.
 */
export function isUserOnboardingCompleted(
  profile: Partial<UserProfile> | Record<string, any> | null | undefined
): boolean {
  if (!profile || typeof profile !== 'object') return false;

  if (
    profile.onboarding_completed === true ||
    profile.onboardingCompleted === true
  ) {
    return true;
  }

  const keys = normalizeIdentityKeys({
    userId: profile.id || profile.user_id,
    email: profile.email,
  });

  for (const key of keys) {
    if (inMemoryOnboardingCompleted.has(key)) {
      return true;
    }
    try {
      if (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(`${ONBOARDING_STORAGE_PREFIX}${key}`) === 'true'
      ) {
        return true;
      }
    } catch {
      // ignore storage errors
    }
  }

  return false;
}

/**
 * Marks onboarding as completed in local storage and memory for immediate persistence across reloads.
 */
export function markLocalOnboardingCompleted(params: {
  userId?: string | null;
  email?: string | null;
}): void {
  const keys = normalizeIdentityKeys(params);
  for (const key of keys) {
    inMemoryOnboardingCompleted.add(key);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${ONBOARDING_STORAGE_PREFIX}${key}`, 'true');
      }
    } catch {
      // ignore storage errors
    }
  }
}

/**
 * Clears local onboarding completion state for a specific user (used on fresh registration or test reset).
 */
export function clearLocalOnboardingCompleted(params: {
  userId?: string | null;
  email?: string | null;
}): void {
  const keys = normalizeIdentityKeys(params);
  for (const key of keys) {
    inMemoryOnboardingCompleted.delete(key);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${ONBOARDING_STORAGE_PREFIX}${key}`);
      }
    } catch {
      // ignore storage errors
    }
  }
}

/**
 * Pure helper to determine whether the Onboarding Tour should automatically display.
 */
export function shouldShowOnboardingTour(params: {
  profile: Partial<UserProfile> | null | undefined;
  isAutostart?: boolean;
  forceTourParam?: boolean;
}): boolean {
  const { profile, isAutostart = false, forceTourParam = false } = params;
  if (forceTourParam) return true;
  if (!profile || !profile.isLoggedIn) return false;
  if (isAutostart) return false;
  return !isUserOnboardingCompleted(profile);
}

/**
 * Pure step navigation state machine for the Onboarding Tour.
 */
export function resolveNextTourStepIndex(params: {
  currentIndex: number;
  action: 'next' | 'back' | 'goto';
  targetIndex?: number;
  totalSteps?: number;
}): { nextIndex: number; isCompleted: boolean } {
  const total = params.totalSteps ?? ONBOARDING_TOUR_STEPS.length;
  const safeCurrent = Math.max(0, Math.min(total - 1, params.currentIndex));

  if (params.action === 'next') {
    if (safeCurrent + 1 >= total) {
      return { nextIndex: safeCurrent, isCompleted: true };
    }
    return { nextIndex: safeCurrent + 1, isCompleted: false };
  }

  if (params.action === 'back') {
    return { nextIndex: Math.max(0, safeCurrent - 1), isCompleted: false };
  }

  if (params.action === 'goto' && typeof params.targetIndex === 'number') {
    const clamped = Math.max(0, Math.min(total - 1, params.targetIndex));
    return { nextIndex: clamped, isCompleted: false };
  }

  return { nextIndex: safeCurrent, isCompleted: false };
}

/**
 * Persists `onboarding_completed: true` to the Supabase `profiles` table
 * (matching by user UUID and/or email) as well as local storage and Auth metadata.
 */
export async function persistOnboardingCompletedToSupabase(params: {
  userId?: string | null;
  email?: string | null;
  supabaseClient?: any;
}): Promise<{ ok: boolean; updatedInSupabase: boolean; error?: string }> {
  const { userId, email, supabaseClient = supabase } = params;
  markLocalOnboardingCompleted({ userId, email });

  const cleanId = String(userId || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  let updatedInSupabase = false;

  try {
    // 1. Update public.profiles by UUID if valid
    if (cleanId && UUID_REGEX.test(cleanId) && supabaseClient?.from) {
      const { data, error } = await supabaseClient
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', cleanId)
        .select('id, onboarding_completed');

      if (!error && Array.isArray(data) && data.length > 0) {
        updatedInSupabase = true;
      } else if (error) {
        const msg = String(error.message || '');
        if (!msg.includes('onboarding_completed') && !msg.includes('column')) {
          console.warn('[Onboarding Tour] Supabase profile update notice:', msg);
        }
      }
    }

    // 2. Fallback / complement: update public.profiles by email if not yet confirmed
    if (!updatedInSupabase && cleanEmail && supabaseClient?.from) {
      const { data, error } = await supabaseClient
        .from('profiles')
        .update({ onboarding_completed: true })
        .ilike('email', cleanEmail)
        .select('id, onboarding_completed');

      if (!error && Array.isArray(data) && data.length > 0) {
        updatedInSupabase = true;
      }
    }

    // 3. Also sync to Supabase Auth user_metadata if an authenticated session is active
    if (supabaseClient?.auth?.updateUser) {
      await supabaseClient.auth
        .updateUser({
          data: { onboarding_completed: true },
        })
        .catch(() => {});
    }

    return { ok: true, updatedInSupabase };
  } catch (err: any) {
    return {
      ok: true,
      updatedInSupabase: false,
      error: err?.message || 'Saved locally; remote sync deferred',
    };
  }
}
