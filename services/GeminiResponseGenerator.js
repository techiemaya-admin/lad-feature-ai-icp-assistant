/**
 * Response Generator
 * Uses Claude (Anthropic) to generate natural, conversational responses
 */
const logger = require('../utils/logger');
const claudeClient = require('./claude-client.service');
const promptLoader = require('./PromptLoader');
class GeminiResponseGenerator {
  /**
   * Generate natural conversational response using Gemini
   */
  static async generateResponse({
    stage,
    context,
    message,
    conversationHistory = [],
    questionType = null
  }) {
    if (!claudeClient.isAvailable()) {
      return this.generateFallbackResponse(stage, context, questionType);
    }
    try {
      const ContextManager = require('./ContextManager');
      const contextSummary = ContextManager.formatContextForAI(context);
      const recentHistory = conversationHistory
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
      const stageInstructions = this.getStageInstructions(stage, context, questionType);
      // Check if the question for this stage was already answered
      const alreadyAnswered = this.checkIfQuestionAlreadyAnswered(stage, context, recentHistory);
      const prompt = await promptLoader.build('maya_conversation', {
          CONTEXT_SUMMARY: contextSummary,
          RECENT_HISTORY: recentHistory || 'This is the start of the conversation.',
          STAGE: stage,
          MESSAGE: message || '(no message yet)',
          ALREADY_ANSWERED_WARN: alreadyAnswered ? '\n**⚠️ IMPORTANT: The question for this stage has ALREADY been answered. DO NOT ask it again. Move to the next question or acknowledge the answer.**' : '',
          STAGE_INSTRUCTIONS: stageInstructions,
      }, '');
      const responseText = (await claudeClient.generateContent(prompt)).trim();
      // Clean up the response (remove any markdown, quotes, etc.)
      let cleanResponse = responseText
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .trim();
      logger.debug('Claude generated response', { response: cleanResponse });
      return cleanResponse;
    } catch (error) {
      logger.warn('Claude response generation error', { error: error.message, stage, context });
      return this.generateFallbackResponse(stage, context, questionType);
    }
  }
  /**
   * Check if the question for a stage was already answered
   */
  static checkIfQuestionAlreadyAnswered(stage, context, recentHistory) {
    switch (stage) {
      case 'outreach_type':
        return !!context.outreachType;
      case 'outbound_target_knowledge':
        return !!context.targetKnowledge;
      case 'inbound_flow':
        if (!context.inboundSource) return false;
        if (context.inboundDataReady === null) return false;
        return true;
      default:
        return false;
    }
  }
  /**
   * Get stage-specific instructions for Gemini
   */
  static getStageInstructions(stage, context, questionType) {
    switch (stage) {
      case 'init':
      case 'outreach_type':
        if (!context.outreachType) {
          return 'Ask the user: "What type of outreach are you setting up?" and present TWO options clearly: "1) Inbound (leads come to you)" and "2) Outbound (you reach out to prospects)". Do NOT ask about categories, automation types, or anything else. ONLY ask about inbound vs outbound.';
        }
        return 'The user has already indicated their outreach type. Move to the next appropriate question.';
      case 'inbound_flow':
        if (!context.inboundSource) {
          return 'Ask where the inbound leads are coming from (website form, WhatsApp, ads, CRM, etc.). Be conversational.';
        }
        if (context.inboundDataReady === null) {
          return 'Ask if they already have prospect data captured. Be friendly and natural.';
        }
        if (!context.inboundDataReady && !context.captureRules) {
          return 'Ask what minimum details should be captured from leads. Be helpful and conversational.';
        }
        return 'Move to confirmation - summarize what you understood.';
      case 'outbound_target_knowledge':
        if (!context.targetKnowledge) {
          return 'Ask if they already know who they want to target, or if they want help discovering ideal prospects. Use natural language.';
        }
        return 'The user has answered. Move to the next stage.';
      case 'outbound_known_target':
        if (context.linkedinUrls.length === 0 && context.companies.length === 0) {
          return 'Ask what information they already have (LinkedIn profiles, company names, roles, locations). Be conversational.';
        }
        if (context.companies.length > 0 && context.roles.length === 0) {
          return 'Ask which role or job title they want to target. Be natural.';
        }
        if (context.companies.length > 0 && context.roles.length > 0 && context.locations.length === 0) {
          return 'Ask which location or geography to focus on. Be friendly.';
        }
        return 'Move to confirmation - summarize what you understood.';
      case 'outbound_icp_discovery':
        if (questionType === 'nationality') {
          return 'Ask if they have a preferred nationality or ethnicity for the decision makers they want to target (e.g. Indian expats in UAE, Filipino professionals). Mention this is optional and they can skip it. Be natural and non-judgmental.';
        }
        if (questionType === 'lookalike') {
          return 'Ask if they have 2-3 example customers they\'ve already won deals with — names, job titles, and companies. These help find similar profiles. Mention it\'s optional and they can skip. Be friendly and brief.';
        }
        if (!context.problemStatement) {
          return 'Ask what problem their solution solves. Be conversational and helpful.';
        }
        if (context.roles.length === 0) {
          return 'Ask who typically makes the buying decision (role or department). Give examples naturally.';
        }
        if (context.industries.length === 0) {
          return 'Ask what industries their ideal customers are in. Give examples naturally.';
        }
        if (!context.companySize) {
          return 'Ask what company size works best (small businesses, mid-market, enterprise). Be conversational.';
        }
        if (context.locations.length === 0) {
          return 'Ask which geographic regions to focus on. Give examples naturally.';
        }
        if (!context.dealType) {
          return 'Ask what deal size they\'re targeting (SMB, mid-market, enterprise). Be natural.';
        }
        return 'Move to confirmation - summarize what you understood.';
      case 'confirmation':
        return 'Present a clear summary of what you understood and ask if it looks correct. Be friendly and concise.';
      case 'ready_for_execution':
        return 'Acknowledge that you\'re ready to move forward. Be positive and brief.';
      default:
        return 'Continue the conversation naturally based on the context.';
    }
  }
  /**
   * Fallback response generator (if Gemini unavailable)
   */
  static generateFallbackResponse(stage, context, questionType) {
    // Use natural fallback responses
    switch (stage) {
      case 'outreach_type':
        return "👉 What type of outreach are you setting up?\n\n1) Inbound (leads come to you)\n2) Outbound (you reach out to prospects)";
      case 'inbound_flow':
        if (!context.inboundSource) {
          return "Great! Where are these inbound leads coming from? For example, your website form, WhatsApp, ads, or a CRM system.";
        }
        if (context.inboundDataReady === null) {
          return "Do you already have prospect data captured, or do we need to set up data collection?";
        }
        return "Perfect! I understand your inbound setup.";
      case 'outbound_target_knowledge':
        return "Perfect! Do you already have specific people or companies in mind, or would you like me to help you discover ideal prospects?";
      case 'outbound_known_target':
        return "Got it! What information do you already have? For example, LinkedIn profile links, specific company names, or decision maker roles and locations.";
      case 'outbound_icp_discovery':
        if (questionType === 'nationality') {
          return "One more optional question — do your ideal customers have a preferred nationality? For example, Indian expats in UAE, Filipino professionals, or any specific background. You can skip this if it's not relevant.";
        }
        if (questionType === 'lookalike') {
          return "Last optional question — do you have 2-3 example customers you've already won? Share their name, title, and company. For example: 'Ahmed Al-Rashid, VP Sales at Etisalat'. This helps me find very similar profiles. You can skip this if you don't have examples.";
        }
        if (!context.problemStatement) {
          return "Perfect! Let's discover your ideal prospects together. To get started, what problem does your solution solve?";
        }
        if (context.roles.length === 0) {
          return "Who typically makes the buying decision? For example, CEOs, Marketing Directors, or Founders.";
        }
        if (context.industries.length === 0) {
          return "What industries are your ideal customers in? For example, SaaS, Healthcare, or FinTech.";
        }
        return "Great! I'm gathering the information I need.";
      case 'confirmation':
        const StageHandlers = require('./StageHandlers');
        const confirmationMsg = StageHandlers.generateConfirmationMessage(context);
        return confirmationMsg.text;
      default:
        return "I'm ready to help. What would you like to do next?";
    }
  }
}
module.exports = GeminiResponseGenerator;
