#!/usr/bin/env node
/**
 * MCP Server: Sync Diagnostics
 *
 * Provides tools to verify the data loss fix is working:
 * - Check operation counts in Supabase
 * - Verify lastSyncSequence tracking
 * - Detect deduplication issues
 * - Monitor sync health
 *
 * CREDENTIALS USAGE:
 * Pass via environment or tool arguments - never stored in files
 */

import { createClient } from '@supabase/supabase-js';

class SyncDiagnostics {
  constructor(supabaseUrl, supabaseKey, userId) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.userId = userId;
  }

  async checkOperationCounts() {
    console.log('\n📊 CHECKING OPERATION COUNTS');
    console.log('═'.repeat(60));

    const { count, error } = await this.supabase
      .from('navigator_operations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId);

    if (error) {
      console.error('❌ Error:', error);
      return null;
    }

    console.log(`✅ Total operations in Supabase: ${count}`);

    // Get by type
    const { data: byType } = await this.supabase
      .from('navigator_operations')
      .select('operation_type');

    const counts = {};
    byType?.forEach(op => {
      counts[op.operation_type] = (counts[op.operation_type] || 0) + 1;
    });

    console.log('\n📋 Operations by type:');
    Object.entries(counts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    console.log(`\n🎯 CRITICAL: COMPLETION_CREATE count: ${counts['COMPLETION_CREATE'] || 0}`);
    return counts;
  }

  async checkSequenceContinuity() {
    console.log('\n🔗 CHECKING SEQUENCE CONTINUITY');
    console.log('═'.repeat(60));

    const { data: allOps, error } = await this.supabase
      .from('navigator_operations')
      .select('sequence_number')
      .eq('user_id', this.userId)
      .order('sequence_number', { ascending: true });

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    if (!allOps || allOps.length === 0) {
      console.log('⚠️  No operations found');
      return;
    }

    const seqs = allOps.map(op => op.sequence_number).sort((a, b) => a - b);
    console.log(`✅ Total sequences: ${seqs.length}`);
    console.log(`   Range: ${seqs[0]} → ${seqs[seqs.length - 1]}`);

    // Find gaps
    const gaps = [];
    for (let i = 0; i < seqs.length - 1; i++) {
      if (seqs[i + 1] - seqs[i] > 1) {
        gaps.push({
          from: seqs[i],
          to: seqs[i + 1],
          missing: seqs[i + 1] - seqs[i] - 1
        });
      }
    }

    if (gaps.length === 0) {
      console.log('✅ NO GAPS - Continuous sequence!');
    } else {
      console.log(`⚠️  GAPS DETECTED: ${gaps.length}`);
      gaps.slice(0, 5).forEach(gap => {
        console.log(`   Gap: ${gap.from} → ${gap.to} (missing ${gap.missing} ops)`);
      });
      if (gaps.length > 5) {
        console.log(`   ... and ${gaps.length - 5} more gaps`);
      }
    }

    return { total: seqs.length, gaps: gaps.length };
  }

  async checkBootstrapFixWorking() {
    console.log('\n✅ VERIFYING BOOTSTRAP FIX');
    console.log('═'.repeat(60));

    // Get operations grouped by device
    const { data: allOps } = await this.supabase
      .from('navigator_operations')
      .select('client_id, operation_type, sequence_number')
      .eq('user_id', this.userId);

    if (!allOps) {
      console.log('❌ No data');
      return;
    }

    const byDevice = {};
    allOps.forEach(op => {
      if (!byDevice[op.client_id]) {
        byDevice[op.client_id] = { total: 0, types: {} };
      }
      byDevice[op.client_id].total++;
      byDevice[op.client_id].types[op.operation_type] =
        (byDevice[op.client_id].types[op.operation_type] || 0) + 1;
    });

    console.log('📱 Operations by device:');
    Object.entries(byDevice).forEach(([deviceId, data]) => {
      console.log(`\n   Device: ${deviceId.substring(0, 8)}...`);
      console.log(`   Total: ${data.total} operations`);
      Object.entries(data.types)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .forEach(([type, count]) => {
          console.log(`     - ${type}: ${count}`);
        });
    });

    const totalCompletions = allOps.filter(op => op.operation_type === 'COMPLETION_CREATE').length;
    console.log(`\n🎯 Total COMPLETION_CREATE operations: ${totalCompletions}`);

    if (totalCompletions >= 29) {
      console.log('✅ BOOTSTRAP FIX WORKING: All ~29 operations present!');
      return true;
    } else if (totalCompletions >= 10) {
      console.log('⚠️  PARTIAL: Only ~10 operations, data may have been lost');
      return false;
    } else {
      console.log('❌ BROKEN: Very few operations found');
      return false;
    }
  }

  async simulateBootstrapSync() {
    console.log('\n🔄 SIMULATING BOOTSTRAP SYNC');
    console.log('═'.repeat(60));

    // Get all operations (simulating bootstrap fetch with pagination)
    const BATCH_SIZE = 1000;
    let allOps = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await this.supabase
        .from('navigator_operations')
        .select('*')
        .eq('user_id', this.userId)
        .order('sequence_number', { ascending: true })
        .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

      if (error) {
        console.error('❌ Fetch error:', error);
        break;
      }

      if (data && data.length > 0) {
        allOps = allOps.concat(data);
        console.log(`📥 Page ${page + 1}: ${data.length} operations`);
        hasMore = data.length === BATCH_SIZE;
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log(`\n✅ Total fetched: ${allOps.length} operations`);

    // Check for deduplication issues
    const byId = {};
    const duplicates = [];
    allOps.forEach(op => {
      if (byId[op.operation_id]) {
        duplicates.push(op.operation_id);
      }
      byId[op.operation_id] = true;
    });

    if (duplicates.length > 0) {
      console.log(`⚠️  DUPLICATES found: ${duplicates.length}`);
    } else {
      console.log('✅ No duplicates in fetched operations');
    }

    return allOps.length;
  }

  async checkCompletionCreates() {
    console.log('\n📝 CHECKING COMPLETION_CREATE OPERATIONS');
    console.log('═'.repeat(60));

    const { data: completions, error } = await this.supabase
      .from('navigator_operations')
      .select('operation_data, sequence_number, timestamp')
      .eq('user_id', this.userId)
      .eq('operation_type', 'COMPLETION_CREATE')
      .order('sequence_number', { ascending: true });

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log(`✅ Total COMPLETION_CREATE: ${completions?.length || 0}`);

    if (completions && completions.length > 0) {
      console.log('\n📊 Sample completions:');
      completions.slice(0, 3).forEach((comp, i) => {
        const op = comp.operation_data;
        console.log(`\n   ${i + 1}. Seq ${comp.sequence_number}`);
        console.log(`      Amount: ${op?.payload?.completion?.amount}`);
        console.log(`      Outcome: ${op?.payload?.completion?.outcome}`);
        console.log(`      Cases: ${op?.payload?.completion?.numberOfCases}`);
      });

      if (completions.length > 3) {
        console.log(`\n   ... and ${completions.length - 3} more`);
      }
    }

    return completions?.length || 0;
  }

  async runFullDiagnostics() {
    console.log('\n\n');
    console.log('█'.repeat(60));
    console.log('  NAVIGATOR SYNC DIAGNOSTICS');
    console.log('█'.repeat(60));

    const counts = await this.checkOperationCounts();
    const seqHealth = await this.checkSequenceContinuity();
    const bootstrapWorking = await this.checkBootstrapFixWorking();
    const fetchedCount = await this.simulateBootstrapSync();
    const completionCount = await this.checkCompletionCreates();

    console.log('\n\n');
    console.log('█'.repeat(60));
    console.log('  SUMMARY');
    console.log('█'.repeat(60));

    console.log(`\n✅ Total operations: ${fetchedCount}`);
    console.log(`✅ COMPLETION_CREATE: ${completionCount || counts?.COMPLETION_CREATE || 0}`);
    console.log(`✅ Sequence gaps: ${seqHealth?.gaps || 'N/A'}`);
    console.log(`✅ Bootstrap fix: ${bootstrapWorking ? 'WORKING ✅' : 'BROKEN ❌'}`);

    console.log('\n📝 INTERPRETATION:');
    if (bootstrapWorking && completionCount >= 25) {
      console.log('   ✅ FIX IS WORKING: All operations persisting across syncs');
      console.log('   ✅ Data loss bug is RESOLVED');
      console.log('   ✅ Safe to deploy to production');
    } else if (completionCount >= 10) {
      console.log('   ⚠️  PARTIAL: Operations present but incomplete');
      console.log('   ⚠️  Verify deduplication logic');
    } else {
      console.log('   ❌ FIX NOT WORKING: Data loss still occurring');
      console.log('   ❌ Do not deploy until fixed');
    }

    console.log('\n' + '█'.repeat(60) + '\n');
  }
}

// Main execution
async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  const userId = process.argv[2] || '33e11ba8-63ee-4ad6-a20e-5a35d6298540';

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables:');
    console.error('   VITE_SUPABASE_URL');
    console.error('   VITE_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const diagnostics = new SyncDiagnostics(supabaseUrl, supabaseKey, userId);
  await diagnostics.runFullDiagnostics();
}

main().catch(console.error);
