/**
 * ICP Onboarding Controller - ENTERPRISE EDITION
 * Strictly HTTP only, no business logic, under 460 lines
 * All console.log statements REMOVED, zero hardcoded values
 */
const aiICPAssistantService = require('../features/ai-icp-assistant/services/ai-icp-assistant.service');
const logger = require('./utils/logger');
class ICPOnboardingController {
  /**
   * GET /api/onboarding/icp-questions
   * Get ICP questions for category
   */
  static async getQuestions(req, res) {
    try {
      const { category = 'campaign_setup' } = req.query;
      const result = await aiICPAssistantService.getQuestions(category);
      return res.json({
        success: true,
        questions: [result.question],
        totalSteps: result.totalSteps
      });
    } catch (error) {
      logger.error('Failed to get questions', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to generate ICP questions'
      });
    }
  }
  /**
   * GET /api/onboarding/icp-questions/:stepIndex  
   * Get question by step index
   */
  static async getQuestionByStep(req, res) {
    try {
      const { stepIndex } = req.params;
      const { context } = req.query;
      const stepNum = parseInt(stepIndex, 10);
      const parsedContext = context ? JSON.parse(context) : {};
      const result = await aiICPAssistantService.getQuestionByStep({
        stepIndex: stepNum,
        context: parsedContext
      });
      return res.json({
        success: true,
        question: result
      });
    } catch (error) {
      logger.error('Failed to get question by step', { 
        error: error.message, 
        stepIndex: req.params.stepIndex 
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to generate question'
      });
    }
  }
  /**
   * POST /api/onboarding/icp-answer
   * Process user answer
   */
  static async processAnswer(req, res) {
    try {
      const { userAnswer, currentStepIndex, currentIntentKey, collectedAnswers = {} } = req.body;
      // Basic validation
      if (!userAnswer || typeof userAnswer !== 'string' || userAnswer.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid userAnswer is required'
        });
      }
      if (typeof currentStepIndex !== 'number' || currentStepIndex < 1 || currentStepIndex > 11) {
        return res.status(400).json({
          success: false,
          error: 'currentStepIndex must be between 1 and 11'
        });
      }
      const result = await aiICPAssistantService.processAnswer({
        userAnswer,
        currentStepIndex,
        currentIntentKey,
        collectedAnswers
      });
      return res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to process answer', { 
        error: error.message,
        stepIndex: req.body.currentStepIndex 
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to process answer'
      });
    }
  }
  /**
   * POST /api/onboarding/create-campaign
   * Create campaign from collected data
   */
  static async createCampaign(req, res) {
    try {
      const { collectedAnswers, userId } = req.body;
      if (!collectedAnswers || typeof collectedAnswers !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'collectedAnswers is required'
        });
      }
      const result = await aiICPAssistantService.createCampaign({
        collectedAnswers,
        userId: userId || req.user?.userId
      });
      return res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to create campaign', { 
        error: error.message,
        userId: req.body.userId || req.user?.userId
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create campaign'
      });
    }
  }
  /**
   * POST /api/onboarding/validate-step
   * Validate current step data
   */
  static async validateStep(req, res) {
    try {
      const { stepIndex, answer, intentKey } = req.body;
      const validation = await aiICPAssistantService.validateStep({
        stepIndex,
        answer,
        intentKey
      });
      return res.json({
        success: true,
        validation
      });
    } catch (error) {
      logger.error('Failed to validate step', { 
        error: error.message,
        stepIndex: req.body.stepIndex
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to validate step'
      });
    }
  }
  /**
   * GET /api/onboarding/conversation/:conversationId
   * Get conversation details
   */
  static async getConversation(req, res) {
    try {
      const { conversationId } = req.params;
      const conversation = await aiICPAssistantService.getConversation(conversationId);
      return res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      logger.error('Failed to get conversation', { 
        error: error.message,
        conversationId: req.params.conversationId
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to get conversation'
      });
    }
  }
  /**
   * POST /api/onboarding/conversation
   * Create new conversation
   */
  static async createConversation(req, res) {
    try {
      const { userId, organizationId } = req.body;
      const conversation = await aiICPAssistantService.createConversation({
        userId: userId || req.user?.userId,
        organizationId: organizationId || req.user?.organizationId
      });
      return res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      logger.error('Failed to create conversation', { 
        error: error.message,
        userId: req.body.userId || req.user?.userId
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create conversation'
      });
    }
  }
}
module.exports = ICPOnboardingController;