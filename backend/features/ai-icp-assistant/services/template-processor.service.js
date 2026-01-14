/**
 * Template Processor Service
 * 
 * Handles template answer processing logic.
 * Extracted from ai-icp-assistant.service.js to follow single responsibility.
 * NO HTTP logic, NO database access - pure business logic.
 */

const questionGeneratorService = require('./question-generator.service');
const platformProgressionService = require('./platform-progression.service');
const templateHandlerService = require('./template-handler.service');
const stepsConfig = require('../config/steps.config');
const logger = require('../utils/logger');

class TemplateProcessorService {
  /**
   * Process template answer
   * 
   * After completing a platform's template, if there's a NEXT platform,
   * ask for delay BETWEEN them before proceeding to next platform.
   */
  processTemplateAnswer({ userAnswer, currentIntentKey, collectedAnswers }) {
    const platformKey = currentIntentKey.replace('_template', '');
    const normalizedPlatformKey = String(platformKey).toLowerCase();
    const platformHandlerService = require('./platform-handler.service');
    const selectedPlatforms = platformHandlerService.normalizePlatforms(
      collectedAnswers.selected_platforms || []
    );
    
    logger.debug(`[TemplateProcessor] Processing template for: ${normalizedPlatformKey}`);
    
    // Validate platform is selected
    if (!selectedPlatforms.includes(normalizedPlatformKey)) {
      return this._handlePlatformMismatch(selectedPlatforms, collectedAnswers);
    }
    
    const templateValue = templateHandlerService.processTemplateAnswer(userAnswer);
    
    const updatedAnswers = {
      ...collectedAnswers,
      [currentIntentKey]: templateValue,
    };
    
    // Mark platform as completed
    const completedActions = (updatedAnswers.completed_platform_actions || [])
      .map(p => String(p).toLowerCase());
    
    if (!completedActions.includes(normalizedPlatformKey)) {
      updatedAnswers.completed_platform_actions = [...completedActions, normalizedPlatformKey];
    }
    
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
    
    // Find the position of current platform and check if there's a NEXT platform
    const currentPlatformIndex = selectedPlatforms.indexOf(normalizedPlatformKey);
    const nextPlatformInSequence = selectedPlatforms[currentPlatformIndex + 1];
    
    // If there's a next platform in sequence, ask for delay BETWEEN them
    if (nextPlatformInSequence) {
      const delayKey = `delay_${normalizedPlatformKey}_${nextPlatformInSequence}`;
      const hasDelayBetween = updatedAnswers[delayKey] !== undefined;
      
      if (!hasDelayBetween) {
        const currentPlatformName = platformDisplayNames[normalizedPlatformKey] || normalizedPlatformKey;
        const nextPlatformName = platformDisplayNames[nextPlatformInSequence] || nextPlatformInSequence;
        
        logger.debug(`[TemplateProcessor] Platform ${currentPlatformName} complete, asking for delay before ${nextPlatformName}`);
        
        return {
          clarificationNeeded: false,
          message: null,
          nextStepIndex: stepsConfig.PLATFORM_FEATURES,
          nextQuestion: {
            question: `What delay do you want between ${currentPlatformName} and ${nextPlatformName}?\n\nThis controls how long to wait after completing ${currentPlatformName} actions before starting ${nextPlatformName} actions.\n\nOptions:\n${delayOptions.map(opt => `• ${opt}`).join('\n')}`,
            helperText: `Set timing between ${currentPlatformName} → ${nextPlatformName}`,
            stepIndex: stepsConfig.PLATFORM_FEATURES,
            intentKey: delayKey,
            title: `Delay: ${currentPlatformName} → ${nextPlatformName}`,
            questionType: 'select',
            options: delayOptions,
            allowSkip: false,
          },
          completed: false,
          updatedCollectedAnswers: updatedAnswers,
        };
      }
    }
    
    // Check if all platforms are done
    const allDone = platformProgressionService.areAllPlatformsCompleted(
      selectedPlatforms,
      updatedAnswers.completed_platform_actions
    );
    
    if (allDone) {
      // All platforms complete - skip to campaign goal
      updatedAnswers.workflow_delays = 'configured_between_platforms';
      updatedAnswers.workflow_conditions = stepsConfig.DEFAULT_WORKFLOW_CONDITIONS;
      
      const nextQuestion = questionGeneratorService.generateQuestion(stepsConfig.CAMPAIGN_GOAL, updatedAnswers);
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.CAMPAIGN_GOAL,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // Find next platform that needs actions
    const nextPlatform = platformProgressionService.findNextPlatform(
      selectedPlatforms,
      updatedAnswers.completed_platform_actions
    );
    
    if (nextPlatform) {
      // Ask for actions for next platform
      const nextQuestion = questionGeneratorService.generatePlatformActionsQuestion(
        selectedPlatforms,
        updatedAnswers.completed_platform_actions,
        updatedAnswers
      );
      
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.PLATFORM_FEATURES,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // Fallback: move to campaign goal
    updatedAnswers.workflow_delays = 'configured_between_platforms';
    updatedAnswers.workflow_conditions = stepsConfig.DEFAULT_WORKFLOW_CONDITIONS;
    
    const nextQuestion = questionGeneratorService.generateQuestion(stepsConfig.CAMPAIGN_GOAL, updatedAnswers);
    return {
      clarificationNeeded: false,
      message: null,
      nextStepIndex: stepsConfig.CAMPAIGN_GOAL,
      nextQuestion,
      completed: false,
      updatedCollectedAnswers: updatedAnswers,
    };
  }

  /**
   * Handle platform mismatch error
   */
  _handlePlatformMismatch(selectedPlatforms, collectedAnswers) {
    const completedActions = (collectedAnswers.completed_platform_actions || [])
      .map(p => String(p).toLowerCase());
    const nextPlatform = selectedPlatforms.find(p => !completedActions.includes(p));
    
    if (nextPlatform) {
      const nextQuestion = questionGeneratorService.generatePlatformActionsQuestion(
        selectedPlatforms,
        completedActions,
        collectedAnswers
      );
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: 5,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: collectedAnswers,
      };
    }
    
    return {
      clarificationNeeded: false,
      message: null,
      nextStepIndex: 5,
      nextQuestion: null,
      completed: false,
      updatedCollectedAnswers: collectedAnswers,
    };
  }
}

module.exports = new TemplateProcessorService();

