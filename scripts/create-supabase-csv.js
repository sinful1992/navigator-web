/**
 * Create Supabase CSV from All Operation Files
 *
 * Merges all operation exports, deduplicates, fixes sequences,
 * and creates a CSV file for direct Supabase upload.
 */

import fs from 'fs';
import path from 'path';

const FILES = [
  'navigator_operations_rows.json',
  'navigator_operations_rows (1).json',
  'navigator_operations_rows (2).json',
  'navigator_operations_rows (3).json',
  'navigator_operations_rows (4).json',
  'navigator_operations_rows (5).json'
];

const DOWNLOADS = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads');
const OUTPUT_CSV = path.join(DOWNLOADS, 'navigator_operations_UPLOAD.csv');
const MAX_REASONABLE_SEQUENCE = 1000000;

console.log('📊 Create Supabase CSV from All Operations\n');
console.log('═══════════════════════════════════════════\n');

// Step 1: Load all files
console.log('📖 Step 1: Loading all operation files...\n');

let allOperations = [];
let filesLoaded = 0;

FILES.forEach(filename => {
  const filepath = path.join(DOWNLOADS, filename);
  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    console.log(`✅ ${filename}: ${data.length} operations`);
    allOperations = allOperations.concat(data);
    filesLoaded++;
  } catch (error) {
    console.log(`⚠️  ${filename}: Not found or invalid`);
  }
});

console.log(`\n📊 Files loaded: ${filesLoaded}`);
console.log(`📊 Total operations: ${allOperations.length}\n`);

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

// Step 4: Group by USER (not device!) and renumber sequences
console.log('🔢 Step 4: Grouping by USER and renumbering sequences...\n');
console.log('⚠️  Note: Sequences must be unique per USER (not per device)\n');

// Group by user_id
const userGroups = {};
uniqueOperations.forEach(op => {
  if (!userGroups[op.user_id]) {
    userGroups[op.user_id] = [];
  }
  userGroups[op.user_id].push(op);
});

console.log(`👥 Found ${Object.keys(userGroups).length} users:\n`);

const cleanedOperations = [];
let corruptedSequences = 0;

Object.entries(userGroups).forEach(([userId, ops]) => {
  console.log(`   User: ${userId}`);
  console.log(`   Total operations: ${ops.length}`);

  // Count devices for this user
  const devices = new Set(ops.map(op => op.device_id));
  console.log(`   Devices: ${devices.size}`);

  // Count corrupted sequences
  const corrupted = ops.filter(op => op.sequence_number > MAX_REASONABLE_SEQUENCE).length;
  corruptedSequences += corrupted;
  if (corrupted > 0) {
    console.log(`   ⚠️  Corrupted sequences: ${corrupted}`);
  }

  // Sort by timestamp (already sorted globally, but ensure per-user)
  ops.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Renumber sequences for this user (continuous across all devices)
  ops.forEach((op, index) => {
    const newSequence = index + 1;
    cleanedOperations.push({
      ...op,
      sequence_number: newSequence
    });
  });

  console.log(`   ✅ Renumbered to 1-${ops.length} (across all devices)\n`);
});

// Step 5: Create CSV
console.log('💾 Step 5: Creating CSV file...\n');

// CSV Header - matching Supabase table structure
const headers = [
  'user_id',
  'device_id',
  'sequence_number',
  'operation_id',
  'type',
  'entity',
  'entity_id',
  'data',
  'timestamp',
  'local_timestamp',
  'operation_type',
  'operation_data',
  'client_id',
  'applied'
];

// Helper function to escape CSV values
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}

// Build CSV content
let csvContent = headers.join(',') + '\n';

cleanedOperations.forEach(op => {
  const row = [
    escapeCsvValue(op.user_id),
    escapeCsvValue(op.device_id),
    escapeCsvValue(op.sequence_number),
    escapeCsvValue(op.operation_id),
    escapeCsvValue(op.type),
    escapeCsvValue(op.entity),
    escapeCsvValue(op.entity_id),
    escapeCsvValue(op.data),
    escapeCsvValue(op.timestamp),
    escapeCsvValue(op.local_timestamp),
    escapeCsvValue(op.operation_type),
    escapeCsvValue(op.operation_data),
    escapeCsvValue(op.client_id),
    escapeCsvValue(op.applied || false)
  ];

  csvContent += row.join(',') + '\n';
});

// Write CSV file
fs.writeFileSync(OUTPUT_CSV, csvContent, 'utf8');

console.log(`✅ CSV file created: ${OUTPUT_CSV}\n`);

// Step 6: Summary
const csvSizeKB = (fs.statSync(OUTPUT_CSV).size / 1024).toFixed(2);

console.log('═══════════════════════════════════════════\n');
console.log('📊 FINAL SUMMARY\n');
console.log(`Files processed:               ${filesLoaded}`);
console.log(`Total operations merged:       ${allOperations.length}`);
console.log(`Duplicates removed:            ${duplicates}`);
console.log(`Unique operations:             ${uniqueOperations.length}`);
console.log(`Corrupted sequences fixed:     ${corruptedSequences}`);
console.log(`Users processed:               ${Object.keys(userGroups).length}`);
console.log();
console.log(`CSV file size: ${csvSizeKB} KB\n`);

console.log('═══════════════════════════════════════════\n');
console.log('✅ CSV READY FOR SUPABASE UPLOAD!\n');
console.log('📋 UPLOAD INSTRUCTIONS:\n');
console.log('1. Go to Supabase Dashboard\n');
console.log('2. Navigate to Table Editor → navigator_operations\n');
console.log('3. Click "Insert" → "Import data from CSV"\n');
console.log('4. Select this file:\n');
console.log(`   ${OUTPUT_CSV}\n`);
console.log('5. Map columns (should auto-detect)\n');
console.log('6. Click "Import"\n');
console.log('7. Verify sync works in your app!\n');
console.log('═══════════════════════════════════════════\n');

// User breakdown
console.log('👥 USER BREAKDOWN:\n');
Object.entries(userGroups).forEach(([userId, ops]) => {
  const userOps = cleanedOperations.filter(op => op.user_id === userId);
  const devices = [...new Set(userOps.map(op => op.device_id))];

  console.log(`User: ${userId}`);
  console.log(`  Operations: ${userOps.length}`);
  console.log(`  Sequences: 1-${userOps.length} (continuous across all devices)`);
  console.log(`  Devices (${devices.length}):`);

  devices.forEach(deviceId => {
    const deviceOps = userOps.filter(op => op.device_id === deviceId);
    console.log(`    - ${deviceId}: ${deviceOps.length} operations`);
  });
  console.log();
});

console.log('═══════════════════════════════════════════\n');
