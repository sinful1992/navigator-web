// src/contexts/IdentityCacheContext.tsx
// Identity caching for admin/subscription status checks
// Purpose: Cache RPC results for 5 minutes to reduce database calls

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { logger } from '../utils/logger';

interface IdentityCacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface IdentityCache {
  [key: string]: IdentityCacheEntry<any>;
}

interface IdentityCacheContextValue {
  getCache: <T>(key: string) => T | null;
  setCache: (key: string, value: any, ttlMs: number) => void;
  clearCache: () => void;
  clearKey: (key: string) => void;
}

const IdentityCacheContext = createContext<IdentityCacheContextValue | null>(null);

export function IdentityCacheProvider({ children, userId }: { children: ReactNode; userId?: string | null }) {
  const [cache, setCacheState] = useState<IdentityCache>({});

  // Clear cache when user changes
  useEffect(() => {
    logger.info('🔄 Identity cache cleared (user changed)', { userId });
    setCacheState({});
  }, [userId]);

  const getCache = useCallback(<T,>(key: string): T | null => {
    const entry = cache[key];
    if (!entry) {
      logger.debug(`📦 Cache MISS: ${key}`);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      logger.debug(`⏰ Cache EXPIRED: ${key}`);
      // Remove expired entry
      setCacheState(prev => {
        const { [key]: removed, ...rest } = prev;
        return rest;
      });
      return null;
    }

    logger.debug(`✅ Cache HIT: ${key}`);
    return entry.data as T;
  }, [cache]);

  const setCache = useCallback((key: string, value: any, ttlMs: number) => {
    logger.debug(`💾 Cache SET: ${key} (TTL: ${ttlMs}ms)`);
    setCacheState(prev => ({
      ...prev,
      [key]: {
        data: value,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttlMs,
      },
    }));
  }, []);

  const clearCache = useCallback(() => {
    logger.info('🗑️ Identity cache cleared (manual)');
    setCacheState({});
  }, []);

  const clearKey = useCallback((key: string) => {
    logger.debug(`🗑️ Cache key cleared: ${key}`);
    setCacheState(prev => {
      const { [key]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  return (
    <IdentityCacheContext.Provider value={{ getCache, setCache, clearCache, clearKey }}>
      {children}
    </IdentityCacheContext.Provider>
  );
}

export function useIdentityCache() {
  const context = useContext(IdentityCacheContext);
  if (!context) {
    throw new Error('useIdentityCache must be used within IdentityCacheProvider');
  }
  return context;
}
