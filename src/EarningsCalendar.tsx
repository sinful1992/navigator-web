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

  // State for tracking which rows are expanded
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const toggleExpanded = (date: string) => {
    setExpandedDates(prev => {
      const newSet = new Set<string>(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  // State for manually selected working days
  // Initialized to all dates with completions (user can uncheck days they didn't work)
  const [manualWorkingDays, setManualWorkingDays] = useState<Set<string> | null>(null);

  const toggleWorkingDay = (date: string) => {
    setManualWorkingDays(prev => {
      const newSet = prev ? new Set<string>(prev) : new Set<string>();
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

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

    // Get all unique dates with completions in range
    const completionDates = new Set(
      rangeCompletions.map(c => c.timestamp.slice(0, 10))
    );

    // Initialize manual working days on first load
    if (manualWorkingDays === null && completionDates.size > 0) {
      setManualWorkingDays(new Set<string>(completionDates));
    }

    // Use manual selection if available, otherwise use all completion dates
    const selectedWorkingDays = manualWorkingDays || completionDates;
    const workingDays = selectedWorkingDays.size;

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
  }, [state.completions, state.daySessions, state.bonusSettings, selectedStartDate, selectedEndDate, manualWorkingDays]);

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
                    <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border-light)', fontSize: '0.875rem' }}>
                      Worked?
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
                  {rangeStats.dailyStats.map(day => {
                    const isExpanded = expandedDates.has(day.date);
                    const hasPifs = day.pifs > 0;

                    return (
                      <>
                        <tr key={day.date} style={{ background: isExpanded ? 'var(--background)' : 'transparent' }}>
                          <td style={{
                            padding: '0.75rem',
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-light)'
                          }}>
                            {new Date(day.date).toLocaleDateString('en-GB', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short'
                            })}
                          </td>
                          <td style={{
                            padding: '0.75rem',
                            textAlign: 'center',
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-light)'
                          }}>
                            <input
                              type="checkbox"
                              checked={manualWorkingDays?.has(day.date) ?? false}
                              onChange={() => toggleWorkingDay(day.date)}
                              style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                              title="Mark as working day"
                            />
                          </td>
                          <td
                            style={{
                              padding: '0.75rem',
                              textAlign: 'right',
                              borderBottom: isExpanded ? 'none' : '1px solid var(--border-light)',
                              cursor: hasPifs ? 'pointer' : 'default',
                              userSelect: 'none',
                              color: hasPifs ? 'var(--primary)' : 'inherit'
                            }}
                            onClick={() => hasPifs && toggleExpanded(day.date)}
                          >
                            {hasPifs && (
                              <span style={{ marginRight: '0.5rem' }}>
                                {isExpanded ? '▼' : '▶'}
                              </span>
                            )}
                            {day.pifs}
                          </td>
                          <td style={{
                            padding: '0.75rem',
                            textAlign: 'right',
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-light)'
                          }}>
                            {day.total}
                          </td>
                          <td style={{
                            padding: '0.75rem',
                            textAlign: 'right',
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-light)',
                            fontWeight: 'bold'
                          }}>
                            {formatCurrency(day.fees)}
                          </td>
                          <td style={{
                            padding: '0.75rem',
                            textAlign: 'right',
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-light)',
                            fontWeight: 'bold',
                            color: day.bonus > 0 ? 'var(--primary)' : 'var(--text-muted)'
                          }}>
                            {formatCurrency(day.bonus)}
                          </td>
                        </tr>
                        {isExpanded && hasPifs && (
                          <tr key={`${day.date}-expanded`}>
                            <td colSpan={6} style={{
                              padding: '0 0.75rem 1rem 0.75rem',
                              background: 'var(--background)',
                              borderBottom: '1px solid var(--border-light)'
                            }}>
                              <PifDetailsRow date={day.date} state={state} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SubscriptionGuard>
  );
}

interface PifDetailsRowProps {
  date: string;
  state: AppState;
}

function PifDetailsRow({ date, state }: PifDetailsRowProps) {
  const completions = state.completions || [];
  const pifCompletions = completions.filter(
    c => c.timestamp.slice(0, 10) === date && c.outcome === 'PIF'
  );

  if (pifCompletions.length === 0) {
    return <div style={{ color: 'var(--text-muted)' }}>No PIF completions found</div>;
  }

  const totalCollected = pifCompletions.reduce((sum, c) => {
    const amount = parseFloat(c.amount || '0');
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate bonus earned for these PIFs
  const bonusSettings = state.bonusSettings || DEFAULT_BONUS_SETTINGS;
  const bonusEarned = calculateBonus(pifCompletions, 1, bonusSettings);

  return (
    <div>
      <div style={{
        display: 'flex',
        gap: '2rem',
        marginBottom: '1rem',
        flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Total Collected
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--success)' }}>
            {formatCurrency(totalCollected)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Number of Cases
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
            {pifCompletions.length}
          </div>
        </div>
        {bonusEarned > 0 && (
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Bonus Earned
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              {formatCurrency(bonusEarned)}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: 'var(--text-muted)'
        }}>
          Case References:
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '0.5rem'
        }}>
          {pifCompletions.map((c, idx) => {
            const amount = parseFloat(c.amount || '0');

            // Calculate enforcement fees per TCG Regulations 2014
            const complianceFee = 75;
            const baseFee = 235;
            const amountOverThreshold = Math.max(0, amount - 1500);
            const percentageFee = amountOverThreshold * 0.075; // 7.5%
            const enforcementFee = complianceFee + baseFee + percentageFee;

            return (
              <div
                key={idx}
                style={{
                  padding: '0.5rem',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.875rem'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  {c.caseReference || 'No Reference'}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {formatCurrency(amount)}
                </div>
                {pifCompletions.length > 1 && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.25rem',
                    borderTop: '1px solid var(--border-light)',
                    paddingTop: '0.25rem'
                  }}>
                    Enf. Fee: {formatCurrency(enforcementFee)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
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