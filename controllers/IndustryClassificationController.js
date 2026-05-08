/**
 * Industry Classification Controller
 * Handles industry, location, and decision makers classification requests using Gemini AI
 */
const geminiClassifier = require('../services/GeminiIndustryClassifier');
const geminiLocationClassifier = require('../services/GeminiLocationClassifier');
const geminiDecisionMakersClassifier = require('../services/GeminiDecisionMakersClassifier');
// Silent logger (console logs removed for production)
const logger = {
  info: () => {},
  error: () => {}
};
class IndustryClassificationController {
  /**
   * Classify user's industry input
   * POST /api/campaigns/classify-industry
   */
  static async classifyIndustry(req, res) {
    try {
      const { industry_input } = req.body;
      if (!industry_input || typeof industry_input !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'industry_input is required and must be a string'
        });
      }
      if (industry_input.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'industry_input must be at least 2 characters'
        });
      }
      logger.info('[Industry Classification] Received request', {
        input: industry_input,
        userId: req.user?.userId
      });
      const result = await geminiClassifier.classifyIndustry(industry_input);
      return res.json(result);
    } catch (error) {
      logger.error('[Industry Classification] Error', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to classify industry',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  /**
   * Get industry suggestions (autocomplete)
   * GET /api/campaigns/industry-suggestions?q=software
   */
  static async getIndustrySuggestions(req, res) {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required'
        });
      }
      const suggestions = geminiClassifier.getSuggestedIndustries(q);
      return res.json({
        success: true,
        suggestions,
        query: q
      });
    } catch (error) {
      logger.error('[Industry Suggestions] Error', {
        error: error.message
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to get suggestions'
      });
    }
  }
  /**
   * Classify user's location input
   * POST /api/ai-icp-assistant/classify-location
   */
  static async classifyLocation(req, res) {
    try {
      const { location_input } = req.body;
      if (!location_input || typeof location_input !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'location_input is required and must be a string'
        });
      }
      if (location_input.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'location_input must be at least 2 characters'
        });
      }
      logger.info('[Location Classification] Received request', {
        input: location_input,
        userId: req.user?.userId
      });
      const result = await geminiLocationClassifier.classifyLocation(location_input);
      return res.json(result);
    } catch (error) {
      logger.error('[Location Classification] Error', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to classify location',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  /**
   * Get location suggestions (autocomplete)
   * GET /api/ai-icp-assistant/location-suggestions?q=india
   */
  static async getLocationSuggestions(req, res) {
    try {
      const { q = '' } = req.query;
      const result = await geminiLocationClassifier.getLocationSuggestions(q);
      return res.json(result);
    } catch (error) {
      logger.error('[Location Suggestions] Error', {
        error: error.message
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to get location suggestions'
      });
    }
  }
  /**
   * Classify user's decision makers input
   * POST /api/ai-icp-assistant/classify-decision-makers
   */
  static async classifyDecisionMakers(req, res) {
    try {
      const { decision_makers_input } = req.body;
      if (!decision_makers_input || typeof decision_makers_input !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'decision_makers_input is required and must be a string'
        });
      }
      if (decision_makers_input.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'decision_makers_input must be at least 2 characters'
        });
      }
      logger.info('[Decision Makers Classification] Received request', {
        input: decision_makers_input,
        userId: req.user?.userId
      });
      const result = await geminiDecisionMakersClassifier.classifyDecisionMakers(decision_makers_input);
      return res.json(result);
    } catch (error) {
      logger.error('[Decision Makers Classification] Error', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to classify decision makers',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  /**
   * Get decision maker suggestions (autocomplete)
   * GET /api/ai-icp-assistant/decision-maker-suggestions?q=ceo
   */
  static async getDecisionMakerSuggestions(req, res) {
    try {
      const { q = '' } = req.query;
      const result = await geminiDecisionMakersClassifier.getDecisionMakerSuggestions(q);
      return res.json(result);
    } catch (error) {
      logger.error('[Decision Maker Suggestions] Error', {
        error: error.message
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to get decision maker suggestions'
      });
    }
  }
}
module.exports = IndustryClassificationController;