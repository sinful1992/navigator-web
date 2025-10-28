// src/components/SettingsComponents/HomeAddressEditor.tsx
// Home address editing component with set/change/clear actions

import React, { useState } from 'react';
import { AddressAutocomplete } from '../AddressAutocomplete';
import { isHybridRoutingAvailable } from '../../services/hybridRouting';

export interface HomeAddressEditorProps {
  homeAddress?: string;
  onUpdateAddress: (address: string, lat?: number, lng?: number) => void;
  onClearAddress: () => void;
}

/**
 * HomeAddressEditor - Complete home address management component
 * Shows different UI states:
 * - Empty state: Prompt to set address
 * - Set state: Display current address with Change/Clear buttons
 * - Edit state: Show AddressAutocomplete input
 */
export const HomeAddressEditor: React.FC<HomeAddressEditorProps> = ({
  homeAddress,
  onUpdateAddress,
  onClearAddress
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempAddress, setTempAddress] = useState('');

  return (
    <div className="modern-setting-column" style={{ marginTop: '1rem' }}>
      <div className="modern-setting-label" style={{ marginBottom: '0.5rem' }}>
        🏠 Home Address
      </div>

      {/* Empty State - Prompt to set address */}
      {!isEditing && !homeAddress && (
        <div
          style={{
            padding: '0.875rem',
            background: 'rgba(99, 102, 241, 0.05)',
            borderRadius: '10px',
            border: '1.5px dashed rgba(99, 102, 241, 0.2)',
            textAlign: 'center',
            marginBottom: '0.5rem'
          }}
        >
          <p style={{ margin: '0 0 0.75rem 0', color: '#6b7280', fontSize: '0.8125rem' }}>
            Set your home address to optimize routes that end near home
          </p>
          <button
            className="modern-action-button primary small"
            onClick={() => setIsEditing(true)}
            style={{ margin: '0 auto', maxWidth: '200px' }}
          >
            <span className="modern-button-icon">+</span>
            <span className="modern-button-text">Set Home Address</span>
          </button>
        </div>
      )}

      {/* Set State - Display current address with actions */}
      {!isEditing && homeAddress && (
        <div
          style={{
            padding: '0.875rem',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '10px',
            border: '1.5px solid rgba(16, 185, 129, 0.3)',
            marginBottom: '0.5rem'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.75rem'
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: '600',
                  color: '#059669',
                  marginBottom: '0.25rem',
                  fontSize: '0.8125rem'
                }}
              >
                ✓ Routes will end near home
              </div>
              <div style={{ color: '#374151', fontSize: '0.8125rem' }}>
                {homeAddress}
              </div>
            </div>
            <div className="modern-inline-button-group">
              <button
                className="modern-inline-button primary"
                onClick={() => {
                  setTempAddress(homeAddress);
                  setIsEditing(true);
                }}
              >
                Change
              </button>
              <button
                className="modern-inline-button danger"
                onClick={() => {
                  if (confirm('Clear your home address? You can set it again anytime.')) {
                    onClearAddress();
                  }
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit State - Show address input */}
      {isEditing && (
        <div style={{ marginBottom: '0.5rem' }}>
          <AddressAutocomplete
            id="settings-home-address-input"
            value={tempAddress}
            onChange={setTempAddress}
            onSelect={(address, lat, lng) => {
              onUpdateAddress(address, lat, lng);
              setIsEditing(false);
              setTempAddress('');
            }}
            placeholder="Type your home address..."
            disabled={!isHybridRoutingAvailable()}
          />
          <button
            className="modern-action-button small"
            onClick={() => {
              setIsEditing(false);
              setTempAddress('');
            }}
            style={{ marginTop: '0.5rem' }}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="modern-setting-desc">
        When set, route optimization will create routes that end near your home address
      </div>
    </div>
  );
};

HomeAddressEditor.displayName = 'HomeAddressEditor';
