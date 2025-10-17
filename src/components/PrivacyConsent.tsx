// src/components/PrivacyConsent.tsx
import React, { useState, useEffect } from 'react';
import './modal.css';

const CONSENT_KEY = 'navigator_privacy_consent';
const CONSENT_VERSION = 'v1.0_2025-01-06';

interface PrivacyConsentProps {
  onAccept?: () => void;
}

export const PrivacyConsent: React.FC<PrivacyConsentProps> = ({ onAccept }) => {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Check if user has already consented to this version
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent || consent !== CONSENT_VERSION) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, CONSENT_VERSION);
    setShowBanner(false);
    if (onAccept) onAccept();
  };

  const handleDecline = () => {
    // If they decline, show message about offline mode
    if (window.confirm(
      'You can still use Navigator Web in offline mode (no cloud sync).\n\n' +
      'To use cloud sync and multi-device features, you must accept our privacy policy.\n\n' +
      'Click OK to use offline mode, or Cancel to review the privacy policy.'
    )) {
      // Use offline mode - still need to accept basic cookie usage
      localStorage.setItem(CONSENT_KEY, 'offline_mode');
      setShowBanner(false);
    }
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Overlay */}
      <div className="privacy-consent-backdrop" />

      {/* Consent Banner */}
      <div className={`privacy-consent-banner ${showDetails ? 'expanded' : ''}`}>
        <div className="privacy-consent-content">
          {!showDetails ? (
            // Compact banner
            <>
              <div className="privacy-banner-compact">
                <div className="privacy-banner-text">
                  <h3>🔒 Privacy & Data Protection</h3>
                  <p>
                    We use cookies and cloud storage to sync your work data across devices.
                    We are a <strong>data processor</strong> - you remain the <strong>data controller</strong> for any customer data you process.
                  </p>
                </div>

                <div className="privacy-banner-actions">
                  <button
                    onClick={() => setShowDetails(true)}
                    className="btn btn-ghost btn-sm"
                  >
                    Learn More
                  </button>

                  <button
                    onClick={handleDecline}
                    className="btn btn-secondary btn-sm"
                  >
                    Decline
                  </button>

                  <button
                    onClick={handleAccept}
                    className="btn btn-primary btn-sm"
                  >
                    Accept & Continue
                  </button>
                </div>
              </div>

              <div className="privacy-banner-footer">
                By clicking "Accept", you agree to our{' '}
                <a href="/PRIVACY.md" target="_blank">Privacy Policy</a>
                {' '}and{' '}
                <a href="/TERMS_OF_USE.md" target="_blank">Terms of Use</a>
                . This app is for professional enforcement use only.
              </div>
            </>
          ) : (
            // Detailed view
            <div>
              <div className="privacy-details-header">
                <h3>Privacy & Cookie Policy</h3>
                <button
                  onClick={() => setShowDetails(false)}
                  className="btn btn-ghost"
                >
                  ✕
                </button>
              </div>

              <div className="info-box">
                <h4>What We Collect</h4>
                <ul>
                  <li>Your email address (for authentication)</li>
                  <li>Work data you enter (addresses, completions, arrangements)</li>
                  <li>Device identifiers (for multi-device sync)</li>
                  <li>Technical data (login times, browser info)</li>
                </ul>
              </div>

              <div className="info-box">
                <h4>How We Use It</h4>
                <ul>
                  <li>Authenticate your account</li>
                  <li>Sync data across your devices</li>
                  <li>Provide route planning and geocoding</li>
                  <li>Enable backup and restore</li>
                </ul>
                <p style={{ marginTop: '0.75rem', fontStyle: 'italic' }}>
                  We do NOT analyze, share, or sell your data.
                </p>
              </div>

              <div className="info-box info-box-error">
                <h4>⚠️ Your GDPR Responsibilities</h4>
                <p>
                  <strong>YOU are the Data Controller</strong> for customer/debtor data you process.
                  You must have lawful authority and comply with GDPR/UK DPA 2018.
                  We are only the Data Processor providing infrastructure.
                </p>
              </div>

              <div className="info-box info-box-success">
                <h4>✅ Your Rights</h4>
                <ul>
                  <li><strong>Access:</strong> Export all data (Settings → Export Data)</li>
                  <li><strong>Delete:</strong> Remove account permanently (Settings → Delete Account)</li>
                  <li><strong>Rectify:</strong> Edit any data directly in the app</li>
                  <li><strong>Portability:</strong> Download in JSON/CSV format</li>
                </ul>
              </div>

              <div className="privacy-details-actions">
                <button
                  onClick={handleDecline}
                  className="btn btn-secondary"
                >
                  Decline (Offline Mode)
                </button>
                <button
                  onClick={handleAccept}
                  className="btn btn-primary"
                >
                  Accept & Continue
                </button>
              </div>

              <p className="privacy-details-footer">
                Read full{' '}
                <a href="/PRIVACY.md" target="_blank">Privacy Policy</a>
                {' '}and{' '}
                <a href="/TERMS_OF_USE.md" target="_blank">Terms of Use</a>
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// Helper to check if user has consented
export function hasPrivacyConsent(): boolean {
  const consent = localStorage.getItem(CONSENT_KEY);
  return consent === CONSENT_VERSION || consent === 'offline_mode';
}

// Helper to reset consent (for testing or policy updates)
export function resetPrivacyConsent(): void {
  localStorage.removeItem(CONSENT_KEY);
}
