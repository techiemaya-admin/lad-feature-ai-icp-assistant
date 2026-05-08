/**
 * Database Connection Utility
 * LAD Architecture: Each feature manages its own database connection
 *
 * Connection priority:
 *   1. AGENT_DB_URL  — full connection string (preferred in Cloud Run)
 *   2. DATABASE_URL  — alias used by some environments
 *   3. Individual POSTGRES_* / DB_* vars — local dev fallback
 */
const { Pool } = require('pg');

// Resolve connection string — prefer AGENT_DB_URL, fall back to DATABASE_URL, then individual vars
const connectionString = process.env.AGENT_DB_URL || process.env.DATABASE_URL;

// PRODUCTION VALIDATION: Fail fast if nothing is configured
if (process.env.NODE_ENV === 'production') {
  const hasConnectionString = !!connectionString;
  const hasIndividualVars = (process.env.DB_HOST || process.env.POSTGRES_HOST) &&
                            (process.env.DB_USER || process.env.POSTGRES_USER) &&
                            (process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.CORE_DB_PASSWORD);
  if (!hasConnectionString && !hasIndividualVars) {
    throw new Error('Missing database configuration: set AGENT_DB_URL or individual POSTGRES_* env vars');
  }
}

// Create PostgreSQL pool — connectionString takes priority over individual params
const poolConfig = connectionString
  ? {
      connectionString,
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: 5000,
      ssl: false,
    }
  : {
      host:     process.env.DB_HOST     || process.env.POSTGRES_HOST,
      port:     parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
      user:     process.env.DB_USER     || process.env.POSTGRES_USER,
      password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.CORE_DB_PASSWORD,
      database: process.env.DB_NAME     || process.env.POSTGRES_DB,
      max:      parseInt(process.env.DB_POOL_MAX || '10'),
      idleTimeoutMillis:      parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

// Get the schema to use
const schema = process.env.POSTGRES_SCHEMA || process.env.DB_SCHEMA || 'lad_stage';

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
