/**
 * Run ICP Questions Migration Script
 * 
 * Usage: node scripts/run-migration.js
 * 
 * This script reads the SQL migration file and executes it against the database.
 */

const fs = require('fs');
const path = require('path');
const { query } = require('../shared/database/connection');

async function runMigration() {
  try {
    console.log('🔄 Running ICP Questions migration...\n');

    // Read the SQL file
    const migrationPath = path.join(__dirname, '../migrations/008_create_icp_questions_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolons and execute each statement
    // Note: This is a simple approach. For production, consider using a proper SQL parser
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments and empty statements
      if (statement.startsWith('--') || statement.length === 0) {
        continue;
      }

      try {
        console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);
        await query(statement);
        console.log(`✅ Statement ${i + 1} executed successfully\n`);
      } catch (error) {
        // Some statements might fail if they already exist (e.g., CREATE TABLE IF NOT EXISTS)
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`⚠️  Statement ${i + 1} skipped (already exists)\n`);
        } else {
          throw error;
        }
      }
    }

    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Verifying migration...');

    // Verify the table was created
    const verifyResult = await query(`
      SELECT COUNT(*) as count 
      FROM icp_questions 
      WHERE category = 'lead_generation';
    `);

    const questionCount = verifyResult.rows[0]?.count || 0;
    console.log(`✅ Found ${questionCount} ICP questions in database\n`);

    if (questionCount === 0) {
      console.log('⚠️  Warning: No questions found. The INSERT statements may have been skipped.');
      console.log('   This is OK if you want to add questions manually later.\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the migration
runMigration();

