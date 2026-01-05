/**
 * Message Helper
 * Utility functions for message parsing and validation
 */
class MessageHelper {
  /**
   * Check if message is a greeting
   */
  static isGreetingMessage(message) {
    const lower = String(message || '').toLowerCase().trim();
    return /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)\b/.test(lower);
  }
  /**
   * Check if message is a confirmation response (yes/no)
   * Returns: true (yes), false (no), null (unclear)
   */
  static isConfirmationResponse(message) {
    const lower = String(message || '').toLowerCase().trim();
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
}
module.exports = MessageHelper;
