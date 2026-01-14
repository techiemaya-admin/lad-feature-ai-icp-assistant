/**
 * AI ICP Assistant Feature Manifest
 * 
 * Feature for AI-powered Ideal Customer Profile assistant that helps users
 * define search criteria and trigger Apollo searches through conversational interface.
 * 
 * Version 2.0.0: Refactored with proper MVC architecture
 */

module.exports = {
  name: 'AI ICP Assistant',
  key: 'ai-icp-assistant',
  version: '2.0.0',
  description: 'AI-powered assistant to help define ICP and trigger Apollo searches',
  
  // Feature availability
  plans: ['professional', 'enterprise'],
  hasRoutes: true,
  
  // Credit costs
  credits: {
    per_message: 0.1,  // Cost per AI message
    per_search_trigger: 0  // No additional cost for triggering search (Apollo charges separately)
  },
  
  // API routes provided by this feature (array of route paths for documentation)
  routes: [
    'chat',
    'onboarding/icp-questions',
    'onboarding/icp-questions/:stepIndex',
    'onboarding/icp-answer',
    'profiles',
    'profiles/:id',
    'expand-keywords',
    'conversations/:id',
    'reset'
  ],
  
  // Database tables
  tables: [
    'ai_conversations',
    'ai_messages',
    'ai_icp_profiles',
    'ai_keyword_expansions',
    'icp_questions'  // Database-driven ICP questions
  ],
  
  // Dependencies
  dependencies: [
    'apollo-leads'  // Can trigger Apollo searches
  ],
  
  // Feature capabilities
  capabilities: [
    'chat_with_ai',
    'define_icp',
    'trigger_apollo_search',
    'save_icp_profiles',
    'keyword_expansion',
    'conversation_history',
    'db_driven_icp_onboarding'  // Database-driven ICP questions system
  ]
};
