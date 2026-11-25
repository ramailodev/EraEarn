import type { Investment, InvestmentPlan } from '../types';

export const DEFAULT_INVESTMENT_PLANS: InvestmentPlan[] = [
  {
    id: 'tier_core',
    name: 'Core Liquidity Vault',
    tierCode: 'CORE',
    minAmount: 100,
    maxAmount: 999,
    minMonthlyRoi: 5,
    maxMonthlyRoi: 7,
    lockDays: 30,
    payoutCycle: 'daily_accrual',
    description: 'Entry institutional yield pool backed by hedged stablecoin liquidity and short-duration treasury notes.',
    isActive: true,
    sortOrder: 1
  },
  {
    id: 'tier_prime',
    name: 'Prime Delta Strategy',
    tierCode: 'PRIME',
    minAmount: 1000,
    maxAmount: 9999,
    minMonthlyRoi: 8,
    maxMonthlyRoi: 11,
    lockDays: 60,
    payoutCycle: 'daily_accrual',
    description: 'Market-neutral funding rate arbitrage and algorithmic liquidity provisioning across top EVM venues.',
    isActive: true,
    sortOrder: 2
  },
  {
    id: 'tier_institutional',
    name: 'Institutional Sovereign',
    tierCode: 'INSTITUTIONAL',
    minAmount: 10000,
    maxAmount: 10000000,
    minMonthlyRoi: 12,
    maxMonthlyRoi: 15,
    lockDays: 90,
    payoutCycle: 'daily_accrual',
    description: 'Dedicated multi-sig vault allocation combining tokenized private credit, validator staking, and delta-neutral execution.',
    isActive: true,
    sortOrder: 3
  }
];

export interface RoiCalculation {
  amount: number;
  plan: InvestmentPlan;
  monthlyRoiPercent: number;
  dailyRoiPercent: number;
  dailyEarning: number;
  monthlyEarning: number;
  sixMonthEarning: number;
  annualEarning: number;
  annualCompoundTotal: number;
}

export interface TierScenario {
  plan: InvestmentPlan;
  inputAmount: number;
  effectiveAmount: number;
  isMatched: boolean;
  eligibility: 'matched' | 'below_min' | 'above_max';
  monthlyRoiPercent: number;
  minMonthlyEarning: number;
  maxMonthlyEarning: number;
  estimatedMonthlyEarning: number;
  estimatedDailyEarning: number;
  estimatedAnnualEarning: number;
}

export function matchPlanForAmount(amount: number, plans: InvestmentPlan[]): InvestmentPlan {
  const activePlans = [...plans]
    .filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const pool = activePlans.length > 0 ? activePlans : DEFAULT_INVESTMENT_PLANS;

  const exact = pool.find((p) => amount >= p.minAmount && amount <= p.maxAmount);
  if (exact) return exact;

  if (amount < pool[0].minAmount) return pool[0];
  return pool[pool.length - 1];
}

export function computeInterpolatedRoi(amount: number, plan: InvestmentPlan): number {
  let ratio = 0;
  if (plan.tierCode === 'INSTITUTIONAL' || plan.maxAmount >= 1000000) {
    const cap = Math.max(plan.minAmount * 5, 50000);
    ratio = Math.min(1, Math.max(0, (amount - plan.minAmount) / (cap - plan.minAmount)));
  } else {
    const span = Math.max(1, plan.maxAmount - plan.minAmount);
    ratio = Math.min(1, Math.max(0, (amount - plan.minAmount) / span));
  }

  return Number((plan.minMonthlyRoi + ratio * (plan.maxMonthlyRoi - plan.minMonthlyRoi)).toFixed(2));
}

export function calculateRoiProjection(amount: number, plans: InvestmentPlan[]): RoiCalculation {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 100;
  const plan = matchPlanForAmount(safeAmount, plans);
  const monthlyRoiPercent = computeInterpolatedRoi(safeAmount, plan);
  const dailyRoiPercent = monthlyRoiPercent / 30;
  const monthlyEarning = Number(((safeAmount * monthlyRoiPercent) / 100).toFixed(2));
  const dailyEarning = Number((monthlyEarning / 30).toFixed(2));
  const sixMonthEarning = Number((monthlyEarning * 6).toFixed(2));
  const annualEarning = Number((monthlyEarning * 12).toFixed(2));
  const annualCompoundTotal = Number(
    (safeAmount * Math.pow(1 + monthlyRoiPercent / 100, 12)).toFixed(2)
  );

  return {
    amount: safeAmount,
    plan,
    monthlyRoiPercent,
    dailyRoiPercent,
    dailyEarning,
    monthlyEarning,
    sixMonthEarning,
    annualEarning,
    annualCompoundTotal
  };
}

export function calculateAllTierScenarios(amount: number, plans: InvestmentPlan[]): TierScenario[] {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 100;
  const activePlans = [...plans]
    .filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const pool = activePlans.length > 0 ? activePlans : DEFAULT_INVESTMENT_PLANS;
  const matchedPlan = matchPlanForAmount(safeAmount, pool);

  return pool.map((plan) => {
    const eligibility: TierScenario['eligibility'] =
      safeAmount < plan.minAmount
        ? 'below_min'
        : safeAmount > plan.maxAmount
          ? 'above_max'
          : 'matched';
    const effectiveAmount =
      eligibility === 'below_min'
        ? plan.minAmount
        : eligibility === 'above_max'
          ? plan.maxAmount
          : safeAmount;
    const monthlyRoiPercent = computeInterpolatedRoi(effectiveAmount, plan);
    const minMonthlyEarning = Number(((safeAmount * plan.minMonthlyRoi) / 100).toFixed(2));
    const maxMonthlyEarning = Number(((safeAmount * plan.maxMonthlyRoi) / 100).toFixed(2));
    const estimatedMonthlyEarning = Number(((safeAmount * monthlyRoiPercent) / 100).toFixed(2));
    const estimatedDailyEarning = Number((estimatedMonthlyEarning / 30).toFixed(2));
    const estimatedAnnualEarning = Number((estimatedMonthlyEarning * 12).toFixed(2));

    return {
      plan,
      inputAmount: safeAmount,
      effectiveAmount,
      isMatched: matchedPlan.id === plan.id,
      eligibility,
      monthlyRoiPercent,
      minMonthlyEarning,
      maxMonthlyEarning,
      estimatedMonthlyEarning,
      estimatedDailyEarning,
      estimatedAnnualEarning
    };
  });
}

export function calculateAccruedYield(investment: Investment, nowMs: number = Date.now()): number {
  if (investment.status !== 'active') return 0;
  const lastClaimMs = investment.lastClaimedAt?.toMillis
    ? investment.lastClaimedAt.toMillis()
    : investment.createdAt?.toMillis
      ? investment.createdAt.toMillis()
      : nowMs;

  const elapsedMs = Math.max(0, nowMs - lastClaimMs);
  const msIn30Days = 30 * 24 * 60 * 60 * 1000;
  const rawAccrued = investment.principal * (investment.monthlyRoi / 100) * (elapsedMs / msIn30Days);

  // Cap single claim to 25% of principal in alignment with security rules
  const maxSingleClaim = investment.principal * 0.25;
  return Number(Math.min(maxSingleClaim, Math.max(0, rawAccrued)).toFixed(6));
}

export function formatUsd(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Number.isFinite(value) ? value : 0);
}
