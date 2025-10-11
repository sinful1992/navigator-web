// PWA Manager - Handle install prompts, persistent storage, and SW communication
import { logger } from './logger';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

class PWAManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    // Request persistent storage to prevent data eviction
    await this.requestPersistentStorage();

    // Listen for install prompt event
    this.setupInstallPrompt();

    // Register service worker updates
    this.setupServiceWorkerUpdates();

    // Listen for service worker messages
    this.setupServiceWorkerMessages();
  }

  /**
   * Request persistent storage to prevent browser from evicting data
   */
  async requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage || !navigator.storage.persist) {
      logger.warn('Persistent storage not supported');
      return false;
    }

    try {
      // Check if already persisted
      const isPersisted = await navigator.storage.persisted();

      if (isPersisted) {
        logger.info('✅ Storage is already persistent');
        return true;
      }

      // Request persistence
      const granted = await navigator.storage.persist();

      if (granted) {
        logger.info('✅ Persistent storage granted');
        localStorage.setItem('navigator_persistent_storage', 'true');
        return true;
      } else {
        logger.warn('⚠️ Persistent storage denied - data may be evicted under storage pressure');
        return false;
      }
    } catch (error) {
      logger.error('Failed to request persistent storage:', error);
      return false;
    }
  }

  /**
   * Get storage quota information
   */
  async getStorageQuota(): Promise<{ usage: number; quota: number; percentage: number } | null> {
    if (!navigator.storage || !navigator.storage.estimate) {
      return null;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? Math.round((usage / quota) * 100) : 0;

      return {
        usage,
        quota,
        percentage
      };
    } catch (error) {
      logger.error('Failed to get storage quota:', error);
      return null;
    }
  }

  /**
   * Setup install prompt handler
   */
  private setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();

      // Store the event so it can be triggered later
      this.deferredPrompt = e as BeforeInstallPromptEvent;

      logger.info('📲 PWA install prompt available');

      // Dispatch custom event so UI can show install button
      window.dispatchEvent(new CustomEvent('pwa-installable'));

      // Mark as installable in localStorage
      localStorage.setItem('navigator_pwa_installable', 'true');
    });

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      logger.info('✅ PWA installed successfully');
      this.deferredPrompt = null;
      localStorage.setItem('navigator_pwa_installed', 'true');
      localStorage.removeItem('navigator_pwa_installable');

      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    });
  }

  /**
   * Trigger install prompt
   */
  async showInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPrompt) {
      logger.warn('Install prompt not available');
      return 'unavailable';
    }

    try {
      // Show the install prompt
      await this.deferredPrompt.prompt();

      // Wait for the user's response
      const choiceResult = await this.deferredPrompt.userChoice;

      logger.info('User install choice:', choiceResult.outcome);

      // Clear the deferred prompt
      this.deferredPrompt = null;

      return choiceResult.outcome;
    } catch (error) {
      logger.error('Install prompt failed:', error);
      return 'dismissed';
    }
  }

  /**
   * Check if PWA is installable
   */
  isInstallable(): boolean {
    return this.deferredPrompt !== null;
  }

  /**
   * Check if PWA is already installed
   */
  isInstalled(): boolean {
    // Check if running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }

    // Check if previously installed
    if (localStorage.getItem('navigator_pwa_installed') === 'true') {
      return true;
    }

    // iOS Safari check
    if ((navigator as any).standalone === true) {
      return true;
    }

    return false;
  }

  /**
   * Setup service worker update handling
   */
  private async setupServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    try {
      // Wait for registration
      const registration = await navigator.serviceWorker.ready;
      this.serviceWorkerRegistration = registration;

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;

        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            logger.info('🔄 New service worker available');

            // Dispatch custom event so UI can show update prompt
            window.dispatchEvent(new CustomEvent('pwa-update-available'));
          }
        });
      });

      logger.info('✅ Service worker updates configured');
    } catch (error) {
      logger.error('Failed to setup service worker updates:', error);
    }
  }

  /**
   * Skip waiting and reload to activate new service worker
   */
  async updateServiceWorker() {
    if (!this.serviceWorkerRegistration) {
      return;
    }

    const newWorker = this.serviceWorkerRegistration.waiting;

    if (!newWorker) {
      return;
    }

    // Tell the service worker to skip waiting
    newWorker.postMessage({ type: 'SKIP_WAITING' });

    // Reload the page to activate new service worker
    window.location.reload();
  }

  /**
   * Listen for service worker messages
   */
  private setupServiceWorkerMessages() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.addEventListener('message', (event) => {
      logger.info('[PWA] Message from service worker:', event.data);

      if (event.data.type === 'BACKGROUND_SYNC_START') {
        window.dispatchEvent(new CustomEvent('background-sync-start', {
          detail: event.data
        }));
      } else if (event.data.type === 'BACKGROUND_SYNC_COMPLETE') {
        window.dispatchEvent(new CustomEvent('background-sync-complete', {
          detail: event.data
        }));
      }
    });
  }

  /**
   * Register background sync for when connection returns
   */
  async registerBackgroundSync(tag: string = 'sync-data'): Promise<boolean> {
    if (!this.serviceWorkerRegistration) {
      logger.warn('Service worker not registered');
      return false;
    }

    if (!('sync' in this.serviceWorkerRegistration)) {
      logger.warn('Background sync not supported');
      return false;
    }

    try {
      await (this.serviceWorkerRegistration as any).sync.register(tag);
      logger.info('✅ Background sync registered:', tag);
      return true;
    } catch (error) {
      logger.error('Background sync registration failed:', error);
      return false;
    }
  }

  /**
   * Pre-cache URLs (e.g., map tiles for offline use)
   */
  async preCacheUrls(urls: string[]): Promise<{ success: boolean; count?: number; error?: string }> {
    if (!this.serviceWorkerRegistration || !this.serviceWorkerRegistration.active) {
      return { success: false, error: 'Service worker not active' };
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      this.serviceWorkerRegistration!.active!.postMessage(
        { type: 'CACHE_URLS', urls },
        [messageChannel.port2]
      );
    });
  }

  /**
   * Clear service worker caches
   */
  async clearCaches(cacheName?: string): Promise<boolean> {
    if (!this.serviceWorkerRegistration || !this.serviceWorkerRegistration.active) {
      return false;
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        resolve(event.data.success);
      };

      this.serviceWorkerRegistration!.active!.postMessage(
        { type: 'CLEAR_CACHE', cacheName },
        [messageChannel.port2]
      );
    });
  }

  /**
   * Check if online with connectivity test
   */
  async checkConnectivity(): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }

    try {
      // Try to fetch a small resource to verify actual connectivity
      const response = await fetch('/navigator-web/manifest.webmanifest', {
        method: 'HEAD',
        cache: 'no-cache'
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const pwaManager = new PWAManager();
