// src/hooks/useInactivityTimeout.ts
import { useEffect, useRef, useCallback } from 'react';
import { logger } from '../utils/logger';

// Session timeout options in milliseconds
export const SESSION_TIMEOUT_OPTIONS = {
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hr': 60 * 60 * 1000,
  '4hr': 4 * 60 * 60 * 1000,
  'never': null,
} as const;

export type SessionTimeoutOption = keyof typeof SESSION_TIMEOUT_OPTIONS;

const STORAGE_KEY = 'navigator_session_timeout';

/**
 * Get the stored session timeout preference
 */
export function getSessionTimeoutPreference(): SessionTimeoutOption {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in SESSION_TIMEOUT_OPTIONS) {
      return stored as SessionTimeoutOption;
    }
  } catch {
    // localStorage might not be available
  }
  return 'never'; // Default to never (current behavior)
}

/**
 * Set the session timeout preference
 */
export function setSessionTimeoutPreference(option: SessionTimeoutOption): void {
  try {
    localStorage.setItem(STORAGE_KEY, option);
  } catch {
    // localStorage might not be available
  }
}

/**
 * Custom hook to detect user inactivity and trigger logout
 *
 * Tracks mouse, keyboard, touch, and scroll events to detect activity.
 * When the user is inactive for longer than the configured timeout,
 * the onTimeout callback is triggered (typically to sign out).
 *
 * @param onTimeout - Callback to execute when timeout is reached
 * @param isAuthenticated - Whether the user is currently authenticated
 */
export function useInactivityTimeout(
  onTimeout: () => void,
  isAuthenticated: boolean
) {
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutOptionRef = useRef<SessionTimeoutOption>(getSessionTimeoutPreference());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update activity timestamp
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Check if timeout has been reached
  const checkTimeout = useCallback(() => {
    const option = timeoutOptionRef.current;
    const timeoutMs = SESSION_TIMEOUT_OPTIONS[option];

    // If 'never', don't check
    if (timeoutMs === null) {
      return;
    }

    const elapsed = Date.now() - lastActivityRef.current;
    if (elapsed >= timeoutMs) {
      logger.info(`Session timeout reached after ${option} of inactivity`);
      onTimeout();
    }
  }, [onTimeout]);

  // Refresh the timeout option (call this when settings change)
  const refreshTimeoutOption = useCallback(() => {
    timeoutOptionRef.current = getSessionTimeoutPreference();
  }, []);

  useEffect(() => {
    // Only track activity when user is authenticated
    if (!isAuthenticated) {
      return;
    }

    // Refresh the timeout option on mount
    refreshTimeoutOption();

    // Events to track for user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // Check timeout every 30 seconds
    checkIntervalRef.current = setInterval(checkTimeout, 30000);

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [isAuthenticated, resetTimer, checkTimeout, refreshTimeoutOption]);

  return { refreshTimeoutOption };
}
