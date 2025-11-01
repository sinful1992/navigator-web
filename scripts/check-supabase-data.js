// Check what data exists in Supabase
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lShYIR6xiiwlo9IfCUM0Mw_9-FeV0a7';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkData() {
  console.log('🔍 Checking Supabase data...\n');

  // 1. Check total count of operations
  const { count: totalCount, error: countError } = await supabase
    .from('navigator_operations')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error getting count:', countError);
  } else {
    console.log(`📊 Total operations in table: ${totalCount}`);
  }

  // 2. Get all distinct user_ids
  const { data: allOps, error: allError } = await supabase
    .from('navigator_operations')
    .select('user_id')
    .limit(1000);

  if (allError) {
    console.error('❌ Error getting operations:', allError);
  } else {
    const userIds = [...new Set(allOps.map(op => op.user_id))];
    console.log(`\n👥 Distinct user IDs (${userIds.length}):`);
    userIds.forEach(id => console.log(`   ${id}`));
  }

  // 3. Check current authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  console.log(`\n🔐 Current authenticated user: ${user?.id || 'Not authenticated'}`);

  // 4. Sample a few operations to see structure
  const { data: sample, error: sampleError } = await supabase
    .from('navigator_operations')
    .select('*')
    .limit(3);

  if (sampleError) {
    console.error('❌ Error getting sample:', sampleError);
  } else {
    console.log(`\n📝 Sample operations (${sample.length}):`);
    sample.forEach((op, i) => {
      console.log(`\n   ${i + 1}. ID: ${op.id}`);
      console.log(`      User ID: ${op.user_id}`);
      console.log(`      Type: ${op.operation_type || op.type}`);
      console.log(`      Sequence: ${op.sequence_number}`);
      console.log(`      Timestamp: ${op.timestamp}`);
    });
  }

  // 5. Check for corrupted sequences
  const { data: corrupted, error: corruptedError } = await supabase
    .from('navigator_operations')
    .select('id, user_id, sequence_number, timestamp')
    .gt('sequence_number', 1000000)
    .limit(5);

  if (corruptedError) {
    console.error('❌ Error getting corrupted:', corruptedError);
  } else {
    console.log(`\n🚨 Corrupted sequences (seq > 1M): ${corrupted.length}`);
    corrupted.forEach((op, i) => {
      console.log(`   ${i + 1}. Seq: ${op.sequence_number.toLocaleString()}, User: ${op.user_id.slice(0, 8)}...`);
    });
  }
}

checkData().catch(console.error);
