import React, { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useSubscription } from "./useSubscription";
import type { SubscriptionPlan } from "./types";

interface SubscriptionManagerProps {
  user: User;
  onClose?: () => void;
}

// Format price for display
function formatPrice(priceInPence: number, currency: string): string {
  const pounds = priceInPence / 100;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(pounds);
}

// Format date for display
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function SubscriptionManager({ user, onClose }: SubscriptionManagerProps) {
  const {
    subscription,
    availablePlans,
    isLoading,
    error,
    isActive,
    isTrial,
    isExpired,
    daysRemaining,
    hasAccess,
    startTrial,
    subscribe,
    cancelSubscription,
    clearError
  } = useSubscription(user);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleStartTrial = async () => {
    try {
      setActionLoading('trial');
      await startTrial();
    } catch (e) {
      // Error is handled by the hook
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubscribe = async (planId: string) => {
    try {
      setActionLoading(`subscribe-${planId}`);
      await subscribe(planId);
    } catch (e) {
      // Error is handled by the hook
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access at the end of your current billing period.')) {
      return;
    }

    try {
      setActionLoading('cancel');
      await cancelSubscription();
    } catch (e) {
      // Error is handled by the hook
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="subscription-manager">
        <div className="subscription-loading">
          <div className="spinner"></div>
          <p>Loading subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="subscription-manager">
      <div className="subscription-header">
        <h2>Subscription Management</h2>
        {onClose && (
          <button className="close-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={clearError}>Dismiss</button>
        </div>
      )}

      {/* Current Subscription Status */}
      {subscription ? (
        <div className="current-subscription">
          <h3>Current Subscription</h3>
          <div className="subscription-card">
            <div className="subscription-info">
              <div className="plan-name">
                {availablePlans.find(p => p.id === subscription.planId)?.name || 'Unknown Plan'}
              </div>
              <div className="subscription-status">
                <span className={`status-badge ${subscription.status}`}>
                  {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                </span>
                {isTrial && (
                  <span className="trial-badge">
                    {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Trial expired'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="subscription-details">
              <p><strong>Current Period:</strong> {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}</p>
              {subscription.nextPaymentDue && isActive && !isTrial && (
                <p><strong>Next Payment:</strong> {formatDate(subscription.nextPaymentDue)}</p>
              )}
              {subscription.cancelledAt && (
                <p><strong>Cancelled:</strong> {formatDate(subscription.cancelledAt)}</p>
              )}
            </div>

            {hasAccess && (
              <div className="subscription-features">
                <h4>Your Features:</h4>
                <ul>
                  {availablePlans.find(p => p.id === subscription.planId)?.features.map((feature, index) => (
                    <li key={index}>✓ {feature}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="subscription-actions">
              {isTrial && daysRemaining > 0 && (
                <button 
                  className="btn-primary"
                  onClick={() => handleSubscribe(subscription.planId)}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === `subscribe-${subscription.planId}` ? 'Processing...' : 'Upgrade to Paid'}
                </button>
              )}
              
              {isActive && !isTrial && (
                <button 
                  className="btn-secondary"
                  onClick={handleCancel}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'cancel' ? 'Processing...' : 'Cancel Subscription'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* No Subscription - Show Available Plans */
        <div className="available-plans">
          <h3>Choose Your Plan</h3>
          <p className="plans-intro">
            Transform your enforcement work with our unified platform. 
            Replace multiple expensive apps with one powerful solution.
          </p>
          
          {availablePlans.map((plan) => (
            <div key={plan.id} className="plan-card featured">
              <div className="plan-header">
                <h4>{plan.name}</h4>
                <div className="plan-price">
                  <span className="price">{formatPrice(plan.price, plan.currency)}</span>
                  <span className="period">/month</span>
                </div>
              </div>
              
              <div className="plan-features">
                <ul>
                  {plan.features.map((feature, index) => (
                    <li key={index}>✓ {feature}</li>
                  ))}
                </ul>
              </div>
              
              <div className="plan-actions">
                <button 
                  className="btn-primary full-width"
                  onClick={handleStartTrial}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'trial' ? 'Starting Trial...' : `Start ${plan.trialDays}-Day Free Trial`}
                </button>
                <p className="trial-note">
                  No payment required • Cancel anytime • Full access during trial
                </p>
              </div>
            </div>
          ))}
          
          <div className="value-proposition">
            <h4>Why Enforcement Pro?</h4>
            <div className="comparison">
              <div className="comparison-item">
                <span className="old-cost">Route Planning App: £20-30/month</span>
                <span className="new-cost">✓ Included</span>
              </div>
              <div className="comparison-item">
                <span className="old-cost">SMS Service: £10-15/month</span>
                <span className="new-cost">✓ Included</span>
              </div>
              <div className="comparison-item">
                <span className="old-cost">Basic Tracking: £10-20/month</span>
                <span className="new-cost">✓ Included</span>
              </div>
              <div className="total-savings">
                <strong>Total Monthly Savings: £15-40</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Access Status Warning */}
      {isExpired && (
        <div className="access-warning">
          <h4>⚠️ Subscription Expired</h4>
          <p>Your subscription has expired. Please renew to continue using premium features.</p>
          <button 
            className="btn-primary"
            onClick={() => availablePlans[0] && handleSubscribe(availablePlans[0].id)}
            disabled={actionLoading !== null}
          >
            Renew Subscription
          </button>
        </div>
      )}
    </div>
  );
}

// CSS styles (would typically be in a separate CSS file)
const styles = `
.subscription-manager {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.subscription-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  border-bottom: 1px solid #e1e5e9;
  padding-bottom: 16px;
}

.close-button {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.close-button:hover {
  background-color: #f5f5f5;
}

.subscription-loading {
  text-align: center;
  padding: 40px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-banner {
  background-color: #fee;
  border: 1px solid #fcc;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.current-subscription, .available-plans {
  margin-bottom: 24px;
}

.subscription-card, .plan-card {
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.plan-card.featured {
  border-color: #007bff;
  position: relative;
}

.plan-card.featured::before {
  content: 'Most Popular';
  position: absolute;
  top: -10px;
  left: 20px;
  background: #007bff;
  color: white;
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-badge.active { background: #d4edda; color: #155724; }
.status-badge.trial { background: #fff3cd; color: #856404; }
.status-badge.expired { background: #f8d7da; color: #721c24; }
.status-badge.cancelled { background: #e2e3e5; color: #6c757d; }

.trial-badge {
  margin-left: 8px;
  padding: 4px 8px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  font-size: 12px;
}

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16px;
}

.plan-price .price {
  font-size: 24px;
  font-weight: bold;
  color: #007bff;
}

.plan-price .period {
  color: #6c757d;
  font-size: 14px;
}

.plan-features ul {
  list-style: none;
  padding: 0;
  margin: 16px 0;
}

.plan-features li {
  padding: 4px 0;
  color: #28a745;
}

.subscription-actions, .plan-actions {
  margin-top: 20px;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  font-weight: 500;
  cursor: pointer;
  margin-right: 8px;
  transition: background-color 0.2s;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #545b62;
}

.btn-primary:disabled, .btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.full-width {
  width: 100%;
  margin-right: 0;
}

.trial-note {
  text-align: center;
  color: #6c757d;
  font-size: 14px;
  margin-top: 8px;
}

.comparison {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 6px;
  margin-top: 12px;
}

.comparison-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.old-cost {
  color: #6c757d;
  text-decoration: line-through;
}

.new-cost {
  color: #28a745;
  font-weight: 500;
}

.total-savings {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #dee2e6;
  text-align: center;
  color: #007bff;
}

.access-warning {
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 6px;
  padding: 16px;
  text-align: center;
}
`;

// Inject styles (in a real app, these would be in CSS files)
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}