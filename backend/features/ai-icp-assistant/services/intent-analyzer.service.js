/**
 * Intent Analyzer Service
 * 
 * Analyzes user answers to determine intent and next steps.
 * Uses Gemini for complex analysis, but business rules are here.
 */
const geminiClientService = require('./gemini-client.service');
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
      const prompt = this.buildAnalysisPrompt({
        userAnswer,
        currentStepIndex,
        currentIntentKey,
        currentQuestion,
        collectedAnswers,
      });
      const response = await geminiClientService.generateContent(prompt);
      const analysis = this.parseAnalysisResponse(response);
      return {
        isValid: analysis.isValid !== false,
        clarificationNeeded: analysis.clarificationNeeded === true,
        clarificationMessage: analysis.clarificationMessage || null,
        nextStepIndex: analysis.nextStepIndex || currentStepIndex + 1,
        confidence: analysis.confidence || 'medium',
        extractedData: analysis.extractedData || {},
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
      };
    }
  }
  /**
   * Build analysis prompt for Gemini
   */
  buildAnalysisPrompt({
    userAnswer,
    currentStepIndex,
    currentIntentKey,
    currentQuestion,
    collectedAnswers,
  }) {
    const { steps } = onboardingConfig;
    const isLastStep = currentStepIndex >= steps.total;
    return `You are MAYA AI — a guided campaign & workflow builder.
CURRENT CONTEXT:
- Current Step: ${currentStepIndex} of ${steps.total}
- Current Question: "${currentQuestion}"
- User's Answer: "${userAnswer}"
- Current Intent: ${currentIntentKey}
YOUR TASK:
1. Analyze if the user's answer is complete and relevant to the current question
2. If the answer is incomplete/irrelevant → Set clarificationNeeded: true and provide a helpful message
3. If the answer is complete → Proceed to next step sequentially (Step ${currentStepIndex + 1})
CRITICAL RULES:
- You MUST ask ALL ${steps.total} steps in sequence
- NEVER skip steps or mark as completed before Step ${steps.total}
- ONLY mark as completed when Step ${steps.total} is answered
- ALWAYS proceed to the next sequential step (${currentStepIndex + 1}) unless clarification is needed
${isLastStep ? 'This is the LAST step. If the answer is complete, mark as completed.' : `Next step will be Step ${currentStepIndex + 1}`}
RESPOND IN VALID JSON FORMAT:
{
  "isValid": boolean,
  "clarificationNeeded": boolean,
  "clarificationMessage": string or null,
  "nextStepIndex": number,
  "confidence": "high" | "medium" | "low",
  "extractedData": {}
}`;
  }
  /**
   * Parse Gemini response to extract analysis
   */
  parseAnalysisResponse(response) {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      // Fallback: return default
      return {
        isValid: true,
        clarificationNeeded: false,
        nextStepIndex: null,
        confidence: 'low',
      };
    } catch (error) {
      logger.error('[IntentAnalyzerService] Error parsing response:', error);
      return {
        isValid: true,
        clarificationNeeded: false,
        nextStepIndex: null,
        confidence: 'low',
      };
    }
  }
}
module.exports = new IntentAnalyzerService();