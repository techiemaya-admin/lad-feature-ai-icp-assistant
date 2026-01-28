/**
 * Question Generator Service
 * Handles question generation for ICP onboarding flow
 */
const logger = require('../utils/logger');
class QuestionGeneratorService {
  constructor() {
    this.campaignPrompts = [
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
  /**
   * Generate question for given step
   */
  async generateQuestion(stepIndex = 1, context = {}) {
    try {
      const promptConfig = this.campaignPrompts.find(p => p.stepIndex === stepIndex);
      if (!promptConfig) {
        throw new Error(`No prompt found for step ${stepIndex}`);
      }
      if (stepIndex === 11) {
        return this.generateConfirmationStep(context);
      }
      if (stepIndex === 5 && promptConfig.isDynamic) {
        return this.generatePlatformFeaturesStep(context);
      }
      if (stepIndex === 10 && promptConfig.subSteps) {
        return this.generateCampaignSettingsStep(context, promptConfig);
      }
      const cleanQuestionText = this.cleanQuestionText(promptConfig.prompt);
      return {
        question: cleanQuestionText,
        helperText: null,
        stepIndex: promptConfig.stepIndex,
        intentKey: promptConfig.intentKey,
        title: promptConfig.title,
        questionType: promptConfig.options ? 'select' : 'text',
        options: promptConfig.options,
        allowSkip: promptConfig.allowSkip
      };
    } catch (error) {
      logger.error('Error generating question', { error: error.message, stepIndex });
      return this.getFallbackQuestion(stepIndex);
    }
  }
  /**
   * Clean question text from step prefixes
   */
  cleanQuestionText(text) {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^Step\s+\d+\s+of\s+7\s*[–:—-]\s*/i, '');
    cleaned = cleaned.replace(/^Step\s+\d+\s+of\s+7\s+/i, '');
    return cleaned;
  }
  /**
   * Generate campaign settings step with sub-steps
   */
  generateCampaignSettingsStep(context, promptConfig) {
    const subStepIndex = context.subStepIndex || 0;
    const subStep = promptConfig.subSteps[subStepIndex];
    if (!subStep) {
      return this.getFallbackQuestion(10);
    }
    if (subStep.key === 'campaign_days') {
      return {
        question: `${subStep.question}\n\nOptions:\n• 7 days (1 week)\n• 14 days (2 weeks)\n• 30 days (1 month)\n• 60 days (2 months)\n• Custom (Enter your own number)`,
        helperText: 'Choose a recommended duration or enter a custom number',
        stepIndex: 10,
        intentKey: subStep.key,
        title: promptConfig.title,
        questionType: 'select',
        options: ['7 days', '14 days', '30 days', '60 days', 'Custom'],
        subStepIndex,
        totalSubSteps: promptConfig.subSteps.length
      };
    }
    if (subStep.key === 'working_days') {
      return {
        question: `${subStep.question}\n\nOptions:\n• Monday-Friday (Weekdays only)\n• All days (7 days a week)\n• Custom (Select specific days)`,
        helperText: 'Choose when your campaign should run',
        stepIndex: 10,
        intentKey: subStep.key,
        title: promptConfig.title,
        questionType: 'select',
        options: ['Monday-Friday', 'All days', 'Custom'],
        subStepIndex,
        totalSubSteps: promptConfig.subSteps.length
      };
    }
    if (subStep.key === 'leads_per_day') {
      return {
        question: `${subStep.question}\n\nOptions:\n• 10\n• 25\n• 50\n• Max`,
        helperText: 'Select how many leads you want per day',
        stepIndex: 10,
        intentKey: subStep.key,
        title: promptConfig.title,
        questionType: 'select',
        options: ['10', '25', '50', 'Max'],
        subStepIndex,
        totalSubSteps: promptConfig.subSteps.length
      };
    }
    return {
      question: subStep.question,
      helperText: null,
      stepIndex: 10,
      intentKey: subStep.key,
      title: promptConfig.title,
      questionType: 'text',
      subStepIndex,
      totalSubSteps: promptConfig.subSteps.length
    };
  }
  /**
   * Generate platform features step dynamically
   */
  generatePlatformFeaturesStep(context) {
    const selectedPlatforms = context.selected_platforms || [];
    const completedPlatformActions = context.completed_platform_actions || [];
    const normalizedPlatforms = this.normalizePlatforms(selectedPlatforms);
    if (normalizedPlatforms.length === 0) {
      return this.generateQuestion(4);
    }
    const platformConfigs = this.getPlatformConfigs();
    const { platformKey, config, platformIndex, totalPlatforms } = this.findNextPlatform(
      normalizedPlatforms,
      completedPlatformActions,
      platformConfigs
    );
    if (!config) {
      return this.generateQuestion(6);
    }
    const platformDisplayNames = {
      linkedin: 'LinkedIn',
      email: 'Email',
      whatsapp: 'WhatsApp',
      voice: 'Voice Calls'
    };
    const platformDisplayName = platformDisplayNames[platformKey] || platformKey;
    return {
      question: `Platform ${platformIndex} of ${totalPlatforms}: ${platformDisplayName}\n\n${config.question}\n\nOptions:\n${config.options.map(opt => `• ${opt}`).join('\n')}\n\nYou can choose multiple.`,
      helperText: null,
      stepIndex: 5,
      intentKey: config.intentKey,
      title: 'Platform Actions',
      questionType: 'select',
      options: config.options,
      allowSkip: false,
      currentPlatform: platformKey,
      platformIndex,
      totalPlatforms
    };
  }
  /**
   * Normalize platform names
   */
  normalizePlatforms(platforms) {
    let platformList = [];
    if (Array.isArray(platforms)) {
      platformList = platforms;
    } else if (typeof platforms === 'string') {
      platformList = platforms.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    return platformList.map(p => {
      const pLower = p.toLowerCase().trim();
      if (pLower.includes('linkedin')) return 'linkedin';
      if (pLower.includes('email') || pLower.includes('mail')) return 'email';
      if (pLower.includes('whatsapp')) return 'whatsapp';
      if (pLower.includes('voice')) return 'voice';
      return p;
    }).filter(p => p);
  }
  /**
   * Get platform configuration
   */
  getPlatformConfigs() {
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
  /**
   * Find next platform that needs configuration
   */
  findNextPlatform(normalizedPlatforms, completedPlatformActions, platformConfigs) {
    for (let i = 0; i < normalizedPlatforms.length; i++) {
      const platform = normalizedPlatforms[i];
      const platformKey = platform.toLowerCase();
      if (platformConfigs[platformKey] && !completedPlatformActions.includes(platformKey)) {
        return {
          platformKey,
          config: platformConfigs[platformKey],
          platformIndex: i + 1,
          totalPlatforms: normalizedPlatforms.length
        };
      }
    }
    return {
      platformKey: null,
      config: null,
      platformIndex: 0,
      totalPlatforms: normalizedPlatforms.length
    };
  }
  /**
   * Generate confirmation step with summary
   */
  generateConfirmationStep(context) {
    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        if (value.includes(',')) {
          return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
        return value ? [value] : [];
      }
      return [];
    };
    const {
      icp_industries = [],
      icp_locations = [],
      icp_roles = [],
      selected_platforms = [],
      campaign_goal = '',
      campaign_name = '',
      campaign_days = '',
      working_days = [],
      platform_features = [],
      workflow_delays = '',
      workflow_conditions = '',
      leads_per_day = '10'
    } = context;
    const industries = toArray(icp_industries);
    const locations = toArray(icp_locations);
    const roles = toArray(icp_roles);
    const platforms = toArray(selected_platforms);
    const features = toArray(platform_features);
    const wDays = Array.isArray(working_days) ? working_days : (working_days ? [working_days] : []);
    const delaysDisplay = this.getDisplayValue(workflow_delays, ['skip', 'no delay', 'none'], 'No delays');
    const conditionsDisplay = this.getDisplayValue(workflow_conditions, ['skip', 'no conditions', 'none'], 'No conditions');
    const summary = `Here's your campaign setup 👇
• Campaign name: ${campaign_name || 'Not specified'}
• Target customers: ${industries.length > 0 ? industries.join(', ') : 'Not specified'}
• Location: ${locations.length > 0 ? locations.join(', ') : 'Not specified'}
• Decision makers: ${roles.length > 0 ? roles.join(', ') : 'Any'}
• Platforms: ${platforms.length > 0 ? platforms.join(', ') : 'Not specified'}
• Platform features: ${features.length > 0 ? features.join(', ') : 'Not specified'}
• Workflow delays: ${delaysDisplay}
• Workflow conditions: ${conditionsDisplay}
• Goal: ${campaign_goal || 'Not specified'}
• Campaign duration: ${campaign_days || 'Not specified'} days
• Working days: ${wDays.length > 0 ? wDays.join(', ') : (working_days || 'Not specified')}
• Leads per day: ${leads_per_day}
Ready to launch? 🚀
When you create and start this campaign:
✓ Apollo will automatically generate leads based on your criteria
✓ LinkedIn actions will begin executing immediately
✓ You'll be redirected to the campaigns page to monitor progress
Would you like to create and start this campaign now?
Options:
• Yes, Create and Start Campaign
• Edit Campaign
• Go Back`;
    return {
      question: summary,
      helperText: null,
      stepIndex: 11,
      intentKey: 'confirmation',
      title: 'Confirmation',
      questionType: 'confirmation',
      options: ['Yes, Create and Start Campaign', 'Edit Campaign', 'Go Back']
    };
  }
  /**
   * Get display value with skip handling
   */
  getDisplayValue(value, skipValues, defaultValue) {
    if (!value) return defaultValue;
    const lowerValue = value.toLowerCase();
    if (skipValues.some(sv => lowerValue === sv)) {
      return defaultValue;
    }
    return value;
  }
  /**
   * Get fallback question
   */
  getFallbackQuestion(stepIndex) {
    const promptConfig = this.campaignPrompts.find(p => p.stepIndex === stepIndex);
    return {
      question: promptConfig?.prompt || 'Please answer the question.',
      helperText: null,
      stepIndex,
      intentKey: promptConfig?.intentKey || 'unknown',
      title: promptConfig?.title || 'Question',
      questionType: 'text',
      options: promptConfig?.options,
      allowSkip: promptConfig?.allowSkip
    };
  }
}
module.exports = new QuestionGeneratorService();
