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
const logger = require('../utils/logger');

class TemplateProcessorService {
  /**
   * Process template answer
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
    
    // Check if all platforms are done
    const allDone = platformProgressionService.areAllPlatformsCompleted(
      selectedPlatforms,
      updatedAnswers.completed_platform_actions
    );
    
    if (allDone) {
      const nextQuestion = questionGeneratorService.generateQuestion(6, updatedAnswers);
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: 6,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // Find next platform
    const nextPlatform = platformProgressionService.findNextPlatform(
      selectedPlatforms,
      updatedAnswers.completed_platform_actions
    );
    
    if (nextPlatform) {
      // Check if next platform needs template
      const nextActionKey = `${nextPlatform}_actions`;
      const nextTemplateKey = `${nextPlatform}_template`;
      const hasNextActions = updatedAnswers[nextActionKey] !== undefined && 
                            updatedAnswers[nextActionKey] !== '';
      const hasNextTemplate = updatedAnswers[nextTemplateKey] !== undefined;
      
      if (hasNextActions && !hasNextTemplate) {
        const actionAnswer = String(updatedAnswers[nextActionKey] || '');
        const needsTemplate = templateHandlerService.needsTemplate(nextPlatform, actionAnswer);
        
        if (needsTemplate) {
          const templateQuestion = templateHandlerService.createTemplateQuestion(
            nextPlatform,
            actionAnswer
          );
          return {
            clarificationNeeded: false,
            message: null,
            nextStepIndex: 5,
            nextQuestion: templateQuestion,
            completed: false,
            updatedCollectedAnswers: updatedAnswers,
          };
        }
      }
      
      // Ask for actions for next platform
      const nextQuestion = questionGeneratorService.generatePlatformActionsQuestion(
        selectedPlatforms,
        updatedAnswers.completed_platform_actions,
        updatedAnswers
      );
      
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: 5,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // Fallback: move to next step
    const nextQuestion = questionGeneratorService.generateQuestion(6, updatedAnswers);
    return {
      clarificationNeeded: false,
      message: null,
      nextStepIndex: 6,
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

