/**
 * Logger Utility
 * 
 * Centralized logging for AI ICP Assistant feature.
 * Respects NODE_ENV and log levels.
 */
const LOG_LEVEL = process.env.ICP_LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug');
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
const shouldLog = (level) => {
  const currentLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.debug;
  const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.debug;
  return messageLevel >= currentLevel;
};
const formatMessage = (prefix, ...args) => {
  const timestamp = new Date().toISOString();
  return [`[${timestamp}] [${prefix}]`, ...args];
};
const logger = {
  debug: (...args) => {
    if (shouldLog('debug') && process.env.NODE_ENV !== 'test') {
      // ...existing code...
    }
  },
  info: (...args) => {
    if (shouldLog('info') && process.env.NODE_ENV !== 'test') {
      // ...existing code...
    }
  },
  warn: (...args) => {
    if (shouldLog('warn') && process.env.NODE_ENV !== 'test') {
      console.warn(formatMessage('WARN', ...args));
    }
  },
  error: (...args) => {
    if (shouldLog('error') && process.env.NODE_ENV !== 'test') {
      console.error(formatMessage('ERROR', ...args));
    }
  },
};
module.exports = logger;