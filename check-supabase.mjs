import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lShYIR6xiiwlo9IfCUM0Mw_9-FeV0a7';
const USER_ID = 'ab4745db-2bfe-42f4-ac3a-239408a110aa';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  // Check total count
  const { count } = await supabase
    .from('navigator_operations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID);

  console.log('📊 Total count:', count);

  // Get first 5 operations with all columns
  const { data, error } = await supabase
    .from('navigator_operations')
    .select('*')
    .eq('user_id', USER_ID)
    .order('sequence_number', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('📋 Sample operations:');
  if (data && data.length > 0) {
    data.forEach((op, i) => {
      console.log(`\n${i+1}. Seq: ${op.sequence_number}, Type: ${op.operation_type}`);
      console.log(`   ID: ${op.operation_id}`);
      console.log(`   Has operation_data: ${!!op.operation_data}`);
    });
  } else {
    console.log('  No operations found');
  }
}

check().catch(console.error);
