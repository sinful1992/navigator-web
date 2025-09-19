import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";
import { logger } from "./utils/logger";
import type { UserSubscription, SubscriptionPlan, SubscriptionStatus } from "./types";

type UseSubscription = {
  subscription: UserSubscription | null;
  availablePlans: SubscriptionPlan[];
  isLoading: boolean;
  error: string | null;
  
  // Status checks
  isActive: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number;
  hasAccess: boolean;
  
  // Actions
  startTrial: () => Promise<void>;
  subscribe: (planId: string) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  clearError: () => void;
};

// Default subscription plans
const DEFAULT_PLANS: SubscriptionPlan[] = [
  {
    id: "enforcement_pro",
    name: "Enforcement Pro",
    price: 2500, // £25.00 in pence
    currency: "GBP",
    features: [
      "Route optimization for 30+ addresses",
      "Commission tracking & reporting",
      "Payment arrangements with SMS reminders",
      "Daily/weekly earnings reports",
      "Unlimited cloud sync & backup",
      "Priority customer support"
    ],
    trialDays: 14
  }
];

// Helper functions
function calculateDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function isSubscriptionActive(subscription: UserSubscription | null): boolean {
  if (!subscription) return false;
  
  const now = new Date();
  const end = new Date(subscription.currentPeriodEnd);
  
  return (subscription.status === "active" || subscription.status === "trial") && 
         end > now;
}

function isSubscriptionTrial(subscription: UserSubscription | null): boolean {
  if (!subscription) return false;
  return subscription.status === "trial";
}

function isSubscriptionExpired(subscription: UserSubscription | null): boolean {
  if (!subscription) return true;
  
  const now = new Date();
  const end = new Date(subscription.currentPeriodEnd);
  
  return subscription.status === "expired" || 
         subscription.status === "cancelled" || 
         end <= now;
}

export function useSubscription(user: User | null): UseSubscription {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [availablePlans] = useState<SubscriptionPlan[]>(DEFAULT_PLANS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);

  const clearError = useCallback(() => setError(null), []);

  // Check if user is owner/admin for bypass privileges
  useEffect(() => {
    const checkOwnerStatus = async () => {
      if (!user || !supabase) {
        setIsOwner(false);
        return;
      }

      try {
        const { data: ownerCheck } = await supabase
          .rpc('is_owner', { user_uuid: user.id });
        
        setIsOwner(ownerCheck || false);
      } catch (err) {
        // If function doesn't exist or fails, assume not owner
        setIsOwner(false);
      }
    };

    checkOwnerStatus();
  }, [user]);

  // Derived state
  const isActive = isSubscriptionActive(subscription);
  const isTrial = isSubscriptionTrial(subscription);
  const isExpired = isSubscriptionExpired(subscription);
  const daysRemaining = subscription ? calculateDaysRemaining(subscription.currentPeriodEnd) : 0;
  
  // Access logic: Owner bypass OR active subscription OR unconfirmed trial user
  const hasAccess = isOwner || (isActive && !isExpired) || isUnconfirmedTrialUser();

  // Check if this is an unconfirmed trial user (has subscription but no session due to email confirmation)
  function isUnconfirmedTrialUser(): boolean {
    // If we have no user session but we know a trial subscription was just created
    // (this happens when email confirmation is required)
    const justCreatedTrial = localStorage.getItem('navigator_trial_created');
    const trialUserId = localStorage.getItem('navigator_trial_user_id');

    if (justCreatedTrial && trialUserId) {
      // Give 24 hours of trial access even without email confirmation
      const createdTime = parseInt(justCreatedTrial);
      const now = Date.now();
      const hoursSinceCreation = (now - createdTime) / (1000 * 60 * 60);

      return hoursSinceCreation < 24; // 24 hour grace period
    }

    return false;
  }

  // Debug access calculation
  console.log("Access check:", {
    isOwner,
    isActive,
    isExpired,
    hasAccess,
    subscription,
    user: user?.email
  });

  // Load subscription data from Supabase
  const refreshSubscription = useCallback(async () => {
    if (!user || !supabase) {
      console.log("No user or supabase in refreshSubscription");
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      clearError();

      console.log("Loading subscription for user:", user.id);
      const { data, error: fetchError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .maybeSingle();

      console.log("Subscription query result:", { data, error: fetchError });

      if (fetchError) {
        throw fetchError;
      }

      // Convert database format to our type
      const sub: UserSubscription | null = data ? {
        id: data.id,
        userId: data.user_id,
        planId: data.plan_id,
        status: data.status as SubscriptionStatus,
        currentPeriodStart: data.current_period_start,
        currentPeriodEnd: data.current_period_end,
        trialStart: data.trial_start || undefined,
        trialEnd: data.trial_end || undefined,
        cancelledAt: data.cancelled_at || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        lastPaymentAt: data.last_payment_at || undefined,
        nextPaymentDue: data.next_payment_due || undefined,
      } : null;

      setSubscription(sub);
      console.log("Subscription set:", sub);

    } catch (e: any) {
      logger.error('Failed to load subscription:', e);
      setError(e?.message || 'Failed to load subscription');
      setSubscription(null);
      console.log("Subscription error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user, clearError]);

  // Load subscription on mount and user change
  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  // Start free trial
  const startTrial = useCallback(async () => {
    if (!user || !supabase) {
      throw new Error('User not authenticated');
    }

    if (subscription) {
      throw new Error('User already has a subscription');
    }

    try {
      clearError();
      setIsLoading(true);

      const plan = availablePlans[0]; // Default to first plan
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + plan.trialDays);

      const subscriptionData = {
        user_id: user.id,
        plan_id: plan.id,
        status: 'trial' as SubscriptionStatus,
        current_period_start: now.toISOString(),
        current_period_end: trialEnd.toISOString(),
        trial_start: now.toISOString(),
        trial_end: trialEnd.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      const { error: insertError } = await supabase
        .from('user_subscriptions')
        .insert(subscriptionData);

      if (insertError) {
        throw insertError;
      }

      // Refresh subscription data
      await refreshSubscription();

      logger.info('Trial started successfully');

    } catch (e: any) {
      logger.error('Failed to start trial:', e);
      setError(e?.message || 'Failed to start trial');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [user, subscription, availablePlans, clearError, refreshSubscription]);

  // Subscribe to a plan (this would integrate with payment processor)
  const subscribe = useCallback(async (planId: string) => {
    if (!user || !supabase) {
      throw new Error('User not authenticated');
    }

    const plan = availablePlans.find(p => p.id === planId);
    if (!plan) {
      throw new Error('Invalid plan selected');
    }

    try {
      clearError();
      setIsLoading(true);

      // In a real implementation, this would:
      // 1. Create a payment session with Stripe/PayPal/etc
      // 2. Redirect user to payment page
      // 3. Handle webhook to confirm payment
      // 4. Update subscription status
      
      // For now, we'll simulate immediate activation
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1); // 1 month subscription

      const subscriptionData = subscription ? {
        // Update existing subscription
        status: 'active' as SubscriptionStatus,
        plan_id: planId,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        last_payment_at: now.toISOString(),
        next_payment_due: periodEnd.toISOString(),
        updated_at: now.toISOString(),
      } : {
        // Create new subscription
        user_id: user.id,
        plan_id: planId,
        status: 'active' as SubscriptionStatus,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        last_payment_at: now.toISOString(),
        next_payment_due: periodEnd.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      if (subscription) {
        // Update existing subscription
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update(subscriptionData)
          .eq('id', subscription.id);

        if (updateError) throw updateError;
      } else {
        // Create new subscription
        const { error: insertError } = await supabase
          .from('user_subscriptions')
          .insert(subscriptionData);

        if (insertError) throw insertError;
      }

      await refreshSubscription();
      logger.info('Subscription activated successfully');

    } catch (e: any) {
      logger.error('Failed to subscribe:', e);
      setError(e?.message || 'Failed to subscribe');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [user, subscription, availablePlans, clearError, refreshSubscription]);

  // Cancel subscription
  const cancelSubscription = useCallback(async () => {
    if (!user || !supabase || !subscription) {
      throw new Error('No active subscription to cancel');
    }

    try {
      clearError();
      setIsLoading(true);

      const now = new Date();
      const updateData = {
        status: 'cancelled' as SubscriptionStatus,
        cancelled_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update(updateData)
        .eq('id', subscription.id);

      if (updateError) throw updateError;

      await refreshSubscription();
      logger.info('Subscription cancelled successfully');

    } catch (e: any) {
      logger.error('Failed to cancel subscription:', e);
      setError(e?.message || 'Failed to cancel subscription');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [user, subscription, clearError, refreshSubscription]);

  return {
    subscription,
    availablePlans,
    isLoading,
    error,
    
    // Status checks
    isActive,
    isTrial,
    isExpired,
    daysRemaining,
    hasAccess,
    
    // Actions
    startTrial,
    subscribe,
    cancelSubscription,
    refreshSubscription,
    clearError,
  };
}