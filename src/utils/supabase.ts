import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kwmjonjcwdwvaijcrtjw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G151L79Inh_SPks_HrujZQ_fmaGh-_6';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
