import React from "react";
import type { User } from "@supabase/supabase-js";
import { useSubscription } from "./useSubscription";

interface SubscriptionGuardProps {
  user: User | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface FeatureLockedProps {
  featureName: string;
  onUpgrade?: () => void;
}

// Component shown when user doesn't have access
function FeatureLocked({ featureName, onUpgrade }: FeatureLockedProps) {
  return (
    <div className="feature-locked">
      <div className="lock-icon">🔒</div>
      <h3>{featureName}</h3>
      <p>This premium feature requires an active subscription.</p>
      <button 
        className="upgrade-button"
        onClick={onUpgrade}
      >
        Upgrade to Enforcement Pro
      </button>
    </div>
  );
}

export function SubscriptionGuard({ user, fallback, children }: SubscriptionGuardProps) {
  const { hasAccess, isLoading } = useSubscription(user);

  // Show loading while checking subscription status
  if (isLoading) {
    return (
      <div className="subscription-loading">
        <div className="spinner-small"></div>
        <span>Checking access...</span>
      </div>
    );
  }

  // If user has access (including owner bypass), show the protected content
  if (hasAccess) {
    return <>{children}</>;
  }

  // If user doesn't have access, show fallback or default locked message
  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <FeatureLocked 
      featureName="Premium Feature"
      onUpgrade={() => {
        // This could open a subscription modal or redirect to pricing
        console.log('Upgrade clicked - implement subscription flow');
      }}
    />
  );
}

// Higher-order component version for easier wrapping
export function withSubscriptionGuard<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  featureName?: string
) {
  return function SubscriptionGuardedComponent(props: P & { user?: User | null }) {
    const { user, ...restProps } = props;
    
    return (
      <SubscriptionGuard 
        user={user || null}
        fallback={
          <FeatureLocked 
            featureName={featureName || "Premium Feature"}
            onUpgrade={() => {
              console.log('Upgrade clicked for', featureName);
            }}
          />
        }
      >
        <WrappedComponent {...(restProps as P)} />
      </SubscriptionGuard>
    );
  };
}

// Hook for checking subscription status in components
export function useSubscriptionGuard(user: User | null) {
  const subscription = useSubscription(user);
  
  const requiresSubscription = (featureName?: string) => {
    if (!subscription.hasAccess) {
      console.warn(`Feature "${featureName || 'unknown'}" requires subscription (or owner access)`);
      return false;
    }
    return true;
  };

  return {
    ...subscription,
    requiresSubscription,
  };
}