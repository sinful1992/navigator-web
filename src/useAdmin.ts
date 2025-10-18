import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';

import { logger } from './utils/logger';

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'support';
  permissions: string[];
  created_at: string;
  is_active: boolean;
}

interface UseAdmin {
  isAdmin: boolean;
  isOwner: boolean;
  adminUser: AdminUser | null;
  isLoading: boolean;
  error: string | null;
  refreshAdmin: () => Promise<void>;
  clearError: () => void;
}

export function useAdmin(user: User | null): UseAdmin {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refreshAdmin = useCallback(async () => {
    if (!user || !supabase) {
      setIsAdmin(false);
      setIsOwner(false);
      setAdminUser(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      clearError();

      // Check if user is admin
      const { data: adminCheck, error: adminCheckError } = await supabase
        .rpc('is_admin', { user_uuid: user.id });

      if (adminCheckError) {
        // If function doesn't exist or user isn't admin, that's not an error
        setIsAdmin(false);
        setIsOwner(false);
        setAdminUser(null);
        setIsLoading(false);
        return;
      }

      setIsAdmin(adminCheck || false);

      if (adminCheck) {
        // Check if user is owner
        const { data: ownerCheck, error: ownerCheckError } = await supabase
          .rpc('is_owner', { user_uuid: user.id });

        if (ownerCheckError) {
          logger.warn('Failed to check owner status:', ownerCheckError);
        } else {
          setIsOwner(ownerCheck || false);
        }

        // Get admin user details
        const { data: adminData, error: adminError } = await supabase
          .from('admin_users')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (adminError) {
          logger.warn('Failed to fetch admin user details:', adminError);
        } else {
          setAdminUser(adminData);
        }
      } else {
        setIsOwner(false);
        setAdminUser(null);
      }

    } catch (e: any) {
      // Don't set error for permission issues - just not admin
      logger.info('Admin check failed:', e.message);
      setIsAdmin(false);
      setIsOwner(false);
      setAdminUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, clearError]);

  useEffect(() => {
    refreshAdmin();
  }, [refreshAdmin]);

  return {
    isAdmin,
    isOwner,
    adminUser,
    isLoading,
    error,
    refreshAdmin,
    clearError,
  };
}

// Helper function to check permissions
export function hasPermission(adminUser: AdminUser | null, permission: string): boolean {
  if (!adminUser || !adminUser.is_active) return false;
  
  // Owners have all permissions
  if (adminUser.role === 'owner') return true;
  
  // Check specific permissions
  return adminUser.permissions.includes(permission);
}

// Common permissions
export const PERMISSIONS = {
  MANAGE_SUBSCRIPTIONS: 'manage_subscriptions',
  MANAGE_ADMINS: 'manage_admins',
  VIEW_ANALYTICS: 'view_analytics',
  MANAGE_PLANS: 'manage_plans',
  EXTEND_TRIALS: 'extend_trials',
  CANCEL_SUBSCRIPTIONS: 'cancel_subscriptions',
} as const;