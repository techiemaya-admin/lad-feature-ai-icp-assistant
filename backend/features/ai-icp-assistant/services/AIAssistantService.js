/**
 * AI ICP Assistant Service (Refactored - Clean Orchestrator)
 * Main entry point for conversational ICP definition
 */
const ContextManager = require('./ContextManager');
const IntentExtractor = require('./IntentExtractor');
const StageHandlers = require('./StageHandlers');
const MessageHelper = require('./MessageHelper');
const ResponseBuilder = require('./ResponseBuilder');
const StageRouter = require('./StageRouter');
class AIAssistantService {
  /**
   * Process chat message with AI
   */
  static async processChat({
    message,
    conversationId,
    conversationHistory = [],
    searchResults = [],
    userId,
    organizationId,
    assistantContext = null
  }) {
    try {
      let context = assistantContext || ContextManager.initializeContext();
      // Infer context from conversation history
      context = StageRouter.inferContextFromHistory(context, conversationHistory);
      // Get current stage
      let effectiveStage = context.stage || 'init';
      // Auto-advance stages if needed
      const autoAdvanced = StageRouter.autoAdvanceStage(context);
      if (autoAdvanced) {
        effectiveStage = context.stage;
      }
      // Handle confirmation stage (highest priority)
      if (effectiveStage === 'confirmation') {
        const isConfirmation = MessageHelper.isConfirmationResponse(message);
        if (isConfirmation !== null) {
          return MessageHelper.handleConfirmation(isConfirmation, context, conversationId);
        }
        return ResponseBuilder.confirmationPrompt(context);
      }
      // Handle ready_for_execution stage
      if (effectiveStage === 'ready_for_execution') {
        return ResponseBuilder.readyForExecution(context);
      }
      // Route to appropriate stage handler
      let result;
      switch (effectiveStage) {
        case 'init':
          result = await StageRouter.handleInitStage(message, context, conversationHistory);
          if (result.autoAdvance) {
            context = result.context;
            effectiveStage = context.stage;
            // Re-route to the new stage
            return await this.processChat({
              message,
              conversationId,
              conversationHistory,
              searchResults,
              userId,
              organizationId,
              assistantContext: context
            });
          }
          return result;
        case 'outreach_type':
          if (!context.outreachType) {
            return await StageRouter.handleOutreachTypeStage(message, context, conversationHistory);
          }
          // Auto-advance if outreachType is set
          context.stage = context.outreachType === 'inbound' ? 'inbound_flow' : 'outbound_target_knowledge';
          effectiveStage = context.stage;
          // Fall through to next stage
          return await this.processChat({
            message,
            conversationId,
            conversationHistory,
            searchResults,
            userId,
            organizationId,
            assistantContext: context
          });
        case 'inbound_flow':
          if (context.outreachType === 'inbound') {
            return await StageRouter.handleInboundFlowStage(message, context, conversationHistory);
          }
          break;
        case 'outbound_target_knowledge':
          if (context.outreachType === 'outbound' && !context.targetKnowledge) {
            return await StageRouter.handleOutboundTargetKnowledgeStage(message, context, conversationHistory);
          }
          // Auto-advance if targetKnowledge is set
          if (context.targetKnowledge) {
            context.stage = context.targetKnowledge === 'known' ? 'outbound_known_target' : 'outbound_icp_discovery';
            return await this.processChat({
              message,
              conversationId,
              conversationHistory,
              searchResults,
              userId,
              organizationId,
              assistantContext: context
            });
          }
          break;
        case 'outbound_known_target':
          if (context.outreachType === 'outbound' && context.targetKnowledge === 'known') {
            return await StageRouter.handleOutboundKnownTargetStage(message, context, conversationHistory);
          }
          break;
        case 'outbound_icp_discovery':
          if (context.outreachType === 'outbound' && context.targetKnowledge === 'discovery') {
            return await StageRouter.handleOutboundICPDiscoveryStage(message, context, conversationHistory);
          }
          break;
      }
      // Fallback: auto-correct stage based on context
      if (!StageRouter.isValidStage(effectiveStage, context)) {
        const fallbackStage = StageRouter.getFallbackStage(context);
        context.stage = fallbackStage;
        return await this.processChat({
          message,
          conversationId,
          conversationHistory,
          searchResults,
          userId,
          organizationId,
          assistantContext: context
        });
      }
      // Final fallback - generic response
      return ResponseBuilder.collectingInfo(
        "I'm ready to help. What would you like to do next?",
        context
      );
    } catch (error) {
      throw error;
    }
  }
  // Expose modules and helpers for backward compatibility
  static get ContextManager() { return ContextManager; }
  static get IntentExtractor() { return IntentExtractor; }
  static get StageHandlers() { return StageHandlers; }
  static get MessageHelper() { return MessageHelper; }
  static get StageRouter() { return StageRouter; }
  // Delegate methods for backward compatibility
  static initializeContext() { return ContextManager.initializeContext(); }
  static updateContext(context, intentData, message) { return ContextManager.updateContext(context, intentData, message); }
  static isContextReady(context) { return ContextManager.isContextReady(context); }
  static generateConfirmationMessage(context) { return StageHandlers.generateConfirmationMessage(context); }
  static extractOutreachIntent(message, conversationHistory, currentContext) { return IntentExtractor.extractOutreachIntent(message, conversationHistory, currentContext); }
  static extractOutreachType(message) { return IntentExtractor.extractOutreachType(message); }
  static extractTargetKnowledge(message) { return IntentExtractor.extractTargetKnowledge(message); }
  static handleInboundFlow(message, context, conversationHistory) { return StageHandlers.handleInboundFlow(message, context, conversationHistory); }
  static handleOutboundKnownTarget(message, context, conversationHistory) { return StageHandlers.handleOutboundKnownTarget(message, context, conversationHistory); }
  static handleOutboundICPDiscovery(message, context, conversationHistory) { return StageHandlers.handleOutboundICPDiscovery(message, context, conversationHistory); }
  static isGreetingMessage(message) { return MessageHelper.isGreetingMessage(message); }
  static isConfirmationResponse(message) { return MessageHelper.isConfirmationResponse(message); }
  static handleConfirmation(isConfirmed, context, conversationId) { return MessageHelper.handleConfirmation(isConfirmed, context, conversationId); }
}
module.exports = AIAssistantService;
