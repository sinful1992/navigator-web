import * as React from 'react';
import { LoadingButton } from './LoadingButton';
import type { 
  ReminderSettings, 
  MessageTemplate, 
  AgentProfile 
} from '../types';
import { 
  DEFAULT_MESSAGE_TEMPLATES,
  generateReminderMessage 
} from '../services/reminderScheduler';

type Props = {
  settings: ReminderSettings;
  onUpdateSettings: (settings: ReminderSettings) => void;
  onClose: () => void;
};

export function ReminderSettings({ settings, onUpdateSettings, onClose }: Props) {
  const [localSettings, setLocalSettings] = React.useState<ReminderSettings>(settings);
  const [activeTab, setActiveTab] = React.useState<'profile' | 'templates' | 'schedule'>('templates');
  const [editingTemplate, setEditingTemplate] = React.useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = React.useState<string>('');
  const [showPreview, setShowPreview] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Validate settings
      if (!localSettings.agentProfile.name.trim()) {
        alert('Agent name is required');
        return;
      }
      
      if (!localSettings.agentProfile.signature.trim()) {
        alert('Agent signature is required');
        return;
      }
      
      // Ensure we have at least one message template
      if (localSettings.messageTemplates.length === 0) {
        setLocalSettings(prev => ({
          ...prev,
          messageTemplates: DEFAULT_MESSAGE_TEMPLATES,
          activeTemplateId: 'professional_standard'
        }));
        return;
      }
      
      await onUpdateSettings(localSettings);
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfileUpdate = (updates: Partial<AgentProfile>) => {
    setLocalSettings(prev => ({
      ...prev,
      agentProfile: { ...prev.agentProfile, ...updates }
    }));
  };

  const handleTemplateUpdate = (templateId: string, updates: Partial<MessageTemplate>) => {
    setLocalSettings(prev => ({
      ...prev,
      messageTemplates: prev.messageTemplates.map(t => 
        t.id === templateId ? { ...t, ...updates } : t
      )
    }));
  };

  const handleAddTemplate = () => {
    const newTemplate: MessageTemplate = {
      id: `custom_${Date.now()}`,
      name: 'New Custom Template',
      template: '{greeting}Payment Reminder\\n\\n{refLine}Your payment is due {date}{time}.\\n\\nAmount: £{amount}\\n\\n[Your custom message here]\\n\\n{signature}{contactInfo}',
      variables: ['greeting', 'refLine', 'date', 'time', 'amount', 'signature', 'contactInfo', 'customerName', 'referenceNumber', 'agentName', 'agentTitle']
    };
    
    setLocalSettings(prev => ({
      ...prev,
      messageTemplates: [...prev.messageTemplates, newTemplate]
    }));
    
    setEditingTemplate(newTemplate.id);
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (localSettings.messageTemplates.length <= 1) {
      alert('You must have at least one message template');
      return;
    }
    
    setLocalSettings(prev => {
      const newTemplates = prev.messageTemplates.filter(t => t.id !== templateId);
      const newActiveId = prev.activeTemplateId === templateId 
        ? newTemplates[0]?.id || 'professional_standard'
        : prev.activeTemplateId;
      
      return {
        ...prev,
        messageTemplates: newTemplates,
        activeTemplateId: newActiveId
      };
    });
  };

  const handlePreviewMessage = () => {
    try {
      // Create a sample arrangement for preview
      const sampleArrangement = {
        id: 'preview',
        addressIndex: 0,
        address: '123 Sample Street, London',
        customerName: '123456789 Smith',
        phoneNumber: '07123456789',
        scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // Tomorrow
        scheduledTime: '14:00',
        status: 'Scheduled' as const,
        amount: '125.00',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const sampleNotification = {
        id: 'preview',
        arrangementId: 'preview',
        type: 'payment_due' as const,
        scheduledDate: new Date().toISOString(),
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const message = generateReminderMessage(sampleArrangement, sampleNotification, localSettings);
      setPreviewMessage(message);
      setShowPreview(true);
    } catch (error) {
      console.error('Preview failed:', error);
      alert('Failed to generate preview. Please check your template.');
    }
  };

  const handleScheduleUpdate = (key: keyof typeof localSettings.customizableSchedule, value: boolean | number[]) => {
    setLocalSettings(prev => ({
      ...prev,
      customizableSchedule: {
        ...prev.customizableSchedule,
        [key]: value
      }
    }));
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '800px', width: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>⚙️ Reminder Settings</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          {/* Tab Navigation */}
          <div className="btn-group" style={{ marginBottom: '1.5rem' }}>
            <button
              className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('profile')}
            >
              👤 Agent Profile
            </button>
            <button
              className={`btn ${activeTab === 'templates' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('templates')}
            >
              📝 Message Templates
            </button>
            <button
              className={`btn ${activeTab === 'schedule' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('schedule')}
            >
              📅 Schedule Settings
            </button>
          </div>

          {/* Agent Profile Tab */}
          {activeTab === 'profile' && (
            <div className="settings-tab">
              <h3>Agent Profile Information</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                This information will be used in your reminder messages and signature.
              </p>
              
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="agent-name">👤 Agent Name *</label>
                  <input
                    id="agent-name"
                    name="agentName"
                    type="text"
                    value={localSettings.agentProfile.name}
                    onChange={(e) => handleProfileUpdate({ name: e.target.value })}
                    className="input"
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="agent-title">🏷️ Job Title *</label>
                  <select
                    id="agent-title"
                    name="agentTitle"
                    value={localSettings.agentProfile.title}
                    onChange={(e) => handleProfileUpdate({ title: e.target.value })}
                    className="input"
                  >
                    <option value="Enforcement Agent">Enforcement Agent</option>
                    <option value="Bailiff">Bailiff</option>
                    <option value="Recovery Officer">Recovery Officer</option>
                    <option value="Collection Agent">Collection Agent</option>
                    <option value="Senior Enforcement Agent">Senior Enforcement Agent</option>
                    <option value="Lead Bailiff">Lead Bailiff</option>
                  </select>
                </div>
                
                <div className="form-group form-group-full">
                  <label htmlFor="agent-signature">✍️ Message Signature *</label>
                  <input
                    id="agent-signature"
                    name="agentSignature"
                    type="text"
                    value={localSettings.agentProfile.signature}
                    onChange={(e) => handleProfileUpdate({ signature: e.target.value })}
                    className="input"
                    placeholder="e.g., Enforcement Agent J. Smith"
                    required
                  />
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    This will appear at the end of your reminder messages
                  </div>
                </div>
                
                <div className="form-group form-group-full">
                  <label htmlFor="agent-contact-info">📞 Contact Information (Optional)</label>
                  <input
                    id="agent-contact-info"
                    name="agentContactInfo"
                    type="text"
                    value={localSettings.agentProfile.contactInfo || ''}
                    onChange={(e) => handleProfileUpdate({ contactInfo: e.target.value })}
                    className="input"
                    placeholder="e.g., Tel: 01234 567890"
                  />
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Additional contact information to include in messages
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Message Templates Tab */}
          {activeTab === 'templates' && (
            <div className="settings-tab">
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3>Message Templates</h3>
                  <div>
                    <button className="btn btn-ghost btn-sm" onClick={handlePreviewMessage}>
                      👁️ Preview
                    </button>
                    <button className="btn btn-success btn-sm" onClick={handleAddTemplate}>
                      ➕ Add Template
                    </button>
                  </div>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
                  Create and customize SMS reminder messages. Use variables to automatically insert customer and payment details.
                  <br />
                  <strong>💡 Click the ✏️ Edit button next to any template to see the enhanced editor with variable reference panel.</strong>
                </p>
              </div>
              
              <div className="form-group">
                <label htmlFor="active-template">Active Template</label>
                <select
                  id="active-template"
                  name="activeTemplate"
                  value={localSettings.activeTemplateId}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, activeTemplateId: e.target.value }))}
                  className="input"
                >
                  {localSettings.messageTemplates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="templates-list">
                {localSettings.messageTemplates.map(template => (
                  <div key={template.id} className="template-item">
                    <div className="template-header">
                      <div>
                        <strong>{template.name}</strong>
                        {template.id === localSettings.activeTemplateId && (
                          <span className="pill" style={{ 
                            backgroundColor: 'var(--success)15',
                            color: 'var(--success)',
                            marginLeft: '0.5rem' 
                          }}>
                            Active
                          </span>
                        )}
                      </div>
                      <div>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingTemplate(editingTemplate === template.id ? null : template.id)}
                        >
                          {editingTemplate === template.id ? '👁️' : '✏️'}
                        </button>
                        {template.id.startsWith('custom_') && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {editingTemplate === template.id && (
                      <div className="template-editor">
                        <div className="form-group">
                          <label htmlFor={`template-name-${template.id}`}>Template Name</label>
                          <input
                            id={`template-name-${template.id}`}
                            name={`templateName-${template.id}`}
                            type="text"
                            value={template.name}
                            onChange={(e) => handleTemplateUpdate(template.id, { name: e.target.value })}
                            className="input"
                          />
                        </div>
                        <div className="template-editor-layout">
                          <div className="form-group">
                            <label htmlFor={`template-content-${template.id}`}>Message Template</label>
                            <textarea
                              id={`template-content-${template.id}`}
                              name={`templateContent-${template.id}`}
                              value={template.template}
                              onChange={(e) => handleTemplateUpdate(template.id, { template: e.target.value })}
                              className="input"
                              rows={12}
                              style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                            />
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              Use variables like {'{greeting}'} and {'{amount}'} - see reference panel →
                            </div>
                          </div>

                          <div className="variable-reference-panel">
                            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                              📋 Available Variables
                            </h4>

                            <div className="variable-group">
                              <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--primary)' }}>Customer Info</h5>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{greeting}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Smart greeting: "Mr/Mrs Smith, "
                                </div>
                              </div>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{refLine}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Reference line: "Reference: 123456789\\n\\n"
                                </div>
                              </div>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{customerName}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Full name: "123456789 Smith"
                                </div>
                              </div>
                            </div>

                            <div className="variable-group" style={{ marginTop: '1rem' }}>
                              <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--primary)' }}>Payment Details</h5>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{amount}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Payment amount: "125.00"
                                </div>
                              </div>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{date}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Due date: "15/01/2025"
                                </div>
                              </div>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{time}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Time (if set): " at 14:00"
                                </div>
                              </div>
                            </div>

                            <div className="variable-group" style={{ marginTop: '1rem' }}>
                              <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--primary)' }}>Agent Info</h5>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{signature}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Full signature: "Enforcement Agent J. Smith"
                                </div>
                              </div>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{agentName}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Name only: "J. Smith"
                                </div>
                              </div>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{agentTitle}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Job title: "Enforcement Agent"
                                </div>
                              </div>
                              <div className="variable-item" style={{ marginBottom: '0.5rem' }}>
                                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{'{contactInfo}'}</code>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Contact: "Tel: 01234 567890"
                                </div>
                              </div>
                            </div>

                            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'var(--blue-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--blue-200)' }}>
                              <div style={{ fontSize: '0.75rem', color: 'var(--blue-700)', fontWeight: 600, marginBottom: '0.25rem' }}>
                                💡 Tips:
                              </div>
                              <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.75rem', color: 'var(--blue-600)' }}>
                                <li>Use \\n for line breaks</li>
                                <li>Variables are case-sensitive</li>
                                <li>Preview to test your template</li>
                                <li>Empty variables won't show</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule Settings Tab */}
          {activeTab === 'schedule' && (
            <div className="settings-tab">
              <h3>Reminder Schedule</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Choose when reminder notifications should be sent before payment due dates.
              </p>
              
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    name="globalEnabled"
                    type="checkbox"
                    checked={localSettings.globalEnabled}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, globalEnabled: e.target.checked }))}
                  />
                  Enable automatic reminders
                </label>
              </div>
              
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    name="smsEnabled"
                    type="checkbox"
                    checked={localSettings.smsEnabled}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, smsEnabled: e.target.checked }))}
                    disabled={!localSettings.globalEnabled}
                  />
                  Enable SMS reminders
                </label>
              </div>
              
              <hr style={{ margin: '1.5rem 0' }} />
              
              <h4>Reminder Timing</h4>
              <div className="schedule-options">
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      name="threeDayReminder"
                      type="checkbox"
                      checked={localSettings.customizableSchedule.threeDayReminder}
                      onChange={(e) => handleScheduleUpdate('threeDayReminder', e.target.checked)}
                      disabled={!localSettings.globalEnabled}
                    />
                    Send reminder 3 days before payment due
                  </label>
                </div>
                
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      name="oneDayReminder"
                      type="checkbox"
                      checked={localSettings.customizableSchedule.oneDayReminder}
                      onChange={(e) => handleScheduleUpdate('oneDayReminder', e.target.checked)}
                      disabled={!localSettings.globalEnabled}
                    />
                    Send reminder 1 day before payment due
                  </label>
                </div>
                
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      name="dayOfReminder"
                      type="checkbox"
                      checked={localSettings.customizableSchedule.dayOfReminder}
                      onChange={(e) => handleScheduleUpdate('dayOfReminder', e.target.checked)}
                      disabled={!localSettings.globalEnabled}
                    />
                    Send reminder on payment due date
                  </label>
                </div>
              </div>
              
              <div className="custom-days-section">
                <h4>Custom Reminder Days</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  Add additional reminder days (e.g., 7 for weekly, 14 for bi-weekly)
                </p>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  {localSettings.customizableSchedule.customDays.map((days, index) => (
                    <span key={index} className="pill" style={{
                      backgroundColor: 'var(--primary)15',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {days} days before
                      <button
                        onClick={() => {
                          const newDays = [...localSettings.customizableSchedule.customDays];
                          newDays.splice(index, 1);
                          handleScheduleUpdate('customDays', newDays);
                        }}
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          color: 'inherit', 
                          cursor: 'pointer',
                          padding: '0 0.25rem'
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    name="customDayInput"
                    type="number"
                    min="1"
                    max="365"
                    placeholder="Days before"
                    className="input"
                    style={{ width: '120px' }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const input = e.target as HTMLInputElement;
                        const days = parseInt(input.value);
                        if (days && days > 0 && !localSettings.customizableSchedule.customDays.includes(days)) {
                          handleScheduleUpdate('customDays', [...localSettings.customizableSchedule.customDays, days]);
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      const input = (e.target as HTMLElement).parentElement?.querySelector('input') as HTMLInputElement;
                      const days = parseInt(input.value);
                      if (days && days > 0 && !localSettings.customizableSchedule.customDays.includes(days)) {
                        handleScheduleUpdate('customDays', [...localSettings.customizableSchedule.customDays, days]);
                        input.value = '';
                      }
                    }}
                  >
                    ➕ Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <LoadingButton
            className="btn btn-primary"
            onClick={handleSave}
            isLoading={isSaving}
            loadingText="Saving..."
          >
            💾 Save Settings
          </LoadingButton>
        </div>
      </div>
      
      {/* Message Preview Modal */}
      {showPreview && (
        <div className="modal-backdrop" onClick={() => setShowPreview(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>📱 Message Preview</h3>
              <button className="btn btn-ghost" onClick={() => setShowPreview(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{
                padding: '1rem',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius)',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5
              }}>
                {previewMessage}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                This is how your message will appear when sent to customers.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowPreview(false)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Modal Backdrop */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        /* Modal Content */
        .modal-content {
          background: white;
          border-radius: var(--radius-lg, 12px);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          max-width: 900px;
          width: 95vw;
          max-height: 95vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 480px) {
          .modal-content {
            width: 98vw;
            max-height: 98vh;
            border-radius: var(--radius-md, 8px);
            margin: 0 0.5rem;
          }
        }

        /* Modal Header */
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid var(--gray-200, #e5e7eb);
          flex-shrink: 0;
        }

        @media (max-width: 480px) {
          .modal-header {
            padding: 1rem 1.5rem;
          }

          .modal-header h2 {
            font-size: 1.25rem;
          }
        }

        .modal-header h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--gray-900, #111827);
          margin: 0;
        }

        .modal-header .btn {
          padding: 0.5rem;
          min-width: auto;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 1rem;
        }

        /* Modal Body */
        .modal-body {
          padding: 2rem;
          overflow-y: auto;
          flex: 1;
        }

        /* Modal Footer */
        .modal-footer {
          padding: 1.5rem 2rem;
          border-top: 1px solid var(--gray-200, #e5e7eb);
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          flex-shrink: 0;
        }

        @media (max-width: 480px) {
          .modal-body {
            padding: 1.5rem;
          }

          .modal-footer {
            padding: 1rem 1.5rem;
            flex-direction: column-reverse;
            gap: 0.75rem;
          }

          .modal-footer .btn {
            width: 100%;
            justify-content: center;
          }
        }

        /* Template Editor Layout */
        .template-editor-layout {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1.5rem;
          min-height: 500px;
        }

        @media (max-width: 1024px) {
          .template-editor-layout {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .variable-reference-panel {
            order: -1;
            max-height: 300px !important;
          }
        }

        /* Variable Reference Panel */
        .variable-reference-panel {
          background: var(--gray-50, #f8f9fa);
          border: 1px solid var(--gray-200, #e9ecef);
          border-radius: var(--radius-md, 8px);
          padding: 1.25rem;
          font-size: 0.875rem;
          max-height: 500px;
          overflow-y: auto;
          position: sticky;
          top: 0;
        }

        .variable-group {
          margin-bottom: 1.5rem;
        }

        .variable-group:last-child {
          margin-bottom: 0;
        }

        .variable-group h5 {
          margin: 0 0 0.75rem;
          font-size: 0.875rem;
          color: var(--primary, #0ea5e9);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .variable-item {
          margin-bottom: 0.75rem;
          padding: 0.5rem;
          background: white;
          border-radius: var(--radius-sm, 6px);
          border: 1px solid var(--gray-100, #f3f4f6);
        }

        .variable-item:last-child {
          margin-bottom: 0;
        }

        .variable-item code {
          color: var(--primary, #0ea5e9);
          font-weight: 600;
          background: var(--primary-light, #e0f2fe);
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.8125rem;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }

        .variable-item div {
          color: var(--text-muted, #6b7280);
          font-size: 0.8125rem;
          margin-top: 0.375rem;
          line-height: 1.4;
        }

        /* Form Improvements */
        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          font-weight: 500;
          color: var(--gray-700, #374151);
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .form-group .input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid var(--gray-300, #d1d5db);
          border-radius: var(--radius-md, 8px);
          font-size: 0.875rem;
          transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }

        .form-group .input:focus {
          outline: none;
          border-color: var(--primary, #0ea5e9);
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
        }

        .form-group textarea.input {
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          line-height: 1.5;
        }

        /* Button Group */
        .btn-group {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 2rem;
        }

        .btn-group .btn {
          flex: 1;
          text-align: center;
          font-size: 0.875rem;
          padding: 0.75rem 0.5rem;
        }

        /* Mobile-specific tab optimizations */
        @media (max-width: 480px) {
          .btn-group {
            gap: 0.25rem;
            margin-bottom: 1.5rem;
          }

          .btn-group .btn {
            font-size: 0.75rem;
            padding: 0.625rem 0.375rem;
            line-height: 1.2;
          }
        }

        @media (max-width: 360px) {
          .btn-group {
            flex-direction: column;
            gap: 0.5rem;
          }

          .btn-group .btn {
            flex: none;
            font-size: 0.875rem;
            padding: 0.75rem 1rem;
          }
        }

        /* Templates List */
        .templates-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .template-item {
          border: 1px solid var(--gray-200, #e5e7eb);
          border-radius: var(--radius-lg, 12px);
          overflow: hidden;
        }

        .template-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          background: var(--gray-50, #f9fafb);
          border-bottom: 1px solid var(--gray-200, #e5e7eb);
        }

        .template-editor {
          padding: 1.5rem;
          background: white;
        }

        /* Dark Mode Support */
        .dark-mode .modal-content {
          background: var(--gray-800, #1f2937);
          color: var(--gray-100, #f3f4f6);
        }

        .dark-mode .modal-header {
          border-bottom-color: var(--gray-700, #374151);
        }

        .dark-mode .modal-header h2 {
          color: var(--gray-100, #f3f4f6);
        }

        .dark-mode .modal-footer {
          border-top-color: var(--gray-700, #374151);
        }

        /* Form Elements Dark Mode */
        .dark-mode .form-group label {
          color: var(--gray-200, #e5e7eb);
        }

        .dark-mode .form-group .input {
          background: var(--gray-700, #374151);
          border-color: var(--gray-600, #4b5563);
          color: var(--gray-100, #f3f4f6);
        }

        .dark-mode .form-group .input:focus {
          border-color: var(--primary, #0ea5e9);
          background: var(--gray-700, #374151);
        }

        .dark-mode .form-group .input::placeholder {
          color: var(--gray-400, #9ca3af);
        }

        /* Variable Reference Panel Dark Mode */
        .dark-mode .variable-reference-panel {
          background: var(--gray-700, #374151);
          border-color: var(--gray-600, #4b5563);
          color: var(--gray-100, #f3f4f6);
        }

        .dark-mode .variable-group h5 {
          color: var(--primary-light, #38bdf8);
        }

        .dark-mode .variable-item {
          background: var(--gray-800, #1f2937);
          border-color: var(--gray-600, #4b5563);
        }

        .dark-mode .variable-item code {
          background: var(--primary-dark, #0c4a6e);
          color: var(--primary-light, #38bdf8);
        }

        .dark-mode .variable-item div {
          color: var(--gray-300, #d1d5db);
        }

        /* Template Items Dark Mode */
        .dark-mode .template-item {
          border-color: var(--gray-600, #4b5563);
          background: var(--gray-800, #1f2937);
        }

        .dark-mode .template-header {
          background: var(--gray-700, #374151);
          border-bottom-color: var(--gray-600, #4b5563);
          color: var(--gray-100, #f3f4f6);
        }

        .dark-mode .template-editor {
          background: var(--gray-800, #1f2937);
        }

        /* Button Group Dark Mode */
        .dark-mode .btn-group .btn {
          border-color: var(--gray-600, #4b5563);
          color: var(--gray-200, #e5e7eb);
        }

        .dark-mode .btn-group .btn.btn-primary {
          background: var(--primary, #0ea5e9);
          color: white;
        }

        .dark-mode .btn-group .btn.btn-ghost {
          background: var(--gray-700, #374151);
        }

        .dark-mode .btn-group .btn.btn-ghost:hover {
          background: var(--gray-600, #4b5563);
        }

        /* Additional Text Elements */
        .dark-mode .settings-tab h3 {
          color: var(--gray-100, #f3f4f6);
        }

        .dark-mode .settings-tab p {
          color: var(--gray-300, #d1d5db);
        }

        .dark-mode .setting-description {
          color: var(--gray-400, #9ca3af);
        }

        /* Tips Box Dark Mode */
        .dark-mode .variable-reference-panel div[style*="background: var(--blue-50)"] {
          background: var(--gray-600, #4b5563) !important;
          border-color: var(--gray-500, #6b7280) !important;
        }

        .dark-mode .variable-reference-panel div[style*="color: var(--blue-700)"] {
          color: var(--blue-300, #93c5fd) !important;
        }

        .dark-mode .variable-reference-panel ul {
          color: var(--gray-300, #d1d5db) !important;
        }

        /* Template List Dark Mode */
        .dark-mode .template-item strong {
          color: var(--gray-100, #f3f4f6) !important;
        }

        .dark-mode .pill {
          background: var(--success-dark, #166534) !important;
          color: var(--success-light, #86efac) !important;
        }

        .dark-mode .template-header strong {
          color: var(--gray-100, #f3f4f6) !important;
        }

        .dark-mode .template-header {
          color: var(--gray-100, #f3f4f6) !important;
        }
      `}</style>
    </div>
  );
}