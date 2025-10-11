// PWA Install Prompt - Encourage users to install the app
import React, { useEffect, useState } from 'react';
import { pwaManager } from '../utils/pwaManager';

export const PWAInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Check if PWA is already installed
    if (pwaManager.isInstalled()) {
      return;
    }

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('navigator_pwa_prompt_dismissed');
    if (dismissed) {
      const dismissTime = parseInt(dismissed);
      const daysSinceDismiss = (Date.now() - dismissTime) / (1000 * 60 * 60 * 24);

      // Show again after 7 days
      if (daysSinceDismiss < 7) {
        return;
      }
    }

    // Show prompt when PWA becomes installable
    const handleInstallable = () => {
      setShowPrompt(true);
    };

    const handleInstalled = () => {
      setShowPrompt(false);
    };

    window.addEventListener('pwa-installable', handleInstallable);
    window.addEventListener('pwa-installed', handleInstalled);

    // Check if already installable
    if (pwaManager.isInstallable()) {
      setShowPrompt(true);
    }

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    setIsInstalling(true);

    const result = await pwaManager.showInstallPrompt();

    if (result === 'accepted') {
      setShowPrompt(false);
    } else if (result === 'dismissed') {
      // User dismissed, remember for a week
      localStorage.setItem('navigator_pwa_prompt_dismissed', Date.now().toString());
      setShowPrompt(false);
    }

    setIsInstalling(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('navigator_pwa_prompt_dismissed', Date.now().toString());
    setShowPrompt(false);
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      left: '1rem',
      right: '1rem',
      zIndex: 10000,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '1.25rem',
      borderRadius: '16px',
      boxShadow: '0 12px 40px rgba(102, 126, 234, 0.4)',
      animation: 'slideUp 0.4s ease-out',
      maxWidth: '500px',
      margin: '0 auto'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'start',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '2.5rem', flexShrink: 0 }}>📱</div>
        <div style={{ flex: 1 }}>
          <h3 style={{
            margin: '0 0 0.5rem 0',
            fontSize: '1.125rem',
            fontWeight: 700
          }}>
            Install Navigator App
          </h3>
          <p style={{
            margin: '0 0 1rem 0',
            fontSize: '0.875rem',
            opacity: 0.95,
            lineHeight: 1.5
          }}>
            Get faster access, work offline, and receive reminders. Install now for the best experience!
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleInstall}
              disabled={isInstalling}
              style={{
                flex: 1,
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#667eea',
                border: 'none',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: isInstalling ? 'wait' : 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isInstalling) {
                  (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              {isInstalling ? 'Installing...' : 'Install'}
            </button>
            <button
              onClick={handleDismiss}
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(100px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 640px) {
          div[style*="position: fixed"][style*="bottom: 1rem"] {
            left: 0.5rem !important;
            right: 0.5rem !important;
          }
        }
      `}</style>
    </div>
  );
};
