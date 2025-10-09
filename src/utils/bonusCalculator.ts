// src/utils/bonusCalculator.ts
import type { BonusSettings, Completion } from '../types';

/**
 * Default bonus settings based on the Taking Control of Goods (Fees) Regulations 2014
 */
export const DEFAULT_BONUS_SETTINGS: BonusSettings = {
  enabled: true,
  calculationType: 'complex',
  simpleSettings: {
    pifBonus: 100,           // £100 per PIF
    dailyThreshold: 100,     // £100 per day threshold
  },
  complexSettings: {
    baseEnforcementFee: 235,      // £235 enforcement fee
    basePifBonus: 100,            // £100 for standard PIF
    largePifThreshold: 1500,      // £1500 debt threshold
    largePifPercentage: 0.001875, // 2.5% of 7.5% = 0.025 * 0.075
    largePifCap: 500,             // £500 max bonus per PIF
    smallPifBonus: 30,            // £30 for balance < £100
    linkedCaseBonus: 10,          // £10 for linked cases with 0 fee
    complianceFeePerCase: 75,     // £75 per case
    complianceFeeFixed: 122.5,    // £122.5 fixed fee
    dailyThreshold: 100,          // £100 per working day
  },
  countLinkedCases: true,         // Count each case separately
  adjustForWorkingDays: true,     // Adjust thresholds for actual working days
};

/**
 * Calculate debt amount from total payment using reverse formula
 * Formula: D = (T - (75N + 122.5)) / 1.075
 *
 * @param totalAmount - Total amount collected (T)
 * @param numberOfCases - Number of cases (N)
 * @returns Original debt amount (D)
 */
export function calculateDebtFromTotal(totalAmount: number, numberOfCases: number = 1): number {
  const N = numberOfCases;
  const T = totalAmount;

  // D = (T - (75N + 122.5)) / 1.075
  const D = (T - (75 * N + 122.5)) / 1.075;

  return Math.max(0, D); // Debt can't be negative
}

/**
 * Calculate enforcement fee from debt
 * Formula: E = 235 + 0.075 × (D - 1500) [if D > 1500]
 *
 * @param debt - Original debt amount (D)
 * @returns Enforcement stage fee (E)
 */
export function calculateEnforcementFee(debt: number): number {
  const baseEnforcementFee = 235;
  const largePifThreshold = 1500;

  if (debt <= largePifThreshold) {
    return baseEnforcementFee;
  }

  // E = 235 + 7.5% of amount over £1500
  const enforcementFee = baseEnforcementFee + 0.075 * (debt - largePifThreshold);

  return enforcementFee;
}

/**
 * Simple bonus calculation: (PIFs × bonus) - (days × threshold)
 */
export function calculateSimpleBonus(
  completions: Completion[],
  workingDays: number,
  settings: BonusSettings
): number {
  if (!settings.simpleSettings) return 0;

  const { pifBonus, dailyThreshold } = settings.simpleSettings;

  // Count PIFs, accounting for numberOfCases
  let totalPifs = 0;
  for (const completion of completions) {
    if (completion.outcome === 'PIF') {
      const cases = settings.countLinkedCases && completion.numberOfCases
        ? completion.numberOfCases
        : 1;
      totalPifs += cases;
    }
  }

  const grossBonus = totalPifs * pifBonus;
  const threshold = workingDays * dailyThreshold;
  const netBonus = grossBonus - threshold;

  return Math.max(0, netBonus); // Bonus can't be negative
}

/**
 * Complex bonus calculation based on Taking Control of Goods regulations
 */
export function calculateComplexBonus(
  completions: Completion[],
  workingDays: number,
  settings: BonusSettings
): number {
  if (!settings.complexSettings) return 0;

  const {
    basePifBonus,
    largePifThreshold,
    largePifPercentage,
    largePifCap,
    smallPifBonus,
    linkedCaseBonus,
    dailyThreshold,
  } = settings.complexSettings;

  let totalBonus = 0;

  for (const completion of completions) {
    if (completion.outcome !== 'PIF') continue;

    const amount = parseFloat(completion.amount || '0');
    const cases = settings.countLinkedCases && completion.numberOfCases
      ? completion.numberOfCases
      : 1;

    // Determine bonus per PIF based on amount
    let bonusPerPif = 0;

    if (amount === 0) {
      // Linked case with 0 fee
      bonusPerPif = linkedCaseBonus;
    } else if (amount < 100) {
      // Small PIF (balance < £100)
      bonusPerPif = smallPifBonus;
    } else {
      // Calculate debt from total using reverse formula
      const debt = calculateDebtFromTotal(amount, cases);

      if (debt > largePifThreshold) {
        // Large PIF: £100 + 2.5% of 7.5% over £1500
        const additionalBonus = largePifPercentage * (debt - largePifThreshold);
        bonusPerPif = Math.min(basePifBonus + additionalBonus, largePifCap);
      } else {
        // Standard PIF
        bonusPerPif = basePifBonus;
      }
    }

    // Multiply by number of cases
    totalBonus += bonusPerPif * cases;
  }

  // Subtract daily threshold
  const threshold = workingDays * dailyThreshold;
  const netBonus = totalBonus - threshold;

  return Math.max(0, netBonus);
}

/**
 * Evaluate custom JavaScript formula
 * Formula receives: T (total), N (number of cases), D (calculated debt)
 * Should return: bonus amount
 */
export function evaluateCustomFormula(
  formula: string,
  totalAmount: number,
  numberOfCases: number,
  workingDays: number
): number {
  try {
    // Calculate debt using reverse formula
    const D = calculateDebtFromTotal(totalAmount, numberOfCases);
    const T = totalAmount;
    const N = numberOfCases;
    const days = workingDays;

    // Create a safe evaluation context
    // eslint-disable-next-line no-new-func
    const fn = new Function('T', 'N', 'D', 'days', `return ${formula}`);
    const result = fn(T, N, D, days);

    return typeof result === 'number' && isFinite(result) ? Math.max(0, result) : 0;
  } catch (error) {
    console.error('Error evaluating custom bonus formula:', error);
    return 0;
  }
}

/**
 * Calculate custom bonus for all completions
 */
export function calculateCustomBonus(
  completions: Completion[],
  workingDays: number,
  settings: BonusSettings
): number {
  if (!settings.customFormula) return 0;

  let totalBonus = 0;

  for (const completion of completions) {
    if (completion.outcome !== 'PIF') continue;

    const amount = parseFloat(completion.amount || '0');
    const cases = settings.countLinkedCases && completion.numberOfCases
      ? completion.numberOfCases
      : 1;

    const bonus = evaluateCustomFormula(
      settings.customFormula,
      amount,
      cases,
      workingDays
    );

    totalBonus += bonus;
  }

  return Math.max(0, totalBonus);
}

/**
 * Main bonus calculator - dispatches to appropriate calculation method
 */
export function calculateBonus(
  completions: Completion[],
  workingDays: number,
  settings: BonusSettings = DEFAULT_BONUS_SETTINGS
): number {
  if (!settings.enabled) return 0;

  switch (settings.calculationType) {
    case 'simple':
      return calculateSimpleBonus(completions, workingDays, settings);

    case 'complex':
      return calculateComplexBonus(completions, workingDays, settings);

    case 'custom':
      return calculateCustomBonus(completions, workingDays, settings);

    default:
      return 0;
  }
}

/**
 * Calculate detailed bonus breakdown for display
 */
export interface BonusBreakdown {
  totalPifs: number;
  totalCases: number;
  grossBonus: number;
  threshold: number;
  netBonus: number;
  pifDetails: Array<{
    amount: number;
    cases: number;
    bonusPerCase: number;
    totalBonus: number;
    debtAmount?: number;
  }>;
}

export function calculateBonusBreakdown(
  completions: Completion[],
  workingDays: number,
  settings: BonusSettings = DEFAULT_BONUS_SETTINGS
): BonusBreakdown {
  const breakdown: BonusBreakdown = {
    totalPifs: 0,
    totalCases: 0,
    grossBonus: 0,
    threshold: 0,
    netBonus: 0,
    pifDetails: [],
  };

  if (!settings.enabled) return breakdown;

  // Calculate threshold
  const dailyThreshold = settings.calculationType === 'simple'
    ? settings.simpleSettings?.dailyThreshold || 100
    : settings.complexSettings?.dailyThreshold || 100;

  breakdown.threshold = workingDays * dailyThreshold;

  // Process each PIF
  for (const completion of completions) {
    if (completion.outcome !== 'PIF') continue;

    const amount = parseFloat(completion.amount || '0');
    const cases = settings.countLinkedCases && completion.numberOfCases
      ? completion.numberOfCases
      : 1;

    breakdown.totalPifs++;
    breakdown.totalCases += cases;

    let bonusPerCase = 0;
    let debtAmount: number | undefined;

    // Calculate bonus based on type
    if (settings.calculationType === 'simple' && settings.simpleSettings) {
      bonusPerCase = settings.simpleSettings.pifBonus;
    } else if (settings.calculationType === 'complex' && settings.complexSettings) {
      const {
        basePifBonus,
        largePifThreshold,
        largePifPercentage,
        largePifCap,
        smallPifBonus,
        linkedCaseBonus,
      } = settings.complexSettings;

      if (amount === 0) {
        bonusPerCase = linkedCaseBonus;
      } else if (amount < 100) {
        bonusPerCase = smallPifBonus;
      } else {
        debtAmount = calculateDebtFromTotal(amount, cases);
        if (debtAmount > largePifThreshold) {
          const additionalBonus = largePifPercentage * (debtAmount - largePifThreshold);
          bonusPerCase = Math.min(basePifBonus + additionalBonus, largePifCap);
        } else {
          bonusPerCase = basePifBonus;
        }
      }
    } else if (settings.calculationType === 'custom' && settings.customFormula) {
      debtAmount = calculateDebtFromTotal(amount, cases);
      bonusPerCase = evaluateCustomFormula(
        settings.customFormula,
        amount,
        cases,
        workingDays
      ) / cases; // Divide by cases to get per-case amount
    }

    const totalBonusForCompletion = bonusPerCase * cases;
    breakdown.grossBonus += totalBonusForCompletion;

    breakdown.pifDetails.push({
      amount,
      cases,
      bonusPerCase,
      totalBonus: totalBonusForCompletion,
      debtAmount,
    });
  }

  breakdown.netBonus = Math.max(0, breakdown.grossBonus - breakdown.threshold);

  return breakdown;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
