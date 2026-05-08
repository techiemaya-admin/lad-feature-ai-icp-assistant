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
      // Check if this is for connection request or message after accepted
      if (actionsLower.includes('connection') && actionsLower.includes('request')) {
        let explanation = `You selected "Send connection request" on LinkedIn.\n\n`;
        explanation += `Would you like to include a personalized connection message?\n\n`;
        explanation += `LinkedIn connection messages are limited to 300 characters. You can use {{first_name}}, {{company}}, {{title}} for personalization.\n\n`;
        explanation += `Example: "Hi {{first_name}}, I noticed you work at {{company}}. I'd love to connect and share insights about our industry."\n\n`;
        explanation += `Please provide your connection message below (or type "skip" to send without a message):`;
        return explanation;
      } else {
        let explanation = `You selected "Send message (after accepted)" on LinkedIn.\n\n`;
        explanation += `Please write the message that will be sent after the connection is accepted.`;
        explanation += `\n\nPlease provide your message template below (required):`;
        return explanation;
      }
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
   * @param {string} userAnswer - The user's template answer
   * @param {string} platformKey - The platform (e.g., 'linkedin')
   * @param {string} actions - The selected actions (to determine if skip is allowed)
   */
  processTemplateAnswer(userAnswer, platformKey = '', actions = '') {
    const trimmed = String(userAnswer || '').trim();
    
    // For LinkedIn connection requests, allow "skip" to send without message
    if (platformKey && platformKey.toLowerCase() === 'linkedin') {
      const actionsLower = String(actions).toLowerCase();
      const isConnectionRequest = actionsLower.includes('connection') && actionsLower.includes('request');
      
      if (isConnectionRequest && trimmed.toLowerCase() === 'skip') {
        return null; // Return null to indicate no message
      }
    }
    
    if (!trimmed || trimmed.length === 0) {
      throw new Error('Template is required. Please provide a message template.');
    }
    return trimmed;
  }
}
module.exports = new TemplateHandlerService();
