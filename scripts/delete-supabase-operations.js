/**
 * Delete All Operations from Supabase
 *
 * WARNING: This will delete ALL operations from navigator_operations table!
 * Make sure you have a backup before running this script.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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

console.log('🗑️  Delete All Operations from Supabase\n');
console.log('═══════════════════════════════════════════\n');
console.log('⚠️  WARNING: This will delete ALL operations!\n');

async function deleteAllOperations() {
  try {
    // Step 1: Count existing operations
    console.log('📊 Step 1: Counting existing operations...');
    const { count, error: countError } = await supabase
      .from('navigator_operations')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Error counting operations: ${countError.message}`);
    }

    console.log(`✅ Found ${count} operations\n`);

    if (count === 0) {
      console.log('ℹ️  No operations to delete. Table is already empty.\n');
      return;
    }

    // Step 2: Confirm deletion (safety check)
    console.log('⚠️  You are about to delete ALL operations!\n');
    console.log('Press Ctrl+C now to cancel, or wait 5 seconds to proceed...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 3: Delete all operations
    console.log('🗑️  Step 2: Deleting all operations...');

    // Delete in batches to avoid timeout
    const BATCH_SIZE = 100;
    let deletedCount = 0;

    while (true) {
      // Get batch of IDs to delete
      const { data: batch, error: fetchError } = await supabase
        .from('navigator_operations')
        .select('id')
        .limit(BATCH_SIZE);

      if (fetchError) {
        throw new Error(`Error fetching batch: ${fetchError.message}`);
      }

      if (!batch || batch.length === 0) {
        break;
      }

      // Delete batch
      const ids = batch.map(op => op.id);
      const { error: deleteError } = await supabase
        .from('navigator_operations')
        .delete()
        .in('id', ids);

      if (deleteError) {
        throw new Error(`Error deleting batch: ${deleteError.message}`);
      }

      deletedCount += batch.length;
      console.log(`   Deleted ${deletedCount}/${count} operations...`);
    }

    console.log(`\n✅ Successfully deleted ${deletedCount} operations\n`);

    // Step 4: Verify table is empty
    console.log('✅ Step 3: Verifying deletion...');
    const { count: remainingCount, error: verifyError } = await supabase
      .from('navigator_operations')
      .select('*', { count: 'exact', head: true });

    if (verifyError) {
      throw new Error(`Error verifying deletion: ${verifyError.message}`);
    }

    if (remainingCount === 0) {
      console.log('✅ Verified: Table is empty\n');
    } else {
      console.error(`⚠️  Warning: ${remainingCount} operations still remain\n`);
    }

    console.log('═══════════════════════════════════════════\n');
    console.log('✅ DELETION COMPLETE!\n');
    console.log('📋 NEXT STEP:\n');
    console.log('Upload cleaned data:');
    console.log('   node scripts/upload-clean-data.js\n');
    console.log('═══════════════════════════════════════════\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

// Run the deletion
deleteAllOperations();
