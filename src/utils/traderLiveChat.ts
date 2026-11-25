import { supabase } from './supabase.ts';
import type { TradingAccount, UserProfile } from '../types/index.ts';
import { resolveAvailableSelfCapitalBalance } from './propRules.ts';

export interface TraderLiveChatMessage {
  id: string;
  sender_name: string;
  sender_avatar_url: string | null;
  message: string;
  created_at: string;
}

export type ChatModerationBlockCode =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'LINK_BLOCKED'
  | 'NUMBER_BLOCKED'
  | 'PROFANITY_BLOCKED'
  | 'SPAM_BLOCKED'
  | 'SELF_CAPITAL_REQUIRED';

export interface PublicChatAccessState {
  unlocked: boolean;
  selfCapitalBalance: number;
  lockReason: string | null;
}

export interface ChatModerationResult {
  allowed: boolean;
  sanitizedText: string;
  code?: ChatModerationBlockCode;
  reason?: string;
}

export interface CleanSenderIdentity {
  senderName: string;
  senderAvatarUrl: string;
}

export const DEFAULT_CHAT_AVATAR_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="chatAv" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#0f172a"/><circle cx="60" cy="44" r="22" fill="url(#chatAv)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#chatAv)"/></svg>`
)}`;

export const BLOCKED_CHAT_NOTICE =
  'Links, numbers, and inappropriate messages are automatically blocked.';

export const CHAT_SELF_CAPITAL_REQUIRED_NOTICE =
  'Deposit into your Self Capital balance to unlock public community chat.';

export const AMBIENT_CHAT_MIN_DELAY_MS = 25_000;
export const AMBIENT_CHAT_MAX_DELAY_MS = 75_000;

/**
 * Evaluates whether the user has a positive Self Capital balance (self_capital > 0)
 * required to unlock and post in the public trader community chat.
 */
export function resolvePublicChatAccess(params: {
  userProfile?: Partial<UserProfile> | null;
  accounts?: TradingAccount[] | null;
  selfCapitalBalance?: number | null;
}): PublicChatAccessState {
  let resolvedBalance: number;
  if (
    typeof params.selfCapitalBalance === 'number' &&
    Number.isFinite(params.selfCapitalBalance)
  ) {
    resolvedBalance = Math.max(0, Number(params.selfCapitalBalance.toFixed(2)));
  } else {
    resolvedBalance = Math.max(
      0,
      resolveAvailableSelfCapitalBalance(params.userProfile, params.accounts)
    );
  }

  const unlocked = resolvedBalance > 0;
  return {
    unlocked,
    selfCapitalBalance: resolvedBalance,
    lockReason: unlocked ? null : CHAT_SELF_CAPITAL_REQUIRED_NOTICE,
  };
}

function buildInitialsAvatarDataUrl(initials: string, startColor: string, endColor: string): string {
  const safeInitials = initials.slice(0, 2).toUpperCase();
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="av" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${startColor}"/><stop offset="100%" stop-color="${endColor}"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="url(#av)"/><text x="60" y="72" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="44" font-weight="800" fill="#ffffff">${safeInitials}</text></svg>`
  )}`;
}

export interface AmbientTraderProfile {
  name: string;
  avatarUrl: string;
}

export const AMBIENT_COMMUNITY_TRADERS: ReadonlyArray<AmbientTraderProfile> = [
  { name: 'Kasun Perera', avatarUrl: buildInitialsAvatarDataUrl('KP', '#0ea5e9', '#0369a1') },
  { name: 'Daniel Brooks', avatarUrl: buildInitialsAvatarDataUrl('DB', '#10b981', '#047857') },
  { name: 'Roshan Silva', avatarUrl: buildInitialsAvatarDataUrl('RS', '#f59e0b', '#b45309') },
  { name: 'Amara Jayasinghe', avatarUrl: buildInitialsAvatarDataUrl('AJ', '#8b5cf6', '#6d28d9') },
  { name: 'Mateo Alvarez', avatarUrl: buildInitialsAvatarDataUrl('MA', '#06b6d4', '#0e7490') },
  { name: 'Liam Carter', avatarUrl: buildInitialsAvatarDataUrl('LC', '#3b82f6', '#1d4ed8') },
  { name: 'Tharindu Fernando', avatarUrl: buildInitialsAvatarDataUrl('TF', '#14b8a6', '#0f766e') },
  { name: 'Elena Novak', avatarUrl: buildInitialsAvatarDataUrl('EN', '#ec4899', '#be185d') },
  { name: 'Arjun Nair', avatarUrl: buildInitialsAvatarDataUrl('AN', '#6366f1', '#4338ca') },
  { name: 'Noah Bennett', avatarUrl: buildInitialsAvatarDataUrl('NB', '#22c55e', '#15803d') },
  { name: 'Dilshan Bandara', avatarUrl: buildInitialsAvatarDataUrl('DB', '#f97316', '#c2410c') },
  { name: 'Sofia Mendes', avatarUrl: buildInitialsAvatarDataUrl('SM', '#a855f7', '#7e22ce') },
];

export const AMBIENT_COMMUNITY_MESSAGES: ReadonlyArray<string> = [
  'EUR/USD showing clean rejection near resistance on the 1m chart.',
  'Waiting for the current candle close before taking a 60s entry on GBP/USD.',
  'London session volatility is picking up nicely on GBP/JPY today.',
  'Keeping risk strictly under 5% per trade on my challenge account.',
  'XAU/USD pullback held support well, solid 1m CALL setup.',
  'Day 3 of 5 on the Challenge account done, staying patient and sticking to the plan.',
  'Anyone watching USD/JPY around this consolidation zone?',
  'NY open momentum is smooth today, no need to force entries.',
  'Hit my daily profit goal early so stepping back to protect the drawdown.',
  'AUD/USD moving cleanly between levels on the 30s and 1m timeframes.',
  'Discipline beats high volume every time on funded evaluations.',
  'Nice bearish engulfing on EUR/GBP right at the session high.',
  'Gold is respecting the trendline cleanly this hour.',
  'Taking 2m expiries during choppy candles has helped my win rate a lot.',
  'BTC/USD liquidity looks active right now, watching for a clean retest.',
  'Remember to check the 5m trend before entering short binary expiries.',
  'Two clean wins on EUR/USD, calling it a wrap for this session.',
  'Keeping position size steady so daily drawdown stays well under control.',
  'GBP/USD bouncing off that support level nicely on the 1m.',
  'Slow and steady on the Challenge phase, 4 trading days completed now.',
  'Waiting for a wick rejection on XAU/USD before clicking PUT.',
  'Good execution speed during the London-NY overlap today.',
  'Sticking to my two favorite pairs instead of chasing every chart.',
  'EUR/JPY just broke out of that tight range with strong follow-through.',
  'Patience pays off, skipped two messy setups and caught a clean 1m win.',
  'Managing risk first makes passing the Challenge way less stressful.',
];

/**
 * Returns a randomized ambient delay between 25 and 75 seconds.
 */
export function getNextAmbientChatDelayMs(rng: () => number = Math.random): number {
  const clampedRng = Math.max(0, Math.min(0.999999, rng()));
  return Math.round(
    AMBIENT_CHAT_MIN_DELAY_MS +
      clampedRng * (AMBIENT_CHAT_MAX_DELAY_MS - AMBIENT_CHAT_MIN_DELAY_MS)
  );
}

/**
 * Picks a natural, non-repeating simulated community trader message without repeating
 * recent messages or senders back-to-back.
 */
export function pickNextAmbientChatMessage(params?: {
  recentMessages?: Array<{ sender_name: string; message: string }>;
  nowMs?: number;
  rng?: () => number;
}): TraderLiveChatMessage {
  const recent = params?.recentMessages || [];
  const nowMs = params?.nowMs ?? Date.now();
  const rng = params?.rng ?? Math.random;

  const recentTexts = new Set(recent.slice(-10).map((m) => m.message.trim().toLowerCase()));
  const recentSenders = new Set(recent.slice(-4).map((m) => m.sender_name.trim().toLowerCase()));

  const candidateMessages = AMBIENT_COMMUNITY_MESSAGES.filter(
    (msg) => !recentTexts.has(msg.trim().toLowerCase())
  );
  const messagePool =
    candidateMessages.length > 0 ? candidateMessages : AMBIENT_COMMUNITY_MESSAGES;

  const candidateTraders = AMBIENT_COMMUNITY_TRADERS.filter(
    (trader) => !recentSenders.has(trader.name.trim().toLowerCase())
  );
  const traderPool =
    candidateTraders.length > 0 ? candidateTraders : AMBIENT_COMMUNITY_TRADERS;

  const msgIdx = Math.floor(Math.max(0, Math.min(0.999999, rng())) * messagePool.length);
  const traderIdx = Math.floor(Math.max(0, Math.min(0.999999, rng())) * traderPool.length);

  const selectedMessage = messagePool[msgIdx];
  const selectedTrader = traderPool[traderIdx];
  const suffix = Math.floor(Math.max(0, Math.min(0.999999, rng())) * 1_000_000)
    .toString(36)
    .padStart(4, '0');

  return {
    id: `ambient_${nowMs}_${suffix}`,
    sender_name: selectedTrader.name,
    sender_avatar_url: selectedTrader.avatarUrl,
    message: selectedMessage,
    created_at: new Date(nowMs).toISOString(),
  };
}

/**
 * Generates a small batch of recent realistic messages when the room opens empty
 * so the public community chat feels active without spamming.
 */
export function createInitialAmbientSeedMessages(
  count: number = 3,
  nowMs: number = Date.now(),
  rng: () => number = Math.random
): TraderLiveChatMessage[] {
  const safeCount = Math.max(0, Math.min(4, count));
  const seeded: TraderLiveChatMessage[] = [];
  for (let i = 0; i < safeCount; i++) {
    const minutesAgo = (safeCount - i) * 2 + 1;
    const timestamp = nowMs - minutesAgo * 60_000 - Math.round(rng() * 35_000);
    const msg = pickNextAmbientChatMessage({
      recentMessages: seeded,
      nowMs: timestamp,
      rng,
    });
    seeded.push(msg);
  }
  return seeded;
}

const LOCAL_CHAT_MIRROR_KEY = 'bft_trader_live_chat_v1';
const CHAT_BROADCAST_CHANNEL = 'bft_trader_live_chat_sync_v1';
const MAX_CHAT_MESSAGE_LENGTH = 500;
const MAX_CACHED_MESSAGES = 100;

const URL_OR_INVITE_REGEX =
  /(?:https?:\/\/|ftp:\/\/|wss?:\/\/|www\.|t\.me\/|telegram\.me\/|wa\.me\/|discord\.gg\/|discord\.com\/invite|chat\.whatsapp\.com|youtu\.be\/|bit\.ly\/|tinyurl\.com\/|goo\.gl\/)/i;

const DOMAIN_EXTENSION_REGEX =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|io|co|me|gg|tv|app|dev|xyz|info|biz|club|vip|pro|online|site|shop|cc|lk|uk|us|ru|in|ai|link|live|ly|be|to|fm|gl|ch|de|fr|es|ca|au|jp)\b/i;

const OBFUSCATED_DOMAIN_REGEX =
  /\b[a-z0-9-]{2,}\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+)\s*(?:com|net|org|io|co|me|gg|lk|xyz|info)\b/i;

const INVITE_KEYWORD_HANDLE_REGEX =
  /\b(?:whatsapp|telegram|insta|instagram|snapchat|dm\s+me|pm\s+me|inbox\s+me|contact\s+me)\b[^a-z0-9]{0,8}(?:@?[a-z0-9_]{4,}|\+?\d{4,})/i;

const ENGLISH_PROFANITY_WORDS = [
  'fuck',
  'fucker',
  'fucking',
  'fucked',
  'motherfucker',
  'mf',
  'shit',
  'bullshit',
  'shitty',
  'bitch',
  'bitches',
  'bitching',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'dickhead',
  'cock',
  'cocksucker',
  'pussy',
  'whore',
  'slut',
  'dumbass',
  'jackass',
  'dipshit',
  'stfu',
  'gtfo',
  'retard',
  'retarded',
  'faggot',
  'fag',
  'nigger',
  'nigga',
  'kike',
  'chink',
  'spic',
  'tranny',
  'wanker',
  'twat',
  'prick',
];

const SINHALA_ROMANIZED_PROFANITY_WORDS = [
  'pakaya',
  'pakayo',
  'pakayaa',
  'pakkaya',
  'paka',
  'pako',
  'huththa',
  'huththo',
  'huththi',
  'huththige',
  'hutta',
  'hutto',
  'hutti',
  'huttige',
  'hukanna',
  'hukanawa',
  'hukapan',
  'hukahan',
  'hukana',
  'hukaganna',
  'kariya',
  'kariyaa',
  'kariyo',
  'kari',
  'wesi',
  'vesi',
  'wesige',
  'vesige',
  'wesawi',
  'wesa',
  'vesa',
  'ponnaya',
  'ponnayo',
  'ponna',
  'ballige',
  'balli',
  'ballo',
  'kimba',
  'kimbak',
  'payiya',
  'paiya',
  'payya',
  'bijja',
  'paraya',
  'parayo',
  'kalakanni',
  'kalakanniya',
  'booruwa',
  'buruwa',
  'puka',
  'puke',
  'modaya',
  'moodaya',
];

const SINHALA_UNICODE_PROFANITY_WORDS = [
  'පකයා',
  'පක',
  'පකෝ',
  'හුත්ත',
  'හුත්තා',
  'හුත්ති',
  'හුත්තෝ',
  'හුත්තිගෙ',
  'හුකන්න',
  'හුකනවා',
  'හුකපන්',
  'කැරියා',
  'කැරි',
  'වේසි',
  'වේස',
  'වේසිගේ',
  'පොන්නයා',
  'පොන්න',
  'බැල්ලි',
  'කිම්බ',
  'පයිය',
  'බිජ්ජ',
  'පුක',
  'කාලකන්නියා',
  'පරයා',
];

const ALL_LATIN_PROFANITY_REGEX = new RegExp(
  `\\b(?:${[...ENGLISH_PROFANITY_WORDS, ...SINHALA_ROMANIZED_PROFANITY_WORDS].join('|')})\\b`,
  'i'
);

const SINHALA_UNICODE_REGEX = new RegExp(
  `(?:${SINHALA_UNICODE_PROFANITY_WORDS.join('|')})`,
  'u'
);

const MASKED_PROFANITY_REGEX =
  /\b(?:f[*@#$_-]+c?k(?:ing|er|ed)?|sh[*@#$_-]+t(?:ty)?|b[*@#$_-]+tch(?:es)?|a[*@#$_-]+shole|c[*@#$_-]+nt|p[*@#$_-]+kaya|h[*@#$_-]+t+a|h[*@#$_-]+kanna|w[*@#$_-]+si|v[*@#$_-]+si|k[*@#$_-]+riya)\b/i;

/**
 * Resolves ONLY the clean sender name and avatar URL from a user profile.
 * Never exposes emails, user IDs, balances, countries, or account details.
 */
export function resolveCleanSenderIdentity(userProfile?: Partial<UserProfile> | null): CleanSenderIdentity {
  const rawFull = String(
    userProfile?.fullName || (userProfile as any)?.full_name || ''
  ).trim();

  let candidate = rawFull;

  if (!candidate || candidate.includes('@')) {
    const emailLocal = String(userProfile?.email || '').split('@')[0] || '';
    const source = candidate.includes('@') ? candidate.split('@')[0] : emailLocal;
    candidate = source
      .replace(/[._-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // Strip any accidental URLs or long digit sequences from sender display name
  candidate = candidate
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\d{5,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36);

  const senderName = candidate || 'BFT Trader';

  const rawAvatar = String(
    userProfile?.avatarUrl ||
      (userProfile as any)?.avatar_url ||
      (userProfile as any)?.avatar ||
      ''
  ).trim();

  const senderAvatarUrl = rawAvatar || DEFAULT_CHAT_AVATAR_URL;

  return {
    senderName,
    senderAvatarUrl,
  };
}

function normalizeProfanityText(input: string): string {
  const leet = input
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't')
    // Replace obfuscating punctuation inside words (e.g. f.u.c.k or f*ck -> fuck)
    .replace(/([a-z])[*._-]+(?=[a-z])/g, '$1');

  return leet;
}

function collapseRepeatedLetters(input: string): string {
  return input.replace(/([a-z])\1{2,}/g, '$1$1').replace(/([a-z])\1+/g, '$1');
}

/**
 * Detects phone numbers or long numeric sequences (7+ digits) while permitting normal trading
 * prices and quantities (e.g. "1.08543", "$200,000", "30s", "90%").
 */
export function containsBlockedPhoneOrNumber(text: string): boolean {
  // 1. Any continuous 7+ digit block
  if (/\d{7,}/.test(text)) {
    return true;
  }

  // 2. Numeric clusters separated by spaces, dashes, parentheses, dots, or plus signs
  const clusters = text.match(/(?:\+?\d[\d\s().-]{5,}\d)/g) || [];
  for (const cluster of clusters) {
    const trimmed = cluster.trim();
    // Allow normal single-decimal market quotes like "1.08543" or "2735.50" (<= 6 digits)
    if (/^\d{1,4}\.\d{1,5}$/.test(trimmed)) {
      continue;
    }
    // Allow formatted currency/numbers with commas/single spaces if under 7 digits total
    const digitCount = trimmed.replace(/\D/g, '').length;
    if (digitCount >= 7) {
      return true;
    }
  }

  return false;
}

/**
 * Strictly moderates a chat message before sending or rendering.
 * Blocks URLs/links/invites, phone numbers/7+ digit sequences, English & Sinhala profanity,
 * and unwanted spam (character floods, word floods, all-caps shouts, rapid duplicates).
 */
export function moderateChatMessage(
  rawText: string,
  recentOwnMessages: Array<{ message: string; timestampMs: number }> = [],
  nowMs: number = Date.now()
): ChatModerationResult {
  const sanitizedText = String(rawText || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitizedText) {
    return {
      allowed: false,
      sanitizedText: '',
      code: 'EMPTY',
      reason: 'Please enter a message.',
    };
  }

  if (sanitizedText.length > MAX_CHAT_MESSAGE_LENGTH) {
    return {
      allowed: false,
      sanitizedText,
      code: 'TOO_LONG',
      reason: `Message cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
    };
  }

  // 1. Links / URLs / Domains / Invites
  if (
    URL_OR_INVITE_REGEX.test(sanitizedText) ||
    DOMAIN_EXTENSION_REGEX.test(sanitizedText) ||
    OBFUSCATED_DOMAIN_REGEX.test(sanitizedText) ||
    INVITE_KEYWORD_HANDLE_REGEX.test(sanitizedText)
  ) {
    return {
      allowed: false,
      sanitizedText,
      code: 'LINK_BLOCKED',
      reason: BLOCKED_CHAT_NOTICE,
    };
  }

  // 2. Phone numbers or long number sequences (7+ digits)
  if (containsBlockedPhoneOrNumber(sanitizedText)) {
    return {
      allowed: false,
      sanitizedText,
      code: 'NUMBER_BLOCKED',
      reason: BLOCKED_CHAT_NOTICE,
    };
  }

  // 3. Profanity, slurs, or abusive words (English & Sinhala)
  const lowerRaw = sanitizedText.toLowerCase();
  const normalizedLeet = normalizeProfanityText(sanitizedText);
  const collapsedLeet = collapseRepeatedLetters(normalizedLeet);

  if (
    ALL_LATIN_PROFANITY_REGEX.test(lowerRaw) ||
    ALL_LATIN_PROFANITY_REGEX.test(normalizedLeet) ||
    ALL_LATIN_PROFANITY_REGEX.test(collapsedLeet) ||
    MASKED_PROFANITY_REGEX.test(lowerRaw) ||
    SINHALA_UNICODE_REGEX.test(sanitizedText)
  ) {
    return {
      allowed: false,
      sanitizedText,
      code: 'PROFANITY_BLOCKED',
      reason: BLOCKED_CHAT_NOTICE,
    };
  }

  // 4. Spam: character flood (6+ identical consecutive chars) or 4+ repeated words
  if (/(.)\1{5,}/iu.test(sanitizedText) || /\b([a-z0-9]+)(?:\s+\1){3,}\b/i.test(sanitizedText)) {
    return {
      allowed: false,
      sanitizedText,
      code: 'SPAM_BLOCKED',
      reason: BLOCKED_CHAT_NOTICE,
    };
  }

  // 5. Spam: All-caps shout messages (>= 15 ASCII letters and >= 85% uppercase)
  const asciiLetters = sanitizedText.replace(/[^a-zA-Z]/g, '');
  if (asciiLetters.length >= 15) {
    const upperCount = sanitizedText.replace(/[^A-Z]/g, '').length;
    if (upperCount / asciiLetters.length >= 0.85) {
      return {
        allowed: false,
        sanitizedText,
        code: 'SPAM_BLOCKED',
        reason: BLOCKED_CHAT_NOTICE,
      };
    }
  }

  // 6. Spam: duplicate or rapid-fire flood
  const recentWindow = recentOwnMessages.filter((m) => nowMs - m.timestampMs <= 30_000);
  if (
    recentWindow.some(
      (m) => m.message.trim().toLowerCase() === sanitizedText.toLowerCase()
    )
  ) {
    return {
      allowed: false,
      sanitizedText,
      code: 'SPAM_BLOCKED',
      reason: BLOCKED_CHAT_NOTICE,
    };
  }
  const veryRecentCount = recentOwnMessages.filter((m) => nowMs - m.timestampMs <= 10_000).length;
  if (veryRecentCount >= 4) {
    return {
      allowed: false,
      sanitizedText,
      code: 'SPAM_BLOCKED',
      reason: BLOCKED_CHAT_NOTICE,
    };
  }

  return {
    allowed: true,
    sanitizedText,
  };
}

export function normalizeChatMessageRow(row: any): TraderLiveChatMessage | null {
  if (!row || !row.message) return null;
  const senderNameRaw = String(row.sender_name || 'BFT Trader').trim();
  const safeName = senderNameRaw.includes('@')
    ? senderNameRaw.split('@')[0] || 'BFT Trader'
    : senderNameRaw;

  return {
    id: String(row.id || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    sender_name: safeName.slice(0, 36) || 'BFT Trader',
    sender_avatar_url: row.sender_avatar_url ? String(row.sender_avatar_url) : null,
    message: String(row.message),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

function readLocalMirrorChatMessages(): TraderLiveChatMessage[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_CHAT_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeChatMessageRow)
      .filter((m): m is TraderLiveChatMessage => Boolean(m))
      .slice(-MAX_CACHED_MESSAGES);
  } catch {
    return [];
  }
}

function writeLocalMirrorChatMessages(messages: TraderLiveChatMessage[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      LOCAL_CHAT_MIRROR_KEY,
      JSON.stringify(messages.slice(-MAX_CACHED_MESSAGES))
    );
  } catch {
    // ignore quota issues
  }
}

function broadcastLocalChatMessage(msg: TraderLiveChatMessage): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(CHAT_BROADCAST_CHANNEL);
    ch.postMessage({ type: 'NEW_CHAT_MESSAGE', message: msg });
    ch.close();
  } catch {
    // ignore
  }
}

export async function fetchTraderLiveChatMessages(
  limit: number = 80
): Promise<{ messages: TraderLiveChatMessage[]; source: 'supabase' | 'local' }> {
  try {
    const { data, error } = await supabase
      .from('trader_live_chat')
      .select('id, sender_name, sender_avatar_url, message, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data)) {
      const normalized = data
        .map(normalizeChatMessageRow)
        .filter((m): m is TraderLiveChatMessage => Boolean(m))
        .reverse();
      writeLocalMirrorChatMessages(normalized);
      return { messages: normalized, source: 'supabase' };
    }
  } catch {
    // fall back cleanly if table is unavailable offline
  }

  return {
    messages: readLocalMirrorChatMessages(),
    source: 'local',
  };
}

export async function postTraderLiveChatMessage(params: {
  rawMessage: string;
  userProfile?: Partial<UserProfile> | null;
  accounts?: TradingAccount[] | null;
  selfCapitalBalance?: number | null;
  recentOwnMessages?: Array<{ message: string; timestampMs: number }>;
}): Promise<{
  ok: boolean;
  message?: TraderLiveChatMessage;
  error?: string;
  code?: ChatModerationBlockCode | 'DB_ERROR';
}> {
  const hasBalanceContext =
    params.selfCapitalBalance !== undefined ||
    params.accounts !== undefined ||
    params.userProfile !== undefined;

  if (hasBalanceContext) {
    const chatAccess = resolvePublicChatAccess({
      userProfile: params.userProfile,
      accounts: params.accounts,
      selfCapitalBalance: params.selfCapitalBalance,
    });
    if (!chatAccess.unlocked) {
      return {
        ok: false,
        error: chatAccess.lockReason || CHAT_SELF_CAPITAL_REQUIRED_NOTICE,
        code: 'SELF_CAPITAL_REQUIRED',
      };
    }
  }

  const moderation = moderateChatMessage(params.rawMessage, params.recentOwnMessages || []);
  if (!moderation.allowed) {
    return {
      ok: false,
      error: moderation.reason || BLOCKED_CHAT_NOTICE,
      code: moderation.code,
    };
  }

  const identity = resolveCleanSenderIdentity(params.userProfile);
  const insertPayload: Record<string, any> = {
    sender_name: identity.senderName,
    sender_avatar_url: identity.senderAvatarUrl,
    message: moderation.sanitizedText,
  };

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let hasSupabaseAuthSession = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUid = sessionData?.session?.user?.id;
    if (authUid && UUID_REGEX.test(authUid)) {
      hasSupabaseAuthSession = true;
      insertPayload.user_id = authUid;
    } else if (params.userProfile?.id && UUID_REGEX.test(String(params.userProfile.id))) {
      insertPayload.user_id = String(params.userProfile.id);
    }
  } catch {
    if (params.userProfile?.id && UUID_REGEX.test(String(params.userProfile.id))) {
      insertPayload.user_id = String(params.userProfile.id);
    }
  }

  try {
    const { data, error } = await supabase
      .from('trader_live_chat')
      .insert(insertPayload)
      .select('id, sender_name, sender_avatar_url, message, created_at')
      .single();

    if (!error && data) {
      const normalized = normalizeChatMessageRow(data);
      if (normalized) {
        const existing = readLocalMirrorChatMessages();
        if (!existing.some((m) => m.id === normalized.id)) {
          writeLocalMirrorChatMessages([...existing, normalized]);
        }
        return { ok: true, message: normalized };
      }
    }

    if (error) {
      const errMsg = String(error.message || '');
      // Surface database-level moderation trigger rejections directly to the user
      if (
        error.code === '23514' ||
        errMsg.toLowerCase().includes('automatically blocked') ||
        errMsg.toLowerCase().includes('cannot exceed') ||
        errMsg.toLowerCase().includes('cannot be empty')
      ) {
        return {
          ok: false,
          error: BLOCKED_CHAT_NOTICE,
          code: 'SPAM_BLOCKED',
        };
      }

      // If table hasn't been provisioned or preview session lacks a Supabase Auth JWT,
      // store locally + broadcast across tabs while still enforcing full client moderation.
      if (
        errMsg.includes('Could not find the table') ||
        errMsg.includes('does not exist') ||
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        (error.code === '42501' && !hasSupabaseAuthSession)
      ) {
        const localMsg: TraderLiveChatMessage = {
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          sender_name: identity.senderName,
          sender_avatar_url: identity.senderAvatarUrl,
          message: moderation.sanitizedText,
          created_at: new Date().toISOString(),
        };
        const existing = readLocalMirrorChatMessages();
        writeLocalMirrorChatMessages([...existing, localMsg]);
        broadcastLocalChatMessage(localMsg);
        return { ok: true, message: localMsg };
      }

      return {
        ok: false,
        error: 'Unable to send message right now. Please try again.',
        code: 'DB_ERROR',
      };
    }
  } catch {
    const localMsg: TraderLiveChatMessage = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sender_name: identity.senderName,
      sender_avatar_url: identity.senderAvatarUrl,
      message: moderation.sanitizedText,
      created_at: new Date().toISOString(),
    };
    const existing = readLocalMirrorChatMessages();
    writeLocalMirrorChatMessages([...existing, localMsg]);
    broadcastLocalChatMessage(localMsg);
    return { ok: true, message: localMsg };
  }

  return { ok: false, error: 'Unable to send message.', code: 'DB_ERROR' };
}

export function subscribeToTraderLiveChatRealtime(
  onNewMessage: (message: TraderLiveChatMessage) => void
): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let bc: BroadcastChannel | null = null;

  try {
    channel = supabase
      .channel(`bft-trader-live-chat-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trader_live_chat',
        },
        (payload) => {
          const normalized = normalizeChatMessageRow(payload?.new);
          if (normalized) {
            onNewMessage(normalized);
          }
        }
      )
      .subscribe();
  } catch {
    // ignore realtime init failure
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(CHAT_BROADCAST_CHANNEL);
      bc.onmessage = (ev) => {
        if (ev?.data?.type === 'NEW_CHAT_MESSAGE' && ev.data.message) {
          const normalized = normalizeChatMessageRow(ev.data.message);
          if (normalized) {
            onNewMessage(normalized);
          }
        }
      };
    } catch {
      // ignore
    }
  }

  return () => {
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    }
    if (bc) {
      try {
        bc.close();
      } catch {
        // ignore
      }
    }
  };
}
