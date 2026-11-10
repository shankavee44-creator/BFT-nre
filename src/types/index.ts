export type ChallengeTier = 'two-step' | 'one-step' | 'instant' | 'demo' | 'personal' | string;
export type AccountSize = 5000 | 10000 | 25000 | 50000 | 100000 | number;
export type PromoCodeType = '50OFF' | 'FREE100' | string | null;
export type BinaryOptionDirection = 'CALL' | 'PUT';
export type KYCDocumentType = 'id_card' | 'passport' | 'driving_license' | string;
export type WithdrawalPaymentMethod = 'crypto_trc20' | 'crypto_bep20' | 'binance_pay' | 'bank_transfer' | string;

export interface EvaluationPackage {
  tier: ChallengeTier;
  tierName: string;
  size: AccountSize;
  price: number;
  originalPrice?: number;
  dailyLossLimitPercent: number;
  maxOverallLossPercent: number;
  profitTargetPhase1Percent: number;
  profitTargetPhase2Percent?: number;
  profitSplitPercent: number;
  minTradingDays: number;
  dailyWithdrawalsFee?: number;
  dailyWithdrawalsUnlocked?: boolean;
  promoCodeApplied?: PromoCodeType;
  sku?: string;
}

export interface TradingAccount {
  id: string;
  supabaseAccountId?: string;
  userId?: string;
  user_id?: string;
  userEmail?: string;
  loginId: string;
  passwordHash: string;
  tier: ChallengeTier;
  accountType?: string;
  accountCategory?: 'prop' | 'personal_live' | 'demo' | string;
  account_category?: string;
  tierName: string;
  size: number;
  initialBalance: number;
  depositedCapital?: number;
  currentBalance: number;
  startingDayEquity: number;
  equity: number;
  dailyLossLimitPercent: number;
  maxOverallLossPercent: number;
  maxRiskPerTradePercent?: number;
  profitTargetPercent?: number;
  status: 'active' | 'breached' | 'passed' | 'passed_phase_1' | 'soft-breached' | 'hard-breached' | string;
  breachType?: 'none' | 'daily' | 'overall' | 'soft' | 'hard' | string;
  breachReason?: string;
  phase: 'phase_1' | 'phase_2' | 'funded' | 'demo' | 'personal_live' | string;
  tradingDaysCompleted: number;
  tradesCount: number;
  winRate: number;
  dailyWithdrawalsUnlocked?: boolean;
  firstWithdrawalCompleted?: boolean;
  monthsCompleted?: number;
  scalingActive?: boolean;
  certificateId?: string;
  bonusBalance?: number;
  bonus_balance?: number;
  totalTurnoverRequired?: number;
  total_turnover_required?: number;
  currentTurnover?: number;
  current_turnover?: number;
  createdDate: string;
  lastActiveDate: string;
  [key: string]: any;
}

export interface UserProfile {
  id: string;
  numeric_id?: string | number;
  numericId?: string | number;
  fullName: string;
  full_name?: string;
  email: string;
  phone?: string;
  country: string;
  address?: string;
  dateOfBirth?: string;
  telegramHandle?: string;
  avatarUrl?: string;
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected' | string;
  kycDocumentType?: KYCDocumentType;
  kycDocumentNumber?: string;
  kycSubmittedAt?: string;
  kycTimerEndsAt?: number;
  kycFrontFileName?: string;
  kycBackFileName?: string;
  kycFrontUrl?: string;
  kycBackUrl?: string;
  profileLocked?: boolean;
  isLoggedIn?: boolean;
  isAdmin?: boolean;
  role?: string;
  referralCode?: string;
  referredBy?: string | null;
  affiliateTier?: 'basic' | 'vip' | string;
  selfBalance?: number;
  self_balance?: number;
  self_capital_balance?: number;
  bonusBalance?: number;
  bonus_balance?: number;
  totalTurnoverRequired?: number;
  total_turnover_required?: number;
  currentTurnover?: number;
  current_turnover?: number;
  hasUsedBft100?: boolean;
  has_used_bft100?: boolean;
  demoBalance?: number;
  demo_balance?: number;
  fundedBalance?: number;
  funded_balance?: number;
  is_2fa_enabled?: boolean;
  totp_secret?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface UserAccount {
  id: string;
  fullName: string;
  email: string;
  passwordHash?: string;
  country?: string;
  referralCode?: string;
  referredBy?: string | null;
  affiliateTier?: 'basic' | 'vip' | string;
  createdAt: string;
  [key: string]: any;
}

export interface BinaryTrade {
  id: string;
  accountId: string;
  accountTier?: string;
  accountCategory?: string;
  asset: string;
  direction: BinaryOptionDirection;
  strikePrice: number;
  closePrice?: number;
  investment: number;
  stakeFromSelf?: number;
  stakeFromBonus?: number;
  payoutPercentage: number;
  potentialPayout: number;
  pnl?: number;
  creditedAmount?: number;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  status: 'active' | 'won' | 'lost' | 'tie' | 'cancelled' | string;
  isCopyTrade?: boolean;
  copySubscriptionId?: string;
  providerId?: string;
  providerName?: string;
  [key: string]: any;
}

export interface AssetInfo {
  symbol: string;
  name: string;
  category: 'forex' | 'crypto' | 'commodities' | 'indices' | 'stocks' | string;
  basePrice: number;
  payoutPercentage: number;
  volatility: number;
  decimals: number;
  isOtc?: boolean;
  flag1?: string;
  flag2?: string;
  [key: string]: any;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TradeResultOverlayData {
  id: string;
  asset: string;
  direction: BinaryOptionDirection;
  investment: number;
  pnl: number;
  creditedAmount: number;
  status: 'won' | 'lost' | 'tie';
  strikePrice: number;
  closePrice: number;
  timestamp: number;
}

export interface WithdrawalRequest {
  id: string;
  accountId: string;
  userId?: string;
  amount: number;
  grossAmount?: number;
  feeAmount?: number;
  netPayout?: number;
  profitShareRate?: number;
  method: WithdrawalPaymentMethod;
  walletAddress: string;
  network?: string;
  bankDetails?: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    swiftCode?: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'approved' | 'rejected' | 'declined' | string;
  requestedAt: string;
  processedAt?: string;
  txHash?: string;
  referenceNumber?: string;
  declineReason?: string;
  [key: string]: any;
}

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referredUserId: string;
  referredUserName: string;
  referredUserEmail: string;
  level: 1 | 2 | 3 | number;
  sourceType?: 'purchase' | 'withdrawal' | 'deposit' | 'trade_activity' | string;
  packagePurchased: string;
  packagePrice: number;
  commissionRate: number;
  commissionAmount: number;
  status: 'paid' | 'pending' | string;
  date: string;
  timestamp?: number;
  [key: string]: any;
}

export interface ReferredUser {
  id: string;
  fullName: string;
  email: string;
  country?: string;
  joinedDate: string;
  level: 1 | 2 | 3 | number;
  hasPurchased?: boolean;
  totalVolume?: number;
  totalCommissionGenerated?: number;
  status?: 'active' | 'pending' | string;
  [key: string]: any;
}

export interface AffiliatePayout {
  id: string;
  userId: string;
  amount: number;
  walletAddress: string;
  network: string;
  status: 'completed' | 'pending' | 'processing' | 'rejected' | string;
  requestedAt: string;
  processedAt?: string;
  txHash?: string;
}

export interface AffiliateStats {
  totalEarnings: number;
  availableBalance: number;
  withdrawnAmount: number;
  level1Earnings: number;
  level2Earnings: number;
  level3Earnings: number;
  withdrawalBonusEarnings: number;
  level1Count: number;
  level2Count: number;
  level3Count: number;
  activeTradersCount: number;
  currentTier: 'basic' | 'vip';
  milestoneBonusEarned: number;
  milestoneProgressPercent: number;
}
