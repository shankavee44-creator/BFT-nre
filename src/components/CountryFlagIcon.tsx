import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { normalizeAssetSymbol } from '../utils/storage';

export interface CountryFlagIconProps {
  country?: string;
  isoCode?: string;
  countryCode?: string;
  country_code?: string;
  flagEmoji?: string;
  className?: string;
  showIsoBadge?: boolean;
}

export interface AssetFlagIconProps {
  symbol: string;
  category?: string;
  flagEmoji?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const CURRENCY_TO_ISO: Record<string, string> = {
  EUR: 'eu',
  USD: 'us',
  GBP: 'gb',
  JPY: 'jp',
  AUD: 'au',
  CAD: 'ca',
  CHF: 'ch',
  NZD: 'nz',
  SGD: 'sg',
  HKD: 'hk',
  CNY: 'cn',
  CNH: 'cn',
  INR: 'in',
  PKR: 'pk',
  BDT: 'bd',
  LKR: 'lk',
  MYR: 'my',
  MVR: 'mv',
  AED: 'ae',
  SAR: 'sa',
  TRY: 'tr',
  ZAR: 'za',
  MXN: 'mx',
  BRL: 'br',
  NOK: 'no',
  SEK: 'se',
  DKK: 'dk',
  PLN: 'pl',
  KRW: 'kr',
  THB: 'th',
  IDR: 'id',
  PHP: 'ph',
  VND: 'vn',
  NGN: 'ng',
  EGP: 'eg',
  AOA: 'ao',
  UAH: 'ua',
  NPR: 'np',
};

/**
 * Extracts a 2-letter ISO code from Unicode regional indicator flag emojis (e.g., 🇱🇰 -> 'lk', 🇬🇧 -> 'gb', 🇧🇩 -> 'bd')
 */
export function extractIsoFromEmoji(emojiStr: string): string | null {
  if (!emojiStr) return null;
  const codePoints = Array.from(emojiStr);
  const letters: string[] = [];
  for (const ch of codePoints) {
    const cp = ch.codePointAt(0);
    if (cp && cp >= 0x1f1e6 && cp <= 0x1f1ff) {
      letters.push(String.fromCharCode(cp - 0x1f1e6 + 65));
      if (letters.length === 2) {
        return letters.join('').toLowerCase();
      }
    }
  }
  return null;
}

/**
 * Resolves human-readable country name from ISO 2-letter code.
 */
export function getCountryNameFromIso(code: string = ''): string {
  const c = code.toLowerCase().trim();
  switch (c) {
    case 'bd': return 'Bangladesh';
    case 'in': return 'India';
    case 'pk': return 'Pakistan';
    case 'lk': return 'Sri Lanka';
    case 'mv': return 'Maldives';
    case 'my': return 'Malaysia';
    case 'ae': return 'United Arab Emirates';
    case 'ao': return 'Angola';
    case 'ua': return 'Ukraine';
    case 'np': return 'Nepal';
    case 'us': return 'United States';
    case 'gb': return 'United Kingdom';
    case 'sg': return 'Singapore';
    case 'ca': return 'Canada';
    case 'au': return 'Australia';
    case 'de': return 'Germany';
    case 'fr': return 'France';
    case 'jp': return 'Japan';
    default: return code ? code.toUpperCase() : 'Global';
  }
}

/**
 * Generates Unicode flag emoji from 2-letter ISO code.
 */
export function getFlagEmojiFromIso(code: string = ''): string {
  if (!code || code.length !== 2) return '🌐';
  const upper = code.toUpperCase();
  const first = upper.charCodeAt(0) - 65 + 0x1f1e6;
  const second = upper.charCodeAt(1) - 65 + 0x1f1e6;
  return String.fromCodePoint(first, second);
}

/**
 * Maps country name, ISO code, country_code field, currency code, or emoji string to standardized ISO 3166-1 alpha-2 lowercase code.
 * Returns empty string '' if missing or unmapped to allow graceful fallback to a default global icon.
 */
export function getIsoCountryCode(countryOrEmoji: string = ''): string {
  const input = (countryOrEmoji || '').trim();
  if (!input) return '';

  // 1. Direct 2-letter ISO code (e.g., 'BD', 'IN', 'PK', 'LK', 'AE', 'MY', 'MV', 'AO', 'UA', 'NP', etc.)
  if (input.length === 2 && /^[a-zA-Z]{2}$/.test(input)) {
    return input.toLowerCase();
  }

  // 2. Direct 3-letter Currency code (e.g., BDT -> bd, INR -> in, PKR -> pk, MVR -> mv)
  if (input.length === 3 && /^[a-zA-Z]{3}$/.test(input)) {
    const upper = input.toUpperCase();
    if (CURRENCY_TO_ISO[upper]) {
      return CURRENCY_TO_ISO[upper];
    }
  }

  // 3. Unicode Flag Emoji extraction
  const fromEmoji = extractIsoFromEmoji(input);
  if (fromEmoji) {
    return fromEmoji;
  }

  // 4. Country name lookup
  const lower = input.toLowerCase();
  if (lower === 'bd' || lower.includes('bangladesh')) return 'bd';
  if (lower === 'in' || lower.includes('india')) return 'in';
  if (lower === 'pk' || lower.includes('pakistan')) return 'pk';
  if (lower === 'lk' || lower.includes('sri lanka')) return 'lk';
  if (lower === 'mv' || lower.includes('maldives')) return 'mv';
  if (lower === 'my' || lower.includes('malaysia')) return 'my';
  if (lower === 'ae' || lower.includes('uae') || lower.includes('dubai') || lower.includes('emirates')) return 'ae';
  if (lower === 'ao' || lower.includes('angola')) return 'ao';
  if (lower === 'ua' || lower.includes('ukraine')) return 'ua';
  if (lower === 'np' || lower.includes('nepal')) return 'np';
  if (lower === 'us' || lower.includes('united states') || lower.includes('usa')) return 'us';
  if (lower === 'gb' || lower === 'uk' || lower.includes('united kingdom') || lower.includes('britain')) return 'gb';
  if (lower === 'eu' || lower.includes('europe')) return 'eu';
  if (lower === 'sg' || lower.includes('singapore')) return 'sg';
  if (lower === 'br' || lower.includes('brazil')) return 'br';
  if (lower === 'de' || lower.includes('germany')) return 'de';
  if (lower === 'fr' || lower.includes('france')) return 'fr';
  if (lower === 'jp' || lower.includes('japan')) return 'jp';
  if (lower === 'au' || lower.includes('australia')) return 'au';
  if (lower === 'ca' || lower.includes('canada')) return 'ca';
  if (lower === 'ch' || lower.includes('switzerland') || lower.includes('swiss')) return 'ch';
  if (lower === 'nz' || lower.includes('new zealand')) return 'nz';
  if (lower === 'za' || lower.includes('south africa')) return 'za';
  if (lower === 'ng' || lower.includes('nigeria')) return 'ng';
  if (lower === 'eg' || lower.includes('egypt')) return 'eg';
  if (lower === 'tr' || lower.includes('turkey')) return 'tr';
  if (lower === 'mx' || lower.includes('mexico')) return 'mx';
  if (lower === 'id' || lower.includes('indonesia')) return 'id';
  if (lower === 'vn' || lower.includes('vietnam')) return 'vn';
  if (lower === 'th' || lower.includes('thailand')) return 'th';
  if (lower === 'ph' || lower.includes('philippines')) return 'ph';
  if (lower === 'kr' || lower.includes('korea')) return 'kr';
  if (lower === 'cn' || lower.includes('china')) return 'cn';

  return '';
}

/**
 * Resolves base and quote ISO flag codes for Forex pairs or asset symbols.
 */
export function resolveCurrencyPairFlags(
  symbol: string,
  category: string = '',
  flagEmoji: string = ''
): {
  primaryIso: string | null;
  secondaryIso: string | null;
  badgeText: string;
  isForex: boolean;
} {
  const clean = normalizeAssetSymbol(symbol || '');
  const parts = clean.split('/');

  if (parts.length === 2) {
    const base = parts[0].trim().toUpperCase();
    const quote = parts[1].trim().toUpperCase();
    const baseIso = CURRENCY_TO_ISO[base] || null;
    const quoteIso = CURRENCY_TO_ISO[quote] || null;

    if (baseIso && quoteIso) {
      return {
        primaryIso: baseIso,
        secondaryIso: quoteIso,
        badgeText: `${base.slice(0, 2)}/${quote.slice(0, 2)}`,
        isForex: true,
      };
    }
  }

  const emojiIso = extractIsoFromEmoji(flagEmoji);
  if (emojiIso && (category.toLowerCase().includes('forex') || clean.includes('/'))) {
    return {
      primaryIso: emojiIso,
      secondaryIso: null,
      badgeText: emojiIso.toUpperCase(),
      isForex: true,
    };
  }

  return {
    primaryIso: null,
    secondaryIso: null,
    badgeText: clean.slice(0, 3).toUpperCase() || 'OTC',
    isForex: false,
  };
}

/**
 * Standardized High-Quality Country Flag Component using official FlagCDN SVGs
 * with ISO 3166-1 alpha-2 support, country_code mapping, and safe neutral Globe icon fallback.
 */
export const CountryFlagIcon: React.FC<CountryFlagIconProps> = React.memo(({
  country = '',
  isoCode = '',
  countryCode = '',
  country_code = '',
  flagEmoji = '',
  className = 'w-5 h-3.5 rounded-[2px] shadow-sm border border-white/15 shrink-0 inline-block align-middle object-cover',
  showIsoBadge = false,
}) => {
  const rawTarget = country_code || countryCode || isoCode || country || flagEmoji;
  const code = getIsoCountryCode(rawTarget);
  const [imgError, setImgError] = useState(false);
  const upperIso = code.toUpperCase();

  // If no valid country code is resolved, fallback gracefully to a default global icon
  if (!code) {
    return (
      <span className="inline-flex items-center gap-1.5 shrink-0 align-middle">
        <span
          className="inline-flex items-center justify-center p-0.5 rounded-[2px] bg-[#141926] border border-white/20 text-slate-300 shrink-0"
          title={country || 'Global'}
        >
          <Globe className="w-3.5 h-3.5 text-slate-300" />
        </span>
        {showIsoBadge && (
          <span className="px-1 py-0.2 rounded bg-white/[0.06] border border-white/10 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tight leading-none shrink-0">
            GLOBAL
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 align-middle">
      {!imgError ? (
        <img
          src={`https://flagcdn.com/${code}.svg`}
          alt={`${country || upperIso} flag`}
          loading="lazy"
          decoding="async"
          className={className}
          onError={() => setImgError(true)}
        />
      ) : (
        <span
          className="inline-flex items-center justify-center px-1 py-0.5 rounded-[2px] bg-[#1a1f2e] border border-white/20 text-[9px] font-mono font-black text-slate-200 leading-none shrink-0"
          title={country || upperIso}
        >
          {upperIso}
        </span>
      )}
      {showIsoBadge && (
        <span className="px-1 py-0.2 rounded bg-white/[0.06] border border-white/10 text-[9px] font-mono font-bold text-slate-300 uppercase tracking-tight leading-none shrink-0">
          {upperIso}
        </span>
      )}
    </span>
  );
});

/**
 * Renders accurate dual-flag icons for Forex currency pairs (e.g., GBP/JPY -> GB + JP flags)
 * and clean standardized badges for Crypto, Commodities, and Stocks across PC and Mobile feeds.
 */
export const AssetFlagIcon: React.FC<AssetFlagIconProps> = React.memo(({
  symbol,
  category = '',
  flagEmoji = '',
  size = 'sm',
  className = '',
}) => {
  const resolved = resolveCurrencyPairFlags(symbol, category, flagEmoji);
  const [primaryErr, setPrimaryErr] = useState(false);
  const [secondaryErr, setSecondaryErr] = useState(false);

  const dims =
    size === 'xs'
      ? { single: 'w-4 h-3', dual: 'w-3.5 h-2.5', container: 'w-5 h-3.5' }
      : size === 'md'
      ? { single: 'w-6 h-4', dual: 'w-4.5 h-3.5', container: 'w-7 h-5' }
      : { single: 'w-5 h-3.5', dual: 'w-4 h-3', container: 'w-6 h-4' };

  if (resolved.primaryIso && resolved.secondaryIso && !primaryErr && !secondaryErr) {
    return (
      <span
        className={`relative inline-flex items-center justify-center shrink-0 select-none ${dims.container} ${className}`}
        title={symbol}
      >
        <img
          src={`https://flagcdn.com/${resolved.primaryIso}.svg`}
          alt={resolved.primaryIso.toUpperCase()}
          loading="lazy"
          decoding="async"
          onError={() => setPrimaryErr(true)}
          className={`${dims.dual} rounded-[2px] object-cover border border-black/60 shadow-sm absolute left-0 top-0 z-10`}
        />
        <img
          src={`https://flagcdn.com/${resolved.secondaryIso}.svg`}
          alt={resolved.secondaryIso.toUpperCase()}
          loading="lazy"
          decoding="async"
          onError={() => setSecondaryErr(true)}
          className={`${dims.dual} rounded-[2px] object-cover border border-black/60 shadow-sm absolute right-0 bottom-0 z-20`}
        />
      </span>
    );
  }

  if (resolved.primaryIso && !primaryErr) {
    return (
      <img
        src={`https://flagcdn.com/${resolved.primaryIso}.svg`}
        alt={resolved.primaryIso.toUpperCase()}
        loading="lazy"
        decoding="async"
        onError={() => setPrimaryErr(true)}
        className={`${dims.single} rounded-[2px] object-cover border border-white/15 shadow-sm shrink-0 inline-block align-middle ${className}`}
      />
    );
  }

  // Non-FX asset (Crypto, Gold/Silver, Stocks, Volatility Indices)
  const clean = normalizeAssetSymbol(symbol || '');
  const isCrypto = category.toLowerCase().includes('crypto') || clean.startsWith('BTC') || clean.startsWith('ETH') || clean.startsWith('SOL');
  const isCommodity = category.toLowerCase().includes('commod') || clean.startsWith('XAU') || clean.startsWith('XAG') || clean.startsWith('WTI');

  return (
    <span
      className={`inline-flex items-center justify-center rounded px-1 py-0.5 text-[9px] font-mono font-black leading-none shrink-0 border ${
        isCrypto
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          : isCommodity
          ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
          : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
      } ${className}`}
      title={symbol}
    >
      {resolved.badgeText}
    </span>
  );
});
