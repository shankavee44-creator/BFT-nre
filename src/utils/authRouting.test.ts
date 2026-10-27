import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRouteProtected,
  canAccessRoute,
  resolveTargetRoute,
  validateSessionToken,
  PUBLIC_ROUTES,
  PROTECTED_ROUTES,
} from './authRouting';

test('isRouteProtected correctly distinguishes public vs protected routes', () => {
  for (const pub of PUBLIC_ROUTES) {
    assert.strictEqual(isRouteProtected(pub), false, `Public route ${pub} should not be protected`);
  }

  for (const prot of PROTECTED_ROUTES) {
    assert.strictEqual(isRouteProtected(prot), true, `Route ${prot} should be marked as protected`);
  }

  assert.strictEqual(isRouteProtected('unknown-page'), false);
});

test('canAccessRoute permits public pages to unauthenticated users', () => {
  assert.strictEqual(canAccessRoute('home', false), true);
  assert.strictEqual(canAccessRoute('rules', false), true);
  assert.strictEqual(canAccessRoute('faq', false), true);
});

test('canAccessRoute blocks protected pages to unauthenticated users', () => {
  assert.strictEqual(canAccessRoute('terminal', false), false);
  assert.strictEqual(canAccessRoute('dashboard', false), false);
  assert.strictEqual(canAccessRoute('affiliate', false), false);
  assert.strictEqual(canAccessRoute('withdrawals', false), false);
});

test('canAccessRoute grants access to all routes when user is logged in', () => {
  assert.strictEqual(canAccessRoute('terminal', true), true);
  assert.strictEqual(canAccessRoute('dashboard', true), true);
  assert.strictEqual(canAccessRoute('affiliate', true), true);
  assert.strictEqual(canAccessRoute('withdrawals', true), true);
  assert.strictEqual(canAccessRoute('home', true), true);
});

test('resolveTargetRoute redirects unauthenticated attempts to landing page with security prompt', () => {
  const result = resolveTargetRoute('terminal', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.destinationRoute, 'home');
  assert.strictEqual(result.shouldPromptAuth, true);
  assert.strictEqual(result.promptMode, 'login');
  assert.match(result.securityNotice || '', /Live OTC Trading Terminal/);
});

test('resolveTargetRoute allows authenticated access without redirect or modal prompt', () => {
  const result = resolveTargetRoute('terminal', true);
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.destinationRoute, 'terminal');
  assert.strictEqual(result.shouldPromptAuth, false);
});

test('validateSessionToken validates JWT expiration and payload format', () => {
  // Empty or invalid tokens
  assert.strictEqual(validateSessionToken(''), false);
  assert.strictEqual(validateSessionToken('invalid.token'), false);
  assert.strictEqual(validateSessionToken(null), false);

  // Valid active token
  const validHeader = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const validPayload = btoa(
    JSON.stringify({
      sub: 'usr_bft_test',
      email: 'test@bft-capital.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  );
  const activeToken = `${validHeader}.${validPayload}.sig_hash_mock`;
  assert.strictEqual(validateSessionToken(activeToken), true);

  // Expired token
  const expiredPayload = btoa(
    JSON.stringify({
      sub: 'usr_bft_test',
      email: 'test@bft-capital.com',
      exp: Math.floor(Date.now() / 1000) - 100,
    })
  );
  const expiredToken = `${validHeader}.${expiredPayload}.sig_hash_mock`;
  assert.strictEqual(validateSessionToken(expiredToken), false);
});
