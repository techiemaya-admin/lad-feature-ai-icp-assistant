/**
 * AI ICP Assistant Service (Refactored - Modular)
 * Main orchestrator for conversational ICP definition
 */

const ContextManager = require('./ContextManager');
const IntentExtractor = require('./IntentExtractor');
const StageHandlers = require('./StageHandlers');
const GeminiResponseGenerator = require('./GeminiResponseGenerator');

class AIAssistantService {
  /**
   * Process chat message with AI - Phase 1: Intent Understanding with Stage Machine
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
      const currentStage = context.stage || 'init';
      
      console.log(`📊 Current stage: ${currentStage}`);
      console.log(`📊 Context:`, JSON.stringify({ 
        stage: context.stage, 
        outreachType: context.outreachType, 
        targetKnowledge: context.targetKnowledge,
        conversationHistoryLength: conversationHistory.length 
      }, null, 2));

      // Check conversation history to see if questions were already answered
      // This helps prevent asking the same question again
      if (conversationHistory && conversationHistory.length > 0) {
        const historyText = conversationHistory.map(m => m.content).join(' ').toLowerCase();
        
        // If outreachType is not set but we can infer it from history, set it
        if (!context.outreachType) {
          if (historyText.match(/\b(inbound|incoming|leads come|respond to|follow.?up)\b/)) {
            context.outreachType = 'inbound';
            console.log(`✅ Inferred outreachType=inbound from conversation history`);
          } else if (historyText.match(/\b(outbound|reach out|proactively|contact|find new|discover)\b/)) {
            context.outreachType = 'outbound';
            console.log(`✅ Inferred outreachType=outbound from conversation history`);
          }
        }
        
        // If targetKnowledge is not set but we can infer it from history, set it
        if (context.outreachType === 'outbound' && !context.targetKnowledge) {
          if (historyText.match(/\b(already have|have profiles?|have linkedin|have names?|specific people|these companies|know my|know the)\b/)) {
            context.targetKnowledge = 'known';
            console.log(`✅ Inferred targetKnowledge=known from conversation history`);
          } else if (historyText.match(/\b(dont know|don't know|not sure|discover|find new|need to find|looking for|ideal prospects)\b/)) {
            context.targetKnowledge = 'discovery';
            console.log(`✅ Inferred targetKnowledge=discovery from conversation history`);
          }
        }
        // If we have conversation history but stage is still init, move to outreach_type
        // This handles cases where context was reset or not properly saved
        context.stage = 'outreach_type';
        // Recalculate effectiveStage after update
        effectiveStage = context.stage;
        console.log(`🔄 Moved from init to outreach_type, effectiveStage=${effectiveStage}`);
        // Continue to outreach_type handler below - it will process the message
      }

      // Get initial stage
      let effectiveStage = context.stage || 'init';

      // STAGE: init → Handle greetings and initial setup
      if (effectiveStage === 'init' || !context.stage) {
        const isGreeting = this.isGreetingMessage(message);
        if (isGreeting || conversationHistory.length === 0) {
          context.stage = 'outreach_type';
          context.status = 'collecting_info';
          const response = await GeminiResponseGenerator.generateResponse({
            stage: 'outreach_type',
            context,
            message: '',
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
        // If we have conversation history but stage is still init, move to outreach_type
        // This handles cases where context was reset or not properly saved
        context.stage = 'outreach_type';
        // Recalculate effectiveStage after update
        effectiveStage = context.stage;
        console.log(`🔄 Moved from init to outreach_type, effectiveStage=${effectiveStage}`);
        // Continue to outreach_type handler below - it will process the message
      }

      // STAGE: confirmation → Handle YES/NO responses
      if (effectiveStage === 'confirmation') {
        const isConfirmation = this.isConfirmationResponse(message);
        if (isConfirmation !== null) {
          return this.handleConfirmation(isConfirmation, context, conversationId);
        }
        return {
          success: true,
          response: "Does this look correct? Just say yes or no.",
          text: "Does this look correct? Just say yes or no.",
          assistantContext: context,
          status: 'awaiting_confirmation',
          readyForExecution: false,
          model: 'gemini-2.0-flash',
          tokensUsed: null
        };
      }

      // STAGE: ready_for_execution → Already confirmed
      if (effectiveStage === 'ready_for_execution') {
        return {
          success: true,
          response: "Great. I'm ready to move forward.",
          text: "Great. I'm ready to move forward.",
          assistantContext: context,
          status: 'ready_for_execution',
          readyForExecution: true,
          model: 'gemini-2.0-flash',
          tokensUsed: null
        };
      }

      // CRITICAL: If outreachType is already set, skip outreach_type stage IMMEDIATELY
      // This prevents asking the same question again when context is loaded
      if (context.outreachType && (context.stage === 'outreach_type' || effectiveStage === 'outreach_type')) {
        // Auto-advance to next stage immediately
        context.stage = context.outreachType === 'inbound' ? 'inbound_flow' : 'outbound_target_knowledge';
        effectiveStage = context.stage;
        console.log(`✅ Auto-advanced from outreach_type: outreachType=${context.outreachType}, new stage=${context.stage}`);
      }

      // STAGE: outreach_type → Determine inbound vs outbound
      // CRITICAL: Only ask if stage is outreach_type AND outreachType is undefined
      // Use context.stage directly to catch updates from init handler
      // Recalculate after potential init handler update
      const outreachStageCheck = context.stage || effectiveStage;
      console.log(`🔍 Outreach stage check: context.stage=${context.stage}, effectiveStage=${effectiveStage}, outreachStageCheck=${outreachStageCheck}, outreachType=${context.outreachType}, message="${message}"`);
      if (outreachStageCheck === 'outreach_type' && !context.outreachType) {
        if (!message || message.trim() === '') {
          const response = await GeminiResponseGenerator.generateResponse({
            stage: 'outreach_type',
            context,
            message: '',
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
        
        // Use Gemini to extract intent (more accurate than rule-based)
        const intentData = await IntentExtractor.extractOutreachIntent(message, conversationHistory, context);
        const outreachType = intentData.outreachType || IntentExtractor.extractOutreachType(message);
        console.log(`🔍 Extracted outreachType from "${message}":`, outreachType);
        
        if (outreachType) {
          context.outreachType = outreachType;
          context.stage = outreachType === 'inbound' ? 'inbound_flow' : 'outbound_target_knowledge';
          console.log(`✅ Updated context: outreachType=${outreachType}, stage=${context.stage}`);
          
          // Use Gemini to generate the next question
          const response = await GeminiResponseGenerator.generateResponse({
            stage: context.stage,
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
          // User's response wasn't clear - use Gemini to ask for clarification
          const response = await GeminiResponseGenerator.generateResponse({
            stage: 'outreach_type',
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

      // Recalculate effectiveStage after potential auto-advances
      const finalEffectiveStage = context.stage || 'init';

      // STAGE: inbound_flow → Handle inbound questions
      // CRITICAL: Only process if outreachType is inbound AND stage is inbound_flow
      if (context.outreachType === 'inbound' && finalEffectiveStage === 'inbound_flow') {
        // If inboundSource already exists, skip to confirmation
        if (context.inboundSource && context.inboundDataReady !== null) {
          context.stage = 'confirmation';
          const confirmationMsg = StageHandlers.generateConfirmationMessage(context);
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
        
        if (!message || message.trim() === '') {
          // Only ask if inboundSource is missing
          if (!context.inboundSource) {
            const response = await GeminiResponseGenerator.generateResponse({
              stage: 'inbound_flow',
              context,
              message: '',
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
        }
        return await StageHandlers.handleInboundFlow(message, context, conversationHistory);
      }

      // CRITICAL: If targetKnowledge is already set, skip outbound_target_knowledge stage IMMEDIATELY
      // This prevents asking the same question again when context is loaded
      if (context.outreachType === 'outbound' && context.targetKnowledge && (finalEffectiveStage === 'outbound_target_knowledge' || context.stage === 'outbound_target_knowledge')) {
        // Auto-advance to next stage immediately
        context.stage = context.targetKnowledge === 'known' ? 'outbound_known_target' : 'outbound_icp_discovery';
        finalEffectiveStage = context.stage;
        console.log(`✅ Auto-advanced from outbound_target_knowledge: targetKnowledge=${context.targetKnowledge}, new stage=${context.stage}`);
      }

      // STAGE: outbound_target_knowledge → Ask if they know targets
      // CRITICAL: Only process if outreachType is outbound AND stage is outbound_target_knowledge
      if (context.outreachType === 'outbound' && finalEffectiveStage === 'outbound_target_knowledge' && !context.targetKnowledge) {
        if (!message || message.trim() === '') {
          const response = await GeminiResponseGenerator.generateResponse({
            stage: 'outbound_target_knowledge',
            context,
            message: '',
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
        
        // Use Gemini to extract intent (more accurate)
        const intentData = await IntentExtractor.extractOutreachIntent(message, conversationHistory, context);
        const targetKnowledge = intentData.targetKnowledge || IntentExtractor.extractTargetKnowledge(message);
        console.log(`🔍 Extracted targetKnowledge from "${message}":`, targetKnowledge);
        
        if (targetKnowledge) {
          context.targetKnowledge = targetKnowledge;
          context.stage = targetKnowledge === 'known' ? 'outbound_known_target' : 'outbound_icp_discovery';
          console.log(`✅ Updated context: targetKnowledge=${targetKnowledge}, stage=${context.stage}`);
          
          // Use Gemini to generate the next question
          const response = await GeminiResponseGenerator.generateResponse({
            stage: context.stage,
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
          // User's response wasn't clear - use Gemini to ask for clarification
          const response = await GeminiResponseGenerator.generateResponse({
            stage: 'outbound_target_knowledge',
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

      // Recalculate again after potential auto-advance
      const finalEffectiveStage2 = context.stage || 'init';

      // STAGE: outbound_known_target → Handle known targets
      // CRITICAL: Only process if targetKnowledge is known AND stage is outbound_known_target
      if (context.outreachType === 'outbound' && context.targetKnowledge === 'known' && finalEffectiveStage2 === 'outbound_known_target') {
        if (!message || message.trim() === '') {
          const response = await GeminiResponseGenerator.generateResponse({
            stage: 'outbound_known_target',
            context,
            message: '',
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
        return await StageHandlers.handleOutboundKnownTarget(message, context, conversationHistory);
      }

      // STAGE: outbound_icp_discovery → Guided ICP questions
      // CRITICAL: Only process if targetKnowledge is discovery AND stage is outbound_icp_discovery
      if (context.outreachType === 'outbound' && context.targetKnowledge === 'discovery' && finalEffectiveStage2 === 'outbound_icp_discovery') {
        if (!message || message.trim() === '') {
          const response = await GeminiResponseGenerator.generateResponse({
            stage: 'outbound_icp_discovery',
            context,
            message: '',
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
        return await StageHandlers.handleOutboundICPDiscovery(message, context, conversationHistory);
      }

      // Fallback: If we have outreachType but stage doesn't match, auto-advance
      const currentEffectiveStage = context.stage || 'init';
      if (context.outreachType === 'inbound' && currentEffectiveStage !== 'inbound_flow' && currentEffectiveStage !== 'confirmation' && currentEffectiveStage !== 'ready_for_execution') {
        context.stage = 'inbound_flow';
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

      if (context.outreachType === 'outbound' && !context.targetKnowledge && currentEffectiveStage !== 'outbound_target_knowledge') {
        context.stage = 'outbound_target_knowledge';
        const response = await GeminiResponseGenerator.generateResponse({
          stage: 'outbound_target_knowledge',
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

      // Final fallback - only if truly no context AND we're not in a valid stage
      const finalStageCheck = context.stage || 'init';
      console.log(`⚠️ Reached fallback: outreachType=${context.outreachType}, stage=${finalStageCheck}, targetKnowledge=${context.targetKnowledge}`);
      
      // If we have outreachType but stage is wrong, auto-advance
      if (context.outreachType === 'outbound' && !context.targetKnowledge && finalStageCheck !== 'outbound_target_knowledge' && finalStageCheck !== 'outbound_known_target' && finalStageCheck !== 'outbound_icp_discovery' && finalStageCheck !== 'confirmation' && finalStageCheck !== 'ready_for_execution') {
        context.stage = 'outbound_target_knowledge';
        const response = await GeminiResponseGenerator.generateResponse({
          stage: 'outbound_target_knowledge',
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

      if (context.outreachType === 'inbound' && finalStageCheck !== 'inbound_flow' && finalStageCheck !== 'confirmation' && finalStageCheck !== 'ready_for_execution') {
        context.stage = 'inbound_flow';
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

      // If we have outreachType but no targetKnowledge and we're in outbound, ask about target knowledge
      // BUT only if we're not already in a valid outbound stage
      if (context.outreachType === 'outbound' && !context.targetKnowledge && 
          finalStageCheck !== 'outbound_target_knowledge' && 
          finalStageCheck !== 'outbound_known_target' && 
          finalStageCheck !== 'outbound_icp_discovery' &&
          finalStageCheck !== 'confirmation' &&
          finalStageCheck !== 'ready_for_execution') {
        context.stage = 'outbound_target_knowledge';
        console.log(`🔄 Auto-advancing to outbound_target_knowledge stage`);
        const response = await GeminiResponseGenerator.generateResponse({
          stage: 'outbound_target_knowledge',
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

      // Final fallback - use Gemini to generate a helpful response
      const response = await GeminiResponseGenerator.generateResponse({
        stage: finalStageCheck,
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
      console.log(`❌ Unhandled state: outreachType=${context.outreachType}, stage=${finalStageCheck}, targetKnowledge=${context.targetKnowledge}`);
      return {
        success: true,
        response: "I'm ready to help. What would you like to do next?",
        text: "I'm ready to help. What would you like to do next?",
        assistantContext: context,
        status: 'collecting_info',
        readyForExecution: false,
        model: 'gemini-2.0-flash',
        tokensUsed: null
      };

    } catch (error) {
      console.error('Process chat error:', error);
      throw error;
    }
  }

  /**
   * Check if message is a greeting
   */
  static isGreetingMessage(message) {
    const lower = message.toLowerCase().trim();
    return lower.match(/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|start|begin)\b/);
  }

  /**
   * Check if message is a confirmation response
   */
  static isConfirmationResponse(message) {
    const lower = message.toLowerCase().trim();
    if (lower.match(/^(yes|yep|yeah|yup|correct|right|that's right|sounds good|looks good|perfect|exactly|confirm|confirmed)\b/)) {
      return true;
    }
    if (lower.match(/^(no|nope|nah|incorrect|wrong|not quite|that's not right|change|modify|edit)\b/)) {
      return false;
    }
    return null;
  }

  /**
   * Handle confirmation response
   */
  static handleConfirmation(isConfirmed, context, conversationId) {
    if (isConfirmed) {
      context.stage = 'ready_for_execution';
      context.status = 'ready_for_execution';
      context.confirmed = true;
      return {
        success: true,
        response: "Great. I'm ready to move forward.",
        text: "Great. I'm ready to move forward.",
        assistantContext: context,
        status: 'ready_for_execution',
        readyForExecution: true,
        model: 'gemini-2.0-flash',
        tokensUsed: null
      };
    } else {
      if (context.outreachType === 'inbound') {
        context.stage = 'inbound_flow';
      } else if (context.outreachType === 'outbound') {
        if (context.targetKnowledge === 'known') {
          context.stage = 'outbound_known_target';
        } else if (context.targetKnowledge === 'discovery') {
          context.stage = 'outbound_icp_discovery';
        } else {
          context.stage = 'outbound_target_knowledge';
        }
      } else {
        context.stage = 'outreach_type';
      }
      context.status = 'collecting_info';
      return {
        success: true,
        response: "What would you like to change?",
        text: "What would you like to change?",
        assistantContext: context,
        status: 'collecting_info',
        readyForExecution: false,
        model: 'gemini-2.0-flash',
        tokensUsed: null
      };
    }
  }

  // Expose modules for backward compatibility
  static get ContextManager() { return ContextManager; }
  static get IntentExtractor() { return IntentExtractor; }
  static get StageHandlers() { return StageHandlers; }
  
  // Expose methods for backward compatibility
  static initializeContext() { return ContextManager.initializeContext(); }
  static updateContext(context, intentData, message) { return ContextManager.updateContext(context, intentData, message); }
  static isContextReady(context) { return ContextManager.isContextReady(context); }
  static generateConfirmationMessage(context) { return StageHandlers.generateConfirmationMessage(context); }
  static extractOutreachIntent(message, conversationHistory, currentContext) { 
    return IntentExtractor.extractOutreachIntent(message, conversationHistory, currentContext); 
  }
  static extractOutreachType(message) { return IntentExtractor.extractOutreachType(message); }
  static extractTargetKnowledge(message) { return IntentExtractor.extractTargetKnowledge(message); }
  static handleInboundFlow(message, context, conversationHistory) { 
    return StageHandlers.handleInboundFlow(message, context, conversationHistory); 
  }
  static handleOutboundKnownTarget(message, context, conversationHistory) { 
    return StageHandlers.handleOutboundKnownTarget(message, context, conversationHistory); 
  }
  static handleOutboundICPDiscovery(message, context, conversationHistory) { 
    return StageHandlers.handleOutboundICPDiscovery(message, context, conversationHistory); 
  }
}

module.exports = AIAssistantService;
