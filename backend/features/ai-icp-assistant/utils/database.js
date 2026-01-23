/**
 * Database Connection Utility
 * LAD Architecture: Each feature manages its own database connection
 */
const { Pool } = require('pg');
// PRODUCTION VALIDATION: Fail fast if required env vars missing
if (process.env.NODE_ENV === 'production') {
  const required = ['POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required database environment variables in production: ${missing.join(', ')}`);
  }
}
// Create PostgreSQL pool
const pool = new Pool({
  host: process.env.DB_HOST || process.env.POSTGRES_HOST,
  port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
  user: process.env.DB_USER || process.env.POSTGRES_USER,
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  database: process.env.DB_NAME || process.env.POSTGRES_DB,
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