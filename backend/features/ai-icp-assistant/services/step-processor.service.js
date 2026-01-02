/**
 * Step Processor Service
 * 
 * Handles step-specific processing logic.
 * Extracted from ai-icp-assistant.service.js to follow single responsibility.
 * NO HTTP logic, NO database access - pure business logic.
 */
const questionGeneratorService = require('./question-generator.service');
const platformProgressionService = require('./platform-progression.service');
const templateHandlerService = require('./template-handler.service');
const stepsConfig = require('../config/steps.config');
const logger = require('../utils/logger');
class StepProcessorService {
  /**
   * Process platform actions step (Step 5)
   */
  processPlatformActionsStep({ userAnswer, currentIntentKey, collectedAnswers }) {
    const platformKey = currentIntentKey.replace('_actions', '');
    const platformHandlerService = require('./platform-handler.service');
    const selectedPlatforms = platformHandlerService.normalizePlatforms(
      collectedAnswers.selected_platforms || []
    );
    const normalizedPlatformKey = String(platformKey).toLowerCase();
    logger.debug(`[StepProcessor] Processing platform actions - platform: ${normalizedPlatformKey}`);
    // Validate platform is selected
    if (!selectedPlatforms.includes(normalizedPlatformKey)) {
      return this._handlePlatformMismatch(selectedPlatforms, collectedAnswers);
    }
    
    // Match actions
    const matched = this._matchActions(normalizedPlatformKey, userAnswer);
    if (matched.length === 0) {
      return this._requestActionClarification(normalizedPlatformKey, currentIntentKey, collectedAnswers);
    }
    
    // CRITICAL: Auto-remove dependent actions when required actions are removed
    const cleanedActions = this._autoRemoveDependentActions(
      normalizedPlatformKey,
      matched
    );
    // Store cleaned actions (with dependencies auto-removed)
    const updatedAnswers = {
      ...collectedAnswers,
      [currentIntentKey]: cleanedActions.join(', '),
    };
    // Check if template is needed
    const cleanedActionsString = cleanedActions.join(', ');
    const needsTemplate = templateHandlerService.needsTemplate(normalizedPlatformKey, cleanedActionsString);
    if (needsTemplate) {
      const templateQuestion = templateHandlerService.createTemplateQuestion(
        normalizedPlatformKey,
        cleanedActions.join(', ')
      );
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.PLATFORM_ACTIONS,
        nextQuestion: templateQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // Mark platform as completed
    const completedActions = (collectedAnswers.completed_platform_actions || [])
      .map(p => String(p).toLowerCase());
    const finalCompletedActions = completedActions.includes(normalizedPlatformKey)
      ? completedActions
      : [...completedActions, normalizedPlatformKey];
    updatedAnswers.completed_platform_actions = finalCompletedActions;
    // Check if all platforms are done
    const allDone = platformProgressionService.areAllPlatformsCompleted(
      selectedPlatforms,
      finalCompletedActions
    );
    if (allDone) {
      const nextQuestion = questionGeneratorService.generateQuestion(
        stepsConfig.WORKFLOW_DELAYS,
        updatedAnswers
      );
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.WORKFLOW_DELAYS,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
    
    // More platforms need actions
    const nextQuestion = questionGeneratorService.generatePlatformActionsQuestion(
      selectedPlatforms,
      finalCompletedActions,
      updatedAnswers
    );
    return {
      clarificationNeeded: false,
      message: null,
      nextStepIndex: stepsConfig.PLATFORM_ACTIONS,
      nextQuestion,
      completed: false,
      updatedCollectedAnswers: updatedAnswers,
    };
  }
  /**
   * Handle platform mismatch error
   */
  _handlePlatformMismatch(selectedPlatforms, collectedAnswers) {
    const completedPlatforms = (collectedAnswers.completed_platform_actions || [])
      .map(p => String(p).toLowerCase());
    const nextPlatform = selectedPlatforms.find(p => !completedPlatforms.includes(p));
    if (nextPlatform) {
      const nextQuestion = questionGeneratorService.generatePlatformActionsQuestion(
        selectedPlatforms,
        completedPlatforms,
        collectedAnswers
      );
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.PLATFORM_ACTIONS,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: collectedAnswers,
      };
    }
    
    const nextQuestion = questionGeneratorService.generateQuestion(
      stepsConfig.WORKFLOW_DELAYS,
      collectedAnswers
    );
    return {
      clarificationNeeded: false,
      message: null,
      nextStepIndex: stepsConfig.WORKFLOW_DELAYS,
      nextQuestion,
      completed: false,
      updatedCollectedAnswers: collectedAnswers,
    };
  }

  /**
   * Validate LinkedIn action dependencies (legacy - kept for backward compatibility)
   */
  _validateLinkedInDependencies(platformKey, userAnswer, currentIntentKey) {
    // This is now handled by _validateActionDependencies
    return null;
  }

  /**
   * Auto-remove dependent actions when required actions are removed
   * Returns cleaned actions array
   */
  _autoRemoveDependentActions(platformKey, selectedActions) {
    const actionsLower = selectedActions.map(a => String(a).toLowerCase());
    let cleaned = [...selectedActions];
    // LinkedIn: Remove "Send message (after accepted)" if "Send connection request" is removed
    if (platformKey === 'linkedin') {
      const hasConnectionRequest = actionsLower.some(a => 
        a.includes('connection request') || a.includes('connect')
      );
      if (!hasConnectionRequest) {
        // Remove message action if connection request is not present
        cleaned = cleaned.filter(a => {
          const aLower = String(a).toLowerCase();
          return !(aLower.includes('message') && aLower.includes('after accepted'));
        });
      }
    }
    
    // WhatsApp: Remove follow-up messages if initial message is removed
    if (platformKey === 'whatsapp') {
      const hasInitialMessage = actionsLower.some(a => 
        (a.includes('message') || a.includes('broadcast')) && 
        !a.includes('follow-up') && !a.includes('follow up')
      );
      if (!hasInitialMessage) {
        // Remove follow-up actions
        cleaned = cleaned.filter(a => {
          const aLower = String(a).toLowerCase();
          return !(aLower.includes('follow-up') || aLower.includes('follow up'));
        });
      }
    }
    
    // Email: Remove follow-up emails if initial email is removed
    if (platformKey === 'email') {
      const hasInitialEmail = actionsLower.some(a => 
        (a.includes('send') || a.includes('email')) && 
        !a.includes('follow-up') && !a.includes('follow up')
      );
      if (!hasInitialEmail) {
        // Remove follow-up actions
        cleaned = cleaned.filter(a => {
          const aLower = String(a).toLowerCase();
          return !(aLower.includes('follow-up') || aLower.includes('follow up'));
        });
      }
    }
    
    // Voice: Remove follow-up calls if initial call is removed
    if (platformKey === 'voice') {
      const hasInitialCall = actionsLower.some(a => 
        (a.includes('call') || a.includes('trigger')) && 
        !a.includes('follow-up') && !a.includes('follow up')
      );
      if (!hasInitialCall) {
        // Remove follow-up actions
        cleaned = cleaned.filter(a => {
          const aLower = String(a).toLowerCase();
          return !(aLower.includes('follow-up') || aLower.includes('follow up'));
        });
      }
    }
    return cleaned;
  }

  /**
   * Validate action dependencies for all platforms
   * Checks if user removed required dependencies
   * @deprecated - Use _autoRemoveDependentActions instead
   */
  _validateActionDependencies(platformKey, selectedActions, currentIntentKey) {
    const actionsLower = selectedActions.map(a => String(a).toLowerCase());
    // LinkedIn: "Send message (after accepted)" requires "Send connection request"
    if (platformKey === 'linkedin') {
      const hasMessage = actionsLower.some(a => 
        a.includes('message') && a.includes('after accepted')
      );
      const hasConnectionRequest = actionsLower.some(a => 
        a.includes('connection request') || a.includes('connect')
      );
      if (hasMessage && !hasConnectionRequest) {
        return {
          clarificationNeeded: true,
          message: 'LinkedIn message requires a connection request first.',
          nextStepIndex: stepsConfig.PLATFORM_ACTIONS,
          nextQuestion: {
            question: `⚠️ Action Dependency Error\n\nYou selected "Send message (after accepted)" but removed "Send connection request".\n\nLinkedIn messages can only be sent after a connection is accepted. You must either:\n\n1. Keep "Send connection request" in your actions\n2. Remove "Send message (after accepted)" from your actions\n\nPlease modify your selection accordingly.`,
            intentKey: currentIntentKey,
            stepIndex: stepsConfig.PLATFORM_ACTIONS,
            questionType: 'text',
            allowSkip: false,
          },
          completed: false,
          updatedCollectedAnswers: {},
        };
      }
    }
    
    // WhatsApp: Follow-up messages require an initial message
    if (platformKey === 'whatsapp') {
      const hasFollowUp = actionsLower.some(a => a.includes('follow-up') || a.includes('follow up'));
      const hasInitialMessage = actionsLower.some(a => 
        (a.includes('message') || a.includes('broadcast')) && !a.includes('follow-up') && !a.includes('follow up')
      );
      if (hasFollowUp && !hasInitialMessage) {
        return {
          clarificationNeeded: true,
          message: 'WhatsApp follow-up requires an initial message first.',
          nextStepIndex: stepsConfig.PLATFORM_ACTIONS,
          nextQuestion: {
            question: `⚠️ Action Dependency Error\n\nYou selected follow-up messages but removed the initial message action.\n\nFollow-up messages require an initial message to be sent first. You must either:\n\n1. Keep an initial message action (e.g., "Send message" or "Broadcast message")\n2. Remove follow-up actions from your selection\n\nPlease modify your selection accordingly.`,
            intentKey: currentIntentKey,
            stepIndex: stepsConfig.PLATFORM_ACTIONS,
            questionType: 'text',
            allowSkip: false,
          },
          completed: false,
          updatedCollectedAnswers: {},
        };
      }
    }
    
    // Email: Follow-up emails require an initial email
    if (platformKey === 'email') {
      const hasFollowUp = actionsLower.some(a => a.includes('follow-up') || a.includes('follow up'));
      const hasInitialEmail = actionsLower.some(a => 
        (a.includes('send') || a.includes('email')) && !a.includes('follow-up') && !a.includes('follow up')
      );
      if (hasFollowUp && !hasInitialEmail) {
        return {
          clarificationNeeded: true,
          message: 'Email follow-up requires an initial email first.',
          nextStepIndex: stepsConfig.PLATFORM_ACTIONS,
          nextQuestion: {
            question: `⚠️ Action Dependency Error\n\nYou selected follow-up emails but removed the initial email action.\n\nFollow-up emails require an initial email to be sent first. You must either:\n\n1. Keep an initial email action (e.g., "Send email")\n2. Remove follow-up actions from your selection\n\nPlease modify your selection accordingly.`,
            intentKey: currentIntentKey,
            stepIndex: stepsConfig.PLATFORM_ACTIONS,
            questionType: 'text',
            allowSkip: false,
          },
          completed: false,
          updatedCollectedAnswers: {},
        };
      }
    }
    
    // Voice: Follow-up calls require an initial call
    if (platformKey === 'voice') {
      const hasFollowUp = actionsLower.some(a => a.includes('follow-up') || a.includes('follow up'));
      const hasInitialCall = actionsLower.some(a => 
        (a.includes('call') || a.includes('auto call')) && !a.includes('follow-up') && !a.includes('follow up')
      );
      if (hasFollowUp && !hasInitialCall) {
        return {
          clarificationNeeded: true,
          message: 'Voice follow-up requires an initial call first.',
          nextStepIndex: stepsConfig.PLATFORM_ACTIONS,
          nextQuestion: {
            question: `⚠️ Action Dependency Error\n\nYou selected follow-up calls but removed the initial call action.\n\nFollow-up calls require an initial call to be made first. You must either:\n\n1. Keep an initial call action (e.g., "Auto call")\n2. Remove follow-up actions from your selection\n\nPlease modify your selection accordingly.`,
            intentKey: currentIntentKey,
            stepIndex: stepsConfig.PLATFORM_ACTIONS,
            questionType: 'text',
            allowSkip: false,
          },
          completed: false,
          updatedCollectedAnswers: {},
        };
      }
    }
    return null;
  }

  /**
   * Match user answer to allowed actions
   */
  _matchActions(platformKey, userAnswer) {
    const platformHandlerService = require('./platform-handler.service');
    const platformConfig = platformHandlerService.getPlatformConfig(platformKey);
    const allowedActions = platformConfig.actions || [];
    const normalize = s => String(s || '').toLowerCase().trim();
    const provided = normalize(userAnswer);
    return allowedActions.filter(a => {
      const actionLower = normalize(a);
      if (provided.includes(actionLower)) return true;
      const normalizeSpecialChars = (str) => 
        str.replace(/[:-\s]+/g, ' ').replace(/\s+/g, ' ').trim();
      const normalizedAction = normalizeSpecialChars(actionLower);
      const normalizedProvided = normalizeSpecialChars(provided);
      if (normalizedProvided.includes(normalizedAction)) return true;
      const actionWords = normalizedAction.split(/\s+/).filter(w => w.length > 0);
      const providedWords = normalizedProvided.split(/\s+/);
      const significantWords = actionWords.filter(
        w => w.length > 1 && !['send', 'the', 'a', 'an'].includes(w)
      );
      if (significantWords.length > 0 && 
          significantWords.every(word => 
            providedWords.some(pw => pw.includes(word) || word.includes(pw))
          )) {
        return true;
      }
      return false;
    });
  }

  /**
   * Process Campaign Settings Step (Step 10) - handles campaign_days, working_days, leads_per_day sub-steps
   */
  processCampaignSettingsStep({ userAnswer, currentIntentKey, collectedAnswers }) {
    const questionGeneratorService = require('./question-generator.service');
    const logger = require('../utils/logger');
    logger.debug(`[StepProcessor] Processing campaign settings - intentKey: ${currentIntentKey}, answer: ${userAnswer}`);
    // Update collected answers with current answer
    const updatedAnswers = {
      ...collectedAnswers,
      [currentIntentKey]: userAnswer,
    };
    // Check what sub-steps are completed
    const hasCampaignDays = !!(updatedAnswers.campaign_days || updatedAnswers.campaign_settings?.campaign_days);
    const hasWorkingDays = !!(updatedAnswers.working_days || updatedAnswers.campaign_settings?.working_days);
    const hasLeadsPerDay = !!(updatedAnswers.leads_per_day || updatedAnswers.campaign_settings?.leads_per_day);
    logger.debug(`[StepProcessor] Sub-steps status - campaign_days: ${hasCampaignDays}, working_days: ${hasWorkingDays}, leads_per_day: ${hasLeadsPerDay}`);
    // Determine next sub-step or move to confirmation
    if (!hasCampaignDays) {
      // Ask campaign_days
      const nextQuestion = questionGeneratorService.generateQuestion(stepsConfig.CAMPAIGN_SETTINGS, { subStepIndex: stepsConfig.CAMPAIGN_DAYS_SUBSTEP });
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.CAMPAIGN_SETTINGS,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    } else if (!hasWorkingDays) {
      // Ask working_days
      const nextQuestion = questionGeneratorService.generateQuestion(stepsConfig.CAMPAIGN_SETTINGS, { subStepIndex: stepsConfig.WORKING_DAYS_SUBSTEP });
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.CAMPAIGN_SETTINGS,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    } else if (!hasLeadsPerDay) {
      // Ask leads_per_day
      const nextQuestion = questionGeneratorService.generateQuestion(stepsConfig.CAMPAIGN_SETTINGS, { subStepIndex: stepsConfig.LEADS_PER_DAY_SUBSTEP });
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.CAMPAIGN_SETTINGS,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    } else {
      // All sub-steps completed, move to confirmation
      logger.debug(`[StepProcessor] All campaign settings sub-steps completed, moving to confirmation`);
      const nextQuestion = questionGeneratorService.generateQuestion(stepsConfig.CONFIRMATION, updatedAnswers);
      return {
        clarificationNeeded: false,
        message: null,
        nextStepIndex: stepsConfig.CONFIRMATION,
        nextQuestion,
        completed: false,
        updatedCollectedAnswers: updatedAnswers,
      };
    }
  }

  /**
   * Request action clarification
   */
  _requestActionClarification(platformKey, currentIntentKey, collectedAnswers) {
    const platformHandlerService = require('./platform-handler.service');
    const platformConfig = platformHandlerService.getPlatformConfig(platformKey);
    const allowedActions = platformConfig.actions || [];
      return {
        clarificationNeeded: true,
        message: 'Please select valid actions for the chosen platform.',
        nextStepIndex: stepsConfig.PLATFORM_ACTIONS,
        nextQuestion: {
          question: `I couldn't detect which ${platformConfig.displayName} actions you want. Please choose from: ${allowedActions.join(', ')}`,
          intentKey: currentIntentKey,
          stepIndex: stepsConfig.PLATFORM_ACTIONS,
          questionType: 'select',
          options: allowedActions,
        },
        completed: false,
        updatedCollectedAnswers: collectedAnswers,
      };
  }
}

module.exports = new StepProcessorService();
