import React from 'react';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { Modal } from './Modal';

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
      const { data: _data, error } = await testClient.auth.getSession();

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
    <Modal
      isOpen={isOpen}
      onClose={onSkip}
      title="📁 Optional: Connect Your Own Cloud Storage"
      size="lg"
    >
      <div style={{ marginBottom: '1rem' }}>
        <p style={{ margin: '0.5rem 0 0', opacity: 0.8, fontSize: '0.9rem' }}>
          Set up your own Supabase project for cloud backup and sync (completely optional)
        </p>
      </div>

      <div className="info-box info-box-primary">
        <h4>📋 Quick Setup Instructions</h4>
        <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
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
        <div className="info-box info-box-success">
          ✅ Connection successful! Your Supabase project is ready.
        </div>
      )}

      {connectionStatus === 'error' && (
        <div className="info-box info-box-error">
          ❌ {errorMessage}
        </div>
      )}

      <div className="info-box" style={{ background: 'var(--bg-secondary)' }}>
        <h4>🔒 Privacy & Security</h4>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
          <li>Your credentials are stored locally in your browser only</li>
          <li>All data goes directly to YOUR Supabase project</li>
          <li>We never see or access your data</li>
          <li>You can disconnect at any time</li>
        </ul>
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
    </Modal>
  );
}
