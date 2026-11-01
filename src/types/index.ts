export type ChallengeTier = 'one-step' | 'two-step' | 'instant' | 'personal' | 'demo';

export type AccountCategory = 'prop' | 'personal_live' | 'demo';

export type AccountSize = 2500 | 5000 | 10000 | 25000 | 50000 | 100000 | number;

export type PromoCodeType = 'SPOOKY40' | 'SPOOKY20' | 'BFT40' | 'BFT20';

export interface EvaluationPackage {
  id: string;
  tier: ChallengeTier;
  tierName: string;
  size: AccountSize;
  price: number;
  profitTarget: number; // in percent (30 for one-step, 25 for two-step phase 1, 0 for instant)
  profitDaysRequirement?: number; // 5 days
  minProfitableDayPercent?: number; // 0.5% profit per day
  minTradingDaysText?: string; // "5 days (>= 0.5%/day)"
  step2Target?: number; // in percent (15 for two-step phase 2)
  step2Days?: number; // 5 days
  maxDailyDrawdown: number; // in percent (10 for one-step, 8 for two-step, 6 for instant)
  maxOverallLoss: number; // in percent (15 for one-step, 20 for two-step, 12 for instant)
  maxRiskPerTradePercent?: number; // 5% of capital
  payoutSplit: number; // 80% first 3 months -> 90% after 3 months
  upgradedPayoutSplit?: number; // 90%
  leverage: string;
  popular?: boolean;
  unlimitedTime?: boolean;
  refundOnFirstPayout?: boolean;
  resetCourtesyDiscount?: number; // 10 (%)
}

export interface RuleViolationLog {
  id: string;
  rule: 'DAILY_LOSS' | 'OVERALL_LOSS' | 'MAX_RISK_PER_TRADE' | 'MARTINGALE' | 'HEDGING' | 'NEWS_TRADING' | 'DURATION' | 'POSITION_SPIKE';
  ruleName: string;
  severity: 'critical' | 'warning';
  message: string;
  timestamp: number;
  details?: string;
}

export type BreachType = 'none' | 'soft' | 'hard';

export type ChallengeAccountType = 'instant' | 'one_step' | 'two_step' | 'personal' | 'demo';

export interface TradingAccount {
  id: string; // e.g. BFT-78291 or UUID from trading_accounts
  supabaseAccountId?: string; // UUID from public.trading_accounts
  ownerId?: string;
  ownerEmail?: string;
  loginId: string;
  passwordHash: string;
  tier: ChallengeTier;
  accountType?: ChallengeAccountType | string;
  tierName: string;
  accountCategory?: AccountCategory;
  depositedCapital?: number;
  size: AccountSize;
  currentBalance: number;
  initialBalance: number;
  startingDayEquity: number;
  equity: number;
  dailyLossLimitPercent: number;
  maxOverallLossPercent: number;
  profitTargetPercent?: number | null; // e.g. 30 for one_step, 25 for two_step phase_1, 15 for two_step phase_2, 0/null for instant/funded
  step2ProfitTargetPercent?: number; // 15 for two_step phase_2
  maxRiskPerTradePercent?: number; // default 5%
  status: 'active' | 'passed' | 'passed_phase_1' | 'soft-breached' | 'hard-breached' | 'breached' | 'suspended';
  breachType?: BreachType;
  softBreachResetTime?: number; // ms timestamp of next daily reset
  discountEligible?: boolean; // 10% courtesy discount on re-purchase
  dailyWithdrawalsUnlocked?: boolean; // Paid +15% add-on at checkout
  monthsCompleted?: number; // >= 3 upgrades split from 80% to 90% + scaling plan
  scalingActive?: boolean;
  firstWithdrawalCompleted?: boolean; // Mandatory 14-day waiting period for very first withdrawal
  nextWithdrawalAvailableAt?: number; // 7-day standard cycle timer
  certificateId?: string;
  passedAt?: string;
  createdDate: string;
  lastActiveDate: string;
  phase: 'phase_1' | 'phase_2' | 'funded' | 'personal_live' | 'demo';
  challengePhase?: 'phase_1' | 'phase_2' | 'funded' | string;
  tradingDaysCompleted: number;
  tradesCount: number;
  winRate: number;
  breachReason?: string;
  breachedAt?: number;
  violationLogs?: RuleViolationLog[];
}

export type BinaryOptionDirection = 'CALL' | 'PUT';

export interface BinaryTrade {
  id: string;
  accountId: string;
  asset: string;
  direction: BinaryOptionDirection;
  strikePrice: number;
  currentPrice: number;
  closePrice?: number;
  investment: number;
  payoutPercentage: number;
  potentialPayout: number;
  startTime: number;
  durationSeconds: number; // 30, 60, 180, 300
  endTime: number;
  status: 'active' | 'won' | 'lost' | 'tie';
  pnl?: number;
  accountTier?: string; // e.g. 'demo', 'personal', 'one-step', 'two-step', 'instant'
}

export interface TradeResultOverlayData {
  id: string;
  isWin: boolean;
  isTie?: boolean;
  profitAmount: number;
  investment: number;
  asset: string;
  direction: BinaryOptionDirection;
  strikePrice: number;
  closePrice: number;
  payoutPercentage: number;
  startTime: number;
  endTime: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type AssetCategory =
  | 'Forex (OTC)'
  | 'Crypto (OTC)'
  | 'Commodities (OTC)'
  | 'Indices (OTC)'
  | 'Stocks (OTC)'
  | 'Forex'
  | 'Crypto'
  | 'Commodities'
  | 'Indices'
  | 'Stocks'
  | 'Stocks & Indices'
  | 'Deriv Synthetics'
  | 'Synthetics'
  | 'OTC';

export interface AssetInfo {
  symbol: string;
  name: string;
  payout: number; // percent e.g. 92
  category: AssetCategory;
  basePrice: number;
  volatility: number;
  pipDecimals: number;
  flag?: string;
}

export type WithdrawalPaymentMethod = 'crypto_trc20' | 'bank_transfer';

export interface BankTransferDetails {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  swiftCode: string;
  branchName?: string;
}

export interface WithdrawalRequest {
  id: string;
  userId?: string;
  accountId: string;
  accountType?: 'self' | 'funded' | string;
  amount: number; // gross requested amount
  withdrawalFee?: number; // 3% (self) or 10% (funded) withdrawal fee
  netReceivedAmount?: number; // net after fee
  profitSplitApplied?: number; // 100 (self) or 80/90 (funded)
  paymentMethod?: WithdrawalPaymentMethod;
  payoutMethod?: 'crypto' | 'bank';
  networkType?: string;
  trc20Address: string;
  bankDetails?: BankTransferDetails;
  referenceNumber?: string;
  requestedAt: number;
  countdownEndsAt?: number;
  completedAt?: number;
  status: 'pending' | 'processing' | 'completed' | 'success' | 'paid' | 'rejected' | 'cancelled' | 'doubled';
  rejectionReason?: string;
  txHash?: string;
  isDoublePayoutEligible: boolean;
  timeElapsedSeconds: number;
}

export type KYCStatus = 'unverified' | 'pending' | 'verified' | 'approved' | 'rejected';

export type KYCDocumentType = 'ID Card' | 'Passport' | 'Driving License';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  address?: string;
  dateOfBirth?: string;
  profileLocked?: boolean;
  profileLockedAt?: string;
  country: string;
  avatarUrl: string;
  telegramHandle: string;
  kycStatus: KYCStatus;
  kycDocumentType?: KYCDocumentType | string;
  kycDocumentNumber?: string;
  kycDocumentFileName?: string;
  kycBackDocumentFileName?: string;
  kycFrontDocumentUrl?: string;
  kycBackDocumentUrl?: string;
  kycExtractedName?: string;
  kycExtractedDob?: string;
  kycSubmittedAt?: string;
  kycVerificationEndsAt?: number; // ms timestamp when 2-minute auto-verification completes
  kycRejectionReason?: string;
  twoFactorEnabled: boolean;
  is2faEnabled?: boolean;
  totpSecret?: string;
  activeAccountId: string;
  referralCode?: string;
  referredBy?: string;
  isLoggedIn?: boolean;
  rememberMe?: boolean;
  role?: 'admin' | 'trader' | string;
  isAdmin?: boolean;
  selfBalance?: number;
  demoBalance?: number;
  fundedBalance?: number;
}

export interface UserAccount {
  id: string; // e.g. "usr_bft_001"
  name: string;
  email: string;
  password?: string;
  referralCode: string; // e.g. "BFT-ALEX77"
  referredBy?: string; // Parent user ID
  createdAt: string;
}

export type ReferralLevel = 1 | 2 | 3;

export interface ReferralRecord {
  id: string; // e.g. "REF-1092"
  referrerId: string; // The affiliate user who earns the commission
  referredUserId: string; // The buyer user who purchased the package
  referredUserName: string;
  referredUserEmail: string;
  level: ReferralLevel; // 1 = Direct, 2 = Sub, 3 = Sub-Sub
  commissionType?: 'package' | 'withdrawal'; // 'package' (17% total / 10-5-2) or 'withdrawal' (8% payout royalty)
  packageTier: ChallengeTier;
  packageName: string;
  packagePrice: number;
  commissionRate: number; // e.g. 0.17, 0.10, 0.08, 0.05, 0.02
  commissionAmount: number; // exact earned USDT
  status: 'pending' | 'paid';
  createdAt: string;
}

export interface ReferredUser {
  id: string;
  fullName: string;
  level: ReferralLevel;
  latestPurchase?: { name: string; amount: number; sku?: string };
}

export interface AffiliatePayout {
  id: string; // e.g. "AFF-PAY-801"
  userId: string;
  amount: number;
  method: 'USDT (TRC-20)' | 'Bank Transfer';
  details: string; // TRC-20 address or bank IBAN/wire details
  status: 'pending' | 'processing' | 'completed';
  requestedAt: string;
  processedAt?: string;
  txHash?: string;
}

export interface AffiliateStats {
  lifetimeEarnings: number;
  availableBalance: number;
  pendingCommission: number;
  totalReferralsCount: number;
  level1Count: number;
  level1Earnings: number;
  level2Count: number;
  level2Earnings: number;
  level3Count: number;
  level3Earnings: number;
}
