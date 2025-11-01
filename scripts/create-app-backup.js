/**
 * Create App Backup from Cleaned Operations
 *
 * Converts the cleaned operations into a backup file format
 * that can be uploaded/restored in the Navigator app.
 */

import fs from 'fs';
import path from 'path';

const INPUT_FILE = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_operations_CLEANED.json');
const OUTPUT_FILE = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_backup_RESTORED.json');

console.log('📦 Creating App Backup File\n');
console.log('═══════════════════════════════════════════\n');

// Step 1: Read cleaned operations
console.log('📖 Step 1: Reading cleaned operations...');
const operations = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
console.log(`✅ Loaded ${operations.length} operations\n`);

// Step 2: Extract data from operations and reconstruct state
console.log('🔄 Step 2: Reconstructing state from operations...\n');

const state = {
  addresses: [],
  completions: [],
  arrangements: [],
  daySessions: [],
  currentListVersion: 1,
  settings: {
    reminderTime: null,
    subscriptionDueDate: null,
    bonusSettings: {
      enabled: false,
      type: 'simple'
    }
  },
  activeIndex: null,
  activeStartTime: null
};

const stats = {
  completions: 0,
  arrangements: 0,
  sessions: 0,
  addresses: 0,
  other: 0
};

// Process each operation to rebuild state
operations.forEach(op => {
  try {
    // Parse the operation data
    let payload;
    if (typeof op.data === 'string') {
      payload = JSON.parse(op.data);
    } else if (typeof op.operation_data === 'string') {
      const opData = JSON.parse(op.operation_data);
      payload = opData.payload;
    } else {
      payload = op.data || op.payload;
    }

    switch (op.type) {
      case 'COMPLETION_CREATE':
        if (payload.completion) {
          state.completions.push(payload.completion);
          stats.completions++;
        }
        break;

      case 'COMPLETION_UPDATE':
        if (payload.index !== undefined && payload.updates) {
          const idx = payload.index;
          if (state.completions[idx]) {
            Object.assign(state.completions[idx], payload.updates);
          }
        }
        break;

      case 'ARRANGEMENT_CREATE':
        if (payload.arrangement) {
          state.arrangements.push(payload.arrangement);
          stats.arrangements++;
        }
        break;

      case 'SESSION_START':
        if (payload.session) {
          const existingIdx = state.daySessions.findIndex(s => s.date === payload.session.date);
          if (existingIdx >= 0) {
            state.daySessions[existingIdx] = payload.session;
          } else {
            state.daySessions.push(payload.session);
            stats.sessions++;
          }
        }
        break;

      case 'SESSION_END':
        if (payload.date && payload.endTime) {
          const session = state.daySessions.find(s => s.date === payload.date);
          if (session) {
            session.end = payload.endTime;
          }
        }
        break;

      case 'ADDRESS_BULK_IMPORT':
        if (payload.addresses && Array.isArray(payload.addresses)) {
          state.addresses = payload.addresses;
          state.currentListVersion = payload.listVersion || 1;
          stats.addresses = payload.addresses.length;
        }
        break;

      case 'SETTINGS_UPDATE_SUBSCRIPTION':
        if (payload.dueDate) {
          state.settings.subscriptionDueDate = payload.dueDate;
        }
        break;

      case 'SETTINGS_UPDATE_REMINDER':
        if (payload.reminderTime !== undefined) {
          state.settings.reminderTime = payload.reminderTime;
        }
        break;

      case 'SETTINGS_UPDATE_BONUS':
        if (payload.bonusSettings) {
          state.settings.bonusSettings = payload.bonusSettings;
        }
        break;

      case 'ACTIVE_INDEX_SET':
        if (payload.index !== undefined) {
          state.activeIndex = payload.index;
          state.activeStartTime = payload.startTime || null;
        }
        break;

      case 'ACTIVE_INDEX_CLEAR':
        state.activeIndex = null;
        state.activeStartTime = null;
        break;

      default:
        stats.other++;
        console.log(`   ⚠️  Unknown operation type: ${op.type}`);
    }
  } catch (error) {
    console.error(`   ❌ Error processing operation: ${op.type} - ${error.message}`);
  }
});

console.log('✅ State reconstructed successfully!\n');

// Step 3: Add metadata
const backup = {
  version: '1.0',
  exportedAt: new Date().toISOString(),
  source: 'cleaned_operations',
  state: state
};

// Step 4: Write backup file
console.log('💾 Step 3: Writing backup file...');
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(backup, null, 2), 'utf8');
console.log(`✅ Backup file created: ${OUTPUT_FILE}\n`);

// Step 5: Summary
console.log('═══════════════════════════════════════════\n');
console.log('📊 BACKUP SUMMARY\n');
console.log(`Addresses:     ${stats.addresses}`);
console.log(`Completions:   ${stats.completions}`);
console.log(`Arrangements:  ${stats.arrangements}`);
console.log(`Sessions:      ${stats.sessions}`);
console.log(`Other ops:     ${stats.other}`);
console.log();
console.log(`Total data items: ${stats.addresses + stats.completions + stats.arrangements + stats.sessions}`);
console.log();

// Step 6: File details
const fileStats = fs.statSync(OUTPUT_FILE);
const fileSizeKB = (fileStats.size / 1024).toFixed(2);
console.log(`Backup file size: ${fileSizeKB} KB\n`);

console.log('═══════════════════════════════════════════\n');
console.log('✅ BACKUP READY!\n');
console.log('📋 TO RESTORE IN APP:\n');
console.log('1. Open Navigator app\n');
console.log('2. Go to Settings tab\n');
console.log('3. Scroll to "Backup & Restore" section\n');
console.log('4. Click "Restore from File"\n');
console.log('5. Select this file:\n');
console.log(`   ${OUTPUT_FILE}\n`);
console.log('6. Confirm restore\n');
console.log('═══════════════════════════════════════════\n');
