// src/useCloudSync.ts
import * as React from "react";
import type { AppState } from "./types";

// Simple cloud sync interface - can be implemented with Firebase, Supabase, or custom backend
interface CloudSyncProvider {
  signIn: (email: string, password: string) => Promise<{ user: { id: string; email: string } }>;
  signUp: (email: string, password: string) => Promise<{ user: { id: string; email: string } }>;
  signOut: () => Promise<void>;
  syncData: (data: AppState) => Promise<void>;
  subscribeToData: (callback: (data: AppState) => void) => () => void;
  getCurrentUser: () => { id: string; email: string } | null;
}

// Mock implementation - replace with actual Firebase/Supabase
class MockCloudSync implements CloudSyncProvider {
  private user: { id: string; email: string } | null = null;
  private data: AppState | null = null;
  private callbacks: Set<(data: AppState) => void> = new Set();

  async signIn(email: string, password: string) {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    
    this.user = { id: `user_${email.replace('@', '_')}`, email };
    
    // Load user's data from localStorage as fallback
    const savedData = localStorage.getItem(`cloud_data_${this.user.id}`);
    if (savedData) {
      this.data = JSON.parse(savedData);
      this.callbacks.forEach(cb => cb(this.data!));
    }
    
    return { user: this.user };
  }

  async signUp(email: string, password: string) {
    return this.signIn(email, password); // Same for mock
  }

  async signOut() {
    this.user = null;
    this.data = null;
  }

  async syncData(data: AppState) {
    if (!this.user) throw new Error("Not signed in");
    
    this.data = data;
    // Save to localStorage as mock cloud storage
    localStorage.setItem(`cloud_data_${this.user.id}`, JSON.stringify(data));
    
    // Notify other tabs/windows
    window.localStorage.setItem('sync_trigger', Date.now().toString());
  }

  subscribeToData(callback: (data: AppState) => void) {
    this.callbacks.add(callback);
    
    // Listen for changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sync_trigger' && this.user && this.data) {
        callback(this.data);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      this.callbacks.delete(callback);
      window.removeEventListener('storage', handleStorageChange);
    };
  }

  getCurrentUser() {
    return this.user;
  }
}

const cloudSync = new MockCloudSync();

export function useCloudSync() {
  const [user, setUser] = React.useState<{ id: string; email: string } | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  // Check online status
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check if user is already signed in
  React.useEffect(() => {
    const currentUser = cloudSync.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await cloudSync.signIn(email, password);
      setUser(result.user);
      return result;
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await cloudSync.signUp(email, password);
      setUser(result.user);
      return result;
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      await cloudSync.signOut();
      setUser(null);
    } catch (err: any) {
      setError(err.message || 'Sign out failed');
    } finally {
      setIsLoading(false);
    }
  };

  const syncData = async (data: AppState) => {
    if (!isOnline) {
      console.warn('Offline - data will sync when connection is restored');
      return;
    }
    
    try {
      await cloudSync.syncData(data);
    } catch (err: any) {
      setError(err.message || 'Sync failed');
      throw err;
    }
  };

  const subscribeToData = React.useCallback((callback: (data: AppState) => void) => {
    return cloudSync.subscribeToData(callback);
  }, []);

  return {
    user,
    isLoading,
    error,
    isOnline,
    signIn,
    signUp,
    signOut,
    syncData,
    subscribeToData,
    clearError: () => setError(null)
  };
}
