-- =============================================================================
-- Migration: In-Terminal Trader Live Chat Table, Auto-Moderation Trigger & Realtime
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.trader_live_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  sender_name TEXT NOT NULL DEFAULT 'BFT Trader',
  sender_avatar_url TEXT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trader_live_chat ADD COLUMN IF NOT EXISTS user_id UUID NULL;
ALTER TABLE public.trader_live_chat ADD COLUMN IF NOT EXISTS sender_name TEXT NOT NULL DEFAULT 'BFT Trader';
ALTER TABLE public.trader_live_chat ADD COLUMN IF NOT EXISTS sender_avatar_url TEXT NULL;
ALTER TABLE public.trader_live_chat ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
ALTER TABLE public.trader_live_chat ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_trader_live_chat_created_at
  ON public.trader_live_chat (created_at DESC);

-- Server-side strict auto-moderation trigger (links, phone numbers, profanity, spam)
CREATE OR REPLACE FUNCTION public.moderate_trader_live_chat_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  clean_msg TEXT;
  clean_name TEXT;
  letters_only TEXT;
  upper_only TEXT;
BEGIN
  clean_msg := trim(regexp_replace(coalesce(NEW.message, ''), '\s+', ' ', 'g'));

  IF char_length(clean_msg) < 1 THEN
    RAISE EXCEPTION 'Message cannot be empty.' USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(clean_msg) > 500 THEN
    RAISE EXCEPTION 'Message cannot exceed 500 characters.' USING ERRCODE = 'check_violation';
  END IF;

  -- 1. Block Links / URLs / Domains / Invite handles
  IF clean_msg ~* '(https?://|ftp://|wss?://|www\.|t\.me/|telegram\.me/|wa\.me/|discord\.gg/|discord\.com/invite|chat\.whatsapp\.com|youtu\.be/|bit\.ly/|tinyurl\.com/|[a-z0-9-]+\.(com|net|org|io|co|me|gg|tv|app|dev|xyz|info|biz|club|vip|pro|online|site|shop|cc|lk|uk|us|ru|in|ai|link|live|ly|be)\M)' THEN
    RAISE EXCEPTION 'Links, numbers, and inappropriate messages are automatically blocked.' USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Block Phone Numbers & Long Number Sequences (7+ digits or phone-formatted clusters)
  IF clean_msg ~ '(\d{7,}|(\+?\d[\s\-\(\)\.]*){7,})' THEN
    RAISE EXCEPTION 'Links, numbers, and inappropriate messages are automatically blocked.' USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Block English & Sinhala Profanity / Slurs / Abusive Words
  IF clean_msg ~* '\m(fuck|fucker|fucking|motherfucker|shit|bullshit|bitch|bitches|asshole|bastard|cunt|dickhead|dick|cock|cocksucker|pussy|whore|slut|dumbass|jackass|dipshit|stfu|gtfo|retard|retarded|faggot|fag|nigger|nigga|wanker|twat|prick|f[*@#$_-]+c?k|sh[*@#$_-]+t|b[*@#$_-]+tch|pakaya|pakayo|paka|pako|huththa|huththo|huththi|hutta|hutto|hutti|huttige|huththige|hukanna|hukanawa|hukapan|hukahan|hukana|hukaganna|kariya|kariyo|kari|wesi|vesi|wesige|vesige|wesa|vesa|ponnaya|ponnayo|ponna|ballige|balli|ballo|kimba|kimbak|payiya|paiya|payya|bijja|paraya|parayo|kalakanni|kalakanniya|booruwa|buruwa|puka|puke|modaya|moodaya)\M'
     OR clean_msg ~ '(පකයා|පක|පකෝ|හුත්ත|හුත්තා|හුත්ති|හුත්තෝ|හුත්තිගෙ|හුකන්න|හුකනවා|හුකපන්|කැරියා|කැරි|වේසි|වේස|වේසිගේ|පොන්නයා|පොන්න|බැල්ලි|කිම්බ|පයිය|බිජ්ජ|පුක|කාලකන්නියා|පරයා)' THEN
    RAISE EXCEPTION 'Links, numbers, and inappropriate messages are automatically blocked.' USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Block Character Flood & Repeated-Word Spam
  IF clean_msg ~* '(.)\1{5,}' OR clean_msg ~* '\m([a-z0-9]+)(\s+\1){3,}\M' THEN
    RAISE EXCEPTION 'Links, numbers, and inappropriate messages are automatically blocked.' USING ERRCODE = 'check_violation';
  END IF;

  -- 5. Block All-Caps Shout Messages (>= 15 letters and >= 85% uppercase)
  letters_only := regexp_replace(clean_msg, '[^a-zA-Z]', '', 'g');
  IF char_length(letters_only) >= 15 THEN
    upper_only := regexp_replace(letters_only, '[^A-Z]', '', 'g');
    IF char_length(upper_only)::numeric / char_length(letters_only)::numeric >= 0.85 THEN
      RAISE EXCEPTION 'Links, numbers, and inappropriate messages are automatically blocked.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Sanitize sender_name so no email addresses or long numeric strings ever leak
  clean_name := trim(regexp_replace(coalesce(NEW.sender_name, 'BFT Trader'), '\s+', ' ', 'g'));
  IF clean_name LIKE '%@%' THEN
    clean_name := split_part(clean_name, '@', 1);
  END IF;
  clean_name := trim(regexp_replace(clean_name, '[0-9]{5,}', '', 'g'));
  IF char_length(clean_name) < 1 THEN
    clean_name := 'BFT Trader';
  END IF;

  NEW.message := clean_msg;
  NEW.sender_name := left(clean_name, 48);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_moderate_trader_live_chat ON public.trader_live_chat;
CREATE TRIGGER trg_moderate_trader_live_chat
  BEFORE INSERT OR UPDATE ON public.trader_live_chat
  FOR EACH ROW
  EXECUTE FUNCTION public.moderate_trader_live_chat_message();

-- Row Level Security
ALTER TABLE public.trader_live_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read trader live chat" ON public.trader_live_chat;
CREATE POLICY "Anyone can read trader live chat"
  ON public.trader_live_chat
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Traders can post moderated messages to live chat" ON public.trader_live_chat;
CREATE POLICY "Traders can post moderated messages to live chat"
  ON public.trader_live_chat
  FOR INSERT
  WITH CHECK (true);

-- Enable Realtime replication on trader_live_chat
ALTER TABLE public.trader_live_chat REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'trader_live_chat'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trader_live_chat;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
