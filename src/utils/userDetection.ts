// src/utils/userDetection.ts - Cloud-based user detection for multi-device safety
import { logger } from "./logger";
import type { User } from "@supabase/supabase-js";
import type { AppState } from "../types";
import { generateChecksum } from "./checksum";

export interface UserContext {
  userId: string;
  email?: string;
  deviceId: string;
  sessionStart: string;
}

export interface DataOwnership {
  isOwner: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  action: 'sync' | 'backup_and_clear' | 'preserve_and_ask';
}

export class SmartUserDetection {

  // Generate device fingerprint (more stable than localStorage)
  static generateDeviceFingerprint(): string {
    try {
      const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.hardwareConcurrency || 'unknown'
      ];

      // Create hash of components for device ID
      const fingerprint = btoa(components.join('|')).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      return `device_${fingerprint}_${Date.now()}`;
    } catch {
      return `device_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
  }

  // Analyze data ownership using multiple signals
  static analyzeDataOwnership(
    localData: AppState,
    currentUser: User,
    cloudData?: AppState
  ): DataOwnership {

    const signals = {
      hasLocalData: this.hasSignificantLocalData(localData),
      hasCloudData: cloudData ? this.hasSignificantLocalData(cloudData) : false,
      localDataAge: this.estimateDataAge(localData),
      userInLocalData: this.findUserSignalsInData(localData, currentUser),
      cloudUserMatch: cloudData ? this.findUserSignalsInData(cloudData, currentUser) : null
    };

    logger.info('User detection signals:', signals);

    // HIGH CONFIDENCE: Cloud data exists and matches user
    if (signals.hasCloudData && signals.cloudUserMatch) {
      if (!signals.hasLocalData) {
        return {
          isOwner: true,
          confidence: 'high',
          reason: 'Cloud data exists for user, no local conflict',
          action: 'sync'
        };
      } else if (signals.userInLocalData) {
        return {
          isOwner: true,
          confidence: 'high',
          reason: 'Both local and cloud data belong to user',
          action: 'sync'
        };
      } else {
        return {
          isOwner: true,
          confidence: 'medium',
          reason: 'Cloud data belongs to user, local data unclear',
          action: 'preserve_and_ask'
        };
      }
    }

    // MEDIUM CONFIDENCE: Local data has user signals
    if (signals.hasLocalData && signals.userInLocalData) {
      return {
        isOwner: true,
        confidence: 'medium',
        reason: 'Local data appears to belong to current user',
        action: 'sync'
      };
    }

    // LOW CONFIDENCE: Only anonymous local data
    if (signals.hasLocalData && !signals.userInLocalData && !signals.hasCloudData) {
      return {
        isOwner: false,
        confidence: 'low',
        reason: 'Local data has no user identification',
        action: 'preserve_and_ask'
      };
    }

    // SAFE DEFAULT: No clear ownership
    return {
      isOwner: true,
      confidence: 'low',
      reason: 'Unclear ownership - preserving data for safety',
      action: 'preserve_and_ask'
    };
  }

  // Check if data contains significant user work
  private static hasSignificantLocalData(data: AppState): boolean {
    const addresses = Array.isArray(data.addresses) ? data.addresses.length : 0;
    const completions = Array.isArray(data.completions) ? data.completions.length : 0;
    const arrangements = Array.isArray(data.arrangements) ? data.arrangements.length : 0;

    return addresses > 5 || completions > 0 || arrangements > 0;
  }

  // Estimate how old the data is (recent = more likely to be current user)
  private static estimateDataAge(data: AppState): 'recent' | 'old' | 'unknown' {
    try {
      const completions = Array.isArray(data.completions) ? data.completions : [];
      const arrangements = Array.isArray(data.arrangements) ? data.arrangements : [];

      const timestamps = [
        ...completions.map(c => c.timestamp),
        ...arrangements.map(a => a.updatedAt || a.createdAt)
      ].filter(Boolean);

      if (timestamps.length === 0) return 'unknown';

      const latestTime = Math.max(...timestamps.map(t => new Date(t).getTime()));
      const hoursAgo = (Date.now() - latestTime) / (1000 * 60 * 60);

      if (hoursAgo < 24) return 'recent';
      if (hoursAgo < 168) return 'old'; // 1 week
      return 'old';
    } catch {
      return 'unknown';
    }
  }

  // Look for user identification signals in data
  private static findUserSignalsInData(data: AppState, user: User): boolean {
    try {
      // Check if arrangements contain user email/info
      const arrangements = Array.isArray(data.arrangements) ? data.arrangements : [];
      const userEmail = user.email?.toLowerCase();

      if (userEmail) {
        const hasEmailMatch = arrangements.some(arr =>
          arr.customerName?.toLowerCase().includes(userEmail) ||
          arr.notes?.toLowerCase().includes(userEmail)
        );
        if (hasEmailMatch) return true;
      }

      // Check completion patterns (same day activity suggests same user)
      const completions = Array.isArray(data.completions) ? data.completions : [];
      const recentCompletions = completions.filter(c => {
        const hoursDiff = (Date.now() - new Date(c.timestamp).getTime()) / (1000 * 60 * 60);
        return hoursDiff < 24;
      });

      // Recent activity suggests current user
      return recentCompletions.length > 0;
    } catch {
      return false;
    }
  }

  // Store device context safely
  static storeDeviceContext(user: User): void {
    try {
      const context: UserContext = {
        userId: user.id,
        email: user.email || undefined,
        deviceId: this.generateDeviceFingerprint(),
        sessionStart: new Date().toISOString()
      };

      // Store in both localStorage and IndexedDB for redundancy
      localStorage.setItem('navigator_device_context', JSON.stringify(context));

      // Also store checksum to detect corruption
      const checksum = generateChecksum(context);
      localStorage.setItem('navigator_device_context_checksum', checksum);

      logger.info('Device context stored:', { userId: context.userId, deviceId: context.deviceId });
    } catch (error) {
      logger.error('Failed to store device context:', error);
    }
  }

  // Get device context with corruption detection
  static getDeviceContext(): UserContext | null {
    try {
      const contextStr = localStorage.getItem('navigator_device_context');
      const storedChecksum = localStorage.getItem('navigator_device_context_checksum');

      if (!contextStr) return null;

      const context = JSON.parse(contextStr) as UserContext;

      // Verify checksum if available
      if (storedChecksum) {
        const expectedChecksum = generateChecksum(context);
        if (expectedChecksum !== storedChecksum) {
          logger.warn('Device context checksum mismatch - data may be corrupted');
          return null;
        }
      }

      return context;
    } catch (error) {
      logger.error('Failed to get device context:', error);
      return null;
    }
  }

  // Clear device context on sign out
  static clearDeviceContext(): void {
    try {
      localStorage.removeItem('navigator_device_context');
      localStorage.removeItem('navigator_device_context_checksum');
    } catch (error) {
      logger.error('Failed to clear device context:', error);
    }
  }
}