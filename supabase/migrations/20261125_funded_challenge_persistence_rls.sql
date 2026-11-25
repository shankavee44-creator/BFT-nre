-- =============================================================================
-- BFT Funded Challenge Account Persistence & Row Level Security (RLS) Migration
-- Ensures purchased funded challenge accounts save reliably to Supabase on
-- "Start Now", sync Self Capital deductions, and load on login/refresh.
-- =============================================================================

-- 1. Ensure `public.purchased_funded_wallets` has all required columns
ALTER TABLE IF EXISTS public.purchased_funded_wallets
  ADD COLUMN IF NOT EXISTS account_tier TEXT NOT NULL DEFAULT 'CHALLENGE',
  ADD COLUMN IF NOT EXISTS badge_color TEXT NOT NULL DEFAULT 'red',
  ADD COLUMN IF NOT EXISTS is_real_funded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS principal_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS profit_split_percent NUMERIC(5,2) NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS certificate_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS certificate_id TEXT,
  ADD COLUMN IF NOT EXISTS passed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS min_profitable_days INTEGER NOT NULL DEFAULT 5;

CREATE INDEX IF NOT EXISTS idx_purchased_funded_wallets_user_created
  ON public.purchased_funded_wallets (user_id, created_at DESC);

-- 2. Ensure `public.trading_accounts` allows `funded_challenge` account_type
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  IF to_regclass('public.trading_accounts') IS NOT NULL THEN
    FOR v_constraint_name IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'trading_accounts'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%account_type%'
    LOOP
      EXECUTE format('ALTER TABLE public.trading_accounts DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
    END LOOP;

    ALTER TABLE public.trading_accounts
      ADD CONSTRAINT trading_accounts_account_type_check
      CHECK (account_type IN ('funded_challenge', 'one_step', 'two_step', 'instant', 'personal', 'demo'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Enable RLS & configure authenticated owner + admin policies on `purchased_funded_wallets`
ALTER TABLE IF EXISTS public.purchased_funded_wallets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.purchased_funded_wallets TO authenticated;

DROP POLICY IF EXISTS "Users can view own purchased funded wallets" ON public.purchased_funded_wallets;
CREATE POLICY "Users can view own purchased funded wallets"
  ON public.purchased_funded_wallets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own purchased funded wallets" ON public.purchased_funded_wallets;
CREATE POLICY "Users can insert own purchased funded wallets"
  ON public.purchased_funded_wallets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own purchased funded wallets" ON public.purchased_funded_wallets;
CREATE POLICY "Users can update own purchased funded wallets"
  ON public.purchased_funded_wallets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all purchased funded wallets" ON public.purchased_funded_wallets;
CREATE POLICY "Admins can view all purchased funded wallets"
  ON public.purchased_funded_wallets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.role, '')) = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update all purchased funded wallets" ON public.purchased_funded_wallets;
CREATE POLICY "Admins can update all purchased funded wallets"
  ON public.purchased_funded_wallets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.role, '')) = 'admin'
    )
  );

-- 4. Enable RLS & configure authenticated owner + admin policies on `trading_accounts`
DO $$
BEGIN
  IF to_regclass('public.trading_accounts') IS NOT NULL THEN
    ALTER TABLE public.trading_accounts ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE ON public.trading_accounts TO authenticated;

    DROP POLICY IF EXISTS "Users can view own trading accounts" ON public.trading_accounts;
    CREATE POLICY "Users can view own trading accounts"
      ON public.trading_accounts
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can insert own trading accounts" ON public.trading_accounts;
    CREATE POLICY "Users can insert own trading accounts"
      ON public.trading_accounts
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own trading accounts" ON public.trading_accounts;
    CREATE POLICY "Users can update own trading accounts"
      ON public.trading_accounts
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Admins can view all trading accounts" ON public.trading_accounts;
    CREATE POLICY "Admins can view all trading accounts"
      ON public.trading_accounts
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND lower(coalesce(p.role, '')) = 'admin'
        )
      );
  END IF;
END $$;

-- 5. Enable Realtime publication for live updates across tabs/devices
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.purchased_funded_wallets;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_accounts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
