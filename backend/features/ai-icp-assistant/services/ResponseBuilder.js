/**
 * Response Builder
 * Creates standardized response objects for AI Assistant
 */
class ResponseBuilder {
  /**
   * Build success response
   */
  static success(response, context, status = 'collecting_info', readyForExecution = false) {
    return {
      success: true,
      response,
      text: response,
      assistantContext: context,
      status,
      readyForExecution,
      model: 'gemini-2.0-flash',
      tokensUsed: null
    };
  }
  /**
   * Build confirmation prompt response
   */
  static confirmationPrompt(context) {
    return this.success(
      "Does this look correct? Just say yes or no.",
      context,
      'awaiting_confirmation',
      false
    );
  }
  /**
   * Build ready for execution response
   */
  static readyForExecution(context) {
    return this.success(
      "Great. I'm ready to move forward.",
      context,
      'ready_for_execution',
      true
    );
  }
  /**
   * Build collecting info response
   */
  static collectingInfo(response, context) {
    return this.success(response, context, 'collecting_info', false);
  }
  /**
   * Build awaiting confirmation response
   */
  static awaitingConfirmation(response, context) {
    return this.success(response, context, 'awaiting_confirmation', false);
  }
}
module.exports = ResponseBuilder;
