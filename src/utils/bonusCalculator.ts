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
  adjustForWorkingDays: true,     // Adjust thresholds for actual working days
};

/**
 * Calculate debt amount from total payment using reverse formula
 *
 * When totalEnforcementFees is provided:
 *   Formula: D = T - E_total - (75N + 122.5)
 *   Where: T = total collected, E_total = total enforcement fees, N = number of cases
 *
 * Otherwise (legacy formula, assumes one enforcement fee in the 1.075 multiplier):
 *   Formula: D = (T - (75N + 122.5)) / 1.075
 *
 * @param totalAmount - Total amount collected (T)
 * @param numberOfCases - Number of cases (N)
 * @param totalEnforcementFees - Optional: Total enforcement fees charged across all cases
 * @returns Original debt amount (D)
 */
export function calculateDebtFromTotal(
  totalAmount: number,
  numberOfCases: number = 1,
  totalEnforcementFees?: number
): number {
  const N = numberOfCases;
  const T = totalAmount;

  // If total enforcement fees are provided, use direct calculation
  if (totalEnforcementFees !== undefined && totalEnforcementFees !== null) {
    // T = Total_Debt + E_total + (75N + 122.5)
    // Therefore: Total_Debt = T - E_total - (75N + 122.5)
    const D = T - totalEnforcementFees - (75 * N + 122.5);
    return Math.max(0, D);
  }

  // Legacy formula: assumes one enforcement fee embedded in 1.075 multiplier
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

  // Count PIFs - each debtor counts as 1 PIF regardless of number of cases
  let totalPifs = 0;
  for (const completion of completions) {
    if (completion.outcome === 'PIF') {
      totalPifs += 1;  // Always count as 1 PIF per debtor
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
    // Always use actual number of cases for debt calculation (affects compliance fees)
    const actualCases = completion.numberOfCases || 1;
    const totalEnforcementFees = completion.totalEnforcementFees;

    // Determine bonus per PIF based on amount
    let bonusForThisPif = 0;

    if (amount === 0) {
      // Linked case with 0 fee
      bonusForThisPif = linkedCaseBonus;
    } else if (amount < 100) {
      // Small PIF (balance < £100)
      bonusForThisPif = smallPifBonus;
    } else {
      // Calculate debt from total using reverse formula with actual case count
      // This ensures compliance fees (£75 × N) are correctly accounted for
      const debt = calculateDebtFromTotal(amount, actualCases, totalEnforcementFees);

      if (debt > largePifThreshold) {
        // Large PIF: £100 + 2.5% of 7.5% over £1500
        const additionalBonus = largePifPercentage * (debt - largePifThreshold);
        bonusForThisPif = Math.min(basePifBonus + additionalBonus, largePifCap);
      } else {
        // Standard PIF
        bonusForThisPif = basePifBonus;
      }
    }

    // Count as 1 PIF per debtor (don't multiply by number of cases)
    // Only 1 enforcement fee is charged per debtor, so only 1 PIF bonus
    totalBonus += bonusForThisPif;
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
  workingDays: number,
  totalEnforcementFees?: number
): number {
  try {
    // Calculate debt using reverse formula
    const D = calculateDebtFromTotal(totalAmount, numberOfCases, totalEnforcementFees);
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
    // Always use actual number of cases for custom formula
    const actualCases = completion.numberOfCases || 1;
    const totalEnforcementFees = completion.totalEnforcementFees;

    const bonus = evaluateCustomFormula(
      settings.customFormula,
      amount,
      actualCases,
      workingDays,
      totalEnforcementFees
    );

    // Count as 1 PIF per debtor
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
    // Always use actual number of cases for debt calculation
    const actualCases = completion.numberOfCases || 1;
    const totalEnforcementFees = completion.totalEnforcementFees;

    breakdown.totalPifs++;  // Count as 1 PIF per debtor
    breakdown.totalCases += actualCases;

    let bonusForThisPif = 0;
    let debtAmount: number | undefined;

    // Calculate bonus based on type
    if (settings.calculationType === 'simple' && settings.simpleSettings) {
      bonusForThisPif = settings.simpleSettings.pifBonus;
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
        bonusForThisPif = linkedCaseBonus;
      } else if (amount < 100) {
        bonusForThisPif = smallPifBonus;
      } else {
        // Use actual cases for debt calculation (compliance fees matter)
        debtAmount = calculateDebtFromTotal(amount, actualCases, totalEnforcementFees);
        if (debtAmount > largePifThreshold) {
          const additionalBonus = largePifPercentage * (debtAmount - largePifThreshold);
          bonusForThisPif = Math.min(basePifBonus + additionalBonus, largePifCap);
        } else {
          bonusForThisPif = basePifBonus;
        }
      }
    } else if (settings.calculationType === 'custom' && settings.customFormula) {
      debtAmount = calculateDebtFromTotal(amount, actualCases, totalEnforcementFees);
      bonusForThisPif = evaluateCustomFormula(
        settings.customFormula,
        amount,
        actualCases,
        workingDays,
        totalEnforcementFees
      );
    }

    // Count as 1 PIF per debtor (don't multiply by cases)
    breakdown.grossBonus += bonusForThisPif;

    breakdown.pifDetails.push({
      amount,
      cases: actualCases,
      bonusPerCase: bonusForThisPif,  // Show total bonus (not per case)
      totalBonus: bonusForThisPif,
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
