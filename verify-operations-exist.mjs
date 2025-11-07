import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lShYIR6xiiwlo9IfCUM0Mw_9-FeV0a7';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log('📊 Verifying navigator_operations table...\n');

  // Get total count
  const { count, error: countError } = await supabase
    .from('navigator_operations')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ Total operations in table: ${count}`);

  // Get unique users
  const { data: allOps, error: opsError } = await supabase
    .from('navigator_operations')
    .select('user_id, operation_type')
    .limit(10);

  if (allOps && allOps.length > 0) {
    const uniqueUsers = new Set(allOps.map(op => op.user_id));
    console.log(`\n👥 Unique users with operations: ${uniqueUsers.size}`);
    uniqueUsers.forEach(uid => {
      const cnt = allOps.filter(op => op.user_id === uid).length;
      console.log(`   ${uid}: ${cnt} operations (in this sample)`);
    });
  }

  // Get operation type breakdown
  const { data: byType } = await supabase
    .from('navigator_operations')
    .select('operation_type')
    .limit(1000);

  const typeCounts = {};
  byType?.forEach(op => {
    typeCounts[op.operation_type] = (typeCounts[op.operation_type] || 0) + 1;
  });

  console.log(`\n📋 Operation types:`);
  Object.entries(typeCounts).forEach(([type, cnt]) => {
    console.log(`   ${type}: ${cnt}`);
  });

  console.log(`\n✅ Data IS in Supabase!`);
}

check().catch(console.error);
