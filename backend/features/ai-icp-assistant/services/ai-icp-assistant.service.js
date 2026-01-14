/**
 * AI ICP Assistant Service
 * 
 * Main orchestrator service for ICP onboarding.
 * Delegates to specialized services for step-specific logic.
 * NO HTTP logic, NO database access - pure business logic.
 */

const questionGeneratorService = require('./question-generator.service');
const intentAnalyzerService = require('./intent-analyzer.service');
const stepProcessorService = require('./step-processor.service');
const templateProcessorService = require('./template-processor.service');
const onboardingConfig = require('../config/onboarding.config');
const stepsConfig = require('../config/steps.config');
const logger = require('../utils/logger');

class AICICPAssistantService {
  /**
   * Get first question for onboarding
   */
  getFirstQuestion(category = null) {
    return questionGeneratorService.generateQuestion(1, { category });
  }

  /**
   * Get question by step index
   */
  getQuestionByStep(stepIndex, context = {}) {
    const { steps } = onboardingConfig;
    
    if (stepIndex < steps.minStepIndex || stepIndex > steps.maxStepIndex) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }
    
    // CRITICAL FIX: Skip workflow_conditions step - automatically move to campaign_goal
    if (stepIndex === stepsConfig.WORKFLOW_CONDITIONS) {
      logger.debug('[AICICPAssistantService] Workflow conditions step is skipped, moving to campaign goal');
      if (!context.workflow_conditions) {
        context.workflow_conditions = stepsConfig.DEFAULT_WORKFLOW_CONDITIONS;
      }
      return this.getQuestionByStep(stepsConfig.CAMPAIGN_GOAL, context);
    }
    
    // Special handling for platform actions step
    if (stepIndex === stepsConfig.PLATFORM_ACTIONS && context.selected_platforms) {
      return this._getPlatformActionsQuestion(context);
    }
    
    // Special handling for campaign settings step - determine sub-step
    if (stepIndex === stepsConfig.CAMPAIGN_SETTINGS) {
      return this._getCampaignSettingsQuestion(context);
    }
    
    // Special handling for confirmation step
    if (stepIndex === stepsConfig.CONFIRMATION) {
      return questionGeneratorService.generateConfirmationStep(context);
    }
    
    return questionGeneratorService.generateQuestion(stepIndex, context);
  }

  /**
   * Process user answer and determine next step
   */
  async processAnswer({
    userAnswer,
    currentStepIndex,
    currentIntentKey,
    currentQuestion,
    collectedAnswers,
  }) {
    // CRITICAL FIX: Check for template answers FIRST
    if (currentIntentKey && currentIntentKey.endsWith('_template')) {
      return templateProcessorService.processTemplateAnswer({
        userAnswer,
        currentIntentKey,
        collectedAnswers,
      });
    }
    
    // Handle delay answers BETWEEN platforms (e.g., delay_linkedin_whatsapp)
    if (currentIntentKey && currentIntentKey.startsWith('delay_') && currentStepIndex === stepsConfig.PLATFORM_FEATURES) {
      const updatedAnswers = {
        ...collectedAnswers,
        [currentIntentKey]: userAnswer,
      };
      
      logger.debug(`[AICICPAssistantService] Delay between platforms configured: ${currentIntentKey} = ${userAnswer}`);
      
      // Continue with platform actions flow
      const nextQuestion = this._getPlatformActionsQuestion(updatedAnswers);
      
      logger.debug('[AICICPAssistantService] Delay answer processed, nextQuestion:', {
        hasStepIndex: nextQuestion.stepIndex !== undefined,
        stepIndex: nextQuestion.stepIndex,
        intentKey: nextQuestion.intentKey
      });
      
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: nextQuestion.stepIndex || stepsConfig.PLATFORM_FEATURES,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // Special handling for platform actions step
    if (currentStepIndex === stepsConfig.PLATFORM_ACTIONS) {
      return stepProcessorService.processPlatformActionsStep({
        userAnswer,
        currentIntentKey,
        collectedAnswers,
      });
    }
    
    // Special handling for campaign settings step
    if (currentStepIndex === stepsConfig.CAMPAIGN_SETTINGS) {
      return stepProcessorService.processCampaignSettingsStep({
        userAnswer,
        currentIntentKey,
        collectedAnswers,
      });
    }
    
    // Store the answer in collectedAnswers
    const updatedAnswers = {
      ...collectedAnswers,
      [currentIntentKey]: userAnswer,
    };
    
    // CRITICAL FIX: Handle confirmation step - mark as completed instead of moving to next step
    if (currentStepIndex === stepsConfig.CONFIRMATION || currentIntentKey === 'confirmation') {
      logger.debug('[AICICPAssistantService] Confirmation step answered - marking flow as completed');
      return {
        clarificationNeeded: false,
        message: 'Great! Your campaign setup is complete.',
        nextStepIndex: null,
        nextQuestion: null,
        completed: true,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // CRITICAL FIX: Handle per-platform delay configuration
    if (currentStepIndex === stepsConfig.WORKFLOW_DELAYS) {
      // Track which platform just got delay configured
      const completedDelayPlatforms = updatedAnswers.completed_delay_platforms || [];
      const currentPlatform = currentIntentKey.replace('_delay', '');
      
      // Check if this is a platform-specific delay (e.g., linkedin_delay)
      if (currentIntentKey.endsWith('_delay') && !completedDelayPlatforms.includes(currentPlatform)) {
        completedDelayPlatforms.push(currentPlatform);
        updatedAnswers.completed_delay_platforms = completedDelayPlatforms;
        logger.debug('[AICICPAssistantService] Platform delay configured', { currentPlatform, completedDelayPlatforms });
      }
      
      // Check if all platforms have delays configured
      const platformsWithActions = updatedAnswers.completed_platform_actions || [];
      const allDelaysConfigured = platformsWithActions.length > 0 && 
                                   platformsWithActions.every(p => completedDelayPlatforms.includes(p));
      
      if (allDelaysConfigured || currentIntentKey === 'workflow_delays') {
        // All delays done, skip workflow_conditions and move to campaign goal
        updatedAnswers.workflow_conditions = stepsConfig.DEFAULT_WORKFLOW_CONDITIONS;
        logger.debug('[AICICPAssistantService] All delays configured, moving to campaign goal');
        
        const nextQuestion = this.getQuestionByStep(stepsConfig.CAMPAIGN_GOAL, updatedAnswers);
        return {
          clarificationNeeded: false,
          message: null,
          nextStepIndex: stepsConfig.CAMPAIGN_GOAL,
          nextQuestion,
          completed: false,
          updatedCollectedAnswers: updatedAnswers,
        };
      } else {
        // More platforms need delay, stay on workflow_delays step
        logger.debug('[AICICPAssistantService] More platforms need delay configuration');
        const nextQuestion = this.getQuestionByStep(stepsConfig.WORKFLOW_DELAYS, updatedAnswers);
        return {
          clarificationNeeded: false,
          message: null,
          nextStepIndex: stepsConfig.WORKFLOW_DELAYS,
          nextQuestion,
          completed: false,
          updatedCollectedAnswers: updatedAnswers,
        };
      }
    }
    
    // Analyze answer using Gemini
    const analysis = await intentAnalyzerService.analyzeAnswer({
      userAnswer,
      currentStepIndex,
      currentIntentKey,
      currentQuestion,
      collectedAnswers: updatedAnswers,
    });
    
    // Use corrected answer if available
    const finalAnswer = analysis.correctedAnswer || userAnswer;
    
    // Update answers with final (corrected) answer
    const finalUpdatedAnswers = {
      ...collectedAnswers,
      [currentIntentKey]: finalAnswer,
    };
    
    if (analysis.clarificationNeeded) {
      return {
        clarificationNeeded: true,
        message: analysis.clarificationMessage,
        nextStepIndex: null,
        nextQuestion: null,
        completed: false,
        correctedAnswer: analysis.correctedAnswer || null,
      };
    }
    
    // Determine next step
    const suggested = Number.isInteger(analysis.nextStepIndex) ? analysis.nextStepIndex : null;
    const minNext = currentStepIndex + 1;
    const maxNext = onboardingConfig.steps.total;

    let nextStepIndex;
    if (suggested === null) {
      nextStepIndex = minNext;
    } else {
      nextStepIndex = Math.max(minNext, Math.min(suggested, maxNext));
      if (nextStepIndex !== suggested) {
        logger.warn(`[AICICPAssistantService] Clamped nextStepIndex from ${suggested} to ${nextStepIndex}`);
      }
    }
    
    // CRITICAL FIX: Skip workflow_conditions step
    if (nextStepIndex === stepsConfig.WORKFLOW_CONDITIONS) {
      logger.debug('[AICICPAssistantService] Skipping workflow_conditions step, moving to campaign goal');
      finalUpdatedAnswers.workflow_conditions = stepsConfig.DEFAULT_WORKFLOW_CONDITIONS;
      nextStepIndex = stepsConfig.CAMPAIGN_GOAL;
    }

    const nextQuestion = this.getQuestionByStep(nextStepIndex, {
      ...finalUpdatedAnswers,
      subStepIndex: analysis.extractedData?.subStepIndex,
    });
    
    return {
      clarificationNeeded: false,
      message: null,
      nextStepIndex,
      nextQuestion,
      completed: nextStepIndex > onboardingConfig.steps.total,
      updatedCollectedAnswers: finalUpdatedAnswers,
      correctedAnswer: analysis.correctedAnswer || null,
    };
  }

  /**
   * Get platform actions question (Step 5)
   * 
   * Flow for each platform: actions → template
   * After completing a platform (actions + template), if there's a NEXT platform,
   * ask for delay BETWEEN them before proceeding to next platform.
   * 
   * Example with LinkedIn, WhatsApp, Email:
   * 1. LinkedIn actions → LinkedIn template
   * 2. "How much delay between LinkedIn and WhatsApp?" (delay_linkedin_whatsapp)
   * 3. WhatsApp actions → WhatsApp template  
   * 4. "How much delay between WhatsApp and Email?" (delay_whatsapp_email)
   * 5. Email actions → Email template
   * 6. Done (no delay after last platform)
   */
  _getPlatformActionsQuestion(context) {
    const platformProgressionService = require('./platform-progression.service');
    const templateHandlerService = require('./template-handler.service');
    const platformHandlerService = require('./platform-handler.service');
    
    const completedActions = context.completed_platform_actions || [];
    const normalizedSelectedPlatforms = platformHandlerService.normalizePlatforms(
      context.selected_platforms
    );
    
    const platformDisplayNames = {
      linkedin: 'LinkedIn',
      email: 'Email',
      whatsapp: 'WhatsApp',
      voice: 'Voice Calls'
    };
    
    const delayOptions = [
      'No delay (run immediately)',
      '1 hour delay',
      '2 hours delay', 
      '1 day delay',
      '2 days delay',
      'Custom delay',
    ];
    
    // Find next platform that needs actions
    const nextPlatform = platformProgressionService.findNextPlatform(
      normalizedSelectedPlatforms,
      completedActions
    );
    
    if (nextPlatform) {
      const actionKey = `${nextPlatform}_actions`;
      const templateKey = `${nextPlatform}_template`;
      const hasActions = context[actionKey] !== undefined && context[actionKey] !== '';
      const hasTemplate = context[templateKey] !== undefined;
      
      // If platform has actions but needs template, ask for template
      if (hasActions && !hasTemplate) {
        const actionAnswer = String(context[actionKey] || '');
        const needsTemplate = templateHandlerService.needsTemplate(nextPlatform, actionAnswer);
        
        if (needsTemplate) {
          return templateHandlerService.createTemplateQuestion(nextPlatform, actionAnswer);
        }
        
        // Template not needed - mark platform as complete and check for next
        // This platform is done, add to completed if not already
        if (!completedActions.includes(nextPlatform)) {
          completedActions.push(nextPlatform);
          context.completed_platform_actions = completedActions;
        }
      }
      
      // If platform has both actions and template, it's complete
      if (hasActions && hasTemplate) {
        // Platform is complete - add to completed if not already
        if (!completedActions.includes(nextPlatform)) {
          completedActions.push(nextPlatform);
          context.completed_platform_actions = completedActions;
        }
        
        // Find the NEXT platform after this one
        const currentPlatformIndex = normalizedSelectedPlatforms.indexOf(nextPlatform);
        const followingPlatform = normalizedSelectedPlatforms[currentPlatformIndex + 1];
        
        // If there's a following platform, ask for delay BETWEEN them
        if (followingPlatform) {
          const delayKey = `delay_${nextPlatform}_${followingPlatform}`;
          const hasDelayBetween = context[delayKey] !== undefined;
          
          if (!hasDelayBetween) {
            const currentPlatformName = platformDisplayNames[nextPlatform] || nextPlatform;
            const nextPlatformName = platformDisplayNames[followingPlatform] || followingPlatform;
            
            logger.debug(`[AICICPAssistantService] Asking for delay between ${currentPlatformName} and ${nextPlatformName}`);
            
            return {
              question: `What delay do you want between ${currentPlatformName} and ${nextPlatformName}?\n\nThis controls how long to wait after completing ${currentPlatformName} actions before starting ${nextPlatformName} actions.\n\nOptions:\n${delayOptions.map(opt => `• ${opt}`).join('\n')}`,
              helperText: `Set timing between ${currentPlatformName} → ${nextPlatformName}`,
              stepIndex: stepsConfig.PLATFORM_FEATURES,
              intentKey: delayKey,
              title: `Delay: ${currentPlatformName} → ${nextPlatformName}`,
              questionType: 'select',
              options: delayOptions,
              allowSkip: false,
            };
          }
        }
        
        // No following platform or delay already set - continue to next platform's actions
        const nextUncompletedPlatform = platformProgressionService.findNextPlatform(
          normalizedSelectedPlatforms,
          completedActions
        );
        
        if (nextUncompletedPlatform) {
          return questionGeneratorService.generatePlatformActionsQuestion(
            normalizedSelectedPlatforms,
            completedActions,
            context
          );
        }
      }
      
      // Platform doesn't have actions yet - ask for actions
      return questionGeneratorService.generatePlatformActionsQuestion(
        normalizedSelectedPlatforms,
        completedActions,
        context
      );
    }
    
    // All platforms have actions - check if any need templates
    for (const platform of completedActions) {
      const templateKey = `${platform}_template`;
      const actionKey = `${platform}_actions`;
      const hasTemplate = context[templateKey] !== undefined;
      
      if (!hasTemplate) {
        const actionAnswer = String(context[actionKey] || '');
        const needsTemplate = templateHandlerService.needsTemplate(platform, actionAnswer);
        
        if (needsTemplate) {
          return templateHandlerService.createTemplateQuestion(platform, actionAnswer);
        }
      }
    }
    
    // All platforms have actions and templates - check for delays BETWEEN platforms
    for (let i = 0; i < normalizedSelectedPlatforms.length - 1; i++) {
      const currentPlatform = normalizedSelectedPlatforms[i];
      const nextPlatform = normalizedSelectedPlatforms[i + 1];
      const delayKey = `delay_${currentPlatform}_${nextPlatform}`;
      
      if (context[delayKey] === undefined) {
        const currentPlatformName = platformDisplayNames[currentPlatform] || currentPlatform;
        const nextPlatformName = platformDisplayNames[nextPlatform] || nextPlatform;
        
        logger.debug(`[AICICPAssistantService] Asking for delay between ${currentPlatformName} and ${nextPlatformName}`);
        
        return {
          question: `What delay do you want between ${currentPlatformName} and ${nextPlatformName}?\n\nThis controls how long to wait after completing ${currentPlatformName} actions before starting ${nextPlatformName} actions.\n\nOptions:\n${delayOptions.map(opt => `• ${opt}`).join('\n')}`,
          helperText: `Set timing between ${currentPlatformName} → ${nextPlatformName}`,
          stepIndex: stepsConfig.PLATFORM_FEATURES,
          intentKey: delayKey,
          title: `Delay: ${currentPlatformName} → ${nextPlatformName}`,
          questionType: 'select',
          options: delayOptions,
          allowSkip: false,
        };
      }
    }
    
    // All platforms complete with actions, templates, and delays between them
    logger.debug('[AICICPAssistantService] All platforms complete - moving to next step');
    
    // Skip workflow delays step (step 6) and workflow conditions (step 7), go directly to campaign goal (step 8)
    context.workflow_delays = 'configured_between_platforms';
    context.workflow_conditions = stepsConfig.DEFAULT_WORKFLOW_CONDITIONS;
    return questionGeneratorService.generateQuestion(stepsConfig.CAMPAIGN_GOAL, context);
  }

  /**
   * Get campaign settings question (Step 10)
   */
  _getCampaignSettingsQuestion(context) {
    const hasCampaignDays = context.campaign_days !== undefined && context.campaign_days !== '';
    const hasWorkingDays = context.working_days !== undefined && context.working_days !== '';
    const hasLeadsPerDay = context.leads_per_day !== undefined && context.leads_per_day !== '';
    
    // If all answered, move to confirmation
    if (hasCampaignDays && hasWorkingDays && hasLeadsPerDay) {
      return questionGeneratorService.generateConfirmationStep(context);
    }
    
    // Determine which sub-step to ask
    let subStepIndex;
    if (!hasCampaignDays) {
      subStepIndex = stepsConfig.CAMPAIGN_DAYS_SUBSTEP;
    } else if (!hasWorkingDays) {
      subStepIndex = stepsConfig.WORKING_DAYS_SUBSTEP;
    } else if (!hasLeadsPerDay) {
      subStepIndex = stepsConfig.LEADS_PER_DAY_SUBSTEP;
    }
    
    return questionGeneratorService.generateQuestion(stepsConfig.CAMPAIGN_SETTINGS, {
      ...context,
      subStepIndex,
    });
  }

  /**
   * Get total steps count
   */
  getTotalSteps() {
    return onboardingConfig.steps.total;
  }
}

module.exports = new AICICPAssistantService();
