// src/hooks/useSettingsDropdown.ts
// State management hook for SettingsDropdown component
// PHASE 2 Task 2: Extracted state management for cleaner composition

import { useState, useRef, useEffect } from 'react';
import { getStorageInfo } from '../utils/dataExport';

export interface StorageInfo {
  usedMB: string;
  quotaMB: string;
  percentage: number;
}

export interface UseSettingsDropdownState {
  isOpen: boolean;
  showSMSSettings: boolean;
  showBonusSettings: boolean;
  showSyncDebug: boolean;
  storageInfo: StorageInfo | null;
  expandedSection: string | null;
  isEditingHomeAddress: boolean;
  tempHomeAddress: string;
}

export interface UseSettingsDropdownActions {
  toggleDropdown: () => void;
  openDropdown: () => void;
  closeDropdown: () => void;
  toggleSection: (section: string) => void;
  showSMSModal: () => void;
  hideSMSModal: () => void;
  showBonusModal: () => void;
  hideBonusModal: () => void;
  showSyncDebugModal: () => void;
  hideSyncDebugModal: () => void;
  setTempHomeAddress: (address: string) => void;
  startEditingHomeAddress: () => void;
  stopEditingHomeAddress: () => void;
  refreshStorageInfo: () => Promise<void>;
}

/**
 * useSettingsDropdown - State management for SettingsDropdown component
 *
 * Manages:
 * - Dropdown open/close state
 * - Modal visibility states (SMS, Bonus, Sync Debug)
 * - Section expansion states
 * - Home address editing state
 * - Storage info caching with manual refresh
 *
 * @returns Object with state and action functions
 */
export function useSettingsDropdown() {
  // Dropdown state
  const [isOpen, setIsOpen] = useState(false);

  // Modal visibility states
  const [showSMSSettings, setShowSMSSettings] = useState(false);
  const [showBonusSettings, setShowBonusSettings] = useState(false);
  const [showSyncDebug, setShowSyncDebug] = useState(false);

  // Section expansion state
  const [expandedSection, setExpandedSection] = useState<string | null>('general');

  // Home address editing state
  const [isEditingHomeAddress, setIsEditingHomeAddress] = useState(false);
  const [tempHomeAddress, setTempHomeAddress] = useState('');

  // Storage info state (cached)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  // Refs for cleanup
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Load storage info when dropdown opens
  useEffect(() => {
    if (isOpen && !storageInfo) {
      getStorageInfo().then(setStorageInfo);
    }
  }, [isOpen, storageInfo]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setExpandedSection(null);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Action functions
  const toggleDropdown = () => setIsOpen(!isOpen);
  const openDropdown = () => setIsOpen(true);
  const closeDropdown = () => setIsOpen(false);

  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const showSMSModal = () => {
    setShowSMSSettings(true);
    setIsOpen(false);
  };

  const hideSMSModal = () => setShowSMSSettings(false);

  const showBonusModal = () => {
    setShowBonusSettings(true);
    setIsOpen(false);
  };

  const hideBonusModal = () => setShowBonusSettings(false);

  const showSyncDebugModal = () => {
    setShowSyncDebug(true);
    setIsOpen(false);
  };

  const hideSyncDebugModal = () => setShowSyncDebug(false);

  const startEditingHomeAddress = () => {
    setIsEditingHomeAddress(true);
  };

  const stopEditingHomeAddress = () => {
    setIsEditingHomeAddress(false);
    setTempHomeAddress('');
  };

  const refreshStorageInfo = async () => {
    setStorageInfo(null);
    setTimeout(() => getStorageInfo().then(setStorageInfo), 500);
  };

  // Current state
  const state: UseSettingsDropdownState = {
    isOpen,
    showSMSSettings,
    showBonusSettings,
    showSyncDebug,
    storageInfo,
    expandedSection,
    isEditingHomeAddress,
    tempHomeAddress
  };

  // Action functions
  const actions: UseSettingsDropdownActions = {
    toggleDropdown,
    openDropdown,
    closeDropdown,
    toggleSection,
    showSMSModal,
    hideSMSModal,
    showBonusModal,
    hideBonusModal,
    showSyncDebugModal,
    hideSyncDebugModal,
    setTempHomeAddress,
    startEditingHomeAddress,
    stopEditingHomeAddress,
    refreshStorageInfo
  };

  // Refs for DOM access
  const refs = {
    dropdownRef,
    panelBodyRef,
    fileInputRef,
    restoreInputRef
  };

  return { state, actions, refs };
}
