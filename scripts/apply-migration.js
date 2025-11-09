// Script to apply the sequence constraint removal migration
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  try {
    console.log('📖 Reading migration file...');

    const migrationPath = path.join(__dirname, '../supabase/migrations/20251109000001_remove_sequence_collision_constraint.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('🔧 Applying migration to Supabase...');
    console.log('\nMigration SQL:');
    console.log(migrationSQL);
    console.log('\n');

    // Execute the migration
    // Note: We need to execute this with proper admin privileges
    // The anon key might not have ALTER TABLE permissions
    console.log('⚠️  WARNING: This script requires database admin privileges');
    console.log('⚠️  You may need to run this SQL manually in the Supabase SQL Editor');
    console.log('⚠️  Go to: https://supabase.com/dashboard/project/[your-project]/sql');
    console.log('\n📋 Copy and paste the following SQL:\n');
    console.log('---BEGIN SQL---');
    console.log(migrationSQL);
    console.log('---END SQL---\n');

    console.log('✅ Please apply the migration manually in the Supabase SQL Editor');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyMigration();
