/**
 * ICP Onboarding Routes
 * 
 * Routes for database-driven ICP questions system.
 * All questions come from DB, Gemini decides next step.
 */
const express = require('express');
const router = express.Router();
const ICPOnboardingController = require('../controllers/ICPOnboardingController');
// ============================================================================
// ICP Questions Routes
// ============================================================================
/**
 * GET /api/onboarding/icp-questions
 * Fetch all active ICP questions for a category
 * Query params: ?category=lead_generation
 */
router.get('/icp-questions', ICPOnboardingController.getQuestions);
/**
 * GET /api/onboarding/icp-questions/:stepIndex
 * Get specific question by step index
 * Query params: ?category=lead_generation
 */
router.get('/icp-questions/:stepIndex', ICPOnboardingController.getQuestionByStep);
/**
 * POST /api/onboarding/icp-answer
 * Process user answer and determine next step using Gemini
 * Body: { sessionId, currentStepIndex, userAnswer, category }
 */
router.post('/icp-answer', ICPOnboardingController.processAnswer);
module.exports = router;