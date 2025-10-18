// src/hooks/usePWAInit.ts
import { useState, useEffect } from 'react';
import { pwaManager } from '../utils/pwaManager';
import { logger } from '../utils/logger';

/**
 * Custom hook to initialize PWA functionality
 *
 * Requests persistent storage permission on mount.
 * This prevents the browser from evicting cached data.
 *
 * @returns Initialization state
 */
export function usePWAInit() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initPWA = async () => {
      try {
        await pwaManager.requestPersistentStorage();
        logger.info('PWA initialized successfully');
        setIsInitialized(true);
      } catch (error) {
        logger.error('PWA initialization failed:', error);
        // Still mark as initialized to prevent blocking
        setIsInitialized(true);
      }
    };

    initPWA();
  }, []); // Run only once on mount

  return { isInitialized };
}
