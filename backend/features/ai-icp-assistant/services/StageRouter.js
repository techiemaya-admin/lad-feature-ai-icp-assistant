/**
 * Stage Router
 * Routes conversation flow to appropriate stage handlers
 */
const ContextManager = require('./ContextManager');
const IntentExtractor = require('./IntentExtractor');
const StageHandlers = require('./StageHandlers');
const GeminiResponseGenerator = require('./GeminiResponseGenerator');
const MessageHelper = require('./MessageHelper');
const ResponseBuilder = require('./ResponseBuilder');
class StageRouter {
  /**
   * Infer context from conversation history
   */
  static inferContextFromHistory(context, conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) return context;
    const historyText = conversationHistory.map(m => m.content).join(' ').toLowerCase();
    // Infer outreachType if not set
    if (!context.outreachType) {
      if (historyText.match(/\b(inbound|incoming|leads come|respond to|follow.?up)\b/)) {
        context.outreachType = 'inbound';
      } else if (historyText.match(/\b(outbound|reach out|proactively|contact|find new|discover)\b/)) {
        context.outreachType = 'outbound';
      }
    }
    // Infer targetKnowledge if outbound and not set
    if (context.outreachType === 'outbound' && !context.targetKnowledge) {
      if (historyText.match(/\b(already have|have profiles?|have linkedin|have names?|specific people|these companies|know my|know the)\b/)) {
        context.targetKnowledge = 'known';
      } else if (historyText.match(/\b(dont know|don't know|not sure|discover|find new|need to find|looking for|ideal prospects)\b/)) {
        context.targetKnowledge = 'discovery';
      }
    }
    return context;
  }
  /**
   * Handle init stage
   */
  static async handleInitStage(message, context, conversationHistory) {
    const isGreeting = MessageHelper.isGreetingMessage(message);
    if (isGreeting || conversationHistory.length === 0) {
      context.stage = 'outreach_type';
      context.status = 'collecting_info';
      const response = await GeminiResponseGenerator.generateResponse({
        stage: 'outreach_type',
        context,
        message: '',
        conversationHistory
      });
      return ResponseBuilder.collectingInfo(response, context);
    }
    // Auto-advance to outreach_type if we have history
    context.stage = 'outreach_type';
    return { autoAdvance: true, context };
  }
  /**
   * Handle outreach_type stage
   */
  static async handleOutreachTypeStage(message, context, conversationHistory) {
    if (!message || message.trim() === '') {
      const response = await GeminiResponseGenerator.generateResponse({
        stage: 'outreach_type',
        context,
        message: '',
        conversationHistory
      });
      return ResponseBuilder.collectingInfo(response, context);
    }
    // Use Gemini to extract intent
    const intentData = await IntentExtractor.extractOutreachIntent(message, conversationHistory, context);
    const outreachType = intentData.outreachType || IntentExtractor.extractOutreachType(message);
    if (outreachType) {
      context.outreachType = outreachType;
      context.stage = outreachType === 'inbound' ? 'inbound_flow' : 'outbound_target_knowledge';
      const response = await GeminiResponseGenerator.generateResponse({
        stage: context.stage,
        context,
        message,
        conversationHistory
      });
      return ResponseBuilder.collectingInfo(response, context);
    } else {
      // Ask for clarification
      const response = await GeminiResponseGenerator.generateResponse({
        stage: 'outreach_type',
        context,
        message,
        conversationHistory,
        questionType: 'clarification'
      });
      return ResponseBuilder.collectingInfo(response, context);
    }
  }
  /**
   * Handle inbound_flow stage
   */
  static async handleInboundFlowStage(message, context, conversationHistory) {
    // Check if already complete
    if (context.inboundSource && context.inboundDataReady !== null) {
      context.stage = 'confirmation';
      const confirmationMsg = StageHandlers.generateConfirmationMessage(context);
      return ResponseBuilder.awaitingConfirmation(confirmationMsg.text, context);
    }
    if (!message || message.trim() === '') {
      if (!context.inboundSource) {
        const response = await GeminiResponseGenerator.generateResponse({
          stage: 'inbound_flow',
          context,
          message: '',
          conversationHistory
        });
        return ResponseBuilder.collectingInfo(response, context);
      }
    }
    return await StageHandlers.handleInboundFlow(message, context, conversationHistory);
  }
  /**
   * Handle outbound_target_knowledge stage
   */
  static async handleOutboundTargetKnowledgeStage(message, context, conversationHistory) {
    if (!message || message.trim() === '') {
      const response = await GeminiResponseGenerator.generateResponse({
        stage: 'outbound_target_knowledge',
        context,
        message: '',
        conversationHistory
      });
      return ResponseBuilder.collectingInfo(response, context);
    }
    // Use Gemini to extract intent
    const intentData = await IntentExtractor.extractOutreachIntent(message, conversationHistory, context);
    const targetKnowledge = intentData.targetKnowledge || IntentExtractor.extractTargetKnowledge(message);
    if (targetKnowledge) {
      context.targetKnowledge = targetKnowledge;
      context.stage = targetKnowledge === 'known' ? 'outbound_known_target' : 'outbound_icp_discovery';
      const response = await GeminiResponseGenerator.generateResponse({
        stage: context.stage,
        context,
        message,
        conversationHistory
      });
      return ResponseBuilder.collectingInfo(response, context);
    } else {
      // Ask for clarification
      const response = await GeminiResponseGenerator.generateResponse({
        stage: 'outbound_target_knowledge',
        context,
        message,
        conversationHistory,
        questionType: 'clarification'
      });
      return ResponseBuilder.collectingInfo(response, context);
    }
  }
  /**
   * Handle outbound_known_target stage
   */
  static async handleOutboundKnownTargetStage(message, context, conversationHistory) {
    if (!message || message.trim() === '') {
      const response = await GeminiResponseGenerator.generateResponse({
        stage: 'outbound_known_target',
        context,
        message: '',
        conversationHistory
      });
      return ResponseBuilder.collectingInfo(response, context);
    }
    return await StageHandlers.handleOutboundKnownTarget(message, context, conversationHistory);
  }
  /**
   * Handle outbound_icp_discovery stage
   */
  static async handleOutboundICPDiscoveryStage(message, context, conversationHistory) {
    if (!message || message.trim() === '') {
      const response = await GeminiResponseGenerator.generateResponse({
        stage: 'outbound_icp_discovery',
        context,
        message: '',
        conversationHistory
      });
      return ResponseBuilder.collectingInfo(response, context);
    }
    return await StageHandlers.handleOutboundICPDiscovery(message, context, conversationHistory);
  }
  /**
   * Auto-advance stages based on context
   */
  static autoAdvanceStage(context) {
    // Skip outreach_type if already set
    if (context.outreachType && (context.stage === 'outreach_type')) {
      context.stage = context.outreachType === 'inbound' ? 'inbound_flow' : 'outbound_target_knowledge';
      return true;
    }
    // Skip outbound_target_knowledge if targetKnowledge already set
    if (context.outreachType === 'outbound' && context.targetKnowledge && 
        (context.stage === 'outbound_target_knowledge')) {
      context.stage = context.targetKnowledge === 'known' ? 'outbound_known_target' : 'outbound_icp_discovery';
      return true;
    }
    return false;
  }
  /**
   * Get fallback stage based on context
   */
  static getFallbackStage(context) {
    if (context.outreachType === 'inbound') {
      return 'inbound_flow';
    }
    if (context.outreachType === 'outbound') {
      if (!context.targetKnowledge) {
        return 'outbound_target_knowledge';
      }
      return context.targetKnowledge === 'known' ? 'outbound_known_target' : 'outbound_icp_discovery';
    }
    return 'outreach_type';
  }
  /**
   * Check if stage is valid for current context
   */
  static isValidStage(stage, context) {
    const validStages = ['init', 'outreach_type', 'confirmation', 'ready_for_execution'];
    if (context.outreachType === 'inbound') {
      validStages.push('inbound_flow');
    }
    if (context.outreachType === 'outbound') {
      validStages.push('outbound_target_knowledge', 'outbound_known_target', 'outbound_icp_discovery');
    }
    return validStages.includes(stage);
  }
}
module.exports = StageRouter;