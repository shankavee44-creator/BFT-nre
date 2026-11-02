import React, { useEffect, useState } from 'react';

export const BFT_BULL_LOGO_SRC =
  '/assets/aistudio/Gemini_Generated_Image_olqflyolqflyolqf_576c2ed1.jpg';

let cachedCleanLogoUrl: string | null = null;
let pendingExtractionPromise: Promise<string | null> | null = null;
const listeners = new Set<(url: string) => void>();

/**
 * Removes the outer gray/white checkerboard background from the BFT bull shield JPEG
 * using a border-seeded BFS flood-fill and crops tightly to the shield's true bounding box.
 * Because the BFT bull shield is 100% enclosed by a saturated orange/black outline,
 * the white interior of the shield and bull horns are completely preserved.
 */
function extractTransparentBullLogo(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  if (cachedCleanLogoUrl) {
    return Promise.resolve(cachedCleanLogoUrl);
  }
  if (pendingExtractionPromise) {
    return pendingExtractionPromise;
  }

  pendingExtractionPromise = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(null);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const totalPixels = w * h;
        const visited = new Uint8Array(totalPixels);
        const isBg = new Uint8Array(totalPixels);
        const queue = new Int32Array(totalPixels);
        let head = 0;
        let tail = 0;

        const isCheckerboardPixel = (idx: number): boolean => {
          const offset = idx * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
          const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
          const sat = maxC - minC;
          // Outer checkerboard tiles are neutral light gray (~204) and white (~255)
          return sat <= 34 && minC >= 145;
        };

        const enqueueIfBg = (x: number, y: number) => {
          const idx = y * w + x;
          if (visited[idx]) return;
          visited[idx] = 1;
          if (isCheckerboardPixel(idx)) {
            isBg[idx] = 1;
            queue[tail++] = idx;
          }
        };

        // Seed BFS from all 4 outer edges
        for (let x = 0; x < w; x++) {
          enqueueIfBg(x, 0);
          enqueueIfBg(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
          enqueueIfBg(0, y);
          enqueueIfBg(w - 1, y);
        }

        while (head < tail) {
          const curr = queue[head++];
          const cx = curr % w;
          const cy = (curr - cx) / w;

          if (cx > 0) enqueueIfBg(cx - 1, cy);
          if (cx + 1 < w) enqueueIfBg(cx + 1, cy);
          if (cy > 0) enqueueIfBg(cx, cy - 1);
          if (cy + 1 < h) enqueueIfBg(cx, cy + 1);
        }

        // Clear flood-filled background pixels and smooth 1px boundary halo
        let minX = w;
        let minY = h;
        let maxX = 0;
        let maxY = 0;

        for (let y = 0; y < h; y++) {
          const rowOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = rowOffset + x;
            const pOffset = idx * 4;

            if (isBg[idx]) {
              data[pOffset + 3] = 0;
              continue;
            }

            // Check if adjacent to flood-filled background for edge anti-aliasing despill
            const touchesBg =
              (x > 0 && isBg[idx - 1]) ||
              (x + 1 < w && isBg[idx + 1]) ||
              (y > 0 && isBg[idx - w]) ||
              (y + 1 < h && isBg[idx + w]);

            if (touchesBg) {
              const r = data[pOffset];
              const g = data[pOffset + 1];
              const b = data[pOffset + 2];
              const maxC = Math.max(r, g, b);
              const minC = Math.min(r, g, b);
              const sat = maxC - minC;
              if (sat < 65 && minC > 110) {
                const alphaScale = Math.max(0, Math.min(1, (sat - 22) / 43));
                data[pOffset + 3] = Math.round(data[pOffset + 3] * alphaScale);
              }
            }

            if (data[pOffset + 3] > 20) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);

        if (maxX <= minX || maxY <= minY) {
          resolve(null);
          return;
        }

        const pad = 8;
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.min(w - cropX, maxX - minX + 1 + pad * 2);
        const cropH = Math.min(h - cropY, maxY - minY + 1 + pad * 2);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = cropW;
        outCanvas.height = cropH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) {
          resolve(null);
          return;
        }

        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const dataUrl = outCanvas.toDataURL('image/png');
        cachedCleanLogoUrl = dataUrl;
        listeners.forEach((cb) => cb(dataUrl));
        resolve(dataUrl);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = BFT_BULL_LOGO_SRC;
  });

  return pendingExtractionPromise;
}

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
  const [cleanSrc, setCleanSrc] = useState<string | null>(cachedCleanLogoUrl);

  useEffect(() => {
    if (cachedCleanLogoUrl) {
      setCleanSrc(cachedCleanLogoUrl);
      return;
    }
    const handleReady = (url: string) => setCleanSrc(url);
    listeners.add(handleReady);
    extractTransparentBullLogo();
    return () => {
      listeners.delete(handleReady);
    };
  }, []);

  const resolvedSizeClass = imgClassName || SIZE_CLASSES[size];

  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center justify-center shrink-0 select-none relative ${className}`}
    >
      {/* Keep direct reference to the local public asset path in DOM */}
      <img
        src={BFT_BULL_LOGO_SRC}
        alt={cleanSrc ? '' : alt}
        aria-hidden={cleanSrc ? 'true' : undefined}
        referrerPolicy="no-referrer"
        decoding="async"
        className={
          cleanSrc
            ? 'sr-only pointer-events-none'
            : `${resolvedSizeClass} object-contain rounded-lg transition-transform duration-200`
        }
      />
      {cleanSrc && (
        <img
          src={cleanSrc}
          data-original-src={BFT_BULL_LOGO_SRC}
          alt={alt}
          referrerPolicy="no-referrer"
          decoding="async"
          className={`${resolvedSizeClass} object-contain drop-shadow-[0_2px_10px_rgba(255,136,0,0.28)] transition-transform duration-200`}
        />
      )}
    </span>
  );
};
