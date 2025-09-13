import React, { useState, useEffect } from "react";
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
  user_id: string;
  email: string;
  subscription_id: string | null;
  status: string | null;
  plan_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_start: string | null;
  trial_end: string | null;
  created_at: string | null;
  last_payment_at: string | null;
  days_remaining: number;
  effective_status: string;
}

interface AdminAction {
  id: string;
  action_type: string;
  target_user_id: string;
  performed_at: string;
  details: any;
  admin_email?: string;
}

interface AdminDashboardProps {
  user: User;
  onClose?: () => void;
}

export function AdminDashboard({ user, onClose }: AdminDashboardProps) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionOverview[]>([]);
  const [recentActions, setRecentActions] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'actions' | 'settings'>('subscriptions');

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

      if (adminCheckError) throw adminCheckError;

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

      // Load subscription overview
      const { data: subsData, error: subsError } = await supabase
        .from('admin_subscription_overview')
        .select('*')
        .order('created_at', { ascending: false });

      if (subsError) throw subsError;
      setSubscriptions(subsData || []);

      // Load recent admin actions
      const { data: actionsData, error: actionsError } = await supabase
        .from('admin_actions')
        .select(`
          *,
          admin_users!inner(email)
        `)
        .order('performed_at', { ascending: false })
        .limit(20);

      if (actionsError) throw actionsError;
      
      const formattedActions = (actionsData || []).map(action => ({
        ...action,
        admin_email: action.admin_users?.email
      }));
      setRecentActions(formattedActions);

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
      
      const { data, error } = await supabase
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
      
      const { data, error } = await supabase
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
              <strong>{subscriptions.filter(s => s.effective_status === 'active_trial').length}</strong>
              <span>Active Trials</span>
            </div>
            <div className="stat">
              <strong>{subscriptions.filter(s => s.effective_status === 'active_paid').length}</strong>
              <span>Paid Subscriptions</span>
            </div>
            <div className="stat">
              <strong>{subscriptions.filter(s => s.effective_status === 'expired').length}</strong>
              <span>Expired</span>
            </div>
            <div className="stat">
              <strong>£{subscriptions.filter(s => s.effective_status === 'active_paid').length * 25}</strong>
              <span>Monthly Revenue</span>
            </div>
          </div>

          <div className="admin-actions-panel">
            <h3>Admin Actions</h3>
            <div className="admin-form">
              <div className="form-row">
                <select 
                  value={selectedUserId} 
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Select User...</option>
                  {subscriptions.map(sub => (
                    <option key={sub.user_id} value={sub.user_id}>
                      {sub.email} - {getStatusBadge(sub.effective_status).props.children}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="action-group">
                  <div className="input-group">
                    <label>Grant Subscription (months):</label>
                    <input 
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
                    <label>Extend Trial (days):</label>
                    <input 
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
                <textarea 
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
                  <th>Days Remaining</th>
                  <th>Created</th>
                  <th>Last Payment</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(sub => (
                  <tr key={sub.user_id}>
                    <td>{sub.email}</td>
                    <td>{getStatusBadge(sub.effective_status)}</td>
                    <td>{sub.plan_id || 'No Plan'}</td>
                    <td>{sub.days_remaining > 0 ? `${sub.days_remaining} days` : 'Expired'}</td>
                    <td>{formatDate(sub.created_at)}</td>
                    <td>{formatDate(sub.last_payment_at)}</td>
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
              <li>Active Trials: {subscriptions.filter(s => s.effective_status === 'active_trial').length}</li>
              <li>Paid Customers: {subscriptions.filter(s => s.effective_status === 'active_paid').length}</li>
              <li>Monthly Revenue: £{subscriptions.filter(s => s.effective_status === 'active_paid').length * 25}</li>
              <li>Total Actions Performed: {recentActions.length}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// CSS Styles (would typically be in a separate file)
const adminStyles = `
.admin-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 2px solid #007bff;
  padding-bottom: 10px;
}

.admin-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.close-button {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 5px;
}

.admin-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  border-bottom: 1px solid #ddd;
}

.admin-tabs button {
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.admin-tabs button.active {
  border-bottom-color: #007bff;
  color: #007bff;
  font-weight: 500;
}

.stats-bar {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
}

.stat {
  text-align: center;
}

.stat strong {
  display: block;
  font-size: 24px;
  color: #007bff;
}

.stat span {
  font-size: 14px;
  color: #6c757d;
}

.admin-actions-panel {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.admin-form .form-row {
  margin-bottom: 15px;
}

.admin-form select, .admin-form input, .admin-form textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-row .action-group {
  display: flex;
  gap: 20px;
  align-items: end;
}

.input-group {
  display: flex;
  gap: 10px;
  align-items: center;
  flex: 1;
}

.input-group label {
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
}

.input-group input {
  width: 80px;
}

.input-group button {
  background: #007bff;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.input-group button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.subscriptions-table {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.subscriptions-table h3 {
  margin: 0;
  padding: 15px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #ddd;
}

.subscriptions-table table {
  width: 100%;
  border-collapse: collapse;
}

.subscriptions-table th,
.subscriptions-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.subscriptions-table th {
  background: #f8f9fa;
  font-weight: 600;
  font-size: 14px;
}

.subscriptions-table td {
  font-size: 14px;
}

.actions-list {
  max-height: 600px;
  overflow-y: auto;
}

.action-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 15px;
  padding: 15px;
  background: white;
}

.action-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.action-date {
  color: #6c757d;
  font-size: 14px;
}

.action-details p {
  margin: 5px 0;
  font-size: 14px;
}

.action-notes {
  margin-top: 10px;
}

.action-notes pre {
  background: #f8f9fa;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
}

.settings-info, .quick-stats {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.settings-info p, .quick-stats ul {
  margin: 10px 0;
}

.quick-stats ul {
  list-style: none;
  padding: 0;
}

.quick-stats li {
  padding: 5px 0;
  border-bottom: 1px solid #eee;
}

.loading, .error {
  text-align: center;
  padding: 40px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.error h3 {
  color: #dc3545;
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