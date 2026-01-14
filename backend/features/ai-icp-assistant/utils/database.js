/**
 * Database Connection Utility
 * LAD Architecture: Each feature manages its own database connection
 * 
 * Supports both DATABASE_URL (recommended, consistent with core app)
 * and individual DB_* variables for backward compatibility
 */

const { Pool } = require('pg');

// PRODUCTION VALIDATION: Fail fast if required env vars missing
if (process.env.NODE_ENV === 'production') {
  const required = ['POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 5432,
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1), // Remove leading '/'
    };
  } catch (error) {
    console.error('Failed to parse DATABASE_URL:', error.message);
    return null;
  }
}

// PRODUCTION VALIDATION: Fail fast if required env vars missing
if (process.env.NODE_ENV === 'production') {
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const hasIndividualVars = process.env.DB_HOST && process.env.DB_NAME && 
                            process.env.DB_USER && process.env.DB_PASSWORD;
  const hasPostgresVars = process.env.POSTGRES_HOST && process.env.POSTGRES_DB && 
                          process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD;
  
  if (!hasDatabaseUrl && !hasIndividualVars && !hasPostgresVars) {
    throw new Error(
      'Missing required database configuration in production. ' +
      'Provide either DATABASE_URL or (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) ' +
      'or (POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD)'
    );
  }
}

// Get database configuration
const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL) || {
  host: process.env.DB_HOST || process.env.POSTGRES_HOST,
  port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
  user: process.env.DB_USER || process.env.POSTGRES_USER,
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  database: process.env.DB_NAME || process.env.POSTGRES_DB,
};

// Create PostgreSQL pool
const pool = new Pool({
  ...dbConfig,
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: 5000,
});

// Get the schema to use
const schema = process.env.DB_SCHEMA || 'lad_dev';

// Set search_path for all connections
pool.on('connect', (client) => {
  client.query(`SET search_path TO ${schema}, public`);
});

// Export pool and query function
module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  schema
};
