/**
 * Gemini Response Generator
 * Uses Gemini API to generate natural, conversational responses
 */

let genAI = null;
let GoogleGenerativeAI = null;

try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log('✅ Gemini AI initialized for response generation');
  }
} catch (error) {
  console.log('⚠️ Gemini AI package not found for response generation');
  genAI = null;
}

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
    if (!genAI) {
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
      
      const prompt = `You are Maya, a friendly and professional AI assistant helping users set up their outreach campaigns. You're having a natural conversation to understand their needs.

**Current Context:**
${contextSummary}

**Recent Conversation:**
${recentHistory || 'This is the start of the conversation.'}

**Current Stage:** ${stage}
**User's Latest Message:** "${message || '(no message yet)'}"

**Your Task:**
${stageInstructions}

**Response Guidelines:**
- Be warm, friendly, and professional (like a top-tier AI assistant)
- Use natural, conversational language (not robotic or formulaic)
- Keep responses concise (1-2 sentences max)
- Don't use numbered options (1) / 2)) - use natural phrasing
- Don't repeat questions that were already answered
- If the user's message answers your question, acknowledge it naturally and move to the next question
- If the message is unclear, ask for clarification in a friendly way

**IMPORTANT:**
- If the user has already answered a question, acknowledge it and ask the NEXT question
- Never repeat a question that's already been answered
- Always move the conversation forward
- Check the conversation history - if a question was already asked and answered, skip it

Generate your response now (just the text, no JSON, no explanations):`;

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text().trim();

      // Clean up the response (remove any markdown, quotes, etc.)
      let cleanResponse = responseText
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .trim();

      console.log(`🤖 Gemini generated response: "${cleanResponse}"`);
      return cleanResponse;

    } catch (error) {
      console.warn('⚠️ Gemini response generation error:', error.message);
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
          return 'Ask the user what type of outreach they want to set up - inbound (leads come to them) or outbound (they reach out to prospects). Use natural, conversational phrasing.';
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
        return "I'd be happy to help you set up your outreach! Are you looking to respond to inbound leads that come to you, or proactively reach out to prospects?";
      
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

