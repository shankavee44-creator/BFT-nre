import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCertificateDate,
  formatCertificateSubtitle,
  calculateNameFontSize,
  isUserEligibleForCertificate,
  CERTIFICATE_CONSTANTS,
} from './certificateGenerator';

test('formatCertificateDate formats date into uppercase prop-firm format', () => {
  const d = new Date(2026, 9, 24); // 24 October 2026
  assert.equal(formatCertificateDate(d), '24 OCTOBER 2026');

  const formattedStr = formatCertificateDate('2026-10-24T12:00:00Z');
  assert.ok(formattedStr.includes('OCTOBER 2026'));

  // Test fallback on empty/null returns current month and year
  const defaultDate = formatCertificateDate(null);
  assert.match(defaultDate, /\d{2}\s+[A-Z]+\s+\d{4}/);
});

test('formatCertificateSubtitle produces exact matching requirement text', () => {
  const sub = formatCertificateSubtitle('24 OCTOBER 2026');
  assert.equal(sub, 'WHO ON THIS DAY 24 OCTOBER 2026');

  const sub2 = formatCertificateSubtitle('02 NOVEMBER 2026');
  assert.equal(sub2, 'WHO ON THIS DAY 02 NOVEMBER 2026');
});

test('calculateNameFontSize scales long names appropriately without clipping', () => {
  const shortName = 'ALEX MORGAN';
  const shortSize = calculateNameFontSize(shortName);
  assert.equal(shortSize, CERTIFICATE_CONSTANTS.BASE_FONT_SIZE);

  const longName = 'MAXIMILIAN ALEXANDER VON HOHENZOLLERN-WALDENBURG';
  const longSize = calculateNameFontSize(longName);
  assert.ok(longSize < CERTIFICATE_CONSTANTS.BASE_FONT_SIZE);
  assert.ok(longSize >= CERTIFICATE_CONSTANTS.MIN_FONT_SIZE);
});

test('isUserEligibleForCertificate detects passed and funded accounts in Supabase status', () => {
  // Test direct Supabase status: 'funded'
  const fundedRes = isUserEligibleForCertificate({ supabaseAccountStatus: 'funded' });
  assert.equal(fundedRes.eligible, true);
  assert.ok(fundedRes.reason?.includes('funded'));

  // Test direct Supabase status: 'passed'
  const passedRes = isUserEligibleForCertificate({ supabaseAccountStatus: 'passed' });
  assert.equal(passedRes.eligible, true);

  // Test profile.is_funded flag
  const profRes = isUserEligibleForCertificate({ profile: { is_funded: true } });
  assert.equal(profRes.eligible, true);

  // Test profile.fundedBalance
  const balRes = isUserEligibleForCertificate({ profile: { fundedBalance: 25000 } });
  assert.equal(balRes.eligible, true);

  // Test accounts list with passed challenge
  const accRes = isUserEligibleForCertificate({
    accounts: [
      { id: 'BFT-DEMO', status: 'active', tier: 'demo' },
      { id: 'BFT-77281', status: 'passed', tier: 'two-step', tierName: '02-Step $100K Challenge' }
    ]
  });
  assert.equal(accRes.eligible, true);
  assert.equal(accRes.matchingAccountId, 'BFT-77281');

  // Test accounts list with instant funded
  const instantRes = isUserEligibleForCertificate({
    accounts: [
      { id: 'BFT-INST-99', status: 'active', tier: 'instant', tierName: 'Instant Funded $50K' }
    ]
  });
  assert.equal(instantRes.eligible, true);

  // Test unpassed evaluation
  const unpassedRes = isUserEligibleForCertificate({
    accounts: [
      { id: 'BFT-EVAL-1', status: 'active', tier: 'one-step' }
    ]
  });
  assert.equal(unpassedRes.eligible, false);
});

test('certificate constants match high-res 1920x1357 specification', () => {
  assert.equal(CERTIFICATE_CONSTANTS.WIDTH, 1920);
  assert.equal(CERTIFICATE_CONSTANTS.HEIGHT, 1357);
  assert.equal(CERTIFICATE_CONSTANTS.CENTER_X, 960);
  assert.equal(CERTIFICATE_CONSTANTS.GOLD_START, '#f5b963');
  assert.equal(CERTIFICATE_CONSTANTS.GOLD_END, '#c88a32');
  assert.equal(CERTIFICATE_CONSTANTS.DEFAULT_TEMPLATE_PATH, '/certificate-template.png');
});
