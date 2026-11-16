/**
 * Automated Client-Side BFT Funded Trader Certificate Generator
 * Canvas (1920x1357) & jsPDF Print-Ready PDF Generator
 *
 * Official Permanent Template:
 * "CERTIFIED FUNDED TRADER — BFT LLC"
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
  NAME_Y: 552,
  DATE_Y: 632,
  BASE_FONT_SIZE: 66,
  MIN_FONT_SIZE: 38,
  MAX_TEXT_WIDTH: 1280,
  GOLD_START: '#f5b963',
  GOLD_END: '#c88a32',
  DEFAULT_TEMPLATE_PATH: '/certificate-template.png',
  BFT_LOGO_PATH: '/bft-logo.png',
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
    const parsed = new Date(dateInput);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    } else {
      return dateInput.trim().toUpperCase();
    }
  } else {
    date = new Date();
  }

  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
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

  const estimatedWidth = length * baseSize * 0.65;
  if (estimatedWidth <= maxWidth) {
    return baseSize;
  }

  const scaled = Math.floor(maxWidth / (length * 0.65));
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

  const rawStatus = (supabaseAccountStatus || '').toLowerCase().trim();
  if (rawStatus === 'funded' || rawStatus === 'passed' || rawStatus === 'active_funded') {
    return {
      eligible: true,
      reason: `Account status is marked as '${rawStatus}' in Supabase database.`,
      passedDate: formatCertificateDate(new Date()),
    };
  }

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

export interface CertificateRenderResult {
  usedImageTemplate: boolean;
  source: string;
}

/**
 * Preloads an image into an HTMLImageElement and verifies non-zero natural dimensions
 */
export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img);
      } else {
        reject(new Error(`Loaded image at '${src}' has zero dimensions.`));
      }
    };
    img.onerror = (e) => reject(new Error(`Failed to load certificate template image at '${src}': ${e}`));
    img.src = src;
  });
}

function drawCurvedArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  radius: number,
  angleSpan: number,
  isBottom: boolean
): void {
  const chars = text.split('');
  if (chars.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const step = chars.length > 1 ? angleSpan / (chars.length - 1) : 0;
  const baseAngle = isBottom ? Math.PI / 2 : -Math.PI / 2;

  chars.forEach((char, i) => {
    const offset = (i - (chars.length - 1) / 2) * step;
    const angle = isBottom ? baseAngle - offset : baseAngle + offset;

    ctx.save();
    ctx.translate(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    ctx.rotate(isBottom ? angle - Math.PI / 2 : angle + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });

  ctx.restore();
}

function drawGoldGuillocheSeal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number
): void {
  ctx.save();

  // Outer soft shadow beneath seal
  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;

  // Scalloped metallic gold rosette silhouette
  const petals = 24;
  const outerR = 148;
  const innerR = 132;
  ctx.beginPath();
  for (let i = 0; i <= 360; i++) {
    const rad = (i * Math.PI) / 180;
    const r = (outerR + innerR) / 2 + ((outerR - innerR) / 2) * Math.cos(petals * rad);
    const px = cx + r * Math.cos(rad);
    const py = cy + r * Math.sin(rad);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  const sealBaseGrad = ctx.createRadialGradient(cx - 28, cy - 28, 18, cx, cy, outerR);
  sealBaseGrad.addColorStop(0, '#ffe8a8');
  sealBaseGrad.addColorStop(0.45, '#e2ab52');
  sealBaseGrad.addColorStop(0.85, '#b67d2a');
  sealBaseGrad.addColorStop(1, '#7a4e13');
  ctx.fillStyle = sealBaseGrad;
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Dark recess under guilloche lace
  ctx.beginPath();
  ctx.arc(cx, cy, 132, 0, Math.PI * 2);
  ctx.fillStyle = '#18140f';
  ctx.fill();

  // Intricate gold guilloche spirograph petals around circumference
  ctx.strokeStyle = 'rgba(243, 198, 114, 0.85)';
  ctx.lineWidth = 1.65;
  for (let ring = 0; ring < 3; ring++) {
    ctx.beginPath();
    const rMid = 123 - ring * 4;
    const amp = 14 - ring * 2.5;
    const phase = (ring * Math.PI) / 18;
    const steps = 420;
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * Math.PI * 2;
      const r = rMid + amp * Math.sin(18 * t + phase);
      const px = cx + r * Math.cos(t);
      const py = cy + r * Math.sin(t);
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Concentric metallic gold band for curved "FUNDED / FUNDED TRADER" text
  const bandGrad = ctx.createLinearGradient(cx - 104, cy - 104, cx + 104, cy + 104);
  bandGrad.addColorStop(0, '#f4ca78');
  bandGrad.addColorStop(0.5, '#d59941');
  bandGrad.addColorStop(1, '#9d6a22');

  ctx.beginPath();
  ctx.arc(cx, cy, 104, 0, Math.PI * 2);
  ctx.fillStyle = bandGrad;
  ctx.fill();

  // Crisp dark framing ring
  ctx.strokeStyle = '#1f180d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 101, 0, Math.PI * 2);
  ctx.stroke();

  // Inner dark charcoal medallion disc
  ctx.beginPath();
  ctx.arc(cx, cy, 60, 0, Math.PI * 2);
  ctx.fillStyle = '#171410';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f5cb7a';
  ctx.stroke();

  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0px';
  }

  // Curved "FUNDED" & "FUNDED TRADER" cleanly centered in the gold track
  ctx.fillStyle = '#181208';
  ctx.font = '800 22px "Barlow Condensed", "Montserrat", sans-serif';
  drawCurvedArcText(ctx, 'FUNDED', cx, cy, 82, Math.PI * 0.44, false);

  ctx.font = '800 20px "Barlow Condensed", "Montserrat", sans-serif';
  drawCurvedArcText(ctx, 'FUNDED TRADER', cx, cy, 83, Math.PI * 0.72, true);

  // Left & Right tiny stars on horizontal axis
  ctx.fillStyle = '#181208';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', cx - 82, cy);
  ctx.fillText('★', cx + 82, cy);

  // Center bold condensed gold "BFT"
  const bftGrad = ctx.createLinearGradient(cx, cy - 28, cx, cy + 28);
  bftGrad.addColorStop(0, '#ffe6a3');
  bftGrad.addColorStop(0.55, '#e2a84e');
  bftGrad.addColorStop(1, '#b37927');
  ctx.fillStyle = bftGrad;
  ctx.font = '800 58px "Barlow Condensed", "Oswald", sans-serif';
  ctx.fillText('BFT', cx, cy + 3);

  ctx.restore();
}

function drawExecutiveSignatureBlock(
  ctx: CanvasRenderingContext2D,
  options: {
    centerX: number;
    lineY: number;
    name: string;
    city: string;
    title: string;
  }
): void {
  const { centerX, lineY, name, city, title } = options;
  const halfRule = 215;

  ctx.save();
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0px';
  }

  // Cursive handwritten white signature shifted slightly left so city label sits cleanly at bottom-right above line
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '400 44px "Allura", "Brush Script MT", "Segoe Script", cursive';
  ctx.fillText(name, centerX - 48, lineY - 26);

  // Tiny city label right-aligned cleanly above the right end of the signature rule
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 15px "Outfit", "Montserrat", sans-serif';
  ctx.fillText(city, centerX + halfRule - 2, lineY - 11);

  // Thin crisp white horizontal signature line
  ctx.strokeStyle = 'rgba(229, 231, 235, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - halfRule, lineY);
  ctx.lineTo(centerX + halfRule, lineY);
  ctx.stroke();

  // Printed executive name below rule
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f3f4f6';
  ctx.font = '600 28px "Outfit", "Montserrat", sans-serif';
  ctx.fillText(name, centerX, lineY + 38);

  // Printed uppercase executive title
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 18px "Outfit", "Montserrat", sans-serif';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.8px';
  }
  ctx.fillText(title.toUpperCase(), centerX, lineY + 74);
  ctx.restore();
}

function drawFallbackVectorShield(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  ctx.save();
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0px';
  }
  const cx = x + size / 2;
  const cy = y + size / 2;

  ctx.beginPath();
  ctx.moveTo(cx, y + 6);
  ctx.lineTo(x + size - 10, y + 26);
  ctx.lineTo(x + size - 16, y + size * 0.62);
  ctx.lineTo(cx, y + size - 6);
  ctx.lineTo(x + 16, y + size * 0.62);
  ctx.lineTo(x + 10, y + 26);
  ctx.closePath();

  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, '#f38225');
  grad.addColorStop(1, '#c9560c');
  ctx.fillStyle = '#f3f4f6';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = grad;
  ctx.stroke();

  ctx.fillStyle = '#e57423';
  ctx.font = `900 ${Math.round(size * 0.4)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BFT', cx, cy + 4);
  ctx.restore();
}

/**
 * Renders the permanent official BFT "CERTIFIED FUNDED TRADER / BFT LLC" certificate
 * backdrop matching the corporate template specification at 1920x1357.
 */
export function drawOfficialBftCertificateTemplate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bftShieldImg?: HTMLImageElement | null
): void {
  ctx.save();

  // 1. Deep matte charcoal-black base
  const baseGrad = ctx.createLinearGradient(0, 0, width, height);
  baseGrad.addColorStop(0, '#16171a');
  baseGrad.addColorStop(0.5, '#111215');
  baseGrad.addColorStop(1, '#0d0e11');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle architectural diagonal overlapping geometric facets (diamonds/chevrons)
  const drawFacet = (pts: Array<[number, number]>, color: string) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  drawFacet([[0, 0], [820, 0], [320, 520], [0, 260]], 'rgba(255,255,255,0.024)');
  drawFacet([[520, 0], [1340, 0], [880, 480], [280, 260]], 'rgba(0,0,0,0.22)');
  drawFacet([[1280, 0], [width, 0], [width, 460], [920, 240]], 'rgba(255,255,255,0.022)');
  drawFacet([[0, 320], [420, 680], [0, 1080]], 'rgba(255,255,255,0.026)');
  drawFacet([[160, 440], [540, 820], [160, 1180], [0, 880]], 'rgba(255,255,255,0.018)');
  drawFacet([[width, 280], [1460, 680], [width, 1100]], 'rgba(255,255,255,0.026)');
  drawFacet([[1740, 440], [1360, 820], [1740, 1180], [width, 860]], 'rgba(255,255,255,0.018)');
  drawFacet([[480, 420], [960, 140], [1440, 420], [960, 740]], 'rgba(255,255,255,0.014)');
  drawFacet([[420, height], [960, 880], [1500, height]], 'rgba(0,0,0,0.25)');

  // Gentle studio radial glow in upper center
  const glow = ctx.createRadialGradient(width / 2, height * 0.42, 60, width / 2, height * 0.45, width * 0.65);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.035)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // 3. Double crisp white corporate border frame
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, width - 112, height - 112);

  // 4. Top-Left Title: CERTIFIED / FUNDED TRADER
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#f8fafc';
  ctx.font = '300 74px "Barlow Condensed", "Outfit", sans-serif';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '4px';
  }
  ctx.fillText('CERTIFIED', 142, 198);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#e57423';
  ctx.font = '800 106px "Barlow Condensed", "Outfit", sans-serif';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '1.5px';
  }
  ctx.fillText('FUNDED TRADER', 140, 302);
  ctx.restore();

  // 5. Top-Right Brand Mark: Official BFT Bull Shield + "BFT LLC"
  const logoSize = 186;
  const logoX = 1140;
  const logoY = 132;

  if (bftShieldImg) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 14;
    ctx.drawImage(bftShieldImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  } else {
    drawFallbackVectorShield(ctx, logoX, logoY, logoSize);
  }

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 110px "Barlow Condensed", "Outfit", sans-serif';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '1px';
  }
  ctx.fillText('BFT LLC', 1358, 228);
  ctx.restore();

  // 6. Presentation Headline
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eef0f4';
  ctx.font = '500 28px "Outfit", "Montserrat", sans-serif';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '1.6px';
  }
  ctx.fillText('THIS CERTIFICATE IS PROUDLY PRESENTED TO', width / 2, 434);
  ctx.restore();

  // (Space between Y=460 and Y=715 is intentionally reserved for Gold Trader Name + WHO ON THIS DAY <DATE>)

  // 7. Mixed White & Orange Certification Achievement Line
  ctx.save();
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.5px';
  }
  const segments = [
    { text: 'HAS SUCCESSFULLY PASSED THE ', color: '#f3f4f6', font: '500 24px "Outfit", "Montserrat", sans-serif' },
    { text: 'BFT FUNDED CHALLENGE', color: '#e57423', font: '700 24px "Outfit", "Montserrat", sans-serif' },
    { text: ' AND IS OFFICIALLY A ', color: '#f3f4f6', font: '500 24px "Outfit", "Montserrat", sans-serif' },
    { text: 'BFT FUNDED TRADER.', color: '#e57423', font: '700 24px "Outfit", "Montserrat", sans-serif' },
  ];

  const widths = segments.map((s) => {
    ctx.font = s.font;
    return ctx.measureText(s.text).width;
  });
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  let curX = (width - totalWidth) / 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  segments.forEach((s, idx) => {
    ctx.font = s.font;
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, curX, 754);
    curX += widths[idx];
  });
  ctx.restore();

  // 8. Two-Line Consistency & Discipline Sub-Copy
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d1d5db';
  ctx.font = '400 20px "Outfit", "Montserrat", sans-serif';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.5px';
  }
  ctx.fillText(
    'THIS ACHIEVEMENT RECOGNIZES THEIR COMMITMENT IN MEETING THE TRADING OBJECTIVES, AS WELL AS',
    width / 2,
    818
  );
  ctx.fillText(
    'DEMONSTRATING THE FUNDAMENTAL SKILLS NECESSARY TO BEING A CONSISTENT AND DISCIPLINED TRADER.',
    width / 2,
    858
  );
  ctx.restore();

  // 9. Bottom Row: Yousuf Al-Mansoori (Left) + Gold Guilloche Seal (Center) + Victoria Sterling (Right)
  drawExecutiveSignatureBlock(ctx, {
    centerX: 405,
    lineY: 1112,
    name: 'Yousuf Al-Mansoori',
    city: 'Dubai, UAE',
    title: 'Senior Performance Coach',
  });

  drawGoldGuillocheSeal(ctx, width / 2, 1105);

  drawExecutiveSignatureBlock(ctx, {
    centerX: width - 405,
    lineY: 1112,
    name: 'Victoria Sterling',
    city: 'London, England',
    title: 'Founder & CEO of BFT LLC',
  });

  ctx.restore();
}

/**
 * Draws the permanent high-res 1920x1357 official BFT certificate on an HTML5 canvas
 */
export async function renderCertificateToCanvas(
  canvas: HTMLCanvasElement,
  options: CertificateRenderOptions
): Promise<CertificateRenderResult> {
  const {
    fullName,
    passedDate,
    templateUrl = CERTIFICATE_CONSTANTS.DEFAULT_TEMPLATE_PATH,
    canvasWidth = CERTIFICATE_CONSTANTS.WIDTH,
    canvasHeight = CERTIFICATE_CONSTANTS.HEIGHT,
  } = options;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Ensure web fonts (Barlow Condensed, Cinzel, Montserrat, Outfit, Allura) are explicitly loaded before drawing
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await Promise.race([
        Promise.allSettled([
          document.fonts.load('400 44px "Allura"'),
          document.fonts.load('300 74px "Barlow Condensed"'),
          document.fonts.load('800 106px "Barlow Condensed"'),
          document.fonts.load('bold 66px "Cinzel"'),
          document.fonts.load('500 28px "Outfit"'),
          document.fonts.load('700 24px "Montserrat"'),
          document.fonts.ready,
        ]),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // ignore font loading timeout
    }
  }

  // Try loading official raster template if stored at /certificate-template.png,
  // otherwise draw the locked pixel-faithful BFT template natively with /bft-logo.png
  let usedImageTemplate = false;
  let loadedSource = 'official-bft-template';

  if (templateUrl) {
    try {
      const bgImage = await preloadImage(templateUrl);
      ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
      usedImageTemplate = true;
      loadedSource = templateUrl;
    } catch {
      // Render locked permanent official template directly
    }
  }

  if (!usedImageTemplate) {
    let shieldImg: HTMLImageElement | null = null;
    try {
      shieldImg = await preloadImage(CERTIFICATE_CONSTANTS.BFT_LOGO_PATH);
    } catch {
      shieldImg = null;
    }
    drawOfficialBftCertificateTemplate(ctx, canvasWidth, canvasHeight, shieldImg);
  }

  // Format dynamic recipient name & completion date
  const rawName = fullName && fullName.trim() ? fullName.trim() : 'BFT FUNDED TRADER';
  const nameUpper = rawName.toUpperCase();
  const formattedDate = formatCertificateDate(passedDate);
  const subtitle = formatCertificateSubtitle(formattedDate);

  const centerX = CERTIFICATE_CONSTANTS.CENTER_X;
  const nameY = CERTIFICATE_CONSTANTS.NAME_Y;
  const dateY = CERTIFICATE_CONSTANTS.DATE_Y;

  // Render Recipient Name with Luxury Gold Gradient Fill
  const fontSize = calculateNameFontSize(nameUpper);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontSize}px "Cinzel", "Trajan Pro", "Times New Roman", serif`;

  const metrics = ctx.measureText(nameUpper);
  const textWidth = metrics.width;

  const gradient = ctx.createLinearGradient(
    centerX - textWidth / 2,
    nameY - fontSize / 2,
    centerX + textWidth / 2,
    nameY + fontSize / 2
  );
  gradient.addColorStop(0, CERTIFICATE_CONSTANTS.GOLD_START);
  gradient.addColorStop(0.35, '#ffdd93');
  gradient.addColorStop(0.7, '#e5a54b');
  gradient.addColorStop(1, CERTIFICATE_CONSTANTS.GOLD_END);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;

  ctx.fillStyle = gradient;
  ctx.fillText(nameUpper, centerX, nameY);

  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.42)';
  ctx.strokeText(nameUpper, centerX, nameY);
  ctx.restore();

  // Render 'WHO ON THIS DAY ' + formatted_passed_date directly below name
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 23px "Montserrat", "Inter", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '3px';
  }

  ctx.fillText(subtitle, centerX, dateY);
  ctx.restore();

  return { usedImageTemplate, source: loadedSource };
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
