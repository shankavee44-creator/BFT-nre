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

-- WITHDRAWALS TABLE
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  bank_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REFERRAL COMMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  earner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level INT NOT NULL CHECK (level IN (1, 2, 3)),
  commission_type TEXT NOT NULL CHECK (commission_type IN ('deposit', 'withdrawal')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
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
  code_exists BOOLEAN := TRUE;
BEGIN
  WHILE code_exists LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END FOR;
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = result) INTO code_exists;
  END LOOP;
  RETURN result;
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
  ref_code_param := UPPER(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'referral_code',
    NEW.raw_user_meta_data->>'ref',
    ''
  )));

  IF ref_code_param <> '' THEN
    SELECT id INTO referrer_uuid FROM public.profiles WHERE referral_code = ref_code_param LIMIT 1;
  END IF;

  new_ref_code := public.generate_unique_referral_code();

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    balance,
    referral_code,
    referred_by,
    kyc_status,
    total_referral_earnings
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, 'trader@bft.io'), '@', 1)),
    0.00,
    new_ref_code,
    referrer_uuid,
    'unverified',
    0.00
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth.users signup if profile trigger encounters any constraint warning
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop and recreate signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_signup();


-- ============================================================================
-- 4. AUTOMATIC TRIGGER 1: ON DEPOSIT APPROVAL (3-Tier Referral Commissions)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_deposit_approval()
RETURNS TRIGGER AS $$
DECLARE
  l1_id UUID := NULL;
  l2_id UUID := NULL;
  l3_id UUID := NULL;
  comm1 NUMERIC(15, 2);
  comm2 NUMERIC(15, 2);
  comm3 NUMERIC(15, 2);
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN

    UPDATE public.profiles
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    SELECT referred_by INTO l1_id FROM public.profiles WHERE id = NEW.user_id;

    IF l1_id IS NOT NULL THEN
      comm1 := ROUND(NEW.amount * 0.10, 2);
      IF comm1 > 0 THEN
        UPDATE public.profiles
        SET balance = balance + comm1,
            total_referral_earnings = total_referral_earnings + comm1,
            updated_at = NOW()
        WHERE id = l1_id;

        INSERT INTO public.referral_commissions (earner_id, source_user_id, level, commission_type, amount)
        VALUES (l1_id, NEW.user_id, 1, 'deposit', comm1);
      END IF;

      SELECT referred_by INTO l2_id FROM public.profiles WHERE id = l1_id;

      IF l2_id IS NOT NULL THEN
        comm2 := ROUND(NEW.amount * 0.05, 2);
        IF comm2 > 0 THEN
          UPDATE public.profiles
          SET balance = balance + comm2,
              total_referral_earnings = total_referral_earnings + comm2,
              updated_at = NOW()
          WHERE id = l2_id;

          INSERT INTO public.referral_commissions (earner_id, source_user_id, level, commission_type, amount)
          VALUES (l2_id, NEW.user_id, 2, 'deposit', comm2);
        END IF;

        SELECT referred_by INTO l3_id FROM public.profiles WHERE id = l2_id;

        IF l3_id IS NOT NULL THEN
          comm3 := ROUND(NEW.amount * 0.02, 2);
          IF comm3 > 0 THEN
            UPDATE public.profiles
            SET balance = balance + comm3,
                total_referral_earnings = total_referral_earnings + comm3,
                updated_at = NOW()
            WHERE id = l3_id;

            INSERT INTO public.referral_commissions (earner_id, source_user_id, level, commission_type, amount)
            VALUES (l3_id, NEW.user_id, 3, 'deposit', comm3);
          END IF;
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_deposit_status_updated ON public.deposits;
CREATE TRIGGER on_deposit_status_updated
  AFTER UPDATE ON public.deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deposit_approval();


-- ============================================================================
-- 5. AUTOMATIC TRIGGER 2: ON WITHDRAWAL COMPLETION (8% Direct Commission)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_withdrawal_completion()
RETURNS TRIGGER AS $$
DECLARE
  l1_id UUID := NULL;
  comm_amount NUMERIC(15, 2);
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'completed' THEN

    UPDATE public.profiles
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    SELECT referred_by INTO l1_id FROM public.profiles WHERE id = NEW.user_id;

    IF l1_id IS NOT NULL THEN
      comm_amount := ROUND(NEW.amount * 0.08, 2);
      IF comm_amount > 0 THEN
        UPDATE public.profiles
        SET balance = balance + comm_amount,
            total_referral_earnings = total_referral_earnings + comm_amount,
            updated_at = NOW()
        WHERE id = l1_id;

        INSERT INTO public.referral_commissions (earner_id, source_user_id, level, commission_type, amount)
        VALUES (l1_id, NEW.user_id, 1, 'withdrawal', comm_amount);
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_withdrawal_status_updated ON public.withdrawals;
CREATE TRIGGER on_withdrawal_status_updated
  AFTER UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_withdrawal_completion();


-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

-- Profiles: Users read, insert, & update their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

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

-- Withdrawals: Users view & create own withdrawals
DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawals;
CREATE POLICY "Users can view own withdrawals" ON public.withdrawals FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can submit withdrawals" ON public.withdrawals;
CREATE POLICY "Users can submit withdrawals" ON public.withdrawals FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Referral Commissions: Users view commissions they earned
DROP POLICY IF EXISTS "Users can view earned commissions" ON public.referral_commissions;
CREATE POLICY "Users can view earned commissions" ON public.referral_commissions FOR SELECT USING (auth.uid() = earner_id);

-- Grant privileges
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

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

-- USER TRADES TABLE FOR OTC BINARY OPTIONS
CREATE TABLE IF NOT EXISTS public.user_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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

DROP POLICY IF EXISTS "Users can view own trades" ON public.user_trades;
CREATE POLICY "Users can view own trades" ON public.user_trades FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own trades" ON public.user_trades;
CREATE POLICY "Users can insert own trades" ON public.user_trades FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.market_prices TO anon, authenticated;
GRANT ALL ON public.user_trades TO authenticated;

