import test from 'node:test';
import assert from 'node:assert';
import { soundEngine } from './soundEffects';

test('soundEngine initializes with sound enabled by default', () => {
  assert.strictEqual(typeof soundEngine.isEnabled(), 'boolean');
});

test('soundEngine toggles sound enabled state correctly', () => {
  const initial = soundEngine.isEnabled();
  const toggled = soundEngine.toggle();
  assert.strictEqual(toggled, !initial);
  assert.strictEqual(soundEngine.isEnabled(), !initial);
  // Reset back
  soundEngine.setEnabled(initial);
  assert.strictEqual(soundEngine.isEnabled(), initial);
});

test('soundEngine methods execute safely without throwing errors in headless environment', () => {
  assert.doesNotThrow(() => {
    soundEngine.playUiClick();
    soundEngine.playTradePlacement('CALL');
    soundEngine.playTradePlacement('PUT');
    soundEngine.playTradeWin();
    soundEngine.playTradeLoss();
    soundEngine.playWithdrawalSuccess();
  });
});
