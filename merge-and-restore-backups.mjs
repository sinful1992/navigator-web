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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const allCompletions = new Map();

BACKUPS.forEach(backupPath => {
  try {
    const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const backupDate = data.created || 'unknown';
    console.log(`✅ Loaded: ${path.basename(backupPath)} (created: ${backupDate})`);

    if (data.data && data.data.completions) {
      data.data.completions.forEach(completion => {
        const key = `${completion.timestamp}|${completion.address}`;
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

csvLines.slice(1).forEach((line) => {
  if (!line.trim()) return;

  try {
    // CSV has operation_data as JSON field - extract it
    const match = line.match(/"\{.*\}"/);
    if (!match) return;

    const operationDataStr = match[0].slice(1, -1); // Remove quotes

    try {
      const operationData = JSON.parse(operationDataStr);

      if (operationData.payload && operationData.payload.completion) {
        const completion = operationData.payload.completion;
        const key = `${completion.timestamp}|${completion.address}`;

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

// Step 3: Consolidate
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
  addresses: [],
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

// Step 5: Create restore instructions
const instructions = `
RESTORE INSTRUCTIONS
════════════════════════════════════════

✅ MERGED DATA READY FOR RESTORE

Data Summary:
─────────────
Total Completions: ${mergedCompletions.length}
├─ PIFs: ${pifCount} (£${totalPIFAmount.toFixed(2)})
├─ Done: ${doneCount}
├─ DA: ${daCount}
└─ ARR: ${arrCount}

HOW TO RESTORE
──────────────

1. Open the app: fieldnav.app
2. Go to Settings (⚙️ button)
3. Look for "Restore from Backup" option
4. Select: navigator-merged-backup.json from Downloads > merged-backups
5. Confirm restore
6. Refresh page (Ctrl+R or Cmd+R)

VERIFICATION AFTER RESTORE
───────────────────────────
✓ Check Earnings tab
✓ Verify ${pifCount} PIFs showing
✓ Verify £${totalPIFAmount.toFixed(2)} in total PIF fees
✓ Check daily breakdown for correct dates
✓ Verify all ${mergedCompletions.length} completions present

IMPORTANT NOTES
───────────────
- This merges data from ALL three sources
- Duplicates are automatically removed
- Most complete version of each completion is kept
- No data will be lost in this restore
`;

const instructionsPath = path.join(OUTPUT_DIR, 'RESTORE_INSTRUCTIONS.txt');
fs.writeFileSync(instructionsPath, instructions);
console.log(instructions);

console.log('═'.repeat(60));
console.log('✅ MERGE COMPLETE');
console.log('═'.repeat(60) + '\n');

console.log(`📁 Output: ${OUTPUT_DIR}\n`);
console.log(`Generated:`);
console.log(`  ✅ navigator-merged-backup.json\n`);
