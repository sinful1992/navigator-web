#!/usr/bin/env node
/**
 * MERGE AND RESTORE BACKUP DATA
 *
 * This script:
 * 1. Reads all three backup sources (2 JSON backups + 1 CSV)
 * 2. Deduplicates completions by timestamp + address
 * 3. Creates a complete merged dataset
 * 4. Generates operations in the correct format for Supabase upload
 * 5. Creates an operations CSV ready to upload
 */

const fs = require('fs');
const path = require('path');

// Configuration
const BACKUPS = [
  'C:\\Users\\barku\\Downloads\\navigator-critical-manual-1760295590886.json',
  'C:\\Users\\barku\\Downloads\\navigator-data-export-2025-10-24.json'
];

const CSV_SOURCE = 'C:\\Users\\barku\\Downloads\\navigator_operations_UPLOAD.csv';
const OUTPUT_DIR = 'C:\\Users\\barku\\Downloads\\merged-backups';
const DEVICE_ID = 'device_1759740129742_r484otbli';
const USER_ID = 'ab4745db-2bfe-42f4-ac3a-239408a110aa';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('📊 MERGE AND RESTORE BACKUP DATA\n');
console.log('═'.repeat(60) + '\n');

// Step 1: Load JSON backups
console.log('📖 STEP 1: Loading JSON backups...\n');

const allCompletions = new Map(); // Key: timestamp+address, Value: completion object
const completionsByTimestamp = new Map(); // For deduplication

BACKUPS.forEach(backupPath => {
  try {
    const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const backupDate = data.created || 'unknown';
    console.log(`✅ Loaded: ${path.basename(backupPath)} (created: ${backupDate})`);

    if (data.data && data.data.completions) {
      data.data.completions.forEach(completion => {
        const key = `${completion.timestamp}|${completion.address}`;

        // Keep the most complete version (with amount, caseReference, etc)
        if (!allCompletions.has(key) ||
            (completion.amount && !allCompletions.get(key).amount)) {
          allCompletions.set(key, completion);
        }
      });
      console.log(`   ├─ Completions: ${data.data.completions.length}`);
      console.log(`   ├─ PIFs: ${data.data.completions.filter(c => c.outcome === 'PIF').length}`);
      console.log(`   ├─ Done: ${data.data.completions.filter(c => c.outcome === 'Done').length}`);
      console.log(`   ├─ DA: ${data.data.completions.filter(c => c.outcome === 'DA').length}`);
      console.log(`   └─ ARR: ${data.data.completions.filter(c => c.outcome === 'ARR').length}\n`);
    }
  } catch (error) {
    console.error(`❌ Error loading ${path.basename(backupPath)}:`, error.message);
  }
});

// Step 2: Parse CSV operations
console.log('📖 STEP 2: Parsing CSV operations...\n');

let csvCompletions = 0;
let csvPIFs = 0;
const csvLines = fs.readFileSync(CSV_SOURCE, 'utf8').split('\n');
const csvHeader = csvLines[0].split(',');

csvLines.slice(1).forEach((line, idx) => {
  if (!line.trim()) return;

  try {
    // CSV has operation_data as JSON field
    const parts = line.split('","');
    if (parts.length < 10) return;

    // Find operation_data field (usually around index 10)
    let operationDataStr = '';
    for (let i = 10; i < parts.length; i++) {
      operationDataStr += parts[i] + '","';
    }

    // Parse the JSON operation_data
    operationDataStr = operationDataStr.slice(0, -3); // Remove trailing ","

    try {
      const operationData = JSON.parse(operationDataStr);

      if (operationData.payload && operationData.payload.completion) {
        const completion = operationData.payload.completion;
        const key = `${completion.timestamp}|${completion.address}`;

        // CSV has more recent data - prefer it over backups
        if (!allCompletions.has(key) ||
            new Date(completion.timestamp) > new Date(allCompletions.get(key).timestamp)) {
          allCompletions.set(key, completion);
          csvCompletions++;
          if (completion.outcome === 'PIF') csvPIFs++;
        }
      }
    } catch (e) {
      // Skip malformed JSON
    }
  } catch (e) {
    // Skip malformed CSV lines
  }
});

console.log(`✅ Parsed CSV operations`);
console.log(`   ├─ New completions added: ${csvCompletions}`);
console.log(`   ├─ New PIFs added: ${csvPIFs}\n`);

// Step 3: Consolidate and deduplicate
console.log('🔄 STEP 3: Deduplicating completions...\n');

const mergedCompletions = Array.from(allCompletions.values());
const pifCount = mergedCompletions.filter(c => c.outcome === 'PIF').length;
const doneCount = mergedCompletions.filter(c => c.outcome === 'Done').length;
const daCount = mergedCompletions.filter(c => c.outcome === 'DA').length;
const arrCount = mergedCompletions.filter(c => c.outcome === 'ARR').length;

console.log(`✅ Merged dataset:`);
console.log(`   ├─ Total completions: ${mergedCompletions.length}`);
console.log(`   ├─ PIFs: ${pifCount}`);
console.log(`   ├─ Done: ${doneCount}`);
console.log(`   ├─ DA: ${daCount}`);
console.log(`   └─ ARR: ${arrCount}\n`);

// Calculate totals
const totalPIFAmount = mergedCompletions
  .filter(c => c.outcome === 'PIF' && c.amount)
  .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);

console.log(`💰 PIF earnings: £${totalPIFAmount.toFixed(2)}\n`);

// Step 4: Create merged backup JSON
console.log('💾 STEP 4: Creating merged backup JSON...\n');

// ✅ FIXED: Top-level structure for app compatibility (no data wrapper)
// The app's normalizeBackupData expects addresses, completions, etc. at top level
const mergedBackup = {
  // Core app state fields (required by normalizeBackupData)
  addresses: [], // Can be populated from completions if needed
  completions: mergedCompletions.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ),
  arrangements: [],
  daySessions: [],
  currentListVersion: 30,
  activeIndex: null,
  subscription: { status: 'active' },
  reminderSettings: { enabled: true },
  bonusSettings: { enabled: true },

  // Metadata for documentation (ignored by normalizeBackupData)
  _metadata: {
    version: "1.0",
    created: new Date().toISOString(),
    merged_from: [
      'navigator-critical-manual-1760295590886.json',
      'navigator-data-export-2025-10-24.json',
      'navigator_operations_UPLOAD.csv'
    ],
    dataIntegrity: {
      completionCount: mergedCompletions.length,
      pifCount: pifCount,
      totalAmount: totalPIFAmount.toFixed(2),
      dateRange: mergedCompletions.length > 0 ? {
        earliest: mergedCompletions[mergedCompletions.length - 1].timestamp.split('T')[0],
        latest: mergedCompletions[0].timestamp.split('T')[0]
      } : null
    }
  }
};

const mergedBackupPath = path.join(OUTPUT_DIR, 'navigator-merged-backup.json');
fs.writeFileSync(mergedBackupPath, JSON.stringify(mergedBackup, null, 2));
console.log(`✅ Created: navigator-merged-backup.json`);
console.log(`   Size: ${(fs.statSync(mergedBackupPath).size / 1024).toFixed(2)} KB\n`);

// Step 5: Create operations for upload
console.log('🔄 STEP 5: Creating operations for re-upload...\n');

const operations = [];
let sequence = 1;

// First, add ADDRESS_BULK_IMPORT
operations.push({
  user_id: USER_ID,
  device_id: DEVICE_ID,
  sequence_number: sequence++,
  operation_id: `op_${Date.now()}_bulk_import`,
  operation_type: 'ADDRESS_BULK_IMPORT',
  operation_data: JSON.stringify({
    id: `op_${Date.now()}_bulk_import`,
    type: 'ADDRESS_BULK_IMPORT',
    timestamp: new Date().toISOString(),
    clientId: DEVICE_ID,
    sequence: 1,
    payload: {
      addresses: [],
      newListVersion: 30,
      preserveCompletions: true
    }
  })
});

// Add all completions as COMPLETION_CREATE operations
mergedCompletions.forEach((completion, idx) => {
  operations.push({
    user_id: USER_ID,
    device_id: DEVICE_ID,
    sequence_number: sequence++,
    operation_id: `op_merged_${idx}_${Date.now()}`,
    operation_type: 'COMPLETION_CREATE',
    operation_data: JSON.stringify({
      id: `op_merged_${idx}_${Date.now()}`,
      type: 'COMPLETION_CREATE',
      timestamp: completion.timestamp,
      clientId: DEVICE_ID,
      sequence: sequence - 1,
      payload: {
        completion: completion
      }
    })
  });
});

console.log(`✅ Created ${operations.length} operations`);
console.log(`   ├─ ADDRESS_BULK_IMPORT: 1`);
console.log(`   └─ COMPLETION_CREATE: ${operations.length - 1}\n`);

// Step 6: Create CSV for upload
console.log('💾 STEP 6: Creating operations CSV for upload...\n');

const csvPath = path.join(OUTPUT_DIR, 'navigator_operations_MERGED.csv');
const csvContent = operations.map((op, idx) => {
  const data = typeof op.operation_data === 'string' ?
    JSON.parse(op.operation_data) : op.operation_data;

  return [
    op.user_id,
    op.device_id,
    op.sequence_number,
    op.operation_id,
    op.operation_type,
    'operation',
    data.timestamp,
    JSON.stringify(data),
    new Date().toISOString(),
    new Date().toISOString(),
    op.operation_type,
    JSON.stringify(data)
  ].map(v => `"${v}"`).join(',');
}).join('\n');

fs.writeFileSync(csvPath, csvContent);
console.log(`✅ Created: navigator_operations_MERGED.csv`);
console.log(`   Size: ${(fs.statSync(csvPath).size / 1024).toFixed(2)} KB`);
console.log(`   Rows: ${operations.length + 1}\n`);

// Step 7: Create restore instructions
console.log('📋 STEP 7: Creating restore instructions...\n');

const instructions = `
RESTORE INSTRUCTIONS
════════════════════════════════════════

⚠️ IMPORTANT: Back up your current data before restoring!

OPTION 1: Manual Upload via Supabase Dashboard
─────────────────────────────────────────────
1. Go to Supabase dashboard
2. Navigate to navigator_operations table
3. Click "Insert" → "Insert New Row"
4. Upload CSV: navigator_operations_MERGED.csv
5. Map columns correctly and insert

OPTION 2: Restore via Backup File
─────────────────────────────────
1. Open fieldnav.app in browser
2. Go to Settings
3. Click "Restore from Backup"
4. Select: navigator-merged-backup.json
5. Confirm restore

OPTION 3: Programmatic Upload (requires authentication)
───────────────────────────────────────────────────────
Use the Supabase CLI:
\`\`\`
supabase db push
# Then upload CSV via dashboard
\`\`\`

DATA SUMMARY
────────────────────────────────────────
Total Completions: ${mergedCompletions.length}
├─ PIFs: ${pifCount} (£${totalPIFAmount.toFixed(2)})
├─ Done: ${doneCount}
├─ DA: ${daCount}
└─ ARR: ${arrCount}

Date Range: ${mergedCompletions.length > 0 ?
  `${new Date(mergedCompletions[mergedCompletions.length-1].timestamp).toISOString().split('T')[0]} - ${new Date(mergedCompletions[0].timestamp).toISOString().split('T')[0]}`
  : 'N/A'}

FILES GENERATED
────────────────────────────────────────
✅ navigator-merged-backup.json
   └─ Complete state backup for restore
✅ navigator_operations_MERGED.csv
   └─ Operations CSV for Supabase upload

VERIFICATION CHECKLIST
────────────────────────────────────────
After restore:
☐ Navigate to Earnings tab
☐ Verify ${pifCount} PIFs showing
☐ Verify £${totalPIFAmount.toFixed(2)} in earnings
☐ Check daily breakdown shows correct dates
☐ Verify all ${mergedCompletions.length} completions present
☐ Test sync to another device
`;

const instructionsPath = path.join(OUTPUT_DIR, 'RESTORE_INSTRUCTIONS.txt');
fs.writeFileSync(instructionsPath, instructions);
console.log(instructions);

// Step 8: Summary
console.log('\n' + '═'.repeat(60));
console.log('✅ MERGE COMPLETE');
console.log('═'.repeat(60) + '\n');

console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);
console.log(`Generated files:`);
console.log(`  1. navigator-merged-backup.json (${(fs.statSync(mergedBackupPath).size / 1024).toFixed(2)} KB)`);
console.log(`  2. navigator_operations_MERGED.csv (${(fs.statSync(csvPath).size / 1024).toFixed(2)} KB)`);
console.log(`  3. RESTORE_INSTRUCTIONS.txt\n`);

console.log(`📊 Data merged from:`);
console.log(`  1. navigator-critical-manual-1760295590886.json`);
console.log(`  2. navigator-data-export-2025-10-24.json`);
console.log(`  3. navigator_operations_UPLOAD.csv\n`);

console.log(`✅ Ready for restore! Follow the instructions above.\n`);
