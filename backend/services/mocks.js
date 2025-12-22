/**
 * Mock dependencies for standalone testing
 * These replace LAD-specific dependencies when running in test mode
 */

// Mock database query function
const query = async (sql, params) => {
  console.log('[Mock DB] Query:', sql);
  console.log('[Mock DB] Params:', params);
  
  // Return empty results for test mode
  return { rows: [] };
};

// Mock axios for API calls
const axios = {
  post: async (url, data, config) => {
    console.log('[Mock API] POST:', url);
    return { data: { success: true, message: 'Mock response' } };
  },
  get: async (url, config) => {
    console.log('[Mock API] GET:', url);
    return { data: { success: true, message: 'Mock response' } };
  }
};

module.exports = {
  query,
  axios
};
