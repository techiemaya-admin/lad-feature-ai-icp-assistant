/**
 * ICP Onboarding Configuration
 * 
 * All hardcoded values extracted to this config file.
 * No magic strings or numbers in business logic.
 */
module.exports = {
  // Step configuration
  steps: {
    total: parseInt(process.env.ICP_TOTAL_STEPS || '11', 10),
    minStepIndex: 1,
    maxStepIndex: parseInt(process.env.ICP_MAX_STEP_INDEX || '11', 10),
  },
  // Platform configuration
  platforms: {
    supported: [
      { key: 'linkedin', displayName: 'LinkedIn', normalized: 'linkedin' },
      { key: 'email', displayName: 'Email', normalized: 'email' },
      { key: 'whatsapp', displayName: 'WhatsApp', normalized: 'whatsapp' },
      { key: 'voice', displayName: 'Voice Calls', normalized: 'voice' },
    ],
    // Platform detection patterns
    detectionPatterns: {
      linkedin: ['linkedin'],
      email: ['email', 'mail'],
      whatsapp: ['whatsapp'],
      voice: ['voice', 'call'],
    },
    // Platform actions configuration
    actions: {
      linkedin: [
        'Visit profile',
        'Follow profile',
        'Send connection request',
        'Send message (after accepted)',
      ],
      email: [
        'Send email',
        'Email follow-up sequence',
        'Track opens/clicks',
        'Bounce detection',
      ],
      whatsapp: [
        'Send broadcast',
        'Send 1:1 message',
        'Follow-up message',
        'Template message',
      ],
      voice: [
        'Trigger call',
        'Use call script',
      ],
    },
    // Template requirements
    templateRequired: {
      linkedin: (actions) => {
        const a = actions.toLowerCase();
        return a.includes('message') && (a.includes('after accepted') || a.includes('send message'));
      },
      whatsapp: (actions) => {
        const a = actions.toLowerCase();
        return a.includes('message') || a.includes('broadcast');
      },
      voice: (actions) => {
        const a = actions.toLowerCase();
        return a.includes('call') || a.includes('trigger') || a.includes('script');
      },
      email: () => false, // Email doesn't require template in onboarding
    },
  },
  // Campaign goal options
  campaignGoals: [
    'Generate leads',
    'Book meetings',
    'Promote product',
    'Follow up existing leads',
  ],
  // Delay options
  delayOptions: [
    'No delay (actions run immediately)',
    'Add delay between actions (specify hours/days)',
    'Custom delay configuration',
  ],
  // Condition options
  conditionOptions: [
    'No conditions (run all actions)',
    'If connected (LinkedIn)',
    'If opened (Email)',
    'If replied (Email/WhatsApp)',
    'If clicked (Email)',
    'Custom conditions',
  ],
  // Campaign duration options
  campaignDurationOptions: [
    { value: '7', label: '7 days (1 week)' },
    { value: '14', label: '14 days (2 weeks)' },
    { value: '30', label: '30 days (1 month)' },
    { value: '60', label: '60 days (2 months)' },
    { value: 'custom', label: 'Custom (Enter your own number)' },
  ],
  // Working days options
  workingDaysOptions: [
    'Monday-Friday (Weekdays only)',
    'All days (7 days a week)',
    'Custom (Select specific days)',
  ],
  // Leads per day options
  leadsPerDayOptions: [
    { value: '10', label: '10 leads (Recommended for new accounts)', warning: true },
    { value: '25', label: '25 leads (Standard volume)', warning: false },
    { value: '50', label: '50 leads (High volume - may require account warming)', warning: true },
    { value: 'custom', label: 'Custom (Enter your own number)', warning: false },
  ],
  // Default category
  defaultCategory: process.env.ICP_DEFAULT_CATEGORY || 'lead_generation',
  // Validation rules
  validation: {
    minStepIndex: 1,
    maxStepIndex: parseInt(process.env.ICP_MAX_STEP_INDEX || '11', 10),
    minAnswerLength: 1,
    maxAnswerLength: 10000,
  },
};