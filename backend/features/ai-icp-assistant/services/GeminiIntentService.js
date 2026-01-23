/**
 * Gemini Intent Service (Refactored)
 * Orchestrates question generation and answer processing using specialized services
 */
const config = require('../utils/config');
const logger = require('../utils/logger');
const questionGenerator = require('./QuestionGeneratorService');
const answerProcessor = require('./AnswerProcessorService');
const platformHandler = require('./PlatformHandlerService');
class GeminiIntentService {
  constructor() {
    if (!config.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.questionGenerator = questionGenerator;
    this.answerProcessor = answerProcessor;
    this.platformHandler = platformHandler;
    this.totalSteps = 11;
    this.campaignPrompts = this.questionGenerator.campaignPrompts;
    this.icpPrompts = this.campaignPrompts;
  }
  /**
   * Generate the first ICP question
   */
  async generateFirstQuestion(stepIndex = 1, context = {}) {
    try {
      return await this.questionGenerator.generateQuestion(stepIndex, context);
    } catch (error) {
      logger.error('Error generating first question', { error: error.message, stepIndex });
      throw error;
    }
  }
  /**
   * Generate next question and analyze user answer
   */
  async generateNextQuestionAndAnalyze({
    userAnswer,
    currentStepIndex,
    currentIntentKey,
    currentQuestion,
    answeredSteps = [],
    collectedAnswers = {}
  }) {
    try {
      const isLastStep = currentStepIndex >= this.totalSteps;
      const analysis = await this.answerProcessor.analyzeAnswer({
        userAnswer,
        currentStepIndex,
        currentIntentKey,
        currentQuestion,
        answeredSteps,
        collectedAnswers
      });
      if (analysis.clarificationNeeded) {
        return {
          nextQuestion: null,
          clarificationNeeded: true,
          message: analysis.message || 'Please provide more details.',
          confidence: analysis.confidence || 'medium',
          completed: false
        };
      }
      if (analysis.completed || isLastStep) {
        return {
          nextQuestion: null,
          clarificationNeeded: false,
          message: analysis.message || "Great! I've understood your requirements. Building your workflow now…",
          confidence: analysis.confidence || 'high',
          completed: true
        };
      }
      const transition = await this.platformHandler.determineNextStep({
        currentStepIndex,
        currentIntentKey,
        userAnswer,
        collectedAnswers
      });
      let nextStepIndex = transition.nextStepIndex;
      let context = transition.context || {};
      if (nextStepIndex > this.totalSteps) {
        return {
          nextQuestion: null,
          clarificationNeeded: false,
          message: "Great! I've understood your requirements. Building your workflow now…",
          confidence: 'high',
          completed: true
        };
      }
      if (nextStepIndex === 5) {
        context = this.platformHandler.buildPlatformContext(
          collectedAnswers.selected_platforms,
          collectedAnswers.completed_platform_actions || []
        );
      }
      const nextQuestion = await this.questionGenerator.generateQuestion(nextStepIndex, context);
      if (!nextQuestion || !nextQuestion.question) {
        logger.error('Generated question is invalid', { question: nextQuestion, nextStepIndex });
        return {
          nextQuestion: null,
          clarificationNeeded: false,
          message: 'Failed to generate next question',
          confidence: 'low',
          completed: false
        };
      }
      return {
        nextQuestion,
        clarificationNeeded: false,
        message: null,
        confidence: analysis.confidence || 'high',
        completed: false
      };
    } catch (error) {
      logger.error('Error in generateNextQuestionAndAnalyze', { 
        error: error.message,
        stepIndex: currentStepIndex
      });
      if (currentStepIndex >= this.totalSteps) {
        return {
          nextQuestion: null,
          clarificationNeeded: false,
          message: "Great! I've understood your requirements. Building your workflow now…",
          confidence: 'low',
          completed: true
        };
      }
      const nextStepIndex = currentStepIndex + 1;
      const nextQuestion = await this.questionGenerator.generateQuestion(nextStepIndex);
      return {
        nextQuestion,
        clarificationNeeded: false,
        message: null,
        confidence: 'low',
        completed: false
      };
    }
  }
  /**
   * Legacy methods for backward compatibility
   */
  async generatePlatformFeaturesStep(context) {
    return this.questionGenerator.generatePlatformFeaturesStep(context);
  }
  async generateConfirmationStep(context) {
    return this.questionGenerator.generateConfirmationStep(context);
  }
  buildConversationPrompt(params) {
    return this.answerProcessor.buildConversationPrompt(params);
  }
  parseConversationResponse(text, currentStepIndex, isLastStep) {
    return this.answerProcessor.parseConversationResponse(text, currentStepIndex);
  }
  async analyzeAnswerAndDecideNextStep({
    userAnswer,
    currentStepIndex,
    currentIntentKey,
    currentQuestion,
    availableSteps = [1, 2, 3, 4, 5, 6, 7],
    answeredSteps = []
  }) {
    try {
      const nextStepIndex = this.getNextAvailableStep(
        currentStepIndex,
        availableSteps,
        answeredSteps
      );
      return {
        nextStepIndex,
        clarificationNeeded: false,
        confidence: 'medium',
        reasoning: 'Proceeding to next step',
        extractedData: {}
      };
    } catch (error) {
      logger.error('Error in analyzeAnswerAndDecideNextStep', { error: error.message });
      const nextStepIndex = this.getNextAvailableStep(
        currentStepIndex,
        availableSteps,
        answeredSteps
      );
      return {
        nextStepIndex,
        clarificationNeeded: false,
        confidence: 'low',
        reasoning: 'Fallback: proceeding to next sequential step',
        extractedData: {}
      };
    }
  }
  buildAnalysisPrompt(params) {
    const { userAnswer, currentStepIndex, currentIntentKey, currentQuestion, availableSteps, answeredSteps } = params;
    return `You are an AI assistant helping with ICP (Ideal Customer Profile) onboarding.
CURRENT CONTEXT:
- Current Step: ${currentStepIndex}
- Current Question Intent: ${currentIntentKey}
- Current Question: "${currentQuestion}"
- User's Answer: "${userAnswer}"
- Available Steps: ${availableSteps.join(', ')}
- Already Answered Steps: ${answeredSteps.length > 0 ? answeredSteps.join(', ') : 'None'}
YOUR TASK:
Analyze the user's answer and determine:
1. Is the answer complete and satisfactory? (clarificationNeeded: true/false)
2. What should be the next step_index? (nextStepIndex: number)
3. Your confidence level (confidence: 'high' | 'medium' | 'low')
4. Brief reasoning for your decision
RULES:
- If answer is incomplete/unclear → clarificationNeeded: true, nextStepIndex: same as current
- If answer is complete → clarificationNeeded: false, nextStepIndex: next available step
- Next step must be in availableSteps array
- Next step should NOT be in answeredSteps (unless clarification needed)
- If current step is last (7), nextStepIndex should be null or -1 to indicate completion
RESPOND IN VALID JSON FORMAT:
{
  "nextStepIndex": <number or null>,
  "clarificationNeeded": <boolean>,
  "confidence": "<high|medium|low>",
  "reasoning": "<brief explanation>",
  "extractedData": {
    "key": "value"
  }
}`;
  }
  parseAnalysisResponse(text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      logger.error('Failed to parse analysis response', { error: error.message });
      return {
        nextStepIndex: null,
        clarificationNeeded: false,
        confidence: 'low',
        reasoning: 'Failed to parse response'
      };
    }
  }
  validateNextStep(nextStepIndex, availableSteps, answeredSteps, currentStepIndex) {
    if (nextStepIndex === null || nextStepIndex === -1) {
      const maxStep = Math.max(...availableSteps);
      if (currentStepIndex >= maxStep) {
        return null;
      }
      return this.getNextAvailableStep(currentStepIndex, availableSteps, answeredSteps);
    }
    if (!availableSteps.includes(nextStepIndex)) {
      return this.getNextAvailableStep(currentStepIndex, availableSteps, answeredSteps);
    }
    if (answeredSteps.includes(nextStepIndex) && nextStepIndex <= currentStepIndex) {
      return this.getNextAvailableStep(currentStepIndex, availableSteps, answeredSteps);
    }
    return nextStepIndex;
  }
  getNextAvailableStep(currentStepIndex, availableSteps, answeredSteps) {
    const sortedSteps = [...availableSteps].sort((a, b) => a - b);
    for (const step of sortedSteps) {
      if (step > currentStepIndex && !answeredSteps.includes(step)) {
        return step;
      }
    }
    return null;
  }
}
module.exports = new GeminiIntentService();