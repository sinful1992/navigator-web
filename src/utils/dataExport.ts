// src/utils/dataExport.ts
// GDPR-compliant data export utilities

import type { AppState } from '../types';

import { logger } from './logger';

/**
 * Export all user data as JSON (GDPR Article 20 - Right to Data Portability)
 */
export function exportDataAsJSON(state: AppState, userEmail?: string): void {
  const exportData = {
    exportedAt: new Date().toISOString(),
    exportedBy: userEmail || 'unknown',
    version: '1.0',
    dataController: 'User (you are responsible for this data)',
    dataProcessor: 'Navigator Web',

    // User's work data
    addresses: state.addresses || [],
    completions: state.completions || [],
    arrangements: state.arrangements || [],
    daySessions: state.daySessions || [],

    // Metadata
    currentListVersion: state.currentListVersion || 1,
    subscription: state.subscription || null,

    // Privacy notice
    privacyNotice: {
      message: 'This export contains all your data stored in Navigator Web.',
      gdprRights: 'You have the right to access, rectify, erase, restrict, port, and object to processing of this data.',
      dataController: 'You are the data controller for customer/debtor information',
      contact: 'For questions: See PRIVACY.md'
    }
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `navigator-data-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export completions as CSV for analysis
 */
export function exportCompletionsAsCSV(state: AppState): void {
  const completions = state.completions || [];

  if (completions.length === 0) {
    alert('No completions to export');
    return;
  }

  // CSV headers
  const headers = [
    'Date',
    'Time',
    'Address',
    'Outcome',
    'Amount',
    'Case Reference',
    'Time Spent (minutes)',
    'Latitude',
    'Longitude',
    'List Version',
    'Arrangement ID'
  ];

  // Convert completions to CSV rows
  const rows = completions.map(c => {
    const date = new Date(c.timestamp);
    const timeSpentMinutes = c.timeSpentSeconds ? Math.round(c.timeSpentSeconds / 60) : '';

    return [
      date.toLocaleDateString(),
      date.toLocaleTimeString(),
      `"${(c.address || '').replace(/"/g, '""')}"`, // Escape quotes
      c.outcome,
      c.amount || '',
      c.caseReference || '',
      timeSpentMinutes,
      c.lat || '',
      c.lng || '',
      c.listVersion || '',
      c.arrangementId || ''
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `navigator-completions-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export arrangements as CSV
 */
export function exportArrangementsAsCSV(state: AppState): void {
  const arrangements = state.arrangements || [];

  if (arrangements.length === 0) {
    alert('No arrangements to export');
    return;
  }

  const headers = [
    'ID',
    'Customer Name',
    'Phone Number',
    'Address',
    'Scheduled Date',
    'Scheduled Time',
    'Status',
    'Amount',
    'Initial Payment',
    'Notes',
    'Created At',
    'Updated At',
    'Recurrence Type',
    'Total Payments',
    'Payments Made'
  ];

  const rows = arrangements.map(a => [
    a.id,
    `"${(a.customerName || '').replace(/"/g, '""')}"`,
    a.phoneNumber || '',
    `"${(a.address || '').replace(/"/g, '""')}"`,
    a.scheduledDate,
    a.scheduledTime || '',
    a.status,
    a.amount || '',
    a.initialPaymentAmount || '',
    `"${(a.notes || '').replace(/"/g, '""')}"`,
    a.createdAt,
    a.updatedAt,
    a.recurrenceType || 'none',
    a.totalPayments || '',
    a.paymentsMade || ''
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `navigator-arrangements-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Calculate and display storage usage
 */
export async function getStorageInfo(): Promise<{
  used: number;
  quota: number;
  percentage: number;
  usedMB: string;
  quotaMB: string;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? Math.round((used / quota) * 100) : 0;

    return {
      used,
      quota,
      percentage,
      usedMB: (used / 1024 / 1024).toFixed(2),
      quotaMB: (quota / 1024 / 1024).toFixed(2)
    };
  }

  return {
    used: 0,
    quota: 0,
    percentage: 0,
    usedMB: '0.00',
    quotaMB: '0.00'
  };
}

/**
 * Clear all local caches (geocoding, map tiles)
 */
export async function clearLocalCaches(): Promise<void> {
  try {
    // Clear geocoding cache from IndexedDB (this is where it's actually stored)
    const { del } = await import('idb-keyval');
    await del('geocode-cache');
    logger.info('Cleared geocoding cache from IndexedDB');

    // Also clear the in-memory cache in the geocoding service
    const { clearGeocodingCache } = await import('../services/geocoding');
    await clearGeocodingCache();

    // Clear any legacy localStorage entries
    const geocodingKeys = Object.keys(localStorage).filter(k => k.startsWith('geocoding_cache_'));
    geocodingKeys.forEach(key => localStorage.removeItem(key));

    // Clear map tile cache if using service worker
    let mapCachesCleared = 0;
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const mapCaches = cacheNames.filter(name => name.includes('map') || name.includes('tile'));
      await Promise.all(mapCaches.map(name => caches.delete(name)));
      mapCachesCleared = mapCaches.length;
    }

    alert(`Cache cleared! Please refresh the page to complete.`);
  } catch (error) {
    logger.error('Failed to clear caches:', error);
    alert('Failed to clear some caches. See console for details.');
  }
}
