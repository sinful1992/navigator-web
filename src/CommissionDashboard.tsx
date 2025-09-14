import { useState } from "react";
import type { AppState } from "./types";
import { useCommissionTracking } from "./useCommissionTracking";
import { SubscriptionGuard } from "./SubscriptionGuard";
import type { User } from "@supabase/supabase-js";

interface CommissionDashboardProps {
  state: AppState;
  updateState: (updater: (state: AppState) => AppState) => void;
  user: User | null;
  onClose?: () => void;
}

export function CommissionDashboard({ state, updateState, user, onClose }: CommissionDashboardProps) {
  const {
    rules,
    activeRule,
    todaysEarnings,
    weeklyEarnings,
    todaysTotal,
    weeklyTotal,
    monthlyTotal,
    formatAmount,
    getWeeklyStats,
    setActiveRule
  } = useCommissionTracking(state, updateState);

  const [showSettings, setShowSettings] = useState(false);
  const weeklyStats = getWeeklyStats();

  return (
    <SubscriptionGuard user={user} fallback={<CommissionLockedView />}>
      <div className="commission-dashboard">
        <div className="dashboard-header">
          <h2>Commission Tracking</h2>
          <div className="header-actions">
            <button 
              className="btn btn-ghost btn-sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              ⚙️ Settings
            </button>
            {onClose && (
              <button className="close-button" onClick={onClose}>✕</button>
            )}
          </div>
        </div>

        {/* Active Rule Display */}
        {activeRule && (
          <div className="active-rule-card">
            <div className="rule-header">
              <h3>{activeRule.name}</h3>
              <span className="rule-type">{activeRule.courtType.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div className="rule-fees">
              <div className="fee-item">
                <span className="outcome-label pif">PIF</span>
                <span className="fee-amount">{formatAmount(activeRule.fees.pif)}</span>
              </div>
              <div className="fee-item">
                <span className="outcome-label done">DONE</span>
                <span className="fee-amount">{formatAmount(activeRule.fees.done)}</span>
              </div>
              <div className="fee-item">
                <span className="outcome-label da">DA</span>
                <span className="fee-amount">{formatAmount(activeRule.fees.da)}</span>
              </div>
              <div className="fee-item">
                <span className="outcome-label arr">ARR</span>
                <span className="fee-amount">{formatAmount(activeRule.fees.arr)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Earnings Overview */}
        <div className="earnings-overview">
          <div className="earning-card today">
            <h3>Today</h3>
            <div className="amount">{formatAmount(todaysTotal)}</div>
            {todaysEarnings && (
              <div className="breakdown">
                <span>{todaysEarnings.addressesCompleted} addresses</span>
                {todaysEarnings.bonusEarned && (
                  <span className="bonus">+{formatAmount(todaysEarnings.bonusEarned)} bonus</span>
                )}
              </div>
            )}
          </div>

          <div className="earning-card week">
            <h3>This Week</h3>
            <div className="amount">{formatAmount(weeklyTotal)}</div>
            <div className="breakdown">
              <span>{weeklyStats.totalCompletions} addresses</span>
              <span>{formatAmount(weeklyStats.averagePerDay)}/day avg</span>
            </div>
          </div>

          <div className="earning-card month">
            <h3>This Month</h3>
            <div className="amount">{formatAmount(monthlyTotal)}</div>
            <div className="breakdown">
              <span>Total month earnings</span>
            </div>
          </div>
        </div>

        {/* Weekly Progress */}
        {activeRule?.bonuses && (
          <div className="progress-section">
            <h3>Weekly Progress</h3>
            <div className="progress-cards">
              
              {/* Address Progress */}
              <div className="progress-card">
                <div className="progress-header">
                  <span>Daily Address Target</span>
                  <span>{weeklyStats.targetProgress.addresses.percentage.toFixed(0)}%</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${Math.min(weeklyStats.targetProgress.addresses.percentage, 100)}%` }}
                  />
                </div>
                <div className="progress-details">
                  {weeklyStats.targetProgress.addresses.completed} / {weeklyStats.targetProgress.addresses.target} addresses
                  {weeklyStats.targetProgress.addresses.completed >= weeklyStats.targetProgress.addresses.target && (
                    <span className="achievement">🎯 Target achieved!</span>
                  )}
                </div>
              </div>

              {/* PIF Progress */}
              <div className="progress-card">
                <div className="progress-header">
                  <span>Weekly PIF Target</span>
                  <span>{weeklyStats.targetProgress.pifs.percentage.toFixed(0)}%</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill pif"
                    style={{ width: `${Math.min(weeklyStats.targetProgress.pifs.percentage, 100)}%` }}
                  />
                </div>
                <div className="progress-details">
                  {weeklyStats.targetProgress.pifs.completed} / {weeklyStats.targetProgress.pifs.target} PIFs
                  {weeklyStats.targetProgress.pifs.completed >= weeklyStats.targetProgress.pifs.target && (
                    <span className="achievement">💰 Bonus earned!</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily Breakdown */}
        <div className="daily-breakdown">
          <h3>Daily Breakdown (Last 7 Days)</h3>
          <div className="daily-list">
            {weeklyEarnings.length === 0 ? (
              <div className="no-data">
                <p>No earnings recorded this week</p>
                <p className="hint">Complete some addresses to start tracking your earnings!</p>
              </div>
            ) : (
              weeklyEarnings.map(day => (
                <div key={day.date} className="daily-item">
                  <div className="day-info">
                    <div className="date">
                      {new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB', { 
                        weekday: 'short',
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                    <div className="day-stats">
                      <span>{day.addressesCompleted} addresses</span>
                      {day.workHours && <span>{day.workHours.toFixed(1)}h worked</span>}
                    </div>
                  </div>
                  
                  <div className="day-breakdown">
                    {day.completions.pif.count > 0 && (
                      <span className="completion-stat pif">
                        {day.completions.pif.count} PIF · {formatAmount(day.completions.pif.amount)}
                      </span>
                    )}
                    {day.completions.done.count > 0 && (
                      <span className="completion-stat done">
                        {day.completions.done.count} DONE · {formatAmount(day.completions.done.amount)}
                      </span>
                    )}
                    {day.completions.da.count > 0 && (
                      <span className="completion-stat da">
                        {day.completions.da.count} DA · {formatAmount(day.completions.da.amount)}
                      </span>
                    )}
                    {day.completions.arr.count > 0 && (
                      <span className="completion-stat arr">
                        {day.completions.arr.count} ARR · {formatAmount(day.completions.arr.amount)}
                      </span>
                    )}
                  </div>

                  <div className="day-total">
                    {formatAmount(day.totalEarnings)}
                    {day.bonusEarned && (
                      <span className="bonus-indicator">+bonus</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="settings-panel">
            <h3>Commission Settings</h3>
            <div className="rule-selector">
              <label>Active Commission Rule:</label>
              <select 
                value={activeRule?.id || ''} 
                onChange={(e) => setActiveRule(e.target.value)}
              >
                {rules.map(rule => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name} ({rule.courtType.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-note">
              <p><strong>Note:</strong> Commission tracking is automatically calculated based on your completions. 
              Change your active rule to match your current court type for accurate earnings tracking.</p>
            </div>
          </div>
        )}
      </div>
    </SubscriptionGuard>
  );
}

// Component shown when commission tracking is locked
function CommissionLockedView() {
  return (
    <div className="commission-locked">
      <div className="lock-content">
        <div className="lock-icon">🔒</div>
        <h3>Commission Tracking</h3>
        <p>Track your earnings automatically with configurable fee structures for different court types.</p>
        <div className="locked-features">
          <ul>
            <li>✓ Automatic PIF, Done, DA & ARR tracking</li>
            <li>✓ High Court & Magistrates fee structures</li>
            <li>✓ Daily and weekly bonus calculations</li>
            <li>✓ Earnings reports and progress tracking</li>
            <li>✓ Work hours and productivity analysis</li>
          </ul>
        </div>
        <button className="upgrade-button">
          Upgrade to Access Commission Tracking
        </button>
      </div>
    </div>
  );
}

// CSS Styles for Commission Dashboard
const commissionStyles = `
.commission-dashboard {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  border-bottom: 2px solid #28a745;
  padding-bottom: 12px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.close-button {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}

.active-rule-card {
  background: linear-gradient(135deg, #f8fff9 0%, #e8f5e8 100%);
  border: 1px solid #28a745;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.rule-type {
  background: #28a745;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.rule-fees {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.fee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #d4edda;
}

.outcome-label {
  font-weight: 600;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  color: white;
}

.outcome-label.pif { background: #28a745; }
.outcome-label.done { background: #007bff; }
.outcome-label.da { background: #ffc107; color: #212529; }
.outcome-label.arr { background: #6f42c1; }

.fee-amount {
  font-weight: 600;
  color: #28a745;
}

.earnings-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.earning-card {
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
}

.earning-card.today { border-left: 4px solid #28a745; }
.earning-card.week { border-left: 4px solid #007bff; }
.earning-card.month { border-left: 4px solid #6f42c1; }

.earning-card h3 {
  margin: 0 0 8px 0;
  color: #6c757d;
  font-size: 14px;
  text-transform: uppercase;
  font-weight: 600;
}

.earning-card .amount {
  font-size: 24px;
  font-weight: 700;
  color: #212529;
  margin-bottom: 8px;
}

.earning-card .breakdown {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #6c757d;
}

.earning-card .bonus {
  color: #ffc107;
  font-weight: 600;
}

.progress-section {
  margin-bottom: 32px;
}

.progress-cards {
  display: grid;
  gap: 16px;
}

.progress-card {
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 16px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
}

.progress-bar {
  background: #e9ecef;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: #28a745;
  transition: width 0.3s ease;
}

.progress-fill.pif {
  background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
}

.progress-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #6c757d;
}

.achievement {
  color: #28a745;
  font-weight: 600;
}

.daily-breakdown {
  margin-bottom: 24px;
}

.daily-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.no-data {
  text-align: center;
  padding: 32px;
  color: #6c757d;
}

.no-data .hint {
  font-size: 14px;
  margin-top: 8px;
}

.daily-item {
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 16px;
  align-items: center;
}

.day-info {
  display: flex;
  flex-direction: column;
}

.date {
  font-weight: 600;
  margin-bottom: 4px;
}

.day-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #6c757d;
}

.day-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.completion-stat {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: white;
}

.completion-stat.pif { background: #28a745; }
.completion-stat.done { background: #007bff; }
.completion-stat.da { background: #ffc107; color: #212529; }
.completion-stat.arr { background: #6f42c1; }

.day-total {
  text-align: right;
  font-weight: 700;
  font-size: 18px;
  color: #28a745;
}

.bonus-indicator {
  display: block;
  font-size: 10px;
  color: #ffc107;
  font-weight: 600;
}

.settings-panel {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
  margin-top: 24px;
}

.rule-selector {
  margin-bottom: 16px;
}

.rule-selector label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.rule-selector select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: white;
}

.settings-note {
  background: white;
  border: 1px solid #d1ecf1;
  border-radius: 4px;
  padding: 12px;
  font-size: 14px;
  color: #0c5460;
}

.commission-locked {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  padding: 40px 20px;
}

.lock-content {
  text-align: center;
  max-width: 400px;
}

.lock-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.locked-features ul {
  text-align: left;
  margin: 16px 0;
}

.locked-features li {
  margin: 8px 0;
  color: #28a745;
}

.upgrade-button {
  background: #007bff;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 16px;
}

.upgrade-button:hover {
  background: #0056b3;
}

.btn {
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn-ghost {
  background: transparent;
  border-color: #6c757d;
  color: #6c757d;
}

.btn-ghost:hover {
  background: #6c757d;
  color: white;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

@media (max-width: 768px) {
  .daily-item {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  .day-total {
    text-align: left;
  }
  
  .earnings-overview {
    grid-template-columns: 1fr;
  }
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const existingStyle = document.getElementById('commission-dashboard-styles');
  if (!existingStyle) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'commission-dashboard-styles';
    styleSheet.textContent = commissionStyles;
    document.head.appendChild(styleSheet);
  }
}