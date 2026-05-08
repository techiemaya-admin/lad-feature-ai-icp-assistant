/**
 * AI ICP Assistant Routes
 * 
 * Route definitions only - no business logic.
 * Attaches middleware and delegates to controller.
 */
const express = require('express');
const router = express.Router();
const AICICPAssistantController = require('../controllers/ai-icp-assistant.controller');
const IndustryClassificationController = require('../controllers/IndustryClassificationController');
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
/**
 * POST /api/ai-icp-assistant/classify-industry
 * Classify user's industry input using Gemini AI
 */
router.post(
  '/classify-industry',
  IndustryClassificationController.classifyIndustry
);
/**
 * GET /api/ai-icp-assistant/industry-suggestions
 * Get Apollo industry suggestions (autocomplete)
 */
router.get(
  '/industry-suggestions',
  IndustryClassificationController.getIndustrySuggestions
);
/**
 * POST /api/ai-icp-assistant/classify-location
 * Classify user's location input using Gemini AI (with spelling correction)
 */
router.post(
  '/classify-location',
  IndustryClassificationController.classifyLocation
);
/**
 * GET /api/ai-icp-assistant/location-suggestions
 * Get location suggestions (autocomplete)
 */
router.get(
  '/location-suggestions',
  IndustryClassificationController.getLocationSuggestions
);
/**
 * POST /api/ai-icp-assistant/classify-decision-makers
 * Classify user's decision makers input using Gemini AI
 */
router.post(
  '/classify-decision-makers',
  IndustryClassificationController.classifyDecisionMakers
);
/**
 * GET /api/ai-icp-assistant/decision-maker-suggestions
 * Get decision maker suggestions (autocomplete)
 */
router.get(
  '/decision-maker-suggestions',
  IndustryClassificationController.getDecisionMakerSuggestions
);
module.exports = router;