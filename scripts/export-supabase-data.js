// Export all navigator_operations data from Supabase
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://eevfxrgemrtthxbcxtvq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lShYIR6xiiwlo9IfCUM0Mw_9-FeV0a7';
const USER_ID = '33e11ba8-63ee-4ad6-a20e-5a35d6298540';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function exportAllOperations() {
  console.log('🔄 Exporting all navigator_operations from Supabase...\n');

  try {
    // Fetch ALL operations for the user (no limit)
    const { data, error, count } = await supabase
      .from('navigator_operations')
      .select('*', { count: 'exact' })
      .eq('user_id', USER_ID)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('❌ Error querying Supabase:', error);
      process.exit(1);
    }

    console.log(`✅ Successfully fetched ${data.length} operations\n`);

    // Analyze the data
    const corrupted = data.filter(op => op.sequence_number > 1000000);
    const maxSeq = Math.max(...data.map(op => op.sequence_number));
    const minSeq = Math.min(...data.map(op => op.sequence_number));

    console.log('📊 Data Analysis:');
    console.log(`   Total operations: ${data.length}`);
    console.log(`   Corrupted (seq > 1M): ${corrupted.length}`);
    console.log(`   Max sequence: ${maxSeq.toLocaleString()}`);
    console.log(`   Min sequence: ${minSeq.toLocaleString()}`);

    // Group by operation type
    const byType = {};
    data.forEach(op => {
      const type = op.operation_type || op.type || 'UNKNOWN';
      byType[type] = (byType[type] || 0) + 1;
    });

    console.log('\n📋 Operations by type:');
    Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // Create backups directory if it doesn't exist
    const backupsDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
      console.log('\n📁 Created backups directory');
    }

    // Save to JSON file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `operations-export-${timestamp}.json`;
    const filepath = path.join(backupsDir, filename);

    const exportData = {
      exportDate: new Date().toISOString(),
      userId: USER_ID,
      totalOperations: data.length,
      corruptedOperations: corrupted.length,
      maxSequence: maxSeq,
      minSequence: minSeq,
      operations: data
    };

    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    console.log(`\n💾 Saved export to: ${filepath}`);
    console.log(`   File size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);

    // Also save just the corrupted operations for easier inspection
    if (corrupted.length > 0) {
      const corruptedFilename = `corrupted-operations-${timestamp}.json`;
      const corruptedFilepath = path.join(backupsDir, corruptedFilename);
      fs.writeFileSync(corruptedFilepath, JSON.stringify({
        exportDate: new Date().toISOString(),
        userId: USER_ID,
        count: corrupted.length,
        operations: corrupted
      }, null, 2));
      console.log(`   Corrupted ops saved to: ${corruptedFilepath}`);
    }

    console.log('\n✅ Export complete!');
    console.log('\nNext steps:');
    console.log('1. Run fix-sequences.js to repair the sequences');
    console.log('2. Delete corrupted operations from Supabase');
    console.log('3. Resubmit the fixed operations');

    return filepath;
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

exportAllOperations().catch(console.error);
