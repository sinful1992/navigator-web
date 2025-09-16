import React from 'react';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

interface SupabaseSetupProps {
  onSetupComplete: (url: string, key: string) => void;
  onSkip: () => void;
  isOpen: boolean;
}

export function SupabaseSetup({ onSetupComplete, onSkip, isOpen }: SupabaseSetupProps) {
  const [url, setUrl] = React.useState('');
  const [key, setKey] = React.useState('');
  const [isTestingConnection, setIsTestingConnection] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = React.useState('');

  if (!isOpen) return null;

  const testConnection = async () => {
    if (!url || !key) {
      setErrorMessage('Please enter both URL and key');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setErrorMessage('');

    try {
      // Validate URL format
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes('supabase')) {
        throw new Error('URL should be a Supabase project URL (e.g., https://your-project.supabase.co)');
      }

      // Test connection
      const testClient = createClient(url, key);
      const { data, error } = await testClient.auth.getSession();

      if (error && error.message !== 'Auth session missing!') {
        throw error;
      }

      setConnectionStatus('success');
      logger.info('Supabase connection test successful');
    } catch (error: any) {
      setConnectionStatus('error');
      setErrorMessage(error.message || 'Connection failed');
      logger.error('Supabase connection test failed:', error);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = () => {
    if (connectionStatus === 'success') {
      onSetupComplete(url, key);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>📁 Optional: Connect Your Own Cloud Storage</h2>
          <p style={{ margin: '0.5rem 0 0', opacity: 0.8, fontSize: '0.9rem' }}>
            Set up your own Supabase project for cloud backup and sync (completely optional)
          </p>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--blue-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--blue-200)' }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--blue-700)' }}>📋 Quick Setup Instructions</h4>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--blue-600)', fontSize: '0.9rem' }}>
              <li>Go to <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> and create a free account</li>
              <li>Create a new project (choose any name/region)</li>
              <li>Go to Settings → API in your project dashboard</li>
              <li>Copy your Project URL and anon/public key below</li>
            </ol>
          </div>

          <div className="form-group">
            <label htmlFor="supabase-url">Project URL *</label>
            <input
              id="supabase-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project-id.supabase.co"
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="supabase-key">Anonymous/Public Key *</label>
            <textarea
              id="supabase-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              rows={3}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>

          {connectionStatus === 'success' && (
            <div style={{ padding: '0.75rem', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius-md)', color: 'var(--green-700)' }}>
              ✅ Connection successful! Your Supabase project is ready.
            </div>
          )}

          {connectionStatus === 'error' && (
            <div style={{ padding: '0.75rem', background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius-md)', color: 'var(--red-700)' }}>
              ❌ {errorMessage}
            </div>
          )}

          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>🔒 Privacy & Security</h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
              <li>Your credentials are stored locally in your browser only</li>
              <li>All data goes directly to YOUR Supabase project</li>
              <li>We never see or access your data</li>
              <li>You can disconnect at any time</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onSkip}
          >
            Skip (Use Offline Only)
          </button>

          <button
            className="btn btn-primary"
            onClick={testConnection}
            disabled={!url || !key || isTestingConnection}
          >
            {isTestingConnection ? '🔄 Testing...' : '🧪 Test Connection'}
          </button>

          <button
            className="btn btn-success"
            onClick={handleSave}
            disabled={connectionStatus !== 'success'}
          >
            ✅ Save & Connect
          </button>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 1rem;
        }

        .modal-content {
          background: white;
          border-radius: var(--radius-lg);
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: var(--shadow-2xl);
          border: 1px solid var(--border);
          width: 100%;
        }

        .modal-header {
          padding: 1.5rem 1.5rem 1rem;
          border-bottom: 1px solid var(--border-light);
        }

        .modal-header h2 {
          margin: 0 0 0.5rem;
          color: var(--text-primary);
          font-size: 1.25rem;
          font-weight: 600;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .modal-footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid var(--border-light);
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 0.9rem;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-light);
        }

        @media (max-width: 640px) {
          .modal-footer {
            flex-direction: column;
          }

          .modal-footer button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}