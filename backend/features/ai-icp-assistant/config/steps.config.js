/**
 * Steps Configuration
 * 
 * Centralized step index constants.
 * NO magic numbers in business logic.
 */

module.exports = {
  // Step indices
  PLATFORM_ACTIONS: 5,
  WORKFLOW_DELAYS: 6,
  WORKFLOW_CONDITIONS: 7,
  CAMPAIGN_GOAL: 8,
  CAMPAIGN_NAME: 9,
  CAMPAIGN_SETTINGS: 10,
  CONFIRMATION: 11,
  
  // Sub-step indices for Step 10
  CAMPAIGN_DAYS_SUBSTEP: 0,
  WORKING_DAYS_SUBSTEP: 1,
  LEADS_PER_DAY_SUBSTEP: 2,
  
  // Default workflow conditions value
  DEFAULT_WORKFLOW_CONDITIONS: 'No conditions (run all actions)',
};

