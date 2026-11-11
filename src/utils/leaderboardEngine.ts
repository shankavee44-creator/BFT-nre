import { supabase } from './supabase';

export type LeaderboardTabCategory = 'funded' | 'self_funded';

export interface LeaderboardTrader {
  id: string;
  rank: number;
  name: string;
  country: string;
  flag: string;
  isoCode: string;
  category?: LeaderboardTabCategory;
  accountTier: string;
  profit: number;
  targetEveningProfit?: number;
  winRate: number;
  payoutTime: string;
  recentWin?: boolean;
  isCurrentUser?: boolean;
}

export const SRI_LANKA_OFFSET_MINUTES = 330; // UTC+5:30
export const SRI_LANKA_OFFSET_MS = SRI_LANKA_OFFSET_MINUTES * 60 * 1000;

export const MATEUS_FUNDED_PROFIT = 72876.98;
export const YOHAN_FUNDED_PROFIT = MATEUS_FUNDED_PROFIT;
export const FUNDED_RANK_15_PROFIT = 27321.11;
export const AARAV_SELF_FUNDED_PROFIT = 40056.61;
export const YOHAN_SELF_FUNDED_PROFIT = AARAV_SELF_FUNDED_PROFIT;
export const AARAV_EVENING_TARGET_PROFIT = AARAV_SELF_FUNDED_PROFIT;
export const YOHAN_EVENING_TARGET_PROFIT = AARAV_SELF_FUNDED_PROFIT;

export const MATEUS_DOMINGOS_ENTRY: LeaderboardTrader = {
  id: 'fnd_ao_01',
  rank: 1,
  name: 'Mateus Domingos',
  country: 'Angola',
  flag: '🇦🇴',
  isoCode: 'AO',
  category: 'funded',
  accountTier: '$100,000 Instant Funded',
  profit: MATEUS_FUNDED_PROFIT,
  targetEveningProfit: MATEUS_FUNDED_PROFIT,
  winRate: 84.2,
  payoutTime: '1m 12s',
};

export const AARAV_SHARMA_SELF_ENTRY: LeaderboardTrader = {
  id: 'slf_in_01',
  rank: 1,
  name: 'Aarav Sharma',
  country: 'India',
  flag: '🇮🇳',
  isoCode: 'IN',
  category: 'self_funded',
  accountTier: 'Self-Funded VIP Live',
  profit: AARAV_SELF_FUNDED_PROFIT,
  targetEveningProfit: AARAV_SELF_FUNDED_PROFIT,
  winRate: 83.1,
  payoutTime: '0m 58s',
};

export const YOHAN_SIRIWARDHANA_ENTRY: LeaderboardTrader = AARAV_SHARMA_SELF_ENTRY;

export const KASUN_PERERA_ENTRY = MATEUS_DOMINGOS_ENTRY;

interface SeedTraderConfig {
  id: string;
  name: string;
  country: string;
  flag: string;
  isoCode: string;
  accountTier: string;
  eveningProfit: number;
  winRate: number;
  payoutTime: string;
}

/**
 * FUNDED TRADERS POOL (Weekly Reset Timeframe - Past Week Best Funded Traders):
 * Top 15 Regional Distribution:
 * - 1 Angola (Rank 1 fixed: Mateus Domingos - Peak $72,876.98)
 * - 7 India
 * - 3 Bangladesh
 * - 2 Pakistan
 * - 2 UAE / Malaysia (1 UAE, 1 Malaysia)
 *
 * Profit Range:
 * - Rank 1: Exactly $72,876.98 (Mateus Domingos, Angola)
 * - Rank 15: Exactly $27,321.11
 * - Ranks 2 to 14: Progressive scaling in between
 */
export const FUNDED_TRADER_POOL: SeedTraderConfig[] = [
  // 1 Angola (Fixed Rank 1 - Mateus Domingos)
  {
    id: 'fnd_ao_01',
    name: 'Mateus Domingos',
    country: 'Angola',
    flag: '🇦🇴',
    isoCode: 'AO',
    accountTier: '$100,000 Instant Funded',
    eveningProfit: MATEUS_FUNDED_PROFIT,
    winRate: 84.2,
    payoutTime: '1m 12s',
  },

  // 7 India
  {
    id: 'fnd_in_01',
    name: 'Rajesh Kumar',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: '$100,000 Two-Step',
    eveningProfit: 64280.45,
    winRate: 81.5,
    payoutTime: '1m 24s',
  },
  {
    id: 'fnd_in_02',
    name: 'Rohan Gupta',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: '$50,000 Instant Funded',
    eveningProfit: 58940.20,
    winRate: 79.8,
    payoutTime: '1m 31s',
  },
  {
    id: 'fnd_in_03',
    name: 'Priya Patel',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: '$50,000 One-Step',
    eveningProfit: 50150.80,
    winRate: 77.6,
    payoutTime: '1m 19s',
  },
  {
    id: 'fnd_in_04',
    name: 'Vikramjit Singh',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: '$50,000 Two-Step',
    eveningProfit: 40820.60,
    winRate: 75.9,
    payoutTime: '1m 42s',
  },
  {
    id: 'fnd_in_05',
    name: 'Ananya Iyer',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: '$25,000 Instant Funded',
    eveningProfit: 34640.30,
    winRate: 74.1,
    payoutTime: '1m 27s',
  },
  {
    id: 'fnd_in_06',
    name: 'Siddharth Nair',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: '$25,000 One-Step',
    eveningProfit: 30480.15,
    winRate: 72.5,
    payoutTime: '1m 38s',
  },
  {
    id: 'fnd_in_07',
    name: 'Karthik Reddy',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: '$10,000 Instant Funded',
    eveningProfit: FUNDED_RANK_15_PROFIT,
    winRate: 71.0,
    payoutTime: '1m 45s',
  },

  // 3 Bangladesh
  {
    id: 'fnd_bd_01',
    name: 'Tanvir Ahmed',
    country: 'Bangladesh',
    flag: '🇧🇩',
    isoCode: 'BD',
    accountTier: '$50,000 One-Step',
    eveningProfit: 54820.90,
    winRate: 78.7,
    payoutTime: '1m 21s',
  },
  {
    id: 'fnd_bd_02',
    name: 'Shakib Hasan',
    country: 'Bangladesh',
    flag: '🇧🇩',
    isoCode: 'BD',
    accountTier: '$25,000 Instant Funded',
    eveningProfit: 38420.55,
    winRate: 75.2,
    payoutTime: '1m 34s',
  },
  {
    id: 'fnd_bd_03',
    name: 'Mahmudul Islam',
    country: 'Bangladesh',
    flag: '🇧🇩',
    isoCode: 'BD',
    accountTier: '$10,000 One-Step',
    eveningProfit: 28950.40,
    winRate: 71.8,
    payoutTime: '1m 41s',
  },

  // 2 Pakistan
  {
    id: 'fnd_pk_01',
    name: 'Muhammad Hamza',
    country: 'Pakistan',
    flag: '🇵🇰',
    isoCode: 'PK',
    accountTier: '$100,000 Instant Funded',
    eveningProfit: 46890.65,
    winRate: 76.8,
    payoutTime: '1m 29s',
  },
  {
    id: 'fnd_pk_02',
    name: 'Usman Khan',
    country: 'Pakistan',
    flag: '🇵🇰',
    isoCode: 'PK',
    accountTier: '$50,000 Two-Step',
    eveningProfit: 36430.10,
    winRate: 74.6,
    payoutTime: '1m 35s',
  },

  // 2 UAE / Malaysia
  {
    id: 'fnd_ae_01',
    name: 'Tariq Al-Mansoor',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    isoCode: 'AE',
    accountTier: '$50,000 One-Step',
    eveningProfit: 43280.50,
    winRate: 76.3,
    payoutTime: '1m 30s',
  },
  {
    id: 'fnd_my_01',
    name: 'Faizal Zulkifli',
    country: 'Malaysia',
    flag: '🇲🇾',
    isoCode: 'MY',
    accountTier: '$25,000 Instant Funded',
    eveningProfit: 32410.00,
    winRate: 73.0,
    payoutTime: '1m 18s',
  },
];

/**
 * SELF-FUNDED TRADERS POOL (Daily Reset Timeframe - Daily Top 15 Traders):
 * Top 15 Regional Distribution:
 * - 6 India (Rank 1 fixed: Aarav Sharma - Peak $40,056.61)
 * - 4 Pakistan
 * - 3 UAE
 * - 2 Bangladesh
 *
 * Names are completely distinct from Funded Traders pool.
 */
export const SELF_FUNDED_TRADER_POOL: SeedTraderConfig[] = [
  // 1 India (Fixed Rank 1 - Aarav Sharma $40,056.61)
  {
    id: 'slf_in_01',
    name: 'Aarav Sharma',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: 'Self-Funded VIP Live',
    eveningProfit: AARAV_SELF_FUNDED_PROFIT,
    winRate: 83.1,
    payoutTime: '0m 58s',
  },

  // 5 India (Distinct names)
  {
    id: 'slf_in_01',
    name: 'Devansh Mehta',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: 'Self-Funded Live',
    eveningProfit: 32650.20,
    winRate: 79.4,
    payoutTime: '1m 05s',
  },
  {
    id: 'slf_in_02',
    name: 'Kavya Krishnan',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: 'Self-Funded Live',
    eveningProfit: 25230.90,
    winRate: 76.2,
    payoutTime: '1m 18s',
  },
  {
    id: 'slf_in_03',
    name: 'Harshvardhan Rao',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: 'Self-Funded Live',
    eveningProfit: 19840.60,
    winRate: 73.8,
    payoutTime: '1m 25s',
  },
  {
    id: 'slf_in_04',
    name: 'Pranav Kulkarni',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: 'Self-Funded Live',
    eveningProfit: 14620.15,
    winRate: 71.0,
    payoutTime: '1m 35s',
  },
  {
    id: 'slf_in_05',
    name: 'Arjun Malhotra',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    accountTier: 'Self-Funded Live',
    eveningProfit: 10480.40,
    winRate: 68.5,
    payoutTime: '1m 42s',
  },

  // 4 Pakistan (Distinct names)
  {
    id: 'slf_pk_01',
    name: 'Faisal Mahmood',
    country: 'Pakistan',
    flag: '🇵🇰',
    isoCode: 'PK',
    accountTier: 'Self-Funded Live',
    eveningProfit: 29890.10,
    winRate: 78.2,
    payoutTime: '1m 11s',
  },
  {
    id: 'slf_pk_02',
    name: 'Bilal Qureshi',
    country: 'Pakistan',
    flag: '🇵🇰',
    isoCode: 'PK',
    accountTier: 'Self-Funded Live',
    eveningProfit: 23490.40,
    winRate: 75.1,
    payoutTime: '1m 20s',
  },
  {
    id: 'slf_pk_03',
    name: 'Ayesha Tariq',
    country: 'Pakistan',
    flag: '🇵🇰',
    isoCode: 'PK',
    accountTier: 'Self-Funded Live',
    eveningProfit: 16430.50,
    winRate: 72.3,
    payoutTime: '1m 29s',
  },
  {
    id: 'slf_pk_04',
    name: 'Saad Afridi',
    country: 'Pakistan',
    flag: '🇵🇰',
    isoCode: 'PK',
    accountTier: 'Self-Funded Live',
    eveningProfit: 11960.35,
    winRate: 69.4,
    payoutTime: '1m 38s',
  },

  // 3 UAE (Distinct names)
  {
    id: 'slf_ae_01',
    name: 'Zayed Al-Hashemi',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    isoCode: 'AE',
    accountTier: 'Self-Funded VIP Live',
    eveningProfit: 27520.80,
    winRate: 77.4,
    payoutTime: '1m 09s',
  },
  {
    id: 'slf_ae_02',
    name: 'Rashid Al-Maktoum',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    isoCode: 'AE',
    accountTier: 'Self-Funded Live',
    eveningProfit: 21340.50,
    winRate: 74.5,
    payoutTime: '1m 16s',
  },
  {
    id: 'slf_ae_03',
    name: 'Omar Al-Suwaidi',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    isoCode: 'AE',
    accountTier: 'Self-Funded Live',
    eveningProfit: 13170.25,
    winRate: 70.2,
    payoutTime: '1m 31s',
  },

  // 2 Bangladesh (Distinct names)
  {
    id: 'slf_bd_01',
    name: 'Nafis Rahman',
    country: 'Bangladesh',
    flag: '🇧🇩',
    isoCode: 'BD',
    accountTier: 'Self-Funded Live',
    eveningProfit: 18120.75,
    winRate: 73.0,
    payoutTime: '1m 24s',
  },
  {
    id: 'slf_bd_02',
    name: 'Mehedi Hasan',
    country: 'Bangladesh',
    flag: '🇧🇩',
    isoCode: 'BD',
    accountTier: 'Self-Funded Live',
    eveningProfit: 9210.45,
    winRate: 67.8,
    payoutTime: '1m 45s',
  },
];

/**
 * Computes Sri Lanka Standard Time (UTC+5:30) DAILY reset metrics.
 * Reset occurs daily at 05:30 AM (UTC+5:30) which corresponds to 00:00 UTC.
 */
export function getSriLankaDailyResetInfo(nowMs: number = Date.now()): {
  dayStartUtcMs: number;
  nextResetUtcMs: number;
  elapsedMsSinceReset: number;
  elapsedHoursSinceReset: number;
  hoursUntilReset: number;
  minutesUntilReset: number;
  intradayScale: number;
  sessionPhase: 'morning' | 'afternoon' | 'evening';
  sriLankaDateIso: string;
  sriLankaTimeFormatted: string;
  resetScheduleLabel: string;
  // Backwards-compatible fields
  weekStartIso: string;
  nextMondayIso: string;
  daysUntilMonday: number;
  hoursUntilMonday: number;
} {
  const now = new Date(nowMs);
  const dayStartUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  );
  const nextResetUtcMs = dayStartUtcMs + 24 * 60 * 60 * 1000;
  const elapsedMsSinceReset = Math.max(0, nowMs - dayStartUtcMs);
  const elapsedHoursSinceReset = elapsedMsSinceReset / (60 * 60 * 1000);

  const remainingMs = Math.max(0, nextResetUtcMs - nowMs);
  const hoursUntilReset = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutesUntilReset = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  let intradayScale = 0.0;
  let sessionPhase: 'morning' | 'afternoon' | 'evening' = 'morning';

  if (elapsedMsSinceReset <= 0) {
    sessionPhase = 'morning';
    intradayScale = 0.0;
  } else if (elapsedHoursSinceReset < 4) {
    sessionPhase = 'morning';
    intradayScale = (elapsedHoursSinceReset / 4) * 0.25;
  } else if (elapsedHoursSinceReset < 12) {
    sessionPhase = 'afternoon';
    intradayScale = 0.25 + ((elapsedHoursSinceReset - 4) / 8) * 0.5;
  } else {
    sessionPhase = 'evening';
    intradayScale = 0.75 + Math.min(0.25, ((elapsedHoursSinceReset - 12) / 12) * 0.25);
  }

  const slTime = new Date(nowMs + SRI_LANKA_OFFSET_MS);
  const slHours24 = slTime.getUTCHours();
  const slMins = slTime.getUTCMinutes();
  const period = slHours24 >= 12 ? 'PM' : 'AM';
  const slHours12 = slHours24 % 12 === 0 ? 12 : slHours24 % 12;
  const sriLankaTimeFormatted = `${String(slHours12).padStart(2, '0')}:${String(slMins).padStart(
    2,
    '0'
  )} ${period} SLST (UTC+5:30)`;
  const sriLankaDateIso = slTime.toISOString().split('T')[0];

  const resetScheduleLabel = `Resets Daily 05:30 AM SLST (UTC+5:30) • in ${hoursUntilReset}h ${minutesUntilReset}m`;

  return {
    dayStartUtcMs,
    nextResetUtcMs,
    elapsedMsSinceReset,
    elapsedHoursSinceReset,
    hoursUntilReset,
    minutesUntilReset,
    intradayScale: Number(intradayScale.toFixed(4)),
    sessionPhase,
    sriLankaDateIso,
    sriLankaTimeFormatted,
    resetScheduleLabel,
    weekStartIso: sriLankaDateIso,
    nextMondayIso: new Date(nextResetUtcMs).toISOString().split('T')[0],
    daysUntilMonday: 0,
    hoursUntilMonday: hoursUntilReset,
  };
}

/**
 * Computes Sri Lanka Standard Time (UTC+5:30) WEEKLY reset metrics for Funded Traders.
 * Timeframe: Past Week (Weekly performance).
 * Weekly reset occurs every Sunday at 00:00 UTC (05:30 AM SLST Sunday).
 */
export function getSriLankaWeeklyResetInfo(nowMs: number = Date.now()): {
  weekStartUtcMs: number;
  nextResetUtcMs: number;
  elapsedMsSinceReset: number;
  elapsedDaysSinceReset: number;
  daysUntilReset: number;
  hoursUntilReset: number;
  minutesUntilReset: number;
  weeklyScale: number;
  sriLankaDateIso: string;
  resetScheduleLabel: string;
} {
  const now = new Date(nowMs);
  const dayOfWeekUtc = now.getUTCDay();

  const dayStartUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  );
  const weekStartUtcMs = dayStartUtcMs - dayOfWeekUtc * 24 * 60 * 60 * 1000;
  const nextResetUtcMs = weekStartUtcMs + 7 * 24 * 60 * 60 * 1000;

  const elapsedMsSinceReset = Math.max(0, nowMs - weekStartUtcMs);
  const elapsedDaysSinceReset = elapsedMsSinceReset / (24 * 60 * 60 * 1000);

  const remainingMs = Math.max(0, nextResetUtcMs - nowMs);
  const daysUntilReset = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hoursUntilReset = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutesUntilReset = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  const weeklyScale = Math.min(1.0, 0.78 + (elapsedDaysSinceReset / 7) * 0.22);

  const slTime = new Date(nowMs + SRI_LANKA_OFFSET_MS);
  const sriLankaDateIso = slTime.toISOString().split('T')[0];

  const resetScheduleLabel = `Resets Weekly (Sunday 05:30 AM SLST) • in ${daysUntilReset}d ${hoursUntilReset}h`;

  return {
    weekStartUtcMs,
    nextResetUtcMs,
    elapsedMsSinceReset,
    elapsedDaysSinceReset,
    daysUntilReset,
    hoursUntilReset,
    minutesUntilReset,
    weeklyScale: Number(weeklyScale.toFixed(4)),
    sriLankaDateIso,
    resetScheduleLabel,
  };
}

export const getMondayWeeklyResetInfo = getSriLankaDailyResetInfo;

/**
 * Normalizes Funded Leaderboard traders:
 * Removes Yohan Siriwardhana from the Funded Leaderboard tab and keeps
 * Mateus Domingos anchored at Rank 1 (Angola, AO) with exact profit $72,876.98,
 * and Karthik Reddy anchored at Rank 15 with exact peak $27,321.11,
 * sorting all intermediate traders strictly in descending order.
 */
export function normalizeFundedLeaderboard(
  traders: LeaderboardTrader[],
  useEveningPeak?: boolean
): LeaderboardTrader[] {
  const mateus = traders.find(
    (t) => t.name === 'Mateus Domingos' || t.isoCode === 'AO' || t.country === 'Angola'
  ) || {
    id: 'fnd_ao_01',
    rank: 1,
    name: 'Mateus Domingos',
    country: 'Angola',
    flag: '🇦🇴',
    isoCode: 'AO',
    category: 'funded' as LeaderboardTabCategory,
    accountTier: '$100,000 Instant Funded',
    profit: MATEUS_FUNDED_PROFIT,
    winRate: 84.2,
    payoutTime: '1m 12s',
  };

  // Maintain the exact Rank 1 profit of $72,876.98 for Mateus Domingos
  const rank1Profit = MATEUS_FUNDED_PROFIT;

  const others = traders
    .filter(
      (t) =>
        t.name !== 'Mateus Domingos' &&
        !t.name.toLowerCase().includes('yohan') &&
        t.isoCode !== 'AO' &&
        t.country !== 'Angola'
    )
    .sort((a, b) => b.profit - a.profit);

  const mateusRank1: LeaderboardTrader = {
    ...mateus,
    id: mateus.id && !mateus.id.includes('lk') ? mateus.id : 'fnd_ao_01',
    rank: 1,
    name: 'Mateus Domingos',
    country: 'Angola',
    flag: '🇦🇴',
    isoCode: 'AO',
    category: 'funded',
    profit: rank1Profit,
  };

  const result = [mateusRank1, ...others.slice(0, 14)].map((t, idx) => ({
    ...t,
    category: 'funded' as LeaderboardTabCategory,
    rank: idx + 1,
  }));

  if (useEveningPeak && result.length === 15) {
    result[14].profit = FUNDED_RANK_15_PROFIT;
  }

  return result;
}

/**
 * Normalizes Self-Funded Leaderboard traders:
 * Keeps Aarav Sharma anchored at Rank 1 (India, IN, 🇮🇳) with exact profit $40,056.61.
 * Completely strips any instances of Yohan Siriwardhana.
 * When `resetToZero` is true (at 05:30 AM UTC+5:30 daily reset), traders start fresh at $0.00.
 */
export function normalizeSelfFundedLeaderboard(
  traders: LeaderboardTrader[],
  useEveningPeak?: boolean,
  resetToZero?: boolean
): LeaderboardTrader[] {
  const aarav = traders.find(
    (t) => t.name === 'Aarav Sharma' || (t.rank === 1 && (t.isoCode === 'IN' || t.country === 'India'))
  ) || {
    ...AARAV_SHARMA_SELF_ENTRY,
    profit: resetToZero ? 0 : AARAV_SELF_FUNDED_PROFIT,
  };

  const rank1Profit = resetToZero
    ? 0
    : useEveningPeak
    ? AARAV_SELF_FUNDED_PROFIT
    : aarav.profit === 0
    ? 0
    : Math.max(aarav.profit, AARAV_SELF_FUNDED_PROFIT);

  const others = traders
    .filter(
      (t) =>
        t.name !== 'Aarav Sharma' &&
        !t.name.toLowerCase().includes('yohan')
    )
    .map((t) => (resetToZero ? { ...t, profit: 0 } : t))
    .sort((a, b) => b.profit - a.profit);

  const aaravRank1: LeaderboardTrader = {
    ...aarav,
    id: aarav.id && !aarav.id.includes('lk') ? aarav.id : 'slf_in_01',
    rank: 1,
    name: 'Aarav Sharma',
    country: 'India',
    flag: '🇮🇳',
    isoCode: 'IN',
    category: 'self_funded',
    accountTier: 'Self-Funded VIP Live',
    profit: rank1Profit,
    winRate: 83.1,
    payoutTime: '0m 58s',
  };

  return [aaravRank1, ...others.slice(0, 14)].map((t, idx) => ({
    ...t,
    category: 'self_funded' as LeaderboardTabCategory,
    rank: idx + 1,
  }));
}

export const normalizeWeeklyLeaderboard = normalizeFundedLeaderboard;

/**
 * Generates a fresh $0.00 Self-Funded Daily Leaderboard snapshot at 05:30 AM (UTC+5:30).
 */
export function createFreshZeroSelfFundedLeaderboard(): LeaderboardTrader[] {
  return SELF_FUNDED_TRADER_POOL.map((cfg, idx) => ({
    id: cfg.id,
    rank: idx + 1,
    name: cfg.name,
    country: cfg.country,
    flag: cfg.flag,
    isoCode: cfg.isoCode,
    category: 'self_funded' as LeaderboardTabCategory,
    accountTier: cfg.accountTier,
    profit: 0,
    targetEveningProfit: cfg.eveningProfit,
    winRate: cfg.winRate,
    payoutTime: cfg.payoutTime,
  }));
}

/**
 * Generates the Top 15 leaderboard for the given tab ('funded' | 'self_funded') and timestamp.
 */
export function getDynamicLeaderboardTraders(options?: {
  category?: LeaderboardTabCategory;
  nowMs?: number;
  useEveningPeak?: boolean;
  resetToZero?: boolean;
}): LeaderboardTrader[] {
  const category: LeaderboardTabCategory = options?.category || 'funded';
  const nowMs = options?.nowMs ?? Date.now();

  if (category === 'funded') {
    const weeklyReset = getSriLankaWeeklyResetInfo(nowMs);
    const scale = options?.useEveningPeak ? 1.0 : weeklyReset.weeklyScale;

    const rawList: LeaderboardTrader[] = FUNDED_TRADER_POOL.map((cfg, idx) => {
      let profit: number;
      if (idx === 0) {
        profit = MATEUS_FUNDED_PROFIT;
      } else if (idx === FUNDED_TRADER_POOL.length - 1) {
        profit = options?.useEveningPeak
          ? FUNDED_RANK_15_PROFIT
          : Number((FUNDED_RANK_15_PROFIT * scale).toFixed(2));
      } else {
        profit = options?.useEveningPeak
          ? cfg.eveningProfit
          : Number((cfg.eveningProfit * scale).toFixed(2));
      }

      return {
        id: cfg.id,
        rank: idx + 1,
        name: cfg.name,
        country: cfg.country,
        flag: cfg.flag,
        isoCode: cfg.isoCode,
        category: 'funded',
        accountTier: cfg.accountTier,
        profit,
        targetEveningProfit: cfg.eveningProfit,
        winRate: cfg.winRate,
        payoutTime: cfg.payoutTime,
      };
    });

    return normalizeFundedLeaderboard(rawList, options?.useEveningPeak);
  }

  // Daily Reset Logic for Self-Funded Traders (resets every day at 05:30 AM UTC+5:30 / 00:00 UTC)
  const resetInfo = getSriLankaDailyResetInfo(nowMs);
  const isAtExactResetBoundary =
    options?.resetToZero === true ||
    (!options?.useEveningPeak && resetInfo.elapsedMsSinceReset === 0);

  if (isAtExactResetBoundary) {
    return createFreshZeroSelfFundedLeaderboard();
  }

  const scale = options?.useEveningPeak ? 1.0 : resetInfo.intradayScale;

  const rawList: LeaderboardTrader[] = SELF_FUNDED_TRADER_POOL.map((cfg, idx) => {
    let profit: number;
    if (idx === 0 || cfg.name === 'Aarav Sharma') {
      profit = AARAV_SELF_FUNDED_PROFIT;
    } else {
      const minuteBucket = Math.floor(resetInfo.elapsedMsSinceReset / (60 * 1000));
      const waveSeed = Math.sin((minuteBucket + idx * 19) * 0.15) * 0.025;
      const effectiveScale = options?.useEveningPeak
        ? 1.0
        : Math.max(0.0, Math.min(1.0, scale + waveSeed));
      profit = Number((cfg.eveningProfit * effectiveScale).toFixed(2));
    }

    return {
      id: cfg.id,
      rank: idx + 1,
      name: cfg.name,
      country: cfg.country,
      flag: cfg.flag,
      isoCode: cfg.isoCode,
      category: 'self_funded',
      accountTier: cfg.accountTier,
      profit,
      targetEveningProfit: cfg.eveningProfit,
      winRate: cfg.winRate,
      payoutTime: cfg.payoutTime,
    };
  });

  return normalizeSelfFundedLeaderboard(rawList, options?.useEveningPeak, false);
}

export const WEEKLY_LEADERBOARD_TRADERS: LeaderboardTrader[] = getDynamicLeaderboardTraders({
  category: 'funded',
  useEveningPeak: true,
});

export const SELF_FUNDED_LEADERBOARD_TRADERS: LeaderboardTrader[] = getDynamicLeaderboardTraders({
  category: 'self_funded',
  useEveningPeak: false,
});

/**
 * Validates if an account qualifies for a given Leaderboard tab ('funded' vs 'self_funded').
 * Demo accounts are excluded from both real leaderboards.
 */
export function isEligibleLeaderboardAccount(
  account?: any | null,
  tabCategory?: LeaderboardTabCategory
): boolean {
  if (!account) return false;

  const tier = String(account.tier || '').toLowerCase();
  const category = String(account.accountCategory || account.account_category || '').toLowerCase();
  const phase = String(account.phase || '').toLowerCase();
  const id = String(account.id || '').toUpperCase();

  if (tier === 'demo' || category === 'demo' || phase === 'demo' || id.startsWith('BFT-DEMO')) {
    return false;
  }

  const isSelfFunded =
    tier === 'personal' ||
    category === 'personal_live' ||
    category === 'self_funded' ||
    phase === 'personal_live' ||
    id.includes('PERS');

  if (tabCategory === 'self_funded') {
    return isSelfFunded;
  }

  if (tabCategory === 'funded') {
    return !isSelfFunded;
  }

  return true;
}

/**
 * Calculates user's real PnL for the specified Leaderboard category:
 * - 'self_funded': DAILY PnL (settled trades since 05:30 AM SLST / 00:00 UTC today).
 * - 'funded': WEEKLY PnL (settled trades within the past week / current weekly cycle).
 */
export function calculateUserLeaderboardPnL(params: {
  category: LeaderboardTabCategory;
  trades?: any[];
  activeAccount?: any | null;
  accounts?: any[];
  fallbackProfitLoss?: number;
  nowMs?: number;
}): {
  pnl: number;
  tradesCount: number;
} {
  const nowMs = params.nowMs ?? Date.now();
  const startTimeMs =
    params.category === 'funded'
      ? getSriLankaWeeklyResetInfo(nowMs).weekStartUtcMs
      : getSriLankaDailyResetInfo(nowMs).dayStartUtcMs;

  const eligibleAccounts = Array.isArray(params.accounts)
    ? params.accounts.filter((acc) => isEligibleLeaderboardAccount(acc, params.category))
    : [];

  const activeAccountEligible = params.activeAccount
    ? isEligibleLeaderboardAccount(params.activeAccount, params.category)
    : true;

  if (Array.isArray(params.trades) && params.trades.length > 0) {
    const settled = params.trades.filter((t) => {
      if (t.status !== 'won' && t.status !== 'lost') return false;

      const accId = t.accountId || t.account_id;
      if (eligibleAccounts.length > 0 && accId) {
        const belongsToEligible = eligibleAccounts.some((acc) => String(acc.id) === String(accId));
        if (!belongsToEligible) return false;
      } else if (params.activeAccount) {
        if (!activeAccountEligible) return false;
        if (accId && String(accId) !== String(params.activeAccount.id)) return false;
      }

      const tradeTime = Number(t.endTime || t.startTime || t.createdAt || nowMs);
      return tradeTime >= startTimeMs;
    });

    if (settled.length > 0) {
      const netPnL = settled.reduce((sum, t) => {
        const inv = Number(t.investment || t.amount || 0);
        const payoutPct = Number(t.payoutPercentage ?? 92);
        if (t.status === 'won') {
          const explicitProfit =
            t.profit !== undefined ? Number(t.profit) : inv * (payoutPct / 100);
          return sum + explicitProfit;
        }
        if (t.status === 'lost') {
          const explicitLoss =
            t.profit !== undefined && Number(t.profit) < 0 ? Number(t.profit) : -inv;
          return sum + explicitLoss;
        }
        return sum;
      }, 0);

      return {
        pnl: Number(netPnL.toFixed(2)),
        tradesCount: settled.length,
      };
    }

    // For self_funded daily leaderboard, if trades exist in history but none occurred since 05:30 AM SLST today,
    // today's daily PnL starts fresh at $0.00!
    if (params.category === 'self_funded') {
      return {
        pnl: 0,
        tradesCount: 0,
      };
    }
  }

  // If activeAccount is eligible for category, compute balance diff
  if (params.activeAccount && activeAccountEligible) {
    if (
      typeof params.activeAccount.currentBalance === 'number' &&
      typeof params.activeAccount.initialBalance === 'number'
    ) {
      const diff = Number(
        (params.activeAccount.currentBalance - params.activeAccount.initialBalance).toFixed(2)
      );
      return { pnl: diff, tradesCount: diff !== 0 ? 1 : 0 };
    }
  }

  // If eligible accounts list is provided and has items, sum their profit/balance diffs
  if (eligibleAccounts.length > 0) {
    let totalAccProfit = 0;
    let count = 0;
    for (const acc of eligibleAccounts) {
      if (typeof acc.currentBalance === 'number' && typeof acc.initialBalance === 'number') {
        totalAccProfit += Number((acc.currentBalance - acc.initialBalance).toFixed(2));
        count++;
      }
    }
    if (count > 0) {
      return { pnl: Number(totalAccProfit.toFixed(2)), tradesCount: count };
    }
  }

  if (
    typeof params.fallbackProfitLoss === 'number' &&
    Number.isFinite(params.fallbackProfitLoss) &&
    activeAccountEligible
  ) {
    return {
      pnl: Number(params.fallbackProfitLoss.toFixed(2)),
      tradesCount: params.fallbackProfitLoss !== 0 ? 1 : 0,
    };
  }

  return {
    pnl: 0,
    tradesCount: 0,
  };
}

export function calculateUserDailyPnL(params: {
  trades?: any[];
  activeAccount?: any | null;
  fallbackProfitLoss?: number;
  nowMs?: number;
}): {
  dailyPnL: number;
  tradesTodayCount: number;
} {
  const res = calculateUserLeaderboardPnL({
    ...params,
    category: 'self_funded',
  });
  return {
    dailyPnL: res.pnl,
    tradesTodayCount: res.tradesCount,
  };
}

export function calculateUserWeeklyPnL(params: {
  trades?: any[];
  activeAccount?: any | null;
  fallbackProfitLoss?: number;
  nowMs?: number;
}): {
  weeklyPnL: number;
  tradesWeeklyCount: number;
} {
  const res = calculateUserLeaderboardPnL({
    ...params,
    category: 'funded',
  });
  return {
    weeklyPnL: res.pnl,
    tradesWeeklyCount: res.tradesCount,
  };
}

export function formatDailyProfitLoss(amount: number): {
  formatted: string;
  isProfit: boolean;
  isLoss: boolean;
  colorClass: string;
} {
  const clean = Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
  if (clean < 0) {
    return {
      formatted: `-$${Math.abs(clean).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      isProfit: false,
      isLoss: true,
      colorClass: 'text-rose-500',
    };
  }
  return {
    formatted: `+$${clean.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    isProfit: clean > 0,
    isLoss: false,
    colorClass: 'text-[#00e676]',
  };
}

export const formatLeaderboardProfitLoss = formatDailyProfitLoss;

export function resolveUserLeaderboardPosition(
  userProfit: number,
  tradesCount: number = 0,
  traders: LeaderboardTrader[] = WEEKLY_LEADERBOARD_TRADERS,
  account?: any | null,
  userMeta?: {
    name?: string;
    country?: string;
    isoCode?: string;
    flag?: string;
  }
): {
  isUnranked: boolean;
  rank: number | null;
  rankLabel: string;
  verifiedWeeklyProfit: number;
  dailyProfitLoss: number;
  formattedProfitLoss: string;
  mergedTraders: LeaderboardTrader[];
} {
  const cleanProfit = Number.isFinite(userProfit) ? Number(userProfit.toFixed(2)) : 0;
  const { formatted: formattedProfitLoss } = formatDailyProfitLoss(cleanProfit);

  const top15 = traders.slice(0, 15);
  const lowestTop15Profit = top15.length > 0 ? top15[top15.length - 1].profit : Infinity;

  if (cleanProfit > 0 && cleanProfit > lowestTop15Profit) {
    const higherTraders = top15.filter((t) => t.profit >= cleanProfit);
    const exactRank = higherTraders.length + 1;

    if (exactRank <= 15) {
      const userEntry: LeaderboardTrader = {
        id: 'usr_current_logged_in',
        rank: exactRank,
        name: userMeta?.name || 'You (Active Trader)',
        country: userMeta?.country || 'Sri Lanka',
        flag: userMeta?.flag || '🇱🇰',
        isoCode: userMeta?.isoCode || 'LK',
        accountTier: account?.tierName || 'Active Account',
        profit: cleanProfit,
        winRate: 80.0,
        payoutTime: 'Instant',
        isCurrentUser: true,
      };

      const lowerTraders = top15.filter((t) => t.profit < cleanProfit);
      const mergedTraders = [...higherTraders, userEntry, ...lowerTraders]
        .slice(0, 15)
        .map((t, index) => ({
          ...t,
          rank: index + 1,
        }));

      return {
        isUnranked: false,
        rank: exactRank,
        rankLabel: `${exactRank}`,
        verifiedWeeklyProfit: cleanProfit,
        dailyProfitLoss: cleanProfit,
        formattedProfitLoss,
        mergedTraders,
      };
    }
  }

  return {
    isUnranked: true,
    rank: null,
    rankLabel: '1000+',
    verifiedWeeklyProfit: cleanProfit,
    dailyProfitLoss: cleanProfit,
    formattedProfitLoss,
    mergedTraders: top15,
  };
}

export function formatCleanLeaderboardRow(trader: LeaderboardTrader): {
  rank: number;
  rankDisplay: string;
  flag: string;
  name: string;
  country: string;
  profitFormatted: string;
  isLoss: boolean;
  isTopThree: boolean;
} {
  const cleanProfit = Number.isFinite(trader.profit) ? trader.profit : 0;
  const pnl = formatDailyProfitLoss(cleanProfit);
  return {
    rank: trader.rank,
    rankDisplay: `${trader.rank}`,
    flag: trader.flag,
    name: trader.name,
    country: trader.country,
    profitFormatted: pnl.formatted,
    isLoss: pnl.isLoss,
    isTopThree: trader.rank >= 1 && trader.rank <= 3,
  };
}

const SELF_FUNDED_DAILY_RESET_STORAGE_KEY = 'bft_self_funded_daily_reset_date_v2';
let supabaseLeaderboardWriteAllowed = true;

/**
 * Syncs the Self-Funded Daily Leaderboard rows to the Supabase `self_funded_leaderboard` table
 * so connected clients subscribed via Supabase Realtime receive live updates.
 */
export async function syncSelfFundedLeaderboardToSupabase(
  traders: LeaderboardTrader[]
): Promise<void> {
  if (!supabaseLeaderboardWriteAllowed) return;
  try {
    const { data: sessionData } = await supabase.auth
      .getSession()
      .catch(() => ({ data: { session: null } }));
    if (!sessionData?.session) return;

    const nowIso = new Date().toISOString();
    const payload = traders.slice(0, 15).map((t, idx) => ({
      rank: idx + 1,
      trader_name: t.name,
      country: t.country,
      profit: Number(t.profit.toFixed(2)),
      updated_at: nowIso,
    }));

    const { error } = await supabase
      .from('self_funded_leaderboard')
      .upsert(payload, { onConflict: 'rank' });
    if (error && (error.code === '42501' || error.code === '42P10' || error.code === 'PGRST204')) {
      supabaseLeaderboardWriteAllowed = false;
    }
  } catch {
    // Non-blocking if RLS restricts client upserts
  }
}

/**
 * Syncs Funded Leaderboard Rank 1 (Mateus Domingos, Angola, $72,876.98) to Supabase `funded_leaderboard`.
 */
export async function syncFundedLeaderboardToSupabase(
  traders: LeaderboardTrader[]
): Promise<void> {
  if (!supabaseLeaderboardWriteAllowed) return;
  try {
    const { data: sessionData } = await supabase.auth
      .getSession()
      .catch(() => ({ data: { session: null } }));
    if (!sessionData?.session) return;

    const nowIso = new Date().toISOString();
    const payload = traders.slice(0, 15).map((t, idx) => ({
      rank: idx + 1,
      trader_name: t.name,
      country: t.country,
      profit: Number(t.profit.toFixed(2)),
      updated_at: nowIso,
    }));

    const { error } = await supabase
      .from('funded_leaderboard')
      .upsert(payload, { onConflict: 'rank' });
    if (error && (error.code === '42501' || error.code === '42P10' || error.code === 'PGRST204')) {
      supabaseLeaderboardWriteAllowed = false;
    }
  } catch {
    // Non-blocking
  }
}

/**
 * Checks whether a new daily cycle (05:30 AM UTC+5:30 / 00:00 UTC) has started.
 * Upon reset, clears out previous cumulative totals so each trader starts fresh from $0.00,
 * and pushes the reset state to Supabase `self_funded_leaderboard`.
 */
export async function checkAndPerformDailySelfFundedReset(
  nowMs: number = Date.now()
): Promise<{
  wasReset: boolean;
  resetDateIso: string;
  traders: LeaderboardTrader[];
}> {
  const resetInfo = getSriLankaDailyResetInfo(nowMs);
  let lastResetDate = '';
  try {
    lastResetDate = localStorage.getItem(SELF_FUNDED_DAILY_RESET_STORAGE_KEY) || '';
  } catch {
    // ignore storage error
  }

  const isExactResetMinute = resetInfo.elapsedMsSinceReset < 60 * 1000;
  const dateRolledOver = Boolean(lastResetDate && lastResetDate !== resetInfo.sriLankaDateIso);

  if (isExactResetMinute || dateRolledOver) {
    try {
      localStorage.setItem(SELF_FUNDED_DAILY_RESET_STORAGE_KEY, resetInfo.sriLankaDateIso);
    } catch {}
    const zeroTraders = createFreshZeroSelfFundedLeaderboard();
    await syncSelfFundedLeaderboardToSupabase(zeroTraders);
    return {
      wasReset: true,
      resetDateIso: resetInfo.sriLankaDateIso,
      traders: zeroTraders,
    };
  }

  if (!lastResetDate) {
    try {
      localStorage.setItem(SELF_FUNDED_DAILY_RESET_STORAGE_KEY, resetInfo.sriLankaDateIso);
    } catch {}
  }

  const currentTraders = getDynamicLeaderboardTraders({
    category: 'self_funded',
    nowMs,
    useEveningPeak: false,
  });

  return {
    wasReset: false,
    resetDateIso: resetInfo.sriLankaDateIso,
    traders: currentTraders,
  };
}

export async function fetchFundedLeaderboardFromSupabase(): Promise<LeaderboardTrader[]> {
  try {
    const { data, error } = await supabase
      .from('funded_leaderboard')
      .select('*')
      .order('rank', { ascending: true })
      .limit(15);

    if (error || !Array.isArray(data) || data.length === 0) {
      return getDynamicLeaderboardTraders({ category: 'funded', useEveningPeak: true });
    }

    const hadLegacyYohan = data.some(
      (r: any) => String(r.trader_name || r.name || '').trim() === 'Yohan Siriwardhana'
    );

    const mapped: LeaderboardTrader[] = data.map((r: any) => {
      const rowName = String(r.trader_name || r.name || 'Trader').trim();
      const isRank1OrYohan = Number(r.rank) === 1 || rowName === 'Yohan Siriwardhana';
      if (isRank1OrYohan) {
        return {
          id: 'fnd_ao_01',
          rank: 1,
          name: 'Mateus Domingos',
          country: 'Angola',
          flag: '🇦🇴',
          isoCode: 'AO',
          category: 'funded',
          accountTier: String(r.account_tier || r.accountTier || '$100,000 Instant Funded'),
          profit: MATEUS_FUNDED_PROFIT,
          winRate: Number(r.win_rate ?? r.winRate ?? 84.2),
          payoutTime: String(r.payout_time || r.payoutTime || '1m 12s'),
        };
      }
      return {
        id: String(r.id || `fnd_${r.rank}`),
        rank: Number(r.rank),
        name: rowName,
        country: String(r.country || 'India'),
        flag: String(r.flag || '🇮🇳'),
        isoCode: String(r.iso_code || r.isoCode || 'IN'),
        category: 'funded',
        accountTier: String(r.account_tier || r.accountTier || '$100,000 Instant Funded'),
        profit: Number(r.profit ?? r.funded_profit ?? 0),
        winRate: Number(r.win_rate ?? r.winRate ?? 80.0),
        payoutTime: String(r.payout_time || r.payoutTime || '1m 20s'),
      };
    });

    const normalized = normalizeFundedLeaderboard(mapped, true);
    if (hadLegacyYohan) {
      syncFundedLeaderboardToSupabase(normalized).catch(() => {});
    }
    return normalized;
  } catch {
    return getDynamicLeaderboardTraders({ category: 'funded', useEveningPeak: true });
  }
}

export async function fetchSelfFundedLeaderboardFromSupabase(
  nowMs: number = Date.now()
): Promise<LeaderboardTrader[]> {
  try {
    const resetCheck = await checkAndPerformDailySelfFundedReset(nowMs);
    if (resetCheck.wasReset) {
      return resetCheck.traders;
    }

    const resetInfo = getSriLankaDailyResetInfo(nowMs);

    // 1. Fetch seed/persisted rows from self_funded_leaderboard table
    let dbTraders: LeaderboardTrader[] = [];
    try {
      const { data, error } = await supabase
        .from('self_funded_leaderboard')
        .select('*')
        .order('rank', { ascending: true })
        .limit(15);

      if (!error && Array.isArray(data) && data.length > 0) {
        dbTraders = data.map((r: any) => {
          const rawName = String(r.trader_name || r.name || 'Trader').trim();
          const isYohan = rawName.toLowerCase().includes('yohan');
          const name = isYohan ? 'Aarav Sharma' : rawName;
          const country = isYohan ? 'India' : String(r.country || 'India');
          const flag = isYohan ? '🇮🇳' : String(r.flag || '🇮🇳');
          const isoCode = isYohan ? 'IN' : String(r.iso_code || r.isoCode || 'IN');
          const rawProfit = isYohan
            ? AARAV_SELF_FUNDED_PROFIT
            : Number(r.daily_self_funded_profit ?? r.profit ?? 0);

          return {
            id: String(r.id || `slf_${r.rank}`),
            rank: Number(r.rank),
            name,
            country,
            flag,
            isoCode,
            category: 'self_funded' as LeaderboardTabCategory,
            accountTier: String(r.account_tier || r.accountTier || 'Self-Funded Live'),
            profit: rawProfit,
            winRate: Number(r.win_rate ?? r.winRate ?? 80.0),
            payoutTime: String(r.payout_time || r.payoutTime || '1m 20s'),
          };
        });
      }
    } catch {
      // table might be empty
    }

    // 2. Fetch active traders from Supabase profiles (where self_balance > 0)
    const activeProfileTraders: LeaderboardTrader[] = [];
    try {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name, email, self_balance, balance')
        .gt('self_balance', 0)
        .order('self_balance', { ascending: false })
        .limit(20);

      if (Array.isArray(profileRows) && profileRows.length > 0) {
        profileRows.forEach((p: any, idx: number) => {
          const rawName = String(p.full_name || p.email?.split('@')[0] || `Trader ${idx + 1}`).trim();
          if (rawName.toLowerCase() === 'loading' || rawName.toLowerCase() === 'null') return;
          const isYohan = rawName.toLowerCase().includes('yohan');
          const name = isYohan ? 'Aarav Sharma' : rawName;
          const selfBal = Number(p.self_balance || 0);
          const profit = isYohan
            ? AARAV_SELF_FUNDED_PROFIT
            : Math.min(38500.00, Number(selfBal.toFixed(2)));

          activeProfileTraders.push({
            id: `supa_prof_${p.id}`,
            rank: 2,
            name,
            country: 'India',
            flag: '🇮🇳',
            isoCode: 'IN',
            category: 'self_funded',
            accountTier: profit > 20000 ? 'Self-Funded VIP Live' : 'Self-Funded Live',
            profit,
            winRate: Number((78.2 + (idx % 4) * 1.5).toFixed(1)),
            payoutTime: '1m 15s',
          });
        });
      }
    } catch {
      // Supabase profiles fetch fallback
    }

    // 3. Fetch active traders from backend SQLite query (joins users + accounts + trades)
    let backendActiveTraders: LeaderboardTrader[] = [];
    try {
      const apiRes = await fetch('/api/leaderboard?category=self_funded');
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json.ok && Array.isArray(json.traders)) {
          backendActiveTraders = json.traders;
        }
      }
    } catch {}

    // 4. Merge all sources
    const dynamicBase = getDynamicLeaderboardTraders({
      category: 'self_funded',
      nowMs,
      useEveningPeak: false,
    });

    const combinedPool: LeaderboardTrader[] = [
      ...dbTraders,
      ...activeProfileTraders,
      ...backendActiveTraders,
      ...dynamicBase,
    ];

    const deduplicated: LeaderboardTrader[] = [];
    const seenNames = new Set<string>();

    for (const t of combinedPool) {
      const cleanName = String(t.name || '').trim();
      const lower = cleanName.toLowerCase();
      if (lower.includes('yohan')) continue;
      if (seenNames.has(lower)) continue;
      seenNames.add(lower);
      deduplicated.push(t);
    }

    return normalizeSelfFundedLeaderboard(deduplicated, false, false);
  } catch {
    return getDynamicLeaderboardTraders({
      category: 'self_funded',
      nowMs,
      useEveningPeak: false,
    });
  }
}

export function subscribeToLeaderboardsRealtime(
  onFundedUpdate: (traders: LeaderboardTrader[]) => void,
  onSelfFundedUpdate: (traders: LeaderboardTrader[]) => void
) {
  const channelKey = `realtime:leaderboards:${Date.now()}`;
  const channel = supabase
    .channel(channelKey)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'funded_leaderboard' },
      async () => {
        const updated = await fetchFundedLeaderboardFromSupabase();
        onFundedUpdate(updated);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'self_funded_leaderboard' },
      async () => {
        const updated = await fetchSelfFundedLeaderboardFromSupabase();
        onSelfFundedUpdate(updated);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      async () => {
        const updated = await fetchSelfFundedLeaderboardFromSupabase();
        onSelfFundedUpdate(updated);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

