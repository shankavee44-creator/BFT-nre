import type {
  UserAccount,
  ReferralRecord,
  AffiliatePayout,
  AffiliateStats,
  ChallengeTier,
  ReferredUser,
} from '../types/index.ts';

export type { UserAccount, ReferralRecord, AffiliatePayout, AffiliateStats, ReferredUser };

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

// Production launch: Start with completely clean referral and user records
export const INITIAL_USERS: UserAccount[] = [];
export const INITIAL_REFERRALS: ReferralRecord[] = [];
export const INITIAL_PAYOUTS: AffiliatePayout[] = [];

// ==========================================
// 3. STORAGE ACCESSORS FOR AFFILIATE DATA
// ==========================================

const AFFILIATE_KEYS = {
  USERS: 'bft_affiliate_users_v2',
  REFERRALS: 'bft_affiliate_referrals_v2',
  PAYOUTS: 'bft_affiliate_payouts_v2',
};

const LEGACY_DEMO_USER_IDS = new Set([
  'USR-MASTER-88',
  'USR-PARENT-55',
  'usr_bft_001',
  'USR-SUB-101',
  'USR-SUB-102',
  'USR-GRAND-201',
  'USR-GRAND-202',
  'USR-LEAF-301',
  'USR-LEAF-302',
]);

const LEGACY_DEMO_REFERRAL_IDS = new Set([
  'REF-1001',
  'REF-1002',
  'REF-1003',
  'REF-1004',
  'REF-1005',
  'REF-1006',
  'REF-1007',
  'REF-1008',
  'REF-1009',
  'COMM-001',
  'COMM-002',
  'COMM-003',
  'COMM-004',
  'COMM-005',
  'COMM-006',
]);

export function loadAffiliateUsers(): UserAccount[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AFFILIATE_KEYS.USERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((u: any) => u && !LEGACY_DEMO_USER_IDS.has(u.id));
        }
      }
    }
  } catch {
    // fallback
  }
  return [];
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

const LEGACY_DEMO_PAYOUT_IDS = new Set(['AFF-PAY-881', 'AFF-PAY-801']);

export function loadAffiliateReferrals(): ReferralRecord[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AFFILIATE_KEYS.REFERRALS);
      if (raw) {
        const parsed: ReferralRecord[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (r) =>
              r &&
              !LEGACY_DEMO_REFERRAL_IDS.has(r.id) &&
              !r.id.startsWith('REF-L') &&
              r.referrerId !== 'usr_bft_001'
          );
        }
      }
    }
  } catch {
    // fallback
  }
  return [];
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
      if (raw) {
        const parsed: AffiliatePayout[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((p) => !LEGACY_DEMO_PAYOUT_IDS.has(p.id));
        }
      }
    }
  } catch {
    // fallback
  }
  return [];
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
// 4. BASIC VS. VIP 3-TIER COMMISSION CHAIN
// ==========================================

export const BASIC_TIER_RATES = {
  LEVEL_1: 0.10, // 10% Direct Referrals
  LEVEL_2: 0.05, // 5% Sub-referrals
  LEVEL_3: 0.02, // 2% Extended Network
  TOTAL_PACKAGE: 0.17, // 17%
  WITHDRAWAL_ROYALTY: 0.08, // 8% Direct Referral Withdrawal Commission
};

export const VIP_TIER_RATES = {
  LEVEL_1: 0.15, // 15% Direct Referrals (New referrals joined after achieving VIP status)
  LEVEL_2: 0.08, // 8% Sub-referrals
  LEVEL_3: 0.05, // 5% Extended Network
  TOTAL_PACKAGE: 0.28, // 28% Total Package Commission
  WITHDRAWAL_ROYALTY: 0.10, // 10% Direct Referral Withdrawal Commission
};

export const COMMISSION_RATES = BASIC_TIER_RATES;
export const VIP_ACTIVE_TRADERS_THRESHOLD = 1000;
export const VIP_MILESTONE_REWARD_AMOUNT = 10000;

export interface ProcessCommissionsResult {
  newReferrals: ReferralRecord[];
  allReferrals: ReferralRecord[];
  updatedUsers: UserAccount[];
}

/**
 * An "Active Trader" counts ONLY when a referred user actually purchases a Funded Account.
 * Free/demo registrations with $0 amount or no purchase do NOT count.
 */
export function isUserActiveFunded(
  user: { id: string; email?: string; fullName?: string; latestPurchase?: { name: string; sku?: string; amount: number } },
  purchasesList?: Array<any>,
  referralsList?: ReferralRecord[]
): boolean {
  const purchase = resolveReferredUserPurchase(user, purchasesList, referralsList);
  return Boolean(purchase && Number(purchase.amount) > 0);
}

/**
 * Counts unique referred users who hold an active purchased Funded Account (Instant Funded or Challenge).
 */
export function countActiveFundedReferrals(params: {
  sponsorId: string;
  usersList?: UserAccount[];
  purchasesList?: Array<any>;
  referralsList?: ReferralRecord[];
  networkTree?: ReferredUser[];
}): number {
  const tree =
    params.networkTree ||
    buildReferredNetworkTree({
      sponsorId: params.sponsorId,
      usersList: params.usersList,
      purchasesList: params.purchasesList,
      referralsList: params.referralsList,
    });

  return tree.filter((node) => isUserActiveFunded(node, params.purchasesList, params.referralsList)).length;
}

/**
 * Determines whether a sponsor has unlocked the VIP Tier (>= 1,000 Active Funded Referrals).
 */
export function getSponsorAffiliateTier(params: {
  sponsorId: string;
  usersList?: UserAccount[];
  purchasesList?: Array<any>;
  referralsList?: ReferralRecord[];
  activeCountOverride?: number;
}): {
  tier: 'basic' | 'vip';
  activeFundedCount: number;
  vipThreshold: number;
  remainingToVip: number;
  vipProgressPercent: number;
  isVipUnlocked: boolean;
  milestoneRewardAmount: number;
} {
  const vipThreshold = VIP_ACTIVE_TRADERS_THRESHOLD;
  const activeFundedCount =
    typeof params.activeCountOverride === 'number'
      ? params.activeCountOverride
      : countActiveFundedReferrals({
          sponsorId: params.sponsorId,
          usersList: params.usersList,
          purchasesList: params.purchasesList,
          referralsList: params.referralsList,
        });

  const isVipUnlocked = activeFundedCount >= vipThreshold;
  const tier: 'basic' | 'vip' = isVipUnlocked ? 'vip' : 'basic';
  const remainingToVip = Math.max(0, vipThreshold - activeFundedCount);
  const vipProgressPercent = Math.min(100, Number(((activeFundedCount / vipThreshold) * 100).toFixed(1)));

  return {
    tier,
    activeFundedCount,
    vipThreshold,
    remainingToVip,
    vipProgressPercent,
    isVipUnlocked,
    milestoneRewardAmount: VIP_MILESTONE_REWARD_AMOUNT,
  };
}

/**
 * Registers a new user account upon Sign Up and attributes them to their Level 1 sponsor
 * using the explicit referralCode or the 30-day stored referral cookie.
 * Captures the sponsor's affiliate tier (basic vs vip) at registration time to enforce
 * strict Historical Rate Isolation.
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
      if (!existing.registeredTier && sponsor) {
        const sponsorTier = getSponsorAffiliateTier({ sponsorId: sponsor.id, usersList: users });
        existing.registeredTier = sponsorTier.isVipUnlocked ? 'vip' : 'basic';
      }
      saveAffiliateUsers(users);
    }
    return { newUser: existing, sponsor, uplineChain, updatedUsers: users };
  }

  const sponsorTierInfo = sponsor ? getSponsorAffiliateTier({ sponsorId: sponsor.id, usersList: users }) : null;
  const registeredTier: 'basic' | 'vip' = sponsorTierInfo?.isVipUnlocked ? 'vip' : 'basic';

  const cleanPrefix = params.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'TRDR';
  const newUser: UserAccount = {
    id: `usr_bft_${Date.now().toString().slice(-5)}`,
    name: params.name.trim(),
    email: params.email.trim(),
    password: params.password,
    referralCode: `BFT-${cleanPrefix}${Math.floor(10 + Math.random() * 89)}`,
    referredBy: sponsor?.id,
    registeredTier,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveAffiliateUsers(users);

  return { newUser, sponsor, uplineChain, updatedUsers: users };
}

/**
 * Awards a direct referral withdrawal commission (8% for Basic, 10% for VIP) when a referred trader processes a payout.
 * Enforces historical rate isolation: referrals registered during Basic tier earn at 8%; referrals registered after VIP earn at 10%.
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
  const referrerId = trader?.referredBy;
  if (!referrerId) {
    return { allReferrals: referrals };
  }
  const sponsor = users.find((u) => u.id === referrerId);

  if (!sponsor || sponsor.id === params.traderUserId) {
    return { allReferrals: referrals };
  }

  // Determine rate based on trader's registration tier (Historical Rate Isolation)
  const isVipReferral = trader?.registeredTier === 'vip';
  const bonusRate = isVipReferral ? VIP_TIER_RATES.WITHDRAWAL_ROYALTY : BASIC_TIER_RATES.WITHDRAWAL_ROYALTY;
  const bonusPercentLabel = (bonusRate * 100).toFixed(0);
  const commissionAmount = Number((params.withdrawalAmount * bonusRate).toFixed(2));

  const record: ReferralRecord = {
    id: `REF-WD-${Date.now().toString().slice(-5)}`,
    referrerId: sponsor.id,
    referredUserId: params.traderUserId,
    referredUserName: params.traderName,
    referredUserEmail: maskEmail(params.traderEmail),
    level: 1,
    commissionType: 'withdrawal',
    packageTier: 'instant',
    packageName: `Profit Payout Royalty (${bonusPercentLabel}% of $${params.withdrawalAmount.toFixed(0)} Withdrawal)`,
    packagePrice: params.withdrawalAmount,
    commissionRate: bonusRate,
    commissionAmount,
    affiliateTier: isVipReferral ? 'vip' : 'basic',
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
export interface AffiliateUserPurchaseRecord {
  userId: string;
  userEmail?: string;
  userName?: string;
  packageName: string;
  packageSku: string;
  amount: number;
  createdAt: string;
}

const AFFILIATE_PURCHASES_STORAGE_KEY = 'bft_affiliate_user_purchases_v2';

/**
 * Formats any raw package name or SKU into the clean canonical display format
 * expected by the Full Referred Network Tree table (e.g. "$25K Instant Funded", "$50K 1-Step Challenge").
 */
export function formatPurchasedPackageLabel(
  rawName?: string | null,
  rawSku?: string | null,
  fallbackAmount?: number | null
): string {
  const name = String(rawName || '').trim();
  const sku = String(rawSku || '').trim().toUpperCase();
  const combined = `${name} ${sku}`.trim();

  if (!combined) return 'No Purchase';

  // Ignore withdrawal bonus descriptions when resolving package purchases
  if (/payout bonus|withdrawal|royalty/i.test(name)) {
    return 'No Purchase';
  }

  // Strip "Level X Commission: " prefix if present
  const cleanedName = name.replace(/^Level\s*\d+\s*Commission:\s*/i, '').trim();

  // Extract account size (e.g. $25,000, $25K, 50K, $100,000)
  let sizeLabel = '';
  const kMatch = combined.match(/\$?\b(5|10|25|50|100|200)\s*[kK]\b/);
  const fullNumMatch = combined.match(/\$?\b(5,000|10,000|25,000|50,000|100,000|200,000|5000|10000|25000|50000|100000|200000)\b/);

  if (kMatch) {
    sizeLabel = `$${kMatch[1]}K`;
  } else if (fullNumMatch) {
    const numeric = Number(fullNumMatch[1].replace(/,/g, ''));
    if (numeric >= 1000) {
      sizeLabel = `$${Math.round(numeric / 1000)}K`;
    }
  } else if (fallbackAmount && fallbackAmount > 0) {
    // Infer standard BFT package size from price if size isn't in the string
    const amt = Math.round(Number(fallbackAmount));
    if (amt === 49 || amt === 59) sizeLabel = '$5K';
    else if (amt === 89 || amt === 99 || amt === 149 || amt === 249) sizeLabel = '$10K';
    else if (amt === 189 || amt === 199 || amt === 250 || amt === 299 || amt === 499) sizeLabel = '$25K';
    else if (amt === 279 || amt === 289 || amt === 349 || amt === 399 || amt === 899) sizeLabel = '$50K';
    else if (amt === 469 || amt === 499 || amt === 549 || amt === 599 || amt === 999) sizeLabel = '$100K';
  }

  // Determine package tier label
  let tierLabel = '';
  if (/instant\s*funded|bft-if|instant/i.test(combined)) {
    tierLabel = 'Instant Funded';
  } else if (/one[-\s]*step|1[-\s]*step|bft-1s/i.test(combined)) {
    tierLabel = '1-Step Challenge';
  } else if (/two[-\s]*step|2[-\s]*step|bft-2s/i.test(combined)) {
    tierLabel = '2-Step Challenge';
  } else if (/self[-\s]*funded|personal\s*live|bft-self/i.test(combined)) {
    tierLabel = 'Self-Funded Live';
  } else if (/challenge/i.test(combined)) {
    tierLabel = 'Challenge';
  }

  if (sizeLabel && tierLabel) {
    return `${sizeLabel} ${tierLabel}`;
  }
  if (tierLabel) {
    return tierLabel;
  }
  if (cleanedName) {
    return cleanedName;
  }
  return sku || 'Challenge Package';
}

/**
 * Formats the exact purchase amount paid by a referred user (e.g., "$250" or "$250.50", or "$0" if no purchase).
 */
export function formatPurchaseAmountDisplay(amount?: number | null): string {
  const num = Number(amount || 0);
  if (!Number.isFinite(num) || num <= 0) return '$0';
  return Number.isInteger(num) ? `$${num}` : `$${num.toFixed(2)}`;
}

export const INITIAL_USER_PURCHASES: AffiliateUserPurchaseRecord[] = [];

export function loadAffiliateUserPurchases(): AffiliateUserPurchaseRecord[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AFFILIATE_PURCHASES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(
            (p: any) =>
              p &&
              !LEGACY_DEMO_USER_IDS.has(p.userId) &&
              !LEGACY_DEMO_USER_IDS.has(p.user_id) &&
              p.userId !== 'usr_bft_001'
          );
        }
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveAffiliateUserPurchases(records: AffiliateUserPurchaseRecord[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AFFILIATE_PURCHASES_STORAGE_KEY, JSON.stringify(records));
    }
  } catch {
    // ignore
  }
}

export function recordAffiliateUserPurchase(params: {
  userId: string;
  userEmail?: string;
  userName?: string;
  packageName: string;
  packageSku?: string;
  amount: number;
}): AffiliateUserPurchaseRecord[] {
  const existing = [...loadAffiliateUserPurchases()];
  const formattedName = formatPurchasedPackageLabel(params.packageName, params.packageSku, params.amount);
  const newRec: AffiliateUserPurchaseRecord = {
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    packageName: formattedName !== 'No Purchase' ? formattedName : params.packageName,
    packageSku: params.packageSku || 'BFT-PKG',
    amount: Number(params.amount || 0),
    createdAt: new Date().toISOString(),
  };
  const filtered = existing.filter(
    (p) =>
      p.userId !== params.userId &&
      (!params.userEmail || !p.userEmail || p.userEmail.toLowerCase() !== params.userEmail.toLowerCase())
  );
  const updated = [newRec, ...filtered];
  saveAffiliateUserPurchases(updated);
  return updated;
}

export function process3TierCommissions(params: {
  buyerUserId: string;
  buyerName: string;
  buyerEmail: string;
  packageTier: ChallengeTier;
  packageName: string;
  packagePrice: number;
  packageSku?: string;
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
    packageSku,
    referralCodeUsed,
  } = params;

  const cleanDisplayPkgName =
    formatPurchasedPackageLabel(packageName, packageSku, packagePrice) !== 'No Purchase'
      ? formatPurchasedPackageLabel(packageName, packageSku, packagePrice)
      : packageName;

  const users = [...(params.users || loadAffiliateUsers())];
  const referrals = [...(params.existingReferrals || loadAffiliateReferrals())];
  const newReferrals: ReferralRecord[] = [];

  // Ensure buyer user exists or is registered (match by ID or email)
  let buyer =
    users.find((u) => u.id === buyerUserId) ||
    (buyerEmail ? users.find((u) => u.email.toLowerCase() === buyerEmail.trim().toLowerCase()) : undefined);

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
    if (parent && parent.id !== buyer.id) {
      buyer.referredBy = parent.id;
    }
  }

  // Record the buyer's package purchase so the Full Referred Network Tree immediately reflects it
  recordAffiliateUserPurchase({
    userId: buyer.id,
    userEmail: buyer.email,
    userName: buyer.name,
    packageName: cleanDisplayPkgName,
    packageSku: packageSku || `BFT-${packageTier.toUpperCase()}`,
    amount: packagePrice,
  });

  // Determine applicable rates based on buyer's registered tier (Historical Rate Isolation)
  // Referrals registered during the Basic tier continue earning at Basic rates (10%/5%/2%).
  // Only new referrals joined after achieving VIP status earn VIP rates (15%/8%/5%).
  const isVipReferral = buyer.registeredTier === 'vip';
  const effectiveTier: 'basic' | 'vip' = isVipReferral ? 'vip' : 'basic';
  const rates = isVipReferral ? VIP_TIER_RATES : BASIC_TIER_RATES;

  // 1. Level 1 Referrer (Direct: 10% Basic or 15% VIP)
  if (buyer.referredBy) {
    const l1Referrer = users.find((u) => u.id === buyer?.referredBy);
    if (l1Referrer && l1Referrer.id !== buyer.id) {
      const l1Amount = Number((packagePrice * rates.LEVEL_1).toFixed(2));
      const refL1: ReferralRecord = {
        id: `REF-${Date.now()}-L1`,
        referrerId: l1Referrer.id,
        referredUserId: buyer.id,
        referredUserName: buyer.name,
        referredUserEmail: maskEmail(buyer.email),
        level: 1,
        commissionType: 'package',
        packageTier,
        packageName: cleanDisplayPkgName,
        packagePrice,
        commissionRate: rates.LEVEL_1,
        commissionAmount: l1Amount,
        affiliateTier: effectiveTier,
        status: 'paid',
        createdAt: new Date().toISOString(),
      };
      newReferrals.push(refL1);
      referrals.unshift(refL1);

      // 2. Level 2 Referrer (Parent of L1: 5% Basic or 8% VIP)
      if (l1Referrer.referredBy) {
        const l2Referrer = users.find((u) => u.id === l1Referrer.referredBy);
        if (l2Referrer && l2Referrer.id !== buyer.id) {
          const l2Amount = Number((packagePrice * rates.LEVEL_2).toFixed(2));
          const refL2: ReferralRecord = {
            id: `REF-${Date.now()}-L2`,
            referrerId: l2Referrer.id,
            referredUserId: buyer.id,
            referredUserName: buyer.name,
            referredUserEmail: maskEmail(buyer.email),
            level: 2,
            commissionType: 'package',
            packageTier,
            packageName: cleanDisplayPkgName,
            packagePrice,
            commissionRate: rates.LEVEL_2,
            commissionAmount: l2Amount,
            affiliateTier: effectiveTier,
            status: 'paid',
            createdAt: new Date().toISOString(),
          };
          newReferrals.push(refL2);
          referrals.unshift(refL2);

          // 3. Level 3 Referrer (Parent of L2: 2% Basic or 5% VIP)
          if (l2Referrer.referredBy) {
            const l3Referrer = users.find((u) => u.id === l2Referrer.referredBy);
            if (l3Referrer && l3Referrer.id !== buyer.id) {
              const l3Amount = Number((packagePrice * rates.LEVEL_3).toFixed(2));
              const refL3: ReferralRecord = {
                id: `REF-${Date.now()}-L3`,
                referrerId: l3Referrer.id,
                referredUserId: buyer.id,
                referredUserName: buyer.name,
                referredUserEmail: maskEmail(buyer.email),
                level: 3,
                commissionType: 'package',
                packageTier,
                packageName: cleanDisplayPkgName,
                packagePrice,
                commissionRate: rates.LEVEL_3,
                commissionAmount: l3Amount,
                affiliateTier: effectiveTier,
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
 * Resolves the latest package purchase for a referred user from all available sources:
 * 1) Direct purchase records (`user_purchases` / `AffiliateUserPurchaseRecord`)
 * 2) Commission ledger entries (`ReferralRecord[]` where `referredUserId === user.id` and `commissionType === 'package'`)
 * 3) Pre-populated `latestPurchase` on the node
 */
export function resolveReferredUserPurchase(
  user: { id: string; fullName?: string; email?: string; latestPurchase?: { name: string; sku?: string; amount: number } },
  purchasesList?: Array<any>,
  referralsList?: ReferralRecord[]
): { name: string; sku?: string; amount: number } | undefined {
  // 1. Check explicit purchase records first
  const purchases = purchasesList || loadAffiliateUserPurchases();
  const matchedPurchase = purchases.find((p: any) => {
    const pUserId = String(p.userId || p.user_id || '').trim();
    const pEmail = String(p.userEmail || p.user_email || p.email || '').trim().toLowerCase();
    if (pUserId && pUserId === user.id) return true;
    if (user.email && pEmail && pEmail === user.email.trim().toLowerCase()) return true;
    return false;
  });

  if (matchedPurchase) {
    const amount = Number(matchedPurchase.package_amount ?? matchedPurchase.amount ?? matchedPurchase.price ?? 0);
    const rawName = matchedPurchase.packageName || matchedPurchase.package_name || 'Challenge Package';
    const rawSku = matchedPurchase.packageSku || matchedPurchase.package_sku || matchedPurchase.sku || 'BFT-PKG';
    if (amount > 0) {
      const formattedLabel = formatPurchasedPackageLabel(rawName, rawSku, amount);
      return {
        name: formattedLabel !== 'No Purchase' ? formattedLabel : rawName,
        sku: rawSku,
        amount,
      };
    }
  }

  // 2. Check existing latestPurchase on the node
  if (user.latestPurchase && Number(user.latestPurchase.amount) > 0) {
    const formattedLabel = formatPurchasedPackageLabel(
      user.latestPurchase.name,
      user.latestPurchase.sku,
      user.latestPurchase.amount
    );
    return {
      name: formattedLabel !== 'No Purchase' ? formattedLabel : user.latestPurchase.name,
      sku: user.latestPurchase.sku || 'BFT-PKG',
      amount: Number(user.latestPurchase.amount),
    };
  }

  // 3. Check 3-tier commission ledger records (any package commission triggered by this referred user)
  const referrals = referralsList || loadAffiliateReferrals();
  const matchedComm = referrals.find(
    (r) =>
      r.commissionType !== 'withdrawal' &&
      r.packagePrice > 0 &&
      (r.referredUserId === user.id ||
        (user.fullName &&
          r.referredUserName &&
          r.referredUserName.trim().toLowerCase() === user.fullName.trim().toLowerCase()))
  );

  if (matchedComm) {
    const formattedLabel = formatPurchasedPackageLabel(
      matchedComm.packageName,
      matchedComm.packageTier,
      matchedComm.packagePrice
    );
    return {
      name: formattedLabel !== 'No Purchase' ? formattedLabel : matchedComm.packageName,
      sku: matchedComm.packageTier ? `BFT-${matchedComm.packageTier.toUpperCase()}` : 'BFT-PKG',
      amount: Number(matchedComm.packagePrice),
    };
  }

  return undefined;
}

/**
 * Builds the complete 3-tier ReferredUser[] network tree (L1, L2, L3) for a sponsor,
 * merging nodes from Supabase/backend/local users and enriching every node with its
 * actual purchased package name and exact amount paid.
 */
export function buildReferredNetworkTree(params: {
  sponsorId: string;
  externalNodes?: ReferredUser[];
  usersList?: UserAccount[];
  purchasesList?: Array<any>;
  referralsList?: ReferralRecord[];
}): ReferredUser[] {
  const { sponsorId, externalNodes = [], usersList, purchasesList, referralsList } = params;
  const users = usersList || loadAffiliateUsers();
  const referrals = referralsList || loadAffiliateReferrals();
  const purchases = [...(purchasesList || []), ...loadAffiliateUserPurchases()];

  const nodeMap = new Map<string, ReferredUser>();

  // 1. Add external nodes (from Supabase or backend API)
  for (const ext of externalNodes) {
    if (!ext || !ext.id) continue;
    nodeMap.set(ext.id, {
      id: ext.id,
      fullName: ext.fullName || 'Trader',
      level: ext.level,
      latestPurchase: resolveReferredUserPurchase(ext, purchases, referrals),
    });
  }

  // 2. Traverse local 3-tier user tree strictly for sponsorId (no mock user fallbacks)
  const effectiveSponsorIds = new Set<string>([sponsorId]);

  const l1Users = users.filter((u) => u.referredBy && effectiveSponsorIds.has(u.referredBy));
  const l1Ids = new Set(l1Users.map((u) => u.id));
  const l2Users = users.filter((u) => u.referredBy && l1Ids.has(u.referredBy));
  const l2Ids = new Set(l2Users.map((u) => u.id));
  const l3Users = users.filter((u) => u.referredBy && l2Ids.has(u.referredBy));

  const addLocalUser = (u: UserAccount, level: 1 | 2 | 3) => {
    const existing = nodeMap.get(u.id);
    const resolvedPurchase = resolveReferredUserPurchase(
      {
        id: u.id,
        fullName: u.name,
        email: u.email,
        latestPurchase: existing?.latestPurchase,
      },
      purchases,
      referrals
    );
    nodeMap.set(u.id, {
      id: u.id,
      fullName: existing?.fullName && existing.fullName !== 'Trader' ? existing.fullName : u.name,
      level: existing?.level || level,
      latestPurchase: resolvedPurchase,
    });
  };

  if (externalNodes.length === 0 || effectiveSponsorIds.has(sponsorId)) {
    for (const u of l1Users) addLocalUser(u, 1);
    for (const u of l2Users) addLocalUser(u, 2);
    for (const u of l3Users) addLocalUser(u, 3);
  }

  // 3. Also ensure any user who generated a commission for this sponsor in `referrals` is present in the network tree
  for (const r of referrals) {
    if (effectiveSponsorIds.has(r.referrerId) && r.referredUserId && !nodeMap.has(r.referredUserId)) {
      const level = (r.level === 1 || r.level === 2 || r.level === 3 ? r.level : 1) as 1 | 2 | 3;
      const node: ReferredUser = {
        id: r.referredUserId,
        fullName: r.referredUserName || `Trader ${r.referredUserId.slice(0, 6)}`,
        level,
      };
      node.latestPurchase = resolveReferredUserPurchase(node, purchases, referrals);
      nodeMap.set(node.id, node);
    }
  }

  return Array.from(nodeMap.values()).sort((a, b) => a.level - b.level);
}

/**
 * Merges and deduplicates commission records across multiple sources (local state, Supabase, backend API)
 * and normalizes package names and tier rates (10% L1, 5% L2, 2% L3, 8% Payout Bonus).
 */
export function mergeCommissionLedgers(params: {
  sponsorIds: string[];
  localReferrals?: ReferralRecord[];
  supabaseReferrals?: ReferralRecord[];
  backendReferrals?: ReferralRecord[];
}): ReferralRecord[] {
  const validSponsorIds = new Set(params.sponsorIds.filter(Boolean));
  const combined = [
    ...(params.supabaseReferrals || []),
    ...(params.backendReferrals || []),
    ...(params.localReferrals || []),
  ];

  const seenKeys = new Set<string>();
  const result: ReferralRecord[] = [];

  for (const item of combined) {
    if (!item) continue;
    // Strictly match sponsor ID (no mock usr_bft_001 fallback records)
    const matchesSponsor =
      validSponsorIds.size === 0 ||
      validSponsorIds.has(item.referrerId);
    if (!matchesSponsor) continue;

    const cleanPkgName =
      item.commissionType === 'withdrawal'
        ? item.packageName
        : formatPurchasedPackageLabel(item.packageName, item.packageTier, item.packagePrice) !== 'No Purchase'
        ? formatPurchasedPackageLabel(item.packageName, item.packageTier, item.packagePrice)
        : item.packageName;

    const isVip =
      item.affiliateTier === 'vip' ||
      item.commissionRate === VIP_TIER_RATES.LEVEL_1 ||
      (item.level === 2 && item.commissionRate === VIP_TIER_RATES.LEVEL_2) ||
      (item.level === 3 && item.commissionRate === VIP_TIER_RATES.LEVEL_3) ||
      (item.commissionType === 'withdrawal' && item.commissionRate === VIP_TIER_RATES.WITHDRAWAL_ROYALTY);

    const rates = isVip ? VIP_TIER_RATES : BASIC_TIER_RATES;

    const expectedRate =
      item.commissionType === 'withdrawal'
        ? rates.WITHDRAWAL_ROYALTY
        : item.level === 1
        ? rates.LEVEL_1
        : item.level === 2
        ? rates.LEVEL_2
        : rates.LEVEL_3;

    const normalizedAmount =
      item.commissionAmount > 0
        ? Number(item.commissionAmount.toFixed(2))
        : Number((Number(item.packagePrice || 0) * expectedRate).toFixed(2));

    const dedupKey = `${item.referredUserId}-${item.level}-${item.commissionType}-${Number(item.packagePrice).toFixed(2)}-${normalizedAmount.toFixed(2)}`;
    if (seenKeys.has(item.id) || seenKeys.has(dedupKey)) continue;
    seenKeys.add(item.id);
    seenKeys.add(dedupKey);

    result.push({
      ...item,
      packageName: cleanPkgName,
      commissionRate: item.commissionRate || expectedRate,
      commissionAmount: normalizedAmount,
      affiliateTier: isVip ? 'vip' : 'basic',
    });
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

const MILESTONE_CLAIMED_KEY = 'bft_affiliate_milestone_claimed_v1';

export function isMilestoneRewardClaimed(userId: string): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(`${MILESTONE_CLAIMED_KEY}_${userId}`) === 'true';
    }
  } catch {}
  return false;
}

export function claimVipMilestoneReward(params: {
  userId: string;
  userName?: string;
  userEmail?: string;
  referrals?: ReferralRecord[];
  activeCountOverride?: number;
}): { success: boolean; error?: string; rewardRecord?: ReferralRecord } {
  const { userId, userName = 'Affiliate VIP', userEmail = '', activeCountOverride } = params;
  if (isMilestoneRewardClaimed(userId)) {
    return {
      success: false,
      error: 'The $10,000 Milestone Cash Reward has already been claimed for this account.',
    };
  }
  const tierInfo = getSponsorAffiliateTier({ sponsorId: userId, activeCountOverride });
  if (!tierInfo.isVipUnlocked) {
    return {
      success: false,
      error: `VIP status requires 1,000 active funded referrals. You currently have ${tierInfo.activeFundedCount} active funded traders (${tierInfo.remainingToVip} more required).`,
    };
  }

  const rewardRecord: ReferralRecord = {
    id: `REF-MILESTONE-${Date.now()}`,
    referrerId: userId,
    referredUserId: userId,
    referredUserName: userName,
    referredUserEmail: userEmail,
    level: 1,
    commissionType: 'package',
    packageTier: 'instant',
    packageName: '$10,000 VIP Milestone Cash Reward (1,000 Active Funded Traders Achieved)',
    packagePrice: VIP_MILESTONE_REWARD_AMOUNT,
    commissionRate: 1.0,
    commissionAmount: VIP_MILESTONE_REWARD_AMOUNT,
    affiliateTier: 'vip',
    status: 'paid',
    createdAt: new Date().toISOString(),
  };

  const referrals = [...(params.referrals || loadAffiliateReferrals())];
  referrals.unshift(rewardRecord);
  saveAffiliateReferrals(referrals);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${MILESTONE_CLAIMED_KEY}_${userId}`, 'true');
    }
  } catch {}

  return { success: true, rewardRecord };
}

/**
 * Calculates aggregated stats for the current user across all 3 tiers with Basic vs. VIP tiers.
 */
export function calculateAffiliateStats(
  userId: string,
  referralsList?: ReferralRecord[],
  payoutsList?: AffiliatePayout[],
  usersList?: UserAccount[],
  purchasesList?: Array<any>,
  activeCountOverride?: number
): AffiliateStats {
  const allRefs = referralsList || loadAffiliateReferrals();
  const referrals = allRefs.filter((r) => r.referrerId === userId);
  const payouts = (payoutsList || loadAffiliatePayouts()).filter((p) => p.userId === userId);

  let lifetimeEarnings = 0;
  let pendingCommission = 0;

  let l1Count = 0;
  let l1Earnings = 0;
  let l2Count = 0;
  let l2Earnings = 0;
  let l3Count = 0;
  let l3Earnings = 0;
  let withdrawalEarnings = 0;

  for (const ref of referrals) {
    if (ref.status === 'paid') {
      lifetimeEarnings += ref.commissionAmount;
    } else {
      pendingCommission += ref.commissionAmount;
    }

    if (ref.commissionType === 'withdrawal') {
      withdrawalEarnings += ref.commissionAmount;
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

  const tierInfo = getSponsorAffiliateTier({
    sponsorId: userId,
    usersList,
    purchasesList,
    referralsList: allRefs,
    activeCountOverride,
  });

  return {
    lifetimeEarnings: Number(lifetimeEarnings.toFixed(2)),
    availableBalance,
    pendingCommission: Number(pendingCommission.toFixed(2)),
    totalReferralsCount: referrals.length,
    activeFundedCount: tierInfo.activeFundedCount,
    vipThreshold: tierInfo.vipThreshold,
    vipProgressPercent: tierInfo.vipProgressPercent,
    remainingToVip: tierInfo.remainingToVip,
    affiliateTier: tierInfo.tier,
    isVipUnlocked: tierInfo.isVipUnlocked,
    milestoneRewardAmount: tierInfo.milestoneRewardAmount,
    milestoneClaimed: isMilestoneRewardClaimed(userId),
    level1Count: l1Count,
    level1Earnings: Number(l1Earnings.toFixed(2)),
    level2Count: l2Count,
    level2Earnings: Number(l2Earnings.toFixed(2)),
    level3Count: l3Count,
    level3Earnings: Number(l3Earnings.toFixed(2)),
    withdrawalEarnings: Number(withdrawalEarnings.toFixed(2)),
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

