// src/hooks/useBackupLoading.ts
import { useState, useRef } from 'react';

import { logger } from '../utils/logger';

// Hook for managing backup loading state with timeout and cancellation
export const useBackupLoading = () => {
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const executeBackup = async (backupFn: () => Promise<void>) => {
    if (isLoading) {
      logger.warn('Backup already in progress, ignoring duplicate request');
      return;
    }

    setIsLoading(true);

    // CRITICAL FIX: Add safety timeout to prevent permanent button disable
    timeoutRef.current = setTimeout(() => {
      logger.error('Backup timeout reached - forcing reset');
      setIsLoading(false);
    }, 60000); // 60 second maximum backup time

    try {
      await backupFn();
      logger.info('Backup completed successfully');
    } catch (error) {
      logger.error('Backup failed:', error);
      throw error; // Re-throw so calling code can handle it
    } finally {
      // Clear timeout and reset loading state
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsLoading(false);
    }
  };

  // Emergency reset function for stuck states
  const forceReset = () => {
    logger.warn('Force resetting backup loading state');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsLoading(false);
  };

  return { isLoading, executeBackup, forceReset };
};