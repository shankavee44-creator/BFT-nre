import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'bft_platform.sqlite');

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high performance concurrency
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- 1. Users Table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    google_id TEXT,
    referral_code TEXT UNIQUE NOT NULL,
    referred_by TEXT,
    kyc_status TEXT DEFAULT 'unverified',
    kyc_verified_at INTEGER,
    kyc_timer_ends_at INTEGER,
    kyc_doc_type TEXT,
    profile_locked INTEGER DEFAULT 0,
    address TEXT,
    date_of_birth TEXT,
    country TEXT DEFAULT 'United States',
    telegram_handle TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- 2. Sessions Table (HTTP-Only / Bearer Session Management)
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- 3. Trading Accounts Table
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL,
    tier_name TEXT NOT NULL,
    size REAL NOT NULL,
    initial_balance REAL NOT NULL,
    current_balance REAL NOT NULL,
    starting_day_equity REAL NOT NULL,
    equity REAL NOT NULL,
    daily_loss_limit_percent REAL NOT NULL,
    max_overall_loss_percent REAL NOT NULL,
    max_risk_per_trade_percent REAL DEFAULT 5,
    status TEXT DEFAULT 'active',
    phase TEXT DEFAULT 'funded',
    trading_days_completed INTEGER DEFAULT 14,
    trades_count INTEGER DEFAULT 0,
    win_rate REAL DEFAULT 0,
    daily_withdrawals_unlocked INTEGER DEFAULT 0,
    first_withdrawal_completed INTEGER DEFAULT 0,
    created_date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- 4. Referrals Network Table (3-Tier Chain)
  CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    sponsor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_level INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- 5. Affiliate Commissions Ledger
  CREATE TABLE IF NOT EXISTS commissions (
    id TEXT PRIMARY KEY,
    sponsor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL, -- 'purchase' or 'withdrawal'
    tier_level INTEGER NOT NULL, -- 1, 2, or 3
    package_tier TEXT,
    package_name TEXT,
    base_amount REAL NOT NULL,
    rate REAL NOT NULL,
    commission_amount REAL NOT NULL,
    status TEXT DEFAULT 'paid',
    created_at INTEGER NOT NULL
  );

  -- 6. Withdrawals Ledger
  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    gross_amount REAL NOT NULL,
    net_profit REAL NOT NULL,
    max_allowed_profit REAL NOT NULL,
    profit_share_rate REAL DEFAULT 0.80,
    fee_amount REAL NOT NULL,
    net_payout REAL NOT NULL,
    wallet_address TEXT NOT NULL,
    network TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    rejection_reason TEXT,
    tx_hash TEXT,
    reference_number TEXT,
    requested_at INTEGER NOT NULL,
    processed_at INTEGER
  );

  -- 7. Leaderboard Table
  CREATE TABLE IF NOT EXISTS leaderboard (
    id TEXT PRIMARY KEY,
    rank INTEGER NOT NULL,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    flag TEXT NOT NULL,
    account_tier TEXT NOT NULL,
    profit REAL NOT NULL,
    win_rate REAL NOT NULL,
    payout_time TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// ============================================================================
// Seed Initial Production Data (Alex Mercer usr_bft_001, Upline, Downline & Kasun Perera)
// ============================================================================
function seedInitialData() {
  const userCount = Number(
    (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  );
  if (userCount > 0) return;

  const now = Date.now();

  // Insert Master Upline
  db.prepare(`
    INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, address, date_of_birth, country, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'USR-MASTER-88',
    'viktor.v@quant-prop.io',
    'Viktor Vance',
    'BFT-VIKTOR88',
    null,
    'verified',
    1,
    'Level 42, Al Saada St, Dubai Financial Centre',
    '1985-04-12',
    'United Arab Emirates',
    now - 86400000 * 60,
    now - 86400000 * 60
  );

  // Insert Parent Upline
  db.prepare(`
    INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, address, date_of_birth, country, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'USR-PARENT-55',
    'elena.rostova@alpha-traders.com',
    'Elena Rostova',
    'BFT-ELENA55',
    'USR-MASTER-88',
    'verified',
    1,
    '12 Bishopsgate, London EC2N 4BQ',
    '1991-08-20',
    'United Kingdom',
    now - 86400000 * 45,
    now - 86400000 * 45
  );

  // Insert Default Active Trader (Alex Mercer)
  db.prepare(`
    INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, address, date_of_birth, country, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'usr_bft_001',
    'alex.mercer@gmail.com',
    'Alex Mercer',
    'BFT-ALEX77',
    'USR-PARENT-55',
    'verified',
    1,
    '742 Evergreen Terrace, Springfield, OR 97477',
    '1994-06-15',
    'United States',
    now - 86400000 * 30,
    now - 86400000 * 30
  );

  // Insert Alex Mercer's Funded Account ($10,000 + $680 net profit)
  db.prepare(`
    INSERT INTO accounts (
      id, user_id, tier, tier_name, size, initial_balance, current_balance, starting_day_equity, equity,
      daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent, status, phase,
      trading_days_completed, trades_count, win_rate, daily_withdrawals_unlocked, first_withdrawal_completed,
      created_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'BFT-91823',
    'usr_bft_001',
    'instant',
    '$10,000 Instant Funded',
    10000,
    10000,
    10680,
    10680,
    10680,
    5,
    12,
    5,
    'active',
    'funded',
    14,
    42,
    76.2,
    1,
    1,
    '2026-10-01',
    now - 86400000 * 20,
    now
  );

  // Insert Direct Referrals of Alex Mercer (Level 1)
  const l1Users = [
    { id: 'USR-SUB-101', name: 'Marco Rossi', email: 'marco.rossi@milan-fx.it', ref: 'BFT-MARCO101' },
    { id: 'USR-SUB-102', name: 'Liam Davies', email: 'liam.davies@london-capital.uk', ref: 'BFT-LIAM102' },
  ];
  for (const u of l1Users) {
    db.prepare(`
      INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'verified', 1, ?, ?)
    `).run(u.id, u.email, u.name, u.ref, 'usr_bft_001', now - 86400000 * 15, now);

    db.prepare(`
      INSERT INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
      VALUES (?, ?, ?, 1, ?)
    `).run(`REF-L1-${u.id}`, 'usr_bft_001', u.id, now - 86400000 * 15);
  }

  // Insert Level 2 Referrals
  const l2Users = [
    { id: 'USR-GRAND-201', name: 'Sophia Chen', email: 'sophia.chen@sg-wealth.sg', ref: 'BFT-SOPHIA201', parent: 'USR-SUB-101' },
    { id: 'USR-GRAND-202', name: 'Lucas Bernard', email: 'lucas.b@paris-quant.fr', ref: 'BFT-LUCAS202', parent: 'USR-SUB-102' },
  ];
  for (const u of l2Users) {
    db.prepare(`
      INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'verified', 1, ?, ?)
    `).run(u.id, u.email, u.name, u.ref, u.parent, now - 86400000 * 10, now);

    db.prepare(`
      INSERT INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
      VALUES (?, ?, ?, 2, ?)
    `).run(`REF-L2-${u.id}`, 'usr_bft_001', u.id, now - 86400000 * 10);
  }

  // Insert Level 3 Referrals
  const l3Users = [
    { id: 'USR-LEAF-301', name: 'David Miller', email: 'd.miller@austin-trader.us', ref: 'BFT-DAVID301', parent: 'USR-GRAND-201' },
    { id: 'USR-LEAF-302', name: 'Emma Watson', email: 'emma.w@toronto-fx.ca', ref: 'BFT-EMMA302', parent: 'USR-GRAND-202' },
  ];
  for (const u of l3Users) {
    db.prepare(`
      INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'verified', 1, ?, ?)
    `).run(u.id, u.email, u.name, u.ref, u.parent, now - 86400000 * 5, now);

    db.prepare(`
      INSERT INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
      VALUES (?, ?, ?, 3, ?)
    `).run(`REF-L3-${u.id}`, 'usr_bft_001', u.id, now - 86400000 * 5);
  }

  // Insert Initial Commissions for Alex Mercer
  const seedCommissions = [
    { id: 'COMM-001', subId: 'USR-SUB-101', type: 'purchase', level: 1, pkg: '$10,000 Two-Step', price: 99.00, rate: 0.10, amt: 9.90, ts: now - 86400000 * 12 },
    { id: 'COMM-002', subId: 'USR-SUB-102', type: 'purchase', level: 1, pkg: '$25,000 Instant Funded', price: 299.00, rate: 0.10, amt: 29.90, ts: now - 86400000 * 9 },
    { id: 'COMM-003', subId: 'USR-GRAND-201', type: 'purchase', level: 2, pkg: '$50,000 One-Step', price: 289.00, rate: 0.05, amt: 14.45, ts: now - 86400000 * 7 },
    { id: 'COMM-004', subId: 'USR-GRAND-202', type: 'purchase', level: 2, pkg: '$10,000 Instant Funded', price: 149.00, rate: 0.05, amt: 7.45, ts: now - 86400000 * 5 },
    { id: 'COMM-005', subId: 'USR-LEAF-301', type: 'purchase', level: 3, pkg: '$100,000 Two-Step', price: 499.00, rate: 0.02, amt: 9.98, ts: now - 86400000 * 4 },
    { id: 'COMM-006', subId: 'USR-SUB-101', type: 'withdrawal', level: 1, pkg: 'Direct Referral Payout Bonus (8% of $500)', price: 500.00, rate: 0.08, amt: 40.00, ts: now - 86400000 * 2 },
  ];

  for (const c of seedCommissions) {
    db.prepare(`
      INSERT INTO commissions (
        id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
      ) VALUES (?, 'usr_bft_001', ?, ?, ?, ?, ?, ?, ?, 'paid', ?)
    `).run(c.id, c.subId, c.type, c.level, c.pkg, c.price, c.rate, c.amt, c.ts);
  }

  // Insert Historical Withdrawal for Alex Mercer
  db.prepare(`
    INSERT INTO withdrawals (
      id, user_id, account_id, gross_amount, net_profit, max_allowed_profit, profit_share_rate, fee_amount, net_payout,
      wallet_address, network, payment_method, status, tx_hash, reference_number, requested_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0.80, ?, ?, ?, ?, 'crypto_trc20', 'completed', ?, ?, ?, ?)
  `).run(
    'WD-51940284910',
    'usr_bft_001',
    'BFT-91823',
    350.00,
    680.00,
    544.00,
    35.00,
    315.00,
    '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
    'BSC (BEP20)',
    '0x9fb8c14d5e23a0781b4d0812eac92b8d4f0980598125cfb881329a1b9e21',
    'REF-51940284910',
    now - 86400000 * 1,
    now - 86400000 * 1 + 92000
  );

  // Insert Normalized Weekly Leaderboard with Kasun Perera at #9
  const leaderboardSeed = [
    { rank: 1, name: 'Rashid Al-Maktoum', country: 'Dubai, UAE', flag: '🇦🇪', tier: '$100,000 Instant Funded', profit: 48990.50, winRate: 79.4, payout: '1m 14s' },
    { rank: 2, name: 'Arjun Malhotra', country: 'India', flag: '🇮🇳', tier: '$50,000 Two-Step', profit: 42150.80, winRate: 77.2, payout: '1m 28s' },
    { rank: 3, name: 'Faizal Zulkifli', country: 'Malaysia', flag: '🇲🇾', tier: '$50,000 One-Step', profit: 36508.00, winRate: 75.8, payout: '1m 18s' },
    { rank: 4, name: 'Hamza Qureshi', country: 'Pakistan', flag: '🇵🇰', tier: '$25,000 Instant Funded', profit: 31840.40, winRate: 74.1, payout: '1m 42s' },
    { rank: 5, name: 'Tariq Al-Mansoor', country: 'Dubai, UAE', flag: '🇦🇪', tier: '$25,000 One-Step', profit: 28460.00, winRate: 72.6, payout: '1m 31s' },
    { rank: 6, name: 'Vikramjit Singh', country: 'India', flag: '🇮🇳', tier: '$25,000 Two-Step', profit: 24404.00, winRate: 71.3, payout: '1m 49s' },
    { rank: 7, name: 'Nurul Hidayah', country: 'Malaysia', flag: '🇲🇾', tier: '$10,000 One-Step', profit: 21940.00, winRate: 70.5, payout: '1m 15s' },
    { rank: 8, name: 'Bilal Ahmed Khan', country: 'Pakistan', flag: '🇵🇰', tier: '$10,000 Two-Step', profit: 19720.20, winRate: 69.4, payout: '1m 36s' },
    // Kasun Perera strictly normalized at #9
    { rank: 9, name: 'Kasun Perera', country: 'Sri Lanka', flag: '🇱🇰', tier: '$10,000 Instant Funded', profit: 18995.22, winRate: 77.9, payout: '1m 12s' },
    { rank: 10, name: 'Ananya Sharma', country: 'India', flag: '🇮🇳', tier: '$10,000 One-Step', profit: 17380.00, winRate: 68.1, payout: '1m 41s' },
    { rank: 11, name: 'Zainab Al-Hashemi', country: 'Dubai, UAE', flag: '🇦🇪', tier: '$10,000 Instant Funded', profit: 15940.00, winRate: 67.4, payout: '1m 29s' },
    { rank: 12, name: 'Syed Usman Ali', country: 'Pakistan', flag: '🇵🇰', tier: '$10,000 Two-Step', profit: 14820.50, winRate: 66.8, payout: '1m 52s' },
    { rank: 13, name: 'Chong Wei Ming', country: 'Malaysia', flag: '🇲🇾', tier: '$5,000 One-Step', profit: 13750.00, winRate: 66.0, payout: '1m 20s' },
    { rank: 14, name: 'Rohan Deshmukh', country: 'India', flag: '🇮🇳', tier: '$10,000 Instant Funded', profit: 12890.10, winRate: 65.2, payout: '1m 47s' },
    { rank: 15, name: 'Khalid Bin Zayed', country: 'Dubai, UAE', flag: '🇦🇪', tier: '$5,000 Two-Step', profit: 11940.00, winRate: 64.5, payout: '1m 30s' },
  ];

  for (const lb of leaderboardSeed) {
    db.prepare(`
      INSERT INTO leaderboard (id, rank, name, country, flag, account_tier, profit, win_rate, payout_time, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`LB-${lb.rank}`, lb.rank, lb.name, lb.country, lb.flag, lb.tier, lb.profit, lb.winRate, lb.payout, now);
  }
}

seedInitialData();

// ============================================================================
// Database Query & Business Rule Helper Functions
// ============================================================================

export function getUserById(userId: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
}

export function getUserByEmail(email: string) {
  return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as any;
}

export function getUserByReferralCode(code: string) {
  return db.prepare('SELECT * FROM users WHERE referral_code = ? COLLATE NOCASE').get(code) as any;
}

export function createOrUpdateGoogleUser(params: {
  email: string;
  fullName: string;
  googleId?: string;
  avatarUrl?: string;
  referralCodeInput?: string | null;
}) {
  const existing = getUserByEmail(params.email);
  const now = Date.now();

  if (existing) {
    db.prepare(`
      UPDATE users SET
        full_name = CASE WHEN profile_locked = 1 THEN full_name ELSE ? END,
        google_id = COALESCE(?, google_id),
        avatar_url = COALESCE(?, avatar_url),
        updated_at = ?
      WHERE id = ?
    `).run(params.fullName, params.googleId || null, params.avatarUrl || null, now, existing.id);
    return getUserById(existing.id);
  }

  // Generate new unique referral code
  const sanitizedName = params.fullName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const newRefCode = `BFT-${sanitizedName || 'TRD'}${randomSuffix}`;
  const newUserId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  // Resolve upline sponsor if referral code was provided
  let sponsorId: string | null = null;
  if (params.referralCodeInput) {
    const sponsor = getUserByReferralCode(params.referralCodeInput);
    if (sponsor && sponsor.id !== newUserId) {
      sponsorId = sponsor.id;
    }
  }

  db.prepare(`
    INSERT INTO users (id, email, full_name, avatar_url, google_id, referral_code, referred_by, kyc_status, profile_locked, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'unverified', 0, ?, ?)
  `).run(
    newUserId,
    params.email.toLowerCase(),
    params.fullName,
    params.avatarUrl || null,
    params.googleId || null,
    newRefCode,
    sponsorId,
    now,
    now
  );

  // Link multi-tier upline chain
  if (sponsorId) {
    linkUplineReferrals(sponsorId, newUserId, now);
  }

  return getUserById(newUserId);
}

function linkUplineReferrals(l1SponsorId: string, newUserId: string, nowMs: number) {
  // Level 1 (Direct)
  db.prepare(`
    INSERT OR IGNORE INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(`REF-L1-${l1SponsorId}-${newUserId}`, l1SponsorId, newUserId, nowMs);

  const l1User = getUserById(l1SponsorId);
  if (l1User?.referred_by) {
    // Level 2 (Parent of L1)
    const l2SponsorId = l1User.referred_by;
    db.prepare(`
      INSERT OR IGNORE INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
      VALUES (?, ?, ?, 2, ?)
    `).run(`REF-L2-${l2SponsorId}-${newUserId}`, l2SponsorId, newUserId, nowMs);

    const l2User = getUserById(l2SponsorId);
    if (l2User?.referred_by) {
      // Level 3 (Parent of L2)
      const l3SponsorId = l2User.referred_by;
      db.prepare(`
        INSERT OR IGNORE INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
        VALUES (?, ?, ?, 3, ?)
      `).run(`REF-L3-${l3SponsorId}-${newUserId}`, l3SponsorId, newUserId, nowMs);
    }
  }
}

export function createSessionToken(userId: string, rememberMe: boolean = true) {
  const token = `bft_sess_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
  const expiresAt = Date.now() + (rememberMe ? 30 * 86400 * 1000 : 86400 * 1000);
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt, Date.now());
  return { token, expiresAt };
}

export function validateSession(token: string) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as any;
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return getUserById(session.user_id);
}

export function deleteSessionToken(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function mapAccountRowToTradingAccount(row: any) {
  if (!row) return null;
  return {
    ...row,
    id: row.id,
    loginId: row.id,
    passwordHash: 'bft_live_' + String(row.id).replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
    tier: row.tier,
    tierName: row.tier_name,
    size: row.size,
    initialBalance: row.initial_balance,
    currentBalance: row.current_balance,
    startingDayEquity: row.starting_day_equity,
    equity: row.equity,
    dailyLossLimitPercent: row.daily_loss_limit_percent,
    maxOverallLossPercent: row.max_overall_loss_percent,
    maxRiskPerTradePercent: row.max_risk_per_trade_percent,
    status: row.status,
    phase: row.phase,
    tradingDaysCompleted: row.trading_days_completed,
    tradesCount: row.trades_count,
    winRate: row.win_rate,
    dailyWithdrawalsUnlocked: Boolean(row.daily_withdrawals_unlocked),
    firstWithdrawalCompleted: Boolean(row.first_withdrawal_completed),
    monthsCompleted: row.months_completed || 1,
    scalingActive: Boolean(row.scaling_active),
    createdDate: row.created_date,
    lastActiveDate: row.last_active_date || row.created_date,
    certificateId: row.certificate_id || undefined,
  };
}

try {
  db.exec(`ALTER TABLE accounts ADD COLUMN certificate_id TEXT;`);
} catch {
  // Column already exists
}

export const COUNTRY_FLAGS: Record<string, string> = {
  'United States': '🇺🇸',
  'Sri Lanka': '🇱🇰',
  'United Kingdom': '🇬🇧',
  'United Arab Emirates': '🇦🇪',
  'Dubai, UAE': '🇦🇪',
  'India': '🇮🇳',
  'Malaysia': '🇲🇾',
  'Pakistan': '🇵🇰',
  'Singapore': '🇸🇬',
  'Canada': '🇨🇦',
  'Australia': '🇦🇺',
  'Germany': '🇩🇪',
  'France': '🇫🇷',
  'Japan': '🇯🇵',
  'Switzerland': '🇨🇭',
  'Brazil': '🇧🇷',
  'Nigeria': '🇳🇬',
  'South Africa': '🇿🇦',
};

export function getCountryFlag(country?: string | null): string {
  if (!country) return '🇺🇸';
  return COUNTRY_FLAGS[country.trim()] || '🌐';
}

export function getAccountsForUser(userId: string) {
  const rows = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
  return rows.map(mapAccountRowToTradingAccount);
}

export function getAccountById(accountId: string) {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as any;
  return mapAccountRowToTradingAccount(row);
}

export function createAccount(params: {
  userId: string;
  tier: 'two-step' | 'one-step' | 'instant';
  tierName: string;
  size: number;
  dailyWithdrawalsUnlocked?: boolean;
}) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString().split('T')[0];
  const newAccountId = `BFT-${Math.floor(10000 + Math.random() * 89999)}`;
  const phase = params.tier === 'instant' ? 'funded' : 'phase_1';
  const dailyLossLimit = params.tier === 'two-step' ? 8 : params.tier === 'one-step' ? 6 : 5;
  const maxOverallLoss = params.tier === 'two-step' ? 20 : params.tier === 'one-step' ? 12 : 10;

  db.prepare(`
    INSERT INTO accounts (
      id, user_id, tier, tier_name, size, initial_balance, current_balance, starting_day_equity, equity,
      daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent, status, phase,
      trading_days_completed, trades_count, win_rate, daily_withdrawals_unlocked, first_withdrawal_completed,
      created_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, 'active', ?, 0, 0, 0, ?, 0, ?, ?, ?)
  `).run(
    newAccountId,
    params.userId,
    params.tier,
    params.tierName,
    params.size,
    params.size,
    params.size,
    params.size,
    params.size,
    dailyLossLimit,
    maxOverallLoss,
    phase,
    params.dailyWithdrawalsUnlocked ? 1 : 0,
    nowIso,
    now,
    now
  );

  return getAccountById(newAccountId);
}

export function updateAccountStateInDb(
  userId: string,
  accountId: string,
  updates: {
    currentBalance?: number;
    equity?: number;
    startingDayEquity?: number;
    status?: string;
    phase?: string;
    tradesCount?: number;
    winRate?: number;
    tradingDaysCompleted?: number;
    certificateId?: string;
  }
) {
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId) as any;
  if (!existing) throw new Error('Account not found or unauthorized.');

  const now = Date.now();
  db.prepare(`
    UPDATE accounts SET
      current_balance = COALESCE(?, current_balance),
      equity = COALESCE(?, equity),
      starting_day_equity = COALESCE(?, starting_day_equity),
      status = COALESCE(?, status),
      phase = COALESCE(?, phase),
      trades_count = COALESCE(?, trades_count),
      win_rate = COALESCE(?, win_rate),
      trading_days_completed = COALESCE(?, trading_days_completed),
      certificate_id = COALESCE(?, certificate_id),
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    updates.currentBalance !== undefined ? updates.currentBalance : null,
    updates.equity !== undefined ? updates.equity : null,
    updates.startingDayEquity !== undefined ? updates.startingDayEquity : null,
    updates.status || null,
    updates.phase || null,
    updates.tradesCount !== undefined ? updates.tradesCount : null,
    updates.winRate !== undefined ? updates.winRate : null,
    updates.tradingDaysCompleted !== undefined ? updates.tradingDaysCompleted : null,
    updates.certificateId || null,
    now,
    accountId,
    userId
  );

  return getAccountById(accountId);
}

export function passChallengePhaseInDb(
  userId: string,
  accountId: string,
  provisionLiveDirectly: boolean = false
) {
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId) as any;
  if (!existing) throw new Error('Challenge account not found or unauthorized.');

  const now = Date.now();
  const nowIso = new Date(now).toISOString().split('T')[0];
  const certId = existing.certificate_id || `CERT-${existing.id}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Mark the completed challenge phase as 'passed' with official certificateId
  db.prepare(`
    UPDATE accounts SET
      status = 'passed',
      certificate_id = ?,
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(certId, now, accountId, userId);

  const isToPhase2 = !provisionLiveDirectly && existing.tier === 'two-step' && existing.phase === 'phase_1';
  const nextPrefix = isToPhase2 ? 'BFT-P2' : 'BFT-LIVE';
  const nextAccountId = `${nextPrefix}-${Math.floor(10000 + Math.random() * 89999)}`;
  const nextPhase = isToPhase2 ? 'phase_2' : 'funded';
  const baseTierName = String(existing.tier_name || '').replace(/\s*\(Phase \d\)/i, '');
  const nextTierName = isToPhase2
    ? `${baseTierName} (Phase 2)`
    : `Real Funded (${baseTierName})`;
  const nextBalance = isToPhase2
    ? Number(existing.size)
    : Math.max(Number(existing.size), Number(existing.current_balance));

  db.prepare(`
    INSERT INTO accounts (
      id, user_id, tier, tier_name, size, initial_balance, current_balance, starting_day_equity, equity,
      daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent, status, phase,
      trading_days_completed, trades_count, win_rate, daily_withdrawals_unlocked, first_withdrawal_completed,
      certificate_id, created_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 14, 0, 0, ?, 0, ?, ?, ?, ?)
  `).run(
    nextAccountId,
    userId,
    existing.tier,
    nextTierName,
    existing.size,
    existing.size,
    nextBalance,
    nextBalance,
    nextBalance,
    existing.daily_loss_limit_percent,
    existing.max_overall_loss_percent,
    existing.max_risk_per_trade_percent || 5,
    nextPhase,
    existing.daily_withdrawals_unlocked || 0,
    !isToPhase2 ? certId : null,
    nowIso,
    now + 1,
    now + 1
  );

  return {
    lockedAccount: getAccountById(accountId),
    deployedAccount: getAccountById(nextAccountId),
    certificateId: certId,
    isRealFundedDeployed: !isToPhase2,
  };
}

export function lockUserProfile(userId: string, data: { fullName: string; address: string; dateOfBirth: string; country?: string; telegramHandle?: string }) {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found.');

  if (user.profile_locked === 1) {
    // Only update mutable fields like telegram handle or country flag
    db.prepare(`
      UPDATE users SET
        telegram_handle = COALESCE(?, telegram_handle),
        country = COALESCE(?, country),
        updated_at = ?
      WHERE id = ?
    `).run(data.telegramHandle || null, data.country || null, Date.now(), userId);
    return getUserById(userId);
  }

  db.prepare(`
    UPDATE users SET
      full_name = ?,
      address = ?,
      date_of_birth = ?,
      country = COALESCE(?, country),
      telegram_handle = COALESCE(?, telegram_handle),
      profile_locked = 1,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.fullName.trim(),
    data.address.trim(),
    data.dateOfBirth.trim(),
    data.country?.trim() || null,
    data.telegramHandle?.trim() || null,
    Date.now(),
    userId
  );

  return getUserById(userId);
}

export function updateUserKycStatus(userId: string, data: { status: 'unverified' | 'pending' | 'verified' | 'rejected'; docType?: string; timerEndsAt?: number }) {
  const now = Date.now();
  db.prepare(`
    UPDATE users SET
      kyc_status = ?,
      kyc_doc_type = COALESCE(?, kyc_doc_type),
      kyc_timer_ends_at = ?,
      kyc_verified_at = CASE WHEN ? = 'verified' THEN ? ELSE kyc_verified_at END,
      profile_locked = CASE WHEN ? = 'verified' THEN 1 ELSE profile_locked END,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.status,
    data.docType || null,
    data.timerEndsAt || null,
    data.status,
    now,
    data.status,
    now,
    userId
  );
  return getUserById(userId);
}

// ============================================================================
// Core Prop Trading Business Rules & Financial Calculations
// ============================================================================

/**
 * Validates and records a withdrawal enforcing:
 * 0. Strict Challenge Phase Lock (One-Step / Two-Step Challenges cannot withdraw until passed & funded)
 * 1. Strict KYC verified requirement
 * 2. 14-day mandatory waiting period on first withdrawal
 * 3. $250.00 minimum profit threshold
 * 4. $250.00 minimum withdrawal amount
 * 5. Strict 80% Net Generated Profit Payout Ceiling Rule
 * 6. 10% withdrawal fee deduction
 * 7. Real-time 8% Direct Referral Payout Bonus to sponsor
 */
export function processWithdrawalRequest(params: {
  userId: string;
  accountId: string;
  requestedAmount: number;
  walletAddress: string;
  network: string;
  paymentMethod: string;
}) {
  const user = getUserById(params.userId);
  if (!user) throw new Error('User not found.');

  if (user.kyc_status !== 'verified') {
    throw new Error('Please complete your KYC verification to unlock withdrawals.');
  }

  const account = getAccountById(params.accountId);
  if (!account || account.user_id !== params.userId) {
    throw new Error('Trading account not found or unauthorized.');
  }

  // STRICT CHALLENGE PHASE RULE: One-Step and Two-Step Challenge accounts cannot withdraw during challenge phase
  const isLiveFunded = account.tier === 'instant' || account.phase === 'funded';
  if (!isLiveFunded) {
    throw new Error(
      'Withdrawals are locked during the Challenge Phase. Trade to hit your profit target first to pass the challenge, earn your Completion Certificate, and unlock your Live Funded Account.'
    );
  }

  if (account.status !== 'active') {
    throw new Error('Account is not active.');
  }

  // 14-day first withdrawal hold
  if (account.first_withdrawal_completed === 0 && account.trading_days_completed < 14) {
    throw new Error(`First withdrawal requires a mandatory 14-day account holding period (${14 - account.trading_days_completed} days remaining).`);
  }

  const netProfit = Math.max(0, Number((account.current_balance - account.initial_balance).toFixed(2)));
  if (netProfit < 250) {
    throw new Error(`Minimum profit requirement is $250.00. Current net profit is $${netProfit.toFixed(2)}.`);
  }

  if (params.requestedAmount < 250) {
    throw new Error('Minimum withdrawal amount is $250.00 USD.');
  }

  if (params.requestedAmount > netProfit) {
    throw new Error(`Cannot withdraw more than total accumulated profit ($${netProfit.toFixed(2)}). Initial funded balance cannot be withdrawn directly.`);
  }

  // ENFORCE STRICT 80% NET GENERATED PROFIT PAYOUT CEILING
  const maxAllowed80Percent = Number((netProfit * 0.80).toFixed(2));
  if (params.requestedAmount > maxAllowed80Percent) {
    throw new Error(
      `Withdrawal exceeds the 80% profit payout ceiling. Maximum allowable withdrawal is $${maxAllowed80Percent.toFixed(2)} (80% of $${netProfit.toFixed(2)} net generated profit).`
    );
  }

  // Deduct 10% Withdrawal Fee
  const feeAmount = Number((params.requestedAmount * 0.10).toFixed(2));
  const netPayout = Number((params.requestedAmount - feeAmount).toFixed(2));

  const now = Date.now();
  const withdrawalId = `WD-${Math.floor(51940000000 + Math.random() * 99999999)}`;
  const refNumber = `0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;

  // Insert withdrawal record with status 'pending' (balance will be debited manually upon admin approval)
  db.prepare(`
    INSERT INTO withdrawals (
      id, user_id, account_id, gross_amount, net_profit, max_allowed_profit, profit_share_rate, fee_amount, net_payout,
      wallet_address, network, payment_method, status, reference_number, tx_hash, requested_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0.80, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)
  `).run(
    withdrawalId,
    params.userId,
    params.accountId,
    params.requestedAmount,
    netProfit,
    maxAllowed80Percent,
    feeAmount,
    netPayout,
    params.walletAddress,
    params.network,
    params.paymentMethod,
    refNumber,
    refNumber,
    now
  );

  // Real-time 8% Direct Referral Payout Bonus to Direct Sponsor
  if (user.referred_by) {
    const bonusRate = 0.08;
    const bonusAmount = Number((params.requestedAmount * bonusRate).toFixed(2));
    const commId = `COMM-WD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    db.prepare(`
      INSERT INTO commissions (
        id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
      ) VALUES (?, ?, ?, 'withdrawal', 1, ?, ?, ?, ?, 'paid', ?)
    `).run(
      commId,
      user.referred_by,
      user.id,
      `Direct Referral Payout Bonus (8% of $${params.requestedAmount.toFixed(2)} Withdrawal by ${user.full_name})`,
      params.requestedAmount,
      bonusRate,
      bonusAmount,
      now
    );
  }

  const updatedAccount = getAccountById(account.id);
  const withdrawalRecord = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId);

  return {
    ok: true,
    withdrawal: withdrawalRecord,
    updatedAccount,
    breakdown: {
      requestedAmount: params.requestedAmount,
      netProfit,
      maxAllowed80Percent,
      feeAmount,
      netPayout,
    },
  };
}

/**
 * Credits 3-Tier Multi-Level Commissions on Evaluation Purchases:
 * Level 1: 10%
 * Level 2: 5%
 * Level 3: 2%
 */
export function creditPurchaseCommissions(buyerUserId: string, packageName: string, packagePrice: number, referralCodeUsed?: string | null) {
  let buyer = getUserById(buyerUserId);
  const now = Date.now();

  // If referral code used during checkout, link upline if not yet linked
  if (referralCodeUsed && buyer && !buyer.referred_by) {
    const sponsor = getUserByReferralCode(referralCodeUsed);
    if (sponsor && sponsor.id !== buyer.id) {
      db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(sponsor.id, buyer.id);
      linkUplineReferrals(sponsor.id, buyer.id, now);
      buyer = getUserById(buyerUserId);
    }
  }

  if (!buyer?.referred_by) return [];

  const commissionsRecorded = [];

  // Level 1: 10%
  const l1SponsorId = buyer.referred_by;
  const l1Amount = Number((packagePrice * 0.10).toFixed(2));
  const l1Id = `COMM-P1-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  db.prepare(`
    INSERT INTO commissions (id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at)
    VALUES (?, ?, ?, 'purchase', 1, ?, ?, 0.10, ?, 'paid', ?)
  `).run(l1Id, l1SponsorId, buyer.id, `Level 1 Commission: ${packageName}`, packagePrice, l1Amount, now);
  commissionsRecorded.push({ id: l1Id, level: 1, sponsorId: l1SponsorId, amount: l1Amount });

  // Level 2: 5%
  const l1User = getUserById(l1SponsorId);
  if (l1User?.referred_by) {
    const l2SponsorId = l1User.referred_by;
    const l2Amount = Number((packagePrice * 0.05).toFixed(2));
    const l2Id = `COMM-P2-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    db.prepare(`
      INSERT INTO commissions (id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at)
      VALUES (?, ?, ?, 'purchase', 2, ?, ?, 0.05, ?, 'paid', ?)
    `).run(l2Id, l2SponsorId, buyer.id, `Level 2 Commission: ${packageName}`, packagePrice, l2Amount, now);
    commissionsRecorded.push({ id: l2Id, level: 2, sponsorId: l2SponsorId, amount: l2Amount });

    // Level 3: 2%
    const l2User = getUserById(l2SponsorId);
    if (l2User?.referred_by) {
      const l3SponsorId = l2User.referred_by;
      const l3Amount = Number((packagePrice * 0.02).toFixed(2));
      const l3Id = `COMM-P3-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      db.prepare(`
        INSERT INTO commissions (id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at)
        VALUES (?, ?, ?, 'purchase', 3, ?, ?, 0.02, ?, 'paid', ?)
      `).run(l3Id, l3SponsorId, buyer.id, `Level 3 Commission: ${packageName}`, packagePrice, l3Amount, now);
      commissionsRecorded.push({ id: l3Id, level: 3, sponsorId: l3SponsorId, amount: l3Amount });
    }
  }

  return commissionsRecorded;
}

export function getAffiliateDashboardStats(userId: string) {
  const commissions = db.prepare('SELECT * FROM commissions WHERE sponsor_id = ? ORDER BY created_at DESC').all(userId) as any[];
  const referrals = db.prepare(`
    SELECT r.*, u.full_name, u.email, u.created_at as joined_at
    FROM referrals r
    JOIN users u ON r.referred_user_id = u.id
    WHERE r.sponsor_id = ?
    ORDER BY r.created_at DESC
  `).all(userId) as any[];

  let totalEarnings = 0;
  let level1Earnings = 0;
  let level2Earnings = 0;
  let level3Earnings = 0;
  let withdrawalBonusEarnings = 0;

  for (const c of commissions) {
    totalEarnings += c.commission_amount;
    if (c.source_type === 'withdrawal') {
      withdrawalBonusEarnings += c.commission_amount;
    }
    if (c.tier_level === 1) level1Earnings += c.commission_amount;
    if (c.tier_level === 2) level2Earnings += c.commission_amount;
    if (c.tier_level === 3) level3Earnings += c.commission_amount;
  }

  return {
    totalEarnings: Number(totalEarnings.toFixed(2)),
    level1Earnings: Number(level1Earnings.toFixed(2)),
    level2Earnings: Number(level2Earnings.toFixed(2)),
    level3Earnings: Number(level3Earnings.toFixed(2)),
    withdrawalBonusEarnings: Number(withdrawalBonusEarnings.toFixed(2)),
    teamSize: referrals.length,
    level1Count: referrals.filter((r) => r.tier_level === 1).length,
    level2Count: referrals.filter((r) => r.tier_level === 2).length,
    level3Count: referrals.filter((r) => r.tier_level === 3).length,
    recentCommissions: commissions.slice(0, 20),
    referrals: referrals.slice(0, 50),
  };
}

export function getWeeklyLeaderboardQuery() {
  const rows = db.prepare('SELECT * FROM leaderboard ORDER BY rank ASC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    rank: r.rank,
    name: r.name,
    country: r.country,
    flag: r.flag,
    accountTier: r.account_tier,
    profit: r.profit,
    winRate: r.win_rate,
    payoutTime: r.payout_time,
  }));
}
