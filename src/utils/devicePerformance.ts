/**
 * Binary Funded Trader (BFT) - Device Performance & Adaptive Hardware Optimization Engine
 *
 * Detects whether the current client is a Budget / Low-End mobile device or a High-End device,
 * and dynamically manages performance settings:
 *
 * 1. Low-End Mobile:
 *    - Automatically disables heavy CSS backdrop-filters (blur) and complex multi-layer box shadows.
 *    - Reduces TradingView/Canvas buffer size (160 bars vs 500 bars) and throttles coordinate updates.
 *    - Pauses non-essential CSS keyframe animations (floating, marquees, particle pulses) to preserve CPU/battery.
 *
 * 2. High-End Mobile & Desktop:
 *    - Enables crisp glassmorphism UI, 60fps/120fps fluid transitions, and full deep historical candle memory.
 *    - Optimized touch gestures with zero-latency manipulation and momentum coasting.
 */

import { useState, useEffect } from 'react';

export type PerformanceTier = 'low' | 'high';
export type PerformancePreference = 'auto' | 'low' | 'high';

export const PERF_STORAGE_KEY = 'bft_perf_preference_v1';

export interface DevicePerformanceProfile {
  tier: PerformanceTier;
  isLowEnd: boolean;
  isHighEnd: boolean;
  isMobile: boolean;
  hardwareConcurrency: number;
  deviceMemoryGb?: number;
  saveDataEnabled: boolean;
  prefersReducedMotion: boolean;
  recommendedMaxCandles: number;
  chartUpdateThrottleMs: number;
  backdropBlurEnabled: boolean;
  highFpsAnimationsEnabled: boolean;
}

/**
 * Detects hardware capability using standard Web APIs.
 */
export function detectDevicePerformanceTier(): PerformanceTier {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'high';
  }

  // Check manual user override in localStorage
  try {
    const saved = localStorage.getItem(PERF_STORAGE_KEY) as PerformancePreference | null;
    if (saved === 'low' || saved === 'high') {
      return saved;
    }
  } catch {
    // ignore
  }

  // 1. Data-saver mode implies budget / bandwidth-constrained mobile device
  const connection = (navigator as any).connection;
  if (connection && (connection.saveData === true || connection.effectiveType === '2g' || connection.effectiveType === '3g')) {
    return 'low';
  }

  // 2. Prefers reduced motion requested by user
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'low';
  }

  // 3. CPU Core Count (Budget mobile devices typically have <= 4 weak cores)
  const cores = navigator.hardwareConcurrency || 4;

  // 4. Device Memory API (Chrome/Android: navigator.deviceMemory in GB)
  const memoryGb = (navigator as any).deviceMemory;

  const isSmallScreen = window.innerWidth <= 768;
  const isTouchDevice = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  // If memory is known and <= 4GB on a touch/mobile device, classify as low-end
  if (typeof memoryGb === 'number' && memoryGb <= 4 && (isSmallScreen || isTouchDevice)) {
    return 'low';
  }

  // If cores <= 4 on a mobile device, classify as low-end
  if (cores <= 4 && (isSmallScreen || isTouchDevice)) {
    return 'low';
  }

  // High-End (modern flagship phones, high-core tablets, desktop workstations)
  return 'high';
}

/**
 * Returns full configuration parameters for the current device performance profile.
 */
export function getDevicePerformanceProfile(preference?: PerformancePreference): DevicePerformanceProfile {
  const isMobile =
    typeof window !== 'undefined'
      ? window.innerWidth <= 768 || 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
      : false;

  let activeTier: PerformanceTier;
  if (preference === 'low' || preference === 'high') {
    activeTier = preference;
  } else {
    activeTier = detectDevicePerformanceTier();
  }

  const isLowEnd = activeTier === 'low';
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const memoryGb = typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined;
  const connection = typeof navigator !== 'undefined' ? (navigator as any).connection : undefined;
  const saveData = connection?.saveData === true;
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  return {
    tier: activeTier,
    isLowEnd,
    isHighEnd: !isLowEnd,
    isMobile,
    hardwareConcurrency: cores,
    deviceMemoryGb: memoryGb,
    saveDataEnabled: saveData,
    prefersReducedMotion: reducedMotion,
    recommendedMaxCandles: isLowEnd ? 180 : 500,
    chartUpdateThrottleMs: isLowEnd ? 48 : 0, // ~20fps throttle on low-end, unbounded RAF on high-end
    backdropBlurEnabled: !isLowEnd,
    highFpsAnimationsEnabled: !isLowEnd,
  };
}

/**
 * Applies global CSS marker classes to the <html> document element
 * so CSS rules (.perf-mode-low, .perf-mode-high) take effect platform-wide.
 */
export function applyDevicePerformanceClasses(tier: PerformanceTier): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (tier === 'low') {
    root.classList.add('perf-mode-low');
    root.classList.remove('perf-mode-high');
  } else {
    root.classList.add('perf-mode-high');
    root.classList.remove('perf-mode-low');
  }
}

/**
 * React hook for consuming and dynamically switching performance profiles across the app.
 */
export function useDevicePerformance(): {
  profile: DevicePerformanceProfile;
  setPreference: (pref: PerformancePreference) => void;
  preference: PerformancePreference;
} {
  const [preference, setPreferenceState] = useState<PerformancePreference>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(PERF_STORAGE_KEY) as PerformancePreference | null;
        if (stored === 'low' || stored === 'high' || stored === 'auto') return stored;
      } catch {
        // ignore
      }
    }
    return 'auto';
  });

  const [profile, setProfile] = useState<DevicePerformanceProfile>(() =>
    getDevicePerformanceProfile(preference)
  );

  useEffect(() => {
    const nextProfile = getDevicePerformanceProfile(preference);
    setProfile(nextProfile);
    applyDevicePerformanceClasses(nextProfile.tier);

    const handleResize = () => {
      const updated = getDevicePerformanceProfile(preference);
      setProfile(updated);
      applyDevicePerformanceClasses(updated.tier);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [preference]);

  const setPreference = (pref: PerformancePreference) => {
    setPreferenceState(pref);
    try {
      localStorage.setItem(PERF_STORAGE_KEY, pref);
    } catch {
      // ignore
    }
    const updated = getDevicePerformanceProfile(pref);
    setProfile(updated);
    applyDevicePerformanceClasses(updated.tier);
  };

  return { profile, setPreference, preference };
}
