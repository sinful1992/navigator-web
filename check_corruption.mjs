import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCorruption() {
  // Count all operations
  const { count: total } = await supabase
    .from('navigator_operations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', 'ab4745db-2bfe-42f4-ac3a-239408a110aa');

  console.log('📊 Total operations:', total);

  // Get max sequence via order
  const { data: maxSeqData } = await supabase
    .from('navigator_operations')
    .select('sequence_number')
    .eq('user_id', 'ab4745db-2bfe-42f4-ac3a-239408a110aa')
    .order('sequence_number', { ascending: false })
    .limit(1);

  const maxSeq = maxSeqData?.[0]?.sequence_number || 0;
  console.log('🔢 Max sequence (via order):', maxSeq);

  // Check for operations with suspiciously high sequences
  const { data: suspiciousOps, error } = await supabase
    .from('navigator_operations')
    .select('id, sequence_number, operation_type, timestamp')
    .eq('user_id', 'ab4745db-2bfe-42f4-ac3a-239408a110aa')
    .filter('sequence_number', 'gt', 100000);

  if (error) {
    console.log('❌ Error checking for suspicious ops:', error);
  } else {
    console.log('⚠️ Operations with sequence > 100000:', suspiciousOps?.length || 0);
    if (suspiciousOps && suspiciousOps.length > 0) {
      console.log('   Sample corrupted ops:');
      suspiciousOps.slice(0, 3).forEach(op => {
        console.log(`   - Seq ${op.sequence_number}, Type: ${op.operation_type}`);
      });
    }
  }
}

checkCorruption().catch(console.error);
