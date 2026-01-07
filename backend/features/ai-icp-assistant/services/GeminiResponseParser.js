/**
 * Gemini Response Parser
 * Handles parsing and validation of Gemini AI responses
 */

const logger = require('../utils/logger');

class GeminiResponseParser {
  /**
   * Parse Gemini's conversation response
   */
  static parseConversationResponse(text, currentStepIndex, isLastStep) {
    try {
      // Extract JSON from text (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          clarificationNeeded: parsed.clarificationNeeded || false,
          message: parsed.message || null,
          confidence: parsed.confidence || 'medium',
          completed: parsed.completed || (isLastStep && !parsed.clarificationNeeded)
        };
      }
      return JSON.parse(text);
    } catch (error) {
      logger.error('Error parsing conversation response', { error: error.message });
      return {
        clarificationNeeded: false,
        message: null,
        confidence: 'low',
        completed: isLastStep
      };
    }
  }

  /**
   * Parse Gemini's analysis response  
   */
  static parseAnalysisResponse(text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      logger.error('Error parsing analysis response', { error: error.message });
      return {
        nextStepIndex: null,
        clarificationNeeded: false,
        confidence: 'low',
        reasoning: 'Parse error - using fallback',
        extractedData: {}
      };
    }
  }
}

module.exports = GeminiResponseParser;