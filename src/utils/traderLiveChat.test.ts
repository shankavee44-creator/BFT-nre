import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKED_CHAT_NOTICE,
  DEFAULT_CHAT_AVATAR_URL,
  containsBlockedPhoneOrNumber,
  moderateChatMessage,
  normalizeChatMessageRow,
  resolveCleanSenderIdentity,
} from './traderLiveChat.ts';

test('resolveCleanSenderIdentity strips emails/digits and returns only clean name + avatar', () => {
  const id1 = resolveCleanSenderIdentity({
    id: 'usr_secret_12345',
    email: 'ishan.kavisha@gmail.com',
    fullName: 'Ishan Kavisha',
    avatarUrl: 'https://cdn.example.com/avatar.png',
    liveBalance: 50000,
  } as any);
  assert.equal(id1.senderName, 'Ishan Kavisha');
  assert.equal(id1.senderAvatarUrl, 'https://cdn.example.com/avatar.png');
  assert.equal((id1 as any).email, undefined);
  assert.equal((id1 as any).id, undefined);
  assert.equal((id1 as any).liveBalance, undefined);

  // If fullName is missing or is an email, strips @domain cleanly
  const id2 = resolveCleanSenderIdentity({
    email: 'kasun.perera@gmail.com',
    fullName: 'kasun.perera@gmail.com',
  } as any);
  assert.equal(id2.senderName, 'Kasun Perera');
  assert.equal(id2.senderAvatarUrl, DEFAULT_CHAT_AVATAR_URL);
});

test('moderateChatMessage allows normal binary trading discussions and market quotes', () => {
  const validMessages = [
    'EUR/USD looking bullish on the 1m timeframe',
    'Entered CALL on XAU/USD at 2735.50 with 60s expiry',
    'Clean win on GBP/JPY OTC +92% payout!',
    'Watching 1.08543 support zone carefully',
    'Up $450 today on $10,000 challenge, 3/5 days done',
    'EUR/USD CALL',
  ];

  for (const msg of validMessages) {
    const res = moderateChatMessage(msg);
    assert.equal(res.allowed, true, `Expected valid message to pass: "${msg}"`);
  }
});

test('moderateChatMessage blocks URLs, domains, Telegram/WhatsApp/Discord invites', () => {
  const linkSamples = [
    'Join https://t.me/myvipchannel',
    'Check http://example.com/signals',
    'Visit www.besttrades.io for free alerts',
    'DM on t.me/bft_signals',
    'Message me wa.me/94771234567',
    'Join discord.gg/tradingvip',
    'Go to signals.xyz right now',
    'Search mysite [dot] com for strategy',
  ];

  for (const msg of linkSamples) {
    const res = moderateChatMessage(msg);
    assert.equal(res.allowed, false, `Expected link message to be blocked: "${msg}"`);
    assert.equal(res.code, 'LINK_BLOCKED');
    assert.equal(res.reason, BLOCKED_CHAT_NOTICE);
  }
});

test('moderateChatMessage blocks phone numbers and 7+ digit sequences', () => {
  const numberSamples = [
    'Call me 0771234567',
    'WhatsApp +94 77 123 4567',
    'Reach me at 077-123-4567',
    'My number is (555) 123-4567',
    'Code 1234567',
    '0 7 7 1 2 3 4 5 6 7',
  ];

  for (const msg of numberSamples) {
    assert.equal(containsBlockedPhoneOrNumber(msg), true, `Expected number blocked: "${msg}"`);
    const res = moderateChatMessage(msg);
    assert.equal(res.allowed, false);
    assert.equal(res.code, 'NUMBER_BLOCKED');
    assert.equal(res.reason, BLOCKED_CHAT_NOTICE);
  }
});

test('moderateChatMessage blocks English and Sinhala profanity/slurs including leetspeak and Unicode', () => {
  const profaneSamples = [
    'This market is fucking rigged',
    'You are an asshole',
    'f*ck this candle',
    'sh1t trade',
    'ado pakaya',
    'umbata pissuda huththa',
    'kariya yanna',
    'wesi putha',
    'ponnaya',
    'පකයා',
    'හුත්තෝ',
    'වේසි',
  ];

  for (const msg of profaneSamples) {
    const res = moderateChatMessage(msg);
    assert.equal(res.allowed, false, `Expected profanity blocked: "${msg}"`);
    assert.equal(res.code, 'PROFANITY_BLOCKED');
    assert.equal(res.reason, BLOCKED_CHAT_NOTICE);
  }

  // Ensure clean words like "pass", "classic", "asset" are NOT blocked (no Scunthorpe false positives)
  assert.equal(moderateChatMessage('Great asset selection and classic breakout pass!').allowed, true);
});

test('moderateChatMessage blocks character floods, repeated words, all-caps shouts, and rapid duplicates', () => {
  assert.equal(moderateChatMessage('heyyyyyyyyy traders').code, 'SPAM_BLOCKED');
  assert.equal(moderateChatMessage('buy buy buy buy now').code, 'SPAM_BLOCKED');
  assert.equal(
    moderateChatMessage('EVERYONE BUY EURUSD RIGHT NOW HUGE PROFIT').code,
    'SPAM_BLOCKED'
  );

  const now = 1_700_000_000_000;
  const recent = [{ message: 'EUR/USD looking strong', timestampMs: now - 5_000 }];
  const dup = moderateChatMessage('eur/usd looking strong', recent, now);
  assert.equal(dup.allowed, false);
  assert.equal(dup.code, 'SPAM_BLOCKED');
});

test('normalizeChatMessageRow exposes only public chat fields without emails or user IDs', () => {
  const row = normalizeChatMessageRow({
    id: 'msg-1',
    user_id: 'usr-private-id',
    email: 'private@email.com',
    balance: 25000,
    sender_name: 'Nimal@gmail.com',
    sender_avatar_url: null,
    message: 'Bullish momentum on Gold',
    created_at: '2026-11-24T10:00:00Z',
  });
  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), [
    'created_at',
    'id',
    'message',
    'sender_avatar_url',
    'sender_name',
  ]);
  assert.equal(row.sender_name, 'Nimal');
});

test('resolvePublicChatAccess locks public chat when Self Capital balance is $0 and unlocks when > 0', async () => {
  const {
    CHAT_SELF_CAPITAL_REQUIRED_NOTICE,
    resolvePublicChatAccess,
    postTraderLiveChatMessage,
  } = await import('./traderLiveChat.ts');

  const lockedZero = resolvePublicChatAccess({
    userProfile: { id: 'u1', selfBalance: 0 },
    accounts: [{ id: 'acc-1', tier: 'personal', accountCategory: 'personal_live', currentBalance: 0 } as any],
  });
  assert.equal(lockedZero.unlocked, false);
  assert.equal(lockedZero.selfCapitalBalance, 0);
  assert.equal(lockedZero.lockReason, CHAT_SELF_CAPITAL_REQUIRED_NOTICE);

  const unlockedFromProfile = resolvePublicChatAccess({
    userProfile: { id: 'u1', selfBalance: 50 },
    accounts: [],
  });
  assert.equal(unlockedFromProfile.unlocked, true);
  assert.equal(unlockedFromProfile.selfCapitalBalance, 50);
  assert.equal(unlockedFromProfile.lockReason, null);

  const unlockedFromPersonalAcc = resolvePublicChatAccess({
    userProfile: { id: 'u1', selfBalance: 0 },
    accounts: [{ id: 'acc-1', tier: 'personal', accountCategory: 'personal_live', currentBalance: 25 } as any],
  });
  assert.equal(unlockedFromPersonalAcc.unlocked, true);
  assert.equal(unlockedFromPersonalAcc.selfCapitalBalance, 25);

  const blockedPost = await postTraderLiveChatMessage({
    rawMessage: 'EUR/USD looking bullish on the 1m chart',
    userProfile: { id: 'u1', fullName: 'Nimal', selfBalance: 0 },
    accounts: [],
  });
  assert.equal(blockedPost.ok, false);
  assert.equal(blockedPost.code, 'SELF_CAPITAL_REQUIRED');
  assert.equal(blockedPost.error, CHAT_SELF_CAPITAL_REQUIRED_NOTICE);
});

test('ambient community chat messages pass moderation, stay within 25-75s interval, and avoid back-to-back repeats', async () => {
  const {
    AMBIENT_CHAT_MAX_DELAY_MS,
    AMBIENT_CHAT_MIN_DELAY_MS,
    AMBIENT_COMMUNITY_MESSAGES,
    createInitialAmbientSeedMessages,
    getNextAmbientChatDelayMs,
    pickNextAmbientChatMessage,
  } = await import('./traderLiveChat.ts');

  for (const msg of AMBIENT_COMMUNITY_MESSAGES) {
    const check = moderateChatMessage(msg);
    assert.equal(check.allowed, true, `Ambient message must pass moderation: "${msg}"`);
  }

  assert.equal(getNextAmbientChatDelayMs(() => 0), AMBIENT_CHAT_MIN_DELAY_MS);
  assert.ok(
    getNextAmbientChatDelayMs(() => 0.999) <= AMBIENT_CHAT_MAX_DELAY_MS &&
      getNextAmbientChatDelayMs(() => 0.999) >= AMBIENT_CHAT_MIN_DELAY_MS
  );

  const seeded = createInitialAmbientSeedMessages(3, 1_700_000_000_000, () => 0.25);
  assert.equal(seeded.length, 3);
  assert.equal(new Set(seeded.map((m) => m.message)).size, 3);
  assert.equal(new Set(seeded.map((m) => m.sender_name)).size, 3);

  const nextMsg = pickNextAmbientChatMessage({
    recentMessages: seeded,
    nowMs: 1_700_000_060_000,
    rng: () => 0.25,
  });
  assert.ok(!seeded.some((m) => m.message === nextMsg.message));
  assert.ok(!seeded.some((m) => m.sender_name === nextMsg.sender_name));
});

