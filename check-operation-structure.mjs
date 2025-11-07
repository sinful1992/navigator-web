import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lShYIR6xiiwlo9IfCUM0Mw_9-FeV0a7';
const USER_ID = 'ab4745db-2bfe-42f4-ac3a-239408a110aa';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log('📊 Checking operation structure...\n');

  const { data, error } = await supabase
    .from('navigator_operations')
    .select('operation_id, sequence_number, client_id, operation_data')
    .eq('user_id', USER_ID)
    .order('sequence_number', { ascending: true })
    .limit(5);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('📋 First 5 operations structure:');
  if (data && data.length > 0) {
    data.forEach((op, i) => {
      console.log(`\n${i+1}. Operation:`);
      console.log(`   operation_id: ${op.operation_id}`);
      console.log(`   sequence_number: ${op.sequence_number}`);
      console.log(`   client_id (column): ${op.client_id}`);

      const opData = op.operation_data;
      if (typeof opData === 'object' && opData !== null) {
        console.log(`   operation_data.id: ${opData.id}`);
        console.log(`   operation_data.clientId: ${opData.clientId}`);
        console.log(`   operation_data.sequence: ${opData.sequence}`);
        console.log(`   operation_data.type: ${opData.type}`);
      } else {
        console.log(`   operation_data: ${opData}`);
      }
    });
  } else {
    console.log('  No operations found');
  }
}

check().catch(console.error);
