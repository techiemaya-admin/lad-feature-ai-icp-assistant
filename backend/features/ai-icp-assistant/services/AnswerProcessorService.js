/**
 * Answer Processor Service
 * Handles answer analysis and validation
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../utils/config');
const logger = require('../utils/logger');

class AnswerProcessorService {
  constructor() {
    if (!config.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: config.AI_MODEL });
  }

  /**
   * Analyze answer and determine if clarification is needed
   */
  async analyzeAnswer({
    userAnswer,
    currentStepIndex,
    currentIntentKey,
    currentQuestion,
    answeredSteps = [],
    collectedAnswers = {}
  }) {
    try {
      if (this.shouldSkipGemini(currentStepIndex, currentIntentKey, userAnswer, collectedAnswers)) {
        return this.handleSkippedAnalysis(currentStepIndex, currentIntentKey, userAnswer, collectedAnswers);
      }

      if (currentStepIndex === 4 && currentIntentKey === 'selected_platforms') {
        return this.validatePlatformSelection(userAnswer, collectedAnswers);
      }

      const conversationPrompt = this.buildConversationPrompt({
        userAnswer,
        currentStepIndex,
        currentIntentKey,
        currentQuestion,
        answeredSteps
      });

      const result = await this.model.generateContent(conversationPrompt);
      const response = await result.response;
      const text = response.text();

      const analysis = this.parseConversationResponse(text, currentStepIndex);

      if (this.shouldOverrideGeminiAnalysis(currentStepIndex, currentIntentKey, userAnswer, analysis)) {
        return this.getOverriddenAnalysis(analysis);
      }

      return analysis;
    } catch (error) {
      logger.error('Error analyzing answer', { 
        error: error.message, 
        stepIndex: currentStepIndex,
        intentKey: currentIntentKey 
      });
      return this.getFallbackAnalysis(currentStepIndex);
    }
  }

  /**
   * Check if we should skip Gemini for this answer
   */
  shouldSkipGemini(stepIndex, intentKey, userAnswer, collectedAnswers) {
    const isTemplateCollection = stepIndex === 5 && intentKey && intentKey.endsWith('_template');
    return isTemplateCollection;
  }

  /**
   * Handle analysis for skipped Gemini calls
   */
  handleSkippedAnalysis(stepIndex, intentKey, userAnswer, collectedAnswers) {
    if (stepIndex === 5 && intentKey.endsWith('_template')) {
      const basePlatformKey = intentKey.replace('_template', '');
      const selectedPlatforms = this.normalizePlatforms(collectedAnswers.selected_platforms || []);
      let completedActions = collectedAnswers.completed_platform_actions || [];
      
      if (!completedActions.includes(basePlatformKey)) {
        completedActions = [...completedActions, basePlatformKey];
      }
      
      const allPlatformsDone = selectedPlatforms.length > 0 && 
                               selectedPlatforms.every(p => completedActions.includes(p));
      
      return {
        clarificationNeeded: false,
        message: null,
        confidence: 'high',
        completed: false,
        nextStepIndex: allPlatformsDone ? 6 : 5,
        context: allPlatformsDone ? {} : {
          selected_platforms: selectedPlatforms,
          completed_platform_actions: completedActions
        }
      };
    }

    return this.getFallbackAnalysis(stepIndex);
  }

  /**
   * Validate platform selection
   */
  validatePlatformSelection(userAnswer, collectedAnswers) {
    const answerLower = userAnswer.toLowerCase().trim();
    const isSkip = answerLower === 'skip';
    const validPlatforms = ['linkedin', 'email', 'whatsapp', 'voice', 'voice calls', 'voice call'];
    
    const hasValidPlatform = validPlatforms.some(vp => answerLower.includes(vp));
    const answerParts = userAnswer.split(',').map(s => s.trim().toLowerCase());
    const hasValidPlatformInList = answerParts.some(part => 
      validPlatforms.some(vp => part.includes(vp) || vp.includes(part))
    );
    
    if (!hasValidPlatform && !hasValidPlatformInList && !isSkip) {
      return {
        clarificationNeeded: true,
        message: 'Please select at least one platform from the options (LinkedIn, Email, WhatsApp, Voice Calls) or say Skip.',
        confidence: 'low',
        completed: false,
        nextStepIndex: 4
      };
    }
    
    const platforms = answerParts.filter(part => 
      validPlatforms.some(vp => part.includes(vp) || vp.includes(part))
    );
    
    return {
      clarificationNeeded: false,
      message: null,
      confidence: 'high',
      completed: false,
      nextStepIndex: 5,
      context: {
        selected_platforms: platforms.length > 0 ? platforms : [userAnswer],
        completed_platform_actions: []
      }
    };
  }

  /**
   * Check if Gemini analysis should be overridden
   */
  shouldOverrideGeminiAnalysis(stepIndex, intentKey, userAnswer, analysis) {
    if (stepIndex === 5 && this.isPlatformActionIntent(intentKey)) {
      const actionKeywords = this.getActionKeywords(intentKey);
      const answerLower = userAnswer.toLowerCase().trim();
      const hasValidAction = actionKeywords.some(keyword => answerLower.includes(keyword));
      
      return hasValidAction && analysis.clarificationNeeded;
    }
    
    return false;
  }

  /**
   * Get overridden analysis
   */
  getOverriddenAnalysis(originalAnalysis) {
    return {
      ...originalAnalysis,
      clarificationNeeded: false,
      message: null,
      confidence: 'high'
    };
  }

  /**
   * Check if intent is platform action
   */
  isPlatformActionIntent(intentKey) {
    return ['linkedin_actions', 'email_actions', 'whatsapp_actions', 'voice_actions'].includes(intentKey);
  }

  /**
   * Get action keywords for validation
   */
  getActionKeywords(intentKey) {
    const keywords = {
      linkedin_actions: ['visit', 'profile', 'follow', 'connection', 'request', 'message', 'send'],
      email_actions: ['send', 'email', 'follow-up', 'sequence', 'track', 'opens', 'clicks', 'bounce'],
      whatsapp_actions: ['broadcast', 'message', 'follow-up', 'template'],
      voice_actions: ['call', 'trigger', 'script']
    };
    return keywords[intentKey] || [];
  }

  /**
   * Build conversation prompt for Gemini
   */
  buildConversationPrompt({ userAnswer, currentStepIndex, currentIntentKey, currentQuestion, answeredSteps }) {
    const safeUserAnswer = String(userAnswer || '').trim();
    const safeCurrentQuestion = String(currentQuestion || '').trim();
    const safeIntentKey = String(currentIntentKey || 'unknown');
    
    const totalSteps = 11;
    const isLastStep = currentStepIndex >= totalSteps;

    const specialInstructions = this.getSpecialInstructions(currentStepIndex, safeIntentKey);

    return `You are MAYA AI – a guided campaign & workflow builder.

CURRENT CONTEXT:
- Current Step: ${currentStepIndex} of ${totalSteps}
- Current Question: "${safeCurrentQuestion}"
- User's Answer: "${safeUserAnswer}"
- Current Intent: ${safeIntentKey}
${specialInstructions}
YOUR TASK:
1. Analyze if the user's answer is complete and relevant to the current question
2. If the answer is incomplete/irrelevant → Set clarificationNeeded: true and provide a helpful message
3. If the answer is complete → Proceed to next step sequentially (Step ${currentStepIndex + 1})

CRITICAL RULES:
- You MUST ask ALL ${totalSteps} steps in sequence (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)
- NEVER skip steps or mark as completed before Step ${totalSteps}
- ONLY mark as completed when Step ${totalSteps} is answered
- ALWAYS proceed to the next sequential step (${currentStepIndex + 1}) unless clarification is needed

${isLastStep ? `This is the LAST step (Step ${totalSteps}). If the answer is complete, mark as completed.` : `Next step will be Step ${currentStepIndex + 1}`}

RESPOND IN VALID JSON FORMAT:
{
  "clarificationNeeded": <boolean>,
  "message": "<your message to user - clarification request OR completion message OR null if proceeding>",
  "confidence": "<high|medium|low>",
  "completed": <boolean - true ONLY if this is Step ${totalSteps} and answer is complete>
}

IMPORTANT:
- Be friendly and conversational in your messages
- If clarification needed, explain what's missing clearly
- If completed (Step ${totalSteps} only), congratulate and indicate next steps
- Keep messages concise (1-2 sentences max)
- NEVER skip steps - always go sequentially from ${currentStepIndex} to ${currentStepIndex + 1}`;
  }

  /**
   * Get special instructions based on step
   */
  getSpecialInstructions(stepIndex, intentKey) {
    if (stepIndex === 5 && this.isPlatformActionIntent(intentKey)) {
      return `
IMPORTANT: You are on Step 5 - Platform Actions.
The user is answering about actions for a platform (e.g., "Visit profile, Send connection request").
If the answer contains action-related keywords (visit, follow, send, connection, message, etc.), ACCEPT IT.
Do NOT ask about platform selection - that was already done in Step 4.
Do NOT ask for clarification unless the answer is completely unrelated to actions.
`;
    }

    if (stepIndex === 10 && (intentKey === 'campaign_days' || intentKey === 'working_days')) {
      return `
IMPORTANT: You are on Step 10 - Campaign Settings, Sub-step: ${intentKey}.
The user is answering a specific sub-step question about campaign settings.
- If intentKey is "campaign_days": Accept answers like "7", "14", "30", "60", "7 days", "14 days", etc.
- If intentKey is "working_days": Accept answers like "Monday-Friday", "All days", "Weekdays", etc.
Do NOT confuse answers between sub-steps. If the user answers the correct sub-step question, ACCEPT IT.
Do NOT ask for clarification unless the answer is completely unrelated to the current sub-step.
`;
    }

    if (stepIndex === 6 || stepIndex === 7) {
      return `
IMPORTANT: You are on Step ${stepIndex} - ${stepIndex === 6 ? 'Workflow Delays' : 'Workflow Conditions'}.
The user can say "Skip", "No delay", "No conditions" to proceed without configuring this step.
Accept these as valid answers and proceed to the next step.
`;
    }

    return '';
  }

  /**
   * Parse Gemini's conversation response
   */
  parseConversationResponse(text, currentStepIndex) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          clarificationNeeded: parsed.clarificationNeeded || false,
          message: parsed.message || null,
          confidence: parsed.confidence || 'medium',
          completed: parsed.completed || false
        };
      }
      return JSON.parse(text);
    } catch (error) {
      logger.error('Failed to parse Gemini response', { error: error.message, text });
      return {
        clarificationNeeded: false,
        message: null,
        confidence: 'low',
        completed: currentStepIndex >= 11
      };
    }
  }

  /**
   * Get fallback analysis
   */
  getFallbackAnalysis(stepIndex) {
    return {
      clarificationNeeded: false,
      message: null,
      confidence: 'low',
      completed: stepIndex >= 11
    };
  }

  /**
   * Normalize platform names
   */
  normalizePlatforms(platforms) {
    let platformList = [];
    
    if (Array.isArray(platforms)) {
      platformList = platforms;
    } else if (typeof platforms === 'string') {
      platformList = platforms.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    return platformList.map(p => {
      const pLower = p.toLowerCase().trim();
      if (pLower.includes('linkedin')) return 'linkedin';
      if (pLower.includes('email') || pLower.includes('mail')) return 'email';
      if (pLower.includes('whatsapp')) return 'whatsapp';
      if (pLower.includes('voice')) return 'voice';
      return p.toLowerCase();
    }).filter(p => p);
  }
}

module.exports = new AnswerProcessorService();
