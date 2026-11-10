import React, { useState } from 'react';

const RAW_BASE_URL =
  typeof import.meta !== 'undefined' &&
  (import.meta as any).env &&
  typeof (import.meta as any).env.BASE_URL === 'string'
    ? (import.meta as any).env.BASE_URL
    : '/';

const NORMALIZED_BASE_URL = RAW_BASE_URL.endsWith('/') ? RAW_BASE_URL : `${RAW_BASE_URL}/`;

export const BFT_BULL_LOGO_SRC = `${NORMALIZED_BASE_URL}bft-logo.png`;
export const BFT_BULL_LOGO_SVG_SRC = `${NORMALIZED_BASE_URL}bft-logo.svg`;

export interface BftLogoProps {
  /** Responsive height preset */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Custom wrapper classes */
  className?: string;
  /** Custom image height/sizing classes (overrides size preset if provided) */
  imgClassName?: string;
  /** Accessible alt text */
  alt?: string;
  /** Test ID for automated verification */
  testId?: string;
}

const SIZE_CLASSES: Record<NonNullable<BftLogoProps['size']>, string> = {
  xs: 'h-6 sm:h-7 w-auto',
  sm: 'h-8 sm:h-9 w-auto',
  md: 'h-9 sm:h-10 md:h-11 w-auto',
  lg: 'h-11 sm:h-12 md:h-14 w-auto',
  xl: 'h-14 sm:h-16 md:h-20 w-auto',
};

export const BftLogo: React.FC<BftLogoProps> = ({
  size = 'md',
  className = '',
  imgClassName,
  alt = 'Binary Funded Trader (BFT) Logo',
  testId = 'bft-official-logo',
}) => {
  const [imgSrc, setImgSrc] = useState<string>(BFT_BULL_LOGO_SRC);
  const resolvedSizeClass = imgClassName || SIZE_CLASSES[size];

  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center justify-center shrink-0 select-none relative ${className}`}
    >
      <img
        src={imgSrc}
        data-original-src={BFT_BULL_LOGO_SRC}
        alt={alt}
        width={44}
        height={44}
        decoding="async"
        onError={() => {
          if (imgSrc === BFT_BULL_LOGO_SRC) {
            setImgSrc(BFT_BULL_LOGO_SVG_SRC);
          }
        }}
        className={`${resolvedSizeClass} aspect-square object-contain drop-shadow-[0_2px_10px_rgba(255,136,0,0.28)] block shrink-0 transition-transform duration-200`}
      />
    </span>
  );
};
