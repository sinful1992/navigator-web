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
}

// Modern CSS Styles with Dark Mode Support
const adminStyles = `
/* ==== Admin Dashboard Modern Styles ==== */
.admin-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  background: var(--gray-50);
  min-height: 100vh;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  background: white;
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--gray-200);
}

.admin-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--gray-800);
  margin: 0;
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.admin-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--gray-600);
  font-size: 0.875rem;
}

.close-button {
  background: var(--gray-100);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-normal);
  color: var(--gray-600);
}

.close-button:hover {
  background: var(--gray-200);
  color: var(--gray-800);
}

.admin-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  background: white;
  padding: 0.5rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--gray-200);
}

.admin-tabs button {
  flex: 1;
  padding: 0.75rem 1.5rem;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-md);
  font-weight: 500;
  color: var(--gray-600);
  transition: var(--transition-normal);
  position: relative;
}

.admin-tabs button:hover {
  background: var(--gray-50);
  color: var(--gray-800);
}

.admin-tabs button.active {
  background: var(--primary);
  color: white;
  box-shadow: var(--shadow-sm);
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat {
  background: white;
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--gray-200);
  text-align: center;
  transition: var(--transition-normal);
}

.stat:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat strong {
  display: block;
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 0.5rem;
}

.stat span {
  font-size: 0.875rem;
  color: var(--gray-500);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.admin-actions-panel {
  background: white;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: var(--shadow-sm);
}

.admin-actions-panel h3 {
  margin: 0 0 1.5rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--gray-800);
}

.admin-form .form-row {
  margin-bottom: 1.5rem;
}

.admin-form label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--gray-700);
  font-size: 0.875rem;
}

.admin-form select,
.admin-form input,
.admin-form textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--gray-300);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  transition: var(--transition-normal);
  background: white;
  color: var(--gray-800);
}

.admin-form select:focus,
.admin-form input:focus,
.admin-form textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}

.form-row .action-group {
  display: flex;
  gap: 1.5rem;
  align-items: end;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.input-group label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gray-500);
}

.input-group input {
  width: 100px;
}

.input-group button {
  background: var(--primary);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 600;
  transition: var(--transition-normal);
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
  background: white;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.subscriptions-table h3 {
  margin: 0;
  padding: 1rem 1.5rem;
  background: var(--gray-50);
  border-bottom: 1px solid var(--gray-200);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--gray-800);
}

.subscriptions-table table {
  width: 100%;
  border-collapse: collapse;
}

.subscriptions-table th,
.subscriptions-table td {
  padding: 1rem 1.5rem;
  text-align: left;
  border-bottom: 1px solid var(--gray-100);
}

.subscriptions-table th {
  background: var(--gray-50);
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--gray-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.subscriptions-table td {
  font-size: 0.875rem;
  color: var(--gray-700);
}

.actions-list {
  max-height: 600px;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.action-item {
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  margin-bottom: 1rem;
  padding: 1.5rem;
  background: white;
  box-shadow: var(--shadow-sm);
  transition: var(--transition-normal);
}

.action-item:hover {
  box-shadow: var(--shadow-md);
}

.action-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.action-header strong {
  color: var(--primary);
  font-weight: 600;
}

.action-date {
  color: var(--gray-500);
  font-size: 0.75rem;
  font-weight: 500;
}

.action-details p {
  margin: 0.5rem 0;
  font-size: 0.875rem;
  color: var(--gray-600);
}

.action-notes {
  margin-top: 1rem;
}

.action-notes pre {
  background: var(--gray-50);
  padding: 1rem;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  overflow-x: auto;
  border: 1px solid var(--gray-200);
  color: var(--gray-700);
}

.settings-info,
.quick-stats {
  background: white;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-sm);
}

.settings-info h4,
.quick-stats h4 {
  margin: 0 0 1rem 0;
  color: var(--gray-800);
  font-weight: 600;
}

.settings-info p {
  margin: 0.75rem 0;
  color: var(--gray-600);
}

.quick-stats ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.quick-stats li {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--gray-100);
  color: var(--gray-600);
  display: flex;
  justify-content: space-between;
}

.quick-stats li:last-child {
  border-bottom: none;
}

.loading,
.error {
  text-align: center;
  padding: 3rem;
  background: white;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.error h3 {
  color: var(--danger);
  margin-bottom: 1rem;
}

.loading {
  color: var(--gray-600);
}

/* ==== Dark Mode Support ==== */
.dark-mode .admin-dashboard {
  background: var(--gray-50);
}

.dark-mode .admin-header {
  background: var(--gray-100);
  border-color: var(--gray-200);
}

.dark-mode .admin-header h2 {
  color: var(--gray-800);
}

.dark-mode .admin-info {
  color: var(--gray-600);
}

.dark-mode .close-button {
  background: var(--gray-200);
  border-color: var(--gray-300);
  color: var(--gray-700);
}

.dark-mode .close-button:hover {
  background: var(--gray-300);
  color: var(--gray-800);
}

.dark-mode .admin-tabs {
  background: var(--gray-100);
  border-color: var(--gray-200);
}

.dark-mode .admin-tabs button {
  color: var(--gray-600);
}

.dark-mode .admin-tabs button:hover {
  background: var(--gray-200);
  color: var(--gray-800);
}

.dark-mode .stat {
  background: var(--gray-100);
  border-color: var(--gray-200);
}

.dark-mode .stat span {
  color: var(--gray-500);
}

.dark-mode .admin-actions-panel,
.dark-mode .subscriptions-table,
.dark-mode .action-item,
.dark-mode .settings-info,
.dark-mode .quick-stats,
.dark-mode .loading,
.dark-mode .error {
  background: var(--gray-100);
  border-color: var(--gray-200);
}

.dark-mode .admin-actions-panel h3,
.dark-mode .subscriptions-table h3 {
  color: var(--gray-800);
}

.dark-mode .admin-form label {
  color: var(--gray-700);
}

.dark-mode .admin-form select,
.dark-mode .admin-form input,
.dark-mode .admin-form textarea {
  background: var(--gray-200);
  border-color: var(--gray-300);
  color: var(--gray-800);
}

.dark-mode .subscriptions-table th {
  background: var(--gray-200);
  color: var(--gray-600);
}

.dark-mode .subscriptions-table td {
  color: var(--gray-700);
}

.dark-mode .action-notes pre {
  background: var(--gray-200);
  border-color: var(--gray-300);
  color: var(--gray-700);
}

.dark-mode .settings-info p,
.dark-mode .quick-stats li {
  color: var(--gray-600);
}

.dark-mode .quick-stats li {
  border-bottom-color: var(--gray-200);
}

/* ==== Responsive Design ==== */
@media (max-width: 768px) {
  .admin-dashboard {
    padding: 1rem;
  }

  .admin-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }

  .admin-tabs {
    flex-direction: column;
  }

  .stats-bar {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .form-row .action-group {
    flex-direction: column;
    gap: 1rem;
  }

  .subscriptions-table {
    overflow-x: auto;
  }

  .subscriptions-table table {
    min-width: 600px;
  }
}

@media (max-width: 480px) {
  .stats-bar {
    grid-template-columns: 1fr;
  }

  .stat strong {
    font-size: 1.5rem;
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