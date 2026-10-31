import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

function openResilientDatabase(): DatabaseSync {
  const candidates = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(os.tmpdir(), 'bft_data'),
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const dbFile = path.join(dir, 'bft_platform.sqlite');
      const instance = new DatabaseSync(dbFile);
      try {
        instance.exec('PRAGMA journal_mode = WAL;');
      } catch {
        // Fallback to default journal mode if container filesystem does not support WAL mmap
      }
      return instance;
    } catch {
      // Try next candidate
    }
  }
  return new DatabaseSync(':memory:');
}

export const db = openResilientDatabase();

// Enable foreign keys and initialize tables
db.exec(`
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
  const accountCategory =
    row.account_category ||
    (row.tier === 'personal' || row.phase === 'personal_live'
      ? 'personal_live'
      : row.tier === 'demo' || row.phase === 'demo'
      ? 'demo'
      : 'prop');
  return {
    ...row,
    id: row.id,
    userId: row.user_id,
    user_id: row.user_id,
    loginId: row.id,
    passwordHash: 'bft_live_' + String(row.id).replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
    tier: row.tier,
    tierName: row.tier_name,
    accountCategory,
    depositedCapital: Number(row.deposited_capital ?? (accountCategory === 'personal_live' ? row.initial_balance : 0)),
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

const accountAlterColumns = [
  `ALTER TABLE accounts ADD COLUMN certificate_id TEXT;`,
  `ALTER TABLE accounts ADD COLUMN account_category TEXT DEFAULT 'prop';`,
  `ALTER TABLE accounts ADD COLUMN deposited_capital REAL DEFAULT 0;`,
];
for (const stmt of accountAlterColumns) {
  try {
    db.exec(stmt);
  } catch {
    // Column already exists
  }
}

const kycAlterColumns = [
  `ALTER TABLE users ADD COLUMN kyc_doc_number TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_front_url TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_back_url TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_front_filename TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_back_filename TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_submitted_at TEXT;`,
  `ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'trader';`,
  `ALTER TABLE users ADD COLUMN self_balance REAL DEFAULT 0;`,
  `ALTER TABLE users ADD COLUMN demo_balance REAL DEFAULT 10000;`,
  `ALTER TABLE users ADD COLUMN funded_balance REAL DEFAULT 0;`,
  `ALTER TABLE withdrawals ADD COLUMN admin_notes TEXT;`,
];
for (const stmt of kycAlterColumns) {
  try {
    db.exec(stmt);
  } catch {
    // Column already exists
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    address TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'United States',
    profile_locked INTEGER DEFAULT 1,
    doc_type TEXT,
    document_number TEXT,
    front_document_url TEXT,
    back_document_url TEXT,
    front_file_name TEXT,
    back_file_name TEXT,
    status TEXT NOT NULL DEFAULT 'unverified',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    currency TEXT DEFAULT 'USDT',
    network TEXT DEFAULT 'TRC-20',
    tx_hash TEXT,
    deposit_slip_url TEXT,
    status TEXT DEFAULT 'pending',
    decline_reason TEXT,
    created_at INTEGER NOT NULL,
    processed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    direction TEXT NOT NULL,
    strike_price REAL NOT NULL,
    close_price REAL,
    investment REAL NOT NULL,
    payout_percentage REAL NOT NULL,
    potential_payout REAL NOT NULL,
    pnl REAL DEFAULT 0,
    credited_amount REAL DEFAULT 0,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    account_tier TEXT,
    created_at INTEGER NOT NULL,
    settled_at INTEGER
  );
`);

export function getKycSubmissionForUser(userId: string) {
  return db.prepare('SELECT * FROM kyc_submissions WHERE user_id = ?').get(userId) as any;
}

export function ensureUserInDb(params: {
  id: string;
  email: string;
  fullName?: string;
  referralCode?: string;
}) {
  if (!params.id && !params.email) return null;
  let existing = params.id ? getUserById(params.id) : null;
  if (!existing && params.email) {
    existing = getUserByEmail(params.email);
  }
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const cleanEmail = (params.email || `${params.id}@bft.io`).trim().toLowerCase();
  const cleanName = (params.fullName || cleanEmail.split('@')[0] || 'BFT Trader').trim();
  const sanitizedRef = (params.referralCode || `BFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`).trim();
  const userId = params.id || `usr_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    db.prepare(`
      INSERT INTO users (id, email, full_name, referral_code, kyc_status, profile_locked, country, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'unverified', 0, 'United States', ?, ?)
    `).run(userId, cleanEmail, cleanName, sanitizedRef, now, now);
  } catch {
    // Fallback if referral_code collided
    const fallbackRef = `BFT-${Math.floor(100000 + Math.random() * 899999)}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, full_name, referral_code, kyc_status, profile_locked, country, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'unverified', 0, 'United States', ?, ?)
    `).run(userId, cleanEmail, cleanName, fallbackRef, now, now);
  }

  return getUserById(userId) || getUserByEmail(cleanEmail);
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

export function ensurePersonalLiveAccountForUser(userId: string) {
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user) return null;

  const existing = db
    .prepare(
      `SELECT * FROM accounts WHERE user_id = ? AND (tier = 'personal' OR account_category = 'personal_live' OR phase = 'personal_live') LIMIT 1`
    )
    .get(userId) as any;

  if (existing) {
    return mapAccountRowToTradingAccount(existing);
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString().split('T')[0];
  const suffix = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase() || '001';
  const accountId = userId === 'usr_bft_001' ? 'BFT-PERS-001' : `BFT-PERS-${suffix}`;
  const initialDeposit = 0;

  db.prepare(`
    INSERT OR IGNORE INTO accounts (
      id, user_id, tier, tier_name, account_category, deposited_capital, size,
      initial_balance, current_balance, starting_day_equity, equity,
      daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent,
      status, phase, trading_days_completed, trades_count, win_rate,
      daily_withdrawals_unlocked, first_withdrawal_completed, created_date, created_at, updated_at
    ) VALUES (?, ?, 'personal', 'Personal Live Balance (Self-Funded)', 'personal_live', ?, ?, ?, ?, ?, ?, 0, 0, 100, 'active', 'personal_live', 14, 0, 0, 1, 1, ?, ?, ?)
  `).run(
    accountId,
    userId,
    initialDeposit,
    initialDeposit,
    initialDeposit,
    initialDeposit,
    initialDeposit,
    initialDeposit,
    nowIso,
    now - 86400000 * 25,
    now
  );

  return getAccountById(accountId);
}

export function creditPersonalAccountDepositInDb(params: {
  userId: string;
  accountId?: string;
  amountUsdt: number;
}) {
  const cleanAmount = Number(params.amountUsdt);
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new Error('Deposit amount must be greater than $0.00.');
  }

  let personalAcc = ensurePersonalLiveAccountForUser(params.userId);
  if (params.accountId) {
    const specific = getAccountById(params.accountId);
    if (
      specific &&
      specific.user_id === params.userId &&
      (specific.tier === 'personal' || specific.accountCategory === 'personal_live')
    ) {
      personalAcc = specific;
    }
  }

  if (!personalAcc) {
    throw new Error('Personal Live account could not be initialized for deposit.');
  }

  const now = Date.now();
  const nextDeposited = Number(((personalAcc.depositedCapital || 0) + cleanAmount).toFixed(2));
  const nextInitial = Number(((personalAcc.initialBalance || 0) + cleanAmount).toFixed(2));
  const nextCurrent = Number(((personalAcc.currentBalance || 0) + cleanAmount).toFixed(2));
  const nextEquity = Number(((personalAcc.equity || 0) + cleanAmount).toFixed(2));
  const nextStartingDay = Number(((personalAcc.startingDayEquity || 0) + cleanAmount).toFixed(2));

  db.prepare(`
    UPDATE accounts SET
      deposited_capital = ?,
      size = ?,
      initial_balance = ?,
      current_balance = ?,
      starting_day_equity = ?,
      equity = ?,
      status = 'active',
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    nextDeposited,
    nextInitial,
    nextInitial,
    nextCurrent,
    nextStartingDay,
    nextEquity,
    now,
    personalAcc.id,
    params.userId
  );

  try {
    db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(nextCurrent, params.userId);
  } catch {}

  return getAccountById(personalAcc.id);
}

export function getAccountsForUser(userId: string) {
  ensurePersonalLiveAccountForUser(userId);
  const rows = db
    .prepare(
      `SELECT * FROM accounts WHERE user_id = ? ORDER BY CASE WHEN tier = 'personal' OR account_category = 'personal_live' THEN 1 ELSE 0 END ASC, created_at DESC`
    )
    .all(userId) as any[];
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

  const now = Date.now();

  if (user.profile_locked === 1) {
    // Personal details (Full Name, Address, Date of Birth, Country) remain locked; only telegramHandle is mutable
    db.prepare(`
      UPDATE users SET
        telegram_handle = COALESCE(?, telegram_handle),
        updated_at = ?
      WHERE id = ?
    `).run(data.telegramHandle || null, now, userId);
    return getUserById(userId);
  }

  const cleanName = data.fullName.trim();
  const cleanAddress = data.address.trim();
  const cleanDob = data.dateOfBirth.trim();
  const cleanCountry = (data.country || user.country || 'United States').trim();

  db.prepare(`
    UPDATE users SET
      full_name = ?,
      address = ?,
      date_of_birth = ?,
      country = ?,
      telegram_handle = COALESCE(?, telegram_handle),
      profile_locked = 1,
      updated_at = ?
    WHERE id = ?
  `).run(
    cleanName,
    cleanAddress,
    cleanDob,
    cleanCountry,
    data.telegramHandle?.trim() || null,
    now,
    userId
  );

  // Also persist personal details in kyc_submissions table
  const existingSub = getKycSubmissionForUser(userId);
  if (existingSub) {
    db.prepare(`
      UPDATE kyc_submissions SET
        full_name = ?,
        address = ?,
        date_of_birth = ?,
        country = ?,
        profile_locked = 1,
        updated_at = ?
      WHERE user_id = ?
    `).run(cleanName, cleanAddress, cleanDob, cleanCountry, now, userId);
  } else {
    db.prepare(`
      INSERT INTO kyc_submissions (
        id, user_id, full_name, address, date_of_birth, country, profile_locked, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      `KYC-SUB-${userId}-${now.toString(36)}`,
      userId,
      cleanName,
      cleanAddress,
      cleanDob,
      cleanCountry,
      user.kyc_status || 'unverified',
      now,
      now
    );
  }

  return getUserById(userId);
}

export function updateUserKycStatus(
  userId: string,
  data: {
    status: 'unverified' | 'pending' | 'verified' | 'rejected';
    docType?: string;
    documentNumber?: string;
    frontDocumentUrl?: string;
    backDocumentUrl?: string;
    frontFileName?: string;
    backFileName?: string;
    submittedAt?: string;
    timerEndsAt?: number;
  }
) {
  const now = Date.now();
  const submittedIso = data.submittedAt || new Date(now).toISOString().split('T')[0];

  db.prepare(`
    UPDATE users SET
      kyc_status = ?,
      kyc_doc_type = COALESCE(?, kyc_doc_type),
      kyc_doc_number = COALESCE(?, kyc_doc_number),
      kyc_front_url = COALESCE(?, kyc_front_url),
      kyc_back_url = COALESCE(?, kyc_back_url),
      kyc_front_filename = COALESCE(?, kyc_front_filename),
      kyc_back_filename = COALESCE(?, kyc_back_filename),
      kyc_submitted_at = COALESCE(?, kyc_submitted_at),
      kyc_timer_ends_at = ?,
      kyc_verified_at = CASE WHEN ? = 'verified' THEN ? ELSE kyc_verified_at END,
      profile_locked = CASE WHEN ? IN ('pending', 'verified') THEN 1 ELSE profile_locked END,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.status,
    data.docType || null,
    data.documentNumber || null,
    data.frontDocumentUrl || null,
    data.backDocumentUrl || null,
    data.frontFileName || null,
    data.backFileName || null,
    submittedIso,
    data.timerEndsAt || null,
    data.status,
    now,
    data.status,
    now,
    userId
  );

  const user = getUserById(userId);
  if (user) {
    const existingSub = getKycSubmissionForUser(userId);
    const subStatus = data.status === 'pending' ? 'Pending Verification' : data.status;
    if (existingSub) {
      db.prepare(`
        UPDATE kyc_submissions SET
          doc_type = COALESCE(?, doc_type),
          document_number = COALESCE(?, document_number),
          front_document_url = COALESCE(?, front_document_url),
          back_document_url = COALESCE(?, back_document_url),
          front_file_name = COALESCE(?, front_file_name),
          back_file_name = COALESCE(?, back_file_name),
          status = ?,
          profile_locked = 1,
          updated_at = ?
        WHERE user_id = ?
      `).run(
        data.docType || null,
        data.documentNumber || null,
        data.frontDocumentUrl || null,
        data.backDocumentUrl || null,
        data.frontFileName || null,
        data.backFileName || null,
        subStatus,
        now,
        userId
      );
    } else {
      db.prepare(`
        INSERT INTO kyc_submissions (
          id, user_id, full_name, address, date_of_birth, country, profile_locked,
          doc_type, document_number, front_document_url, back_document_url, front_file_name, back_file_name,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `KYC-SUB-${userId}-${now.toString(36)}`,
        userId,
        user.full_name || 'Verified Trader',
        user.address || '',
        user.date_of_birth || '',
        user.country || 'United States',
        data.docType || 'ID Card',
        data.documentNumber || null,
        data.frontDocumentUrl || null,
        data.backDocumentUrl || null,
        data.frontFileName || null,
        data.backFileName || null,
        subStatus,
        now,
        now
      );
    }
  }

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

  const isPersonalLive =
    account.tier === 'personal' ||
    account.account_category === 'personal_live' ||
    account.accountCategory === 'personal_live' ||
    account.phase === 'personal_live';

  if (isPersonalLive) {
    if (account.status !== 'active') {
      throw new Error('Account is not active.');
    }

    const availableBalance = Math.max(0, Number(account.current_balance.toFixed(2)));
    if (availableBalance < 10) {
      throw new Error(
        `Minimum withdrawal threshold is $10.00. Current Personal Live balance is $${availableBalance.toFixed(2)}.`
      );
    }

    if (params.requestedAmount < 10) {
      throw new Error('Minimum withdrawal amount is $10.00 USD.');
    }

    if (params.requestedAmount > availableBalance) {
      throw new Error(
        `Cannot withdraw more than your available Personal Live balance ($${availableBalance.toFixed(2)}).`
      );
    }

    const feeAmount = Number((params.requestedAmount * 0.03).toFixed(2));
    const netPayout = Number((params.requestedAmount - feeAmount).toFixed(2));
    const now = Date.now();
    const withdrawalId = `WD-${Math.floor(51940000000 + Math.random() * 99999999)}`;
    const refNumber = `0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;

    db.prepare(`
      INSERT INTO withdrawals (
        id, user_id, account_id, gross_amount, net_profit, max_allowed_profit, profit_share_rate, fee_amount, net_payout,
        wallet_address, network, payment_method, status, reference_number, tx_hash, requested_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1.00, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)
    `).run(
      withdrawalId,
      params.userId,
      params.accountId,
      params.requestedAmount,
      availableBalance,
      availableBalance,
      feeAmount,
      netPayout,
      params.walletAddress,
      params.network,
      params.paymentMethod,
      refNumber,
      refNumber,
      now
    );

    const updatedAccount = getAccountById(account.id);
    const withdrawalRecord = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId);

    return {
      ok: true,
      withdrawal: withdrawalRecord,
      updatedAccount,
      breakdown: {
        requestedAmount: params.requestedAmount,
        netProfit: availableBalance,
        maxAllowed80Percent: availableBalance,
        profitShareRate: 1.0,
        feeAmount,
        netPayout,
        isPersonalLive: true,
      },
    };
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

// ============================================================================
// Comprehensive Admin Operations & 3-Level Commission Management
// ============================================================================

export function recordAdminAuditLog(adminUserId: string, action: string, targetId: string, targetType: string, details?: any) {
  const id = `AUDIT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_id, target_type, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    adminUserId,
    action,
    targetId,
    targetType,
    details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
    Date.now()
  );
}

export function getAdminMetrics() {
  const totalUsers = Number((db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0);
  const totalAccounts = Number((db.prepare('SELECT COUNT(*) as c FROM accounts').get() as any)?.c || 0);
  const totalActiveBalance = Number((db.prepare('SELECT SUM(current_balance) as s FROM accounts').get() as any)?.s || 0);
  const totalDeposited = Number((db.prepare('SELECT SUM(deposited_capital) as s FROM accounts').get() as any)?.s || 0);
  const pendingDeposits = Number((db.prepare("SELECT COUNT(*) as c FROM deposits WHERE status = 'pending'").get() as any)?.c || 0);
  const pendingDepositsSum = Number((db.prepare("SELECT SUM(amount) as s FROM deposits WHERE status = 'pending'").get() as any)?.s || 0);
  const pendingWithdrawals = Number((db.prepare("SELECT COUNT(*) as c FROM withdrawals WHERE status = 'pending'").get() as any)?.c || 0);
  const pendingWithdrawalsSum = Number((db.prepare("SELECT SUM(gross_amount) as s FROM withdrawals WHERE status = 'pending'").get() as any)?.s || 0);
  const pendingKyc = Number((db.prepare("SELECT COUNT(*) as c FROM users WHERE kyc_status IN ('pending', 'Pending Verification')").get() as any)?.c || 0);
  const totalCommissions = Number((db.prepare("SELECT SUM(commission_amount) as s FROM commissions WHERE status = 'paid'").get() as any)?.s || 0);
  const totalAffiliates = Number((db.prepare("SELECT COUNT(DISTINCT sponsor_id) as c FROM referrals").get() as any)?.c || 0);

  return {
    totalUsers,
    totalAccounts,
    totalActiveBalance: Number(totalActiveBalance.toFixed(2)),
    totalDeposited: Number(totalDeposited.toFixed(2)),
    pendingDepositsCount: pendingDeposits,
    pendingDepositsAmount: Number(pendingDepositsSum.toFixed(2)),
    pendingWithdrawalsCount: pendingWithdrawals,
    pendingWithdrawalsAmount: Number(pendingWithdrawalsSum.toFixed(2)),
    pendingKycCount: pendingKyc,
    totalCommissionsPaid: Number(totalCommissions.toFixed(2)),
    totalAffiliatesCount: totalAffiliates,
  };
}

export function getAdminUsersList() {
  const users = db.prepare(`
    SELECT u.*,
           (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) as accounts_count,
           (SELECT SUM(current_balance) FROM accounts a WHERE a.user_id = u.id) as total_balance,
           (SELECT full_name FROM users s WHERE s.id = u.referred_by) as sponsor_name
    FROM users u
    ORDER BY u.created_at DESC
  `).all() as any[];

  return users.map((u) => {
    const userAccounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC').all(u.id) as any[];
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role || 'trader',
      avatarUrl: u.avatar_url,
      country: u.country,
      referralCode: u.referral_code,
      referredBy: u.referred_by,
      sponsorName: u.sponsor_name || null,
      kycStatus: u.kyc_status,
      profileLocked: Boolean(u.profile_locked),
      address: u.address,
      dateOfBirth: u.date_of_birth,
      telegramHandle: u.telegram_handle,
      selfBalance: u.self_balance ?? 0,
      accountsCount: u.accounts_count || 0,
      totalBalance: Number((u.total_balance || 0).toFixed(2)),
      createdAt: u.created_at,
      accounts: userAccounts.map(mapAccountRowToTradingAccount),
    };
  });
}

export function adminUpdateAccountBalance(params: {
  accountId: string;
  newBalance: number;
  reason: string;
  adminUserId: string;
}) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(params.accountId) as any;
  if (!account) throw new Error(`Trading account ${params.accountId} not found.`);

  const oldBalance = Number(account.current_balance);
  const targetBalance = Number(Number(params.newBalance).toFixed(2));
  if (!Number.isFinite(targetBalance) || targetBalance < 0) {
    throw new Error('New balance must be a non-negative number.');
  }

  const delta = targetBalance - oldBalance;
  const newEquity = Number((account.equity + delta).toFixed(2));
  const newStartingDay = Number((account.starting_day_equity + delta).toFixed(2));
  const now = Date.now();

  db.prepare(`
    UPDATE accounts SET
      current_balance = ?,
      equity = ?,
      starting_day_equity = ?,
      updated_at = ?
    WHERE id = ?
  `).run(targetBalance, newEquity, newStartingDay, now, params.accountId);

  if (account.tier === 'personal' || account.account_category === 'personal_live' || String(params.accountId).includes('PERS')) {
    try {
      db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(targetBalance, account.user_id);
    } catch {}
  } else if (account.tier === 'demo' || account.account_category === 'demo' || String(params.accountId).includes('DEMO')) {
    try {
      db.prepare(`UPDATE users SET demo_balance = ? WHERE id = ?`).run(targetBalance, account.user_id);
    } catch {}
  } else if (account.phase === 'funded') {
    try {
      db.prepare(`UPDATE users SET funded_balance = ? WHERE id = ?`).run(targetBalance, account.user_id);
    } catch {}
  }

  recordAdminAuditLog(
    params.adminUserId,
    'MODIFY_BALANCE',
    params.accountId,
    'account',
    { oldBalance, newBalance: targetBalance, delta, reason: params.reason }
  );

  return getAccountById(params.accountId);
}

export function adminSetUserRole(userId: string, newRole: 'admin' | 'trader', adminUserId: string) {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found.');

  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(newRole, Date.now(), userId);
  recordAdminAuditLog(adminUserId, 'CHANGE_ROLE', userId, 'user', { oldRole: user.role, newRole });
  return getUserById(userId);
}

export function createDepositRequest(params: {
  userId: string;
  accountId?: string;
  amount: number;
  paymentMethod: string;
  currency?: string;
  network?: string;
  txHash?: string;
  depositSlipUrl?: string;
}) {
  const now = Date.now();
  const id = `DEP-${now.toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const cleanAmount = Number(params.amount.toFixed(2));
  if (cleanAmount <= 0) throw new Error('Deposit amount must be greater than $0.');

  db.prepare(`
    INSERT INTO deposits (
      id, user_id, account_id, amount, payment_method, currency, network, tx_hash, deposit_slip_url, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id,
    params.userId,
    params.accountId || null,
    cleanAmount,
    params.paymentMethod,
    params.currency || 'USDT',
    params.network || 'TRC-20',
    params.txHash || null,
    params.depositSlipUrl || null,
    now
  );

  return db.prepare('SELECT * FROM deposits WHERE id = ?').get(id) as any;
}

export function getAdminDeposits(statusFilter?: string) {
  let query = `
    SELECT d.*, u.full_name as user_name, u.email as user_email, a.tier_name as account_tier
    FROM deposits d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN accounts a ON d.account_id = a.id
  `;
  const params: any[] = [];
  if (statusFilter && statusFilter !== 'all') {
    query += ' WHERE d.status = ?';
    params.push(statusFilter);
  }
  query += ' ORDER BY d.created_at DESC';

  return db.prepare(query).all(...params) as any[];
}

export function adminApproveDeposit(depositId: string, adminUserId: string) {
  const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId) as any;
  if (!deposit) throw new Error('Deposit record not found.');
  if (deposit.status === 'approved') throw new Error('Deposit is already approved.');

  const now = Date.now();
  db.prepare(`
    UPDATE deposits SET
      status = 'approved',
      processed_at = ?
    WHERE id = ?
  `).run(now, depositId);

  // Credit user's personal live account or target account
  let targetAccount = deposit.account_id ? getAccountById(deposit.account_id) : null;
  if (!targetAccount) {
    targetAccount = ensurePersonalLiveAccountForUser(deposit.user_id);
  }

  let updatedAccount = null;
  if (targetAccount) {
    updatedAccount = creditPersonalAccountDepositInDb({
      userId: deposit.user_id,
      accountId: targetAccount.id,
      amountUsdt: deposit.amount,
    });
  }

  // Execute 3-Level Referral Commission Distribution (10% L1, 5% L2, 2% L3)
  const commissionsDistributed = distribute3TierCommissions(
    deposit.user_id,
    deposit.amount,
    'deposit',
    `Deposit of $${deposit.amount.toFixed(2)} USDT by ${deposit.user_name || 'Trader'}`
  );

  recordAdminAuditLog(adminUserId, 'APPROVE_DEPOSIT', depositId, 'deposit', {
    amount: deposit.amount,
    userId: deposit.user_id,
    creditedAccountId: targetAccount?.id,
    commissionsDistributed,
  });

  return {
    ok: true,
    deposit: db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId),
    updatedAccount,
    commissionsDistributed,
  };
}

export function adminDeclineDeposit(depositId: string, reason: string, adminUserId: string) {
  const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId) as any;
  if (!deposit) throw new Error('Deposit record not found.');
  if (deposit.status !== 'pending') throw new Error(`Deposit cannot be declined from status: ${deposit.status}`);

  const now = Date.now();
  db.prepare(`
    UPDATE deposits SET
      status = 'declined',
      decline_reason = ?,
      processed_at = ?
    WHERE id = ?
  `).run(reason || 'Declined by administrator', now, depositId);

  recordAdminAuditLog(adminUserId, 'DECLINE_DEPOSIT', depositId, 'deposit', { reason });

  return {
    ok: true,
    deposit: db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId),
  };
}

export function getAdminWithdrawals(statusFilter?: string) {
  let query = `
    SELECT w.*, u.full_name as user_name, u.email as user_email, a.tier_name as account_tier, a.current_balance as account_balance
    FROM withdrawals w
    JOIN users u ON w.user_id = u.id
    LEFT JOIN accounts a ON w.account_id = a.id
  `;
  const params: any[] = [];
  if (statusFilter && statusFilter !== 'all') {
    query += ' WHERE w.status = ?';
    params.push(statusFilter);
  }
  query += ' ORDER BY w.requested_at DESC';

  return db.prepare(query).all(...params) as any[];
}

export function adminApproveWithdrawal(withdrawalId: string, adminUserId: string) {
  const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId) as any;
  if (!withdrawal) throw new Error('Withdrawal record not found.');
  if (withdrawal.status === 'completed') throw new Error('Withdrawal is already approved/completed.');

  const now = Date.now();
  const txHash = withdrawal.tx_hash || `tron_tx_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;

  db.prepare(`
    UPDATE withdrawals SET
      status = 'completed',
      tx_hash = ?,
      processed_at = ?
    WHERE id = ?
  `).run(txHash, now, withdrawalId);

  // Debit the trading account balance
  const account = getAccountById(withdrawal.account_id);
  let updatedAccount = null;
  if (account) {
    const newBalance = Math.max(0, Number((account.currentBalance - withdrawal.gross_amount).toFixed(2)));
    const newEquity = Math.max(0, Number((account.equity - withdrawal.gross_amount).toFixed(2)));
    db.prepare(`
      UPDATE accounts SET
        current_balance = ?,
        equity = ?,
        first_withdrawal_completed = 1,
        updated_at = ?
      WHERE id = ?
    `).run(newBalance, newEquity, now, account.id);
    updatedAccount = getAccountById(account.id);
  }

  // 8% Direct Referral Payout Bonus to Direct Sponsor
  const user = getUserById(withdrawal.user_id);
  if (user?.referred_by) {
    const existingBonus = db.prepare(`
      SELECT * FROM commissions WHERE source_type = 'withdrawal' AND referred_user_id = ? AND base_amount = ?
    `).get(withdrawal.user_id, withdrawal.gross_amount);

    if (!existingBonus) {
      const bonusAmount = Number((withdrawal.gross_amount * 0.08).toFixed(2));
      const commId = `COMM-WD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      db.prepare(`
        INSERT INTO commissions (
          id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
        ) VALUES (?, ?, ?, 'withdrawal', 1, ?, ?, 0.08, ?, 'paid', ?)
      `).run(
        commId,
        user.referred_by,
        user.id,
        `Direct Referral Payout Bonus (8% of $${withdrawal.gross_amount.toFixed(2)} Withdrawal by ${user.full_name})`,
        withdrawal.gross_amount,
        bonusAmount,
        now
      );
    }
  }

  recordAdminAuditLog(adminUserId, 'APPROVE_WITHDRAWAL', withdrawalId, 'withdrawal', {
    grossAmount: withdrawal.gross_amount,
    netPayout: withdrawal.net_payout,
    txHash,
  });

  return {
    ok: true,
    withdrawal: db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId),
    updatedAccount,
  };
}

export function adminDeclineWithdrawal(withdrawalId: string, reason: string, adminUserId: string) {
  const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId) as any;
  if (!withdrawal) throw new Error('Withdrawal record not found.');
  if (withdrawal.status !== 'pending') throw new Error(`Withdrawal cannot be declined from status: ${withdrawal.status}`);

  const now = Date.now();
  db.prepare(`
    UPDATE withdrawals SET
      status = 'rejected',
      rejection_reason = ?,
      processed_at = ?
    WHERE id = ?
  `).run(reason || 'Declined by administrator', now, withdrawalId);

  recordAdminAuditLog(adminUserId, 'DECLINE_WITHDRAWAL', withdrawalId, 'withdrawal', { reason });

  return {
    ok: true,
    withdrawal: db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId),
  };
}

export function getAdminKycSubmissions(statusFilter?: string) {
  let query = `
    SELECT k.*, u.email as user_email, u.full_name as user_name, u.country as user_country, u.created_at as user_created_at
    FROM kyc_submissions k
    JOIN users u ON k.user_id = u.id
  `;
  const params: any[] = [];
  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'pending') {
      query += " WHERE k.status IN ('pending', 'Pending Verification')";
    } else {
      query += " WHERE k.status = ?";
      params.push(statusFilter);
    }
  }
  query += ' ORDER BY k.updated_at DESC';

  return db.prepare(query).all(...params) as any[];
}

export function adminApproveKyc(userId: string, adminUserId: string) {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found.');

  const now = Date.now();
  db.prepare(`
    UPDATE users SET
      kyc_status = 'verified',
      kyc_verified_at = ?,
      profile_locked = 1,
      updated_at = ?
    WHERE id = ?
  `).run(now, now, userId);

  db.prepare(`
    UPDATE kyc_submissions SET
      status = 'verified',
      profile_locked = 1,
      updated_at = ?
    WHERE user_id = ?
  `).run(now, userId);

  recordAdminAuditLog(adminUserId, 'APPROVE_KYC', userId, 'user', { previousStatus: user.kyc_status });

  return getUserById(userId);
}

export function adminRejectKyc(userId: string, reason: string, adminUserId: string) {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found.');

  const now = Date.now();
  db.prepare(`
    UPDATE users SET
      kyc_status = 'rejected',
      updated_at = ?
    WHERE id = ?
  `).run(now, userId);

  db.prepare(`
    UPDATE kyc_submissions SET
      status = 'rejected',
      updated_at = ?
    WHERE user_id = ?
  `).run(now, userId);

  recordAdminAuditLog(adminUserId, 'REJECT_KYC', userId, 'user', { reason });

  return getUserById(userId);
}

/**
 * Robust 3-Level Referral Commission Distribution
 * Level 1: 10%
 * Level 2: 5%
 * Level 3: 2%
 */
export function distribute3TierCommissions(
  buyerUserId: string,
  baseAmount: number,
  sourceType: 'deposit' | 'purchase' | 'trade_activity' = 'deposit',
  details?: string
) {
  const buyer = getUserById(buyerUserId);
  if (!buyer?.referred_by) return [];

  const now = Date.now();
  const commissions: any[] = [];

  // Level 1: 10%
  const l1SponsorId = buyer.referred_by;
  const l1Amount = Number((baseAmount * 0.10).toFixed(2));
  const l1Id = `COMM-L1-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

  db.prepare(`
    INSERT INTO commissions (
      id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, 0.10, ?, 'paid', ?)
  `).run(
    l1Id,
    l1SponsorId,
    buyer.id,
    sourceType,
    details || `Level 1 Commission: 10% of $${baseAmount.toFixed(2)} ${sourceType}`,
    baseAmount,
    l1Amount,
    now
  );
  commissions.push({ id: l1Id, level: 1, sponsorId: l1SponsorId, amount: l1Amount });

  // Level 2: 5%
  const l1User = getUserById(l1SponsorId);
  if (l1User?.referred_by) {
    const l2SponsorId = l1User.referred_by;
    const l2Amount = Number((baseAmount * 0.05).toFixed(2));
    const l2Id = `COMM-L2-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    db.prepare(`
      INSERT INTO commissions (
        id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
      ) VALUES (?, ?, ?, ?, 2, ?, ?, 0.05, ?, 'paid', ?)
    `).run(
      l2Id,
      l2SponsorId,
      buyer.id,
      sourceType,
      details || `Level 2 Commission: 5% of $${baseAmount.toFixed(2)} ${sourceType}`,
      baseAmount,
      l2Amount,
      now
    );
    commissions.push({ id: l2Id, level: 2, sponsorId: l2SponsorId, amount: l2Amount });

    // Level 3: 2%
    const l2User = getUserById(l2SponsorId);
    if (l2User?.referred_by) {
      const l3SponsorId = l2User.referred_by;
      const l3Amount = Number((baseAmount * 0.02).toFixed(2));
      const l3Id = `COMM-L3-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

      db.prepare(`
        INSERT INTO commissions (
          id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
        ) VALUES (?, ?, ?, ?, 3, ?, ?, 0.02, ?, 'paid', ?)
      `).run(
        l3Id,
        l3SponsorId,
        buyer.id,
        sourceType,
        details || `Level 3 Commission: 2% of $${baseAmount.toFixed(2)} ${sourceType}`,
        baseAmount,
        l3Amount,
        now
      );
      commissions.push({ id: l3Id, level: 3, sponsorId: l3SponsorId, amount: l3Amount });
    }
  }

  return commissions;
}

export function getAdminReferralTree() {
  const sponsors = db.prepare(`
    SELECT DISTINCT u.id, u.full_name, u.email, u.referral_code,
           (SELECT COUNT(*) FROM referrals r WHERE r.sponsor_id = u.id AND r.tier_level = 1) as l1_count,
           (SELECT COUNT(*) FROM referrals r WHERE r.sponsor_id = u.id AND r.tier_level = 2) as l2_count,
           (SELECT COUNT(*) FROM referrals r WHERE r.sponsor_id = u.id AND r.tier_level = 3) as l3_count,
           (SELECT SUM(commission_amount) FROM commissions c WHERE c.sponsor_id = u.id AND c.status = 'paid') as total_earned
    FROM users u
    WHERE EXISTS (SELECT 1 FROM referrals r WHERE r.sponsor_id = u.id)
       OR EXISTS (SELECT 1 FROM commissions c WHERE c.sponsor_id = u.id)
    ORDER BY total_earned DESC
  `).all() as any[];

  return sponsors.map((s) => {
    const l1Referrals = db.prepare(`
      SELECT r.referred_user_id, u.full_name, u.email, u.created_at,
             (SELECT SUM(current_balance) FROM accounts a WHERE a.user_id = u.id) as balance
      FROM referrals r
      JOIN users u ON r.referred_user_id = u.id
      WHERE r.sponsor_id = ? AND r.tier_level = 1
    `).all(s.id) as any[];

    return {
      sponsorId: s.id,
      sponsorName: s.full_name,
      sponsorEmail: s.email,
      referralCode: s.referral_code,
      level1Count: s.l1_count || 0,
      level2Count: s.l2_count || 0,
      level3Count: s.l3_count || 0,
      totalDownlineCount: (s.l1_count || 0) + (s.l2_count || 0) + (s.l3_count || 0),
      totalEarned: Number((s.total_earned || 0).toFixed(2)),
      level1Members: l1Referrals.map((m) => ({
        id: m.referred_user_id,
        name: m.full_name,
        email: m.email,
        balance: Number((m.balance || 0).toFixed(2)),
        joinedAt: m.created_at,
      })),
    };
  });
}

export function getAdminCommissionsLedger(limit: number = 100) {
  return db.prepare(`
    SELECT c.*,
           s.full_name as sponsor_name, s.email as sponsor_email,
           b.full_name as buyer_name, b.email as buyer_email
    FROM commissions c
    JOIN users s ON c.sponsor_id = s.id
    JOIN users b ON c.referred_user_id = b.id
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(limit) as any[];
}

export function getAdminAuditLogs(limit: number = 50) {
  return db.prepare(`
    SELECT a.*, u.full_name as admin_name, u.email as admin_email
    FROM admin_audit_logs a
    LEFT JOIN users u ON a.admin_user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit) as any[];
}

/**
 * Idempotent seed function to guarantee admin accounts, sample pending deposits,
 * pending withdrawals, and pending KYC requests are present.
 */
export function ensureAdminSeedData() {
  const now = Date.now();

  // 1. Ensure user Shankavee (shankavee44@gmail.com) has role='admin'
  const shankavee = getUserByEmail('shankavee44@gmail.com');
  if (shankavee) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(shankavee.id);
  } else {
    ensureUserInDb({
      id: 'usr_admin_shankavee',
      email: 'shankavee44@gmail.com',
      fullName: 'Shankavee (Admin)',
    });
    db.prepare("UPDATE users SET role = 'admin' WHERE email = 'shankavee44@gmail.com'").run();
  }

  // 2. Ensure Superadmin (admin@bft.io) has role='admin'
  const bftAdmin = getUserByEmail('admin@bft.io');
  if (bftAdmin) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(bftAdmin.id);
  } else {
    ensureUserInDb({
      id: 'usr_admin_master',
      email: 'admin@bft.io',
      fullName: 'BFT Super Administrator',
    });
    db.prepare("UPDATE users SET role = 'admin' WHERE email = 'admin@bft.io'").run();
  }

  // 3. Ensure Viktor Vance has role='admin'
  db.prepare("UPDATE users SET role = 'admin' WHERE id = 'USR-MASTER-88'").run();

  // 4. Seed initial pending and approved deposits if deposits table is empty
  const depositCount = Number((db.prepare('SELECT COUNT(*) as c FROM deposits').get() as any)?.c || 0);
  if (depositCount === 0) {
    const seedDeposits = [
      { id: 'DEP-REQ-981', userId: 'USR-SUB-101', accId: null, amount: 750.00, method: 'USDT (TRC-20)', status: 'pending', tx: '0x8f7d6a5e4c3b2a10', ts: now - 3600000 * 2 },
      { id: 'DEP-REQ-982', userId: 'USR-SUB-102', accId: null, amount: 1500.00, method: 'USDT (TRC-20)', status: 'pending', tx: '0x1a2b3c4d5e6f7a8b', ts: now - 3600000 * 5 },
      { id: 'DEP-REQ-980', userId: 'usr_bft_001', accId: 'BFT-91823', amount: 500.00, method: 'USDT (TRC-20)', status: 'approved', tx: '0x99aa88bb77cc66dd', ts: now - 86400000 * 3 },
    ];
    for (const d of seedDeposits) {
      db.prepare(`
        INSERT INTO deposits (id, user_id, account_id, amount, payment_method, status, tx_hash, created_at, processed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(d.id, d.userId, d.accId, d.amount, d.method, d.status, d.tx, d.ts, d.status === 'approved' ? d.ts + 60000 : null);
    }
  }

  // 5. Seed a pending withdrawal for USR-SUB-101 if no pending withdrawals exist
  const pendingWdCount = Number((db.prepare("SELECT COUNT(*) as c FROM withdrawals WHERE status = 'pending'").get() as any)?.c || 0);
  if (pendingWdCount === 0) {
    db.prepare(`
      INSERT INTO withdrawals (
        id, user_id, account_id, gross_amount, net_profit, max_allowed_profit, profit_share_rate, fee_amount, net_payout,
        wallet_address, network, payment_method, status, reference_number, tx_hash, requested_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0.80, ?, ?, ?, 'TRON (TRC-20)', 'crypto_trc20', 'pending', ?, NULL, ?, NULL)
    `).run(
      'WD-REQ-77401',
      'USR-SUB-101',
      'BFT-91823',
      420.00,
      600.00,
      480.00,
      42.00,
      378.00,
      'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
      'REF-77401',
      now - 3600000 * 4
    );
  }

  // 6. Seed a pending KYC submission for USR-SUB-101 (Marco Rossi) if none pending
  const pendingKycCount = Number((db.prepare("SELECT COUNT(*) as c FROM kyc_submissions WHERE status IN ('pending', 'Pending Verification')").get() as any)?.c || 0);
  if (pendingKycCount === 0) {
    db.prepare(`
      INSERT OR REPLACE INTO kyc_submissions (
        id, user_id, full_name, address, date_of_birth, country, profile_locked, doc_type, document_number,
        front_document_url, back_document_url, front_file_name, back_file_name, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      'KYC-SUB-USR-SUB-101',
      'USR-SUB-101',
      'Marco Rossi',
      'Via Montenapoleone 8, 20121 Milan',
      '1992-03-14',
      'Italy',
      'ID Card',
      'ITA-8910482',
      'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600',
      'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600',
      'marco_id_front.jpg',
      'marco_id_back.jpg',
      now - 86400000 * 2,
      now - 86400000 * 2
    );

    db.prepare("UPDATE users SET kyc_status = 'pending' WHERE id = 'USR-SUB-101'").run();
  }
}

ensureAdminSeedData();

// ============================================================================
// Trade Execution & Settlement Database Handlers
// ============================================================================

export function recordTradeInDb(userId: string, trade: {
  id?: string;
  accountId: string;
  asset: string;
  direction: 'CALL' | 'PUT';
  strikePrice: number;
  investment: number;
  payoutPercentage: number;
  durationSeconds: number;
  startTime?: number;
  endTime?: number;
  accountTier?: string;
}) {
  const account = getAccountById(trade.accountId);
  if (!account) throw new Error('Account not found.');
  const ownerId = account.user_id || account.userId;
  if (ownerId && ownerId !== userId) throw new Error('Unauthorized account trade.');

  const cleanInvestment = Number(trade.investment);
  if (cleanInvestment <= 0) throw new Error('Invalid trade investment amount.');
  if (account.currentBalance < cleanInvestment) {
    throw new Error('Insufficient account balance for trade placement.');
  }

  const now = Date.now();
  const tradeId = trade.id || `TRD-${now.toString().slice(-6)}-${Math.floor(100 + Math.random() * 899)}`;
  const startTime = trade.startTime || now;
  const durationSec = Number(trade.durationSeconds) || 30;
  const endTime = trade.endTime || (startTime + durationSec * 1000);
  const payoutPct = Number(trade.payoutPercentage) || 92;
  const potentialPayout = Number((cleanInvestment + (cleanInvestment * payoutPct) / 100).toFixed(2));

  // Atomic transaction: Insert trade & debit balance
  const nextBalance = Number((account.currentBalance - cleanInvestment).toFixed(2));

  db.prepare(`
    INSERT INTO trades (
      id, user_id, account_id, asset, direction, strike_price, close_price,
      investment, payout_percentage, potential_payout, pnl, credited_amount,
      start_time, end_time, duration_seconds, status, account_tier, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tradeId,
    userId,
    trade.accountId,
    trade.asset,
    trade.direction,
    Number(trade.strikePrice),
    Number(trade.strikePrice),
    cleanInvestment,
    payoutPct,
    potentialPayout,
    0,
    0,
    startTime,
    endTime,
    durationSec,
    'active',
    trade.accountTier || account.tier,
    now
  );

  db.prepare(`
    UPDATE accounts SET
      current_balance = ?,
      equity = ?,
      updated_at = ?
    WHERE id = ?
  `).run(nextBalance, nextBalance, now, trade.accountId);

  if (account.tier === 'personal' || account.accountCategory === 'personal_live' || String(trade.accountId).includes('PERS')) {
    try {
      db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(nextBalance, userId);
    } catch (e) {
      console.warn('SQLite self_balance recordTrade sync error:', e);
    }
  } else if (account.tier === 'demo' || account.accountCategory === 'demo' || String(trade.accountId).includes('DEMO')) {
    try {
      db.prepare(`UPDATE users SET demo_balance = ? WHERE id = ?`).run(nextBalance, userId);
    } catch (e) {
      console.warn('SQLite demo_balance recordTrade sync error:', e);
    }
  } else if (account.phase === 'funded' || account.status === 'active') {
    try {
      db.prepare(`UPDATE users SET funded_balance = ? WHERE id = ?`).run(nextBalance, userId);
    } catch (e) {
      console.warn('SQLite funded_balance recordTrade sync error:', e);
    }
  }

  const savedTrade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId) as any;
  const updatedAccount = getAccountById(trade.accountId);

  return {
    trade: mapTradeRow(savedTrade),
    account: updatedAccount,
  };
}

export function settleTradeInDb(userId: string, tradeId: string, closePrice: number, manualStatus?: string) {
  const tradeRow = db.prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?').get(tradeId, userId) as any;
  if (!tradeRow) throw new Error('Trade not found or unauthorized.');
  if (tradeRow.status !== 'active') {
    // Already settled
    const acc = getAccountById(tradeRow.account_id);
    return { trade: mapTradeRow(tradeRow), account: acc, alreadySettled: true };
  }

  // Enforce strict Locked Trade Execution: disallow premature closure/settlement before expiration (with 1s clock skew tolerance)
  const nowCheck = Date.now();
  if (nowCheck + 1000 < Number(tradeRow.end_time)) {
    const secsLeft = Math.ceil((Number(tradeRow.end_time) - nowCheck) / 1000);
    throw new Error(`Trade is locked until expiration (${secsLeft}s remaining) and cannot be closed or cancelled early.`);
  }

  const finalPrice = Number(closePrice);
  const strike = Number(tradeRow.strike_price);
  const investment = Number(tradeRow.investment);
  const payoutPct = Number(tradeRow.payout_percentage);

  let status: 'won' | 'lost' | 'tie' = 'lost';
  let pnl = -investment;
  let creditedAmount = 0;

  const diff = finalPrice - strike;
  const isTie = manualStatus === 'tie' || Math.abs(diff) < 1e-7;

  if (isTie) {
    status = 'tie';
    pnl = 0;
    creditedAmount = investment; // full refund
  } else {
    const isWin =
      manualStatus === 'won' ||
      (tradeRow.direction === 'CALL' && diff > 0) ||
      (tradeRow.direction === 'PUT' && diff < 0);

    if (isWin) {
      status = 'won';
      pnl = Number(((investment * payoutPct) / 100).toFixed(2));
      creditedAmount = Number((investment + pnl).toFixed(2));
    }
  }

  const now = Date.now();

  // 1. Update settled trade record in database
  db.prepare(`
    UPDATE trades SET
      close_price = ?,
      pnl = ?,
      credited_amount = ?,
      status = ?,
      settled_at = ?
    WHERE id = ?
  `).run(finalPrice, pnl, creditedAmount, status, now, tradeId);

  // 2. Fetch fresh account state and compute accurate win rate
  const account = getAccountById(tradeRow.account_id);
  const nextBalance = Number(((account?.currentBalance || 0) + creditedAmount).toFixed(2));
  const nextTradesCount = (account?.tradesCount || 0) + 1;

  const resolvedTrades = db.prepare(
    "SELECT status FROM trades WHERE account_id = ? AND status IN ('won', 'lost', 'tie')"
  ).all(tradeRow.account_id) as any[];

  const wonCount = resolvedTrades.filter((s) => s.status === 'won').length;
  const totalCount = resolvedTrades.length;
  const nextWinRate = totalCount > 0 ? Number(((wonCount / totalCount) * 100).toFixed(1)) : 0;

  db.prepare(`
    UPDATE accounts SET
      current_balance = ?,
      equity = ?,
      trades_count = ?,
      win_rate = ?,
      updated_at = ?
    WHERE id = ?
  `).run(nextBalance, nextBalance, nextTradesCount, nextWinRate, now, tradeRow.account_id);

  const updatedTrade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId) as any;
  const updatedAccount = getAccountById(tradeRow.account_id);

  if (updatedAccount) {
    if (updatedAccount.tier === 'personal' || updatedAccount.accountCategory === 'personal_live' || updatedAccount.phase === 'personal_live') {
      try {
        db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(nextBalance, userId);
      } catch {}
    } else if (updatedAccount.tier === 'demo' || updatedAccount.accountCategory === 'demo' || updatedAccount.phase === 'demo') {
      try {
        db.prepare(`UPDATE users SET demo_balance = ? WHERE id = ?`).run(nextBalance, userId);
      } catch {}
    } else if (updatedAccount.phase === 'funded') {
      try {
        db.prepare(`UPDATE users SET funded_balance = ? WHERE id = ?`).run(nextBalance, userId);
      } catch {}
    }
  }

  return {
    trade: mapTradeRow(updatedTrade),
    account: updatedAccount,
    settlement: {
      status,
      pnl,
      creditedAmount,
      closePrice: finalPrice,
    },
  };
}

export function getUserTradesFromDb(userId: string, accountId?: string) {
  const query = accountId
    ? 'SELECT * FROM trades WHERE user_id = ? AND account_id = ? ORDER BY created_at DESC LIMIT 200'
    : 'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 200';
  const rows = accountId
    ? db.prepare(query).all(userId, accountId)
    : db.prepare(query).all(userId);
  return (rows as any[]).map(mapTradeRow);
}

function mapTradeRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    asset: row.asset,
    direction: row.direction,
    strikePrice: Number(row.strike_price),
    currentPrice: Number(row.close_price || row.strike_price),
    closePrice: row.close_price ? Number(row.close_price) : undefined,
    investment: Number(row.investment),
    payoutPercentage: Number(row.payout_percentage),
    potentialPayout: Number(row.potential_payout),
    pnl: Number(row.pnl || 0),
    creditedAmount: Number(row.credited_amount || 0),
    startTime: Number(row.start_time),
    endTime: Number(row.end_time),
    durationSeconds: Number(row.duration_seconds),
    status: row.status,
    accountTier: row.account_tier,
    createdAt: Number(row.created_at),
    settledAt: row.settled_at ? Number(row.settled_at) : undefined,
  };
}


