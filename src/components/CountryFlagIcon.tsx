import React from 'react';

interface CountryFlagIconProps {
  country?: string;
  isoCode?: string;
  flagEmoji?: string;
  className?: string;
}

/**
 * Maps country name, ISO code, or emoji string to ISO 2-letter code
 */
export function getIsoCountryCode(countryOrEmoji: string = ''): string {
  const input = countryOrEmoji.trim();
  const lower = input.toLowerCase();

  if (lower === 'lk' || lower === 'sri lanka' || lower.includes('sri lanka') || input === '🇱🇰') return 'lk';
  if (lower === 'ae' || lower === 'dubai, uae' || lower.includes('uae') || lower.includes('dubai') || input === '🇦🇪') return 'ae';
  if (lower === 'in' || lower === 'india' || lower.includes('india') || input === '🇮🇳') return 'in';
  if (lower === 'my' || lower === 'malaysia' || lower.includes('malaysia') || input === '🇲🇾') return 'my';
  if (lower === 'pk' || lower === 'pakistan' || lower.includes('pakistan') || input === '🇵🇰') return 'pk';
  if (lower === 'us' || lower === 'united states' || lower.includes('united states') || lower.includes('usa') || input === '🇺🇸') return 'us';
  if (lower === 'gb' || lower === 'uk' || lower.includes('united kingdom') || input === '🇬🇧') return 'gb';
  if (lower === 'sg' || lower === 'singapore' || lower.includes('singapore') || input === '🇸🇬') return 'sg';
  if (lower === 'br' || lower === 'brazil' || lower.includes('brazil') || input === '🇧🇷') return 'br';
  if (lower === 'de' || lower === 'germany' || lower.includes('germany') || input === '🇩🇪') return 'de';
  if (lower === 'fr' || lower === 'france' || lower.includes('france') || input === '🇫🇷') return 'fr';
  if (lower === 'jp' || lower === 'japan' || lower.includes('japan') || input === '🇯🇵') return 'jp';
  if (lower === 'au' || lower === 'australia' || lower.includes('australia') || input === '🇦🇺') return 'au';
  if (lower === 'ca' || lower === 'canada' || lower.includes('canada') || input === '🇨🇦') return 'ca';

  // Extract 2-letter ISO if passed directly
  if (input.length === 2 && /^[a-zA-Z]{2}$/.test(input)) {
    return input.toLowerCase();
  }

  return 'us';
}

export const CountryFlagIcon: React.FC<CountryFlagIconProps> = ({
  country = '',
  isoCode = '',
  flagEmoji = '',
  className = 'w-5 h-3.5 rounded-[2px] shadow-sm border border-white/10 shrink-0 inline-block align-middle object-cover',
}) => {
  const code = getIsoCountryCode(isoCode || country || flagEmoji);

  // Render High-Resolution SVG for Core Countries (Ensures instant 100% rendering on Windows/PC without OS emoji font dependency)
  if (code === 'ae') {
    return (
      <svg viewBox="0 0 600 300" className={className} aria-label="Dubai, UAE Flag">
        <rect width="600" height="100" fill="#00732f" />
        <rect y="100" width="600" height="100" fill="#ffffff" />
        <rect y="200" width="600" height="100" fill="#000000" />
        <rect width="150" height="300" fill="#ff0000" />
      </svg>
    );
  }

  if (code === 'in') {
    return (
      <svg viewBox="0 0 900 600" className={className} aria-label="India Flag">
        <rect width="900" height="200" fill="#FF9933" />
        <rect y="200" width="900" height="200" fill="#FFFFFF" />
        <rect y="400" width="900" height="200" fill="#138808" />
        <circle cx="450" cy="300" r="70" fill="none" stroke="#000080" strokeWidth="12" />
        <g stroke="#000080" strokeWidth="4">
          <line x1="450" y1="230" x2="450" y2="370" />
          <line x1="380" y1="300" x2="520" y2="300" />
          <line x1="400" y1="250" x2="500" y2="350" />
          <line x1="400" y1="350" x2="500" y2="250" />
        </g>
      </svg>
    );
  }

  if (code === 'my') {
    return (
      <svg viewBox="0 0 280 140" className={className} aria-label="Malaysia Flag">
        <rect width="280" height="140" fill="#cc0000" />
        <g fill="#ffffff">
          <rect y="10" width="280" height="10" />
          <rect y="30" width="280" height="10" />
          <rect y="50" width="280" height="10" />
          <rect y="70" width="280" height="10" />
          <rect y="90" width="280" height="10" />
          <rect y="110" width="280" height="10" />
          <rect y="130" width="280" height="10" />
        </g>
        <rect width="140" height="80" fill="#000066" />
        <path d="M 65 15 A 25 25 0 1 0 65 65 A 20 20 0 1 1 65 15 Z" fill="#ffcc00" />
        <polygon points="85,40 89,32 97,35 91,27 98,21 89,21 85,13 81,21 72,21 79,27 73,35 81,32" fill="#ffcc00" />
      </svg>
    );
  }

  if (code === 'pk') {
    return (
      <svg viewBox="0 0 3 2" className={className} aria-label="Pakistan Flag">
        <rect width="3" height="2" fill="#004112" />
        <rect width="0.75" height="2" fill="#ffffff" />
        <path d="M 1.875 0.5 A 0.5 0.5 0 1 0 2.25 1.35 A 0.4 0.4 0 1 1 1.875 0.5 Z" fill="#ffffff" />
        <polygon points="2.05,0.7 2.08,0.8 2.18,0.8 2.1,0.86 2.13,0.95 2.05,0.89 1.97,0.95 2,0.86 1.92,0.8 2.02,0.8" fill="#ffffff" />
      </svg>
    );
  }

  if (code === 'lk') {
    return (
      <svg viewBox="0 0 1200 600" className={className} aria-label="Sri Lanka Flag">
        <rect width="1200" height="600" fill="#FFBE29" />
        <rect x="30" y="30" width="1140" height="540" fill="#000000" />
        <rect x="60" y="60" width="140" height="480" fill="#008080" />
        <rect x="220" y="60" width="140" height="480" fill="#FF8000" />
        <rect x="380" y="60" width="760" height="480" fill="#8D153A" />
        <circle cx="760" cy="300" r="100" fill="#FFBE29" />
        <polygon points="760,220 780,270 830,270 790,300 810,350 760,320 710,350 730,300 690,270 740,270" fill="#8D153A" />
      </svg>
    );
  }

  if (code === 'us') {
    return (
      <svg viewBox="0 0 1235 650" className={className} aria-label="United States Flag">
        <rect width="1235" height="650" fill="#B22234" />
        <g fill="#FFFFFF">
          <rect y="50" width="1235" height="50" />
          <rect y="150" width="1235" height="50" />
          <rect y="250" width="1235" height="50" />
          <rect y="350" width="1235" height="50" />
          <rect y="450" width="1235" height="50" />
          <rect y="550" width="1235" height="50" />
        </g>
        <rect width="494" height="350" fill="#3C3B6E" />
      </svg>
    );
  }

  if (code === 'gb') {
    return (
      <svg viewBox="0 0 60 30" className={className} aria-label="United Kingdom Flag">
        <clipPath id="s-gb">
          <path d="M0,0 v30 h60 v-30 z" />
        </clipPath>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" clipPath="url(#s-gb)" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    );
  }

  // Fallback to FlagCDN PNG asset for all other countries
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt={country || code.toUpperCase()}
      className={className}
      onError={(e) => {
        // Fallback to text ISO code pill if network is unavailable
        const target = e.currentTarget;
        target.style.display = 'none';
      }}
    />
  );
};
