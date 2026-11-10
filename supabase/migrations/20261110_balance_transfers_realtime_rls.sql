-- =============================================================================
-- Migration: P2P Balance Transfers Table, RLS Policies & Realtime Publication
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.balance_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_numeric_id TEXT,
  receiver_numeric_id TEXT,
  sender_name TEXT,
  receiver_name TEXT,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table was created earlier with partial columns
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS sender_id UUID;
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS receiver_id UUID;
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS sender_numeric_id TEXT;
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS receiver_numeric_id TEXT;
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS receiver_name TEXT;
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS amount NUMERIC(18, 2);
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE public.balance_transfers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_balance_transfers_sender_id ON public.balance_transfers(sender_id);
CREATE INDEX IF NOT EXISTS idx_balance_transfers_receiver_id ON public.balance_transfers(receiver_id);
CREATE INDEX IF NOT EXISTS idx_balance_transfers_created_at ON public.balance_transfers(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.balance_transfers ENABLE ROW LEVEL SECURITY;

-- Allow users to SELECT rows where auth.uid() = sender_id OR auth.uid() = receiver_id
DROP POLICY IF EXISTS "Users can view their own sent or received balance transfers" ON public.balance_transfers;
CREATE POLICY "Users can view their own sent or received balance transfers"
  ON public.balance_transfers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Allow authenticated users to INSERT rows where auth.uid() = sender_id
DROP POLICY IF EXISTS "Users can insert their own outgoing balance transfers" ON public.balance_transfers;
CREATE POLICY "Users can insert their own outgoing balance transfers"
  ON public.balance_transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Enable Realtime replication on balance_transfers and add to supabase_realtime publication
ALTER TABLE public.balance_transfers REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'balance_transfers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.balance_transfers;
  END IF;
END
$$;
