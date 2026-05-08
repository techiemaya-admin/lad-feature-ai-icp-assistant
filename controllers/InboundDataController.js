/**
 * Inbound Data Controller
 * 
 * Handles inbound lead data analysis and dynamic question generation
 */
const InboundDataService = require('../services/InboundDataService');
const logger = require('../utils/logger');
class InboundDataController {
  /**
   * POST /api/ai-icp-assistant/inbound/analyze
   * Analyze inbound lead data using Gemini AI
   */
  static async analyzeInboundData(req, res) {
    try {
      const { inboundData } = req.body;
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      if (!inboundData) {
        return res.status(400).json({
          success: false,
          error: 'Inbound data is required',
        });
      }
      logger.info('Analyzing inbound data', { userId, companyName: inboundData.companyName });
      const analysis = await InboundDataService.analyzeInboundData(inboundData, tenantId);
      res.json({
        success: true,
        analysis,
      });
    } catch (error) {
      logger.error('Error analyzing inbound data', { error, userId: req.user?.userId });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to analyze inbound data',
      });
    }
  }
  /**
   * POST /api/ai-icp-assistant/inbound/next-question
   * Get next question based on inbound data and collected answers
   */
  static async getNextQuestion(req, res) {
    try {
      const { inboundData, analysis, collectedAnswers, currentStepIndex } = req.body;
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      if (!inboundData || !analysis) {
        return res.status(400).json({
          success: false,
          error: 'Inbound data and analysis are required',
        });
      }
      logger.info('Getting next inbound question', { userId, currentStepIndex });
      const result = await InboundDataService.getNextQuestion(
        inboundData,
        analysis,
        collectedAnswers || {},
        currentStepIndex || 0,
        tenantId
      );
      res.json(result);
    } catch (error) {
      logger.error('Error getting next inbound question', { error, userId: req.user?.userId });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get next question',
      });
    }
  }
  /**
   * POST /api/ai-icp-assistant/inbound/process-answer
   * Process user answer for inbound flow
   */
  static async processAnswer(req, res) {
    try {
      const { 
        inboundData, 
        analysis, 
        collectedAnswers, 
        currentStepIndex, 
        currentIntentKey,
        userAnswer 
      } = req.body;
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      if (!inboundData || !analysis || !userAnswer) {
        return res.status(400).json({
          success: false,
          error: 'Inbound data, analysis, and user answer are required',
        });
      }
      logger.info('Processing inbound answer', { userId, currentStepIndex, currentIntentKey });
      const result = await InboundDataService.processInboundAnswer(
        inboundData,
        analysis,
        collectedAnswers || {},
        currentStepIndex,
        currentIntentKey,
        userAnswer,
        tenantId
      );
      res.json(result);
    } catch (error) {
      logger.error('Error processing inbound answer', { error, userId: req.user?.userId });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process answer',
      });
    }
  }
}
module.exports = InboundDataController;