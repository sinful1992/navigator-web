// src/utils/bonusCalculator.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateBonus,
  calculateBonusBreakdown,
  calculateDebtFromTotal,
  calculateEnforcementFee,
  DEFAULT_BONUS_SETTINGS,
} from './bonusCalculator';
import type { Completion, BonusSettings } from '../types';

describe('bonusCalculator', () => {
  // Helper to create test completions
  const createCompletion = (
    outcome: string,
    amount?: string,
    numberOfCases?: number
  ): Completion => ({
    index: 0,
    address: 'Test Address',
    lat: null,
    lng: null,
    outcome: outcome as any,
    amount,
    timestamp: new Date().toISOString(),
    listVersion: 1,
    numberOfCases,
  });

  describe('calculateDebtFromTotal', () => {
    it('should calculate debt from total using reverse formula', () => {
      // Example from PDF: Total £500, 1 case
      // D = (500 - (75 * 1 + 122.5)) / 1.075
      // D = (500 - 197.5) / 1.075 = 281.40
      const debt = calculateDebtFromTotal(500, 1);
      expect(debt).toBeCloseTo(281.40, 2);
    });

    it('should handle multiple cases', () => {
      // Total £1000, 3 cases
      // D = (1000 - (75 * 3 + 122.5)) / 1.075
      // D = (1000 - 347.5) / 1.075 = 606.98
      const debt = calculateDebtFromTotal(1000, 3);
      expect(debt).toBeCloseTo(606.98, 2);
    });

    it('should return 0 for negative debt', () => {
      const debt = calculateDebtFromTotal(50, 1);
      expect(debt).toBe(0);
    });
  });

  describe('calculateEnforcementFee', () => {
    it('should return base fee for debt <= £1500', () => {
      const fee = calculateEnforcementFee(1000);
      expect(fee).toBe(235);
    });

    it('should calculate additional fee for debt > £1500', () => {
      // Debt £2000
      // E = 235 + 0.075 * (2000 - 1500) = 235 + 37.5 = 272.5
      const fee = calculateEnforcementFee(2000);
      expect(fee).toBe(272.5);
    });

    it('should handle large debt amounts', () => {
      // Debt £5000
      // E = 235 + 0.075 * (5000 - 1500) = 235 + 262.5 = 497.5
      const fee = calculateEnforcementFee(5000);
      expect(fee).toBe(497.5);
    });
  });

  describe('Simple Bonus Calculation', () => {
    const simpleSettings: BonusSettings = {
      enabled: true,
      calculationType: 'simple',
      simpleSettings: {
        pifBonus: 100,
        dailyThreshold: 100,
      },
      adjustForWorkingDays: true,
    };

    it('should calculate basic simple bonus', () => {
      const completions = [
        createCompletion('PIF', '500'),
        createCompletion('PIF', '600'),
        createCompletion('PIF', '400'),
      ];
      const workingDays = 2;

      // 3 PIFs × £100 = £300
      // 2 days × £100 = £200
      // Net = £300 - £200 = £100
      const bonus = calculateBonus(completions, workingDays, simpleSettings);
      expect(bonus).toBe(100);
    });

    it('should count as 1 PIF per debtor regardless of cases', () => {
      const completions = [
        createCompletion('PIF', '500', 3), // 1 debtor with 3 cases = 1 PIF
        createCompletion('PIF', '600', 1),
      ];
      const workingDays = 1;

      // 2 PIFs × £100 = £200
      // 1 day × £100 = £100
      // Net = £200 - £100 = £100
      const bonus = calculateBonus(completions, workingDays, simpleSettings);
      expect(bonus).toBe(100);
    });

    it('should return 0 when bonus is negative', () => {
      const completions = [
        createCompletion('PIF', '500'),
      ];
      const workingDays = 5;

      // 1 PIF × £100 = £100
      // 5 days × £100 = £500
      // Net = £100 - £500 = -£400 → £0
      const bonus = calculateBonus(completions, workingDays, simpleSettings);
      expect(bonus).toBe(0);
    });

    it('should ignore non-PIF completions', () => {
      const completions = [
        createCompletion('PIF', '500'),
        createCompletion('Done'),
        createCompletion('DA'),
        createCompletion('ARR'),
      ];
      const workingDays = 1;

      // Only 1 PIF × £100 = £100
      // 1 day × £100 = £100
      // Net = £0
      const bonus = calculateBonus(completions, workingDays, simpleSettings);
      expect(bonus).toBe(0);
    });
  });

  describe('Complex Bonus Calculation (TCG Regulations)', () => {
    const complexSettings: BonusSettings = {
      enabled: true,
      calculationType: 'complex',
      complexSettings: {
        baseEnforcementFee: 235,
        basePifBonus: 100,
        largePifThreshold: 1500,
        largePifPercentage: 0.001875, // 2.5% of 7.5%
        largePifCap: 500,
        smallPifBonus: 30,
        linkedCaseBonus: 10,
        complianceFeePerCase: 75,
        complianceFeeFixed: 122.5,
        dailyThreshold: 100,
      },
      adjustForWorkingDays: true,
    };

    it('should calculate standard PIF bonus (£100)', () => {
      // Amount £500, 1 case
      // Debt = (500 - 197.5) / 1.075 = 281.40
      // Debt < £1500, so standard bonus = £100
      const completions = [createCompletion('PIF', '500', 1)];
      const workingDays = 1;

      // £100 - £100 = £0
      const bonus = calculateBonus(completions, workingDays, complexSettings);
      expect(bonus).toBe(0);
    });

    it('should calculate large PIF bonus', () => {
      // Amount £2000, 1 case
      // Debt = (2000 - 197.5) / 1.075 = 1676.74
      // Debt > £1500, so bonus = £100 + 0.001875 * (1676.74 - 1500)
      // Bonus = £100 + 0.33 = £100.33
      const completions = [createCompletion('PIF', '2000', 1)];
      const workingDays = 1;

      const bonus = calculateBonus(completions, workingDays, complexSettings);
      // £100.33 - £100 = £0.33
      expect(bonus).toBeCloseTo(0.33, 2);
    });

    it('should cap large PIF bonus at £500', () => {
      // Very large amount to exceed cap
      // To reach £500 cap: £500 = £100 + 0.001875 * (D - 1500)
      // D = 1500 + (400 / 0.001875) = 214833.33
      // T = 214833.33 * 1.075 + 197.5 = 231293.33
      const completions = [createCompletion('PIF', '231300', 1)];
      const workingDays = 1;

      const breakdown = calculateBonusBreakdown(completions, workingDays, complexSettings);
      // Should be capped at £500
      expect(breakdown.pifDetails[0].bonusPerCase).toBe(500);
      // £500 - £100 = £400
      expect(breakdown.netBonus).toBe(400);
    });

    it('should calculate small PIF bonus (< £100)', () => {
      const completions = [createCompletion('PIF', '80', 1)];
      const workingDays = 1;

      // Small PIF bonus = £30
      const bonus = calculateBonus(completions, workingDays, complexSettings);
      // £30 - £100 = -£70 → £0
      expect(bonus).toBe(0);
    });

    it('should calculate linked case bonus (£0 fee)', () => {
      const completions = [createCompletion('PIF', '0', 1)];
      const workingDays = 1;

      // Linked case bonus = £10
      const bonus = calculateBonus(completions, workingDays, complexSettings);
      // £10 - £100 = -£90 → £0
      expect(bonus).toBe(0);
    });

    it('should handle multiple linked cases with large debt', () => {
      // £5000, 3 cases
      // Debt = (5000 - (75*3 + 122.5)) / 1.075 = (5000 - 347.5) / 1.075 = 4327.91
      // Bonus = £100 + 0.001875 * (4327.91 - 1500) = £100 + 5.30 = £105.30
      // Count as 1 PIF (not multiplied by cases)
      const completions = [createCompletion('PIF', '5000', 3)];
      const workingDays = 1;

      const bonus = calculateBonus(completions, workingDays, complexSettings);
      // £105.30 - £100 = £5.30
      expect(bonus).toBeCloseTo(5.30, 2);
    });

    it('should calculate mixed PIFs correctly', () => {
      const completions = [
        createCompletion('PIF', '500', 1),  // Standard: £100
        createCompletion('PIF', '80', 1),   // Small: £30
        createCompletion('PIF', '0', 1),    // Linked: £10
        createCompletion('PIF', '3000', 1), // Large: ~£103
      ];
      const workingDays = 2;

      const breakdown = calculateBonusBreakdown(completions, workingDays, complexSettings);
      // Gross = £100 + £30 + £10 + £103 = £243
      // Threshold = 2 × £100 = £200
      // Net = £243 - £200 = £43
      expect(breakdown.grossBonus).toBeGreaterThan(240);
      expect(breakdown.netBonus).toBeGreaterThan(40);
    });
  });

  describe('Custom Formula Calculation', () => {
    it('should evaluate simple custom formula', () => {
      const customSettings: BonusSettings = {
        enabled: true,
        calculationType: 'custom',
        customFormula: 'T * 0.05', // 5% of total
        adjustForWorkingDays: true,
      };

      const completions = [createCompletion('PIF', '1000', 1)];
      const workingDays = 1;

      // 5% of £1000 = £50
      const bonus = calculateBonus(completions, workingDays, customSettings);
      expect(bonus).toBe(50);
    });

    it('should evaluate formula with debt calculation', () => {
      const customSettings: BonusSettings = {
        enabled: true,
        calculationType: 'custom',
        customFormula: 'D > 1500 ? 150 : 75', // £150 if debt > £1500, else £75
        adjustForWorkingDays: true,
      };

      // Small debt
      const completions1 = [createCompletion('PIF', '500', 1)];
      const bonus1 = calculateBonus(completions1, 1, customSettings);
      expect(bonus1).toBe(75);

      // Large debt
      const completions2 = [createCompletion('PIF', '2500', 1)];
      const bonus2 = calculateBonus(completions2, 1, customSettings);
      expect(bonus2).toBe(150);
    });

    it('should evaluate formula with case count', () => {
      const customSettings: BonusSettings = {
        enabled: true,
        calculationType: 'custom',
        customFormula: 'N * 50', // £50 per case
        adjustForWorkingDays: true,
      };

      const completions = [createCompletion('PIF', '1000', 3)];
      const workingDays = 1;

      // 3 cases × £50 = £150
      const bonus = calculateBonus(completions, workingDays, customSettings);
      expect(bonus).toBe(150);
    });

    it('should evaluate formula with working days', () => {
      const customSettings: BonusSettings = {
        enabled: true,
        calculationType: 'custom',
        customFormula: 'T - (days * 100)', // Total minus daily threshold
        adjustForWorkingDays: true,
      };

      const completions = [createCompletion('PIF', '500', 1)];
      const workingDays = 3;

      // £500 - (3 × £100) = £200
      const bonus = calculateBonus(completions, workingDays, customSettings);
      expect(bonus).toBe(200);
    });

    it('should handle invalid formula gracefully', () => {
      const customSettings: BonusSettings = {
        enabled: true,
        calculationType: 'custom',
        customFormula: 'invalid syntax {',
        adjustForWorkingDays: true,
      };

      const completions = [createCompletion('PIF', '1000', 1)];
      const workingDays = 1;

      // Should return 0 on error
      const bonus = calculateBonus(completions, workingDays, customSettings);
      expect(bonus).toBe(0);
    });

    it('should handle complex formula', () => {
      const customSettings: BonusSettings = {
        enabled: true,
        calculationType: 'custom',
        customFormula: 'Math.max(0, (D > 1500 ? 100 + (D - 1500) * 0.01 : 50) * N - days * 75)',
        adjustForWorkingDays: true,
      };

      // Test with large debt and multiple cases
      const completions = [createCompletion('PIF', '3000', 2)];
      const workingDays = 2;

      const bonus = calculateBonus(completions, workingDays, customSettings);
      expect(bonus).toBeGreaterThan(0);
    });
  });

  describe('Bonus Breakdown', () => {
    it('should provide detailed breakdown for simple calculation', () => {
      const simpleSettings: BonusSettings = {
        enabled: true,
        calculationType: 'simple',
        simpleSettings: {
          pifBonus: 100,
          dailyThreshold: 100,
        },
        adjustForWorkingDays: true,
      };

      const completions = [
        createCompletion('PIF', '500', 1),
        createCompletion('PIF', '600', 2),
      ];
      const workingDays = 2;

      const breakdown = calculateBonusBreakdown(completions, workingDays, simpleSettings);

      expect(breakdown.totalPifs).toBe(2);
      expect(breakdown.totalCases).toBe(3);
      expect(breakdown.grossBonus).toBe(200); // 2 PIFs × £100
      expect(breakdown.threshold).toBe(200);  // 2 × £100
      expect(breakdown.netBonus).toBe(0);     // £200 - £200
      expect(breakdown.pifDetails).toHaveLength(2);
    });

    it('should provide detailed breakdown for complex calculation', () => {
      const complexSettings: BonusSettings = {
        enabled: true,
        calculationType: 'complex',
        complexSettings: {
          baseEnforcementFee: 235,
          basePifBonus: 100,
          largePifThreshold: 1500,
          largePifPercentage: 0.001875,
          largePifCap: 500,
          smallPifBonus: 30,
          linkedCaseBonus: 10,
          complianceFeePerCase: 75,
          complianceFeeFixed: 122.5,
          dailyThreshold: 100,
        },
        adjustForWorkingDays: true,
      };

      const completions = [
        createCompletion('PIF', '500', 1),
        createCompletion('PIF', '3000', 1),
      ];
      const workingDays = 1;

      const breakdown = calculateBonusBreakdown(completions, workingDays, complexSettings);

      expect(breakdown.totalPifs).toBe(2);
      expect(breakdown.totalCases).toBe(2);
      expect(breakdown.pifDetails).toHaveLength(2);
      expect(breakdown.pifDetails[0].debtAmount).toBeDefined();
      expect(breakdown.pifDetails[1].debtAmount).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle disabled bonus', () => {
      const disabledSettings: BonusSettings = {
        enabled: false,
        calculationType: 'simple',
        simpleSettings: {
          pifBonus: 100,
          dailyThreshold: 100,
        },
        adjustForWorkingDays: true,
      };

      const completions = [createCompletion('PIF', '1000', 1)];
      const workingDays = 1;

      const bonus = calculateBonus(completions, workingDays, disabledSettings);
      expect(bonus).toBe(0);
    });

    it('should handle empty completions', () => {
      const bonus = calculateBonus([], 5, DEFAULT_BONUS_SETTINGS);
      expect(bonus).toBe(0);
    });

    it('should handle 0 working days', () => {
      const completions = [createCompletion('PIF', '1000', 1)];
      const bonus = calculateBonus(completions, 0, DEFAULT_BONUS_SETTINGS);
      expect(bonus).toBeGreaterThan(0); // No daily deduction
    });

    it('should always count as 1 PIF per debtor regardless of cases', () => {
      const settings: BonusSettings = {
        enabled: true,
        calculationType: 'simple',
        simpleSettings: {
          pifBonus: 100,
          dailyThreshold: 100,
        },
        adjustForWorkingDays: true,
      };

      const completions = [createCompletion('PIF', '1000', 5)]; // 1 debtor with 5 cases
      const workingDays = 1;

      const breakdown = calculateBonusBreakdown(completions, workingDays, settings);
      expect(breakdown.totalPifs).toBe(1); // 1 debtor = 1 PIF
      expect(breakdown.totalCases).toBe(5); // Track actual case count
      expect(breakdown.grossBonus).toBe(100); // 1 PIF × £100
    });
  });
});
