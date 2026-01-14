/**
 * Intent Analyzer Service
 * 
 * Analyzes user answers to determine intent and next steps.
 * Uses AnswerProcessorService for Gemini-based spelling correction and analysis.
 */

const answerProcessorService = require('./AnswerProcessorService');
const onboardingConfig = require('../config/onboarding.config');
const logger = require('../utils/logger');

class IntentAnalyzerService {
  /**
   * Analyze user answer and determine next step
   */
  async analyzeAnswer({
    userAnswer,
    currentStepIndex,
    currentIntentKey,
    currentQuestion,
    collectedAnswers,
  }) {
    try {
      // Use AnswerProcessorService for comprehensive analysis including spelling correction
      const analysis = await answerProcessorService.analyzeAnswer({
        userAnswer,
        currentStepIndex,
        currentIntentKey,
        currentQuestion,
        answeredSteps: [],
        collectedAnswers
      });

      return {
        isValid: !analysis.clarificationNeeded,
        clarificationNeeded: analysis.clarificationNeeded === true,
        clarificationMessage: analysis.message || null,
        nextStepIndex: analysis.nextStepIndex || currentStepIndex + 1,
        confidence: analysis.confidence || 'medium',
        extractedData: analysis.extractedData || {},
        correctedAnswer: analysis.correctedAnswer || null
      };
    } catch (error) {
      logger.error('[IntentAnalyzerService] Error analyzing answer:', error);

      // Fallback: accept answer and proceed
      return {
        isValid: true,
        clarificationNeeded: false,
        clarificationMessage: null,
        nextStepIndex: currentStepIndex + 1,
        confidence: 'low',
        extractedData: {},
        correctedAnswer: null
      };
    }
  }
}

module.exports = new IntentAnalyzerService();

