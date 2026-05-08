/**
 * Inbound Data Routes
 * 
 * Routes for inbound lead data processing and analysis
 */
const express = require('express');
const router = express.Router();
const InboundDataController = require('../controllers/InboundDataController');
const { authenticateToken } = require('../../../core/middleware/auth');
/**
 * POST /api/ai-icp-assistant/inbound/analyze
 * Analyze inbound lead data using Gemini AI
 */
router.post(
  '/analyze',
  authenticateToken,
  InboundDataController.analyzeInboundData
);
/**
 * POST /api/ai-icp-assistant/inbound/next-question
 * Get next question based on inbound data and collected answers
 */
router.post(
  '/next-question',
  authenticateToken,
  InboundDataController.getNextQuestion
);
/**
 * POST /api/ai-icp-assistant/inbound/process-answer
 * Process user answer for inbound flow
 */
router.post(
  '/process-answer',
  authenticateToken,
  InboundDataController.processAnswer
);
module.exports = router;