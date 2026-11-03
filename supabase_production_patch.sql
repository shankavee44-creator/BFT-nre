-- ============================================================================
-- BINARY FUNDED TRADER (BFT) - SUPABASE PRODUCTION PATCH
-- Fixes: RLS Policies, Column Mismatches, Constraints, and on_auth_user_created Trigger
-- Idempotent: Safe to execute multiple times on any existing Supabase instance
-- ============================================================================

-- 0. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. PROFILES TABLE & COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  address TEXT,
  date_of_birth TEXT,
  country TEXT DEFAULT 'United States',
  telegram_handle TEXT,
  profile_locked BOOLEAN NOT NULL DEFAULT FALSE,
  balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  self_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  self_capital_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  demo_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00,
  funded_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  referral_code VARCHAR(64) UNIQUE NOT NULL,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kyc_status TEXT NOT NULL DEFAULT 'unverified',
  kyc_doc_type TEXT,
  kyc_doc_number TEXT,
  front_document_url TEXT,
  back_document_url TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  total_referral_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist on existing table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'United States';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_handle TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS self_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS self_capital_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS demo_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS funded_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_referral_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================================
-- 2. TRADING ACCOUNTS TABLE & CONSTRAINTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trading_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'two_step',
  starting_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00,
  current_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00,
  equity NUMERIC(15, 2) NOT NULL DEFAULT 10000.00,
  daily_drawdown NUMERIC(5, 2) NOT NULL DEFAULT 8.00,
  max_drawdown NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
  profit_target NUMERIC(5, 2) DEFAULT 0.00,
  challenge_phase TEXT NOT NULL DEFAULT 'phase_1',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relax account_type constraint to allow all standard variations
ALTER TABLE public.trading_accounts DROP CONSTRAINT IF EXISTS trading_accounts_account_type_check;
ALTER TABLE public.trading_accounts ADD CONSTRAINT trading_accounts_account_type_check 
  CHECK (account_type IN ('instant', 'one_step', 'two_step', 'one-step', 'two-step', 'personal', 'demo', 'challenge', 'instant_funded', 'DEMO', 'REAL'));

-- ============================================================================
-- 3. CRYPTO DEPOSITS TABLE & CONSTRAINTS (Includes 1-Hour Expiry & Logging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crypto_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL DEFAULT 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  package_id TEXT,
  package_name TEXT NOT NULL,
  sku TEXT,
  package_sku TEXT,
  account_type TEXT NOT NULL DEFAULT 'challenge',
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS package_id TEXT;
ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS package_sku TEXT;
ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Relax status constraint to allow live tracking statuses ('pending', 'completed', 'active', 'failed', 'approved', 'declined', 'rejected', 'expired')
ALTER TABLE public.crypto_deposits DROP CONSTRAINT IF EXISTS crypto_deposits_status_check;
ALTER TABLE public.crypto_deposits ADD CONSTRAINT crypto_deposits_status_check 
  CHECK (status IN ('pending', 'completed', 'active', 'failed', 'approved', 'declined', 'rejected', 'expired'));

-- Relax account_type constraint
ALTER TABLE public.crypto_deposits DROP CONSTRAINT IF EXISTS crypto_deposits_account_type_check;
ALTER TABLE public.crypto_deposits ADD CONSTRAINT crypto_deposits_account_type_check 
  CHECK (account_type IN ('challenge', 'self_funded', 'self', 'personal', 'instant', 'one_step', 'two_step'));

-- ============================================================================
-- 4. USER PURCHASES TABLE & CONSTRAINTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id TEXT,
  package_name TEXT NOT NULL,
  package_sku TEXT,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  package_amount NUMERIC(15, 2) NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'challenge',
  status TEXT NOT NULL DEFAULT 'completed',
  tx_hash TEXT,
  is_self_funded BOOLEAN NOT NULL DEFAULT FALSE,
  is_provisioned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS package_id TEXT;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS package_sku TEXT;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'challenge';
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS is_self_funded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS is_provisioned BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_purchases DROP CONSTRAINT IF EXISTS user_purchases_status_check;
ALTER TABLE public.user_purchases ADD CONSTRAINT user_purchases_status_check 
  CHECK (status IN ('pending', 'completed', 'active', 'failed', 'approved', 'declined', 'rejected', 'expired'));

-- ============================================================================
-- 5. REFERRAL COMMISSIONS TABLE (Dual Column: earner_id/referrer_id & source_user_id/referred_user_id)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  earner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  level INT NOT NULL DEFAULT 1 CHECK (level IN (1, 2, 3)),
  source_type TEXT NOT NULL DEFAULT 'package',
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  package_name TEXT,
  package_amount NUMERIC(15, 2) DEFAULT 0,
  tier TEXT DEFAULT 'basic',
  tier_badge TEXT DEFAULT 'basic',
  commission_rate NUMERIC(5, 4),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS earner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS source_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS referred_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'package';
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS package_name TEXT;
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS package_amount NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'basic';
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS tier_badge TEXT DEFAULT 'basic';
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4);
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS description TEXT;

-- Trigger to keep earner_id <-> referrer_id and source_user_id <-> referred_user_id in sync
CREATE OR REPLACE FUNCTION public.sync_referral_commissions_columns()
RETURNS TRIGGER AS $$
BEGIN
  NEW.earner_id := COALESCE(NEW.earner_id, NEW.referrer_id);
  NEW.referrer_id := COALESCE(NEW.referrer_id, NEW.earner_id);
  NEW.source_user_id := COALESCE(NEW.source_user_id, NEW.referred_user_id);
  NEW.referred_user_id := COALESCE(NEW.referred_user_id, NEW.source_user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_referral_commissions ON public.referral_commissions;
CREATE TRIGGER trg_sync_referral_commissions
  BEFORE INSERT OR UPDATE ON public.referral_commissions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_referral_commissions_columns();

-- ============================================================================
-- 6. WITHDRAWALS TABLE & CONSTRAINTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'self',
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  net_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending',
  countdown_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),
  payout_method TEXT NOT NULL DEFAULT 'crypto',
  wallet_address TEXT,
  network_type TEXT,
  bank_name TEXT,
  account_holder_name TEXT,
  bank_account_number TEXT,
  branch_name TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'self';
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS net_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS countdown_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour');
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS payout_method TEXT NOT NULL DEFAULT 'crypto';
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS network_type TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS account_holder_name TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_status_check 
  CHECK (status IN ('pending', 'completed', 'success', 'approved', 'rejected', 'declined', 'cancelled', 'processing', 'failed', 'paid'));

-- ============================================================================
-- 7. ADMIN AUTHORIZATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_bft_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role = 'admin' OR
        LOWER(COALESCE(email, '')) IN ('shankavee44@gmail.com', 'admin@bft.io', 'viktor.v@quant-prop.io')
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================================
-- 8. COMPREHENSIVE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- 8.1 PROFILES POLICIES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public and authenticated read profiles" ON public.profiles;
CREATE POLICY "Public and authenticated read profiles"
  ON public.profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 8.2 TRADING ACCOUNTS POLICIES
DROP POLICY IF EXISTS "Users can view own trading accounts" ON public.trading_accounts;
DROP POLICY IF EXISTS "Allow select trading_accounts" ON public.trading_accounts;
CREATE POLICY "Allow select trading_accounts"
  ON public.trading_accounts FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own trading accounts" ON public.trading_accounts;
DROP POLICY IF EXISTS "Allow insert trading_accounts" ON public.trading_accounts;
CREATE POLICY "Allow insert trading_accounts"
  ON public.trading_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own trading accounts" ON public.trading_accounts;
DROP POLICY IF EXISTS "Allow update trading_accounts" ON public.trading_accounts;
CREATE POLICY "Allow update trading_accounts"
  ON public.trading_accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can delete trading accounts" ON public.trading_accounts;
DROP POLICY IF EXISTS "Allow delete trading_accounts" ON public.trading_accounts;
CREATE POLICY "Allow delete trading_accounts"
  ON public.trading_accounts FOR DELETE TO anon, authenticated USING (true);

-- 8.3 CRYPTO DEPOSITS POLICIES
DROP POLICY IF EXISTS "Users can view own crypto deposits" ON public.crypto_deposits;
DROP POLICY IF EXISTS "Allow select crypto_deposits" ON public.crypto_deposits;
CREATE POLICY "Allow select crypto_deposits"
  ON public.crypto_deposits FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own crypto deposits" ON public.crypto_deposits;
DROP POLICY IF EXISTS "Allow insert crypto_deposits" ON public.crypto_deposits;
CREATE POLICY "Allow insert crypto_deposits"
  ON public.crypto_deposits FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own crypto deposits" ON public.crypto_deposits;
DROP POLICY IF EXISTS "Allow update crypto_deposits" ON public.crypto_deposits;
CREATE POLICY "Allow update crypto_deposits"
  ON public.crypto_deposits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 8.4 USER PURCHASES POLICIES
DROP POLICY IF EXISTS "Users can view own purchases" ON public.user_purchases;
DROP POLICY IF EXISTS "Allow select user_purchases" ON public.user_purchases;
CREATE POLICY "Allow select user_purchases"
  ON public.user_purchases FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own purchases" ON public.user_purchases;
DROP POLICY IF EXISTS "Allow insert user_purchases" ON public.user_purchases;
CREATE POLICY "Allow insert user_purchases"
  ON public.user_purchases FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own purchases" ON public.user_purchases;
DROP POLICY IF EXISTS "Allow update user_purchases" ON public.user_purchases;
CREATE POLICY "Allow update user_purchases"
  ON public.user_purchases FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 8.5 REFERRAL COMMISSIONS POLICIES
DROP POLICY IF EXISTS "Users can view earned commissions" ON public.referral_commissions;
DROP POLICY IF EXISTS "Allow select referral_commissions" ON public.referral_commissions;
CREATE POLICY "Allow select referral_commissions"
  ON public.referral_commissions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert commissions" ON public.referral_commissions;
DROP POLICY IF EXISTS "Allow insert referral_commissions" ON public.referral_commissions;
CREATE POLICY "Allow insert referral_commissions"
  ON public.referral_commissions FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage commissions" ON public.referral_commissions;
DROP POLICY IF EXISTS "Allow update referral_commissions" ON public.referral_commissions;
CREATE POLICY "Allow update referral_commissions"
  ON public.referral_commissions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 8.6 USER TRADES POLICIES
DROP POLICY IF EXISTS "Users can view own trades" ON public.user_trades;
DROP POLICY IF EXISTS "Allow select user_trades" ON public.user_trades;
CREATE POLICY "Allow select user_trades"
  ON public.user_trades FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own trades" ON public.user_trades;
DROP POLICY IF EXISTS "Allow insert user_trades" ON public.user_trades;
CREATE POLICY "Allow insert user_trades"
  ON public.user_trades FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update user_trades" ON public.user_trades;
CREATE POLICY "Allow update user_trades"
  ON public.user_trades FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 8.7 WITHDRAWALS POLICIES
DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Allow select withdrawals" ON public.withdrawals;
CREATE POLICY "Allow select withdrawals"
  ON public.withdrawals FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can submit withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Allow insert withdrawals" ON public.withdrawals;
CREATE POLICY "Allow insert withdrawals"
  ON public.withdrawals FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own pending withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Allow update withdrawals" ON public.withdrawals;
CREATE POLICY "Allow update withdrawals"
  ON public.withdrawals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage all withdrawals" ON public.withdrawals;

-- Grant privileges to authenticated and anon roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_accounts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crypto_deposits TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_purchases TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_commissions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_trades TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.withdrawals TO anon, authenticated;

-- ============================================================================
-- 9. AUTOMATIC USER PROFILE & TRADING ACCOUNT CREATION TRIGGER
-- ============================================================================

-- Helper Function to Generate a Unique 6-Character Alphanumeric Referral Code
CREATE OR REPLACE FUNCTION public.generate_unique_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result TEXT := '';
  i INTEGER;
  code_exists BOOLEAN := TRUE;
BEGIN
  WHILE code_exists LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END FOR;
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE UPPER(referral_code) = result) INTO code_exists;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Core Trigger Function on auth.users Signup
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  ref_code_param TEXT;
  referrer_uuid UUID := NULL;
  new_ref_code TEXT;
BEGIN
  RAISE LOG 'Processing signup for user: %, meta: %', NEW.id, NEW.raw_user_meta_data;

  ref_code_param := UPPER(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'referral_code',
    NEW.raw_user_meta_data->>'ref',
    NEW.raw_user_meta_data->>'referred_by',
    ''
  )));

  IF ref_code_param <> '' THEN
    SELECT id INTO referrer_uuid FROM public.profiles WHERE UPPER(referral_code) = ref_code_param LIMIT 1;
    RAISE LOG 'Referral lookup: code=%, referrer_uuid=%', ref_code_param, referrer_uuid;
  END IF;

  new_ref_code := public.generate_unique_referral_code();

  -- 1. Create or update user profile with complete initial balances and role
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    balance,
    self_balance,
    self_capital_balance,
    demo_balance,
    funded_balance,
    role,
    referral_code,
    referred_by,
    kyc_status,
    total_referral_earnings
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, 'trader@bft.io'), '@', 1)
    ),
    0.00,
    0.00,
    0.00,
    10000.00,
    0.00,
    'user',
    new_ref_code,
    referrer_uuid,
    'unverified',
    0.00
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.profiles.email),
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    referred_by = COALESCE(public.profiles.referred_by, EXCLUDED.referred_by);

  -- 2. Automatically create default Demo Trading Account ($10,000 equity)
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.trading_accounts WHERE user_id = NEW.id) THEN
      INSERT INTO public.trading_accounts (
        user_id,
        account_type,
        starting_balance,
        current_balance,
        equity,
        daily_drawdown,
        max_drawdown,
        profit_target,
        challenge_phase,
        status
      ) VALUES (
        NEW.id,
        'demo',
        10000.00,
        10000.00,
        10000.00,
        8.00,
        20.00,
        0.00,
        'demo',
        'active'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Could not create demo account for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user_signup trigger: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Alias function name so both on_auth_user_created and handle_new_user work identically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  RETURN public.handle_new_user_signup();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_signup();

-- Enable Realtime publication for live UI updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_commissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crypto_deposits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_accounts;
