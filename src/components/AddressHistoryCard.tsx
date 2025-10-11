// Address History Card - Show historical data for addresses
import React, { useMemo } from 'react';
import { AddressIntelligence } from '../services/addressIntelligence';
import type { Completion } from '../types';

interface Props {
  address: string;
  completions: Completion[];
}

const AddressHistoryCardComponent: React.FC<Props> = ({ address, completions }) => {
  const history = useMemo(() => {
    return AddressIntelligence.getAddressHistory(address, completions);
  }, [address, completions]);

  if (!history || history.totalVisits === 0) {
    return null;
  }

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'PIF': return '#10b981';
      case 'Done': return '#3b82f6';
      case 'DA': return '#f59e0b';
      case 'ARR': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.03))',
      border: '1.5px solid rgba(99, 102, 241, 0.15)',
      borderRadius: '12px',
      padding: '1rem',
      marginTop: '0.75rem'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.75rem'
      }}>
        <span style={{ fontSize: '1.25rem' }}>📊</span>
        <h4 style={{
          margin: 0,
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: '#111827'
        }}>
          Address History
        </h4>
        <span style={{
          padding: '0.25rem 0.625rem',
          background: 'rgba(99, 102, 241, 0.1)',
          color: '#6366f1',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 600
        }}>
          {history.totalVisits} visit{history.totalVisits > 1 ? 's' : ''}
        </span>
      </div>

      {/* Success Rate */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '0.625rem',
        marginBottom: '0.75rem'
      }}>
        <div style={{
          padding: '0.75rem',
          background: 'white',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: history.successRate > 50 ? '#10b981' : '#f59e0b' }}>
            {history.successRate}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
            Success Rate
          </div>
        </div>

        {history.averagePIFAmount > 0 && (
          <div style={{
            padding: '0.75rem',
            background: 'white',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
              £{Math.round(history.averagePIFAmount)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
              Avg PIF
            </div>
          </div>
        )}
      </div>

      {/* Outcomes Breakdown */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        marginBottom: '0.75rem'
      }}>
        {Object.entries(history.outcomes).map(([outcome, count]) => {
          if (count === 0) return null;
          return (
            <div
              key={outcome}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.375rem 0.625rem',
                background: 'white',
                borderRadius: '6px',
                fontSize: '0.8125rem'
              }}
            >
              <div style={{
                width: '8px',
                height: '8px',
                background: getOutcomeColor(outcome),
                borderRadius: '50%'
              }} />
              <span style={{ fontWeight: 600, color: '#111827' }}>{count}</span>
              <span style={{ color: '#6b7280' }}>{outcome}</span>
            </div>
          );
        })}
      </div>

      {/* Best Time Insights */}
      {(history.bestTimeOfDay || history.bestDayOfWeek) && (
        <div style={{
          padding: '0.625rem 0.75rem',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.15)',
          borderRadius: '8px',
          fontSize: '0.8125rem',
          color: '#059669'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
            💡 Best Visit Times:
          </div>
          <div style={{ color: '#047857' }}>
            {history.bestTimeOfDay && (
              <div>• Around {history.bestTimeOfDay.hour}:00 ({history.bestTimeOfDay.successRate}% success)</div>
            )}
            {history.bestDayOfWeek && (
              <div>• On {history.bestDayOfWeek.day}s ({history.bestDayOfWeek.successRate}% success)</div>
            )}
          </div>
        </div>
      )}

      {/* Last Visit */}
      <div style={{
        marginTop: '0.75rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid rgba(0, 0, 0, 0.06)',
        fontSize: '0.8125rem',
        color: '#6b7280'
      }}>
        Last visit: <strong style={{ color: '#111827' }}>
          {new Date(history.lastVisitDate).toLocaleDateString('en-GB')} ({history.lastOutcome})
        </strong>
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const AddressHistoryCard = React.memo(AddressHistoryCardComponent);
