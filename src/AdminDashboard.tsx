import * as React from "react";
import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'support';
  permissions: string[];
  created_at: string;
  is_active: boolean;
}

interface SubscriptionOverview {
  user_email: string;
  subscription_status: string;
  subscription_plan: string;
  trial_end: string | null;
  current_period_end: string | null;
  subscription_created_at: string | null;
  total_api_requests: number;
}

// Define specific types for different admin action details
type SubscriptionDetails = {
  plan_type?: string;
  duration?: string;
  amount?: number;
  reason?: string;
};

type UserManagementDetails = {
  email?: string;
  reason?: string;
  previous_status?: string;
  new_status?: string;
};

type SystemActionDetails = {
  feature?: string;
  configuration?: Record<string, unknown>;
  reason?: string;
};

// Union type for all possible admin action details
type AdminActionDetails =
  | SubscriptionDetails
  | UserManagementDetails
  | SystemActionDetails
  | Record<string, unknown>
  | null;

interface AdminAction {
  id: string;
  action_type: string;
  target_user_id: string;
  performed_at: string;
  details: AdminActionDetails;
  admin_email?: string;
}

interface UpcomingDeletion {
  user_id: string;
  user_email: string;
  last_activity_at: string;
  deletion_scheduled_for: string;
  warning_sent_at: string;
  warning_acknowledged: boolean;
  cancelled: boolean;
  days_until_deletion: number;
  has_active_subscription: boolean;
}

interface AdminDashboardProps {
  user: User;
  onClose?: () => void;
}

const AdminDashboardComponent = function AdminDashboard({ user, onClose }: AdminDashboardProps) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionOverview[]>([]);
  const [recentActions, setRecentActions] = useState<AdminAction[]>([]);
  const [upcomingDeletions, setUpcomingDeletions] = useState<UpcomingDeletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'actions' | 'inactive' | 'settings'>('subscriptions');

  // Form states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [grantMonths, setGrantMonths] = useState(1);
  const [extendDays, setExtendDays] = useState(7);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Check if current user is admin and load data
  useEffect(() => {
    loadAdminData();
  }, [user]);

  const loadAdminData = async () => {
    if (!user || !supabase) return;

    try {
      setLoading(true);
      setError(null);

      // Check if user is admin
      const { data: isAdminResult, error: adminCheckError } = await supabase
        .rpc('is_admin', { user_uuid: user.id });

      if (adminCheckError) {
        console.error('Admin check error:', adminCheckError);
        throw adminCheckError;
      }

      if (!isAdminResult) {
        throw new Error('Access denied: Admin privileges required');
      }

      // Get admin user info
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (adminError) throw adminError;
      setAdminUser(adminData);

      // Load subscription overview using secure function
      const { data: subsData, error: subsError } = await supabase
        .rpc('get_admin_subscription_overview');

      if (subsError) {
        console.error('Subscription overview error:', subsError);
        throw subsError;
      }
      setSubscriptions(subsData || []);

      // Load recent admin actions (skip if table doesn't exist)
      let actionsData: any[] = [];
      try {
        const { data, error: actionsError } = await supabase
          .from('admin_actions')
          .select(`
            id,
            action_type,
            target_user_id,
            performed_at,
            details,
            admin_users!inner(email)
          `)
          .order('performed_at', { ascending: false })
          .limit(20);

        if (actionsError) {
          console.warn('Admin actions table not found or error:', actionsError);
          actionsData = [];
        } else {
          actionsData = data || [];
        }
      } catch (e) {
        console.warn('Failed to load admin actions:', e);
        actionsData = [];
      }
      
      const formattedActions = (actionsData || []).map((action: any) => ({
        ...action,
        admin_email: action.admin_users?.email || (Array.isArray(action.admin_users) ? action.admin_users[0]?.email : null)
      }));
      setRecentActions(formattedActions);

      // Load upcoming deletions
      const { data: deletionsData, error: deletionsError } = await supabase
        .from('admin_upcoming_deletions')
        .select('*')
        .order('deletion_scheduled_for', { ascending: true });

      if (!deletionsError) {
        setUpcomingDeletions(deletionsData || []);
      } else {
        console.warn('Failed to load upcoming deletions:', deletionsError);
      }

    } catch (e: any) {
      setError(e.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  // Grant subscription to user
  const handleGrantSubscription = async () => {
    if (!selectedUserId || !supabase) return;

    try {
      setActionLoading('grant');
      
      const { error } = await supabase
        .rpc('admin_grant_subscription', {
          target_user_id: selectedUserId,
          plan_id: 'enforcement_pro',
          duration_months: grantMonths,
          admin_notes: adminNotes || `Granted ${grantMonths} month(s) by admin`
        });

      if (error) throw error;

      // Refresh data
      await loadAdminData();
      
      // Reset form
      setSelectedUserId('');
      setGrantMonths(1);
      setAdminNotes('');
      
      alert('Subscription granted successfully!');

    } catch (e: any) {
      alert('Failed to grant subscription: ' + e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Extend trial for user
  const handleExtendTrial = async () => {
    if (!selectedUserId || !supabase) return;

    try {
      setActionLoading('extend');

      const { error } = await supabase
        .rpc('admin_extend_trial', {
          target_user_id: selectedUserId,
          additional_days: extendDays,
          admin_notes: adminNotes || `Extended trial by ${extendDays} days`
        });

      if (error) throw error;

      // Refresh data
      await loadAdminData();

      // Reset form
      setSelectedUserId('');
      setExtendDays(7);
      setAdminNotes('');

      alert('Trial extended successfully!');

    } catch (e: any) {
      alert('Failed to extend trial: ' + e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Cancel scheduled deletion for user
  const handleCancelDeletion = async (userId: string, userEmail: string) => {
    if (!supabase) return;

    const confirmed = confirm(`Cancel scheduled deletion for ${userEmail}?`);
    if (!confirmed) return;

    try {
      setActionLoading('cancel-deletion');

      // Update warnings to mark as cancelled
      const { error } = await supabase
        .from('inactive_account_warnings')
        .update({ cancelled: true, warning_acknowledged: true })
        .eq('user_id', userId)
        .eq('cancelled', false);

      if (error) throw error;

      // Refresh data
      await loadAdminData();

      alert(`Scheduled deletion cancelled for ${userEmail}`);

    } catch (e: any) {
      alert('Failed to cancel deletion: ' + e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; label: string }> = {
      active_trial: { color: '#fff3cd', label: 'Active Trial' },
      active_paid: { color: '#d4edda', label: 'Active Paid' },
      expired: { color: '#f8d7da', label: 'Expired' },
      cancelled: { color: '#e2e3e5', label: 'Cancelled' },
    };
    
    const statusInfo = statusMap[status] || { color: '#f8f9fa', label: status };
    
    return (
      <span 
        style={{ 
          backgroundColor: statusInfo.color, 
          padding: '4px 8px', 
          borderRadius: '4px', 
          fontSize: '12px',
          fontWeight: '500'
        }}
      >
        {statusInfo.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading">Loading admin dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div className="error">
          <h3>Access Denied</h3>
          <p>{error}</p>
          {onClose && <button onClick={onClose}>Close</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h2>Admin Dashboard</h2>
        <div className="admin-info">
          <span>Role: <strong>{adminUser?.role}</strong></span>
          {onClose && (
            <button className="close-button" onClick={onClose}>✕</button>
          )}
        </div>
      </div>

      <div className="admin-tabs">
        <button
          className={activeTab === 'subscriptions' ? 'active' : ''}
          onClick={() => setActiveTab('subscriptions')}
        >
          Subscriptions ({subscriptions.length})
        </button>
        <button
          className={activeTab === 'actions' ? 'active' : ''}
          onClick={() => setActiveTab('actions')}
        >
          Recent Actions ({recentActions.length})
        </button>
        <button
          className={activeTab === 'inactive' ? 'active' : ''}
          onClick={() => setActiveTab('inactive')}
        >
          Inactive Accounts ({upcomingDeletions.length})
        </button>
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {activeTab === 'subscriptions' && (
        <div className="subscriptions-tab">
          <div className="stats-bar">
            <div className="stat">
              <strong>{subscriptions.filter(s => s.subscription_status === 'trial').length}</strong>
              <span>Active Trials</span>
            </div>
            <div className="stat">
              <strong>{subscriptions.filter(s => s.subscription_status === 'active').length}</strong>
              <span>Paid Subscriptions</span>
            </div>
            <div className="stat">
              <strong>{subscriptions.filter(s => s.subscription_status === 'expired').length}</strong>
              <span>Expired</span>
            </div>
            <div className="stat">
              <strong>£{subscriptions.filter(s => s.subscription_status === 'active').length * 25}</strong>
              <span>Monthly Revenue</span>
            </div>
          </div>

          <div className="admin-actions-panel">
            <h3>Admin Actions</h3>
            <div className="admin-form">
              <div className="form-row">
                <label htmlFor="selected-user-id">Select User</label>
                <select
                  id="selected-user-id"
                  name="selectedUserId"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Select User...</option>
                  {subscriptions.map(sub => (
                    <option key={sub.user_email} value={sub.user_email}>
                      {sub.user_email} - {getStatusBadge(sub.subscription_status).props.children}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="action-group">
                  <div className="input-group">
                    <label htmlFor="grant-months">Grant Subscription (months):</label>
                    <input
                      id="grant-months"
                      name="grantMonths"
                      type="number"
                      min="1"
                      max="12"
                      value={grantMonths}
                      onChange={(e) => setGrantMonths(parseInt(e.target.value) || 1)}
                    />
                    <button 
                      onClick={handleGrantSubscription}
                      disabled={!selectedUserId || actionLoading !== null}
                    >
                      {actionLoading === 'grant' ? 'Granting...' : 'Grant'}
                    </button>
                  </div>
                </div>

                <div className="action-group">
                  <div className="input-group">
                    <label htmlFor="extend-days">Extend Trial (days):</label>
                    <input
                      id="extend-days"
                      name="extendDays"
                      type="number"
                      min="1"
                      max="90"
                      value={extendDays}
                      onChange={(e) => setExtendDays(parseInt(e.target.value) || 7)}
                    />
                    <button 
                      onClick={handleExtendTrial}
                      disabled={!selectedUserId || actionLoading !== null}
                    >
                      {actionLoading === 'extend' ? 'Extending...' : 'Extend'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="admin-notes">Admin notes (optional)</label>
                <textarea
                  id="admin-notes"
                  name="adminNotes"
                  placeholder="Admin notes (optional)"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="subscriptions-table">
            <h3>All Subscriptions</h3>
            <table>
              <thead>
                <tr>
                  <th>User Email</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>API Requests</th>
                  <th>Created</th>
                  <th>Period End</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(sub => (
                  <tr key={sub.user_email}>
                    <td>{sub.user_email}</td>
                    <td>{getStatusBadge(sub.subscription_status)}</td>
                    <td>{sub.subscription_plan || 'No Plan'}</td>
                    <td>{sub.total_api_requests || 0}</td>
                    <td>{formatDate(sub.subscription_created_at)}</td>
                    <td>{formatDate(sub.current_period_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="actions-tab">
          <h3>Recent Admin Actions</h3>
          <div className="actions-list">
            {recentActions.map(action => (
              <div key={action.id} className="action-item">
                <div className="action-header">
                  <strong>{action.action_type.replace('_', ' ').toUpperCase()}</strong>
                  <span className="action-date">{formatDate(action.performed_at)}</span>
                </div>
                <div className="action-details">
                  <p><strong>Admin:</strong> {action.admin_email}</p>
                  <p><strong>Target User:</strong> {action.target_user_id}</p>
                  {action.details && (
                    <div className="action-notes">
                      <strong>Details:</strong>
                      <pre>{JSON.stringify(action.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'inactive' && (
        <div className="inactive-tab">
          <h3>Upcoming Account Deletions (GDPR Compliance)</h3>
          {upcomingDeletions.length === 0 ? (
            <div className="no-deletions">
              <p>No accounts scheduled for deletion. All users are active! 🎉</p>
            </div>
          ) : (
            <div className="deletions-table">
              <table>
                <thead>
                  <tr>
                    <th>User Email</th>
                    <th>Last Activity</th>
                    <th>Warning Sent</th>
                    <th>Deletion Date</th>
                    <th>Days Until</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingDeletions.map(deletion => (
                    <tr key={deletion.user_id}>
                      <td>{deletion.user_email}</td>
                      <td>{formatDate(deletion.last_activity_at)}</td>
                      <td>{formatDate(deletion.warning_sent_at)}</td>
                      <td>{formatDate(deletion.deletion_scheduled_for)}</td>
                      <td>
                        <span style={{
                          color: deletion.days_until_deletion <= 7 ? 'var(--danger)' : 'var(--text)',
                          fontWeight: deletion.days_until_deletion <= 7 ? '700' : '400'
                        }}>
                          {deletion.days_until_deletion} days
                        </span>
                      </td>
                      <td>
                        {deletion.warning_acknowledged ? (
                          <span style={{ color: 'var(--primary)' }}>Acknowledged</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="cancel-btn"
                          onClick={() => handleCancelDeletion(deletion.user_id, deletion.user_email)}
                          disabled={actionLoading !== null}
                          style={{
                            background: 'var(--danger)',
                            color: 'white',
                            border: 'none',
                            padding: '0.375rem 0.75rem',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            fontSize: '0.625rem',
                            fontWeight: '600',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Cancel Deletion
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="deletion-info" style={{
                marginTop: '1rem',
                padding: '1rem',
                background: 'var(--surface)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)'
              }}>
                <p><strong>How it works:</strong></p>
                <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                  <li>Accounts inactive for 5 months receive a warning email</li>
                  <li>After 6 months of inactivity, account is automatically deleted</li>
                  <li>Users can prevent deletion by simply logging in or creating data</li>
                  <li>Active subscriptions are never deleted automatically</li>
                  <li>Admins can cancel scheduled deletions manually using the button above</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="settings-tab">
          <h3>Admin Settings</h3>
          <div className="settings-info">
            <p><strong>Your Role:</strong> {adminUser?.role}</p>
            <p><strong>Permissions:</strong> {adminUser?.permissions.join(', ')}</p>
            <p><strong>Account Created:</strong> {formatDate(adminUser?.created_at || '')}</p>
          </div>
          
          <div className="quick-stats">
            <h4>Quick Stats</h4>
            <ul>
              <li>Total Users: {subscriptions.length}</li>
              <li>Active Trials: {subscriptions.filter(s => s.subscription_status === 'trial').length}</li>
              <li>Paid Customers: {subscriptions.filter(s => s.subscription_status === 'active').length}</li>
              <li>Monthly Revenue: £{subscriptions.filter(s => s.subscription_status === 'active').length * 25}</li>
              <li>Total Actions Performed: {recentActions.length}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export const AdminDashboard = React.memo(AdminDashboardComponent);

// Modern CSS Styles with Dark Mode Support
const adminStyles = `
/* ==== Admin Dashboard Modern Styles ==== */
.admin-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
  background: var(--background);
  min-height: 100vh;
  overflow-x: hidden;
  box-sizing: border-box;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  background: var(--surface);
  padding: 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--border-light);
}

.admin-header h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

.admin-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.close-button {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-muted);
}

.close-button:hover {
  background: var(--background);
  color: var(--text);
}

.admin-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  background: var(--surface);
  padding: 0.25rem;
  border-radius: var(--radius);
  border: 1px solid var(--border-light);
}

.admin-tabs button {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius);
  font-weight: 500;
  color: var(--text-muted);
  transition: all 0.2s ease;
  position: relative;
  font-size: 0.75rem;
  text-align: center;
}

.admin-tabs button:hover {
  background: var(--background);
  color: var(--text);
}

.admin-tabs button.active {
  background: var(--primary);
  color: white;
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.stat {
  background: var(--surface);
  padding: 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--border-light);
  text-align: center;
  transition: all 0.2s ease;
}

.stat:hover {
  transform: translateY(-1px);
}

.stat strong {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 0.25rem;
}

.stat span {
  font-size: 0.625rem;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.2;
}

.admin-actions-panel {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  padding: 1rem;
  margin-bottom: 1rem;
}

.admin-actions-panel h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.admin-form .form-row {
  margin-bottom: 1rem;
}

.admin-form label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text);
  font-size: 0.75rem;
}

.admin-form select,
.admin-form input,
.admin-form textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  font-size: 0.75rem;
  transition: all 0.2s ease;
  background: var(--background);
  color: var(--text);
  box-sizing: border-box;
}

.admin-form select:focus,
.admin-form input:focus,
.admin-form textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.form-row .action-group {
  display: flex;
  gap: 0.5rem;
  align-items: end;
  flex-wrap: wrap;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.input-group label {
  margin: 0;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.input-group input {
  width: 80px;
  min-width: 60px;
}

.input-group button {
  background: var(--primary);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
  font-size: 0.75rem;
  white-space: nowrap;
}

.input-group button:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.input-group button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.subscriptions-table {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  overflow: hidden;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.subscriptions-table h3 {
  margin: 0;
  padding: 0.75rem 1rem;
  background: var(--background);
  border-bottom: 1px solid var(--border-light);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.subscriptions-table table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
}

.subscriptions-table th,
.subscriptions-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border-light);
}

.subscriptions-table th {
  background: var(--background);
  font-weight: 600;
  font-size: 0.625rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.subscriptions-table td {
  font-size: 0.75rem;
  color: var(--text);
  white-space: nowrap;
}

.actions-list {
  max-height: 400px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.action-item {
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  margin-bottom: 0.5rem;
  padding: 1rem;
  background: var(--surface);
  transition: all 0.2s ease;
}

.action-item:hover {
  transform: translateY(-1px);
}

.action-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
}

.action-header strong {
  color: var(--primary);
  font-weight: 600;
  font-size: 0.75rem;
  flex: 1;
}

.action-date {
  color: var(--text-muted);
  font-size: 0.625rem;
  font-weight: 500;
  white-space: nowrap;
}

.action-details p {
  margin: 0.25rem 0;
  font-size: 0.75rem;
  color: var(--text);
}

.action-notes {
  margin-top: 0.75rem;
}

.action-notes pre {
  background: var(--background);
  padding: 0.75rem;
  border-radius: var(--radius);
  font-size: 0.625rem;
  overflow-x: auto;
  border: 1px solid var(--border-light);
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.settings-info,
.quick-stats {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  padding: 1rem;
  margin-bottom: 1rem;
}

.settings-info h4,
.quick-stats h4 {
  margin: 0 0 0.75rem 0;
  color: var(--text);
  font-weight: 600;
  font-size: 1rem;
}

.settings-info p {
  margin: 0.5rem 0;
  color: var(--text);
  font-size: 0.75rem;
}

.quick-stats ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.quick-stats li {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-light);
  color: var(--text);
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  gap: 1rem;
}

.quick-stats li:last-child {
  border-bottom: none;
}

.loading,
.error {
  text-align: center;
  padding: 2rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  margin: 1rem;
}

.error h3 {
  color: var(--danger);
  margin-bottom: 1rem;
  font-size: 1rem;
}

.loading {
  color: var(--text-muted);
  font-size: 0.875rem;
}

/* CSS Variables handle dark mode automatically through the app's theme system */

/* ==== Responsive Design - Mobile First ==== */
@media (max-width: 480px) {
  .admin-dashboard {
    padding: 0.5rem;
    margin: 0;
  }

  .admin-header {
    flex-direction: column;
    gap: 0.5rem;
    text-align: center;
    padding: 0.75rem;
  }

  .admin-header h2 {
    font-size: 1.125rem;
  }

  .admin-info {
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.625rem;
  }

  .admin-tabs {
    flex-direction: column;
    gap: 0.125rem;
  }

  .admin-tabs button {
    padding: 0.5rem;
    font-size: 0.75rem;
  }

  .stats-bar {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.25rem;
  }

  .stat {
    padding: 0.5rem;
  }

  .stat strong {
    font-size: 1rem;
    margin-bottom: 0.125rem;
  }

  .stat span {
    font-size: 0.5rem;
  }

  .admin-actions-panel {
    padding: 0.75rem;
  }

  .form-row .action-group {
    flex-direction: column;
    gap: 0.5rem;
    align-items: stretch;
  }

  .input-group {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .input-group label {
    margin: 0;
    min-width: 60px;
    text-align: left;
    font-size: 0.5rem;
  }

  .input-group input {
    width: 60px;
    min-width: 60px;
  }

  .input-group button {
    padding: 0.5rem 0.75rem;
    font-size: 0.625rem;
  }

  .subscriptions-table h3 {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }

  .subscriptions-table th,
  .subscriptions-table td {
    padding: 0.375rem 0.5rem;
    font-size: 0.625rem;
  }

  .action-item {
    padding: 0.75rem;
  }

  .action-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .action-header strong {
    font-size: 0.625rem;
  }

  .action-date {
    font-size: 0.5rem;
  }

  .action-details p {
    font-size: 0.625rem;
    margin: 0.125rem 0;
  }

  .action-notes pre {
    padding: 0.5rem;
    font-size: 0.5rem;
  }

  .settings-info,
  .quick-stats {
    padding: 0.75rem;
  }

  .settings-info h4,
  .quick-stats h4 {
    font-size: 0.875rem;
  }

  .settings-info p,
  .quick-stats li {
    font-size: 0.625rem;
  }
}

@media (max-width: 360px) {
  .admin-dashboard {
    padding: 0.25rem;
  }

  .stats-bar {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }

  .stat strong {
    font-size: 0.875rem;
  }

  .stat span {
    font-size: 0.5rem;
  }

  .admin-tabs button {
    padding: 0.375rem;
    font-size: 0.625rem;
  }
}

/* Tablet optimizations */
@media (min-width: 481px) and (max-width: 768px) {
  .admin-dashboard {
    padding: 0.75rem;
  }

  .stats-bar {
    grid-template-columns: repeat(2, 1fr);
  }

  .form-row .action-group {
    flex-wrap: wrap;
    gap: 0.75rem;
  }
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const existingStyle = document.getElementById('admin-dashboard-styles');
  if (!existingStyle) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'admin-dashboard-styles';
    styleSheet.textContent = adminStyles;
    document.head.appendChild(styleSheet);
  }
}