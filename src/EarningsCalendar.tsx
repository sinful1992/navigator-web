import { useState, useMemo } from "react";
import type { AppState } from "./types";
import { SubscriptionGuard } from "./SubscriptionGuard";
import type { User } from "@supabase/supabase-js";
import { calculateBonus, calculateBonusBreakdown, DEFAULT_BONUS_SETTINGS } from "./utils/bonusCalculator";

interface EarningsCalendarProps {
  state: AppState;
  user: User | null;
}

export function EarningsCalendar({ state, user }: EarningsCalendarProps) {
  const [selectedStartDate, setSelectedStartDate] = useState(() => {
    const today = new Date();
    today.setDate(1); // Start of current month
    return today.toISOString().slice(0, 10);
  });
  
  const [selectedEndDate, setSelectedEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Calculate earnings for the selected date range
  const rangeStats = useMemo(() => {
    const completions = state.completions || [];
    const rangeCompletions = completions.filter(c => {
      const completionDate = c.timestamp.slice(0, 10);
      return completionDate >= selectedStartDate && completionDate <= selectedEndDate;
    });

    const pifCompletions = rangeCompletions.filter(c => c.outcome === 'PIF');
    const totalPifFees = pifCompletions.reduce((sum, c) => {
      const amount = parseFloat(c.amount || '0');
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    const totalAddresses = rangeCompletions.length;
    const pifCount = pifCompletions.length;
    const doneCount = rangeCompletions.filter(c => c.outcome === 'Done').length;
    const daCount = rangeCompletions.filter(c => c.outcome === 'DA').length;
    const arrCount = rangeCompletions.filter(c => c.outcome === 'ARR').length;

    // Calculate working days from day sessions in the selected range
    const daySessions = state.daySessions || [];
    const workingDays = daySessions.filter(session => {
      return session.date >= selectedStartDate && session.date <= selectedEndDate && session.end;
    }).length;

    // Use configurable bonus settings
    const bonusSettings = state.bonusSettings || DEFAULT_BONUS_SETTINGS;

    // Calculate total bonus using the configured formula
    const totalBonus = calculateBonus(rangeCompletions, workingDays, bonusSettings);

    // Get detailed breakdown
    const bonusBreakdown = calculateBonusBreakdown(rangeCompletions, workingDays, bonusSettings);

    // Group by date for daily breakdown
    const dailyStats = rangeCompletions.reduce((acc, completion) => {
      const date = completion.timestamp.slice(0, 10);
      if (!acc[date]) {
        acc[date] = { date, pifs: 0, total: 0, fees: 0, completions: [] };
      }
      acc[date].total++;
      acc[date].completions.push(completion);
      if (completion.outcome === 'PIF') {
        acc[date].pifs++;
        const amount = parseFloat(completion.amount || '0');
        if (!isNaN(amount)) {
          acc[date].fees += amount;
        }
      }
      return acc;
    }, {} as Record<string, { date: string; pifs: number; total: number; fees: number; completions: any[] }>);

    // Calculate bonus for each day using the configured formula
    const dailyStatsWithBonus = Object.values(dailyStats).map(day => {
      const dayCompletions = day.completions;
      // For daily calculation, use 1 working day
      const dayBonus = calculateBonus(dayCompletions, 1, bonusSettings);
      return {
        date: day.date,
        pifs: day.pifs,
        total: day.total,
        fees: day.fees,
        bonus: dayBonus
      };
    });

    // Get formula description
    let formulaDescription = '';
    if (bonusSettings.calculationType === 'simple') {
      const pifBonus = bonusSettings.simpleSettings?.pifBonus || 100;
      const threshold = bonusSettings.simpleSettings?.dailyThreshold || 100;
      formulaDescription = `£${pifBonus}/PIF - £${threshold}/day`;
    } else if (bonusSettings.calculationType === 'complex') {
      formulaDescription = 'TCG Regulations 2014';
    } else if (bonusSettings.calculationType === 'custom') {
      formulaDescription = 'Custom Formula';
    }

    return {
      totalPifFees,
      totalAddresses,
      pifCount,
      doneCount,
      daCount,
      arrCount,
      totalBonus,
      workingDays,
      bonusBreakdown,
      formulaDescription,
      dailyStats: dailyStatsWithBonus.sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [state.completions, state.daySessions, state.bonusSettings, selectedStartDate, selectedEndDate]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDateRange = () => {
    const start = new Date(selectedStartDate).toLocaleDateString('en-GB');
    const end = new Date(selectedEndDate).toLocaleDateString('en-GB');
    return `${start} - ${end}`;
  };

  return (
    <SubscriptionGuard user={user} fallback={<EarningsLockedView />}>
      <div className="earnings-calendar" style={{ padding: '1rem' }}>
        <h2>Earnings Overview</h2>
        
        {/* Date Range Selector */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '2rem',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div>
            <label htmlFor="start-date" style={{ display: 'block', marginBottom: '0.5rem' }}>
              From:
            </label>
            <input
              id="start-date"
              type="date"
              value={selectedStartDate}
              onChange={(e) => setSelectedStartDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="end-date" style={{ display: 'block', marginBottom: '0.5rem' }}>
              To:
            </label>
            <input
              id="end-date"
              type="date"
              value={selectedEndDate}
              onChange={(e) => setSelectedEndDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div className="summary-card" style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--success)' }}>
              Total PIF Fees
            </h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {formatCurrency(rangeStats.totalPifFees)}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {rangeStats.pifCount} PIF completions
            </div>
          </div>

          <div className="summary-card" style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Total Addresses</h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {rangeStats.totalAddresses}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {formatDateRange()}
            </div>
          </div>

          <div className="summary-card" style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>
              Potential Bonus
            </h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {formatCurrency(rangeStats.totalBonus)}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {rangeStats.formulaDescription}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {rangeStats.workingDays} working day{rangeStats.workingDays !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="summary-card" style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Breakdown</h3>
            <div style={{ fontSize: '0.875rem' }}>
              <div>PIF: {rangeStats.pifCount}</div>
              <div>Done: {rangeStats.doneCount}</div>
              <div>DA: {rangeStats.daCount}</div>
              <div>ARR: {rangeStats.arrCount}</div>
            </div>
          </div>
        </div>

        {/* Daily Breakdown */}
        <div>
          <h3>Daily Breakdown</h3>
          {rangeStats.dailyStats.length === 0 ? (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center', 
              color: 'var(--text-muted)' 
            }}>
              No completions found in selected date range
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                background: 'var(--surface)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius)'
              }}>
                <thead>
                  <tr style={{ background: 'var(--background)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                      Date
                    </th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                      PIFs
                    </th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                      Total Addresses
                    </th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                      PIF Fees
                    </th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                      Bonus
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rangeStats.dailyStats.map(day => (
                    <tr key={day.date}>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-light)' }}>
                        {new Date(day.date).toLocaleDateString('en-GB', { 
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short'
                        })}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {day.pifs}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {day.total}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)', fontWeight: 'bold' }}>
                        {formatCurrency(day.fees)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)', fontWeight: 'bold', color: day.bonus > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {formatCurrency(day.bonus)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SubscriptionGuard>
  );
}

function EarningsLockedView() {
  return (
    <div style={{ 
      padding: '2rem', 
      textAlign: 'center',
      background: 'var(--surface)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius)',
      margin: '1rem'
    }}>
      <h2>Earnings Tracking</h2>
      <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
        Track your PIF fees and completion statistics with detailed date range analysis.
      </p>
      <div style={{ marginBottom: '1rem' }}>
        <span style={{ 
          background: 'var(--primary-light)', 
          color: 'var(--primary)', 
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius)',
          fontSize: '0.875rem'
        }}>
          Premium Feature
        </span>
      </div>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        Start your free trial to access earnings tracking and reporting.
      </p>
    </div>
  );
}