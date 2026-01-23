/**
 * Stage Handlers
 * Handles stage-specific conversation flows
 */
const IntentExtractor = require('./IntentExtractor');
const ContextManager = require('./ContextManager');
const GeminiResponseGenerator = require('./GeminiResponseGenerator');
class StageHandlers {
  /**
   * Handle inbound flow questions
   */
  static async handleInboundFlow(message, context, conversationHistory) {
    if (!context.inboundSource) {
      const source = IntentExtractor.extractInboundSource(message);
      if (source) {
        context.inboundSource = source;
        const response = await GeminiResponseGenerator.generateResponse({
          stage: 'inbound_flow',
          context,
          message,
          conversationHistory
        });
        return {
          success: true,
          response,
          text: response,
          assistantContext: context,
          status: 'collecting_info',
          readyForExecution: false,
          model: 'gemini-2.0-flash',
          tokensUsed: null
        };
      } else {
        const response = await GeminiResponseGenerator.generateResponse({
          stage: 'inbound_flow',
          context,
          message,
          conversationHistory,
          questionType: 'clarification'
        });
        return {
          success: true,
          response,
          text: response,
          assistantContext: context,
          status: 'collecting_info',
          readyForExecution: false,
          model: 'gemini-2.0-flash',
          tokensUsed: null
        };
      }
    }
    if (context.inboundDataReady === null) {
      const hasData = IntentExtractor.extractYesNo(message);
      if (hasData !== null) {
        context.inboundDataReady = hasData;
        if (hasData) {
          context.stage = 'confirmation';
          const confirmationMsg = this.generateConfirmationMessage(context);
          return {
            success: true,
            response: confirmationMsg.text,
            text: confirmationMsg.text,
            assistantContext: context,
            status: 'awaiting_confirmation',
            readyForExecution: false,
            model: 'gemini-2.0-flash',
            tokensUsed: null
          };
        } else {
          const response = await GeminiResponseGenerator.generateResponse({
            stage: 'inbound_flow',
            context,
            message,
            conversationHistory
          });
          return {
            success: true,
            response,
            text: response,
            assistantContext: context,
            status: 'collecting_info',
            readyForExecution: false,
            model: 'gemini-2.0-flash',
            tokensUsed: null
          };
        }
      } else {
        const response = await GeminiResponseGenerator.generateResponse({
          stage: 'inbound_flow',
          context,
          message,
          conversationHistory,
          questionType: 'clarification'
        });
        return {
          success: true,
          response,
          text: response,
          assistantContext: context,
          status: 'collecting_info',
          readyForExecution: false,
          model: 'gemini-2.0-flash',
          tokensUsed: null
        };
      }
    }
    if (!context.inboundDataReady && !context.captureRules) {
      context.captureRules = message;
      context.stage = 'confirmation';
      const confirmationMsg = this.generateConfirmationMessage(context);
      return {
        success: true,
        response: confirmationMsg.text,
        text: confirmationMsg.text,
        assistantContext: context,
        status: 'awaiting_confirmation',
        readyForExecution: false,
        model: 'gemini-2.0-flash',
        tokensUsed: null
      };
    }
    context.stage = 'confirmation';
    const confirmationMsg = this.generateConfirmationMessage(context);
    return {
      success: true,
      response: confirmationMsg.text,
      text: confirmationMsg.text,
      assistantContext: context,
      status: 'awaiting_confirmation',
      readyForExecution: false,
      model: 'gemini-2.0-flash',
      tokensUsed: null
    };
  }
  /**
   * Handle outbound known target path
   */
  static async handleOutboundKnownTarget(message, context, conversationHistory) {
    const linkedinMatches = message.match(/linkedin\.com\/in\/[\w-]+/gi);
    if (linkedinMatches && linkedinMatches.length > 0) {
      context.linkedinUrls = [...new Set([...context.linkedinUrls, ...linkedinMatches])];
      context.inferredStrategy = 'people_enrichment';
      context.stage = 'confirmation';
      const confirmationMsg = this.generateConfirmationMessage(context);
      return {
        success: true,
        response: confirmationMsg.text,
        text: confirmationMsg.text,
        assistantContext: context,
        status: 'awaiting_confirmation',
        readyForExecution: false,
        model: 'gemini-2.0-flash',
        tokensUsed: null
      };
    }
    const intentData = await IntentExtractor.extractOutreachIntent(message, conversationHistory, context);
    context = ContextManager.updateContext(context, intentData, message);
    const missing = [];
    if (context.companies.length === 0) {
      missing.push('companies');
    } else if (context.roles.length === 0) {
      missing.push('roles');
    } else if (context.locations.length === 0) {
      missing.push('locations');
    }
    if (missing.length > 0) {
      const response = await GeminiResponseGenerator.generateResponse({
        stage: 'outbound_known_target',
        context,
        message,
        conversationHistory
      });
      return {
        success: true,
        response,
        text: response,
        assistantContext: context,
        status: 'collecting_info',
        readyForExecution: false,
        model: 'gemini-2.0-flash',
        tokensUsed: null
      };
    }
    if (context.companies.length > 0 && context.roles.length > 0 && context.locations.length > 0) {
      context.inferredStrategy = 'company_search';
      context.stage = 'confirmation';
      const confirmationMsg = this.generateConfirmationMessage(context);
      return {
        success: true,
        response: confirmationMsg.text,
        text: confirmationMsg.text,
        assistantContext: context,
        status: 'awaiting_confirmation',
        readyForExecution: false,
        model: 'gemini-2.0-flash',
        tokensUsed: null
      };
    }
    const response = await GeminiResponseGenerator.generateResponse({
      stage: 'outbound_known_target',
      context,
      message,
      conversationHistory
    });
    return {
      success: true,
      response,
      text: response,
      assistantContext: context,
      status: 'collecting_info',
      readyForExecution: false,
      model: 'gemini-2.0-flash',
      tokensUsed: null
    };
  }
  /**
   * Handle outbound ICP discovery flow
   */
  static async handleOutboundICPDiscovery(message, context, conversationHistory) {
    const intentData = await IntentExtractor.extractOutreachIntent(message, conversationHistory, context);
    context = ContextManager.updateContext(context, intentData, message);
    if (!context.problemStatement && message.trim().length > 10) {
      context.problemStatement = message;
    }
    // Check if all required fields are collected
    const hasAllData = context.problemStatement && 
                       context.roles.length > 0 && 
                       context.industries.length > 0 && 
                       context.companySize && 
                       context.locations.length > 0 && 
                       context.dealType;
    if (hasAllData) {
      context.inferredStrategy = 'people_search';
      context.stage = 'confirmation';
      const confirmationMsg = this.generateConfirmationMessage(context);
      return {
        success: true,
        response: confirmationMsg.text,
        text: confirmationMsg.text,
        assistantContext: context,
        status: 'awaiting_confirmation',
        readyForExecution: false,
        model: 'gemini-2.0-flash',
        tokensUsed: null
      };
    }
    // Use Gemini to generate the next question based on what's missing
    const response = await GeminiResponseGenerator.generateResponse({
      stage: 'outbound_icp_discovery',
      context,
      message,
      conversationHistory
    });
    return {
      success: true,
      response,
      text: response,
      assistantContext: context,
      status: 'collecting_info',
      readyForExecution: false,
      model: 'gemini-2.0-flash',
      tokensUsed: null
    };
  }
  /**
   * Get question for known target path
   */
  static getKnownTargetQuestion(context, missing) {
    if (missing === 'companies') {
      return "Which company or companies?";
    }
    if (missing === 'roles') {
      return "Which role should I focus on?";
    }
    if (missing === 'locations') {
      return "Which location?";
    }
    return "Any company size or industry preference?";
  }
  /**
   * Generate confirmation message
   */
  static generateConfirmationMessage(context) {
    const parts = [];
    if (context.outreachType === 'inbound') {
      parts.push(`You're setting up inbound outreach.`);
      if (context.inboundSource) {
        const sourceNames = {
          'website': 'Website form',
          'whatsapp': 'WhatsApp',
          'ads': 'Ads',
          'crm': 'CRM import',
          'webhook': 'Webhook or API'
        };
        parts.push(`Leads are coming from: ${sourceNames[context.inboundSource] || context.inboundSource}.`);
      }
      if (context.inboundDataReady === true) {
        parts.push("You already have prospect data captured.");
      } else if (context.inboundDataReady === false && context.captureRules) {
        parts.push(`You need to capture: ${context.captureRules}`);
      }
    }
    if (context.outreachType === 'outbound') {
      parts.push(`You're setting up outbound outreach.`);
      if (context.targetKnowledge === 'known') {
        if (context.linkedinUrls.length > 0) {
          parts.push(`You have ${context.linkedinUrls.length} LinkedIn profile(s) to reach out to.`);
        } else if (context.companies.length > 0 && context.roles.length > 0 && context.locations.length > 0) {
          const companyText = context.companies.length === 1 ? context.companies[0] : context.companies.join(', ');
          const roleText = context.roles.length === 1 ? context.roles[0] : context.roles.join(' or ');
          const locationText = context.locations.length === 1 ? context.locations[0] : context.locations.join(', ');
          parts.push(`Target: ${roleText} at ${companyText} in ${locationText}.`);
        }
      } else if (context.targetKnowledge === 'discovery') {
        if (context.problemStatement) {
          parts.push(`Problem: ${context.problemStatement}`);
        }
        if (context.roles.length > 0) {
          parts.push(`Target role: ${context.roles.join(' or ')}`);
        }
        if (context.industries.length > 0) {
          parts.push(`Industry: ${context.industries.join(' or ')}`);
        }
        if (context.locations.length > 0) {
          parts.push(`Location: ${context.locations.join(', ')}`);
        }
        if (context.companySize) {
          parts.push(`Company size: ${context.companySize}`);
        }
        if (context.dealType) {
          parts.push(`Deal type: ${context.dealType}`);
        }
      }
    }
    const summary = parts.length > 0 ? parts.join('\n') : "I understand your outreach plan.";
    const text = `Perfect! Here's what I understood:
${summary}
Does this look correct?`;
    return { text, context };
  }
}
module.exports = StageHandlers;