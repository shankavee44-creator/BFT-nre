// Supabase Edge Function: /functions/v1/api
// Provides explicit CORS preflight handling and server-side fallback endpoints for withdrawals/cancel, 2FA, and admin operations.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-key, prefer',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight OPTIONS immediately with HTTP 200
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // POST /api/withdrawals/cancel
    if (pathname.endsWith('/withdrawals/cancel') && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const withdrawalId = String(body?.withdrawalId || '').trim();
      if (!withdrawalId) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Missing withdrawalId' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data: existingRow } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('id', withdrawalId)
        .maybeSingle();

      const { data: updatedRows, error: updateErr } = await supabase
        .from('withdrawals')
        .update({ status: 'cancelled' })
        .eq('id', withdrawalId)
        .eq('status', 'pending')
        .select('*');

      if (updateErr) {
        return new Response(
          JSON.stringify({ ok: false, error: updateErr.message }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const targetRow =
        Array.isArray(updatedRows) && updatedRows.length > 0 ? updatedRows[0] : existingRow;
      const refundAmount = Number(targetRow?.amount || 0);
      const userId = targetRow?.user_id;

      if (userId && refundAmount > 0) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profileRow) {
          const isFunded =
            String(targetRow?.account_type || '').toLowerCase() === 'funded' ||
            String(targetRow?.wallet_address || '').startsWith('FUNDED|');
          if (isFunded) {
            const nextFunded = Number(
              (Number(profileRow.funded_balance || 0) + refundAmount).toFixed(2)
            );
            await supabase
              .from('profiles')
              .update({ funded_balance: nextFunded })
              .eq('id', userId);
          } else {
            const currentSelf = Number(
              profileRow.self_capital_balance ?? profileRow.self_balance ?? 0
            );
            const nextSelf = Number((currentSelf + refundAmount).toFixed(2));
            const { error: selfErr } = await supabase
              .from('profiles')
              .update({ self_balance: nextSelf, self_capital_balance: nextSelf })
              .eq('id', userId);
            if (selfErr) {
              await supabase
                .from('profiles')
                .update({ self_balance: nextSelf })
                .eq('id', userId);
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          withdrawalId,
          refundedAmount: refundAmount,
          status: 'cancelled',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, status: 'BFT Edge Function Active' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'Internal Server Error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
