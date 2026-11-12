import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_TOUR_STEPS,
  isUserOnboardingCompleted,
  markLocalOnboardingCompleted,
  clearLocalOnboardingCompleted,
  shouldShowOnboardingTour,
  resolveNextTourStepIndex,
  persistOnboardingCompletedToSupabase,
} from './onboardingTour.ts';

test('Onboarding Tour defines the exact 6 required guided steps in sequence', () => {
  assert.equal(ONBOARDING_TOUR_STEPS.length, 6);

  assert.equal(ONBOARDING_TOUR_STEPS[0].stepNumber, 1);
  assert.equal(ONBOARDING_TOUR_STEPS[0].id, 'welcome');
  assert.ok(ONBOARDING_TOUR_STEPS[0].title.includes('Welcome'));

  assert.equal(ONBOARDING_TOUR_STEPS[1].stepNumber, 2);
  assert.equal(ONBOARDING_TOUR_STEPS[1].id, 'terminal');
  assert.ok(ONBOARDING_TOUR_STEPS[1].title.includes('Trading Terminal'));

  assert.equal(ONBOARDING_TOUR_STEPS[2].stepNumber, 3);
  assert.equal(ONBOARDING_TOUR_STEPS[2].id, 'leaderboard');
  assert.ok(ONBOARDING_TOUR_STEPS[2].title.includes('Leaderboard'));

  assert.equal(ONBOARDING_TOUR_STEPS[3].stepNumber, 4);
  assert.equal(ONBOARDING_TOUR_STEPS[3].id, 'deposits');
  assert.ok(ONBOARDING_TOUR_STEPS[3].title.includes('NOWPayments'));

  assert.equal(ONBOARDING_TOUR_STEPS[4].stepNumber, 5);
  assert.equal(ONBOARDING_TOUR_STEPS[4].id, 'copy_trading');
  assert.ok(ONBOARDING_TOUR_STEPS[4].title.includes('Copy Trading'));

  assert.equal(ONBOARDING_TOUR_STEPS[5].stepNumber, 6);
  assert.equal(ONBOARDING_TOUR_STEPS[5].id, 'security_kyc');
  assert.ok(
    ONBOARDING_TOUR_STEPS[5].title.includes('2FA') &&
      ONBOARDING_TOUR_STEPS[5].title.includes('KYC')
  );
});

test('resolveNextTourStepIndex advances forward, steps backward, and marks completion after Step 6', () => {
  // Step 1 (index 0) -> Back stays at 0
  const backAtStart = resolveNextTourStepIndex({ currentIndex: 0, action: 'back' });
  assert.equal(backAtStart.nextIndex, 0);
  assert.equal(backAtStart.isCompleted, false);

  // Step 1 -> Step 2
  const toStep2 = resolveNextTourStepIndex({ currentIndex: 0, action: 'next' });
  assert.equal(toStep2.nextIndex, 1);
  assert.equal(toStep2.isCompleted, false);

  // Step 5 (index 4) -> Step 6 (index 5)
  const toStep6 = resolveNextTourStepIndex({ currentIndex: 4, action: 'next' });
  assert.equal(toStep6.nextIndex, 5);
  assert.equal(toStep6.isCompleted, false);

  // Step 6 (index 5) -> Next completes the tour
  const completeFromStep6 = resolveNextTourStepIndex({ currentIndex: 5, action: 'next' });
  assert.equal(completeFromStep6.isCompleted, true);
});

test('shouldShowOnboardingTour triggers on first login and suppresses once onboarding_completed is true', () => {
  const testUser = {
    id: '11111111-2222-4333-8444-555555555555',
    email: 'newtrader@bft.io',
    isLoggedIn: true,
    onboarding_completed: false,
  };

  clearLocalOnboardingCompleted({ userId: testUser.id, email: testUser.email });

  // Unauthenticated user does not trigger tour
  assert.equal(
    shouldShowOnboardingTour({ profile: { ...testUser, isLoggedIn: false } }),
    false
  );

  // Logged-in first-time user triggers tour
  assert.equal(shouldShowOnboardingTour({ profile: testUser }), true);

  // ?autostart=1 suppresses automatic intro popup unless forceTourParam is set
  assert.equal(
    shouldShowOnboardingTour({ profile: testUser, isAutostart: true }),
    false
  );
  assert.equal(
    shouldShowOnboardingTour({ profile: testUser, isAutostart: true, forceTourParam: true }),
    true
  );

  // Profile with onboarding_completed: true does not trigger tour
  assert.equal(
    shouldShowOnboardingTour({
      profile: { ...testUser, onboarding_completed: true },
    }),
    false
  );
});

test('persistOnboardingCompletedToSupabase updates Supabase profiles table with onboarding_completed: true and persists locally', async () => {
  const userId = '99999999-8888-4777-8666-555555555555';
  const email = 'verified_onboard@bft.io';
  clearLocalOnboardingCompleted({ userId, email });

  let capturedTable = '';
  let capturedPayload: Record<string, any> | null = null;
  let capturedFilterCol = '';
  let capturedFilterVal = '';

  const mockSupabase = {
    from: (table: string) => {
      capturedTable = table;
      return {
        update: (payload: Record<string, any>) => {
          capturedPayload = payload;
          return {
            eq: (col: string, val: string) => {
              capturedFilterCol = col;
              capturedFilterVal = val;
              return {
                select: async () => ({
                  data: [{ id: userId, onboarding_completed: true }],
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  assert.equal(isUserOnboardingCompleted({ id: userId, email }), false);

  const res = await persistOnboardingCompletedToSupabase({
    userId,
    email,
    supabaseClient: mockSupabase,
  });

  assert.equal(res.ok, true);
  assert.equal(res.updatedInSupabase, true);
  assert.equal(capturedTable, 'profiles');
  assert.deepEqual(capturedPayload, { onboarding_completed: true });
  assert.equal(capturedFilterCol, 'id');
  assert.equal(capturedFilterVal, userId);
  assert.equal(isUserOnboardingCompleted({ id: userId, email }), true);
});
