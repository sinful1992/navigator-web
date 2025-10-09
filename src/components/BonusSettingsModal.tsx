// src/components/BonusSettingsModal.tsx
import * as React from 'react';
import type { BonusSettings } from '../types';
import { DEFAULT_BONUS_SETTINGS } from '../utils/bonusCalculator';

interface BonusSettingsModalProps {
  settings: BonusSettings;
  onUpdateSettings: (settings: BonusSettings) => void;
  onClose: () => void;
}

export function BonusSettingsModal({
  settings: initialSettings,
  onUpdateSettings,
  onClose,
}: BonusSettingsModalProps) {
  const [localSettings, setLocalSettings] = React.useState<BonusSettings>(
    initialSettings || DEFAULT_BONUS_SETTINGS
  );

  // Reset settings when modal opens
  React.useEffect(() => {
    setLocalSettings(initialSettings || DEFAULT_BONUS_SETTINGS);
  }, [initialSettings]);

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
  };

  const handleReset = () => {
    setLocalSettings(DEFAULT_BONUS_SETTINGS);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content bonus-settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}
      >
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>⚙️ Bonus Calculation Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '1.5rem' }}>
          {/* Enable/Disable */}
          <div className="setting-group">
            <label className="setting-row">
              <input
                type="checkbox"
                checked={localSettings.enabled}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, enabled: e.target.checked })
                }
              />
              <span className="setting-label">Enable Bonus Tracking</span>
            </label>
          </div>

          {localSettings.enabled && (
            <>
              {/* Calculation Type */}
              <div className="setting-group">
                <label className="setting-label-main">Calculation Method</label>
                <div className="calc-type-grid">
                  <button
                    className={`calc-type-btn ${
                      localSettings.calculationType === 'simple' ? 'active' : ''
                    }`}
                    onClick={() =>
                      setLocalSettings({ ...localSettings, calculationType: 'simple' })
                    }
                  >
                    <div className="calc-type-icon">📊</div>
                    <div className="calc-type-name">Simple</div>
                    <div className="calc-type-desc">
                      £X per PIF - £Y per day
                    </div>
                  </button>

                  <button
                    className={`calc-type-btn ${
                      localSettings.calculationType === 'complex' ? 'active' : ''
                    }`}
                    onClick={() =>
                      setLocalSettings({ ...localSettings, calculationType: 'complex' })
                    }
                  >
                    <div className="calc-type-icon">🧮</div>
                    <div className="calc-type-name">Complex</div>
                    <div className="calc-type-desc">
                      TCG Regulations 2014
                    </div>
                  </button>

                  <button
                    className={`calc-type-btn ${
                      localSettings.calculationType === 'custom' ? 'active' : ''
                    }`}
                    onClick={() =>
                      setLocalSettings({ ...localSettings, calculationType: 'custom' })
                    }
                  >
                    <div className="calc-type-icon">⚡</div>
                    <div className="calc-type-name">Custom</div>
                    <div className="calc-type-desc">
                      JavaScript formula
                    </div>
                  </button>
                </div>
              </div>

              {/* Simple Settings */}
              {localSettings.calculationType === 'simple' && (
                <div className="setting-group">
                  <h3 style={{ marginBottom: '1rem' }}>Simple Calculation</h3>

                  <label className="setting-row-input">
                    <span className="setting-label">Bonus per PIF (£)</span>
                    <input
                      type="number"
                      className="input"
                      min="0"
                      step="1"
                      value={localSettings.simpleSettings?.pifBonus || 100}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          simpleSettings: {
                            ...localSettings.simpleSettings!,
                            pifBonus: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>

                  <label className="setting-row-input">
                    <span className="setting-label">
                      Daily Threshold (£)
                    </span>
                    <input
                      type="number"
                      className="input"
                      min="0"
                      step="1"
                      value={localSettings.simpleSettings?.dailyThreshold || 100}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          simpleSettings: {
                            ...localSettings.simpleSettings!,
                            dailyThreshold: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>

                  <div className="formula-preview">
                    <strong>Formula:</strong> (PIFs × £
                    {localSettings.simpleSettings?.pifBonus || 100}) - (Days × £
                    {localSettings.simpleSettings?.dailyThreshold || 100})
                  </div>
                </div>
              )}

              {/* Complex Settings */}
              {localSettings.calculationType === 'complex' && (
                <div className="setting-group">
                  <h3 style={{ marginBottom: '1rem' }}>
                    Complex Calculation (TCG Regulations 2014)
                  </h3>

                  <div className="settings-grid">
                    <label className="setting-row-input">
                      <span className="setting-label">Standard PIF Bonus (£)</span>
                      <input
                        type="number"
                        className="input"
                        min="0"
                        step="1"
                        value={localSettings.complexSettings?.basePifBonus || 100}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            complexSettings: {
                              ...localSettings.complexSettings!,
                              basePifBonus: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </label>

                    <label className="setting-row-input">
                      <span className="setting-label">Small PIF Bonus (£)</span>
                      <input
                        type="number"
                        className="input"
                        min="0"
                        step="1"
                        value={localSettings.complexSettings?.smallPifBonus || 30}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            complexSettings: {
                              ...localSettings.complexSettings!,
                              smallPifBonus: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                      />
                      <small>For debts &lt; £100</small>
                    </label>

                    <label className="setting-row-input">
                      <span className="setting-label">
                        Large Debt Threshold (£)
                      </span>
                      <input
                        type="number"
                        className="input"
                        min="0"
                        step="100"
                        value={localSettings.complexSettings?.largePifThreshold || 1500}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            complexSettings: {
                              ...localSettings.complexSettings!,
                              largePifThreshold: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </label>

                    <label className="setting-row-input">
                      <span className="setting-label">Large PIF Max (£)</span>
                      <input
                        type="number"
                        className="input"
                        min="0"
                        step="50"
                        value={localSettings.complexSettings?.largePifCap || 500}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            complexSettings: {
                              ...localSettings.complexSettings!,
                              largePifCap: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                      />
                      <small>Maximum bonus per large PIF</small>
                    </label>

                    <label className="setting-row-input">
                      <span className="setting-label">Linked Case Bonus (£)</span>
                      <input
                        type="number"
                        className="input"
                        min="0"
                        step="5"
                        value={localSettings.complexSettings?.linkedCaseBonus || 10}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            complexSettings: {
                              ...localSettings.complexSettings!,
                              linkedCaseBonus: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                      />
                      <small>For cases with £0 enforcement fee</small>
                    </label>

                    <label className="setting-row-input">
                      <span className="setting-label">
                        Daily Threshold (£)
                      </span>
                      <input
                        type="number"
                        className="input"
                        min="0"
                        step="10"
                        value={localSettings.complexSettings?.dailyThreshold || 100}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            complexSettings: {
                              ...localSettings.complexSettings!,
                              dailyThreshold: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="formula-preview">
                    <strong>Formula:</strong>
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                      <li>
                        Standard PIF (£100-£1500): £
                        {localSettings.complexSettings?.basePifBonus || 100}
                      </li>
                      <li>
                        Large PIF (&gt;£1500): £{localSettings.complexSettings?.basePifBonus || 100} + 2.5% of 7.5% over £1500 (max £{localSettings.complexSettings?.largePifCap || 500})
                      </li>
                      <li>
                        Small PIF (&lt;£100): £{localSettings.complexSettings?.smallPifBonus || 30}
                      </li>
                      <li>
                        Linked cases (£0): £{localSettings.complexSettings?.linkedCaseBonus || 10}
                      </li>
                      <li>
                        Daily threshold: £{localSettings.complexSettings?.dailyThreshold || 100}
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Custom Formula */}
              {localSettings.calculationType === 'custom' && (
                <div className="setting-group">
                  <h3 style={{ marginBottom: '1rem' }}>Custom Formula</h3>

                  <label className="setting-row-input">
                    <span className="setting-label">JavaScript Expression</span>
                    <textarea
                      className="input"
                      rows={5}
                      placeholder="(T - (75 * N + 122.5)) / 1.075"
                      value={localSettings.customFormula || ''}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          customFormula: e.target.value,
                        })
                      }
                      style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                    />
                  </label>

                  <div className="formula-preview">
                    <strong>Available variables:</strong>
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                      <li><code>T</code> - Total amount collected (£)</li>
                      <li><code>N</code> - Number of cases</li>
                      <li><code>D</code> - Calculated debt amount (£)</li>
                      <li><code>days</code> - Working days</li>
                    </ul>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Example: <code>(T - (75 * N + 122.5)) / 1.075 * 0.1</code>
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Options */}
              <div className="setting-group">
                <h3 style={{ marginBottom: '1rem' }}>Additional Options</h3>

                <label className="setting-row">
                  <input
                    type="checkbox"
                    checked={localSettings.countLinkedCases}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        countLinkedCases: e.target.checked,
                      })
                    }
                  />
                  <span className="setting-label">
                    Count Linked Cases Separately
                    <small style={{ display: 'block', marginTop: '0.25rem' }}>
                      If 1 debtor has 3 cases, count as 3 PIFs
                    </small>
                  </span>
                </label>

                <label className="setting-row">
                  <input
                    type="checkbox"
                    checked={localSettings.adjustForWorkingDays}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        adjustForWorkingDays: e.target.checked,
                      })
                    }
                  />
                  <span className="setting-label">
                    Adjust for Working Days
                    <small style={{ display: 'block', marginTop: '0.25rem' }}>
                      Calculate threshold based on actual days worked
                    </small>
                  </span>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem', padding: '1.5rem' }}>
          <button className="btn btn-ghost" onClick={handleReset}>
            Reset to Default
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>

      <style>{`
        .bonus-settings-modal .setting-group {
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid var(--border);
        }

        .bonus-settings-modal .setting-group:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }

        .setting-label-main {
          display: block;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .setting-row {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background 0.2s;
        }

        .setting-row:hover {
          background: var(--gray-50);
        }

        .setting-row input[type="checkbox"] {
          margin-top: 0.25rem;
        }

        .setting-label {
          flex: 1;
          font-weight: 500;
        }

        .setting-label small {
          display: block;
          margin-top: 0.25rem;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: normal;
        }

        .setting-row-input {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .setting-row-input .setting-label {
          font-weight: 600;
          color: var(--text-primary);
        }

        .setting-row-input small {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .calc-type-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }

        .calc-type-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.5rem 1rem;
          border: 2px solid var(--border);
          border-radius: var(--radius-lg);
          background: var(--surface);
          cursor: pointer;
          transition: all 0.2s;
        }

        .calc-type-btn:hover {
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .calc-type-btn.active {
          border-color: var(--primary);
          background: var(--primary-light);
        }

        .calc-type-icon {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .calc-type-name {
          font-weight: 600;
          margin-bottom: 0.25rem;
          color: var(--text-primary);
        }

        .calc-type-desc {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-align: center;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }

        .formula-preview {
          margin-top: 1.5rem;
          padding: 1rem;
          background: var(--gray-50);
          border-left: 4px solid var(--primary);
          border-radius: var(--radius-md);
          font-size: 0.875rem;
        }

        .formula-preview strong {
          color: var(--primary);
        }

        .formula-preview code {
          background: var(--gray-100);
          padding: 0.125rem 0.375rem;
          border-radius: var(--radius-sm);
          font-family: monospace;
          font-size: 0.875em;
        }

        .formula-preview ul {
          font-size: 0.875rem;
        }

        .formula-preview li {
          margin-bottom: 0.25rem;
        }
      `}</style>
    </div>
  );
}
