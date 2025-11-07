/**
 * Clean Operations Data Script
 *
 * Fixes corrupted sequence numbers in navigator_operations data:
 * 1. Removes operations with timestamp-based sequences (> 1,000,000)
 * 2. Renumbers sequences per device to be continuous (1, 2, 3...)
 * 3. Preserves chronological order (by timestamp)
 * 4. Exports cleaned data ready for Supabase upload
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_FILE = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_operations_rows.json');
const OUTPUT_FILE = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_operations_CLEANED.json');
const MAX_REASONABLE_SEQUENCE = 1000000;

// Statistics
const stats = {
  totalOriginal: 0,
  corruptedSequences: 0,
  remaining: 0,
  devicesProcessed: 0,
  errors: []
};

console.log('🧹 Navigator Operations Data Cleaner\n');
console.log('═══════════════════════════════════════════\n');

// Step 1: Read input file
console.log('📖 Step 1: Reading input file...');
let rawData;
try {
  rawData = fs.readFileSync(INPUT_FILE, 'utf8');
  console.log(`✅ File read successfully: ${INPUT_FILE}\n`);
} catch (error) {
  console.error(`❌ Error reading file: ${error.message}`);
  process.exit(1);
}

// Step 2: Parse JSON
console.log('🔍 Step 2: Parsing JSON...');
let operations;
try {
  operations = JSON.parse(rawData);
  stats.totalOriginal = operations.length;
  console.log(`✅ Parsed ${stats.totalOriginal} operations\n`);
} catch (error) {
  console.error(`❌ Error parsing JSON: ${error.message}`);
  process.exit(1);
}

// Step 3: Identify corrupted sequences (but keep all data!)
console.log('🔍 Step 3: Analyzing sequence numbers...');
operations.forEach(op => {
  if (op.sequence_number && op.sequence_number > MAX_REASONABLE_SEQUENCE) {
    stats.corruptedSequences++;
    console.log(`   ⚠️  Corrupted sequence: device=${op.device_id.substring(0, 10)}, seq=${op.sequence_number.toLocaleString()}, type=${op.type}`);
  }
});

console.log(`\n✅ Found ${stats.corruptedSequences} operations with corrupted sequences (will be renumbered)`);
console.log(`✅ Keeping ALL ${operations.length} operations - no data will be lost!\n`);

// Keep ALL operations
const validOperations = operations;

// Step 4: Group by device_id
console.log('📦 Step 4: Grouping by device...');
const deviceGroups = {};
validOperations.forEach(op => {
  if (!deviceGroups[op.device_id]) {
    deviceGroups[op.device_id] = [];
  }
  deviceGroups[op.device_id].push(op);
});

stats.devicesProcessed = Object.keys(deviceGroups).length;
console.log(`✅ Grouped into ${stats.devicesProcessed} devices:\n`);

Object.keys(deviceGroups).forEach(deviceId => {
  console.log(`   • ${deviceId.substring(0, 10)}: ${deviceGroups[deviceId].length} operations`);
});
console.log();

// Step 5: Renumber sequences per device
console.log('🔢 Step 5: Renumbering sequences...\n');
const cleanedOperations = [];

Object.entries(deviceGroups).forEach(([deviceId, ops]) => {
  console.log(`   Device: ${deviceId.substring(0, 10)}`);

  // Sort by timestamp to preserve chronological order
  ops.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Renumber starting from 1
  ops.forEach((op, index) => {
    const oldSequence = op.sequence_number;
    const newSequence = index + 1;

    cleanedOperations.push({
      ...op,
      sequence_number: newSequence
    });

    if (oldSequence !== newSequence) {
      console.log(`     ${oldSequence} → ${newSequence} (${op.type})`);
    }
  });

  console.log(`   ✅ Renumbered to 1-${ops.length}\n`);
});

stats.remaining = cleanedOperations.length;

// Step 6: Validate cleaned data
console.log('✅ Step 6: Validating cleaned data...\n');
let validationPassed = true;

Object.entries(deviceGroups).forEach(([deviceId, ops]) => {
  const deviceOps = cleanedOperations.filter(op => op.device_id === deviceId);

  // Check sequences are continuous
  const sequences = deviceOps.map(op => op.sequence_number).sort((a, b) => a - b);
  for (let i = 0; i < sequences.length; i++) {
    if (sequences[i] !== i + 1) {
      console.error(`   ❌ Device ${deviceId.substring(0, 10)}: Gap detected at sequence ${i + 1}`);
      validationPassed = false;
      stats.errors.push(`Device ${deviceId}: Gap at sequence ${i + 1}`);
    }
  }

  // Check no duplicates
  const uniqueSequences = new Set(sequences);
  if (uniqueSequences.size !== sequences.length) {
    console.error(`   ❌ Device ${deviceId.substring(0, 10)}: Duplicate sequences detected`);
    validationPassed = false;
    stats.errors.push(`Device ${deviceId}: Duplicates found`);
  }

  // Check all sequences <= MAX_REASONABLE_SEQUENCE
  const maxSeq = Math.max(...sequences);
  if (maxSeq > MAX_REASONABLE_SEQUENCE) {
    console.error(`   ❌ Device ${deviceId.substring(0, 10)}: Sequence ${maxSeq} exceeds max`);
    validationPassed = false;
    stats.errors.push(`Device ${deviceId}: Sequence ${maxSeq} too high`);
  }
});

if (validationPassed) {
  console.log('✅ All validation checks passed!\n');
} else {
  console.error('❌ Validation failed! Check errors above.\n');
  process.exit(1);
}

// Step 7: Write cleaned data
console.log('💾 Step 7: Writing cleaned data...');
try {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cleanedOperations, null, 2), 'utf8');
  console.log(`✅ Cleaned data written to: ${OUTPUT_FILE}\n`);
} catch (error) {
  console.error(`❌ Error writing file: ${error.message}`);
  process.exit(1);
}

// Step 8: Generate summary report
console.log('═══════════════════════════════════════════\n');
console.log('📊 SUMMARY REPORT\n');
console.log(`Total operations:              ${stats.totalOriginal}`);
console.log(`Operations with bad sequences: ${stats.corruptedSequences} (${((stats.corruptedSequences / stats.totalOriginal) * 100).toFixed(1)}%)`);
console.log(`All operations preserved:      ${stats.remaining} (100.0%)`);
console.log(`Devices processed:             ${stats.devicesProcessed}`);
console.log();

if (stats.errors.length > 0) {
  console.log('⚠️  ERRORS DETECTED:');
  stats.errors.forEach(err => console.log(`   • ${err}`));
  console.log();
}

// Step 9: Device breakdown
console.log('📦 DEVICE BREAKDOWN:\n');
Object.entries(deviceGroups).forEach(([deviceId, ops]) => {
  const deviceOps = cleanedOperations.filter(op => op.device_id === deviceId);
  const sequences = deviceOps.map(op => op.sequence_number).sort((a, b) => a - b);
  const minSeq = Math.min(...sequences);
  const maxSeq = Math.max(...sequences);

  console.log(`Device: ${deviceId}`);
  console.log(`  Operations: ${deviceOps.length}`);
  console.log(`  Sequence range: ${minSeq}-${maxSeq}`);
  console.log(`  Continuous: ${maxSeq === deviceOps.length ? '✅ Yes' : '❌ No'}`);
  console.log();
});

console.log('═══════════════════════════════════════════\n');
console.log('✅ CLEANING COMPLETE!\n');
console.log('📋 NEXT STEPS:\n');
console.log('1. Review the cleaned data file:');
console.log(`   ${OUTPUT_FILE}\n`);
console.log('2. Backup current Supabase data (if not done):');
console.log('   Use Supabase dashboard or pg_dump\n');
console.log('3. Delete corrupted data from Supabase:');
console.log('   Run: node scripts/delete-supabase-operations.js\n');
console.log('4. Upload cleaned data to Supabase:');
console.log('   Run: node scripts/upload-clean-data.js\n');
console.log('5. Verify sync works correctly\n');
console.log('═══════════════════════════════════════════\n');
