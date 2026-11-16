import { jsPDF } from 'jspdf';
import type { TradingAccount } from '../types/index.ts';
import type { PurchasedFundedWallet } from './fundedWalletAnalytics.ts';
import { calculateWithdrawalBreakdown, isPersonalLiveAccount } from './propRules.ts';

export interface ChallengeCertificateData {
  traderName: string;
  challengeTier: string;
  passDateFormatted: string;
  verificationId: string;
  accountId: string;
  accountSize: number;
  profitSplitPercent: number;
}

export interface LiveFundedAccountMetrics {
  accountId: string;
  tierLabel: string;
  initialBalance: number;
  currentBalance: number;
  liveEquity: number;
  netProfit: number;
  netProfitPercent: number;
  profitSplitPercent: number;
  scalingActive: boolean;
  dailyDrawdownUsed: number;
  dailyDrawdownLimit: number;
  dailyDrawdownLimitPercent: number;
  dailyDrawdownRatio: number;
  maxDrawdownUsed: number;
  maxDrawdownLimit: number;
  maxDrawdownLimitPercent: number;
  maxDrawdownRatio: number;
  completedProfitableDays: number;
  minProfitableDays: number;
  qualifyingDayThresholdUsd: number;
}

export interface FundedSimulationInput {
  initialCapital: number;
  monthlyReturnPercent: number;
  horizonMonths: number;
  profitSplitPercent?: number;
  reinvestRatioPercent?: number;
}

export interface FundedSimulationMonthPoint {
  monthIndex: number;
  monthLabel: string;
  startingCapital: number;
  endingEquity: number;
  monthlyGrossProfit: number;
  reinvestedProfit: number;
  traderPayout: number;
  cumulativePayouts: number;
  effectiveSplitPercent: number;
  qualifyingTradingDays: number;
  cumulativeQualifyingDays: number;
  dailyTargetUsd: number;
}

export interface FundedSimulationResult {
  initialCapital: number;
  monthlyReturnPercent: number;
  horizonMonths: number;
  reinvestRatioPercent: number;
  endingEquity: number;
  totalGrossProfit: number;
  totalTraderPayouts: number;
  totalQualifyingDays: number;
  finalProfitSplitPercent: number;
  capitalGrowthMultiplier: number;
  timeline: FundedSimulationMonthPoint[];
}

export const SIMULATION_DAILY_RULE_PERCENT = 0.5;
export const MAX_MARKET_DAYS_PER_MONTH = 22;

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

export function formatPassDateDisplay(input?: string | number | Date | null): string {
  let d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) {
    d = new Date();
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function formatChallengeTierLabel(account?: Partial<TradingAccount> | null): string {
  const size = Math.max(2500, Number(account?.size || account?.initialBalance || 50000));
  const formattedSize = `$${size.toLocaleString('en-US')}`;
  const rawTier = String(account?.accountType || account?.tier || account?.tierName || '').toLowerCase();

  if (rawTier.includes('two') || rawTier.includes('2')) {
    return `${formattedSize} 2-Step Funded`;
  }
  if (rawTier.includes('one') || rawTier.includes('1')) {
    return `${formattedSize} 1-Step Funded`;
  }
  if (rawTier.includes('instant')) {
    return `${formattedSize} Instant Funded`;
  }
  return `${formattedSize} 2-Step Funded`;
}

export function buildChallengeCertificateData(params: {
  traderName?: string | null;
  passedAccount?: Partial<TradingAccount> | null;
  deployedAccount?: Partial<TradingAccount> | null;
  certificateId?: string | null;
  passDate?: string | number | Date | null;
}): ChallengeCertificateData {
  const cleanName =
    params.traderName && params.traderName.trim().length > 0
      ? params.traderName.trim()
      : 'BFT Funded Trader';

  const sourceAcc = params.passedAccount || params.deployedAccount || null;
  const accountId = String(
    params.deployedAccount?.id || params.passedAccount?.id || 'BFT-FUNDED-001'
  );
  const accountSize = Math.max(
    2500,
    Number(
      params.deployedAccount?.size ||
        params.deployedAccount?.initialBalance ||
        params.passedAccount?.size ||
        params.passedAccount?.initialBalance ||
        50000
    )
  );

  const rawCertId =
    params.certificateId ||
    params.deployedAccount?.certificateId ||
    params.passedAccount?.certificateId;
  const suffix = accountId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || '2S50K';
  const verificationId =
    rawCertId && rawCertId.trim().length > 0 ? rawCertId.trim() : `BFT-VER-${suffix}`;

  const breakdown = calculateWithdrawalBreakdown(
    1000,
    Number(params.deployedAccount?.monthsCompleted ?? 1),
    isPersonalLiveAccount(params.deployedAccount as TradingAccount | null)
  );

  return {
    traderName: cleanName,
    challengeTier: formatChallengeTierLabel(sourceAcc),
    passDateFormatted: formatPassDateDisplay(
      params.passDate ||
        (params.passedAccount as any)?.passedAt ||
        (params.deployedAccount as any)?.createdDate
    ),
    verificationId,
    accountId,
    accountSize,
    profitSplitPercent: breakdown.profitSplitPercent,
  };
}

export function resolveLiveFundedAccountMetrics(
  account?: TradingAccount | null,
  wallet?: PurchasedFundedWallet | null
): LiveFundedAccountMetrics {
  const initialBalance = round2(
    Math.max(
      0,
      Number(
        wallet?.initial_balance ??
          account?.initialBalance ??
          account?.size ??
          account?.currentBalance ??
          0
      )
    )
  );
  const currentBalance = round2(
    Math.max(0, Number(wallet?.current_balance ?? account?.currentBalance ?? initialBalance))
  );
  const liveEquity = round2(
    Math.max(0, Number(wallet?.current_equity ?? account?.equity ?? currentBalance))
  );
  const netProfit = round2(currentBalance - initialBalance);
  const netProfitPercent =
    initialBalance > 0 ? round2((netProfit / initialBalance) * 100) : 0;

  const isPersonal = isPersonalLiveAccount(account);
  const breakdown = calculateWithdrawalBreakdown(
    1000,
    Number(account?.monthsCompleted ?? 1),
    isPersonal
  );
  const profitSplitPercent = isPersonal ? 100 : account?.scalingActive ? 90 : breakdown.profitSplitPercent;

  const dailyDrawdownLimitPercent = round2(
    Number(wallet?.daily_drawdown_limit_percent ?? account?.dailyLossLimitPercent ?? 8)
  );
  const dailyDrawdownLimit = round2(
    Number(
      wallet?.daily_drawdown_limit_amount ??
        (dailyDrawdownLimitPercent > 0 ? (initialBalance * dailyDrawdownLimitPercent) / 100 : 0)
    )
  );
  const dailyDrawdownUsed = round2(
    Math.max(
      0,
      Number(
        wallet?.current_daily_drawdown ??
          Math.max(
            0,
            (account?.startingDayEquity || initialBalance) - Math.min(currentBalance, liveEquity)
          )
      )
    )
  );
  const dailyDrawdownRatio =
    dailyDrawdownLimit > 0
      ? Math.min(100, Math.max(0, round2((dailyDrawdownUsed / dailyDrawdownLimit) * 100)))
      : 0;

  const maxDrawdownLimitPercent = round2(
    Number(wallet?.max_drawdown_limit_percent ?? account?.maxOverallLossPercent ?? 20)
  );
  const maxDrawdownLimit = round2(
    Number(
      wallet?.max_drawdown_limit_amount ??
        (maxDrawdownLimitPercent > 0 ? (initialBalance * maxDrawdownLimitPercent) / 100 : 0)
    )
  );
  const maxDrawdownUsed = round2(
    Math.max(
      0,
      Number(
        wallet?.current_max_drawdown ??
          Math.max(0, initialBalance - Math.min(currentBalance, liveEquity))
      )
    )
  );
  const maxDrawdownRatio =
    maxDrawdownLimit > 0
      ? Math.min(100, Math.max(0, round2((maxDrawdownUsed / maxDrawdownLimit) * 100)))
      : 0;

  const completedProfitableDays = Math.max(
    0,
    Math.round(Number(wallet?.completed_profitable_days ?? account?.tradingDaysCompleted ?? 0))
  );
  const minProfitableDays = Math.max(1, Math.round(Number(wallet?.min_profitable_days ?? 5)));
  const qualifyingDayThresholdUsd = round2(
    (initialBalance * SIMULATION_DAILY_RULE_PERCENT) / 100
  );

  const tierLabel =
    wallet?.challenge_type ||
    account?.tierName ||
    formatChallengeTierLabel(account);

  return {
    accountId: String(wallet?.account_id || account?.id || 'BFT-LIVE-001'),
    tierLabel,
    initialBalance,
    currentBalance,
    liveEquity,
    netProfit,
    netProfitPercent,
    profitSplitPercent,
    scalingActive: profitSplitPercent >= 90,
    dailyDrawdownUsed,
    dailyDrawdownLimit,
    dailyDrawdownLimitPercent,
    dailyDrawdownRatio,
    maxDrawdownUsed,
    maxDrawdownLimit,
    maxDrawdownLimitPercent,
    maxDrawdownRatio,
    completedProfitableDays,
    minProfitableDays,
    qualifyingDayThresholdUsd,
  };
}

/**
 * Pure Funded Growth & Payout Simulation Engine.
 * Models compound capital scaling, the 0.5% daily profitable day rule, and BFT 80% -> 90% scaling profit splits.
 */
export function runFundedGrowthSimulation(input: FundedSimulationInput): FundedSimulationResult {
  const initialCapital = round2(Math.max(1000, Number(input.initialCapital || 50000)));
  const monthlyReturnPercent = round2(
    Math.max(0, Math.min(100, Number(input.monthlyReturnPercent ?? 10)))
  );
  const horizonMonths = Math.max(1, Math.min(36, Math.round(Number(input.horizonMonths ?? 12))));
  const baseSplit = Math.max(50, Math.min(100, Number(input.profitSplitPercent ?? 80)));
  const reinvestRatioPercent = round2(
    Math.max(0, Math.min(100, Number(input.reinvestRatioPercent ?? 40)))
  );

  const timeline: FundedSimulationMonthPoint[] = [];
  let activeCapital = initialCapital;
  let cumulativePayouts = 0;
  let totalGrossProfit = 0;
  let totalQualifyingDays = 0;

  // Estimate qualifying profitable days per month under the 0.5% rule
  const estimatedQualifyingDaysPerMonth =
    monthlyReturnPercent <= 0
      ? 0
      : Math.min(
          MAX_MARKET_DAYS_PER_MONTH,
          Math.max(1, Math.round(monthlyReturnPercent / SIMULATION_DAILY_RULE_PERCENT))
        );

  for (let m = 1; m <= horizonMonths; m++) {
    const startingCapital = round2(activeCapital);
    const effectiveSplitPercent = m >= 4 && baseSplit < 90 ? 90 : baseSplit;
    const monthlyGrossProfit = round2((startingCapital * monthlyReturnPercent) / 100);
    const traderShareTotal = round2((monthlyGrossProfit * effectiveSplitPercent) / 100);

    // Portion kept to compound / scale active capital vs withdrawn as liquid payout
    const reinvestedProfit = round2((traderShareTotal * reinvestRatioPercent) / 100);
    const traderPayout = round2(Math.max(0, traderShareTotal - reinvestedProfit));
    const endingEquity = round2(startingCapital + reinvestedProfit);

    totalGrossProfit = round2(totalGrossProfit + monthlyGrossProfit);
    cumulativePayouts = round2(cumulativePayouts + traderPayout);
    totalQualifyingDays += estimatedQualifyingDaysPerMonth;

    timeline.push({
      monthIndex: m,
      monthLabel: `M${m}`,
      startingCapital,
      endingEquity,
      monthlyGrossProfit,
      reinvestedProfit,
      traderPayout,
      cumulativePayouts,
      effectiveSplitPercent,
      qualifyingTradingDays: estimatedQualifyingDaysPerMonth,
      cumulativeQualifyingDays: totalQualifyingDays,
      dailyTargetUsd: round2((startingCapital * SIMULATION_DAILY_RULE_PERCENT) / 100),
    });

    activeCapital = endingEquity;
  }

  const lastPoint = timeline[timeline.length - 1];
  const endingEquity = lastPoint ? lastPoint.endingEquity : initialCapital;
  const finalProfitSplitPercent = lastPoint ? lastPoint.effectiveSplitPercent : baseSplit;

  return {
    initialCapital,
    monthlyReturnPercent,
    horizonMonths,
    reinvestRatioPercent,
    endingEquity,
    totalGrossProfit,
    totalTraderPayouts: cumulativePayouts,
    totalQualifyingDays,
    finalProfitSplitPercent,
    capitalGrowthMultiplier: round2(endingEquity / initialCapital),
    timeline,
  };
}

/**
 * Renders a crisp high-resolution (1600x1000) Deep Black & Ice Blue Challenge Passed Certificate on Canvas.
 */
export function renderGraduationCertificateCanvas(
  canvas: HTMLCanvasElement,
  data: ChallengeCertificateData
): void {
  const width = 1600;
  const height = 1000;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep Black backdrop gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#04070D');
  bg.addColorStop(0.5, '#06090F');
  bg.addColorStop(1, '#09111C');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Ice Blue radial aura
  const aura = ctx.createRadialGradient(width / 2, height * 0.42, 40, width / 2, height * 0.42, 650);
  aura.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
  aura.addColorStop(0.6, 'rgba(0, 229, 255, 0.04)');
  aura.addColorStop(1, 'rgba(6, 9, 15, 0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, width, height);

  // Outer Ice Blue border & inner hairline frame
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(56, 56, width - 112, height - 112);

  // Corner L-accents
  const cornerLen = 48;
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 5;
  const corners: Array<[number, number, number, number]> = [
    [36, 36, 1, 1],
    [width - 36, 36, -1, 1],
    [36, height - 36, 1, -1],
    [width - 36, height - 36, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * cornerLen);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * cornerLen, cy);
    ctx.stroke();
  }

  // Header brand + Verified Badge
  ctx.textAlign = 'center';
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.fillText('BINARY FUNDED TRADER  •  OFFICIAL GRADUATION CREDENTIAL', width / 2, 130);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 46px "Inter", -apple-system, sans-serif';
  ctx.fillText('CHALLENGE PASSED & CERTIFICATE', width / 2, 198);

  // Divider line
  const divGrad = ctx.createLinearGradient(width * 0.25, 0, width * 0.75, 0);
  divGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
  divGrad.addColorStop(0.5, '#00E5FF');
  divGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.22, 242);
  ctx.lineTo(width * 0.78, 242);
  ctx.stroke();

  // Presented to
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText('PROUDLY PRESENTED TO VERIFIED PROP TRADER', width / 2, 310);

  // Trader Name
  const nameUpper = data.traderName.toUpperCase();
  const nameFontSize = nameUpper.length > 26 ? 54 : 72;
  const nameGrad = ctx.createLinearGradient(width * 0.3, 360, width * 0.7, 430);
  nameGrad.addColorStop(0, '#FFFFFF');
  nameGrad.addColorStop(0.5, '#BAE6FD');
  nameGrad.addColorStop(1, '#38BDF8');
  ctx.fillStyle = nameGrad;
  ctx.font = `bold ${nameFontSize}px "Georgia", serif`;
  ctx.fillText(nameUpper, width / 2, 398);

  // Achievement Description
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '24px "Inter", -apple-system, sans-serif';
  ctx.fillText(
    'For successfully fulfilling every institutional risk-control & profit milestone on the',
    width / 2,
    482
  );

  // Challenge Tier Highlight Box
  ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2;
  ctx.fillRect(width / 2 - 330, 520, 660, 74);
  ctx.strokeRect(width / 2 - 330, 520, 660, 74);

  ctx.fillStyle = '#00E5FF';
  ctx.font = 'bold 30px "JetBrains Mono", monospace';
  ctx.fillText(data.challengeTier.toUpperCase(), width / 2, 567);

  // Metadata Columns (Pass Date, Verification ID, Profit Split)
  const cols = [
    { x: 350, label: 'PASS DATE', value: data.passDateFormatted.toUpperCase() },
    { x: 800, label: 'VERIFICATION ID', value: data.verificationId },
    { x: 1250, label: 'FUNDED PROFIT SPLIT', value: `${data.profitSplitPercent}% TO TRADER` },
  ];

  for (const col of cols) {
    ctx.fillStyle = '#0B111A';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(col.x - 190, 650, 380, 110);
    ctx.strokeRect(col.x - 190, 650, 380, 110);

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillText(col.label, col.x, 688);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 24px "JetBrains Mono", monospace';
    ctx.fillText(col.value, col.x, 730);
  }

  // Footer verification badge & signatures
  ctx.fillStyle = '#10B981';
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.fillText('VERIFIED BY BFT RISK & GRADUATION ENGINE  ✓', width / 2, 855);

  ctx.fillStyle = '#64748B';
  ctx.font = '16px "JetBrains Mono", monospace';
  ctx.fillText(
    `ACCOUNT: ${data.accountId}   •   ISSUED BY BINARY FUNDED TRADER LLC`,
    width / 2,
    905
  );
}

export function exportGraduationCertificatePng(
  canvas: HTMLCanvasElement,
  data: ChallengeCertificateData
): string {
  renderGraduationCertificateCanvas(canvas, data);
  const safeName = data.traderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Trader';
  const filename = `BFT_Challenge_Passed_${safeName}.png`;
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return filename;
}

export function exportGraduationCertificatePdf(
  canvas: HTMLCanvasElement,
  data: ChallengeCertificateData
): string {
  renderGraduationCertificateCanvas(canvas, data);
  const safeName = data.traderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Trader';
  const filename = `BFT_Challenge_Passed_${safeName}.pdf`;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1600, 1000],
    hotfixes: ['px_scaling'],
  });
  const imgData = canvas.toDataURL('image/png', 1.0);
  doc.addImage(imgData, 'PNG', 0, 0, 1600, 1000);
  doc.save(filename);
  return filename;
}
