-- =============================================================================
-- Migration: Affiliate Social Profile One-Time Lock & Country Manager Program
-- =============================================================================

-- 1. Add Affiliate Social Media Submission & One-Time Lock columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS affiliate_profile_locked BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS affiliate_social_platform TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS affiliate_social_links JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS affiliate_social_submitted_at TIMESTAMPTZ;

-- 2. Dedicated affiliate_social_submissions audit/review table
CREATE TABLE IF NOT EXISTS public.affiliate_social_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  platform_type TEXT NOT NULL,
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  affiliate_profile_locked BOOLEAN NOT NULL DEFAULT true,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_social_submissions_user_id ON public.affiliate_social_submissions(user_id);

ALTER TABLE public.affiliate_social_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read affiliate social submissions" ON public.affiliate_social_submissions;
CREATE POLICY "Allow read affiliate social submissions"
  ON public.affiliate_social_submissions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert affiliate social submissions" ON public.affiliate_social_submissions;
CREATE POLICY "Allow insert affiliate social submissions"
  ON public.affiliate_social_submissions
  FOR INSERT
  WITH CHECK (true);

-- 3. BFT Country Manager Applications table
CREATE TABLE IF NOT EXISTS public.country_manager_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_email TEXT,
  full_name TEXT NOT NULL,
  target_country TEXT NOT NULL,
  telegram_handle TEXT NOT NULL,
  estimated_audience_size TEXT NOT NULL,
  marketing_strategy TEXT NOT NULL,
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_referrals_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_country_manager_apps_user_id ON public.country_manager_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_country_manager_apps_status ON public.country_manager_applications(status);
CREATE INDEX IF NOT EXISTS idx_country_manager_apps_created_at ON public.country_manager_applications(created_at DESC);

ALTER TABLE public.country_manager_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read country manager applications" ON public.country_manager_applications;
CREATE POLICY "Allow read country manager applications"
  ON public.country_manager_applications
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert country manager applications" ON public.country_manager_applications;
CREATE POLICY "Allow insert country manager applications"
  ON public.country_manager_applications
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update country manager applications" ON public.country_manager_applications;
CREATE POLICY "Allow update country manager applications"
  ON public.country_manager_applications
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable Realtime replication if supported
ALTER TABLE public.country_manager_applications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'country_manager_applications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.country_manager_applications;
  END IF;
END
$$;
