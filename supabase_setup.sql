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
  balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  referral_code VARCHAR(10) UNIQUE NOT NULL,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kyc_status TEXT NOT NULL DEFAULT 'unverified' CHECK (kyc_status IN ('unverified', 'pending', 'approved', 'rejected')),
  total_referral_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (total_referral_earnings >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KYC REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.kyc_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  id_photo_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Storage Security Policies for authenticated users
DROP POLICY IF EXISTS "Allow authenticated upload to kyc-documents" ON storage.objects;
CREATE POLICY "Allow authenticated upload to kyc-documents" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'kyc-documents');

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
CREATE OR REPLACE FUNCTION generate_unique_referral_code()
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
$$ LANGUAGE plpgsql;

-- Trigger Function on auth.users Signup
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  ref_code_param TEXT;
  referrer_uuid UUID := NULL;
  new_ref_code TEXT;
BEGIN
  -- Extract referral code passed in user metadata (supports 'referral_code' or 'ref')
  ref_code_param := UPPER(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'referral_code',
    NEW.raw_user_meta_data->>'ref',
    ''
  )));

  -- Lookup Referrer Profile ID if referral code exists
  IF ref_code_param <> '' THEN
    SELECT id INTO referrer_uuid FROM public.profiles WHERE referral_code = ref_code_param;
  END IF;

  -- Generate Unique 6-character referral code for new user
  new_ref_code := generate_unique_referral_code();

  -- Insert profile row
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
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    0.00,
    new_ref_code,
    referrer_uuid,
    'unverified',
    0.00
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  -- Only execute when status flips from 'pending' to 'approved'
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN

    -- a) Add deposit amount to user's balance
    UPDATE public.profiles
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    -- Retrieve Level 1 (Direct Referrer)
    SELECT referred_by INTO l1_id FROM public.profiles WHERE id = NEW.user_id;

    -- b) Level 1 Commission (10%)
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

      -- Retrieve Level 2 (Sub-Referral)
      SELECT referred_by INTO l2_id FROM public.profiles WHERE id = l1_id;

      -- c) Level 2 Commission (5%)
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

        -- Retrieve Level 3 (Network)
        SELECT referred_by INTO l3_id FROM public.profiles WHERE id = l2_id;

        -- d) Level 3 Commission (2%)
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
        END IF; -- Level 3
      END IF; -- Level 2
    END IF; -- Level 1

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate deposit approval trigger
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
  -- Only execute when status flips from 'pending' to 'completed'
  IF OLD.status = 'pending' AND NEW.status = 'completed' THEN

    -- a) Deduct withdrawal amount from user's balance
    UPDATE public.profiles
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    -- Retrieve Level 1 (Direct Referrer)
    SELECT referred_by INTO l1_id FROM public.profiles WHERE id = NEW.user_id;

    -- b) Level 1 Direct Commission on Withdrawal (8%)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate withdrawal completion trigger
DROP TRIGGER IF EXISTS on_withdrawal_status_updated ON public.withdrawals;
CREATE TRIGGER on_withdrawal_status_updated
  AFTER UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_withdrawal_completion();


-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

-- Profiles: Users read & update their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- KYC Requests: Users insert & read own KYC requests
DROP POLICY IF EXISTS "Users can view own KYC requests" ON public.kyc_requests;
CREATE POLICY "Users can view own KYC requests" ON public.kyc_requests FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can submit KYC requests" ON public.kyc_requests;
CREATE POLICY "Users can submit KYC requests" ON public.kyc_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

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
