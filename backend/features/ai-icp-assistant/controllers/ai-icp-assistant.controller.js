/**
 * AI ICP Assistant Controller
 * 
 * Handles HTTP request/response only.
 * No business logic - delegates to service layer.
 */
const aiICPAssistantService = require('../services/ai-icp-assistant.service');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const stepsConfig = require('../config/steps.config');
class AICICPAssistantController {
  /**
   * GET /api/ai-icp-assistant/onboarding/icp-questions
   * Get all ICP questions for a category
   */
  static async getQuestions(req, res) {
    try {
      const { category } = req.query;
      const question = aiICPAssistantService.getFirstQuestion(category);
      const totalSteps = aiICPAssistantService.getTotalSteps();
      // attach a stable message id so frontends can deduplicate repeated messages
      const messageId = uuidv4();
      const questionsWithId = [
        Object.assign({}, question, { messageId, generatedAt: new Date().toISOString() }),
      ];
      return res.json({
        success: true,
        questions: questionsWithId,
        totalSteps,
      });
    } catch (error) {
      logger.error('[AICICPAssistantController] Error getting questions:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get ICP questions',
        message: error.message,
      });
    }
  }
  /**
   * GET /api/ai-icp-assistant/onboarding/icp-questions/:stepIndex
   * Get specific question by step index
   */
  static async getQuestionByStep(req, res) {
    try {
      const { stepIndex } = req.params;
      const { category, context } = req.query;
      const stepNum = req.validatedStepIndex || parseInt(stepIndex, 10);
      let parsedContext = {};
      if (context) {
        try {
          parsedContext = JSON.parse(context);
        } catch (e) {
          logger.warn('[AICICPAssistantController] Failed to parse context:', e);
        }
      }
      const question = aiICPAssistantService.getQuestionByStep(stepNum, {
        category,
        ...parsedContext,
      });
      const messageId = uuidv4();
      const questionWithId = Object.assign({}, question, { messageId, generatedAt: new Date().toISOString() });
      return res.json({
        success: true,
        question: questionWithId,
      });
    } catch (error) {
      logger.error('[AICICPAssistantController] Error getting question:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get question',
        message: error.message,
      });
    }
  }
  /**
   * POST /api/ai-icp-assistant/onboarding/icp-answer
   * Process user answer and get next step
   */
  static async processAnswer(req, res) {
    try {
      const {
        sessionId,
        currentStepIndex,
        userAnswer,
        category,
        currentIntentKey,
        collectedAnswers = {},
      } = req.body;
      // CRITICAL: Warn if collectedAnswers is empty at platform actions step or later
      if (currentStepIndex >= stepsConfig.PLATFORM_ACTIONS && Object.keys(collectedAnswers).length === 0) {
        logger.warn('[AICICPAssistantController] CRITICAL: collectedAnswers is EMPTY at Step', currentStepIndex);
        logger.warn('[AICICPAssistantController] Frontend MUST send back all previous answers in collectedAnswers');
      }
      logger.debug('[AICICPAssistantController] processAnswer - Step:', currentStepIndex, 'intentKey:', currentIntentKey, 'collected keys:', Object.keys(collectedAnswers));
      // Get current question to pass to service
      // For Step 5, we need special handling for platform actions
      let currentQuestion;
      try {
        currentQuestion = aiICPAssistantService.getQuestionByStep(
          currentStepIndex,
          { category, ...collectedAnswers }
        );
      } catch (error) {
        // If question generation fails, use a default
        logger.error('[AICICPAssistantController] Error getting current question:', error);
        currentQuestion = {
          question: 'Please provide your answer',
          intentKey: 'unknown',
        };
      }
      // CRITICAL FIX: Use currentIntentKey from request if provided (frontend knows which question was asked)
      // Otherwise fall back to the generated question's intentKey
      // This ensures we process the answer for the correct platform
      const intentKeyToUse = currentIntentKey || currentQuestion.intentKey;
      logger.debug(`[AICICPAssistantController] Using intentKey: ${intentKeyToUse} (from request: ${currentIntentKey}, from question: ${currentQuestion.intentKey})`);
      const result = await aiICPAssistantService.processAnswer({
        userAnswer,
        currentStepIndex,
        currentIntentKey: intentKeyToUse,
        currentQuestion: currentQuestion.question,
        collectedAnswers,
      });
      // Attach message id to nextQuestion so frontends can deduplicate
      const nextQuestion = result.nextQuestion
        ? Object.assign({}, result.nextQuestion, { messageId: uuidv4(), generatedAt: new Date().toISOString() })
        : null;
      // CRITICAL FIX: Always return updatedCollectedAnswers (use input if service doesn't provide it)
      // This ensures frontend always has the correct state, especially for completed_platform_actions
      const updatedCollectedAnswers = result.updatedCollectedAnswers || collectedAnswers;
      return res.json({
        success: true,
        nextStepIndex: result.nextStepIndex,
        nextQuestion,
        clarificationNeeded: result.clarificationNeeded || false,
        completed: result.completed || false,
        message: result.message || null,
        updatedCollectedAnswers,
      });
    } catch (error) {
      logger.error('[AICICPAssistantController] Error processing answer:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to process answer',
        message: error.message,
      });
    }
  }
}
module.exports = AICICPAssistantController;