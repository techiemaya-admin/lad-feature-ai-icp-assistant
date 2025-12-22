/**
 * AI ICP Assistant Feature Manifest
 * 
 * Feature for AI-powered Ideal Customer Profile assistant that helps users
 * define search criteria and trigger Apollo searches through conversational interface.
 */

module.exports = {
  name: 'AI ICP Assistant',
  key: 'ai-icp-assistant',
  version: '1.0.0',
  description: 'AI-powered assistant to help define ICP and trigger Apollo searches',
  
  // Feature availability
  plans: ['professional', 'enterprise'],
  
  // Credit costs
  credits: {
    per_message: 0.1,  // Cost per AI message
    per_search_trigger: 0  // No additional cost for triggering search (Apollo charges separately)
  },
  
  // API routes provided by this feature
  routes: [
    'chat',
    'reset',
    'history'
  ],
  
  // Dependencies
  dependencies: [
    'apollo-leads'  // Can trigger Apollo searches
  ],
  
  // Feature capabilities
  capabilities: [
    'chat_with_ai',
    'define_icp',
    'trigger_apollo_search'
  ]
};
