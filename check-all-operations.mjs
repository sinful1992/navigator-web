import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lShYIR6xiiwlo9IfCUM0Mw_9-FeV0a7';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log('📊 Checking total operations...\n');

  // First check total count
  const { count, error: countError } = await supabase
    .from('navigator_operations')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Count error:', countError);
  } else {
    console.log(`✅ Total operations in table: ${count}`);
  }

  // Get all user IDs
  const { data: users, error: usersError } = await supabase
    .from('navigator_operations')
    .select('user_id')
    .limit(5);

  if (usersError) {
    console.error('❌ Users error:', usersError);
  } else {
    console.log('📋 Sample user IDs:');
    const uniqueUsers = new Set();
    users?.forEach(op => {
      uniqueUsers.add(op.user_id);
    });
    uniqueUsers.forEach(uid => console.log(`   ${uid}`));
  }

  // Check specific user
  const USER_ID = 'ab4745db-2bfe-42f4-ac3a-239408a110aa';
  const { count: userCount, error: userCountError } = await supabase
    .from('navigator_operations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID);

  if (userCountError) {
    console.error(`❌ Count for user ${USER_ID}:`, userCountError);
  } else {
    console.log(`✅ Operations for user ${USER_ID}: ${userCount}`);
  }
}

check().catch(console.error);
