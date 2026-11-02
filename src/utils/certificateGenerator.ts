/**
 * Automated Client-Side BFT Funded Trader Certificate Generator
 * Canvas (1920x1357) & jsPDF Print-Ready PDF Generator
 */

import { jsPDF } from 'jspdf';

export interface CertificateRenderOptions {
  fullName: string;
  passedDate?: string | number | Date | null;
  templateUrl?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  passedDate?: string;
  matchingAccountId?: string;
  matchingAccountTier?: string;
  accountSize?: string | number;
}

export const CERTIFICATE_CONSTANTS = {
  WIDTH: 1920,
  HEIGHT: 1357,
  CENTER_X: 960,
  NAME_Y: 515,
  DATE_Y: 580,
  BASE_FONT_SIZE: 62,
  MIN_FONT_SIZE: 38,
  MAX_TEXT_WIDTH: 1250,
  GOLD_START: '#f5b963',
  GOLD_END: '#c88a32',
  DEFAULT_TEMPLATE_PATH: '/certificate-template.png',
};

/**
 * Formats any date input into uppercase prop-firm certificate format: "DD MMMM YYYY"
 * E.g., "24 OCTOBER 2026" or "02 NOVEMBER 2026"
 */
export function formatCertificateDate(dateInput?: string | number | Date | null): string {
  let date: Date;

  if (!dateInput) {
    date = new Date();
  } else if (dateInput instanceof Date) {
    date = isNaN(dateInput.getTime()) ? new Date() : dateInput;
  } else if (typeof dateInput === 'number') {
    date = new Date(dateInput);
    if (isNaN(date.getTime())) date = new Date();
  } else if (typeof dateInput === 'string') {
    // If string already matches "DD MMMM YYYY" or "MMMM DD, YYYY", normalize
    const parsed = new Date(dateInput);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    } else {
      // Return normalized string uppercase
      return dateInput.trim().toUpperCase();
    }
  } else {
    date = new Date();
  }

  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  const month = monthNames[date.getMonth()] || 'NOVEMBER';
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

/**
 * Returns the exact certificate subtitle string:
 * 'WHO ON THIS DAY ' + formatted_passed_date
 */
export function formatCertificateSubtitle(formattedPassedDate: string): string {
  const cleanDate = formattedPassedDate.trim().toUpperCase();
  return `WHO ON THIS DAY ${cleanDate}`;
}

/**
 * Calculates responsive font size to fit wide trader names cleanly on the certificate ribbon
 */
export function calculateNameFontSize(
  name: string,
  baseSize: number = CERTIFICATE_CONSTANTS.BASE_FONT_SIZE,
  minSize: number = CERTIFICATE_CONSTANTS.MIN_FONT_SIZE,
  maxWidth: number = CERTIFICATE_CONSTANTS.MAX_TEXT_WIDTH
): number {
  if (!name || name.trim().length === 0) return baseSize;
  const length = name.trim().length;

  // Approximate proportional scale factor for uppercase bold serif/sans font
  // Average char width ~ 0.65 * fontSize
  const estimatedWidth = length * baseSize * 0.65;
  if (estimatedWidth <= maxWidth) {
    return baseSize;
  }

  const scaled = Math.floor((maxWidth / (length * 0.65)));
  return Math.max(minSize, Math.min(baseSize, scaled));
}

/**
 * Determines whether a user or an account is eligible for the Funded Trader Certificate
 */
export function isUserEligibleForCertificate(params: {
  profile?: {
    is_funded?: boolean;
    account_status?: string;
    fundedBalance?: number;
    status?: string;
  } | null;
  accounts?: Array<{
    id?: string;
    status?: string;
    phase?: string;
    tier?: string;
    tierName?: string;
    size?: string | number;
    passedAt?: string;
  }> | null;
  supabaseAccountStatus?: string | null;
}): EligibilityResult {
  const { profile, accounts = [], supabaseAccountStatus } = params;

  // 1. Direct status in Supabase profiles or trading_accounts
  const rawStatus = (supabaseAccountStatus || '').toLowerCase().trim();
  if (rawStatus === 'funded' || rawStatus === 'passed' || rawStatus === 'active_funded') {
    return {
      eligible: true,
      reason: `Account status is marked as '${rawStatus}' in Supabase database.`,
      passedDate: formatCertificateDate(new Date()),
    };
  }

  // 2. Check profile flags
  if (
    profile?.is_funded === true ||
    (profile?.account_status && ['funded', 'passed', 'active_funded'].includes(profile.account_status.toLowerCase())) ||
    (profile?.status && ['funded', 'passed'].includes(profile.status.toLowerCase())) ||
    (typeof profile?.fundedBalance === 'number' && profile.fundedBalance > 0)
  ) {
    return {
      eligible: true,
      reason: 'User profile is verified as an active BFT Funded Trader.',
      passedDate: formatCertificateDate(new Date()),
    };
  }

  // 3. Check trading accounts list
  if (Array.isArray(accounts)) {
    const passedAccount = accounts.find((acc) => {
      const s = (acc.status || '').toLowerCase();
      const p = (acc.phase || '').toLowerCase();
      const t = (acc.tier || '').toLowerCase();
      return (
        s === 'passed' ||
        s === 'funded' ||
        s === 'active_funded' ||
        p === 'funded' ||
        t === 'instant'
      );
    });

    if (passedAccount) {
      return {
        eligible: true,
        matchingAccountId: passedAccount.id,
        matchingAccountTier: passedAccount.tierName || passedAccount.tier || 'Funded Trader',
        accountSize: passedAccount.size,
        passedDate: formatCertificateDate(passedAccount.passedAt || new Date()),
        reason: `Trading Account ${passedAccount.id} successfully passed and achieved Funded Trader status.`,
      };
    }
  }

  return {
    eligible: false,
    reason: 'Complete an evaluation challenge or activate an Instant Funded account to unlock your Official Certificate.',
  };
}

/**
 * Preloads an image into an HTMLImageElement
 */
export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load certificate template image at '${src}': ${e}`));
    img.src = src;
  });
}

/**
 * Draws the high-res 1920x1357 certificate on an HTML5 canvas
 */
export async function renderCertificateToCanvas(
  canvas: HTMLCanvasElement,
  options: CertificateRenderOptions
): Promise<void> {
  const {
    fullName,
    passedDate,
    templateUrl = CERTIFICATE_CONSTANTS.DEFAULT_TEMPLATE_PATH,
    canvasWidth = CERTIFICATE_CONSTANTS.WIDTH,
    canvasHeight = CERTIFICATE_CONSTANTS.HEIGHT,
  } = options;

  // Set buffer resolution to 1920x1357
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context.');
  }

  // High quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Draw base template background
  try {
    const bgImage = await preloadImage(templateUrl);
    ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
  } catch (err) {
    // If /certificate-template.png fails, try alternative asset path
    try {
      const fallbackUrl = '/assets/aistudio/Gemini_Generated_Image_p0amf3p0amf3p0am_642da8af.jpg';
      const bgImage = await preloadImage(fallbackUrl);
      ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
    } catch {
      // Draw luxury fallback dark background if image unavailable
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.strokeStyle = '#c88a32';
      ctx.lineWidth = 12;
      ctx.strokeRect(30, 30, canvasWidth - 60, canvasHeight - 60);
    }
  }

  // 2. Format inputs
  const rawName = fullName && fullName.trim() ? fullName.trim() : 'BFT FUNDED TRADER';
  const nameUpper = rawName.toUpperCase();
  const formattedDate = formatCertificateDate(passedDate);
  const subtitle = formatCertificateSubtitle(formattedDate);

  const centerX = CERTIFICATE_CONSTANTS.CENTER_X;
  const nameY = CERTIFICATE_CONSTANTS.NAME_Y;
  const dateY = CERTIFICATE_CONSTANTS.DATE_Y;

  // 3. Render Recipient Name with Gold Gradient Fill
  const fontSize = calculateNameFontSize(nameUpper);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontSize}px "Cinzel", "Trajan Pro", "Times New Roman", serif, sans-serif`;

  // Measure text to create exact bounding gradient
  const metrics = ctx.measureText(nameUpper);
  const textWidth = metrics.width;

  // Create subtle vertical & diagonal luxury gold gradient (#f5b963 to #c88a32)
  const gradient = ctx.createLinearGradient(
    centerX - textWidth / 2,
    nameY - fontSize / 2,
    centerX + textWidth / 2,
    nameY + fontSize / 2
  );
  gradient.addColorStop(0, CERTIFICATE_CONSTANTS.GOLD_START); // #f5b963
  gradient.addColorStop(0.35, '#ffdd93');
  gradient.addColorStop(0.7, '#e5a54b');
  gradient.addColorStop(1, CERTIFICATE_CONSTANTS.GOLD_END);   // #c88a32

  // Subtle drop shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;

  ctx.fillStyle = gradient;
  ctx.fillText(nameUpper, centerX, nameY);

  // Subtle golden rim outline for crisp high-resolution definition
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.4)';
  ctx.strokeText(nameUpper, centerX, nameY);
  ctx.restore();

  // 4. Render 'WHO ON THIS DAY ' + formatted_passed_date in white uppercase font right below
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px "Montserrat", "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  // Letter spacing for prestigious editorial finish
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '3px';
  }

  ctx.fillText(subtitle, centerX, dateY);
  ctx.restore();
}

/**
 * Downloads the high-resolution certificate canvas as a PNG
 */
export function downloadCertificatePng(
  canvas: HTMLCanvasElement,
  traderName: string = 'Trader'
): void {
  const sanitized = traderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Trader';
  const filename = `BFT_Funded_Trader_Certificate_${sanitized}.png`;

  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generates and downloads a print-ready landscape PDF using jsPDF
 */
export function downloadCertificatePdf(
  canvas: HTMLCanvasElement,
  traderName: string = 'Trader'
): void {
  const sanitized = traderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Trader';
  const filename = `BFT_Funded_Trader_Certificate_${sanitized}.pdf`;

  // jsPDF landscape orientation matching exact 1920x1357 canvas pixels
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [CERTIFICATE_CONSTANTS.WIDTH, CERTIFICATE_CONSTANTS.HEIGHT],
    hotfixes: ['px_scaling'],
  });

  const imgData = canvas.toDataURL('image/png', 1.0);
  doc.addImage(imgData, 'PNG', 0, 0, CERTIFICATE_CONSTANTS.WIDTH, CERTIFICATE_CONSTANTS.HEIGHT);
  doc.save(filename);
}
