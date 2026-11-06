-- ============================================================================
-- SUPABASE DATABASE SETUP SCRIPT FOR BINARY FUNDED TRADER (BFT)
-- Tables, Storage Buckets, RLS Policies, and Automated 3-Tier Commission Triggers
-- Completely Idempotent Execution (Safe to re-run multiple times)
-- ============================================================================

-- 0. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. TABLES SCHEMA
-- ============================================================================

-- PROFILES TABLE (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  address TEXT,
  date_of_birth TEXT,
  country TEXT DEFAULT 'United States',
  telegram_handle TEXT,
  profile_locked BOOLEAN NOT NULL DEFAULT FALSE,
  balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  referral_code VARCHAR(10) UNIQUE NOT NULL,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kyc_status TEXT NOT NULL DEFAULT 'unverified',
  kyc_doc_type TEXT,
  kyc_doc_number TEXT,
  front_document_url TEXT,
  back_document_url TEXT,
  total_referral_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (total_referral_earnings >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist on already-provisioned profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'United States';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_handle TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_doc_type TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_doc_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS front_document_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS back_document_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS self_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS self_capital_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS demo_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS funded_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS numeric_id TEXT;

-- KYC SUBMISSIONS TABLE (Full Personal Details + Dual-Sided Document Storage Record)
CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  address TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'United States',
  profile_locked BOOLEAN NOT NULL DEFAULT TRUE,
  doc_type TEXT DEFAULT 'ID Card',
  document_number TEXT,
  front_document_url TEXT,
  back_document_url TEXT,
  status TEXT NOT NULL DEFAULT 'Pending Verification',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- KYC REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.kyc_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  id_photo_url TEXT NOT NULL,
  back_photo_url TEXT,
  doc_type TEXT DEFAULT 'ID Card',
  document_number TEXT,
  full_name TEXT,
  address TEXT,
  date_of_birth TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kyc_requests ADD COLUMN IF NOT EXISTS back_photo_url TEXT;
ALTER TABLE public.kyc_requests ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'ID Card';
ALTER TABLE public.kyc_requests ADD COLUMN IF NOT EXISTS document_number TEXT;
ALTER TABLE public.kyc_requests ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.kyc_requests ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.kyc_requests ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
ALTER TABLE public.kyc_requests ADD COLUMN IF NOT EXISTS country TEXT;

-- DEPOSITS TABLE
CREATE TABLE IF NOT EXISTS public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  slip_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WITHDRAWALS TABLE (Exact Schema for Crypto & Bank Withdrawals + 1-Hour SLA Timer)
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'self', -- 'self' | 'funded'
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (fee >= 0),
  net_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (net_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected', 'cancelled')),
  countdown_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),
  payout_method TEXT NOT NULL DEFAULT 'crypto', -- 'crypto' | 'bank'
  wallet_address TEXT,
  network_type TEXT,
  bank_name TEXT,
  account_holder_name TEXT,
  bank_account_number TEXT,
  branch_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure exact columns exist on already-provisioned withdrawals table
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
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_status_check CHECK (status IN ('pending', 'completed', 'success', 'approved', 'rejected', 'declined', 'cancelled'));

-- REFERRAL COMMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  earner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level INT NOT NULL CHECK (level IN (1, 2, 3)),
  source_type TEXT NOT NULL CHECK (source_type IN ('purchase', 'withdrawal')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  package_amount NUMERIC(15, 2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- USER PURCHASES / ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.user_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id TEXT,
  package_name TEXT NOT NULL,
  package_sku TEXT,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  package_amount NUMERIC(15, 2) NOT NULL CHECK (package_amount > 0),
  account_type TEXT NOT NULL DEFAULT 'challenge',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'approved', 'declined', 'rejected')),
  tx_hash TEXT,
  is_self_funded BOOLEAN NOT NULL DEFAULT FALSE,
  is_provisioned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS package_id TEXT;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS package_sku TEXT;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'challenge';
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS is_self_funded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS is_provisioned BOOLEAN NOT NULL DEFAULT FALSE;

-- CRYPTO DEPOSITS TABLE (Direct USDT TRC-20 Depository & Package Orders)
CREATE TABLE IF NOT EXISTS public.crypto_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL DEFAULT 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  package_id TEXT,
  package_name TEXT NOT NULL,
  package_sku TEXT,
  account_type TEXT NOT NULL DEFAULT 'challenge' CHECK (account_type IN ('challenge', 'self_funded')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'approved', 'declined', 'rejected')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS package_id TEXT;
ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS package_sku TEXT;
ALTER TABLE public.crypto_deposits ADD COLUMN IF NOT EXISTS tx_hash TEXT;

-- TRADING ACCOUNTS TABLE (Instant, One-Step, and Two-Step Challenge Accounts)
CREATE TABLE IF NOT EXISTS public.trading_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL CHECK (account_type IN ('instant', 'one_step', 'two_step', 'one-step', 'two-step', 'personal', 'demo')),
  starting_balance NUMERIC(15, 2) NOT NULL CHECK (starting_balance >= 0),
  current_balance NUMERIC(15, 2) NOT NULL CHECK (current_balance >= 0),
  equity NUMERIC(15, 2) NOT NULL CHECK (equity >= 0),
  daily_drawdown NUMERIC(5, 2) NOT NULL DEFAULT 8.00,
  max_drawdown NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
  profit_target NUMERIC(5, 2) DEFAULT 0.00,
  challenge_phase TEXT NOT NULL DEFAULT 'phase_1',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'two_step';
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS starting_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS current_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS equity NUMERIC(15, 2) NOT NULL DEFAULT 10000.00;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS daily_drawdown NUMERIC(5, 2) NOT NULL DEFAULT 8.00;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC(5, 2) NOT NULL DEFAULT 20.00;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS profit_target NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS challenge_phase TEXT NOT NULL DEFAULT 'phase_1';
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_commissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crypto_deposits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_accounts;

-- COPY TRADING PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.copy_trading_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  country_code TEXT DEFAULT 'US',
  flag TEXT DEFAULT '🇺🇸',
  avatar_url TEXT,
  account_category TEXT NOT NULL CHECK (account_category IN ('instant_funded', 'self_capital')),
  strategy_title TEXT NOT NULL,
  tier_name TEXT DEFAULT '$25K',
  vip_level TEXT DEFAULT 'VIP 1',
  starting_balance NUMERIC(15, 2) NOT NULL DEFAULT 25000.00,
  current_balance NUMERIC(15, 2) NOT NULL DEFAULT 25000.00,
  lifetime_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  daily_profit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  daily_profit_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  weekly_profit_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  monthly_profit_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  win_rate_3m NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  profit_factor NUMERIC(5, 2) DEFAULT 1.50,
  max_drawdown NUMERIC(5, 2) DEFAULT 5.00,
  avg_holding_time TEXT DEFAULT '4h 30m',
  total_trades INTEGER NOT NULL DEFAULT 0,
  current_copiers INTEGER NOT NULL DEFAULT 0,
  max_copiers INTEGER NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure new columns exist on existing table if necessary
ALTER TABLE public.copy_trading_profiles ADD COLUMN IF NOT EXISTS provider_name TEXT;
ALTER TABLE public.copy_trading_profiles ADD COLUMN IF NOT EXISTS strategy_title TEXT;
ALTER TABLE public.copy_trading_profiles ADD COLUMN IF NOT EXISTS tier_name TEXT;
ALTER TABLE public.copy_trading_profiles ADD COLUMN IF NOT EXISTS win_rate_3m NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE public.copy_trading_profiles ADD COLUMN IF NOT EXISTS current_copiers INTEGER DEFAULT 0;

-- Migration logic to copy data from old columns if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='copy_trading_profiles' AND column_name='name') THEN
    UPDATE public.copy_trading_profiles SET provider_name = name WHERE provider_name IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='copy_trading_profiles' AND column_name='strategy_name') THEN
    UPDATE public.copy_trading_profiles SET strategy_title = strategy_name WHERE strategy_title IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='copy_trading_profiles' AND column_name='win_rate') THEN
    UPDATE public.copy_trading_profiles SET win_rate_3m = win_rate WHERE win_rate_3m = 0;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='copy_trading_profiles' AND column_name='active_copiers') THEN
    UPDATE public.copy_trading_profiles SET current_copiers = active_copiers WHERE current_copiers = 0;
  END IF;
END $$;

-- Enable Realtime for Copy Trading
ALTER PUBLICATION supabase_realtime ADD TABLE public.copy_trading_profiles;

-- Seed Sample Copy Traders (only if table is empty or names are null)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.copy_trading_profiles WHERE provider_name IS NOT NULL LIMIT 1) THEN
    DELETE FROM public.copy_trading_profiles;
    INSERT INTO public.copy_trading_profiles 
      (provider_name, country_code, flag, account_category, strategy_title, tier_name, starting_balance, current_balance, daily_profit, daily_profit_pct, weekly_profit_pct, monthly_profit_pct, win_rate_3m, profit_factor, max_drawdown, avg_holding_time, total_trades, current_copiers)
    VALUES
      ('Kasun Perera', 'LK', '🇱🇰', 'instant_funded', 'Colombo Gold Scalper $100K', '$100K', 100000, 108445.50, 8445.50, 8.44, 22.5, 45.2, 88.5, 2.85, 3.2, '1h 15m', 1240, 500),
      ('Alex Thompson', 'GB', '🇬🇧', 'instant_funded', 'London Breakout Specialist', '$50K', 50000, 56510.50, 6510.50, 13.02, 18.2, 38.4, 82.1, 2.45, 4.8, '2h 45m', 840, 500),
      ('Sarah Jenkins', 'US', '🇺🇸', 'instant_funded', 'NASDAQ Trend Rider', '$25K', 25000, 29200.00, 4200.00, 16.8, 12.5, 28.9, 79.4, 2.15, 6.5, '5h 20m', 450, 500),
      ('Elena Rodriguez', 'ES', '🇪🇸', 'instant_funded', 'Euro Volatility Master', '$50K', 50000, 53800.00, 3800.00, 7.6, 14.2, 31.5, 84.6, 2.38, 4.2, '3h 10m', 620, 500),
      ('Yuki Tanaka', 'JP', '🇯🇵', 'instant_funded', 'Jpy Carry Trade Pro', '$100K', 100000, 107200.00, 7200.00, 7.2, 9.8, 24.1, 77.2, 1.95, 7.8, '12h 45m', 980, 500),
      ('Marco Rossi', 'IT', '🇮🇹', 'instant_funded', 'DAX Index Scalper', '$25K', 25000, 27150.00, 2150.00, 8.6, 11.4, 25.8, 81.3, 2.25, 5.1, '45m', 310, 340),
      ('Chen Wei', 'CN', '🇨🇳', 'instant_funded', 'Asian Market Arb', '$50K', 50000, 51900.00, 1900.00, 3.8, 7.5, 18.2, 75.8, 1.82, 8.4, '6h 15m', 540, 210),
      ('Priya Sharma', 'IN', '🇮🇳', 'self_capital', 'Nifty Momentum', 'Self-Capital', 1000, 1450.00, 450.00, 45.0, 62.4, 124.5, 92.4, 3.12, 2.4, '2h 30m', 180, 500),
      ('David Smith', 'US', '🇺🇸', 'self_capital', 'Crypto Swing King', 'Self-Capital', 5000, 6200.00, 1200.00, 24.0, 34.2, 78.9, 86.2, 2.65, 4.5, '24h 00m', 240, 500),
      ('Hans Muller', 'DE', '🇩🇪', 'self_capital', 'Forex Sniper', 'Self-Capital', 2500, 2950.00, 450.00, 18.0, 22.1, 48.5, 83.4, 2.41, 3.9, '4h 15m', 320, 420);
  END IF;
END $$;

-- COPY TRADING SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.copy_trading_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.copy_trading_profiles(id) ON DELETE CASCADE,
  allocated_capital NUMERIC(15, 2) NOT NULL DEFAULT 100.00,
  max_loss_limit NUMERIC(15, 2) DEFAULT 0.00,
  take_profit_limit NUMERIC(15, 2) DEFAULT 0.00,
  trade_sizing_type TEXT DEFAULT 'proportionate' CHECK (trade_sizing_type IN ('proportionate', 'fixed')),
  sizing_multiplier NUMERIC(5, 2) DEFAULT 1.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  current_pnl NUMERIC(15, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider_id)
);

-- Enable Realtime for Subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.copy_trading_subscriptions;

-- RLS for Subscriptions
ALTER TABLE public.copy_trading_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.copy_trading_subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.copy_trading_subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.copy_trading_subscriptions;
CREATE POLICY "Users can insert own subscriptions" ON public.copy_trading_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.copy_trading_subscriptions;
CREATE POLICY "Users can update own subscriptions" ON public.copy_trading_subscriptions FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.copy_trading_subscriptions;
CREATE POLICY "Users can delete own subscriptions" ON public.copy_trading_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- AFFILIATE COMMISSIONS TABLE (User requested)
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  commission_type TEXT NOT NULL CHECK (commission_type IN ('purchase', 'withdrawal')),
  tier_percentage NUMERIC(5, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_user_id ON public.kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_user_status ON public.deposits(user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status ON public.withdrawals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_earner ON public.referral_commissions(earner_id);

-- ============================================================================
-- 2. STORAGE BUCKETS & RLS POLICIES
-- ============================================================================

-- Create Storage Buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('kyc-documents', 'kyc-documents', true),
  ('deposit-slips', 'deposit-slips', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Security Policies for authenticated and public/anon uploads to kyc-documents
DROP POLICY IF EXISTS "Allow authenticated upload to kyc-documents" ON storage.objects;
CREATE POLICY "Allow authenticated upload to kyc-documents" 
ON storage.objects FOR INSERT TO public 
WITH CHECK (bucket_id = 'kyc-documents');

DROP POLICY IF EXISTS "Allow authenticated update to kyc-documents" ON storage.objects;
CREATE POLICY "Allow authenticated update to kyc-documents" 
ON storage.objects FOR UPDATE TO public 
USING (bucket_id = 'kyc-documents');

DROP POLICY IF EXISTS "Allow public read access to kyc-documents" ON storage.objects;
CREATE POLICY "Allow public read access to kyc-documents" 
ON storage.objects FOR SELECT TO public 
USING (bucket_id = 'kyc-documents');

DROP POLICY IF EXISTS "Allow authenticated upload to deposit-slips" ON storage.objects;
CREATE POLICY "Allow authenticated upload to deposit-slips" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'deposit-slips');

DROP POLICY IF EXISTS "Allow public read access to deposit-slips" ON storage.objects;
CREATE POLICY "Allow public read access to deposit-slips" 
ON storage.objects FOR SELECT TO public 
USING (bucket_id = 'deposit-slips');


-- ============================================================================
-- 3. AUTOMATIC TRIGGER 3: ON USER SIGNUP (Create Profile & Referral Link)
-- ============================================================================

-- Helper Function to Generate a Unique 6-Character Alphanumeric Referral Code
CREATE OR REPLACE FUNCTION public.generate_unique_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result TEXT := '';
  i INTEGER;
  CREATE OR REPLACE FUNCTION public.generate_unique_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result TEXT := '';
  i INTEGER;
  code_exists BOOLEAN := TRUE;
  attempts INTEGER := 0;
BEGIN
  WHILE code_exists AND attempts < 100 LOOP
    attempts := attempts + 1;
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END FOR;
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE UPPER(referral_code) = result) INTO code_exists;
  END LOOP;
  IF code_exists THEN
    result := UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6));
  END IF;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger Function on auth.users Signup (Fault-tolerant with exception guard)
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  ref_code_param TEXT;
  referrer_uuid UUID := NULL;
  new_ref_code TEXT;
BEGIN
  RAISE LOG 'Processing signup for user: %, meta: %', NEW.id, NEW.raw_user_meta_data;

  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    referrer_uuid := NULL;
  END;

  BEGIN
    new_ref_code := public.generate_unique_referral_code();
  EXCEPTION WHEN OTHERS THEN
    new_ref_code := UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6));
  END;

  -- 1. Create or update user profile with complete initial balances and role
  BEGIN
    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      numeric_id,
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
      COALESCE(
        NEW.raw_user_meta_data->>'numeric_id',
        FLOOR(10000000 + RANDOM() * 90000000)::TEXT
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
      numeric_id = COALESCE(public.profiles.numeric_id, EXCLUDED.numeric_id),
      referred_by = COALESCE(public.profiles.referred_by, EXCLUDED.referred_by);
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Profile creation in trigger failed for user %: %', NEW.id, SQLERRM;
  END;

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

-- Drop and recreate signup trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_signup();


-- RPC: Get 3-tier network tree
CREATE OR REPLACE FUNCTION public.get_affiliate_network_tree(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_tree JSONB;
BEGIN
  WITH RECURSIVE network AS (
    SELECT id, referred_by, 0 as level
    FROM public.profiles
    WHERE id = p_user_id
    UNION ALL
    SELECT p.id, p.referred_by, n.level + 1
    FROM public.profiles p
    JOIN network n ON p.referred_by = n.id
    WHERE n.level < 3
  )
  SELECT json_agg(row_to_json(n)) INTO v_tree FROM network n WHERE n.level > 0;
  RETURN COALESCE(v_tree, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Get total earnings per tier
CREATE OR REPLACE FUNCTION public.get_affiliate_earnings(p_user_id UUID)
RETURNS TABLE(tier_percentage NUMERIC, total_earnings NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT ac.tier_percentage, SUM(ac.amount)
  FROM public.affiliate_commissions ac
  WHERE ac.user_id = p_user_id
  GROUP BY ac.tier_percentage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Purchase Trigger (Funded Accounts Only)
CREATE OR REPLACE FUNCTION public.handle_funded_account_purchase()
RETURNS TRIGGER AS $$
DECLARE
  l1_id UUID;
  l2_id UUID;
  l3_id UUID;
  comm_amount NUMERIC(15, 2);
  v_pkg_amount NUMERIC(15, 2) := NEW.amount;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    -- Update source profile balance
    UPDATE public.profiles SET balance = balance + v_pkg_amount, updated_at = NOW() WHERE id = NEW.user_id;

    SELECT referred_by INTO l1_id FROM public.profiles WHERE id = NEW.user_id;
    
    IF l1_id IS NOT NULL THEN
      -- Tier 1 (10%)
      comm_amount := ROUND(v_pkg_amount * 0.10, 2);
      INSERT INTO public.referral_commissions (earner_id, source_user_id, level, source_type, amount, package_amount, description)
      VALUES (l1_id, NEW.user_id, 1, 'purchase', comm_amount, v_pkg_amount, 'Direct Referral Purchase Commission (10%)');
      UPDATE public.profiles SET balance = balance + comm_amount, total_referral_earnings = total_referral_earnings + comm_amount WHERE id = l1_id;
      
      -- Tier 2 (5%)
      SELECT referred_by INTO l2_id FROM public.profiles WHERE id = l1_id;
      IF l2_id IS NOT NULL THEN
        comm_amount := ROUND(v_pkg_amount * 0.05, 2);
        INSERT INTO public.referral_commissions (earner_id, source_user_id, level, source_type, amount, package_amount, description)
        VALUES (l2_id, NEW.user_id, 2, 'purchase', comm_amount, v_pkg_amount, 'Sub-Upline Referral Purchase Commission (5%)');
        UPDATE public.profiles SET balance = balance + comm_amount, total_referral_earnings = total_referral_earnings + comm_amount WHERE id = l2_id;
        
        -- Tier 3 (2%)
        SELECT referred_by INTO l3_id FROM public.profiles WHERE id = l2_id;
        IF l3_id IS NOT NULL THEN
          comm_amount := ROUND(v_pkg_amount * 0.02, 2);
          INSERT INTO public.referral_commissions (earner_id, source_user_id, level, source_type, amount, package_amount, description)
          VALUES (l3_id, NEW.user_id, 3, 'purchase', comm_amount, v_pkg_amount, 'Network Upline Referral Purchase Commission (2%)');
          UPDATE public.profiles SET balance = balance + comm_amount, total_referral_earnings = total_referral_earnings + comm_amount WHERE id = l3_id;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_funded_purchase ON public.deposits;
CREATE TRIGGER trg_funded_purchase
  AFTER UPDATE ON public.deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_funded_account_purchase();

-- Withdrawal Trigger (8% Direct)
CREATE OR REPLACE FUNCTION public.handle_referral_withdrawal()
RETURNS TRIGGER AS $$
DECLARE
  l1_id UUID;
  comm_amount NUMERIC(15, 2);
  v_w_amount NUMERIC(15, 2) := NEW.amount;
BEGIN
  IF OLD.status = 'pending' AND (NEW.status = 'completed' OR NEW.status = 'success') THEN
    SELECT referred_by INTO l1_id FROM public.profiles WHERE id = NEW.user_id;
    
    IF l1_id IS NOT NULL THEN
      comm_amount := ROUND(v_w_amount * 0.08, 2);
      INSERT INTO public.referral_commissions (earner_id, source_user_id, level, source_type, amount, package_amount, description)
      VALUES (l1_id, NEW.user_id, 1, 'withdrawal', comm_amount, v_w_amount, 'Direct Referral Withdrawal Commission (8%)');
      UPDATE public.profiles SET balance = balance + comm_amount, total_referral_earnings = total_referral_earnings + comm_amount WHERE id = l1_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_referral_withdrawal ON public.withdrawals;
CREATE TRIGGER trg_referral_withdrawal
  AFTER UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_referral_withdrawal();

-- 3-Tier Purchase Commission Trigger for user_purchases
CREATE OR REPLACE FUNCTION public.handle_user_purchase_commission()
RETURNS TRIGGER AS $$
DECLARE
  l1_id UUID;
  l2_id UUID;
  l3_id UUID;
  comm_amount NUMERIC(15, 2);
BEGIN
  IF NOT NEW.is_self_funded THEN
    SELECT referred_by INTO l1_id FROM public.profiles WHERE id = NEW.user_id;
    
    IF l1_id IS NOT NULL THEN
      -- Tier 1 (10%)
      comm_amount := ROUND(NEW.package_amount * 0.10, 2);
      INSERT INTO public.referral_commissions (earner_id, source_user_id, level, source_type, amount, package_amount, description)
      VALUES (l1_id, NEW.user_id, 1, 'purchase', comm_amount, NEW.package_amount, 'Direct Referral Purchase Commission (10%)');
      UPDATE public.profiles SET balance = balance + comm_amount, total_referral_earnings = total_referral_earnings + comm_amount WHERE id = l1_id;
      
      -- Tier 2 (5%)
      SELECT referred_by INTO l2_id FROM public.profiles WHERE id = l1_id;
      IF l2_id IS NOT NULL THEN
        comm_amount := ROUND(NEW.package_amount * 0.05, 2);
        INSERT INTO public.referral_commissions (earner_id, source_user_id, level, source_type, amount, package_amount, description)
        VALUES (l2_id, NEW.user_id, 2, 'purchase', comm_amount, NEW.package_amount, 'Sub-Upline Referral Purchase Commission (5%)');
        UPDATE public.profiles SET balance = balance + comm_amount, total_referral_earnings = total_referral_earnings + comm_amount WHERE id = l2_id;
        
        -- Tier 3 (2%)
        SELECT referred_by INTO l3_id FROM public.profiles WHERE id = l2_id;
        IF l3_id IS NOT NULL THEN
          comm_amount := ROUND(NEW.package_amount * 0.02, 2);
          INSERT INTO public.referral_commissions (earner_id, source_user_id, level, source_type, amount, package_amount, description)
          VALUES (l3_id, NEW.user_id, 3, 'purchase', comm_amount, NEW.package_amount, 'Network Upline Referral Purchase Commission (2%)');
          UPDATE public.profiles SET balance = balance + comm_amount, total_referral_earnings = total_referral_earnings + comm_amount WHERE id = l3_id;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_user_purchase_commission ON public.user_purchases;
CREATE TRIGGER trg_user_purchase_commission
  AFTER INSERT ON public.user_purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_purchase_commission();

-- Admin: Manual Account Assignment
CREATE OR REPLACE FUNCTION public.admin_assign_package(
  target_user_id UUID,
  pkg_name TEXT,
  pkg_sku TEXT,
  pkg_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
  IF NOT public.is_bft_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  INSERT INTO public.user_purchases (user_id, package_name, package_sku, package_amount, is_self_funded)
  VALUES (target_user_id, pkg_name, pkg_sku, pkg_amount, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

-- Profiles: Public and authenticated read for referral codes & sponsor verification; users update their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public and authenticated read profiles" ON public.profiles;
CREATE POLICY "Public and authenticated read profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (auth.uid() = id OR auth.uid() IS NOT NULL OR true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_bft_admin()) WITH CHECK (auth.uid() = id OR public.is_bft_admin());

-- KYC Submissions: Users read, insert, & update their own KYC submissions
DROP POLICY IF EXISTS "Users can view own KYC submissions" ON public.kyc_submissions;
CREATE POLICY "Users can view own KYC submissions" ON public.kyc_submissions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own KYC submissions" ON public.kyc_submissions;
CREATE POLICY "Users can insert own KYC submissions" ON public.kyc_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own KYC submissions" ON public.kyc_submissions;
CREATE POLICY "Users can update own KYC submissions" ON public.kyc_submissions FOR UPDATE USING (auth.uid() = user_id);

-- KYC Requests: Users insert, update & read own KYC requests
DROP POLICY IF EXISTS "Users can view own KYC requests" ON public.kyc_requests;
CREATE POLICY "Users can view own KYC requests" ON public.kyc_requests FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can submit KYC requests" ON public.kyc_requests;
CREATE POLICY "Users can submit KYC requests" ON public.kyc_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own KYC requests" ON public.kyc_requests;
CREATE POLICY "Users can update own KYC requests" ON public.kyc_requests FOR UPDATE USING (auth.uid() = user_id);

-- Deposits: Users view & create own deposits
DROP POLICY IF EXISTS "Users can view own deposits" ON public.deposits;
CREATE POLICY "Users can view own deposits" ON public.deposits FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can submit deposits" ON public.deposits;
CREATE POLICY "Users can submit deposits" ON public.deposits FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User Purchases / Orders: Permissive for anon & authenticated
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

-- Crypto Deposits: Permissive for anon & authenticated
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

-- Trading Accounts: Permissive for anon & authenticated
ALTER TABLE public.trading_accounts ENABLE ROW LEVEL SECURITY;

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

-- Withdrawals: Authenticated users can INSERT, SELECT, and UPDATE (for cancellation) their own requests; Admins can view & manage all withdrawal rows
CREATE OR REPLACE FUNCTION public.is_bft_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        LOWER(COALESCE(email, '')) IN ('shankavee44@gmail.com', 'admin@bft.io', 'viktor.v@quant-prop.io')
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawals;
CREATE POLICY "Users can view own withdrawals"
  ON public.withdrawals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_bft_admin());

DROP POLICY IF EXISTS "Users can submit withdrawals" ON public.withdrawals;
CREATE POLICY "Users can submit withdrawals"
  ON public.withdrawals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own pending withdrawals" ON public.withdrawals;
CREATE POLICY "Users can update own pending withdrawals"
  ON public.withdrawals
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_bft_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_bft_admin());

DROP POLICY IF EXISTS "Admins can manage all withdrawals" ON public.withdrawals;
CREATE POLICY "Admins can manage all withdrawals"
  ON public.withdrawals
  FOR ALL
  TO authenticated
  USING (public.is_bft_admin())
  WITH CHECK (public.is_bft_admin());

-- Referral Commissions: Users view commissions they earned (or referred), and allow inserts on checkout
DROP POLICY IF EXISTS "Users can view earned commissions" ON public.referral_commissions;
CREATE POLICY "Users can view earned commissions" ON public.referral_commissions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = earner_id OR
    auth.uid() = referrer_id OR
    auth.uid() = source_user_id OR
    auth.uid() = referred_user_id OR
    public.is_bft_admin()
  );

DROP POLICY IF EXISTS "Users can insert commissions" ON public.referral_commissions;
CREATE POLICY "Users can insert commissions" ON public.referral_commissions
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage commissions" ON public.referral_commissions;
CREATE POLICY "Admins can manage commissions" ON public.referral_commissions
  FOR ALL
  TO authenticated
  USING (public.is_bft_admin())
  WITH CHECK (public.is_bft_admin());

-- Grant privileges
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.profiles TO anon;
GRANT SELECT, INSERT ON public.referral_commissions TO anon;

-- ============================================================================
-- 7. 24/7 BACKEND MARKET PRICES & OTC TRADES SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.market_prices (
  symbol TEXT PRIMARY KEY,
  last_price NUMERIC(15, 6) NOT NULL,
  prev_price NUMERIC(15, 6) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial market prices for common assets
INSERT INTO public.market_prices (symbol, last_price, prev_price, updated_at)
VALUES 
  ('EUR/USD (OTC)', 1.08542, 1.08538, NOW()),
  ('GBP/USD (OTC)', 1.26420, 1.26415, NOW()),
  ('USD/BRL (OTC)', 5.74210, 5.74180, NOW()),
  ('USD/JPY (OTC)', 154.210, 154.195, NOW()),
  ('BTC/USD (OTC)', 67450.00, 67420.00, NOW())
ON CONFLICT (symbol) DO NOTHING;

-- Function to continuously update market prices on the backend (Brownian motion simulation)
CREATE OR REPLACE FUNCTION public.update_market_prices()
RETURNS VOID AS $$
DECLARE
  rec RECORD;
  delta NUMERIC;
  new_p NUMERIC;
BEGIN
  FOR rec IN SELECT symbol, last_price FROM public.market_prices LOOP
    delta := (random() - 0.495) * (rec.last_price * 0.0004);
    new_p := ROUND(GREATEST(0.0001, rec.last_price + delta), 5);
    
    UPDATE public.market_prices
    SET prev_price = rec.last_price,
        last_price = new_p,
        updated_at = NOW()
    WHERE symbol = rec.symbol;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Optional pg_cron scheduling (if extension is available)
-- SELECT cron.schedule('update-market-every-second', '* * * * * *', $$SELECT public.update_market_prices();$$);

-- OTC ASSETS REGISTRY TABLE (Centralized 24/7 Algorithmic Market Data)
CREATE TABLE IF NOT EXISTS public.otc_assets (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  current_price NUMERIC(15, 6) NOT NULL,
  payout_rate INTEGER NOT NULL DEFAULT 92,
  volatility NUMERIC(10, 6) DEFAULT 0.00012,
  pip_decimals INTEGER DEFAULT 5,
  flag TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- USER TRADES TABLE FOR OTC BINARY OPTIONS
CREATE TABLE IF NOT EXISTS public.user_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id TEXT, -- Logical account identifier (e.g. BFT-91823)
  account_type TEXT DEFAULT 'DEMO', -- 'DEMO', 'REAL', 'ONE_STEP', 'TWO_STEP', 'INSTANT'
  symbol TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('CALL', 'PUT', 'HIGHER', 'LOWER')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  entry_price NUMERIC(15, 6) NOT NULL,
  exit_price NUMERIC(15, 6),
  payout_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 1.80,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'WON', 'LOST', 'TIE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ
);

-- Ensure columns exist for already provisioned tables
ALTER TABLE public.user_trades ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE public.user_trades ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'DEMO';

CREATE INDEX IF NOT EXISTS idx_user_trades_user_status ON public.user_trades(user_id, status);

-- RPC FUNCTION TO SETTLE OTC TRADE UPON EXPIRATION
CREATE OR REPLACE FUNCTION public.settle_otc_trade(
  p_trade_id UUID,
  p_final_price NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  v_trade RECORD;
  v_payout NUMERIC(15, 2);
  v_won BOOLEAN;
  v_result TEXT;
BEGIN
  SELECT * INTO v_trade FROM public.user_trades WHERE id = p_trade_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Trade not found');
  END IF;

  IF v_trade.status <> 'OPEN' THEN
    RETURN json_build_object('ok', false, 'error', 'Trade already settled', 'trade', v_trade);
  END IF;

  IF v_trade.trade_type IN ('CALL', 'HIGHER') THEN
    v_won := p_final_price > v_trade.entry_price;
  ELSE
    v_won := p_final_price < v_trade.entry_price;
  END IF;

  IF p_final_price = v_trade.entry_price THEN
    v_result := 'TIE';
    v_payout := v_trade.amount;
  ELSIF v_won THEN
    v_result := 'WON';
    v_payout := ROUND(v_trade.amount * v_trade.payout_multiplier, 2);
  ELSE
    v_result := 'LOST';
    v_payout := 0.00;
  END IF;

  UPDATE public.user_trades
  SET exit_price = p_final_price,
      status = v_result,
      settled_at = NOW()
  WHERE id = p_trade_id;

  IF v_payout > 0 THEN
    UPDATE public.profiles
    SET balance = balance + v_payout,
        updated_at = NOW()
    WHERE id = v_trade.user_id;
  END IF;

  SELECT * INTO v_trade FROM public.user_trades WHERE id = p_trade_id;

  RETURN json_build_object(
    'ok', true,
    'result', v_result,
    'payout', v_payout,
    'trade', v_trade
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable RLS on user_trades & market_prices
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to market_prices" ON public.market_prices;
CREATE POLICY "Public read access to market_prices" ON public.market_prices FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow write access to market_prices" ON public.market_prices;
CREATE POLICY "Allow write access to market_prices" ON public.market_prices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own trades" ON public.user_trades;
CREATE POLICY "Users can view own trades" ON public.user_trades FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own trades" ON public.user_trades;
CREATE POLICY "Users can insert own trades" ON public.user_trades FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.market_prices TO anon, authenticated;
GRANT ALL ON public.user_trades TO authenticated;

