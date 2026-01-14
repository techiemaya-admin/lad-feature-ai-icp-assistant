/**
 * ICP Onboarding Prompts Configuration
 * 
 * All prompt templates extracted to this config file.
 * No hardcoded prompts in service files.
 */

const onboardingConfig = require('./onboarding.config');
const logger = require('../utils/logger');

module.exports = {
  /**
   * Get prompt for a specific step
   */
  getStepPrompt(stepIndex, context = {}) {
    const prompts = this.getPrompts();
    const prompt = prompts.find(p => p.stepIndex === stepIndex);
    
    if (!prompt) {
      throw new Error(`No prompt found for step ${stepIndex}`);
    }

    // Handle dynamic prompts
    if (prompt.isDynamic && prompt.generateDynamic) {
      return prompt.generateDynamic(context);
    }

    return prompt;
  },

  /**
   * Get all prompts
   */
  getPrompts() {
    const { platforms, campaignGoals, delayOptions, conditionOptions } = onboardingConfig;

    return [
      {
        stepIndex: 1,
        intentKey: 'icp_industries',
        prompt: 'Let\'s get started 👋\nWhich industries do you want to target?\n\n(Examples: Technology, Healthcare, Finance, E-commerce, Manufacturing, Real Estate)\n\nYou can select one or more industries.',
        title: 'Target Industries',
        expectedInput: 'Industry names',
        allowSkip: false,
      },
      {
        stepIndex: 2,
        intentKey: 'icp_locations',
        prompt: 'Where are these customers located?\n\n(Example: India, Dubai, USA, Remote)',
        title: 'Location',
        expectedInput: 'Country, city, region, or remote',
        allowSkip: false,
      },
      {
        stepIndex: 3,
        intentKey: 'icp_roles',
        prompt: 'Do you want to target specific decision-makers?\n\n(Examples: Founder, CEO, Marketing Head)',
        title: 'Decision Makers',
        expectedInput: 'Job titles/roles',
        allowSkip: false,
      },
      {
        stepIndex: 4,
        intentKey: 'selected_platforms',
        prompt: `Which platforms do you want to use for outreach?\n\nOptions:\n${platforms.supported.map(p => `• ${p.displayName}`).join('\n')}\n\nYou can select one or more.\n\nNote: We'll configure and run platforms in this order: LinkedIn → WhatsApp → Email → Voice. We'll finish each platform before moving to the next.`,
        title: 'Outreach Platforms',
        expectedInput: 'Platform names',
        allowSkip: false,
        options: platforms.supported.map(p => p.displayName),
      },
      {
        stepIndex: 5,
        intentKey: 'platform_features',
        prompt: '[Dynamic - will be generated based on selected platforms]',
        title: 'Platform Features',
        expectedInput: 'Platform-specific actions/features',
        allowSkip: false,
        isDynamic: true,
        generateDynamic: (context) => {
          // context may include: platformName, platformIndex, totalPlatforms,
          // askingForTemplate (bool), templateForAction (string)
          const { platformName, platformIndex, totalPlatforms, askingForTemplate, templateForAction } = context;
          const platform = platforms.supported.find(p => p.normalized === platformName?.toLowerCase());
          const actions = platform ? onboardingConfig.platforms.actions[platform.normalized] : [];

          // Base header explaining order and current platform
          let base = `Platform ${platformIndex} of ${totalPlatforms}: ${platform?.displayName || platformName}\n\n`;

          // If we are currently requesting a template for a specific action, render template instructions
          if (askingForTemplate && templateForAction) {
            // Friendly instructions and examples
            const examples = {
              linkedin: {
                connect: 'Hi {first_name}, I\'d like to connect to share a quick idea about {topic}.',
                message: 'Hi {first_name}, thanks for connecting — I wanted to ask about...'
              },
              whatsapp: {
                broadcast: 'Hi {first_name}, quick update: we\'re running a special offer on {product}. Reply STOP to opt-out.',
                one2one: 'Hi {first_name}, I\'m reaching out about {topic} — are you available for a quick chat?'
              },
              email: {
                send: 'Subject: Quick question about {topic}\n\nHi {first_name},\n\nI noticed...',
              },
              voice: {
                autocall: 'Hello {first_name}, this is {agent} from {company}. I\'m calling about...'
              }
            };

            const platformKey = platform?.normalized || platformName?.toLowerCase();
            const sample = (examples[platformKey] && examples[platformKey][templateForAction]) || '';

            base += `We need a message/template for the action "${templateForAction}" on ${platform?.displayName || platformName}.\n\nPlease paste the message or script you want to use below.\n\nExample:\n${sample}\n\n(You can edit the example or paste your own template. This template is required to continue.)`;
            return base;
          }

          // Otherwise render action selection with dependency hints
          base += `We're configuring ${platform?.displayName || platformName} now. Complete the steps in order: Actions → Templates (if required) → Conditions → Delays.\n\nWhat ${platform?.displayName || platformName} actions do you want to include?\n\nOptions:\n${actions.map(a => `• ${a}`).join('\n')}\n\nYou can choose multiple.`;

          // Add brief dependency hints for common platforms (helpful nudge)
          if (platform?.normalized === 'linkedin') {
            base += `\n\nNote: "Send message" requires a connection first — we'll prompt for a connection message if you pick "Send message".`;
          } else if (platform?.normalized === 'whatsapp') {
            base += `\n\nNote: WhatsApp messages and broadcasts require a message template. Follow-ups require an initial message.`;
          } else if (platform?.normalized === 'email') {
            base += `\n\nNote: Sending email requires a subject and body. Follow-ups require an initial email.`;
          } else if (platform?.normalized === 'voice') {
            base += `\n\nNote: Auto call requires a call script. Follow-up calls require a previous call attempt.`;
          }

          return base;
        },
      },
      {
        stepIndex: 6,
        intentKey: 'workflow_delays',
        title: 'Workflow Delays',
        expectedInput: 'Delay configuration',
        allowSkip: false,
        isDynamic: true,
        questionType: 'select',
        generateDynamic: (context) => {
          const { completed_platform_actions = [], selected_platforms = [], completed_delay_platforms = [] } = context;
          
          // Find next platform that needs delay configuration
          const platformsWithActions = completed_platform_actions || [];
          const platformsWithDelay = completed_delay_platforms || [];
          const nextPlatform = platformsWithActions.find(p => !platformsWithDelay.includes(p));
          
          if (!nextPlatform) {
            // All platforms have delay configured
            return `All platforms configured! Do you want to review or modify delays?\n\nOptions:\n${delayOptions.map(opt => `• ${opt}`).join('\n')}`;
          }
          
          // Ask for delay for this specific platform
          const platformDisplayNames = {
            linkedin: 'LinkedIn',
            email: 'Email',
            whatsapp: 'WhatsApp',
            voice: 'Voice Calls'
          };
          
          const platformName = platformDisplayNames[nextPlatform] || nextPlatform;
          const platformIndex = platformsWithDelay.length + 1;
          const totalPlatforms = platformsWithActions.length;
          
          const platformSpecificDelayOptions = [
            'No delay (run immediately)',
            '1 hour delay',
            '2 hours delay',
            '1 day delay',
            '2 days delay',
            'Custom delay',
          ];
          
          // Return just the question string - the service expects a string, not an object
          return `Platform ${platformIndex} of ${totalPlatforms}: ${platformName}\n\nWhat delay do you want between ${platformName} actions?\n\nOptions:\n${platformSpecificDelayOptions.map(opt => `• ${opt}`).join('\n')}`;
        },
        options: [
          'No delay (run immediately)',
          '1 hour delay',
          '2 hours delay',
          '1 day delay',
          '2 days delay',
          'Custom delay',
        ],
      },
      {
        stepIndex: 7,
        intentKey: 'workflow_conditions',
        prompt: `Do you want to add conditions to your workflow?\n\nOptions:\n${conditionOptions.map(opt => `• ${opt}`).join('\n')}`,
        title: 'Workflow Conditions',
        expectedInput: 'Condition configuration',
        allowSkip: false,
        options: conditionOptions,
      },
      {
        stepIndex: 8,
        intentKey: 'campaign_goal',
        prompt: 'What is the main goal of this campaign?',
        title: 'Campaign Goal',
        expectedInput: 'Campaign goal',
        allowSkip: false,
        options: campaignGoals,
      },
      {
        stepIndex: 9,
        intentKey: 'campaign_name',
        prompt: 'What would you like to name this campaign?',
        title: 'Campaign Name',
        expectedInput: 'Campaign name',
        allowSkip: false,
      },
      {
        stepIndex: 10,
        intentKey: 'campaign_settings',
        prompt: '[Dynamic - sub-steps for campaign duration and working days]',
        title: 'Campaign Settings',
        expectedInput: 'Campaign settings',
        allowSkip: false,
        isDynamic: true,
        generateDynamic: (context) => {
          try {
            // CRITICAL FIX: Ensure subStepIndex is always defined (default to 0 for campaign_days)
            const subStepIndex = context.subStepIndex !== undefined ? context.subStepIndex : 0;
            logger.debug(`[PromptsConfig] generateDynamic for step 10, subStepIndex: ${subStepIndex}, context keys: ${Object.keys(context).join(', ')}`);
            
            if (subStepIndex === 0) {
              const options = onboardingConfig.campaignDurationOptions;
              logger.debug(`[PromptsConfig] campaignDurationOptions:`, options);
              if (!options || !Array.isArray(options)) {
                logger.error('[PromptsConfig] campaignDurationOptions is not an array:', options);
                return {
                  stepIndex: 10,
                  intentKey: 'campaign_days',
                  prompt: 'How many days should this campaign run?\n\nOptions:\n• 7 days (1 week)\n• 14 days (2 weeks)\n• 30 days (1 month)\n• 60 days (2 months)\n• Custom (Enter your own number)\n\n(Choose a recommended duration or enter a custom number)',
                  title: 'Campaign Settings',
                  questionType: 'select',
                  options: ['7', '14', '30', '60', 'Custom'],
                  allowSkip: false,
                };
              }
              const questionText = `How many days should this campaign run?\n\nOptions:\n${options.map(opt => {
                if (!opt || !opt.value) {
                  logger.error('[PromptsConfig] Invalid option in campaignDurationOptions:', opt);
                  return '';
                }
                const label = opt.label || `${opt.value} days`;
                // Simplify: just use the label as-is, or format it nicely
                const displayLabel = label.includes('(') ? label : `${opt.value} days (${label})`;
                return `• ${displayLabel}`;
              }).filter(opt => opt.length > 0).join('\n')}\n• Custom (Enter your own number)\n\n(Choose a recommended duration or enter a custom number)`;
              logger.debug(`[PromptsConfig] Generated campaign_days question text (length: ${questionText.length})`);
              return {
                stepIndex: 10,
                intentKey: 'campaign_days',
                prompt: questionText,
                title: 'Campaign Settings',
                questionType: 'select',
                options: options.map(opt => opt.label || opt.value).concat(['Custom']),
                allowSkip: false,
              };
            } else if (subStepIndex === 1) {
              const options = onboardingConfig.workingDaysOptions;
              logger.debug(`[PromptsConfig] workingDaysOptions:`, options);
              if (!options || !Array.isArray(options)) {
                logger.error('[PromptsConfig] workingDaysOptions is not an array:', options);
                return {
                  stepIndex: 10,
                  intentKey: 'working_days',
                  prompt: 'Which days should the campaign run?\n\nOptions:\n• Monday-Friday (Weekdays only)\n• All days (7 days a week)\n• Custom (Select specific days)\n\n(Choose when your campaign should run)',
                  title: 'Campaign Settings',
                  questionType: 'select',
                  options: ['Monday-Friday (Weekdays only)', 'All days (7 days a week)', 'Custom (Select specific days)'],
                  allowSkip: false,
                };
              }
              const questionText = `Which days should the campaign run?\n\nOptions:\n${options.map(opt => `• ${opt}`).join('\n')}\n\n(Choose when your campaign should run)`;
              logger.debug(`[PromptsConfig] Generated working_days question text (length: ${questionText.length})`);
              return {
                stepIndex: 10,
                intentKey: 'working_days',
                prompt: questionText,
                title: 'Campaign Settings',
                questionType: 'select',
                options: options,
                allowSkip: false,
              };
            } else if (subStepIndex === 2) {
              const questionText = 'How many leads do you want per day?\n\nOptions:\n• 10\n• 25\n• 50\n• Max';
              logger.debug(`[PromptsConfig] Generated leads_per_day question text (length: ${questionText.length})`);
              return {
                stepIndex: 10,
                intentKey: 'leads_per_day',
                prompt: questionText,
                title: 'Campaign Settings',
                questionType: 'select',
                options: ['10', '25', '50', 'Max'],
                allowSkip: false,
              };
            }
            // Fallback: default to campaign_days question
            logger.warn(`[PromptsConfig] subStepIndex is ${subStepIndex}, defaulting to campaign_days question`);
            return {
              stepIndex: 10,
              intentKey: 'campaign_days',
              prompt: 'How many days should this campaign run?\n\nOptions:\n• 7 days (1 week)\n• 14 days (2 weeks)\n• 30 days (1 month)\n• 60 days (2 months)\n• Custom (Enter your own number)\n\n(Choose a recommended duration or enter a custom number)',
              title: 'Campaign Settings',
              questionType: 'select',
              options: ['7', '14', '30', '60', 'Custom'],
              allowSkip: false,
            };
          } catch (error) {
            logger.error('[PromptsConfig] Error in generateDynamic for campaign_settings:', error, error.stack);
            return {
              stepIndex: 10,
              intentKey: 'campaign_days',
              prompt: 'How many days should this campaign run?\n\nOptions:\n• 7 days (1 week)\n• 14 days (2 weeks)\n• 30 days (1 month)\n• 60 days (2 months)\n• Custom (Enter your own number)\n\n(Choose a recommended duration or enter a custom number)',
              title: 'Campaign Settings',
              questionType: 'select',
              options: ['7', '14', '30', '60', 'Custom'],
              allowSkip: false,
            };
          }
        },
      },
      {
        stepIndex: 11,
        intentKey: 'confirmation',
        prompt: '[Dynamic - confirmation screen with all collected data]',
        title: 'Campaign Confirmation',
        expectedInput: 'Confirmation',
        allowSkip: false,
        isDynamic: true,
        generateDynamic: (context) => {
          // Build a summary of all collected campaign data
          const summaryLines = [];
          summaryLines.push("Here's your campaign setup 👇\n");
          if (context.campaign_name) summaryLines.push(`• Campaign name: ${context.campaign_name}`);
          if (context.icp_industries) summaryLines.push(`• Target customers: ${Array.isArray(context.icp_industries) ? context.icp_industries.join(', ') : context.icp_industries}`);
          if (context.icp_locations) summaryLines.push(`• Location: ${Array.isArray(context.icp_locations) ? context.icp_locations.join(', ') : context.icp_locations}`);
          if (context.icp_roles) summaryLines.push(`• Decision makers: ${Array.isArray(context.icp_roles) ? context.icp_roles.join(', ') : context.icp_roles}`);
          if (context.selected_platforms) summaryLines.push(`• Platforms: ${Array.isArray(context.selected_platforms) ? context.selected_platforms.join(', ') : context.selected_platforms}`);
          if (context.campaign_goal) summaryLines.push(`• Goal: ${context.campaign_goal}`);
          if (context.campaign_days) summaryLines.push(`• Campaign duration: ${context.campaign_days} days`);
          if (context.working_days) summaryLines.push(`• Working days: ${Array.isArray(context.working_days) ? context.working_days.join(', ') : context.working_days}`);
          if (context.leads_per_day) summaryLines.push(`• Leads per day: ${context.leads_per_day}`);
          
          summaryLines.push('\nReady to launch? 🚀\n');
          summaryLines.push('When you create and start this campaign:');
          summaryLines.push('✓ Apollo will automatically generate leads based on your criteria');
          summaryLines.push('✓ LinkedIn actions will begin executing immediately');
          summaryLines.push('✓ You\'ll be redirected to the campaigns page to monitor progress\n');
          summaryLines.push('Would you like to create and start this campaign now?\n');
          summaryLines.push('Options:');
          summaryLines.push('• Yes, Create and Start Campaign');
          summaryLines.push('• Edit Campaign');
          summaryLines.push('• Go Back');
          
          return {
            stepIndex: 11,
            intentKey: 'confirmation',
            prompt: summaryLines.join('\n'),
            title: 'Campaign Confirmation',
            questionType: 'confirmation',
            allowSkip: false,
          };
        },
      },
    ];
  },
};

