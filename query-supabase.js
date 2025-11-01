// Temporary script to query Supabase data
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVldmZ4cmdlbXJ0dGh4YmN4dHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjY2OTQ1MjgsImV4cCI6MjA0MjI3MDUyOH0.9XAkJLH3_e0TZ8ufK8IQPXP8Pzpk9rghMYu9yM4Wm04';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function queryCompletions() {
  console.log('Querying Supabase for completion operations...\n');

  // Query all COMPLETION_CREATE operations
  const { data, error } = await supabase
    .from('navigator_operations')
    .select('*')
    .eq('type', 'COMPLETION_CREATE')
    .eq('user_id', '33e11ba8-63ee-4ad6-a20e-5a35d6298540')
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error querying Supabase:', error);
    return;
  }

  console.log(`Total completion operations: ${data.length}\n`);

  // Group by date
  const byDate = {};
  data.forEach(op => {
    const date = op.timestamp.slice(0, 10);
    if (!byDate[date]) {
      byDate[date] = [];
    }
    byDate[date].push(op);
  });

  // Show summary by date
  const dates = Object.keys(byDate).sort().reverse();
  console.log('Completions by date:');
  dates.forEach(date => {
    const ops = byDate[date];
    const pifs = ops.filter(op => op.payload?.completion?.outcome === 'PIF');
    console.log(`  ${date}: ${ops.length} total (${pifs.length} PIFs)`);
  });

  // Detailed look at Oct 28 and Oct 25
  console.log('\n=== Oct 28, 2025 Details ===');
  const oct28 = data.filter(op => op.timestamp.startsWith('2025-10-28'));
  if (oct28.length === 0) {
    console.log('NO DATA FOUND for Oct 28');
  } else {
    oct28.forEach(op => {
      const c = op.payload?.completion;
      console.log(`  ${c?.outcome} - ${c?.caseReference} - £${c?.amount} (cases: ${c?.numberOfCases || 1})`);
    });
  }

  console.log('\n=== Oct 25, 2025 Details ===');
  const oct25 = data.filter(op => op.timestamp.startsWith('2025-10-25'));
  if (oct25.length === 0) {
    console.log('NO DATA FOUND for Oct 25');
  } else {
    oct25.forEach(op => {
      const c = op.payload?.completion;
      console.log(`  ${c?.outcome} - ${c?.caseReference} - £${c?.amount} (cases: ${c?.numberOfCases || 1})`);
    });
  }
}

queryCompletions().catch(console.error);
