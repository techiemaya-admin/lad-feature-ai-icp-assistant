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
const geminiIndustryClassifier = require('./GeminiIndustryClassifier');
const geminiLocationClassifier = require('./GeminiLocationClassifier');
const geminiDecisionMakersClassifier = require('./GeminiDecisionMakersClassifier');
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
    // DEBUG: Log what we received
    logger.info('[AICICPAssistantService] processAnswer called:', { 
      userAnswer,
      currentIntentKey,
      hasPendingClassification: !!collectedAnswers.pendingClassification,
      hasPendingLocation: !!collectedAnswers.pendingLocation,
      hasPendingRole: !!collectedAnswers.pendingRole,
      collectedAnswersKeys: Object.keys(collectedAnswers)
    });
    // Helper function to clean UI decorations from user input
    const cleanUserInput = (input) => {
      return input
        .toLowerCase()
        .trim()
        .replace(/^[✓✅🔄]\s*/g, '') // Remove leading checkmarks/emojis
        .replace(/\s*\(recommended\)\s*$/i, '') // Remove "(Recommended)" suffix
        .replace(/\s*\(primary\)\s*$/i, '') // Remove "(Primary)" suffix
        .trim();
    };
    // CRITICAL: Check for pending location confirmation
    if (collectedAnswers.pendingLocation && currentIntentKey === 'icp_locations') {
      logger.info('[AICICPAssistantService] FOUND pendingLocation - processing confirmation');
      const pending = collectedAnswers.pendingLocation;
      const rawConfirmation = userAnswer.toLowerCase().trim();
      const cleanedConfirmation = cleanUserInput(userAnswer);
      // Check if user wants to type different location
      if (rawConfirmation === 'other' || rawConfirmation === 'no' || rawConfirmation === 'different' || 
          rawConfirmation.includes('type different') || rawConfirmation.includes('different location')) {
        const cleanedAnswers = { ...collectedAnswers };
        delete cleanedAnswers.pendingLocation;
        return {
          clarificationNeeded: true,
          message: 'No problem! Please tell me which location you\'d like to target:',
          nextStepIndex: null,
          nextQuestion: null,
          completed: false,
          updatedCollectedAnswers: cleanedAnswers
        };
      }
      // Check if user selected the primary location or affirmed
      const primaryLocation = pending.primary_location.toLowerCase();
      const isPrimarySelection = cleanedConfirmation === primaryLocation ||
                                 cleanedConfirmation.includes(primaryLocation) ||
                                 rawConfirmation.includes('recommended') ||
                                 rawConfirmation.startsWith('✓');
      const affirmativeResponses = ['yes', 'y', 'yep', 'yeah', 'yup', 'correct', 'right', 'ok', 'okay', 'sure', 'confirm', 'confirmed'];
      const isAffirmative = affirmativeResponses.some(resp => rawConfirmation === resp || rawConfirmation.startsWith(resp + ','));
      if (isPrimarySelection || isAffirmative) {
        const confirmedLocation = pending.primary_location;
        logger.info('[AICICPAssistantService] Location confirmed by user:', { confirmedLocation, userResponse: userAnswer });
        const finalAnswers = {
          ...collectedAnswers,
          icp_locations: confirmedLocation,
          location_classification: pending
        };
        delete finalAnswers.pendingLocation;
        const nextStepIndex = currentStepIndex + 1;
        const nextQuestion = this.getQuestionByStep(nextStepIndex, finalAnswers);
        return {
          clarificationNeeded: false,
          message: `Great! I've saved **${confirmedLocation}** as your target location.`,
          nextStepIndex,
          nextQuestion,
          completed: false,
          updatedCollectedAnswers: finalAnswers
        };
      } else {
        // Check if user selected from alternative locations
        const allSuggestions = [
          pending.primary_location,
          ...(pending.alternative_locations || [])
        ];
        let matchedLocation = allSuggestions.find(loc => loc.toLowerCase() === cleanedConfirmation);
        if (!matchedLocation) {
          matchedLocation = allSuggestions.find(loc => 
            loc.toLowerCase().includes(cleanedConfirmation) || cleanedConfirmation.includes(loc.toLowerCase())
          );
        }
        if (matchedLocation) {
          logger.info('[AICICPAssistantService] User selected from location options:', { selected: matchedLocation });
          const finalAnswers = {
            ...collectedAnswers,
            icp_locations: matchedLocation,
            location_classification: pending
          };
          delete finalAnswers.pendingLocation;
          const nextStepIndex = currentStepIndex + 1;
          const nextQuestion = this.getQuestionByStep(nextStepIndex, finalAnswers);
          return {
            clarificationNeeded: false,
            message: `Perfect! I've saved **${matchedLocation}** as your target location.`,
            nextStepIndex,
            nextQuestion,
            completed: false,
            updatedCollectedAnswers: finalAnswers
          };
        }
        // No match - treat as new input
        logger.info('[AICICPAssistantService] No location match found, treating as new input');
        const cleanedAnswers = { ...collectedAnswers };
        delete cleanedAnswers.pendingLocation;
        collectedAnswers = cleanedAnswers;
      }
    }
    // CRITICAL: Check for pending decision maker (role) confirmation
    if (collectedAnswers.pendingRole && currentIntentKey === 'icp_roles') {
      logger.info('[AICICPAssistantService] FOUND pendingRole - processing confirmation');
      const pending = collectedAnswers.pendingRole;
      const rawConfirmation = userAnswer.toLowerCase().trim();
      const cleanedConfirmation = cleanUserInput(userAnswer);
      // Check if user wants to type different role
      if (rawConfirmation === 'other' || rawConfirmation === 'no' || rawConfirmation === 'different' || 
          rawConfirmation.includes('type different') || rawConfirmation.includes('different role')) {
        const cleanedAnswers = { ...collectedAnswers };
        delete cleanedAnswers.pendingRole;
        return {
          clarificationNeeded: true,
          message: 'No problem! Please tell me which decision maker you\'d like to target:',
          nextStepIndex: null,
          nextQuestion: null,
          completed: false,
          updatedCollectedAnswers: cleanedAnswers
        };
      }
      // Check if user selected the primary role or affirmed
      const primaryRole = pending.primary_role.toLowerCase();
      const isPrimarySelection = cleanedConfirmation === primaryRole ||
                                 cleanedConfirmation.includes(primaryRole) ||
                                 rawConfirmation.includes('recommended') ||
                                 rawConfirmation.startsWith('✓');
      const affirmativeResponses = ['yes', 'y', 'yep', 'yeah', 'yup', 'correct', 'right', 'ok', 'okay', 'sure', 'confirm', 'confirmed'];
      const isAffirmative = affirmativeResponses.some(resp => rawConfirmation === resp || rawConfirmation.startsWith(resp + ','));
      if (isPrimarySelection || isAffirmative) {
        const confirmedRole = pending.primary_role;
        logger.info('[AICICPAssistantService] Decision maker confirmed by user:', { confirmedRole, userResponse: userAnswer });
        const finalAnswers = {
          ...collectedAnswers,
          icp_roles: confirmedRole,
          role_classification: pending
        };
        delete finalAnswers.pendingRole;
        const nextStepIndex = currentStepIndex + 1;
        const nextQuestion = this.getQuestionByStep(nextStepIndex, finalAnswers);
        return {
          clarificationNeeded: false,
          message: `Great! I've saved **${confirmedRole}** as your target decision maker.`,
          nextStepIndex,
          nextQuestion,
          completed: false,
          updatedCollectedAnswers: finalAnswers
        };
      } else {
        // Check if user selected from alternative roles
        const allSuggestions = [
          pending.primary_role,
          ...(pending.alternative_roles || [])
        ];
        let matchedRole = allSuggestions.find(role => role.toLowerCase() === cleanedConfirmation);
        if (!matchedRole) {
          matchedRole = allSuggestions.find(role => 
            role.toLowerCase().includes(cleanedConfirmation) || cleanedConfirmation.includes(role.toLowerCase())
          );
        }
        if (matchedRole) {
          logger.info('[AICICPAssistantService] User selected from role options:', { selected: matchedRole });
          const finalAnswers = {
            ...collectedAnswers,
            icp_roles: matchedRole,
            role_classification: pending
          };
          delete finalAnswers.pendingRole;
          const nextStepIndex = currentStepIndex + 1;
          const nextQuestion = this.getQuestionByStep(nextStepIndex, finalAnswers);
          return {
            clarificationNeeded: false,
            message: `Perfect! I've saved **${matchedRole}** as your target decision maker.`,
            nextStepIndex,
            nextQuestion,
            completed: false,
            updatedCollectedAnswers: finalAnswers
          };
        }
        // No match - treat as new input
        logger.info('[AICICPAssistantService] No role match found, treating as new input');
        const cleanedAnswers = { ...collectedAnswers };
        delete cleanedAnswers.pendingRole;
        collectedAnswers = cleanedAnswers;
      }
    }
    // CRITICAL: Check for pending industry classification confirmation FIRST (before new classification)
    // This prevents re-classifying when user is responding to confirmation
    if (collectedAnswers.pendingClassification && currentIntentKey === 'icp_industries') {
      logger.info('[AICICPAssistantService] FOUND pendingClassification - processing confirmation');
      const pending = collectedAnswers.pendingClassification;
      const rawConfirmation = userAnswer.toLowerCase().trim();
      const cleanedConfirmation = cleanUserInput(userAnswer);
      logger.info('[AICICPAssistantService] Parsed user input:', { 
        raw: userAnswer, 
        cleaned: cleanedConfirmation 
      });
      // Check if user wants to type different industry FIRST (before other checks)
      if (rawConfirmation === 'other' || 
          rawConfirmation === 'no' || 
          rawConfirmation === 'different' || 
          rawConfirmation.includes('type different') ||
          rawConfirmation.includes('different industry') ||
          rawConfirmation.includes('let me type')) {
        // User wants to type a different industry
        logger.info('[AICICPAssistantService] User wants to type different industry:', { userInput: userAnswer });
        const cleanedAnswers = { ...collectedAnswers };
        delete cleanedAnswers.pendingClassification;
        return {
          clarificationNeeded: true,
          message: 'No problem! Please tell me which industry you\'d like to target:',
          nextStepIndex: null,
          nextQuestion: null,
          completed: false,
          updatedCollectedAnswers: cleanedAnswers
        };
      }
      // Check if user selected the primary industry (cleaned input matches the apollo industry)
      const primaryIndustry = pending.apollo_industry.toLowerCase();
      const isPrimarySelection = cleanedConfirmation === primaryIndustry ||
                                 cleanedConfirmation.includes(primaryIndustry) ||
                                 rawConfirmation.includes('recommended') ||
                                 rawConfirmation.startsWith('✓');
      // Recognize affirmative responses naturally
      const affirmativeResponses = ['yes', 'y', 'yep', 'yeah', 'yup', 'correct', 'right', 'ok', 'okay', 'sure', 'confirm', 'confirmed'];
      const isAffirmative = affirmativeResponses.some(resp => rawConfirmation === resp || rawConfirmation.startsWith(resp + ','));
      if (isPrimarySelection || isAffirmative) {
        // User confirmed the suggested industry
        const confirmedIndustry = pending.apollo_industry;
        logger.info('[AICICPAssistantService] Industry confirmed by user:', { confirmedIndustry, userResponse: userAnswer });
        // Store the confirmed industry
        const finalAnswers = {
          ...collectedAnswers,
          icp_industries: confirmedIndustry,
          industry_classification: pending
        };
        delete finalAnswers.pendingClassification; // Remove pending status
        // Move to the next step (icp_industries is step 1, so next is step 2)
        const nextStepIndex = currentStepIndex + 1;
        const nextQuestion = this.getQuestionByStep(nextStepIndex, finalAnswers);
        return {
          clarificationNeeded: false,
          message: `Great! I've saved **${confirmedIndustry}** as your target industry.`,
          nextStepIndex,
          nextQuestion,
          completed: false,
          updatedCollectedAnswers: finalAnswers
        };
      } else {
        // User selected an alternative industry from the suggestions
        // Check if it EXACTLY matches one of the suggested industries (using cleaned input)
        const allSuggestions = [
          pending.apollo_industry,
          ...(pending.alternative_industries || [])
        ];
        // Try exact match first (case-insensitive, using cleaned input)
        let matchedIndustry = allSuggestions.find(ind => 
          ind.toLowerCase() === cleanedConfirmation
        );
        // If no exact match, check if cleaned input is contained in any suggestion
        if (!matchedIndustry) {
          matchedIndustry = allSuggestions.find(ind => 
            ind.toLowerCase().includes(cleanedConfirmation) || cleanedConfirmation.includes(ind.toLowerCase())
          );
        }
        if (matchedIndustry) {
          // User selected from the options - save and move forward
          logger.info('[AICICPAssistantService] User selected from options:', { selected: matchedIndustry });
          const finalAnswers = {
            ...collectedAnswers,
            icp_industries: matchedIndustry,
            industry_classification: pending
          };
          delete finalAnswers.pendingClassification;
          const nextStepIndex = currentStepIndex + 1;
          const nextQuestion = this.getQuestionByStep(nextStepIndex, finalAnswers);
          return {
            clarificationNeeded: false,
            message: `Perfect! I've saved **${matchedIndustry}** as your target industry.`,
            nextStepIndex,
            nextQuestion,
            completed: false,
            updatedCollectedAnswers: finalAnswers
          };
        }
        // If no match found, user wants something completely different - clear and re-classify
        logger.info('[AICICPAssistantService] No match found, treating as new input');
        const cleanedAnswers = { ...collectedAnswers };
        delete cleanedAnswers.pendingClassification;
        collectedAnswers = cleanedAnswers; // Update for re-classification
        // Fall through to classification logic below
      }
    }
    // AI Industry Classification: If user is answering industry question, classify it first
    let processedAnswer = userAnswer;
    if (currentIntentKey === 'icp_industries') {
      try {
        logger.info('[AICICPAssistantService] Classifying industry input:', { userAnswer });
        const classification = await geminiIndustryClassifier.classifyIndustry(userAnswer);
        if (classification.apollo_industry) {
          processedAnswer = classification.apollo_industry;
          logger.info('[AICICPAssistantService] Industry classified:', { 
            original: userAnswer,
            classified: processedAnswer,
            confidence: classification.confidence 
          });
          // Ask user for confirmation with clickable options
          const confidenceEmoji = classification.confidence === 'high' ? '✅' : classification.confidence === 'medium' ? '⚠️' : '❓';
          // Build clickable options - Use checkmark for primary, no "Yes" prefix to avoid confusion
          const options = [
            { text: `✓ ${classification.apollo_industry} (Recommended)`, value: classification.apollo_industry }
          ];
          // Add alternative industries as clickable options
          if (classification.alternative_industries && classification.alternative_industries.length > 0) {
            classification.alternative_industries.slice(0, 3).forEach(alt => {
              options.push({ text: alt, value: alt });
            });
          }
          // Add "Other" option with clear value
          options.push({ text: 'Type different industry', value: 'other' });
          // Build message with options formatted for frontend parser
          // Frontend expects: "Options:\n• Option 1\n• Option 2"
          const optionsText = options.map(opt => `• ${opt.text}`).join('\n');
          const confirmationMessage = `${confidenceEmoji} I found your industry: **${classification.apollo_industry}**\n\n${classification.reasoning}\n\nPlease select the correct industry:\n\nOptions:\n${optionsText}`;
          // Store pending classification in state for next answer
          const pendingClassificationData = {
            original_input: userAnswer,
            apollo_industry: classification.apollo_industry,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            alternative_industries: classification.alternative_industries
          };
          logger.info('[AICICPAssistantService] Returning industry confirmation with options:', { 
            options: options.map(o => o.text),
            pendingClassification: pendingClassificationData.apollo_industry
          });
          return {
            clarificationNeeded: true,
            message: confirmationMessage,
            options: options, // Also send as structured data
            nextStepIndex: null,
            nextQuestion: null,
            completed: false,
            updatedCollectedAnswers: {
              ...collectedAnswers,
              pendingClassification: pendingClassificationData
            }
          };
        }
      } catch (error) {
        logger.warn('[AICICPAssistantService] Failed to classify industry, using original input:', error.message);
        // Continue with original answer if classification fails
      }
    }
    // AI Location Classification: If user is answering location question, classify and correct spelling
    if (currentIntentKey === 'icp_locations') {
      try {
        logger.info('[AICICPAssistantService] Classifying location input:', { userAnswer });
        const classification = await geminiLocationClassifier.classifyLocation(userAnswer);
        if (classification.primary_location) {
          processedAnswer = classification.primary_location;
          logger.info('[AICICPAssistantService] Location classified:', { 
            original: userAnswer,
            classified: processedAnswer,
            confidence: classification.confidence 
          });
          // Ask user for confirmation with clickable options
          const confidenceEmoji = classification.confidence === 'high' ? '✅' : classification.confidence === 'medium' ? '⚠️' : '❓';
          // Build clickable options
          const options = [
            { text: `✓ ${classification.primary_location} (Recommended)`, value: classification.primary_location }
          ];
          // Add alternative locations as clickable options
          if (classification.alternative_locations && classification.alternative_locations.length > 0) {
            classification.alternative_locations.slice(0, 3).forEach(alt => {
              options.push({ text: alt, value: alt });
            });
          }
          // Add "Other" option
          options.push({ text: 'Type different location', value: 'other' });
          // Build message with options
          const optionsText = options.map(opt => `• ${opt.text}`).join('\n');
          const confirmationMessage = `${confidenceEmoji} I found your location: **${classification.primary_location}**\n\n${classification.reasoning}\n\nPlease select the correct location:\n\nOptions:\n${optionsText}`;
          // Store pending classification in state for next answer
          const pendingLocationData = {
            original_input: userAnswer,
            primary_location: classification.primary_location,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            alternative_locations: classification.alternative_locations
          };
          logger.info('[AICICPAssistantService] Returning location confirmation with options:', { 
            options: options.map(o => o.text),
            pendingLocation: pendingLocationData.primary_location
          });
          return {
            clarificationNeeded: true,
            message: confirmationMessage,
            options: options,
            nextStepIndex: null,
            nextQuestion: null,
            completed: false,
            updatedCollectedAnswers: {
              ...collectedAnswers,
              pendingLocation: pendingLocationData
            }
          };
        }
      } catch (error) {
        logger.warn('[AICICPAssistantService] Failed to classify location, using original input:', error.message);
        // Continue with original answer if classification fails
      }
    }
    // AI Decision Makers Classification: If user is answering roles question, classify it
    if (currentIntentKey === 'icp_roles') {
      try {
        logger.info('[AICICPAssistantService] Classifying decision makers input:', { userAnswer });
        const classification = await geminiDecisionMakersClassifier.classifyDecisionMakers(userAnswer);
        if (classification.primary_role) {
          processedAnswer = classification.primary_role;
          logger.info('[AICICPAssistantService] Decision maker classified:', { 
            original: userAnswer,
            classified: processedAnswer,
            confidence: classification.confidence 
          });
          // Ask user for confirmation with clickable options
          const confidenceEmoji = classification.confidence === 'high' ? '✅' : classification.confidence === 'medium' ? '⚠️' : '❓';
          // Build clickable options
          const options = [
            { text: `✓ ${classification.primary_role} (Recommended)`, value: classification.primary_role }
          ];
          // Add alternative roles as clickable options
          if (classification.alternative_roles && classification.alternative_roles.length > 0) {
            classification.alternative_roles.slice(0, 3).forEach(alt => {
              options.push({ text: alt, value: alt });
            });
          }
          // Add "Other" option
          options.push({ text: 'Type different role', value: 'other' });
          // Build message with options
          const optionsText = options.map(opt => `• ${opt.text}`).join('\n');
          const confirmationMessage = `${confidenceEmoji} I found your target role: **${classification.primary_role}**\n\n${classification.reasoning}\n\nPlease select the correct decision maker:\n\nOptions:\n${optionsText}`;
          // Store pending classification in state for next answer
          const pendingRoleData = {
            original_input: userAnswer,
            primary_role: classification.primary_role,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            alternative_roles: classification.alternative_roles,
            role_category: classification.role_category
          };
          logger.info('[AICICPAssistantService] Returning role confirmation with options:', { 
            options: options.map(o => o.text),
            pendingRole: pendingRoleData.primary_role
          });
          return {
            clarificationNeeded: true,
            message: confirmationMessage,
            options: options,
            nextStepIndex: null,
            nextQuestion: null,
            completed: false,
            updatedCollectedAnswers: {
              ...collectedAnswers,
              pendingRole: pendingRoleData
            }
          };
        }
      } catch (error) {
        logger.warn('[AICICPAssistantService] Failed to classify decision makers, using original input:', error.message);
        // Continue with original answer if classification fails
      }
    }
    // Store the answer in collectedAnswers
    const updatedAnswers = {
      ...collectedAnswers,
      [currentIntentKey]: processedAnswer,
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