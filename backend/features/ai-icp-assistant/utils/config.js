/**
 * Configuration Management
 * LAD Architecture: Feature-specific configuration
 */

require('dotenv').config();

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3001,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // AI Configuration
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  AI_MODEL: process.env.AI_MODEL || 'gemini-pro',
  MAX_TOKENS: parseInt(process.env.MAX_TOKENS) || 2048,
  
  // Database
  DB_SCHEMA: process.env.DB_SCHEMA || 'public',
};

module.exports = config;
