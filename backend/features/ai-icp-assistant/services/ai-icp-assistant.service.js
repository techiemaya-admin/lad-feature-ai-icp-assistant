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
    
    // CRITICAL FIX: Automatically skip workflow_conditions step
    if (currentStepIndex === stepsConfig.WORKFLOW_DELAYS && currentIntentKey === 'workflow_delays') {
      updatedAnswers.workflow_conditions = stepsConfig.DEFAULT_WORKFLOW_CONDITIONS;
      logger.debug('[AICICPAssistantService] Auto-skipping workflow_conditions, moving to campaign goal');
      
      const nextQuestion = this.getQuestionByStep(stepsConfig.CAMPAIGN_GOAL, updatedAnswers);
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.CAMPAIGN_GOAL,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // Analyze answer using Gemini
    const analysis = await intentAnalyzerService.analyzeAnswer({
      userAnswer,
      currentStepIndex,
      currentIntentKey,
      currentQuestion,
      collectedAnswers: updatedAnswers,
    });
    
    if (analysis.clarificationNeeded) {
      return {
        clarificationNeeded: true,
        message: analysis.clarificationMessage,
        nextStepIndex: null,
        nextQuestion: null,
        completed: false,
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
      updatedAnswers.workflow_conditions = stepsConfig.DEFAULT_WORKFLOW_CONDITIONS;
      nextStepIndex = stepsConfig.CAMPAIGN_GOAL;
    }

    const nextQuestion = this.getQuestionByStep(nextStepIndex, {
      ...updatedAnswers,
      subStepIndex: analysis.extractedData?.subStepIndex,
    });
    
    return {
      clarificationNeeded: false,
      message: null,
      nextStepIndex,
      nextQuestion,
      completed: nextStepIndex > onboardingConfig.steps.total,
      updatedCollectedAnswers: updatedAnswers,
    };
  }

  /**
   * Get platform actions question (Step 5)
   */
  _getPlatformActionsQuestion(context) {
    const platformProgressionService = require('./platform-progression.service');
    const templateHandlerService = require('./template-handler.service');
    const platformHandlerService = require('./platform-handler.service');
    const completedActions = context.completed_platform_actions || [];
    const normalizedSelectedPlatforms = platformHandlerService.normalizePlatforms(
      context.selected_platforms
    );
    
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
      
      // If platform has actions but no template, and template is needed, ask for template
      if (hasActions && !hasTemplate) {
        const actionAnswer = String(context[actionKey] || '');
        const needsTemplate = templateHandlerService.needsTemplate(nextPlatform, actionAnswer);
        
        if (needsTemplate) {
          return templateHandlerService.createTemplateQuestion(nextPlatform, actionAnswer);
        }
      }
      
      // Otherwise, ask for actions for this platform
      return questionGeneratorService.generatePlatformActionsQuestion(
        normalizedSelectedPlatforms,
        completedActions,
        context
      );
    }
    
    // All platforms have actions - check if any need templates
    const platformNeedingTemplate = platformProgressionService.findPlatformNeedingTemplate(
      normalizedSelectedPlatforms,
      completedActions,
      context
    );
    
    if (platformNeedingTemplate) {
      const actionKey = `${platformNeedingTemplate}_actions`;
      const actionAnswer = String(context[actionKey] || '');
      return templateHandlerService.createTemplateQuestion(platformNeedingTemplate, actionAnswer);
    }
    
    // All platforms are complete, move to next step
    return questionGeneratorService.generateQuestion(stepsConfig.WORKFLOW_DELAYS, context);
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
