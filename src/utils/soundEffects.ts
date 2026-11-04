/**
 * Web Audio API Sound Effects & Mobile Haptic Feedback Engine (Vibration API)
 * for Binary Funded Trader (BFT)
 * Ultra-lightweight, zero-latency synthesized audio + tactile mobile vibration patterns.
 */

export const HAPTIC_PATTERNS = {
  uiTap: 10,
  tradeEntryCall: [22, 30, 35] as number[],
  tradeEntryPut: [35, 30, 22] as number[],
  withdrawalRequest: [20, 40, 25] as number[],
  withdrawalSuccess: [30, 45, 40, 45, 70] as number[],
  tradeWin: [25, 35, 50] as number[],
  tradeLoss: 45,
  errorAlert: [50, 40, 50] as number[],
};

/**
 * Safely triggers the Web Vibration API on supported mobile browsers/devices.
 * Returns true if navigator.vibrate was invoked, false otherwise.
 */
export function triggerHapticFeedback(
  pattern: number | number[],
  nav?: { vibrate?: (p: number | number[]) => boolean }
): boolean {
  try {
    const targetNav = nav || (typeof navigator !== 'undefined' ? navigator : undefined);
    if (targetNav && typeof targetNav.vibrate === 'function') {
      return Boolean(targetNav.vibrate(pattern));
    }
  } catch {
    // Ignore policies blocking vibration prior to user gesture or unsupported contexts
  }
  return false;
}

class SoundEffectsEngine {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private hapticsEnabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bft_sound_enabled');
      this.soundEnabled = saved !== null ? saved === 'true' : true;
      const savedHaptics = localStorage.getItem('bft_haptics_enabled');
      this.hapticsEnabled = savedHaptics !== null ? savedHaptics === 'true' : true;
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('bft_sound_enabled', enabled ? 'true' : 'false');
      window.dispatchEvent(new CustomEvent('bft-sound-toggle', { detail: { enabled } }));
    }
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('bft_haptics_enabled', enabled ? 'true' : 'false');
    }
  }

  public vibrate(pattern: number | number[] = HAPTIC_PATTERNS.uiTap): boolean {
    if (!this.hapticsEnabled) return false;
    return triggerHapticFeedback(pattern);
  }

  public toggle(): boolean {
    const newState = !this.soundEnabled;
    this.setEnabled(newState);
    if (newState) {
      this.playUiClick();
    }
    return newState;
  }

  /**
   * UI Click / Tap Sound + Light Tactile Haptic Tap
   */
  public playUiClick(): void {
    this.vibrate(HAPTIC_PATTERNS.uiTap);
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.025);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.03);
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Trade Placement Sound & Directional Tactile Haptic Pulse:
   * Distinct double-pulse vibration for CALL (Buy) vs PUT (Sell) trade entry.
   */
  public playTradePlacement(direction: 'CALL' | 'PUT' = 'CALL'): void {
    this.vibrate(
      direction === 'CALL'
        ? HAPTIC_PATTERNS.tradeEntryCall
        : HAPTIC_PATTERNS.tradeEntryPut
    );
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Different tonal personality for CALL (ascending snap) vs PUT (descending punch)
      if (direction === 'CALL') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(950, now + 0.08);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);
      }

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Trade Win Sound + Rewarding Haptic Pulse
   */
  public playTradeWin(): void {
    this.vibrate(HAPTIC_PATTERNS.tradeWin);
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Institutional major triad arpeggio + shimmering octave: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const noteTime = now + i * 0.07;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(0.2, noteTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.6);
      });
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Trade Loss Sound + Muted Haptic Pulse
   */
  public playTradeLoss(): void {
    this.vibrate(HAPTIC_PATTERNS.tradeLoss);
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Gentle descending two-tone: 380Hz down to 260Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.22);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Withdrawal Request Initiation Haptic & Sound Feedback
   */
  public triggerWithdrawalHaptic(): void {
    this.vibrate(HAPTIC_PATTERNS.withdrawalRequest);
  }

  /**
   * Withdrawal Request Confirmed Sound + Celebratory Multi-Pulse Haptic Feedback
   */
  public playWithdrawalSuccess(): void {
    this.vibrate(HAPTIC_PATTERNS.withdrawalSuccess);
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Fanfare sequence: G4 (392Hz), C5 (523Hz), E5 (659Hz), G5 (784Hz)
      const notes = [392, 523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const noteStart = now + idx * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.22, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + 0.75);
      });
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Error Alert Sound + Double-Buzz Warning Haptic
   */
  public playErrorAlert(): void {
    this.vibrate(HAPTIC_PATTERNS.errorAlert);
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(180, now + 0.1);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.26);
    } catch {
      // AudioContext policy fallback
    }
  }
}

export const soundEngine = new SoundEffectsEngine();
