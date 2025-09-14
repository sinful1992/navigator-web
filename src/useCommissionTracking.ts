import { useCallback, useMemo } from "react";
import type { 
  AppState, 
  CommissionRule, 
  DailyEarnings
} from "./types";

// Default commission rules for different court types
export const DEFAULT_COMMISSION_RULES: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: "High Court Enforcement",
    courtType: "high_court",
    isActive: true,
    fees: {
      pif: 7500,    // £75.00
      done: 4500,   // £45.00  
      da: 2000,     // £20.00
      arr: 3000,    // £30.00
    },
    bonuses: {
      dailyTargetAddresses: 8,
      dailyBonusAmount: 5000,  // £50.00 bonus
      weeklyTargetPifs: 15,
      weeklyBonusAmount: 10000, // £100.00 weekly bonus
    }
  },
  {
    name: "Magistrates Court Enforcement", 
    courtType: "magistrates",
    isActive: false,
    fees: {
      pif: 3500,    // £35.00
      done: 2500,   // £25.00
      da: 1500,     // £15.00
      arr: 2000,    // £20.00
    },
    bonuses: {
      dailyTargetAddresses: 25,
      dailyBonusAmount: 7500,  // £75.00 bonus
      weeklyTargetPifs: 50,
      weeklyBonusAmount: 15000, // £150.00 weekly bonus
    }
  }
];

interface UseCommissionTracking {
  // Current state
  rules: CommissionRule[];
  activeRule: CommissionRule | null;
  dailyEarnings: DailyEarnings[];
  
  // Calculations
  todaysEarnings: DailyEarnings | null;
  weeklyEarnings: DailyEarnings[];
  monthlyTotal: number;
  weeklyTotal: number;
  todaysTotal: number;
  
  // Actions
  addRule: (rule: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>) => CommissionRule;
  updateRule: (id: string, updates: Partial<CommissionRule>) => void;
  deleteRule: (id: string) => void;
  setActiveRule: (id: string) => void;
  
  // Earnings calculation
  calculateDailyEarnings: (date: string) => DailyEarnings | null;
  formatAmount: (amountInPence: number) => string;
  
  // Analysis
  getWeeklyStats: () => {
    totalEarnings: number;
    totalCompletions: number;
    averagePerDay: number;
    bestDay: { date: string; amount: number } | null;
    targetProgress: {
      addresses: { completed: number; target: number; percentage: number };
      pifs: { completed: number; target: number; percentage: number };
    };
  };
}

export function useCommissionTracking(
  state: AppState,
  updateState: (updater: (state: AppState) => AppState) => void
): UseCommissionTracking {
  
  // Initialize default rules if none exist
  const rules = useMemo(() => {
    if (!state.commissionRules || state.commissionRules.length === 0) {
      const defaultRules = DEFAULT_COMMISSION_RULES.map((rule, index) => ({
        ...rule,
        id: `rule_${Date.now()}_${index}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      
      // Initialize with default rules
      setTimeout(() => {
        updateState(s => ({
          ...s,
          commissionRules: defaultRules,
          activeCommissionRule: defaultRules[0]?.id || null
        }));
      }, 0);
      
      return defaultRules;
    }
    return state.commissionRules;
  }, [state.commissionRules, updateState]);

  const activeRule = useMemo(() => {
    const activeId = state.activeCommissionRule;
    return rules.find(rule => rule.id === activeId) || null;
  }, [rules, state.activeCommissionRule]);

  const dailyEarnings = state.dailyEarnings || [];

  // Format currency helper
  const formatAmount = useCallback((amountInPence: number): string => {
    const pounds = amountInPence / 100;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(pounds);
  }, []);

  // Calculate earnings for a specific date
  const calculateDailyEarnings = useCallback((date: string): DailyEarnings | null => {
    if (!activeRule) return null;

    const dayCompletions = state.completions.filter(c => 
      c.timestamp.startsWith(date) && 
      c.listVersion === state.currentListVersion
    );

    if (dayCompletions.length === 0) return null;

    // Count completions by outcome
    const completionCounts = {
      pif: dayCompletions.filter(c => c.outcome === 'PIF').length,
      done: dayCompletions.filter(c => c.outcome === 'Done').length,
      da: dayCompletions.filter(c => c.outcome === 'DA').length,
      arr: dayCompletions.filter(c => c.outcome === 'ARR').length,
    };

    // Calculate earnings by outcome
    const completionEarnings = {
      pif: { count: completionCounts.pif, amount: completionCounts.pif * activeRule.fees.pif },
      done: { count: completionCounts.done, amount: completionCounts.done * activeRule.fees.done },
      da: { count: completionCounts.da, amount: completionCounts.da * activeRule.fees.da },
      arr: { count: completionCounts.arr, amount: completionCounts.arr * activeRule.fees.arr },
    };

    const totalEarnings = Object.values(completionEarnings).reduce((sum, { amount }) => sum + amount, 0);
    const addressesCompleted = dayCompletions.length;

    // Check for daily bonus
    let bonusEarned = 0;
    if (activeRule.bonuses?.dailyTargetAddresses && activeRule.bonuses?.dailyBonusAmount) {
      if (addressesCompleted >= activeRule.bonuses.dailyTargetAddresses) {
        bonusEarned = activeRule.bonuses.dailyBonusAmount;
      }
    }

    // Calculate work hours from day sessions
    const daySession = state.daySessions.find(s => s.date === date);
    const workHours = daySession?.durationSeconds ? daySession.durationSeconds / 3600 : undefined;

    return {
      date,
      ruleId: activeRule.id,
      completions: completionEarnings,
      totalEarnings: totalEarnings + bonusEarned,
      bonusEarned: bonusEarned > 0 ? bonusEarned : undefined,
      addressesCompleted,
      workHours,
    };
  }, [activeRule, state.completions, state.currentListVersion, state.daySessions]);

  // Today's earnings
  const todaysEarnings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return calculateDailyEarnings(today);
  }, [calculateDailyEarnings]);

  // Weekly earnings (last 7 days)
  const weeklyEarnings = useMemo(() => {
    const earnings: DailyEarnings[] = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      
      const dayEarnings = calculateDailyEarnings(dateStr);
      if (dayEarnings) {
        earnings.push(dayEarnings);
      }
    }
    
    return earnings;
  }, [calculateDailyEarnings]);

  // Totals
  const weeklyTotal = useMemo(() => 
    weeklyEarnings.reduce((sum, day) => sum + day.totalEarnings, 0)
  , [weeklyEarnings]);

  const todaysTotal = todaysEarnings?.totalEarnings || 0;

  const monthlyTotal = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    return dailyEarnings
      .filter(day => day.date.startsWith(thisMonth))
      .reduce((sum, day) => sum + day.totalEarnings, 0);
  }, [dailyEarnings]);

  // Weekly statistics and progress tracking
  const getWeeklyStats = useCallback(() => {
    const totalEarnings = weeklyTotal;
    const totalCompletions = weeklyEarnings.reduce((sum, day) => sum + day.addressesCompleted, 0);
    const averagePerDay = weeklyEarnings.length > 0 ? totalEarnings / 7 : 0;
    
    const bestDay = weeklyEarnings.reduce((best, day) => {
      return (!best || day.totalEarnings > best.amount) 
        ? { date: day.date, amount: day.totalEarnings }
        : best;
    }, null as { date: string; amount: number } | null);

    // Progress tracking
    const weeklyAddresses = weeklyEarnings.reduce((sum, day) => sum + day.addressesCompleted, 0);
    const weeklyPifs = weeklyEarnings.reduce((sum, day) => sum + day.completions.pif.count, 0);
    
    const addressTarget = activeRule?.bonuses?.dailyTargetAddresses ? activeRule.bonuses.dailyTargetAddresses * 7 : 0;
    const pifTarget = activeRule?.bonuses?.weeklyTargetPifs || 0;
    
    return {
      totalEarnings,
      totalCompletions,
      averagePerDay,
      bestDay,
      targetProgress: {
        addresses: {
          completed: weeklyAddresses,
          target: addressTarget,
          percentage: addressTarget > 0 ? (weeklyAddresses / addressTarget) * 100 : 0
        },
        pifs: {
          completed: weeklyPifs,
          target: pifTarget,
          percentage: pifTarget > 0 ? (weeklyPifs / pifTarget) * 100 : 0
        }
      }
    };
  }, [weeklyEarnings, weeklyTotal, activeRule]);

  // Rule management actions
  const addRule = useCallback((rule: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newRule: CommissionRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    updateState(s => ({
      ...s,
      commissionRules: [...(s.commissionRules || []), newRule]
    }));

    return newRule;
  }, [updateState]);

  const updateRule = useCallback((id: string, updates: Partial<CommissionRule>) => {
    updateState(s => ({
      ...s,
      commissionRules: (s.commissionRules || []).map(rule => 
        rule.id === id 
          ? { ...rule, ...updates, updatedAt: new Date().toISOString() }
          : rule
      )
    }));
  }, [updateState]);

  const deleteRule = useCallback((id: string) => {
    updateState(s => ({
      ...s,
      commissionRules: (s.commissionRules || []).filter(rule => rule.id !== id),
      activeCommissionRule: s.activeCommissionRule === id ? null : s.activeCommissionRule
    }));
  }, [updateState]);

  const setActiveRule = useCallback((id: string) => {
    updateState(s => ({
      ...s,
      activeCommissionRule: id
    }));
  }, [updateState]);

  return {
    // Current state
    rules,
    activeRule,
    dailyEarnings,
    
    // Calculations
    todaysEarnings,
    weeklyEarnings,
    monthlyTotal,
    weeklyTotal,
    todaysTotal,
    
    // Actions
    addRule,
    updateRule,
    deleteRule,
    setActiveRule,
    
    // Utilities
    calculateDailyEarnings,
    formatAmount,
    getWeeklyStats,
  };
}