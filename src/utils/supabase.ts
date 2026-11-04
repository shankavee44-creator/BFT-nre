import { createClient } from '@supabase/supabase-js';

/**
 * Resiliently resolve environment variables across Vite, Webpack, Next.js, Node, and browser window globals.
 */
function resolveEnv(key: string, altKeys: string[] = [], fallback = ''): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env[key]) return String(import.meta.env[key]).trim();
      for (const alt of altKeys) {
        if (import.meta.env[alt]) return String(import.meta.env[alt]).trim();
      }
    }
  } catch {
    // ignore
  }

  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env[key]) return String(process.env[key]).trim();
      for (const alt of altKeys) {
        if (process.env[alt]) return String(process.env[alt]).trim();
      }
    }
  } catch {
    // ignore
  }

  try {
    if (typeof window !== 'undefined' && (window as any).__ENV__) {
      const winEnv = (window as any).__ENV__;
      if (winEnv[key]) return String(winEnv[key]).trim();
      for (const alt of altKeys) {
        if (winEnv[alt]) return String(winEnv[alt]).trim();
      }
    }
  } catch {
    // ignore
  }

  return fallback;
}

export const SUPABASE_URL = resolveEnv(
  'VITE_SUPABASE_URL',
  ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'REACT_APP_SUPABASE_URL'],
  'https://kwmjonjcwdwvaijcrtjw.supabase.co'
).replace(/\/+$/, '');

export const SUPABASE_ANON_KEY = resolveEnv(
  'VITE_SUPABASE_ANON_KEY',
  ['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'REACT_APP_SUPABASE_ANON_KEY'],
  'sb_publishable_G151L79Inh_SPks_HrujZQ_fmaGh-_6'
);

export const getSupabaseUrl = (): string => SUPABASE_URL;
export const getSupabaseAnonKey = (): string => SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ensures that the authenticated user has a corresponding row in `public.profiles`
 * and at least one default trading account in `public.trading_accounts`.
 * Seamlessly backs up the database trigger in case the trigger is delayed or restricted by network.
 */
export async function ensureSupabaseProfileAndDemoAccount(params: {
  userId: string;
  email: string;
  fullName?: string;
  referralCode?: string;
  sponsorCode?: string | null;
}): Promise<{ ok: boolean; profile?: any; error?: string }> {
  const { userId, email, fullName, referralCode, sponsorCode } = params;
  if (!userId || !UUID_REGEX.test(userId)) {
    return { ok: true };
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = fullName || (cleanEmail ? cleanEmail.split('@')[0] : 'BFT Trader');
  const genRefCode =
    referralCode || `BFT-${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`;

  try {
    // 1. Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    let profileResult = existingProfile;

    if (!existingProfile) {
      // Look up sponsor UUID if sponsor code provided
      let sponsorUuid: string | null = null;
      if (sponsorCode && sponsorCode.trim()) {
        try {
          const { data: sp } = await supabase
            .from('profiles')
            .select('id')
            .ilike('referral_code', sponsorCode.trim())
            .maybeSingle();
          if (sp?.id && sp.id !== userId) {
            sponsorUuid = sp.id;
          }
        } catch {
          // ignore
        }
      }

      // Upsert profile with core fields and automatic fallback if optional columns are missing
      const upsertRow: Record<string, any> = {
        id: userId,
        email: cleanEmail,
        full_name: cleanName,
        referral_code: genRefCode,
        referred_by: sponsorUuid,
        kyc_status: 'unverified',
      };

      for (let attempt = 0; attempt < 4; attempt++) {
        const { data: insertedProfile, error: upsertError } = await supabase
          .from('profiles')
          .upsert(upsertRow, { onConflict: 'id' })
          .select('*')
          .maybeSingle();

        if (!upsertError) {
          profileResult = insertedProfile;
          break;
        }
        const missingColMatch = String(upsertError.message || '').match(/Could not find the '([^']+)' column/i);
        if (missingColMatch?.[1] && missingColMatch[1] in upsertRow) {
          delete upsertRow[missingColMatch[1]];
          continue;
        }
        break;
      }
    }

    // 2. Ensure initial Demo trading account exists in trading_accounts
    try {
      const { data: existingAccounts } = await supabase
        .from('trading_accounts')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (!existingAccounts || existingAccounts.length === 0) {
        await supabase
          .from('trading_accounts')
          .insert({
            user_id: userId,
            account_type: 'demo',
            starting_balance: 10000.0,
            current_balance: 10000.0,
            equity: 10000.0,
            daily_drawdown: 8.0,
            max_drawdown: 20.0,
            profit_target: 0.0,
            challenge_phase: 'demo',
            status: 'active',
          })
          .then(undefined, () => {});
      }
    } catch {
      // Non-blocking for demo account
    }

    return { ok: true, profile: profileResult };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to ensure user profile' };
  }
}
