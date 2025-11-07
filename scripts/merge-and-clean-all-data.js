/**
 * Merge and Clean All Operations Data
 *
 * Merges multiple operation exports, deduplicates, fixes sequences,
 * and creates a complete backup.
 */

import fs from 'fs';
import path from 'path';

const FILE1 = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_operations_rows.json');
const FILE2 = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_operations_rows (1).json');
const OUTPUT_CLEANED = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_operations_ALL_CLEANED.json');
const OUTPUT_BACKUP = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_backup_COMPLETE.json');

console.log('🔄 Merge and Clean All Operations Data\n');
console.log('═══════════════════════════════════════════\n');

// Step 1: Load both files
console.log('📖 Step 1: Loading operation files...\n');

let file1Data = [];
let file2Data = [];

try {
  file1Data = JSON.parse(fs.readFileSync(FILE1, 'utf8'));
  console.log(`✅ File 1: ${file1Data.length} operations`);
} catch (error) {
  console.log(`⚠️  File 1 not found or invalid`);
}

try {
  file2Data = JSON.parse(fs.readFileSync(FILE2, 'utf8'));
  console.log(`✅ File 2: ${file2Data.length} operations`);
} catch (error) {
  console.log(`⚠️  File 2 not found or invalid`);
}

const allOperations = [...file1Data, ...file2Data];
console.log(`\n📊 Total operations loaded: ${allOperations.length}\n`);

// Step 2: Deduplicate by ID
console.log('🔍 Step 2: Deduplicating by operation ID...\n');

const seen = new Set();
const uniqueOperations = [];
let duplicates = 0;

allOperations.forEach(op => {
  if (!seen.has(op.id)) {
    seen.add(op.id);
    uniqueOperations.push(op);
  } else {
    duplicates++;
  }
});

console.log(`✅ Unique operations: ${uniqueOperations.length}`);
console.log(`📉 Duplicates removed: ${duplicates}\n`);

// Step 3: Sort by timestamp (chronological order)
console.log('📅 Step 3: Sorting by timestamp...\n');

uniqueOperations.sort((a, b) => {
  const timeA = new Date(a.timestamp).getTime();
  const timeB = new Date(b.timestamp).getTime();
  return timeA - timeB;
});

console.log(`✅ Sorted ${uniqueOperations.length} operations chronologically\n`);

// Step 4: Group by device and renumber sequences
console.log('🔢 Step 4: Grouping by device and renumbering sequences...\n');

const deviceGroups = {};
uniqueOperations.forEach(op => {
  if (!deviceGroups[op.device_id]) {
    deviceGroups[op.device_id] = [];
  }
  deviceGroups[op.device_id].push(op);
});

console.log(`📦 Found ${Object.keys(deviceGroups).length} devices:\n`);

const cleanedOperations = [];
let corruptedSequences = 0;
const MAX_REASONABLE_SEQUENCE = 1000000;

Object.entries(deviceGroups).forEach(([deviceId, ops]) => {
  console.log(`   Device: ${deviceId.substring(0, 20)}`);
  console.log(`   Operations: ${ops.length}`);

  // Count corrupted sequences
  const corrupted = ops.filter(op => op.sequence_number > MAX_REASONABLE_SEQUENCE).length;
  corruptedSequences += corrupted;
  if (corrupted > 0) {
    console.log(`   ⚠️  Corrupted sequences: ${corrupted}`);
  }

  // Sort by timestamp within device
  ops.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Renumber sequences
  ops.forEach((op, index) => {
    const newSequence = index + 1;
    cleanedOperations.push({
      ...op,
      sequence_number: newSequence
    });
  });

  console.log(`   ✅ Renumbered to 1-${ops.length}\n`);
});

// Step 5: Validate sequences
console.log('✅ Step 5: Validating cleaned data...\n');

let validationPassed = true;
Object.entries(deviceGroups).forEach(([deviceId, _]) => {
  const deviceOps = cleanedOperations.filter(op => op.device_id === deviceId);
  const sequences = deviceOps.map(op => op.sequence_number).sort((a, b) => a - b);

  for (let i = 0; i < sequences.length; i++) {
    if (sequences[i] !== i + 1) {
      console.error(`   ❌ Device ${deviceId.substring(0, 10)}: Gap at sequence ${i + 1}`);
      validationPassed = false;
    }
  }
});

if (validationPassed) {
  console.log('✅ All sequences validated successfully!\n');
} else {
  console.error('❌ Validation failed!\n');
  process.exit(1);
}

// Step 6: Write cleaned operations
console.log('💾 Step 6: Writing cleaned operations file...');
fs.writeFileSync(OUTPUT_CLEANED, JSON.stringify(cleanedOperations, null, 2), 'utf8');
console.log(`✅ Written to: ${OUTPUT_CLEANED}\n`);

// Step 7: Reconstruct app state from operations
console.log('📦 Step 7: Reconstructing app state for backup...\n');

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
  updates: 0
};

cleanedOperations.forEach(op => {
  try {
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
            stats.updates++;
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
    }
  } catch (error) {
    // Skip invalid operations
  }
});

console.log('   Addresses:     ', stats.addresses);
console.log('   Completions:   ', stats.completions);
console.log('   Arrangements:  ', stats.arrangements);
console.log('   Sessions:      ', stats.sessions);
console.log('   Updates:       ', stats.updates);
console.log();

// Step 8: Write backup file
console.log('💾 Step 8: Writing complete backup file...');

const backup = {
  version: '1.0',
  exportedAt: new Date().toISOString(),
  source: 'merged_cleaned_operations',
  state: state
};

fs.writeFileSync(OUTPUT_BACKUP, JSON.stringify(backup, null, 2), 'utf8');
console.log(`✅ Written to: ${OUTPUT_BACKUP}\n`);

// Step 9: Summary
console.log('═══════════════════════════════════════════\n');
console.log('📊 FINAL SUMMARY\n');
console.log(`Total operations merged:       ${allOperations.length}`);
console.log(`Duplicates removed:            ${duplicates}`);
console.log(`Unique operations:             ${uniqueOperations.length}`);
console.log(`Corrupted sequences fixed:     ${corruptedSequences}`);
console.log(`Devices processed:             ${Object.keys(deviceGroups).length}`);
console.log();
console.log('📦 Data in backup:');
console.log(`   Addresses:     ${stats.addresses}`);
console.log(`   Completions:   ${stats.completions}`);
console.log(`   Arrangements:  ${stats.arrangements}`);
console.log(`   Sessions:      ${stats.sessions}`);
console.log();

const backupSizeKB = (fs.statSync(OUTPUT_BACKUP).size / 1024).toFixed(2);
console.log(`Backup file size: ${backupSizeKB} KB\n`);

console.log('═══════════════════════════════════════════\n');
console.log('✅ COMPLETE BACKUP READY!\n');
console.log('📁 Files created:\n');
console.log(`1. Cleaned operations (for Supabase upload):`);
console.log(`   ${OUTPUT_CLEANED}\n`);
console.log(`2. Complete backup (for app restore):`);
console.log(`   ${OUTPUT_BACKUP}\n`);
console.log('📋 Use the backup file to restore in your app!\n');
console.log('═══════════════════════════════════════════\n');
