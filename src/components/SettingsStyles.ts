// src/components/SettingsStyles.ts - Extracted CSS styles for SettingsDropdown
// PHASE 2 Task 2: Modern Settings Dropdown Refactoring
// Phase 1: CSS extraction from inline styles

/**
 * All CSS styles for SettingsDropdown component
 * Organized by functional sections for easier maintenance
 * Last extracted from SettingsDropdown.tsx lines 870-1714
 */

export const SETTINGS_STYLES = `
  /* ========================================
     MODERN SETTINGS DROPDOWN - BASE LAYOUT
     ======================================== */

  .modern-settings-dropdown {
    position: relative;
    display: inline-block;
  }

  /* ========================================
     TRIGGER BUTTON - Main Entry Point
     ======================================== */

  .modern-settings-trigger {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1.25rem;
    background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
    border: 1.5px solid rgba(99, 102, 241, 0.12);
    border-radius: 12px;
    color: #1f2937;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .modern-settings-trigger:hover {
    background: linear-gradient(135deg, #ffffff 0%, #f0f1ff 100%);
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.15);
    transform: translateY(-1px);
  }

  .modern-trigger-icon {
    font-size: 1.25rem;
  }

  /* ========================================
     MAIN PANEL - Dropdown Container
     ======================================== */

  .modern-settings-panel {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    z-index: 999999;
    width: 440px;
    max-height: 85vh;
    background: linear-gradient(135deg, #ffffff 0%, #fafbff 100%);
    border: 1px solid rgba(99, 102, 241, 0.08);
    border-radius: 20px;
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.12),
      0 12px 32px rgba(99, 102, 241, 0.08),
      0 0 0 1px rgba(99, 102, 241, 0.05);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: modernSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(8px);
  }

  @keyframes modernSlideIn {
    from {
      opacity: 0;
      transform: translateY(-16px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* ========================================
     PANEL HEADER - Title and Close Button
     ======================================== */

  .modern-panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.75rem 1.75rem 1.25rem;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.03) 100%);
    border-bottom: 1px solid rgba(99, 102, 241, 0.08);
  }

  .modern-header-content {
    flex: 1;
  }

  .modern-panel-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #111827;
    margin: 0 0 0.375rem 0;
    letter-spacing: -0.03em;
  }

  .modern-panel-subtitle {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  .modern-close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
    color: #6b7280;
    font-size: 1.125rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modern-close-button:hover {
    background: #f9fafb;
    border-color: #ef4444;
    color: #ef4444;
    transform: scale(1.05);
  }

  /* ========================================
     PANEL BODY - Scrollable Content Area
     ======================================== */

  .modern-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.75rem 1rem;
  }

  .modern-panel-body::-webkit-scrollbar {
    width: 6px;
  }

  .modern-panel-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .modern-panel-body::-webkit-scrollbar-thumb {
    background: rgba(99, 102, 241, 0.2);
    border-radius: 3px;
  }

  .modern-panel-body::-webkit-scrollbar-thumb:hover {
    background: rgba(99, 102, 241, 0.3);
  }

  /* ========================================
     COLLAPSIBLE SECTIONS - Main Content Sections
     ======================================== */

  .modern-settings-section-container {
    margin: 0.5rem 0.5rem;
    background: white;
    border: 1.5px solid rgba(99, 102, 241, 0.08);
    border-radius: 14px;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .modern-settings-section-container:hover {
    border-color: rgba(99, 102, 241, 0.15);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.06);
  }

  .modern-section-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modern-section-header:hover {
    background: rgba(99, 102, 241, 0.03);
  }

  .modern-section-title-area {
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  .modern-section-icon {
    font-size: 1.375rem;
  }

  .modern-section-title {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    letter-spacing: -0.01em;
  }

  .modern-section-chevron {
    font-size: 1.5rem;
    color: #9ca3af;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .modern-section-chevron.expanded {
    transform: rotate(90deg);
    color: #6366f1;
  }

  .modern-section-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .modern-section-content.expanded {
    max-height: 2000px;
  }

  .modern-section-inner {
    padding: 0 1.25rem 1.25rem;
  }

  /* ========================================
     SUBSECTIONS - Category Groups
     ======================================== */

  .modern-subsection {
    margin-bottom: 1.5rem;
  }

  .modern-subsection:last-child {
    margin-bottom: 0;
  }

  .modern-subsection-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.075em;
    color: #6366f1;
    margin-bottom: 0.75rem;
  }

  .modern-subsection-title.danger {
    color: #dc2626;
  }

  /* ========================================
     DANGER ZONE - Irreversible Actions
     ======================================== */

  .modern-danger-zone {
    margin-top: 1.5rem;
    padding: 1.25rem;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 38, 38, 0.08) 100%);
    border: 2px solid rgba(239, 68, 68, 0.25);
    border-radius: 12px;
  }

  .modern-danger-zone-header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .modern-danger-icon {
    font-size: 1.75rem;
    flex-shrink: 0;
  }

  .modern-danger-desc {
    font-size: 0.8125rem;
    color: #dc2626;
    margin-top: 0.25rem;
    font-weight: 500;
  }

  /* ========================================
     SETTING ROWS & COLUMNS - Layout for Settings
     ======================================== */

  .modern-setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  }

  .modern-setting-row:last-child {
    border-bottom: none;
  }

  .modern-setting-column {
    padding: 0.875rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  }

  .modern-setting-column:last-child {
    border-bottom: none;
  }

  .modern-setting-info {
    flex: 1;
  }

  .modern-setting-label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.25rem;
    display: block;
  }

  .modern-setting-desc {
    font-size: 0.8125rem;
    color: #9ca3af;
    line-height: 1.4;
    margin-top: 0.25rem;
  }

  /* ========================================
     TOGGLE SWITCH - Toggle Component
     ======================================== */

  .modern-toggle-switch {
    position: relative;
    width: 52px;
    height: 28px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .modern-toggle-input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .modern-toggle-slider {
    position: absolute;
    inset: 0;
    background: #e5e7eb;
    border-radius: 28px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .modern-toggle-slider.checked {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  }

  .modern-toggle-thumb {
    position: absolute;
    height: 24px;
    width: 24px;
    left: 2px;
    bottom: 2px;
    background: white;
    border-radius: 50%;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .modern-toggle-slider.checked .modern-toggle-thumb {
    transform: translateX(24px);
    box-shadow: 0 3px 12px rgba(99, 102, 241, 0.4);
  }

  /* ========================================
     SELECT DROPDOWN - Select Element
     ======================================== */

  .modern-select {
    width: 100%;
    padding: 0.75rem 1rem;
    margin-top: 0.5rem;
    background: white;
    border: 1.5px solid rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    font-size: 0.9375rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modern-select:hover {
    border-color: rgba(99, 102, 241, 0.3);
  }

  .modern-select:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  /* ========================================
     ACTION BUTTONS - Primary Action Buttons
     ======================================== */

  .modern-action-button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem 1rem;
    margin-bottom: 0.625rem;
    background: white;
    border: 1.5px solid rgba(0, 0, 0, 0.08);
    border-radius: 10px;
    font-size: 0.9375rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .modern-action-button:last-child {
    margin-bottom: 0;
  }

  .modern-action-button:hover {
    background: #f9fafb;
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  .modern-action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Button Variants */
  .modern-action-button.primary {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    border-color: transparent;
    color: white;
    font-weight: 600;
  }

  .modern-action-button.primary:hover {
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
    transform: translateY(-1px);
  }

  .modern-action-button.accent {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(251, 191, 36, 0.1) 100%);
    border-color: rgba(245, 158, 11, 0.3);
    color: #b45309;
  }

  .modern-action-button.accent:hover {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(251, 191, 36, 0.15) 100%);
    border-color: rgba(245, 158, 11, 0.5);
  }

  .modern-action-button.danger {
    background: rgba(239, 68, 68, 0.06);
    border-color: rgba(239, 68, 68, 0.2);
    color: #dc2626;
  }

  .modern-action-button.danger:hover {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.4);
  }

  .modern-action-button.danger-full {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    border: 2px solid #991b1b;
    color: white;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
  }

  .modern-action-button.danger-full:hover {
    background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
    border-color: #7f1d1d;
    box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4);
    transform: translateY(-1px);
  }

  .modern-action-button.small {
    padding: 0.75rem 0.875rem;
    font-size: 0.875rem;
  }

  .modern-button-icon {
    font-size: 1.125rem;
    flex-shrink: 0;
  }

  .modern-button-text {
    flex: 1;
    text-align: left;
  }

  /* ========================================
     BUTTON GROUPS - Multiple Buttons
     ======================================== */

  .modern-button-group {
    display: flex;
    gap: 0.625rem;
  }

  .modern-button-group .modern-action-button {
    flex: 1;
  }

  /* Inline Buttons (for home address editing) */
  .modern-inline-button-group {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
    align-items: center;
  }

  .modern-inline-button {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    background: white;
    border: 1.5px solid;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .modern-inline-button.primary {
    color: #6366f1;
    border-color: rgba(99, 102, 241, 0.3);
  }

  .modern-inline-button.primary:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.5);
  }

  .modern-inline-button.danger {
    color: #dc2626;
    border-color: rgba(220, 38, 38, 0.3);
  }

  .modern-inline-button.danger:hover {
    background: rgba(220, 38, 38, 0.1);
    border-color: rgba(220, 38, 38, 0.5);
  }

  /* ========================================
     LINK BUTTONS - External Link Buttons
     ======================================== */

  .modern-link-group {
    display: flex;
    gap: 0.625rem;
    margin-top: 0.625rem;
  }

  .modern-link-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 0.875rem;
    background: white;
    border: 1.5px solid rgba(0, 0, 0, 0.08);
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modern-link-button:hover {
    background: #f9fafb;
    border-color: rgba(99, 102, 241, 0.3);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  /* ========================================
     STORAGE CARD - Storage Usage Display
     ======================================== */

  .modern-storage-card {
    padding: 1rem;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.03) 100%);
    border: 1.5px solid rgba(99, 102, 241, 0.15);
    border-radius: 12px;
    margin: 0.875rem 0;
  }

  .modern-storage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.625rem;
  }

  .modern-storage-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6366f1;
  }

  .modern-storage-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111827;
  }

  .modern-storage-bar {
    height: 8px;
    background: rgba(0, 0, 0, 0.06);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .modern-storage-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%);
    border-radius: 8px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .modern-storage-fill.warning {
    background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
  }

  .modern-storage-percent {
    font-size: 0.8125rem;
    color: #6b7280;
    text-align: right;
  }

  /* ========================================
     FEATURE BUTTON - Large Feature Blocks
     ======================================== */

  .modern-feature-button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.125rem 1.25rem;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.03) 100%);
    border: 1.5px solid rgba(99, 102, 241, 0.15);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .modern-feature-button:hover {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%);
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.12);
  }

  .modern-feature-content {
    flex: 1;
  }

  .modern-feature-title {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.25rem;
  }

  .modern-feature-desc {
    font-size: 0.8125rem;
    color: #6b7280;
    line-height: 1.4;
  }

  .modern-feature-arrow {
    font-size: 1.25rem;
    color: #9ca3af;
    transition: transform 0.2s;
  }

  .modern-feature-button:hover .modern-feature-arrow {
    transform: translateX(4px);
    color: #6366f1;
  }

  /* ========================================
     PANEL FOOTER - Bottom Information
     ======================================== */

  .modern-panel-footer {
    padding: 1rem 1.75rem;
    background: rgba(99, 102, 241, 0.02);
    border-top: 1px solid rgba(99, 102, 241, 0.08);
  }

  .modern-footer-text {
    font-size: 0.75rem;
    color: #9ca3af;
    text-align: center;
    line-height: 1.5;
  }

  /* ========================================
     DARK MODE SUPPORT - All Dark Mode Styles
     ======================================== */

  .dark-mode .modern-settings-trigger {
    background: linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 1) 100%);
    border-color: rgba(139, 92, 246, 0.2);
    color: #e5e7eb;
  }

  .dark-mode .modern-settings-trigger:hover {
    background: linear-gradient(135deg, rgba(31, 41, 55, 1) 0%, rgba(17, 24, 39, 1) 100%);
    border-color: rgba(139, 92, 246, 0.4);
  }

  .dark-mode .modern-settings-panel {
    background: linear-gradient(135deg, rgba(17, 24, 39, 0.98) 0%, rgba(31, 41, 55, 0.98) 100%);
    border-color: rgba(139, 92, 246, 0.15);
  }

  .dark-mode .modern-panel-header {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
    border-bottom-color: rgba(139, 92, 246, 0.15);
  }

  .dark-mode .modern-panel-title,
  .dark-mode .modern-section-title,
  .dark-mode .modern-setting-label,
  .dark-mode .modern-feature-title,
  .dark-mode .modern-storage-value {
    color: #f9fafb;
  }

  .dark-mode .modern-panel-subtitle,
  .dark-mode .modern-setting-desc,
  .dark-mode .modern-feature-desc,
  .dark-mode .modern-footer-text {
    color: #9ca3af;
  }

  .dark-mode .modern-settings-section-container {
    background: rgba(17, 24, 39, 0.6);
    border-color: rgba(139, 92, 246, 0.15);
  }

  .dark-mode .modern-section-header:hover {
    background: rgba(99, 102, 241, 0.05);
  }

  .dark-mode .modern-setting-row,
  .dark-mode .modern-setting-column {
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }

  .dark-mode .modern-action-button,
  .dark-mode .modern-link-button {
    background: rgba(17, 24, 39, 0.8);
    border-color: rgba(255, 255, 255, 0.1);
    color: #e5e7eb;
  }

  .dark-mode .modern-action-button:hover,
  .dark-mode .modern-link-button:hover {
    background: rgba(17, 24, 39, 0.95);
    border-color: rgba(139, 92, 246, 0.4);
  }

  .dark-mode .modern-select {
    background: rgba(17, 24, 39, 0.8);
    border-color: rgba(255, 255, 255, 0.1);
    color: #e5e7eb;
  }

  .dark-mode .modern-storage-card {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%);
    border-color: rgba(99, 102, 241, 0.25);
  }

  .dark-mode .modern-storage-bar {
    background: rgba(0, 0, 0, 0.3);
  }

  .dark-mode .modern-feature-button {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%);
    border-color: rgba(99, 102, 241, 0.25);
  }

  .dark-mode .modern-feature-button:hover {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.12) 100%);
    border-color: rgba(99, 102, 241, 0.4);
  }

  .dark-mode .modern-close-button {
    background: rgba(17, 24, 39, 0.8);
    border-color: rgba(255, 255, 255, 0.1);
    color: #9ca3af;
  }

  .dark-mode .modern-close-button:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: #ef4444;
    color: #ef4444;
  }

  /* ========================================
     RESPONSIVE DESIGN - Mobile & Tablet
     ======================================== */

  @media (max-width: 768px) {
    .modern-settings-dropdown {
      position: static;
    }

    .modern-settings-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      right: auto;
      bottom: auto;
      transform: translate(-50%, -50%);
      width: calc(100vw - 2rem);
      max-width: 420px;
      max-height: 85vh;
      z-index: 999999;
    }

    @keyframes modernSlideIn {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.92);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }

    .modern-panel-header {
      padding: 1.5rem 1.25rem 1rem;
    }

    .modern-panel-title {
      font-size: 1.375rem;
    }

    .modern-section-inner {
      padding: 0 1rem 1rem;
    }

    .modern-settings-trigger {
      padding: 0.625rem 1rem;
      font-size: 0.875rem;
    }

    .modern-trigger-icon {
      font-size: 1.125rem;
    }
  }

  /* Mobile Overlay Background */
  @media (max-width: 768px) {
    .modern-settings-panel::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: -1;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  }
`;

/**
 * Export a function to inject styles into the document
 * This can be used if we ever need to dynamically add/remove styles
 */
export function injectSettingsStyles(): void {
  // Check if styles are already injected
  if (document.getElementById('settings-styles')) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = 'settings-styles';
  styleElement.innerHTML = SETTINGS_STYLES;
  document.head.appendChild(styleElement);
}

/**
 * Export individual CSS sections for modular usage if needed
 * (Can be used for CSS-in-JS frameworks in the future)
 */
export const SETTINGS_STYLE_SECTIONS = {
  layout: {
    dropdown: '.modern-settings-dropdown { position: relative; display: inline-block; }',
  },
  trigger: {
    button: '.modern-settings-trigger { display: flex; align-items: center; }',
  },
  panel: {
    main: '.modern-settings-panel { position: absolute; }',
    header: '.modern-panel-header { display: flex; }',
    body: '.modern-panel-body { flex: 1; overflow-y: auto; }',
    footer: '.modern-panel-footer { padding: 1rem 1.75rem; }',
  },
  sections: {
    container: '.modern-settings-section-container { margin: 0.5rem 0.5rem; }',
    header: '.modern-section-header { width: 100%; display: flex; }',
    content: '.modern-section-content { max-height: 0; overflow: hidden; }',
  },
  buttons: {
    action: '.modern-action-button { width: 100%; display: flex; }',
    toggle: '.modern-toggle-slider { position: absolute; inset: 0; }',
    feature: '.modern-feature-button { width: 100%; display: flex; }',
  },
  storage: {
    card: '.modern-storage-card { padding: 1rem; }',
  },
  darkMode: {
    trigger: '.dark-mode .modern-settings-trigger { background: linear-gradient(...); }',
    panel: '.dark-mode .modern-settings-panel { background: linear-gradient(...); }',
  },
  responsive: {
    mobile: '@media (max-width: 768px) { .modern-settings-dropdown { position: static; } }',
  },
};
