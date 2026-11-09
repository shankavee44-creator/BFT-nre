import React from 'react';

export const PaymentIcon: React.FC<{
  id: string;
  className?: string;
  compact?: boolean;
}> = ({ id, className = 'w-9 h-9', compact = false }) => {
  switch (id) {
    case 'usdt_trc20':
      return (
        <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 40 32" className="w-full h-full overflow-visible">
            {/* Tether USDT Green Circle */}
            <circle cx="13" cy="16" r="12" fill="#26A17B" />
            <path
              d="M14.3 14.3v-2.1h4.2V9.8H7.5v2.4h4.2v2.1c-3.4.2-6 .9-6 1.8s2.6 1.6 6 1.8v5.5h2.6v-5.5c3.4-.2 6-.9 6-1.8s-2.6-1.6-6-1.8zm-1.3 2.5c-2.6 0-4.8-.4-5.4-1 .6-.5 2.8-.9 5.4-1v1.4h2.6v-1.4c2.6.1 4.8.5 5.4 1-.6.6-2.8 1-5.4 1h-2.6z"
              fill="#FFFFFF"
            />
            {/* TRON Red Circle */}
            <circle cx="27" cy="16" r="11" fill="#EF0027" stroke="#FFFFFF" strokeWidth="1.5" />
            <path
              d="M22.2 11.4l10.2 1.9-4.7 8.5-5.5-10.4zm2.1 1.7l2.9 5.7 1.6-3.7-4.5-2zm1.1 1.4l3.9 1.6 1.5-1.1-5.4-.5z"
              fill="#FFFFFF"
            />
          </svg>
        </div>
      );

    case 'usdt_polygon':
      return (
        <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 40 32" className="w-full h-full overflow-visible">
            {/* Tether USDT Green Circle */}
            <circle cx="13" cy="16" r="12" fill="#26A17B" />
            <path
              d="M14.3 14.3v-2.1h4.2V9.8H7.5v2.4h4.2v2.1c-3.4.2-6 .9-6 1.8s2.6 1.6 6 1.8v5.5h2.6v-5.5c3.4-.2 6-.9 6-1.8s-2.6-1.6-6-1.8z"
              fill="#FFFFFF"
            />
            {/* Polygon Purple Circle */}
            <circle cx="27" cy="16" r="11" fill="#8247E5" stroke="#FFFFFF" strokeWidth="1.5" />
            <path
              d="M29.5 14.2c-.4-.2-.9-.2-1.3 0l-1.9 1.1-1.3.7-1.9 1.1c-.4.2-.9.2-1.3 0l-1.5-.9c-.4-.2-.6-.6-.6-1.1v-1.7c0-.5.2-.9.6-1.1l1.5-.8c.4-.2.9-.2 1.3 0l1.5.9c.4.2.6.6.6 1.1v1.1l1.3-.8v-1.1c0-.5-.2-.9-.6-1.1l-2.8-1.6c-.4-.2-.9-.2-1.3 0l-2.8 1.6c-.4.2-.6.6-.6 1.1v3.3c0 .5.2.9.6 1.1l2.8 1.6c.4.2.9.2 1.3 0l1.9-1.1 1.3-.8 1.9-1.1c.4-.2.9-.2 1.3 0l1.5.8c.4.2.6.6.6 1.1v1.7c0 .5-.2.9-.6 1.1l-1.5.9c-.4.2-.9.2-1.3 0l-1.5-.9c-.4-.2-.6-.6-.6-1.1v-1.1l-1.3.8v1.1c0 .5.2.9.6 1.1l2.8 1.6c.4.2.9.2 1.3 0l2.8-1.6c.4-.2.6-.6.6-1.1v-3.3c0-.5-.2-.9-.6-1.1l-2.8-1.6z"
              fill="#FFFFFF"
            />
          </svg>
        </div>
      );

    case 'commercial_bank':
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <rect x="2" y="2" width="32" height="32" rx="6" fill="#005EB8" />
            <path d="M18 7L7 13v2h22v-2L18 7z" fill="#FFFFFF" />
            <rect x="9.5" y="16.5" width="3" height="8" rx="0.5" fill="#FFFFFF" />
            <rect x="16.5" y="16.5" width="3" height="8" rx="0.5" fill="#FFFFFF" />
            <rect x="23.5" y="16.5" width="3" height="8" rx="0.5" fill="#FFFFFF" />
            <rect x="7" y="26" width="22" height="2.8" rx="0.8" fill="#FFFFFF" />
          </svg>
        </div>
      );

    case 'ipay':
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <defs>
              <linearGradient id="ipayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00C6FF" />
                <stop offset="100%" stopColor="#0062CC" />
              </linearGradient>
            </defs>
            <circle cx="18" cy="18" r="16" fill="url(#ipayGrad)" />
            <path
              d="M9 19a9 9 0 0 1 16-5.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.7"
            />
            <text
              x="18"
              y="21.5"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize={compact ? '10' : '9.5'}
              fontWeight="800"
              fontFamily="sans-serif"
            >
              iPay
            </text>
          </svg>
        </div>
      );

    case 'upay':
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <rect x="2" y="2" width="32" height="32" rx="6" fill="#F26722" />
            <path
              d="M11.5 10v10.2c0 3.8 2.7 6.3 6.5 6.3s6.5-2.5 6.5-6.3V10h-3.6v10c0 2-1.2 3.2-2.9 3.2s-2.9-1.2-2.9-3.2V10h-3.6z"
              fill="#FFFFFF"
            />
          </svg>
        </div>
      );

    case 'ethereum':
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <circle cx="18" cy="18" r="16" fill="#F0F2F5" />
            <polygon points="18,5 10,18.2 18,22.8" fill="#62688F" />
            <polygon points="18,5 26,18.2 18,22.8" fill="#454A75" />
            <polygon points="18,24.4 10,19.8 18,31" fill="#62688F" />
            <polygon points="18,24.4 26,19.8 18,31" fill="#454A75" />
            <polygon points="18,14.8 10,18.2 18,22.8" fill="#454A75" opacity="0.6" />
            <polygon points="18,14.8 26,18.2 18,22.8" fill="#202646" opacity="0.6" />
          </svg>
        </div>
      );

    case 'arbitrum':
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <circle cx="18" cy="18" r="16" fill="#213147" />
            <path
              d="M18 6l10.4 6v12L18 30 7.6 24V12L18 6z"
              fill="#213147"
              stroke="#96BEDC"
              strokeWidth="1.5"
            />
            <path d="M19.2 11.5l5.2 9.8-2.4 1.4-4-7.6-3.7 7.1-2.5-1.4 4.8-9.3h2.6z" fill="#FFFFFF" />
            <path d="M14.2 21.8l2.2-4.2 2.2 4.2-2.2 4-2.2-4z" fill="#28A0F0" />
          </svg>
        </div>
      );

    case 'okt':
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <circle cx="18" cy="18" r="16" fill="#121212" stroke="#333947" strokeWidth="1" />
            <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
            <rect x="21" y="9.5" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
            <rect x="15.25" y="15.25" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
            <rect x="9.5" y="21" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
            <rect x="21" y="21" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
          </svg>
        </div>
      );

    case 'aptos':
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <circle cx="18" cy="18" r="16" fill="#0F172A" stroke="#1E293B" strokeWidth="1" />
            <path
              d="M8.5 12.5h12l2-2.5H10.5l-2 2.5zm-1.5 5h14l2.5-2.5H9.5L7 17.5zm1.5 5h13l2.5-2.5H11l-2.5 2.5zm4 4.5h11.5l2-2.5H14.5l-2 2.5z"
              fill="#00F5A0"
            />
          </svg>
        </div>
      );

    case 'litecoin':
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <circle cx="18" cy="18" r="16" fill="#345D9D" />
            <path
              d="M17.2 19.8l1.4-5.2 2.3-.8.6-2.2-2.3.8 1.5-5.4h-4.2l-2.1 7.6-1.8.6-.6 2.2 1.8-.6-1.3 4.7h10.8l.7-2.7h-6.8z"
              fill="#FFFFFF"
            />
          </svg>
        </div>
      );

    default:
      return (
        <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <circle cx="18" cy="18" r="16" fill="#26A17B" />
            <text x="18" y="23" textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="bold">
              $
            </text>
          </svg>
        </div>
      );
  }
};
