/**
 * Campaign Prompt Config
 * Contains all campaign setup prompts and configuration
 */
class CampaignPrompts {
  static getCampaignPrompts() {
    return [
      {
        stepIndex: 1,
        intentKey: 'icp_industries',
        prompt: 'Let\'s get started 👋\nWhich industries do you want to target?\n\n(Examples: Technology, Healthcare, Finance, E-commerce, Manufacturing, Real Estate)\n\nYou can select one or more industries.',
        title: 'Target Customers',
        expectedInput: 'Industries, company types, business segments',
        allowSkip: false
      },
      {
        stepIndex: 2,
        intentKey: 'icp_locations',
        prompt: 'Where are these customers located?\n\n(Example: India, Dubai, USA)',
        title: 'Location',
        expectedInput: 'Country, city, or region',
        allowSkip: false
      },
      {
        stepIndex: 3,
        intentKey: 'icp_roles',
        prompt: 'Do you want to target specific decision-makers?\n\n(Examples: Founder, CEO, Marketing Head)\nYou can type roles or say Skip.',
        title: 'Decision Makers',
        expectedInput: 'Job titles/roles or "skip"',
        allowSkip: true
      },
      {
        stepIndex: 4,
        intentKey: 'selected_platforms',
        prompt: 'Which platforms do you want to use for outreach?\n\nOptions:\n• LinkedIn\n• Email\n• WhatsApp\n• Voice Calls\n\nYou can select one or more.',
        title: 'Outreach Platforms',
        expectedInput: 'Platform names',
        allowSkip: false,
        options: ['LinkedIn', 'Email', 'WhatsApp', 'Voice Calls']
      },
      {
        stepIndex: 5,
        intentKey: 'platform_features',
        prompt: '[Dynamic - will be generated based on selected platforms]',
        title: 'Platform Features',
        expectedInput: 'Platform-specific actions/features',
        allowSkip: false,
        isDynamic: true
      },
      {
        stepIndex: 6,
        intentKey: 'workflow_delays',
        prompt: 'Do you want to add delays between actions?\n\nOptions:\n• No delay (actions run immediately)\n• Add delay between actions (specify hours/days)\n• Custom delay configuration\n\n(You can say "No delay" or "Skip" to proceed without delays)',
        title: 'Workflow Delays',
        expectedInput: 'Delay configuration',
        allowSkip: true,
        options: ['No delay', 'Add delay between actions', 'Custom delay configuration']
      },
      {
        stepIndex: 7,
        intentKey: 'workflow_conditions',
        prompt: 'Do you want to add conditions to your workflow?\n\nOptions:\n• No conditions (run all actions)\n• If connected (LinkedIn)\n• If opened (Email)\n• If replied (Email/WhatsApp)\n• If clicked (Email)\n• Custom conditions\n\n(You can say "No conditions" or "Skip" to proceed without conditions)',
        title: 'Workflow Conditions',
        expectedInput: 'Condition configuration',
        allowSkip: true,
        options: ['No conditions', 'If connected', 'If opened', 'If replied', 'If clicked', 'Custom conditions']
      },
      {
        stepIndex: 8,
        intentKey: 'campaign_goal',
        prompt: 'What is the main goal of this campaign?',
        title: 'Campaign Goal',
        expectedInput: 'Campaign goal',
        allowSkip: false,
        options: ['Generate leads', 'Book meetings', 'Promote product', 'Follow up existing leads']
      },
      {
        stepIndex: 9,
        intentKey: 'campaign_name',
        prompt: 'What would you like to name this campaign?',
        title: 'Campaign Name',
        expectedInput: 'Campaign name',
        allowSkip: false
      },
      {
        stepIndex: 10,
        intentKey: 'campaign_settings',
        prompt: 'How many days should this campaign run?',
        title: 'Campaign Settings',
        expectedInput: 'Campaign duration and working days',
        allowSkip: false,
        subSteps: [
          { key: 'campaign_days', question: 'How many days should this campaign run?' },
          { key: 'working_days', question: 'Which days should the campaign run? (Options: Monday-Friday, All days, Custom)' },
          { key: 'leads_per_day', question: 'How many leads do you want per day?' }
        ]
      },
      {
        stepIndex: 11,
        intentKey: 'confirmation',
        prompt: 'Here\'s your campaign setup 👇\n\n[Summary will be generated dynamically]',
        title: 'Confirmation',
        expectedInput: 'Yes/Create, Edit, or Go back',
        allowSkip: false
      }
    ];
  }
  static getPlatformConfigs() {
    return {
      linkedin: {
        question: 'What LinkedIn actions do you want to include?',
        options: ['Visit profile', 'Follow profile', 'Send connection request', 'Send message (after accepted)'],
        intentKey: 'linkedin_actions',
        requiredOrder: {
          'Send message (after accepted)': ['Visit profile', 'Send connection request']
        }
      },
      email: {
        question: 'What email actions do you want to include?',
        options: ['Send email', 'Email follow-up sequence', 'Track opens/clicks', 'Bounce detection'],
        intentKey: 'email_actions',
        requiredOrder: {
          'Email follow-up sequence': ['Send email']
        }
      },
      whatsapp: {
        question: 'What WhatsApp actions do you want to include?',
        options: ['Send broadcast', 'Send 1:1 message', 'Follow-up message', 'Template message'],
        intentKey: 'whatsapp_actions'
      },
      voice: {
        question: 'What voice call actions do you want to include?',
        options: ['Trigger call', 'Use call script'],
        intentKey: 'voice_actions'
      }
    };
  }
}
module.exports = CampaignPrompts;