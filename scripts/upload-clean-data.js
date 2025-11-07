/**
 * Upload Cleaned Operations to Supabase
 *
 * Uploads the cleaned operations data (from clean-operations-data.js)
 * back to the navigator_operations table.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local file directly
function loadEnv() {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    });
    return env;
  } catch (error) {
    console.error('Warning: Could not read .env.local file');
    return {};
  }
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const INPUT_FILE = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'navigator_operations_CLEANED.json');
const BATCH_SIZE = 50; // Upload in batches to avoid timeout

console.log('📤 Upload Cleaned Operations to Supabase\n');
console.log('═══════════════════════════════════════════\n');

async function uploadCleanedData() {
  try {
    // Step 1: Read cleaned data file
    console.log('📖 Step 1: Reading cleaned data...');
    let rawData;
    try {
      rawData = fs.readFileSync(INPUT_FILE, 'utf8');
      console.log(`✅ File read successfully: ${INPUT_FILE}\n`);
    } catch (error) {
      throw new Error(`Cannot read cleaned data file: ${error.message}\nMake sure you ran clean-operations-data.js first!`);
    }

    // Step 2: Parse JSON
    console.log('🔍 Step 2: Parsing cleaned data...');
    const cleanedOps = JSON.parse(rawData);
    console.log(`✅ Loaded ${cleanedOps.length} operations\n`);

    // Step 3: Verify table is empty
    console.log('✅ Step 3: Verifying table is empty...');
    const { count, error: countError } = await supabase
      .from('navigator_operations')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Error counting operations: ${countError.message}`);
    }

    if (count > 0) {
      console.error(`⚠️  Warning: Table has ${count} existing operations`);
      console.error('You should delete existing operations first!');
      console.error('Run: node scripts/delete-supabase-operations.js\n');
      throw new Error('Table not empty');
    }

    console.log('✅ Table is empty, ready to upload\n');

    // Step 4: Upload in batches
    console.log(`📤 Step 4: Uploading ${cleanedOps.length} operations in batches of ${BATCH_SIZE}...\n`);

    let uploadedCount = 0;
    const errors = [];

    for (let i = 0; i < cleanedOps.length; i += BATCH_SIZE) {
      const batch = cleanedOps.slice(i, i + BATCH_SIZE);

      // Remove auto-generated fields (id, created_at, server_timestamp)
      // Keep all other fields including the cleaned sequence_number
      const batchToUpload = batch.map(op => {
        const { id, created_at, server_timestamp, idx, ...rest } = op;
        return rest;
      });

      const { data, error } = await supabase
        .from('navigator_operations')
        .insert(batchToUpload);

      if (error) {
        console.error(`   ❌ Error uploading batch ${i}-${i + batch.length}: ${error.message}`);
        errors.push({ batch: i, error: error.message });
      } else {
        uploadedCount += batch.length;
        console.log(`   ✅ Uploaded ${uploadedCount}/${cleanedOps.length} operations...`);
      }
    }

    console.log();

    // Step 5: Verify upload
    console.log('✅ Step 5: Verifying upload...');
    const { count: finalCount, error: verifyError } = await supabase
      .from('navigator_operations')
      .select('*', { count: 'exact', head: true });

    if (verifyError) {
      throw new Error(`Error verifying upload: ${verifyError.message}`);
    }

    console.log(`✅ Database now has ${finalCount} operations\n`);

    // Summary
    console.log('═══════════════════════════════════════════\n');
    console.log('📊 UPLOAD SUMMARY\n');
    console.log(`Operations in file:      ${cleanedOps.length}`);
    console.log(`Successfully uploaded:   ${uploadedCount}`);
    console.log(`Final count in DB:       ${finalCount}`);
    console.log(`Errors:                  ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      errors.forEach(e => console.log(`   Batch ${e.batch}: ${e.error}`));
      console.log();
    }

    if (finalCount === cleanedOps.length) {
      console.log('\n✅ UPLOAD COMPLETE! All operations uploaded successfully.\n');
    } else {
      console.error(`\n⚠️  Warning: Expected ${cleanedOps.length} but got ${finalCount}\n`);
    }

    // Step 6: Verify sequences per device
    console.log('═══════════════════════════════════════════\n');
    console.log('🔍 Step 6: Verifying sequences per device...\n');

    const deviceIds = [...new Set(cleanedOps.map(op => op.device_id))];

    for (const deviceId of deviceIds) {
      const { data: deviceOps, error: deviceError } = await supabase
        .from('navigator_operations')
        .select('sequence_number')
        .eq('device_id', deviceId)
        .order('sequence_number', { ascending: true });

      if (deviceError) {
        console.error(`   ❌ Device ${deviceId.substring(0, 10)}: Error - ${deviceError.message}`);
        continue;
      }

      const sequences = deviceOps.map(op => op.sequence_number);
      const expectedCount = sequences.length;
      const maxSeq = Math.max(...sequences);
      const isContinuous = maxSeq === expectedCount;

      console.log(`Device ${deviceId.substring(0, 10)}:`);
      console.log(`  Operations: ${sequences.length}`);
      console.log(`  Range: 1-${maxSeq}`);
      console.log(`  Continuous: ${isContinuous ? '✅ Yes' : '❌ No'}`);

      if (!isContinuous) {
        // Find gaps
        const gaps = [];
        for (let i = 1; i <= maxSeq; i++) {
          if (!sequences.includes(i)) {
            gaps.push(i);
          }
        }
        console.log(`  Gaps: ${gaps.length > 0 ? gaps.slice(0, 10).join(', ') : 'None'}`);
      }
      console.log();
    }

    console.log('═══════════════════════════════════════════\n');
    console.log('✅ ALL DONE!\n');
    console.log('📋 NEXT STEPS:\n');
    console.log('1. Test sync in the app on multiple devices\n');
    console.log('2. Monitor for any sync errors\n');
    console.log('3. If you see issues, check the operations table:\n');
    console.log('   - Verify sequences are continuous per device\n');
    console.log('   - Check for any gaps or duplicates\n');
    console.log('═══════════════════════════════════════════\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

// Run the upload
uploadCleanedData();
