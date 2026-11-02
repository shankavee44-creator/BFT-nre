import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLocalFallbackReply,
  generateSupportChatReply,
  BFT_SUPPORT_SYSTEM_INSTRUCTION,
} from './aiChatService.ts';

test('generateLocalFallbackReply provides accurate answers to prop trading queries', () => {
  const step1 = generateLocalFallbackReply('tell me about 1-step challenge');
  assert.match(step1, /30%/);
  assert.match(step1, /10%/);
  assert.match(step1, /15%/);

  const step2 = generateLocalFallbackReply('what are the rules for 2-step?');
  assert.match(step2, /Phase 1 Target/);
  assert.match(step2, /25%/);
  assert.match(step2, /Phase 2 Target/);
  assert.match(step2, /15%/);

  const promo = generateLocalFallbackReply('what is the promo code?');
  assert.match(promo, /SPOOKY40/);
  assert.match(promo, /SPOOKY20/);

  const demo = generateLocalFallbackReply('how do I change my demo balance?');
  assert.match(demo, /\$1\.00/);
  assert.match(demo, /\$10,000\.00/);
});

test('generateSupportChatReply safely returns a string response without throwing', async () => {
  const reply = await generateSupportChatReply('Hello, what are your payout rules?');
  assert.equal(typeof reply, 'string');
  assert.ok(reply.length > 20);
});

test('BFT_SUPPORT_SYSTEM_INSTRUCTION contains full prop firm knowledge base', () => {
  assert.ok(BFT_SUPPORT_SYSTEM_INSTRUCTION.includes('01-Step Challenge'));
  assert.ok(BFT_SUPPORT_SYSTEM_INSTRUCTION.includes('02-Step Challenge'));
  assert.ok(BFT_SUPPORT_SYSTEM_INSTRUCTION.includes('Instant Funded Account'));
  assert.ok(BFT_SUPPORT_SYSTEM_INSTRUCTION.includes('TRC-20'));
  assert.ok(BFT_SUPPORT_SYSTEM_INSTRUCTION.includes('SPOOKY40'));
});
