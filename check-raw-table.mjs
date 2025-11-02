import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lShYIR6xiiwlo9IfCUM0Mw_9-FeV0a7';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log('📊 Checking raw table structure...\n');

  // Get first 3 rows with ALL columns
  const { data, error } = await supabase
    .from('navigator_operations')
    .select('*')
    .limit(3);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️ No data found');
    return;
  }

  console.log(`✅ Found ${data.length} rows\n`);
  data.forEach((row, i) => {
    console.log(`Row ${i + 1}:`);
    Object.entries(row).forEach(([key, value]) => {
      if (key === 'operation_data' || key === 'data') {
        console.log(`  ${key}: [object] (${typeof value})`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
    console.log();
  });
}

check().catch(console.error);
