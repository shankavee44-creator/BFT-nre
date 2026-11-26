import { TradingAccount } from '../types';
import { supabase } from './supabase';
import {
  getDynamicAccountLimits,
  sanitizeAccountForAntiBreach,
  isPersonalLiveAccount,
  isDemoAccount,
  getPackageSku,
} from './propRules';
import {
  parseChallengePackageFromDeposit,
  resolveDepositAccountType,
  mapPurchaseRecord,
  NormalizedPurchaseRecord,
} from '../config/directDeposit';
import { mapFundedAccountRowToTradingAccount } from './fundedAccountsSync';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extracts `accountId` (or `account_id`) from a URL query string such as `?accountId=BFT-12345`.
 */
export function parseAccountIdFromSearch(search?: string | null): string | null {
  if (!search || typeof search !== 'string') return null;
  try {
    const cleaned = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(cleaned);
    const raw = params.get('accountId') || params.get('account_id') || params.get('account');
    const trimmed = raw ? raw.trim() : '';
    return trimmed || null;
  } catch {
    return null;
  }
}

/**
 * Returns true when `accountId` explicitly targets a non-demo real/challenge/funded account ID.
 */
export function isExplicitNonDemoAccountId(accountId?: string | null): boolean {
  const clean = String(accountId || '').trim();
  if (!clean) return false;
  const lower = clean.toLowerCase();
  return lower !== 'demo' && lower !== 'bft-demo' && lower !== 'bft-demo-001';
}

/**
 * Builds the canonical `/terminal` path carrying `?accountId=...` when an explicit account ID is provided.
 */
export function buildTerminalUrlWithAccountId(
  accountId?: string | null,
  existingSearch?: string | null
): string {
  const cleanId = String(accountId || '').trim();
  const params = new URLSearchParams(
    existingSearch ? (existingSearch.startsWith('?') ? existingSearch.slice(1) : existingSearch) : ''
  );
  params.delete('tab');
  params.delete('account_id');
  params.delete('account');
  if (cleanId) {
    params.set('accountId', cleanId);
  } else {
    params.delete('accountId');
  }
  const qs = params.toString();
  return qs ? `/terminal?${qs}` : '/terminal';
}

/**
 * Matches an account strictly by `id`, `supabaseAccountId`, or `loginId` without falling back to Demo.
 */
export function findMatchingAccount(
  accounts: TradingAccount[],
  targetAccountId?: string | null
): TradingAccount | undefined {
  if (!Array.isArray(accounts) || accounts.length === 0) return undefined;
  const clean = String(targetAccountId || '').trim();
  if (!clean) return undefined;

  const exact = accounts.find(
    (acc) =>
      String(acc.id || '').trim() === clean ||
      (acc.supabaseAccountId && String(acc.supabaseAccountId).trim() === clean) ||
      (acc.loginId && String(acc.loginId).trim() === clean)
  );
  if (exact) return exact;

  if (clean === 'personal_live' || clean.startsWith('BFT-PERS')) {
    return accounts.find((acc) => isPersonalLiveAccount(acc));
  }
  if (clean === 'demo' || clean.startsWith('BFT-DEMO')) {
    return accounts.find((acc) => isDemoAccount(acc));
  }
  return undefined;
}

/**
 * Maps every purchase order 1-to-1 to a matching TradingAccount in `accounts`.
 * Prevents collapsing multiple identical Challenge purchases onto the first account card.
 */
export function mapPurchaseOrdersToAccounts(
  purchases: any[],
  accounts: TradingAccount[]
): Map<string, TradingAccount | null> {
  const result = new Map<string, TradingAccount | null>();
  if (!Array.isArray(purchases) || purchases.length === 0) return result;

  const usedPropAccountIds = new Set<string>();
  const personalAccount = accounts.find((a) => isPersonalLiveAccount(a)) || null;
  const propAccounts = accounts.filter((a) => !isPersonalLiveAccount(a) && !isDemoAccount(a));

  const normalizedList: NormalizedPurchaseRecord[] = purchases.map((raw) => mapPurchaseRecord(raw));

  // Pass 1: Match purchases that carry an explicit `account_id`
  for (const p of normalizedList) {
    const key = String(p.id);
    if (p.account_id) {
      const explicit = findMatchingAccount(accounts, p.account_id);
      if (explicit) {
        result.set(key, explicit);
        if (!isPersonalLiveAccount(explicit) && !isDemoAccount(explicit)) {
          usedPropAccountIds.add(explicit.id);
        }
        continue;
      }
    }
    if (p.account_type === 'self_funded' && personalAccount) {
      result.set(key, personalAccount);
    }
  }

  // Pass 2: Assign remaining completed challenge purchases 1-to-1 to unused prop accounts by SKU
  for (const p of normalizedList) {
    const key = String(p.id);
    if (result.has(key)) continue;

    const status = String(p.status || '').toLowerCase();
    const isCompleted = status === 'completed' || status === 'active' || status === 'approved';
    if (!isCompleted) {
      result.set(key, null);
      continue;
    }

    if (p.account_type === 'self_funded') {
      result.set(key, personalAccount);
      continue;
    }

    const parsedPkg = parseChallengePackageFromDeposit({
      sku: p.package_sku || p.package_id,
      package_sku: p.package_sku || p.package_id,
      package_name: p.package_name,
      amount: Number(p.package_amount || p.amount || 0),
    });

    const skuMatched = propAccounts.find(
      (a) =>
        !usedPropAccountIds.has(a.id) &&
        (getPackageSku(a) === p.package_sku ||
          (a.accountType === parsedPkg.tier && Math.abs(Number(a.size || a.initialBalance) - parsedPkg.size) < 1))
    );

    if (skuMatched) {
      usedPropAccountIds.add(skuMatched.id);
      result.set(key, skuMatched);
      continue;
    }

    const tierMatched = propAccounts.find(
      (a) => !usedPropAccountIds.has(a.id) && a.accountType === parsedPkg.tier
    );
    if (tierMatched) {
      usedPropAccountIds.add(tierMatched.id);
      result.set(key, tierMatched);
      continue;
    }

    const anyUnused = propAccounts.find((a) => !usedPropAccountIds.has(a.id));
    if (anyUnused) {
      usedPropAccountIds.add(anyUnused.id);
      result.set(key, anyUnused);
      continue;
    }

    result.set(key, null);
  }

  return result;
}

/**
 * Constructs a sanitized TradingAccount from any database row
 * (`trading_accounts`, `funded_accounts`, `user_purchases`, or `crypto_deposits`).
 */
export function buildTradingAccountFromDbRow(
  row: Record<string, any>,
  fallbackUser?: { id?: string; email?: string }
): TradingAccount {
  const isPurchaseOrDeposit =
    'package_name' in row ||
    'package_sku' in row ||
    'package_amount' in row ||
    ('amount' in row && !('starting_balance' in row) && !('initial_balance' in row));

  if (isPurchaseOrDeposit) {
    const depType = resolveDepositAccountType(row.account_type || row.accountType);
    const amountNum = Number(row.package_amount ?? row.amount ?? 0);
    const explicitAccId = String(row.account_id || row.accountId || row.id || `ACC-${Date.now()}`).trim();
    const today = new Date().toISOString().split('T')[0];

    if (depType === 'self_funded') {
      const bal = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 0;
      return sanitizeAccountForAntiBreach({
        id: explicitAccId,
        supabaseAccountId: row.account_id ? String(row.account_id) : undefined,
        ownerId: String(row.user_id || fallbackUser?.id || ''),
        ownerEmail: fallbackUser?.email,
        loginId: explicitAccId,
        passwordHash: 'bft_live_' + explicitAccId.slice(0, 8),
        tier: 'personal',
        accountType: 'personal',
        accountCategory: 'personal_live',
        tierName: 'Personal Live Balance (Self-Funded)',
        depositedCapital: bal,
        size: bal,
        initialBalance: bal,
        currentBalance: bal,
        startingDayEquity: bal,
        equity: bal,
        dailyLossLimitPercent: 0,
        maxOverallLossPercent: 0,
        profitTargetPercent: 0,
        maxRiskPerTradePercent: 100,
        status: 'active',
        phase: 'personal_live',
        tradingDaysCompleted: 0,
        tradesCount: 0,
        winRate: 0,
        createdDate: row.created_at ? String(row.created_at).split('T')[0] : today,
        lastActiveDate: today,
      });
    }

    const parsedPkg = parseChallengePackageFromDeposit({
      sku: row.package_sku || row.sku || row.package_id,
      package_sku: row.package_sku || row.sku || row.package_id,
      package_name: row.package_name || row.tier_name,
      amount: amountNum,
    });
    const phase = parsedPkg.tier === 'instant' ? 'funded' : 'phase_1';
    const limits = getDynamicAccountLimits(parsedPkg.tier, phase);
    const startBal = parsedPkg.size;

    return sanitizeAccountForAntiBreach({
      id: explicitAccId,
      supabaseAccountId: row.account_id ? String(row.account_id) : undefined,
      ownerId: String(row.user_id || fallbackUser?.id || ''),
      ownerEmail: fallbackUser?.email,
      loginId: explicitAccId,
      passwordHash: 'bft_live_' + explicitAccId.slice(0, 8),
      tier: limits.tier,
      accountType: limits.accountType,
      tierName: parsedPkg.tierName,
      size: startBal,
      initialBalance: startBal,
      currentBalance: startBal,
      startingDayEquity: startBal,
      equity: startBal,
      dailyLossLimitPercent: limits.dailyLossLimitPercent,
      maxOverallLossPercent: limits.maxOverallLossPercent,
      profitTargetPercent: limits.profitTargetPercent,
      maxRiskPerTradePercent: limits.maxRiskPerTradePercent || 5,
      status: 'active',
      phase,
      challengePhase: phase,
      tradingDaysCompleted: 0,
      tradesCount: 0,
      winRate: 0,
      createdDate: row.created_at ? String(row.created_at).split('T')[0] : today,
      lastActiveDate: today,
    });
  }

  // Direct public.funded_accounts row (account_size, paid_amount, current_balance, status)
  if (row.account_size !== undefined && row.account_size !== null) {
    return mapFundedAccountRowToTradingAccount(row, fallbackUser?.email);
  }

  // Standard trading_accounts / SQLite accounts row
  const phase = (row.challenge_phase || row.phase || undefined) as any;
  const limits = getDynamicAccountLimits(row.account_type || row.tier || 'two_step', phase);
  const startBal = Number(row.starting_balance ?? row.initial_balance ?? row.size ?? 10000) || 10000;
  const curBalCandidate = Number(row.current_balance ?? row.currentBalance ?? row.balance);
  const curBal = Number.isFinite(curBalCandidate) ? curBalCandidate : startBal;
  const eqCandidate = Number(row.equity);
  const eq = Number.isFinite(eqCandidate) ? eqCandidate : curBal;
  const accId = String(row.id || row.account_id || `ACC-${Date.now()}`).trim();
  const today = new Date().toISOString().split('T')[0];

  return sanitizeAccountForAntiBreach({
    id: accId,
    supabaseAccountId: row.id ? String(row.id) : undefined,
    ownerId: row.user_id ? String(row.user_id) : fallbackUser?.id,
    ownerEmail: fallbackUser?.email,
    loginId: String(row.login_id || row.loginId || accId),
    passwordHash: String(row.password_hash || row.passwordHash || 'bft_live_' + accId.slice(0, 8)),
    tier: limits.tier,
    accountType: limits.accountType,
    accountCategory: row.account_category || row.accountCategory,
    tierName:
      row.tier_name ||
      row.tierName ||
      (limits.accountType === 'one_step'
        ? 'One-Step Challenge'
        : limits.accountType === 'two_step'
        ? 'Two-Step Challenge'
        : limits.accountType === 'instant'
        ? 'Instant Funded'
        : 'Personal Live Balance (Self-Funded)'),
    depositedCapital: row.deposited_capital !== undefined ? Number(row.deposited_capital) : undefined,
    size: Number(row.size || startBal),
    initialBalance: startBal,
    currentBalance: curBal,
    startingDayEquity: Number(row.starting_day_equity ?? row.startingDayEquity ?? curBal),
    equity: eq,
    dailyLossLimitPercent:
      row.daily_drawdown !== undefined
        ? Number(row.daily_drawdown)
        : row.daily_loss_limit_percent !== undefined
        ? Number(row.daily_loss_limit_percent)
        : limits.dailyLossLimitPercent,
    maxOverallLossPercent:
      row.max_drawdown !== undefined
        ? Number(row.max_drawdown)
        : row.max_overall_loss_percent !== undefined
        ? Number(row.max_overall_loss_percent)
        : limits.maxOverallLossPercent,
    profitTargetPercent:
      row.profit_target !== undefined ? Number(row.profit_target) : limits.profitTargetPercent,
    maxRiskPerTradePercent: Number(row.max_risk_per_trade_percent ?? limits.maxRiskPerTradePercent ?? 5),
    status: (row.status as any) || 'active',
    phase: phase || limits.initialPhase,
    challengePhase: phase || limits.initialPhase,
    tradingDaysCompleted: Number(row.trading_days_completed ?? row.tradingDaysCompleted ?? 0),
    tradesCount: Number(row.trades_count ?? row.tradesCount ?? 0),
    winRate: Number(row.win_rate ?? row.winRate ?? 0),
    createdDate: row.created_date || (row.created_at ? String(row.created_at).split('T')[0] : today),
    lastActiveDate: row.updated_at ? String(row.updated_at).split('T')[0] : today,
  });
}

/**
 * Fetches an explicit account by ID or purchase ID across backend API and Supabase tables
 * (`trading_accounts`, optional `funded_accounts`, `user_purchases`, `crypto_deposits`).
 * Never returns a Demo account unless explicitly requested.
 */
export async function fetchAccountByIdFromDatabase(
  targetId: string,
  opts?: { userId?: string; userEmail?: string }
): Promise<TradingAccount | null> {
  const cleanId = String(targetId || '').trim();
  if (!cleanId || !isExplicitNonDemoAccountId(cleanId)) return null;

  // 1. Check backend Express API first (single account + user's accounts + user's purchases)
  try {
    const querySuffix = opts?.userId
      ? `?userId=${encodeURIComponent(opts.userId)}${opts?.userEmail ? `&email=${encodeURIComponent(opts.userEmail)}` : ''}`
      : '';
    const [accSingleRes, accListRes, purRes] = await Promise.all([
      fetch(`/api/accounts/${encodeURIComponent(cleanId)}${querySuffix}`, { credentials: 'include' }).catch(() => null),
      fetch(`/api/accounts${querySuffix}`, { credentials: 'include' }).catch(() => null),
      fetch(`/api/purchases${querySuffix}`, { credentials: 'include' }).catch(() => null),
    ]);

    if (accSingleRes?.ok) {
      const data = await accSingleRes.json().catch(() => null);
      if (data?.ok && data?.account) {
        return buildTradingAccountFromDbRow(data.account, { id: opts?.userId, email: opts?.userEmail });
      }
    }

    if (accListRes?.ok) {
      const data = await accListRes.json().catch(() => null);
      if (data?.ok && Array.isArray(data.accounts)) {
        const mapped = data.accounts.map((r: any) =>
          buildTradingAccountFromDbRow(r, { id: opts?.userId, email: opts?.userEmail })
        );
        const found = findMatchingAccount(mapped, cleanId);
        if (found) return found;
      }
    }

    if (purRes?.ok) {
      const data = await purRes.json().catch(() => null);
      if (data?.ok && Array.isArray(data.purchases)) {
        const matchedPurchase = data.purchases.find(
          (p: any) => String(p.id) === cleanId || String(p.account_id || '') === cleanId
        );
        if (matchedPurchase) {
          return buildTradingAccountFromDbRow(matchedPurchase, {
            id: opts?.userId,
            email: opts?.userEmail,
          });
        }
      }
    }
  } catch {
    // continue to Supabase direct queries
  }

  // 2. Check Supabase `trading_accounts` (by id or login_id)
  try {
    if (UUID_REGEX.test(cleanId)) {
      const { data, error } = await supabase
        .from('trading_accounts')
        .select('*')
        .eq('id', cleanId)
        .limit(1);
      if (!error && Array.isArray(data) && data.length > 0) {
        return buildTradingAccountFromDbRow(data[0], { id: opts?.userId, email: opts?.userEmail });
      }
    }

    const { data: loginData, error: loginErr } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('login_id', cleanId)
      .limit(1);
    if (!loginErr && Array.isArray(loginData) && loginData.length > 0) {
      return buildTradingAccountFromDbRow(loginData[0], { id: opts?.userId, email: opts?.userEmail });
    }
  } catch {
    // ignore
  }

  // 3. Check optional Supabase `funded_accounts` table gracefully
  try {
    const { data: fundedData, error: fundedErr } = await supabase
      .from('funded_accounts')
      .select('*')
      .eq('id', cleanId)
      .limit(1);
    if (!fundedErr && Array.isArray(fundedData) && fundedData.length > 0) {
      return buildTradingAccountFromDbRow(fundedData[0], { id: opts?.userId, email: opts?.userEmail });
    }
  } catch {
    // ignore missing funded_accounts table
  }

  // 4. Check Supabase `user_purchases` (by id or account_id)
  try {
    const { data: purById } = await supabase
      .from('user_purchases')
      .select('*')
      .eq('id', cleanId)
      .limit(1);
    if (Array.isArray(purById) && purById.length > 0) {
      return buildTradingAccountFromDbRow(purById[0], { id: opts?.userId, email: opts?.userEmail });
    }

    const { data: purByAccId } = await supabase
      .from('user_purchases')
      .select('*')
      .eq('account_id', cleanId)
      .limit(1);
    if (Array.isArray(purByAccId) && purByAccId.length > 0) {
      return buildTradingAccountFromDbRow(purByAccId[0], { id: opts?.userId, email: opts?.userEmail });
    }
  } catch {
    // ignore
  }

  // 5. Check Supabase `crypto_deposits` (by id or account_id)
  try {
    const { data: depById } = await supabase
      .from('crypto_deposits')
      .select('*')
      .eq('id', cleanId)
      .limit(1);
    if (Array.isArray(depById) && depById.length > 0) {
      return buildTradingAccountFromDbRow(depById[0], { id: opts?.userId, email: opts?.userEmail });
    }
  } catch {
    // ignore
  }

  return null;
}
