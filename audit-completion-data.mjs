import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lShYIR6xiiwlo9IfCUM0Mw_9-FeV0a7';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function audit() {
  console.log('📊 AUDITING COMPLETION DATA IN SUPABASE\n');

  // Get all COMPLETION_CREATE operations
  const { data: completions, error } = await supabase
    .from('navigator_operations')
    .select('operation_data, sequence_number')
    .eq('operation_type', 'COMPLETION_CREATE')
    .order('sequence_number', { ascending: true });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!completions || completions.length === 0) {
    console.log('No completions found');
    return;
  }

  console.log(`✅ Found ${completions.length} COMPLETION_CREATE operations\n`);

  // Parse dates and amounts
  const byDate = {};
  const byOutcome = {};
  let totalAmount = 0;
  let pifCount = 0;

  completions.forEach(row => {
    const opData = row.operation_data;
    if (!opData || !opData.payload || !opData.payload.completion) {
      console.log('⚠️  Malformed operation at seq', row.sequence_number);
      return;
    }

    const comp = opData.payload.completion;
    const date = new Date(comp.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD

    if (!byDate[date]) byDate[date] = { count: 0, amount: 0, outcomes: {} };
    byDate[date].count++;

    if (comp.amount) {
      byDate[date].amount += comp.amount;
      totalAmount += comp.amount;
    }

    const outcome = comp.outcome || 'unknown';
    byDate[date].outcomes[outcome] = (byDate[date].outcomes[outcome] || 0) + 1;

    if (outcome === 'PIF') {
      pifCount++;
    }

    byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;
  });

  // Print by date
  console.log('📅 COMPLETIONS BY DATE:\n');
  const sortedDates = Object.keys(byDate).sort();
  sortedDates.forEach(date => {
    const data = byDate[date];
    const outcomes = Object.entries(data.outcomes).map(([k,v]) => `${k}:${v}`).join(', ');
    console.log(`${date}: ${data.count} completions, £${data.amount.toFixed(2)}, ${outcomes}`);
  });

  console.log(`\n📊 SUMMARY BY OUTCOME:\n`);
  Object.entries(byOutcome).forEach(([outcome, count]) => {
    console.log(`${outcome}: ${count}`);
  });

  console.log(`\n💰 TOTALS:\n`);
  console.log(`Total completions: ${completions.length}`);
  console.log(`Total PIF: ${pifCount}`);
  console.log(`Total amount: £${totalAmount.toFixed(2)}`);
  console.log(`Date range: ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}`);
}

audit().catch(console.error);
