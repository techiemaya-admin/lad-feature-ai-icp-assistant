/**
 * Question Generator Service
 * 
 * Generates ICP onboarding questions using prompts configuration.
 * No AI logic - only question formatting.
 */

const promptsConfig = require('../config/prompts.config');
const onboardingConfig = require('../config/onboarding.config');
const stepsConfig = require('../config/steps.config');
const platformHandlerService = require('./platform-handler.service');
const platformProgressionService = require('./platform-progression.service');
const logger = require('../utils/logger');

class QuestionGeneratorService {
  /**
   * Generate question for a step
   */
  generateQuestion(stepIndex, context = {}) {
    const promptConfig = promptsConfig.getStepPrompt(stepIndex, context);
    const { steps } = onboardingConfig;
    
    // CRITICAL FIX: For campaign settings step, ensure subStepIndex is always set (default to 0 for campaign_days)
    if (stepIndex === stepsConfig.CAMPAIGN_SETTINGS && context.subStepIndex === undefined) {
      const hasCampaignDays = context.campaign_days !== undefined && context.campaign_days !== '';
      context.subStepIndex = hasCampaignDays ? stepsConfig.WORKING_DAYS_SUBSTEP : stepsConfig.CAMPAIGN_DAYS_SUBSTEP;
      logger.debug(`[QuestionGenerator] Campaign settings step: subStepIndex was undefined, set to ${context.subStepIndex} (hasCampaignDays: ${hasCampaignDays})`);
    }
    
    // Add step prefix
    const stepPrefix = `Step ${stepIndex} of ${steps.total}: `;
    
    let questionText = promptConfig.prompt;
    if (promptConfig.isDynamic && promptConfig.generateDynamic) {
      try {
        logger.debug(`[QuestionGenerator] Calling generateDynamic for step ${stepIndex} with subStepIndex: ${context.subStepIndex}`);
        questionText = promptConfig.generateDynamic(context);
        // Ensure questionText is not undefined
        if (!questionText || questionText === 'undefined' || typeof questionText !== 'string') {
          logger.error(`[QuestionGenerator] generateDynamic returned invalid value for step ${stepIndex}:`, questionText, 'context:', context);
          questionText = 'How many days should this campaign run?\n\nOptions:\n• 7 days (1 week)\n• 14 days (2 weeks)\n• 30 days (1 month)\n• 60 days (2 months)\n• Custom (Enter your own number)\n\n(Choose a recommended duration or enter a custom number)';
        }
      } catch (error) {
        logger.error(`[QuestionGenerator] Error generating dynamic question for step ${stepIndex}:`, error, error.stack);
        questionText = 'How many days should this campaign run?\n\nOptions:\n• 7 days (1 week)\n• 14 days (2 weeks)\n• 30 days (1 month)\n• 60 days (2 months)\n• Custom (Enter your own number)\n\n(Choose a recommended duration or enter a custom number)';
      }
    }
    
    // Ensure questionText is a string
    if (!questionText || typeof questionText !== 'string') {
      logger.error(`[QuestionGenerator] Invalid questionText for step ${stepIndex}:`, questionText);
      questionText = 'How many days should this campaign run?\n\nOptions:\n• 7 days (1 week)\n• 14 days (2 weeks)\n• 30 days (1 month)\n• 60 days (2 months)\n• Custom (Enter your own number)\n\n(Choose a recommended duration or enter a custom number)';
    }
    
    // For campaign settings step, set intentKey based on sub-step
    let intentKey = promptConfig.intentKey;
    if (stepIndex === stepsConfig.CAMPAIGN_SETTINGS) {
      const subStepIndex = context.subStepIndex !== undefined ? context.subStepIndex : stepsConfig.CAMPAIGN_DAYS_SUBSTEP;
      if (subStepIndex === stepsConfig.CAMPAIGN_DAYS_SUBSTEP) {
        intentKey = 'campaign_days';
      } else if (subStepIndex === stepsConfig.WORKING_DAYS_SUBSTEP) {
        intentKey = 'working_days';
      } else if (subStepIndex === stepsConfig.LEADS_PER_DAY_SUBSTEP) {
        intentKey = 'leads_per_day';
      }
      logger.debug(`[QuestionGenerator] Campaign settings step: intentKey set to ${intentKey} (subStepIndex: ${subStepIndex})`);
    }
    
    return {
      question: `${stepPrefix}${questionText}`,
      helperText: promptConfig.helperText || null,
      stepIndex,
      intentKey,
      title: promptConfig.title,
      questionType: promptConfig.questionType || 'text',
      options: promptConfig.options || undefined,
      allowSkip: promptConfig.allowSkip || false,
      subStepIndex: context.subStepIndex,
    };
  }

  /**
   * Generate platform actions question
   * Pre-selects ALL actions and allows user to modify
   */
  generatePlatformActionsQuestion(selectedPlatforms, completedPlatformActions, context = {}) {
    const nextPlatform = platformProgressionService.findNextPlatform(
      selectedPlatforms,
      completedPlatformActions
    );
    
    if (!nextPlatform) {
      // All platforms done, move to delays
      return this.generateQuestion(stepsConfig.WORKFLOW_DELAYS, context);
    }
    
    const platformConfig = platformHandlerService.getPlatformConfig(nextPlatform);
    const actions = platformConfig.actions;
    const progress = platformProgressionService.getPlatformProgress(
      selectedPlatforms,
      nextPlatform
    );
    
    const { steps } = onboardingConfig;
    const stepPrefix = `Step ${stepsConfig.PLATFORM_ACTIONS} of ${steps.total}: `;
    
    // Check if user already has some actions selected for this platform
    const actionKey = `${nextPlatform}_actions`;
    const existingActions = context[actionKey];
    const preSelectedActions = existingActions 
      ? String(existingActions).split(',').map(a => a.trim()).filter(a => a.length > 0)
      : actions; // Pre-select ALL actions if none selected yet
    
    return {
      question: `${stepPrefix}Platform ${progress.platformIndex} of ${progress.totalPlatforms}: ${platformConfig.displayName}\n\nAll ${platformConfig.displayName} actions are pre-selected. You can uncheck any actions you don't want:\n\nOptions:\n${actions.map(a => `• ${a}`).join('\n')}\n\nModify your selection as needed.`,
      helperText: 'All actions are pre-selected. Uncheck any you want to remove.',
      stepIndex: stepsConfig.PLATFORM_ACTIONS,
      intentKey: platformConfig.intentKey,
      title: 'Platform Actions',
      questionType: 'multi-select',
      options: actions,
      preSelectedOptions: preSelectedActions,
      allowSkip: false,
      currentPlatform: platformConfig.key,
      platformIndex: progress.platformIndex,
      totalPlatforms: progress.totalPlatforms,
    };
  }

  /**
   * Generate confirmation step
   */
  generateConfirmationStep(collectedAnswers) {
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
    
    const industries = toArray(collectedAnswers.icp_industries || []);
    const locations = toArray(collectedAnswers.icp_locations || []);
    const roles = toArray(collectedAnswers.icp_roles || []);
    const platforms = toArray(collectedAnswers.selected_platforms || []);
    const campaignGoal = collectedAnswers.campaign_goal || 'Not specified';
    const campaignName = collectedAnswers.campaign_name || 'Not specified';
    const campaignDays = collectedAnswers.campaign_days || 'Not specified';
    const workingDays = Array.isArray(collectedAnswers.working_days) 
      ? collectedAnswers.working_days.join(', ')
      : (collectedAnswers.working_days || 'Not specified');
    const leadsPerDay = collectedAnswers.leads_per_day || '10';
    
    const summary = `Here's your campaign setup 👇

• Campaign name: ${campaignName}
• Target customers: ${industries.length > 0 ? industries.join(' or ') : 'Not specified'}
• Location: ${locations.length > 0 ? locations.join(', ') : 'Not specified'}
• Decision makers: ${roles.length > 0 ? roles.join(', ') : 'Any'}
• Platforms: ${platforms.length > 0 ? platforms.join(', ') : 'Not specified'}
• Goal: ${campaignGoal}
• Campaign duration: ${campaignDays} days
• Working days: ${workingDays}
• Leads per day: ${leadsPerDay}

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
      stepIndex: stepsConfig.CONFIRMATION,
      intentKey: 'confirmation',
      title: 'Campaign Confirmation',
      questionType: 'text',
      allowSkip: false,
    };
  }
}

module.exports = new QuestionGeneratorService();

