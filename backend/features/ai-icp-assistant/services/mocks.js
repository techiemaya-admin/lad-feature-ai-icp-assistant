/**
 * Mock dependencies for standalone testing
 * These replace LAD-specific dependencies when running in test mode
 */
// Mock database query function
const query = async (sql, params) => {
  // Return empty results for test mode
  return { rows: [] };
};
// Mock axios for API calls
const axios = {
  post: async (url, data, config) => {
    return { data: { success: true, message: 'Mock response' } };
  },
  get: async (url, config) => {
    return { data: { success: true, message: 'Mock response' } };
  }
};
module.exports = {
  query,
  axios
};