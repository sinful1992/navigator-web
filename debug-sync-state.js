#!/usr/bin/env node
/**
 * Debug script to check sync state
 * Shows: operations in Supabase, lastSyncSequence, operation gaps
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const USER_ID = '33e11ba8-63ee-4ad6-a20e-5a35d6298540';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing env variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('🔍 Checking sync state for user:', USER_ID);
  console.log();

  // 1. Count total operations
  const { count, error: countError } = await supabase
    .from('navigator_operations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID);

  if (countError) {
    console.error('❌ Error counting operations:', countError);
    return;
  }
  console.log('📊 Total operations in Supabase:', count);

  // 2. Get sequence range
  const { data: seqData, error: seqError } = await supabase
    .from('navigator_operations')
    .select('sequence_number')
    .eq('user_id', USER_ID)
    .order('sequence_number', { ascending: true })
    .range(0, 0); // Just get first one

  const { data: maxSeqData, error: maxError } = await supabase
    .from('navigator_operations')
    .select('sequence_number')
    .eq('user_id', USER_ID)
    .order('sequence_number', { ascending: false })
    .limit(1);

  const minSeq = seqData?.[0]?.sequence_number || 0;
  const maxSeq = maxSeqData?.[0]?.sequence_number || 0;
  console.log('📊 Sequence range:', minSeq, '→', maxSeq);

  // 3. Count by operation type
  const { data: byType, error: typeError } = await supabase
    .from('navigator_operations')
    .select('operation_type, sequence_number')
    .eq('user_id', USER_ID);

  if (!typeError && byType) {
    const counts = {};
    byType.forEach(op => {
      counts[op.operation_type] = (counts[op.operation_type] || 0) + 1;
    });
    console.log('📊 Operations by type:', counts);

    // Count COMPLETION_CREATE operations
    const completions = byType.filter(op => op.operation_type === 'COMPLETION_CREATE');
    console.log('   - PIFs (COMPLETION_CREATE):', completions.length);
  }

  // 4. Check for sequences gaps
  const { data: allSeqs, error: allError } = await supabase
    .from('navigator_operations')
    .select('sequence_number')
    .eq('user_id', USER_ID)
    .order('sequence_number', { ascending: true });

  if (!allError && allSeqs) {
    const seqs = allSeqs.map(op => op.sequence_number).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 0; i < seqs.length - 1; i++) {
      if (seqs[i + 1] - seqs[i] > 1) {
        gaps.push({ from: seqs[i], to: seqs[i + 1] });
      }
    }
    if (gaps.length > 0) {
      console.log('⚠️  Sequence gaps detected:', gaps.length);
      gaps.slice(0, 5).forEach(gap => {
        console.log('   Gap:', gap.from, '→', gap.to, '(missing', gap.to - gap.from - 1, 'ops)');
      });
    } else {
      console.log('✅ No sequence gaps - continuous sequence');
    }
  }
}

main().catch(console.error);
