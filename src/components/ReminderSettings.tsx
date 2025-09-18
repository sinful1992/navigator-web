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
  const [activeTab, setActiveTab] = React.useState<'profile' | 'templates' | 'schedule'>('profile');
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem' }}>
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

                          <div className="variable-reference-panel" style={{
                            padding: '1rem',
                            backgroundColor: 'var(--gray-50)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--gray-200)',
                            fontSize: '0.8125rem',
                            maxHeight: '400px',
                            overflowY: 'auto'
                          }}>
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
    </div>
  );
}