// src/components/PrivacyConsent.tsx
import React, { useState, useEffect } from 'react';

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
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 100000,
        backdropFilter: 'blur(4px)'
      }} />

      {/* Consent Banner */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'white',
        borderTop: '3px solid var(--primary, #667eea)',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
        zIndex: 100001,
        padding: '1.5rem',
        maxHeight: showDetails ? '80vh' : 'auto',
        overflowY: 'auto'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          {!showDetails ? (
            // Compact banner
            <>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1.5rem',
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <h3 style={{
                    margin: '0 0 0.75rem 0',
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    color: '#1a202c'
                  }}>
                    🔒 Privacy & Data Protection
                  </h3>
                  <p style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    lineHeight: '1.5',
                    color: '#4a5568'
                  }}>
                    We use cookies and cloud storage to sync your work data across devices.
                    We are a <strong>data processor</strong> - you remain the <strong>data controller</strong> for any customer data you process.
                  </p>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}>
                  <button
                    onClick={() => setShowDetails(true)}
                    style={{
                      padding: '0.625rem 1.25rem',
                      background: 'transparent',
                      border: '1px solid #cbd5e0',
                      borderRadius: '6px',
                      color: '#4a5568',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f7fafc';
                      e.currentTarget.style.borderColor = '#a0aec0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = '#cbd5e0';
                    }}
                  >
                    Learn More
                  </button>

                  <button
                    onClick={handleDecline}
                    style={{
                      padding: '0.625rem 1.25rem',
                      background: '#e2e8f0',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#2d3748',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#cbd5e0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#e2e8f0';
                    }}
                  >
                    Decline
                  </button>

                  <button
                    onClick={handleAccept}
                    style={{
                      padding: '0.625rem 1.5rem',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(102, 126, 234, 0.3)';
                    }}
                  >
                    Accept & Continue
                  </button>
                </div>
              </div>

              <div style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e2e8f0',
                fontSize: '0.75rem',
                color: '#718096'
              }}>
                By clicking "Accept", you agree to our{' '}
                <a href="/PRIVACY.md" target="_blank" style={{ color: '#667eea', textDecoration: 'underline' }}>
                  Privacy Policy
                </a>
                {' '}and{' '}
                <a href="/TERMS_OF_USE.md" target="_blank" style={{ color: '#667eea', textDecoration: 'underline' }}>
                  Terms of Use
                </a>
                . This app is for professional enforcement use only.
              </div>
            </>
          ) : (
            // Detailed view
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem'
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: '#1a202c'
                }}>
                  Privacy & Cookie Policy
                </h3>
                <button
                  onClick={() => setShowDetails(false)}
                  style={{
                    padding: '0.5rem',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '1.5rem',
                    color: '#718096',
                    cursor: 'pointer',
                    lineHeight: 1
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{
                background: '#f7fafc',
                padding: '1.25rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: '1px solid #e2e8f0'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#2d3748' }}>
                  What We Collect
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.875rem', color: '#4a5568', lineHeight: '1.6' }}>
                  <li>Your email address (for authentication)</li>
                  <li>Work data you enter (addresses, completions, arrangements)</li>
                  <li>Device identifiers (for multi-device sync)</li>
                  <li>Technical data (login times, browser info)</li>
                </ul>
              </div>

              <div style={{
                background: '#f7fafc',
                padding: '1.25rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: '1px solid #e2e8f0'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#2d3748' }}>
                  How We Use It
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.875rem', color: '#4a5568', lineHeight: '1.6' }}>
                  <li>Authenticate your account</li>
                  <li>Sync data across your devices</li>
                  <li>Provide route planning and geocoding</li>
                  <li>Enable backup and restore</li>
                </ul>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.875rem', color: '#718096', fontStyle: 'italic' }}>
                  We do NOT analyze, share, or sell your data.
                </p>
              </div>

              <div style={{
                background: '#fff5f5',
                padding: '1.25rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: '1px solid #feb2b2'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#c53030' }}>
                  ⚠️ Your GDPR Responsibilities
                </h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#742a2a', lineHeight: '1.6' }}>
                  <strong>YOU are the Data Controller</strong> for customer/debtor data you process.
                  You must have lawful authority and comply with GDPR/UK DPA 2018.
                  We are only the Data Processor providing infrastructure.
                </p>
              </div>

              <div style={{
                background: '#f0fff4',
                padding: '1.25rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: '1px solid #9ae6b4'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#22543d' }}>
                  ✅ Your Rights
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.875rem', color: '#276749', lineHeight: '1.6' }}>
                  <li><strong>Access:</strong> Export all data (Settings → Export Data)</li>
                  <li><strong>Delete:</strong> Remove account permanently (Settings → Delete Account)</li>
                  <li><strong>Rectify:</strong> Edit any data directly in the app</li>
                  <li><strong>Portability:</strong> Download in JSON/CSV format</li>
                </ul>
              </div>

              <div style={{
                display: 'flex',
                gap: '1rem',
                marginTop: '1.5rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid #e2e8f0'
              }}>
                <button
                  onClick={handleDecline}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: '#e2e8f0',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#2d3748',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Decline (Offline Mode)
                </button>
                <button
                  onClick={handleAccept}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
                  }}
                >
                  Accept & Continue
                </button>
              </div>

              <p style={{
                margin: '1rem 0 0 0',
                fontSize: '0.75rem',
                color: '#718096',
                textAlign: 'center'
              }}>
                Read full{' '}
                <a href="/PRIVACY.md" target="_blank" style={{ color: '#667eea', textDecoration: 'underline' }}>
                  Privacy Policy
                </a>
                {' '}and{' '}
                <a href="/TERMS_OF_USE.md" target="_blank" style={{ color: '#667eea', textDecoration: 'underline' }}>
                  Terms of Use
                </a>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .privacy-consent-banner {
            padding: 1rem !important;
          }
        }
      `}</style>
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
