// src/hooks/useBackupLoading.ts
import { useState } from 'react';

// Hook for managing backup loading state (global or per-component)
export const useBackupLoading = () => {
  const [isLoading, setIsLoading] = useState(false);

  const executeBackup = async (backupFn: () => Promise<void>) => {
    if (isLoading) return; // Prevent duplicates

    setIsLoading(true);
    try {
      await backupFn();
    } catch (error) {
      console.error('Backup failed:', error);
      throw error; // Re-throw so calling code can handle it
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, executeBackup };
};