/**
 * Run ICP Questions Migration Script
 * 
 * Usage: node scripts/run-migration.js
 * 
 * This script reads the SQL migration file and executes it against the database.
 */
const fs = require('fs');
const path = require('path');
const { query } = require('../backend/features/ai-icp-assistant/utils/database');
async function runMigration(migrationFile) {
  try {
    // ...existing code...
    // Use provided migration file or default to ICP questions
    const migrationPath = migrationFile ? 
      path.resolve(migrationFile) : 
      path.join(__dirname, '../migrations/008_create_icp_questions_table.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    // ...existing code...
    const sql = fs.readFileSync(migrationPath, 'utf8');
    // Split by semicolons but be more careful about multi-line statements
    let statements = [];
    let currentStatement = '';
    let inParentheses = 0;
    const lines = sql.split('\n');
    for (let line of lines) {
      line = line.trim();
      // Skip comment lines
      if (line.startsWith('--') || line.length === 0) {
        continue;
      }
      // Count parentheses to handle multi-line CREATE TABLE
      for (let char of line) {
        if (char === '(') inParentheses++;
        if (char === ')') inParentheses--;
      }
      currentStatement += ' ' + line;
      // If we hit a semicolon and we're not inside parentheses, it's a complete statement
      if (line.includes(';') && inParentheses === 0) {
        const cleanStatement = currentStatement.replace(/;$/, '').trim();
        if (cleanStatement.length > 0) {
          statements.push(cleanStatement);
        }
        currentStatement = '';
      }
    }
    // Add any remaining statement
    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim());
    }
    // ...existing code...
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      // Skip comments and empty statements
      if (statement.startsWith('--') || statement.length === 0) {
        continue;
      }
      try {
        // ...existing code...
        await query(statement);
        // ...existing code...
      } catch (error) {
        // Some statements might fail if they already exist (e.g., CREATE TABLE IF NOT EXISTS)
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          // ...existing code...
        } else {
          throw error;
        }
      }
    }
    // ...existing code...
    // Verify the table was created
    const verifyResult = await query(`
      SELECT COUNT(*) as count 
      FROM icp_questions 
      WHERE category = 'lead_generation';
    `);
    const questionCount = verifyResult.rows[0]?.count || 0;
    // ...existing code...
    if (questionCount === 0) {
      // ...existing code...
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
// Run the migration
// Run the migration with optional file argument
const migrationFile = process.argv[2];
runMigration(migrationFile);