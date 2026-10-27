import {
  UserAccount,
  ReferralRecord,
  AffiliatePayout,
  AffiliateStats,
  ChallengeTier,
} from '../types';

export type { UserAccount, ReferralRecord, AffiliatePayout, AffiliateStats };

// ==========================================
// 1. COOKIE & CLIENT PERSISTENCE (30-DAY TTL)
// ==========================================

export const COOKIE_NAME = 'bft_ref_code';
export const COOKIE_EXPIRY_DAYS = 30;
export const LOCAL_STORAGE_REF_KEY = 'bft_affiliate_referral_code';
export const LOCAL_STORAGE_REF_TS_KEY = 'bft_affiliate_referral_timestamp';

/**
 * Parses browser cookies and returns the value for the given key.
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Sets a browser cookie with strict 30-day lifetime and path=/
 */
export function setCookie(name: string, value: string, days: number = COOKIE_EXPIRY_DAYS): void {
  if (typeof document === 'undefined') return;
  const maxAgeSeconds = days * 24 * 60 * 60;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSeconds}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Removes a cookie.
 */
export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

/**
 * Saves referral code with 30-day persistence in cookie AND localStorage fallback.
 */
export function storeReferralCode(code: string, currentUserId?: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length < 3) return false;

  // Prevent self-referral if current user has the same referral code
  if (currentUserId && isSelfReferral(cleanCode, currentUserId)) {
    return false;
  }

  try {
    setCookie(COOKIE_NAME, cleanCode, COOKIE_EXPIRY_DAYS);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_REF_KEY, cleanCode);
      localStorage.setItem(LOCAL_STORAGE_REF_TS_KEY, Date.now().toString());
    }
    return true;
  } catch (e) {
    console.error('Failed to store referral code', e);
    return false;
  }
}

/**
 * Retrieves the currently active stored referral code (checking cookie first, then localStorage).
 * Enforces the strict 30-day expiration window.
 */
export function getStoredReferralCode(): string | null {
  try {
    // 1. Try Cookie
    const fromCookie = getCookie(COOKIE_NAME);
    if (fromCookie) return fromCookie.toUpperCase();

    // 2. Try LocalStorage Fallback with timestamp validation
    if (typeof localStorage !== 'undefined') {
      const code = localStorage.getItem(LOCAL_STORAGE_REF_KEY);
      const tsRaw = localStorage.getItem(LOCAL_STORAGE_REF_TS_KEY);
      if (code && tsRaw) {
        const ts = parseInt(tsRaw, 10);
        const age = Date.now() - ts;
        const maxAge = COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        if (age <= maxAge) {
          // Re-sync to cookie
          setCookie(COOKIE_NAME, code, COOKIE_EXPIRY_DAYS);
          return code.toUpperCase();
        } else {
          clearStoredReferralCode();
        }
      }
    }
  } catch {
    // Fallback
  }
  return null;
}

/**
 * Clears referral tracking from cookies and localStorage.
 */
export function clearStoredReferralCode(): void {
  deleteCookie(COOKIE_NAME);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_REF_KEY);
      localStorage.removeItem(LOCAL_STORAGE_REF_TS_KEY);
    }
  } catch {
    // Fallback
  }
}

/**
 * Extracts '?ref=CODE' parameter from URL if present and persists it in a 30-day cookie.
 */
export function checkUrlForReferralCode(currentUserId?: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref') || urlParams.get('affiliate') || urlParams.get('r');
    if (refParam) {
      const stored = storeReferralCode(refParam, currentUserId);
      if (stored) return refParam.toUpperCase();
    }
  } catch {
    // Fallback
  }
  return getStoredReferralCode();
}

/**
 * Checks if the current browser URL explicitly contains a '?ref=CODE' parameter
 * so the application can automatically open the Registration modal pre-filled.
 */
export function hasDirectReferralUrlParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref') || urlParams.get('affiliate') || urlParams.get('r');
    if (refParam && refParam.trim().length >= 3) {
      return refParam.trim().toUpperCase();
    }
  } catch {
    // Fallback
  }
  return null;
}

/**
 * Validates a sponsor referral code and returns the matching sponsor UserAccount if found.
 */
export function validateSponsorReferralCode(
  code: string,
  usersList?: UserAccount[]
): { valid: boolean; sponsor?: UserAccount; normalizedCode: string } {
  const normalizedCode = (code || '').trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length < 3) {
    return { valid: false, normalizedCode };
  }
  const users = usersList || loadAffiliateUsers();
  const sponsor = users.find((u) => u.referralCode.toUpperCase() === normalizedCode);
  if (sponsor) {
    return { valid: true, sponsor, normalizedCode };
  }
  // Also accept valid BFT-* format codes even if external partner
  const isFormatValid = /^BFT-[A-Z0-9]{3,12}$/.test(normalizedCode) || /^[A-Z0-9_-]{4,16}$/.test(normalizedCode);
  return { valid: isFormatValid, normalizedCode };
}

/**
 * Resolves the complete 3-tier upline hierarchy (Level 1 Sponsor, Level 2 Upline, Level 3 Upline)
 * for a given referral code.
 */
export function resolve3TierUplineChain(
  code: string,
  usersList?: UserAccount[]
): {
  level1?: UserAccount;
  level2?: UserAccount;
  level3?: UserAccount;
} {
  const normalizedCode = (code || '').trim().toUpperCase();
  if (!normalizedCode) return {};
  const users = usersList || loadAffiliateUsers();
  const level1 = users.find((u) => u.referralCode.toUpperCase() === normalizedCode);
  if (!level1) return {};
  const level2 = level1.referredBy ? users.find((u) => u.id === level1.referredBy) : undefined;
  const level3 = level2?.referredBy ? users.find((u) => u.id === level2.referredBy) : undefined;
  return { level1, level2, level3 };
}

/**
 * Fraud prevention: Check if code belongs to current user.
 */
export function isSelfReferral(referralCode: string, currentUserId: string, users?: UserAccount[]): boolean {
  if (!referralCode || !currentUserId) return false;
  const userList = users || INITIAL_USERS;
  const currentUser = userList.find((u) => u.id === currentUserId);
  if (!currentUser) return false;
  return currentUser.referralCode.toUpperCase() === referralCode.toUpperCase();
}

// ==========================================
// 2. INITIAL DATABASE SEED DATA
// ==========================================

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'USR-MASTER-88',
    name: 'Viktor Vance',
    email: 'viktor.v@quant-prop.io',
    referralCode: 'BFT-VIKTOR88',
    createdAt: '2026-08-01',
  },
  {
    id: 'USR-PARENT-55',
    name: 'Elena Rostova',
    email: 'elena.rostova@alpha-traders.com',
    referralCode: 'BFT-ELENA55',
    referredBy: 'USR-MASTER-88',
    createdAt: '2026-08-20',
  },
  {
    id: 'usr_bft_001', // Logged in user: Alex Mercer
    name: 'Alex Mercer',
    email: 'trader.pro@bft-capital.com',
    referralCode: 'BFT-ALEX77',
    referredBy: 'USR-PARENT-55',
    createdAt: '2026-09-01',
  },
  {
    id: 'USR-SUB-101', // Level 1 direct referral of Alex
    name: 'Marco Rossi',
    email: 'marco.rossi@milan-fx.it',
    referralCode: 'BFT-MARCO101',
    referredBy: 'usr_bft_001',
    createdAt: '2026-09-15',
  },
  {
    id: 'USR-SUB-102', // Level 1 direct referral of Alex
    name: 'Liam Davies',
    email: 'liam.davies@london-capital.uk',
    referralCode: 'BFT-LIAM102',
    referredBy: 'usr_bft_001',
    createdAt: '2026-09-28',
  },
  {
    id: 'USR-GRAND-201', // Level 2 referral of Alex (referred by Marco)
    name: 'Sophia Chen',
    email: 'sophia.chen@sg-wealth.sg',
    referralCode: 'BFT-SOPHIA201',
    referredBy: 'USR-SUB-101',
    createdAt: '2026-10-02',
  },
  {
    id: 'USR-GRAND-202', // Level 2 referral of Alex (referred by Liam)
    name: 'Lucas Bernard',
    email: 'lucas.b@paris-quant.fr',
    referralCode: 'BFT-LUCAS202',
    referredBy: 'USR-SUB-102',
    createdAt: '2026-10-10',
  },
  {
    id: 'USR-LEAF-301', // Level 3 referral of Alex (referred by Sophia)
    name: 'David Miller',
    email: 'd.miller@austin-trader.us',
    referralCode: 'BFT-DAVID301',
    referredBy: 'USR-GRAND-201',
    createdAt: '2026-10-14',
  },
  {
    id: 'USR-LEAF-302', // Level 3 referral of Alex (referred by Lucas)
    name: 'Kaito Tanaka',
    email: 'kaito.t@tokyo-options.jp',
    referralCode: 'BFT-KAITO302',
    referredBy: 'USR-GRAND-202',
    createdAt: '2026-10-18',
  },
];

export const INITIAL_REFERRALS: ReferralRecord[] = [
  {
    id: 'REF-1001',
    referrerId: 'usr_bft_001',
    referredUserId: 'USR-SUB-101',
    referredUserName: 'Marco Rossi',
    referredUserEmail: 'm***i@milan-fx.it',
    level: 1,
    packageTier: 'one-step',
    packageName: 'One-Step Challenge ($10,000)',
    packagePrice: 89,
    commissionRate: 0.17,
    commissionAmount: 15.13,
    status: 'paid',
    createdAt: '2026-09-18T14:22:00Z',
  },
  {
    id: 'REF-1002',
    referrerId: 'usr_bft_001',
    referredUserId: 'USR-SUB-102',
    referredUserName: 'Liam Davies',
    referredUserEmail: 'l***s@london-capital.uk',
    level: 1,
    packageTier: 'instant',
    packageName: 'Instant Funded ($25,000)',
    packagePrice: 499,
    commissionRate: 0.17,
    commissionAmount: 84.83,
    status: 'paid',
    createdAt: '2026-09-29T10:15:00Z',
  },
  {
    id: 'REF-1003',
    referrerId: 'usr_bft_001',
    referredUserId: 'USR-GRAND-201',
    referredUserName: 'Sophia Chen',
    referredUserEmail: 's***n@sg-wealth.sg',
    level: 2,
    packageTier: 'two-step',
    packageName: 'Two-Step Challenge ($50,000)',
    packagePrice: 279,
    commissionRate: 0.05,
    commissionAmount: 13.95,
    status: 'paid',
    createdAt: '2026-10-04T18:40:00Z',
  },
  {
    id: 'REF-1004',
    referrerId: 'usr_bft_001',
    referredUserId: 'USR-GRAND-202',
    referredUserName: 'Lucas Bernard',
    referredUserEmail: 'l***d@paris-quant.fr',
    level: 2,
    packageTier: 'instant',
    packageName: 'Instant Funded ($10,000)',
    packagePrice: 249,
    commissionRate: 0.05,
    commissionAmount: 12.45,
    status: 'paid',
    createdAt: '2026-10-12T09:30:00Z',
  },
  {
    id: 'REF-1005',
    referrerId: 'usr_bft_001',
    referredUserId: 'USR-LEAF-301',
    referredUserName: 'David Miller',
    referredUserEmail: 'd***r@austin-trader.us',
    level: 3,
    packageTier: 'instant',
    packageName: 'Instant Funded ($50,000)',
    packagePrice: 899,
    commissionRate: 0.02,
    commissionAmount: 17.98,
    status: 'paid',
    createdAt: '2026-10-15T16:05:00Z',
  },
  {
    id: 'REF-1006',
    referrerId: 'usr_bft_001',
    referredUserId: 'USR-LEAF-302',
    referredUserName: 'Kaito Tanaka',
    referredUserEmail: 'k***a@tokyo-options.jp',
    level: 3,
    packageTier: 'one-step',
    packageName: 'One-Step Challenge ($100,000)',
    packagePrice: 549,
    commissionRate: 0.02,
    commissionAmount: 10.98,
    status: 'paid',
    createdAt: '2026-10-20T11:55:00Z',
  },
  {
    id: 'REF-1007',
    referrerId: 'usr_bft_001',
    referredUserId: 'USR-SUB-101',
    referredUserName: 'Marco Rossi',
    referredUserEmail: 'm***i@milan-fx.it',
    level: 1,
    commissionType: 'package',
    packageTier: 'two-step',
    packageName: 'Two-Step Challenge ($100,000)',
    packagePrice: 469,
    commissionRate: 0.17,
    commissionAmount: 79.73,
    status: 'paid',
    createdAt: '2026-10-22T08:14:00Z',
  },
  {
    id: 'REF-1008',
    referrerId: 'usr_bft_001',
    referredUserId: 'USR-SUB-102',
    referredUserName: 'Liam Davies',
    referredUserEmail: 'l***s@london-capital.uk',
    level: 1,
    commissionType: 'withdrawal',
    packageTier: 'instant',
    packageName: 'Profit Payout Royalty (8% of $500 Withdrawal)',
    packagePrice: 500,
    commissionRate: 0.08,
    commissionAmount: 40.00,
    status: 'paid',
    createdAt: '2026-10-24T15:30:00Z',
  },
];

export const INITIAL_PAYOUTS: AffiliatePayout[] = [
  {
    id: 'AFF-PAY-801',
    userId: 'usr_bft_001',
    amount: 60.00,
    method: 'USDT (TRC-20)',
    details: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    status: 'completed',
    requestedAt: '2026-10-01T12:00:00Z',
    processedAt: '2026-10-01T12:03:12Z',
    txHash: 'c7901b44d32a90e84bfa1098b64e521098acbf229e1',
  },
];

// ==========================================
// 3. STORAGE ACCESSORS FOR AFFILIATE DATA
// ==========================================

const AFFILIATE_KEYS = {
  USERS: 'bft_affiliate_users',
  REFERRALS: 'bft_affiliate_referrals',
  PAYOUTS: 'bft_affiliate_payouts',
};

export function loadAffiliateUsers(): UserAccount[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AFFILIATE_KEYS.USERS);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return INITIAL_USERS;
}

export function saveAffiliateUsers(users: UserAccount[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AFFILIATE_KEYS.USERS, JSON.stringify(users));
    }
  } catch (e) {
    console.error('Failed to save affiliate users', e);
  }
}

export function loadAffiliateReferrals(): ReferralRecord[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AFFILIATE_KEYS.REFERRALS);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return INITIAL_REFERRALS;
}

export function saveAffiliateReferrals(referrals: ReferralRecord[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AFFILIATE_KEYS.REFERRALS, JSON.stringify(referrals));
    }
  } catch (e) {
    console.error('Failed to save affiliate referrals', e);
  }
}

export function loadAffiliatePayouts(): AffiliatePayout[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AFFILIATE_KEYS.PAYOUTS);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return INITIAL_PAYOUTS;
}

export function saveAffiliatePayouts(payouts: AffiliatePayout[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AFFILIATE_KEYS.PAYOUTS, JSON.stringify(payouts));
    }
  } catch (e) {
    console.error('Failed to save affiliate payouts', e);
  }
}

// ==========================================
// 4. 3-TIER COMMISSION CHAIN CALCULATION
// ==========================================

export const COMMISSION_RATES = {
  LEVEL_1: 0.17, // 17% Direct Referrer
  LEVEL_2: 0.05, // 5% Sub-Affiliate
  LEVEL_3: 0.02, // 2% Extended Network
  TOTAL_PACKAGE: 0.24, // 17% + 5% + 2% = 24% Total 3-Tier Package Commission
  WITHDRAWAL_ROYALTY: 0.08, // 8% Referral Profit Withdrawal Commission
};

export interface ProcessCommissionsResult {
  newReferrals: ReferralRecord[];
  allReferrals: ReferralRecord[];
  updatedUsers: UserAccount[];
}

/**
 * Registers a new user account upon Sign Up and attributes them to their Level 1 sponsor
 * using the explicit referralCode or the 30-day stored referral cookie.
 */
export function registerNewUserAccount(params: {
  name: string;
  email: string;
  password?: string;
  referralCodeInput?: string | null;
  users?: UserAccount[];
  existingUsers?: UserAccount[];
}): {
  newUser: UserAccount;
  sponsor?: UserAccount;
  uplineChain: {
    level1?: UserAccount;
    level2?: UserAccount;
    level3?: UserAccount;
  };
  updatedUsers: UserAccount[];
} {
  const users = [...(params.users || params.existingUsers || loadAffiliateUsers())];
  const effectiveRefCode = (params.referralCodeInput || getStoredReferralCode() || '').trim().toUpperCase();

  let sponsor: UserAccount | undefined;
  if (effectiveRefCode) {
    sponsor = users.find((u) => u.referralCode.toUpperCase() === effectiveRefCode);
    // Ensure cookie is synced with the effective referral code
    storeReferralCode(effectiveRefCode);
  }

  const uplineChain = resolve3TierUplineChain(effectiveRefCode, users);

  // Check if user already exists by email
  const existing = users.find((u) => u.email.toLowerCase() === params.email.trim().toLowerCase());
  if (existing) {
    if (!existing.referredBy && sponsor && sponsor.id !== existing.id) {
      existing.referredBy = sponsor.id;
      saveAffiliateUsers(users);
    }
    return { newUser: existing, sponsor, uplineChain, updatedUsers: users };
  }

  const cleanPrefix = params.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'TRDR';
  const newUser: UserAccount = {
    id: `usr_bft_${Date.now().toString().slice(-5)}`,
    name: params.name.trim(),
    email: params.email.trim(),
    password: params.password,
    referralCode: `BFT-${cleanPrefix}${Math.floor(10 + Math.random() * 89)}`,
    referredBy: sponsor?.id,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveAffiliateUsers(users);

  return { newUser, sponsor, uplineChain, updatedUsers: users };
}

/**
 * Awards an extra 8% withdrawal commission to the direct referrer when a referred trader processes a payout.
 */
export function processWithdrawalCommission(params: {
  traderUserId: string;
  traderName: string;
  traderEmail: string;
  withdrawalAmount: number;
  users?: UserAccount[];
  existingReferrals?: ReferralRecord[];
}): {
  commissionRecord?: ReferralRecord;
  allReferrals: ReferralRecord[];
} {
  const users = params.users || loadAffiliateUsers();
  const referrals = [...(params.existingReferrals || loadAffiliateReferrals())];

  const trader = users.find((u) => u.id === params.traderUserId);
  const referrerId = trader?.referredBy || 'usr_bft_001'; // Default to active affiliate demo chain if needed
  const sponsor = users.find((u) => u.id === referrerId);

  if (!sponsor || sponsor.id === params.traderUserId) {
    return { allReferrals: referrals };
  }

  const commissionAmount = Number((params.withdrawalAmount * COMMISSION_RATES.WITHDRAWAL_ROYALTY).toFixed(2));
  const record: ReferralRecord = {
    id: `REF-WD-${Date.now().toString().slice(-5)}`,
    referrerId: sponsor.id,
    referredUserId: params.traderUserId,
    referredUserName: params.traderName,
    referredUserEmail: maskEmail(params.traderEmail),
    level: 1,
    commissionType: 'withdrawal',
    packageTier: 'instant',
    packageName: `Profit Payout Royalty (8% of $${params.withdrawalAmount.toFixed(0)} Withdrawal)`,
    packagePrice: params.withdrawalAmount,
    commissionRate: COMMISSION_RATES.WITHDRAWAL_ROYALTY,
    commissionAmount,
    status: 'paid',
    createdAt: new Date().toISOString(),
  };

  referrals.unshift(record);
  saveAffiliateReferrals(referrals);

  return {
    commissionRecord: record,
    allReferrals: referrals,
  };
}

/**
 * Calculates and awards 3-tier multi-level commissions upon verified package payment.
 *
 * Level 1: Direct Referrer (17%)
 * Level 2: Parent of Direct Referrer (5%)
 * Level 3: Grandparent of Direct Referrer (2%)
 *
 * Enforces strict fraud prevention: Self-referrals are rejected.
 */
export function process3TierCommissions(params: {
  buyerUserId: string;
  buyerName: string;
  buyerEmail: string;
  packageTier: ChallengeTier;
  packageName: string;
  packagePrice: number;
  referralCodeUsed?: string | null;
  users?: UserAccount[];
  existingReferrals?: ReferralRecord[];
}): ProcessCommissionsResult {
  const {
    buyerUserId,
    buyerName,
    buyerEmail,
    packageTier,
    packageName,
    packagePrice,
    referralCodeUsed,
  } = params;

  const users = [...(params.users || loadAffiliateUsers())];
  const referrals = [...(params.existingReferrals || loadAffiliateReferrals())];
  const newReferrals: ReferralRecord[] = [];

  // Ensure buyer user exists or is registered
  let buyer = users.find((u) => u.id === buyerUserId);
  if (!buyer) {
    // Check if referral code was used to find parent
    let parentId: string | undefined = undefined;
    if (referralCodeUsed) {
      const parent = users.find(
        (u) => u.referralCode.toUpperCase() === referralCodeUsed.toUpperCase()
      );
      if (parent && parent.id !== buyerUserId) {
        parentId = parent.id;
      }
    }
    buyer = {
      id: buyerUserId,
      name: buyerName,
      email: buyerEmail,
      referralCode: `BFT-${buyerName.replace(/\s+/g, '').toUpperCase().slice(0, 5)}${Math.floor(10 + Math.random() * 89)}`,
      referredBy: parentId,
      createdAt: new Date().toISOString(),
    };
    users.push(buyer);
  } else if (!buyer.referredBy && referralCodeUsed) {
    // Assign parent if not already set and not self-referral
    const parent = users.find(
      (u) => u.referralCode.toUpperCase() === referralCodeUsed.toUpperCase()
    );
    if (parent && parent.id !== buyerUserId) {
      buyer.referredBy = parent.id;
    }
  }

  // 1. Level 1 Referrer (Direct)
  if (buyer.referredBy) {
    const l1Referrer = users.find((u) => u.id === buyer?.referredBy);
    if (l1Referrer && l1Referrer.id !== buyerUserId) {
      const l1Amount = Number((packagePrice * COMMISSION_RATES.LEVEL_1).toFixed(2));
      const refL1: ReferralRecord = {
        id: `REF-${Date.now()}-L1`,
        referrerId: l1Referrer.id,
        referredUserId: buyer.id,
        referredUserName: buyer.name,
        referredUserEmail: maskEmail(buyer.email),
        level: 1,
        commissionType: 'package',
        packageTier,
        packageName,
        packagePrice,
        commissionRate: COMMISSION_RATES.LEVEL_1,
        commissionAmount: l1Amount,
        status: 'paid',
        createdAt: new Date().toISOString(),
      };
      newReferrals.push(refL1);
      referrals.unshift(refL1);

      // 2. Level 2 Referrer (Parent of L1)
      if (l1Referrer.referredBy) {
        const l2Referrer = users.find((u) => u.id === l1Referrer.referredBy);
        if (l2Referrer && l2Referrer.id !== buyerUserId) {
          const l2Amount = Number((packagePrice * COMMISSION_RATES.LEVEL_2).toFixed(2));
          const refL2: ReferralRecord = {
            id: `REF-${Date.now()}-L2`,
            referrerId: l2Referrer.id,
            referredUserId: buyer.id,
            referredUserName: buyer.name,
            referredUserEmail: maskEmail(buyer.email),
            level: 2,
            commissionType: 'package',
            packageTier,
            packageName,
            packagePrice,
            commissionRate: COMMISSION_RATES.LEVEL_2,
            commissionAmount: l2Amount,
            status: 'paid',
            createdAt: new Date().toISOString(),
          };
          newReferrals.push(refL2);
          referrals.unshift(refL2);

          // 3. Level 3 Referrer (Parent of L2)
          if (l2Referrer.referredBy) {
            const l3Referrer = users.find((u) => u.id === l2Referrer.referredBy);
            if (l3Referrer && l3Referrer.id !== buyerUserId) {
              const l3Amount = Number((packagePrice * COMMISSION_RATES.LEVEL_3).toFixed(2));
              const refL3: ReferralRecord = {
                id: `REF-${Date.now()}-L3`,
                referrerId: l3Referrer.id,
                referredUserId: buyer.id,
                referredUserName: buyer.name,
                referredUserEmail: maskEmail(buyer.email),
                level: 3,
                commissionType: 'package',
                packageTier,
                packageName,
                packagePrice,
                commissionRate: COMMISSION_RATES.LEVEL_3,
                commissionAmount: l3Amount,
                status: 'paid',
                createdAt: new Date().toISOString(),
              };
              newReferrals.push(refL3);
              referrals.unshift(refL3);
            }
          }
        }
      }
    }
  }

  saveAffiliateUsers(users);
  saveAffiliateReferrals(referrals);

  return {
    newReferrals,
    allReferrals: referrals,
    updatedUsers: users,
  };
}

/**
 * Calculates aggregated stats for the current user across all 3 tiers.
 */
export function calculateAffiliateStats(
  userId: string,
  referralsList?: ReferralRecord[],
  payoutsList?: AffiliatePayout[]
): AffiliateStats {
  const referrals = (referralsList || loadAffiliateReferrals()).filter(
    (r) => r.referrerId === userId
  );
  const payouts = (payoutsList || loadAffiliatePayouts()).filter(
    (p) => p.userId === userId
  );

  let lifetimeEarnings = 0;
  let pendingCommission = 0;

  let l1Count = 0;
  let l1Earnings = 0;
  let l2Count = 0;
  let l2Earnings = 0;
  let l3Count = 0;
  let l3Earnings = 0;

  for (const ref of referrals) {
    if (ref.status === 'paid') {
      lifetimeEarnings += ref.commissionAmount;
    } else {
      pendingCommission += ref.commissionAmount;
    }

    if (ref.level === 1) {
      l1Count += 1;
      l1Earnings += ref.commissionAmount;
    } else if (ref.level === 2) {
      l2Count += 1;
      l2Earnings += ref.commissionAmount;
    } else if (ref.level === 3) {
      l3Count += 1;
      l3Earnings += ref.commissionAmount;
    }
  }

  // Deduct completed or processing payouts from available balance
  const totalPaidOut = payouts
    .filter((p) => p.status === 'completed' || p.status === 'processing')
    .reduce((sum, p) => sum + p.amount, 0);

  const availableBalance = Math.max(0, Number((lifetimeEarnings - totalPaidOut).toFixed(2)));

  return {
    lifetimeEarnings: Number(lifetimeEarnings.toFixed(2)),
    availableBalance,
    pendingCommission: Number(pendingCommission.toFixed(2)),
    totalReferralsCount: referrals.length,
    level1Count: l1Count,
    level1Earnings: Number(l1Earnings.toFixed(2)),
    level2Count: l2Count,
    level2Earnings: Number(l2Earnings.toFixed(2)),
    level3Count: l3Count,
    level3Earnings: Number(l3Earnings.toFixed(2)),
  };
}

/**
 * Creates an affiliate payout request with $50 minimum threshold.
 */
export function requestAffiliatePayout(params: {
  userId: string;
  amount: number;
  method: 'USDT (TRC-20)' | 'Bank Transfer';
  details: string;
  payouts?: AffiliatePayout[];
  referrals?: ReferralRecord[];
}): { success: boolean; error?: string; payout?: AffiliatePayout; updatedPayouts?: AffiliatePayout[] } {
  const { userId, amount, method, details } = params;

  if (amount < 50) {
    return { success: false, error: 'Minimum payout threshold is $50.00' };
  }

  if (!details || details.trim().length < 5) {
    return { success: false, error: 'Valid payment destination details are required' };
  }

  const stats = calculateAffiliateStats(userId, params.referrals, params.payouts);
  if (amount > stats.availableBalance) {
    return {
      success: false,
      error: `Insufficient available balance. You have $${stats.availableBalance.toFixed(2)} available.`,
    };
  }

  const payouts = [...(params.payouts || loadAffiliatePayouts())];
  const newPayout: AffiliatePayout = {
    id: `AFF-PAY-${Date.now().toString().slice(-6)}`,
    userId,
    amount: Number(amount.toFixed(2)),
    method,
    details: details.trim(),
    status: 'completed', // Auto-completed via fast TRC-20 contract
    requestedAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
    txHash: method === 'USDT (TRC-20)' ? generateSampleTxHash() : undefined,
  };

  payouts.unshift(newPayout);
  saveAffiliatePayouts(payouts);

  return {
    success: true,
    payout: newPayout,
    updatedPayouts: payouts,
  };
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user}***@${domain}`;
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

function generateSampleTxHash(): string {
  const chars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 44; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}
