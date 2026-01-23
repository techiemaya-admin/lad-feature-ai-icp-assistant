/**
 * ICP Controller Helpers
 * Helper utilities for ICP Onboarding Controller
 */
const logger = require('../utils/logger');
class ICPControllerHelpers {
  /**
   * Validate request parameters
   */
  static validateProcessAnswerRequest(body) {
    const { userAnswer, currentStepIndex } = body;
    if (!userAnswer || typeof userAnswer !== 'string' || userAnswer.trim().length === 0) {
      return { isValid: false, error: 'userAnswer is required and must be a non-empty string' };
    }
    if (typeof currentStepIndex !== 'number' || currentStepIndex < 1 || currentStepIndex > 11) {
      return { isValid: false, error: 'currentStepIndex must be a number between 1 and 11' };
    }
    return { isValid: true };
  }
  /**
   * Parse conversation context safely
   */
  static parseContext(contextData, defaultContext = {}) {
    try {
      if (!contextData) return defaultContext;
      if (typeof contextData === 'object') return contextData;
      return JSON.parse(contextData);
    } catch (e) {
      logger.warn('Failed to parse context', { error: e.message });
      return defaultContext;
    }
  }
  /**
   * Determine campaign days vs working days context for Step 10
   */
  static determineStep10Context(userAnswer, collectedAnswers) {
    const answerLower = userAnswer.toLowerCase().trim();
    // Patterns that suggest campaign_days (duration)
    const campaignDaysPatterns = [
      /\b\d+\s*(days?|weeks?|months?)\b/,
      /\b(7|14|30|60)\b/,
      /\b(one|two|three|four)\s+(days?|weeks?|months?)\b/,
      /duration|period|length|run.*for/
    ];
    // Patterns that suggest working_days (schedule)
    const workingDaysPatterns = [
      /monday|tuesday|wednesday|thursday|friday|saturday|sunday/,
      /weekday|weekend|all.?day|week.?end/,
      /mon-fri|monday-friday/,
      /business.?day|work.?day/,
      /schedule|when.*run/
    ];
    const looksLikeCampaignDays = campaignDaysPatterns.some(pattern => pattern.test(answerLower));
    const looksLikeWorkingDays = workingDaysPatterns.some(pattern => pattern.test(answerLower));
    // Check what's already answered
    const hasCampaignDays = !!(collectedAnswers.campaign_days || 
                             collectedAnswers.campaign_settings?.campaign_days);
    const hasWorkingDays = !!(collectedAnswers.working_days || 
                            collectedAnswers.campaign_settings?.working_days);
    // Determine sub-step based on patterns and what's missing
    let subStepIndex = 0; // Default to campaign_days
    if (looksLikeCampaignDays && !hasCampaignDays) {
      subStepIndex = 0; // campaign_days
    } else if (looksLikeWorkingDays && !hasWorkingDays) {
      subStepIndex = 1; // working_days  
    } else {
      // Fallback logic - fill in missing items in order
      if (!hasCampaignDays) {
        subStepIndex = 0;
      } else if (!hasWorkingDays) {
        subStepIndex = 1;
      } else {
        subStepIndex = 1; // Both answered, default to working_days
      }
    }
    return { subStepIndex, looksLikeCampaignDays, looksLikeWorkingDays };
  }
  /**
   * Process Step 5 platform actions context
   */
  static processStep5Context(collectedAnswers) {
    const selectedPlatforms = collectedAnswers.selected_platforms || [];
    let completedPlatformActions = collectedAnswers.completed_platform_actions || [];
    // Platform mapping
    const platformMap = {
      'linkedin': ['linkedin', 'linked in'],
      'email': ['email', 'mail'],
      'whatsapp': ['whatsapp', 'whats app'],
      'voice': ['voice', 'voice calls', 'voice call', 'calls']
    };
    // Get completed platforms from stored answers
    const completedActions = Object.keys(platformMap).filter(platformKey => {
      const actionKey = `${platformKey}_actions`;
      return collectedAnswers[actionKey] && 
             collectedAnswers[actionKey] !== 'Skip' && 
             collectedAnswers[actionKey].trim().length > 0;
    });
    // Check for template requirements (LinkedIn message templates, Email templates, etc.)
    for (const platformKey of completedActions) {
      const actionsAnswer = collectedAnswers[`${platformKey}_actions`];
      const needsTemplate = platformKey === 'linkedin' && 
                           actionsAnswer && 
                           actionsAnswer.toLowerCase().includes('message');
      if (needsTemplate) {
        const templateKey = `${platformKey}_template`;
        const hasTemplate = collectedAnswers[templateKey] && 
                           collectedAnswers[templateKey].trim().length > 0;
        if (!hasTemplate) {
          // Platform needs template but doesn't have one
          logger.debug('Platform needs template but not provided yet', { platform: platformKey });
        }
      }
    }
    return { completedActions };
  }
}
module.exports = ICPControllerHelpers;