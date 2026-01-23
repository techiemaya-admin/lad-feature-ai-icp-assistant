/**
 * Template Handler Service
 * 
 * Handles template collection and validation logic.
 * Extracted from ICPOnboardingController to follow single responsibility.
 */
const platformHandlerService = require('./platform-handler.service');
const onboardingConfig = require('../config/onboarding.config');
const stepsConfig = require('../config/steps.config');
class TemplateHandlerService {
  /**
   * Check if a platform needs a template based on actions
   */
  needsTemplate(platformKey, actions) {
    return platformHandlerService.requiresTemplate(platformKey, actions);
  }
  /**
   * Generate template question for a platform
   */
  generateTemplateQuestion(platformKey, actions = '') {
    const displayName = platformHandlerService.getPlatformDisplayName(platformKey);
    const platformLower = platformKey.toLowerCase();
    const actionsLower = String(actions).toLowerCase();
    // User-friendly explanation based on platform and actions
    if (platformLower === 'voice') {
      let explanation = `You selected auto call actions on Voice Calls.\n\n`;
      if (actionsLower.includes('script')) {
        explanation += `Please provide the call script the AI agent will speak during the call.`;
      } else {
        explanation += `Please provide the call script the AI agent will use for voice calls.`;
      }
      explanation += `\n\nPlease provide your call script below (required):`;
      return explanation;
    }
    if (platformLower === 'linkedin') {
      let explanation = `You selected "Send message (after accepted)" on LinkedIn.\n\n`;
      explanation += `Please write the message that will be sent after the connection is accepted.`;
      explanation += `\n\nPlease provide your message template below (required):`;
      return explanation;
    }
    if (platformLower === 'whatsapp') {
      let explanation = `You selected WhatsApp message actions.\n\n`;
      if (actionsLower.includes('broadcast')) {
        explanation += `Please provide the broadcast message template that will be sent to multiple contacts.`;
      } else if (actionsLower.includes('follow-up')) {
        explanation += `Please provide the follow-up message template.`;
      } else {
        explanation += `Please provide the WhatsApp message template.`;
      }
      explanation += `\n\nPlease provide your message template below (required):`;
      return explanation;
    }
    if (platformLower === 'email') {
      let explanation = `You selected email actions.\n\n`;
      if (actionsLower.includes('follow-up')) {
        explanation += `Please provide the follow-up email body template.`;
      } else {
        explanation += `Please provide the email subject and body template.`;
      }
      explanation += `\n\nPlease provide your email template below (required):`;
      return explanation;
    }
    return `Great! You've selected ${displayName} message actions.\n\nPlease provide the message template you'd like to use:\n\nPlease provide your message template below (required):`;
  }
  /**
   * Create template question object
   */
  createTemplateQuestion(platformKey, actions = '') {
    const displayName = platformHandlerService.getPlatformDisplayName(platformKey);
    const normalizedKey = platformKey.toLowerCase();
    return {
      question: this.generateTemplateQuestion(platformKey, actions),
      helperText: null,
      stepIndex: stepsConfig.PLATFORM_ACTIONS,
      intentKey: `${normalizedKey}_template`,
      title: `${displayName} Template`,
      questionType: 'text',
      askingForTemplate: true,
      currentPlatform: normalizedKey,
    };
  }
  /**
   * Process template answer
   */
  processTemplateAnswer(userAnswer) {
    // Templates are required - no skip option
    const trimmed = String(userAnswer || '').trim();
    if (!trimmed || trimmed.length === 0) {
      throw new Error('Template is required. Please provide a message template.');
    }
    return trimmed;
  }
}
module.exports = new TemplateHandlerService();