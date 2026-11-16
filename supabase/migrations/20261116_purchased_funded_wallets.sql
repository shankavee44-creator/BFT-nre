-- Additive migration for Funded Account Breach Control & Real-Time Analytics
-- Preserves 100% compatibility with all existing tables.

CREATE TABLE IF NOT EXISTS public.purchased_funded_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text UNIQUE NOT NULL,
  user_id text NOT NULL,
  challenge_type text NOT NULL DEFAULT 'Two-Step Challenge',
  account_status text NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'PASSED', 'SOFT_BREACH', 'HARD_BREACH')),
  soft_breach_until timestamptz NULL,
  breach_reason text NULL,
  initial_balance numeric(14, 2) NOT NULL DEFAULT 10000,
  current_balance numeric(14, 2) NOT NULL DEFAULT 10000,
  current_equity numeric(14, 2) NOT NULL DEFAULT 10000,
  current_profit_amount numeric(14, 2) NOT NULL DEFAULT 0,
  profit_target_amount numeric(14, 2) NOT NULL DEFAULT 2500,
  profit_target_percent numeric(6, 2) NOT NULL DEFAULT 25,
  current_daily_drawdown numeric(14, 2) NOT NULL DEFAULT 0,
  daily_drawdown_limit_amount numeric(14, 2) NOT NULL DEFAULT 800,
  daily_drawdown_limit_percent numeric(6, 2) NOT NULL DEFAULT 8,
  current_max_drawdown numeric(14, 2) NOT NULL DEFAULT 0,
  max_drawdown_limit_amount numeric(14, 2) NOT NULL DEFAULT 2000,
  max_drawdown_limit_percent numeric(6, 2) NOT NULL DEFAULT 20,
  completed_profitable_days integer NOT NULL DEFAULT 0,
  min_profitable_days integer NOT NULL DEFAULT 5,
  daily_net_profit numeric(14, 2) NOT NULL DEFAULT 0,
  daily_profit_date text NULL,
  last_profitable_day_date text NULL,
  starting_day_balance numeric(14, 2) NOT NULL DEFAULT 10000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchased_funded_wallets_user_id ON public.purchased_funded_wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_purchased_funded_wallets_account_id ON public.purchased_funded_wallets (account_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'purchased_funded_wallets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchased_funded_wallets;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
