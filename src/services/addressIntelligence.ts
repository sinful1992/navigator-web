// Address Intelligence - Historical analysis and predictive insights
import type { AppState, Completion } from '../types';
import { logger } from '../utils/logger';

export interface AddressHistory {
  address: string;
  normalizedAddress: string;
  totalVisits: number;
  outcomes: {
    PIF: number;
    Done: number;
    DA: number;
    ARR: number;
  };
  totalPIFAmount: number;
  averagePIFAmount: number;
  lastVisitDate: string;
  lastOutcome: string;
  successRate: number; // PIF rate as percentage
  visitHistory: {
    date: string;
    outcome: string;
    amount?: string;
    dayOfWeek: string;
    hour: number;
  }[];
  bestTimeOfDay?: {
    hour: number;
    successRate: number;
  };
  bestDayOfWeek?: {
    day: string;
    successRate: number;
  };
}

export interface AreaAnalytics {
  area: string; // Postcode or area identifier
  totalAddresses: number;
  totalVisits: number;
  successRate: number;
  averagePIFAmount: number;
  bestTimeOfDay?: {
    hour: number;
    successRate: number;
  };
}

export class AddressIntelligence {
  /**
   * Normalize address for consistent matching
   * Exported for use in optimization checks
   */
  static normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/,/g, '') // Remove commas
      .replace(/\./g, '') // Remove periods
      .replace(/\b(flat|apt|apartment|unit|floor|fl)\b\s*\d+\s*/gi, '') // Remove flat numbers for grouping
      .replace(/\b\d+[a-z]\b/g, (match) => match.replace(/[a-z]/g, '')); // 123a -> 123
  }

  /**
   * Get historical data for a specific address
   */
  static getAddressHistory(address: string, completions: Completion[]): AddressHistory | null {
    const normalizedAddress = this.normalizeAddress(address);

    // Find all completions for this address
    const addressCompletions = completions.filter(
      (c) => this.normalizeAddress(c.address || '') === normalizedAddress
    );

    if (addressCompletions.length === 0) {
      return null;
    }

    // Calculate outcomes
    const outcomes = {
      PIF: addressCompletions.filter((c) => c.outcome === 'PIF').length,
      Done: addressCompletions.filter((c) => c.outcome === 'Done').length,
      DA: addressCompletions.filter((c) => c.outcome === 'DA').length,
      ARR: addressCompletions.filter((c) => c.outcome === 'ARR').length,
    };

    // Calculate PIF stats
    const pifCompletions = addressCompletions.filter((c) => c.outcome === 'PIF');
    const totalPIFAmount = pifCompletions.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
    const averagePIFAmount = pifCompletions.length > 0 ? totalPIFAmount / pifCompletions.length : 0;

    // Success rate (PIF percentage)
    const successRate = addressCompletions.length > 0
      ? Math.round((outcomes.PIF / addressCompletions.length) * 100)
      : 0;

    // Get last visit
    const sortedCompletions = [...addressCompletions].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const lastVisit = sortedCompletions[0];

    // Build visit history with time analysis
    const visitHistory = sortedCompletions.map((c) => {
      const date = new Date(c.timestamp);
      return {
        date: c.timestamp,
        outcome: c.outcome,
        amount: c.amount,
        dayOfWeek: date.toLocaleDateString('en-GB', { weekday: 'long' }),
        hour: date.getHours(),
      };
    });

    // Analyze best time of day
    const hourlySuccess: { [hour: number]: { total: number; pif: number } } = {};
    visitHistory.forEach((visit) => {
      if (!hourlySuccess[visit.hour]) {
        hourlySuccess[visit.hour] = { total: 0, pif: 0 };
      }
      hourlySuccess[visit.hour].total++;
      if (visit.outcome === 'PIF') {
        hourlySuccess[visit.hour].pif++;
      }
    });

    let bestTimeOfDay: AddressHistory['bestTimeOfDay'] = undefined;
    let bestHourRate = 0;
    Object.entries(hourlySuccess).forEach(([hour, stats]) => {
      if (stats.total >= 2) { // Need at least 2 visits to consider
        const rate = (stats.pif / stats.total) * 100;
        if (rate > bestHourRate) {
          bestHourRate = rate;
          bestTimeOfDay = { hour: parseInt(hour), successRate: Math.round(rate) };
        }
      }
    });

    // Analyze best day of week
    const dailySuccess: { [day: string]: { total: number; pif: number } } = {};
    visitHistory.forEach((visit) => {
      if (!dailySuccess[visit.dayOfWeek]) {
        dailySuccess[visit.dayOfWeek] = { total: 0, pif: 0 };
      }
      dailySuccess[visit.dayOfWeek].total++;
      if (visit.outcome === 'PIF') {
        dailySuccess[visit.dayOfWeek].pif++;
      }
    });

    let bestDayOfWeek: AddressHistory['bestDayOfWeek'] = undefined;
    let bestDayRate = 0;
    Object.entries(dailySuccess).forEach(([day, stats]) => {
      if (stats.total >= 2) {
        const rate = (stats.pif / stats.total) * 100;
        if (rate > bestDayRate) {
          bestDayRate = rate;
          bestDayOfWeek = { day, successRate: Math.round(rate) };
        }
      }
    });

    return {
      address,
      normalizedAddress,
      totalVisits: addressCompletions.length,
      outcomes,
      totalPIFAmount,
      averagePIFAmount,
      lastVisitDate: lastVisit.timestamp,
      lastOutcome: lastVisit.outcome,
      successRate,
      visitHistory,
      bestTimeOfDay,
      bestDayOfWeek,
    };
  }

  /**
   * Get high-value addresses (highest PIF amounts)
   */
  static getHighValueAddresses(
    state: AppState,
    limit: number = 10
  ): { address: string; history: AddressHistory }[] {
    const addressMap = new Map<string, AddressHistory>();

    // Build history for all addresses
    state.completions.forEach((completion) => {
      const normalized = this.normalizeAddress(completion.address || '');
      if (!addressMap.has(normalized)) {
        const history = this.getAddressHistory(completion.address || '', state.completions);
        if (history) {
          addressMap.set(normalized, history);
        }
      }
    });

    // Sort by total PIF amount and take top N
    return Array.from(addressMap.values())
      .map((history) => ({ address: history.address, history }))
      .sort((a, b) => b.history.totalPIFAmount - a.history.totalPIFAmount)
      .slice(0, limit);
  }

  /**
   * Get high success rate areas (postcodes with best PIF rates)
   */
  static getHighSuccessAreas(state: AppState): AreaAnalytics[] {
    const areaMap = new Map<string, {
      totalVisits: number;
      pifCount: number;
      pifAmounts: number[];
      addresses: Set<string>;
    }>();

    // Extract postcode from address
    const extractPostcode = (address: string): string | null => {
      const match = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i);
      if (match) {
        return match[1].toUpperCase().split(' ')[0]; // Get just the outward code (e.g., "SW1A")
      }
      return null;
    };

    // Group completions by area
    state.completions.forEach((completion) => {
      const postcode = extractPostcode(completion.address || '');
      if (!postcode) return;

      if (!areaMap.has(postcode)) {
        areaMap.set(postcode, {
          totalVisits: 0,
          pifCount: 0,
          pifAmounts: [],
          addresses: new Set(),
        });
      }

      const area = areaMap.get(postcode)!;
      area.totalVisits++;
      area.addresses.add(this.normalizeAddress(completion.address || ''));

      if (completion.outcome === 'PIF') {
        area.pifCount++;
        area.pifAmounts.push(parseFloat(completion.amount || '0'));
      }
    });

    // Convert to analytics format
    return Array.from(areaMap.entries())
      .filter(([_, data]) => data.totalVisits >= 5) // Need at least 5 visits
      .map(([area, data]) => ({
        area,
        totalAddresses: data.addresses.size,
        totalVisits: data.totalVisits,
        successRate: Math.round((data.pifCount / data.totalVisits) * 100),
        averagePIFAmount: data.pifAmounts.length > 0
          ? data.pifAmounts.reduce((sum, amt) => sum + amt, 0) / data.pifAmounts.length
          : 0,
      }))
      .sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Get optimal visit time based on historical data
   */
  static getOptimalVisitTime(completions: Completion[]): {
    hour: number;
    dayOfWeek: string;
    successRate: number;
  } | null {
    if (completions.length < 10) {
      // Need sufficient data
      return null;
    }

    // Analyze by hour and day
    const timeSlots: {
      [key: string]: { total: number; pif: number };
    } = {};

    completions.forEach((c) => {
      const date = new Date(c.timestamp);
      const hour = date.getHours();
      const dayOfWeek = date.toLocaleDateString('en-GB', { weekday: 'long' });
      const key = `${dayOfWeek}-${hour}`;

      if (!timeSlots[key]) {
        timeSlots[key] = { total: 0, pif: 0 };
      }

      timeSlots[key].total++;
      if (c.outcome === 'PIF') {
        timeSlots[key].pif++;
      }
    });

    // Find best time slot with at least 5 visits
    let bestSlot: { hour: number; dayOfWeek: string; successRate: number } | null = null;
    let bestRate = 0;

    Object.entries(timeSlots).forEach(([key, stats]) => {
      if (stats.total >= 5) {
        const rate = (stats.pif / stats.total) * 100;
        if (rate > bestRate) {
          const [dayOfWeek, hourStr] = key.split('-');
          bestRate = rate;
          bestSlot = {
            hour: parseInt(hourStr),
            dayOfWeek,
            successRate: Math.round(rate),
          };
        }
      }
    });

    return bestSlot;
  }

  /**
   * Get recommendations for current address list
   */
  static getRecommendations(state: AppState): {
    highValueAddresses: string[];
    bestAreas: string[];
    optimalTime: string | null;
    insights: string[];
  } {
    const highValue = this.getHighValueAddresses(state, 5).map((a) => a.address);
    const highSuccessAreas = this.getHighSuccessAreas(state).slice(0, 3);
    const bestAreas = highSuccessAreas.map((a) => `${a.area} (${a.successRate}% success)`);

    const optimalTime = this.getOptimalVisitTime(state.completions);
    const optimalTimeStr = optimalTime
      ? `${optimalTime.dayOfWeek}s around ${optimalTime.hour}:00 (${optimalTime.successRate}% success)`
      : null;

    const insights: string[] = [];

    // Generate insights
    if (highSuccessAreas.length > 0) {
      const topArea = highSuccessAreas[0];
      insights.push(`🎯 ${topArea.area} has your highest success rate at ${topArea.successRate}%`);
    }

    if (highValue.length > 0) {
      insights.push(`💰 Focus on high-value addresses for maximum earnings`);
    }

    if (optimalTime) {
      insights.push(`⏰ ${optimalTimeStr} is your most successful time slot`);
    }

    return {
      highValueAddresses: highValue,
      bestAreas,
      optimalTime: optimalTimeStr,
      insights,
    };
  }

  /**
   * Cache address intelligence data to IndexedDB for quick access
   */
  static async cacheIntelligence(state: AppState): Promise<void> {
    try {
      const recommendations = this.getRecommendations(state);
      const highSuccessAreas = this.getHighSuccessAreas(state);

      const cacheData = {
        recommendations,
        highSuccessAreas,
        timestamp: new Date().toISOString(),
      };

      localStorage.setItem('navigator_address_intelligence', JSON.stringify(cacheData));
      logger.info('Address intelligence cached');
    } catch (error) {
      logger.error('Failed to cache address intelligence:', error);
    }
  }

  /**
   * Get cached intelligence data
   */
  static getCachedIntelligence(): any | null {
    try {
      const cached = localStorage.getItem('navigator_address_intelligence');
      if (!cached) return null;

      const data = JSON.parse(cached);
      const cacheAge = Date.now() - new Date(data.timestamp).getTime();

      // Cache valid for 1 hour
      if (cacheAge > 60 * 60 * 1000) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }
}
