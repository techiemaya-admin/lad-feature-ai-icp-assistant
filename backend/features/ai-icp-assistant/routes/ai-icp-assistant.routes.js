/**
 * AI ICP Assistant Routes
 * 
 * Route definitions only - no business logic.
 * Attaches middleware and delegates to controller.
 */

const express = require('express');
const router = express.Router();
const AICICPAssistantController = require('../controllers/ai-icp-assistant.controller');
const { authenticateToken } = require('../../../core/middleware/auth');
const {
  validateStepIndex,
  validateICPAnswer,
  validateCategory,
} = require('../middleware/ai-icp-assistant.middleware');

/**
 * GET /api/ai-icp-assistant/onboarding/icp-questions
 * Get all ICP questions for a category
 */
router.get(
  '/onboarding/icp-questions',
  authenticateToken,
  validateCategory,
  AICICPAssistantController.getQuestions
);

/**
 * GET /api/ai-icp-assistant/onboarding/icp-questions/:stepIndex
 * Get specific question by step index
 */
router.get(
  '/onboarding/icp-questions/:stepIndex',
  authenticateToken,
  validateStepIndex,
  validateCategory,
  AICICPAssistantController.getQuestionByStep
);

/**
 * POST /api/ai-icp-assistant/onboarding/icp-answer
 * Process user answer and get next step
 */
router.post(
  '/onboarding/icp-answer',
  authenticateToken,
  validateICPAnswer,
  AICICPAssistantController.processAnswer
);

module.exports = router;

