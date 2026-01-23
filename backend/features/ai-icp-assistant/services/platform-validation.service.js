/**
 * Platform Validation Service
 * 
 * Validates user answers against platform-specific constraints:
 * - Validates action answers match allowed actions for that platform
 * - Validates template requirements (some platforms need templates for certain actions)
 * - Provides helpful clarification messages when validation fails
 * - Handles Apollo, Zapier, and other integration platforms
 */
const onboardingConfig = require('../features/ai-icp-assistant/config/onboarding.config');
class PlatformValidationService {
  /**
   * Validate platform action answer
   * 
   * @param {string} platformKey - Platform identifier (linkedin, whatsapp, email, voice)
   * @param {string} userAnswer - User's provided action answer
   * @param {string} intentKey - The intent key being answered (e.g., 'linkedin_actions')
   * @returns {object} - { isValid: boolean, message?: string, needsTemplate?: boolean }
   */
  static validateActionAnswer(platformKey, userAnswer, intentKey) {
    // Get allowed actions for this platform
    const allowedActions = onboardingConfig.platforms.actions[platformKey];
    if (!allowedActions) {
      return {
        isValid: false,
        message: `Unknown platform: ${platformKey}`
      };
    }
    // Normalize the user answer for comparison
    const normalizedAnswer = userAnswer.toLowerCase().trim();
    // Check if the answer contains ANY of the allowed actions
    const matchedActions = allowedActions.filter(action => {
      const actionKeywords = action.toLowerCase().split(/[,\s]+/).filter(w => w.length > 2);
      return actionKeywords.some(keyword => normalizedAnswer.includes(keyword));
    });
    // If no matching actions found, return validation error
    if (matchedActions.length === 0) {
      // Check if user mistakenly provided platform names instead of actions
      const platformNames = Object.keys(onboardingConfig.platforms.actions);
      const mentionedPlatforms = platformNames.filter(p => normalizedAnswer.includes(p));
      let errorMessage = `Invalid action for ${this._getPlatformDisplayName(platformKey)}.\n\n`;
      if (mentionedPlatforms.length > 0) {
        errorMessage += `❌ You mentioned platform names (${mentionedPlatforms.join(', ')}), but we need the ACTIONS you want to take on ${this._getPlatformDisplayName(platformKey)}.\n\n`;
      }
      errorMessage += `✅ Valid actions for ${this._getPlatformDisplayName(platformKey)}:\n`;
      allowedActions.forEach(action => {
        errorMessage += `   • ${action}\n`;
      });
      errorMessage += `\nPlease select one or more of these actions.`;
      return {
        isValid: false,
        message: errorMessage,
        matchedActions: []
      };
    }
    // Check if this answer requires a template
    const templateCheckFn = onboardingConfig.platforms.templateRequired[platformKey];
    const needsTemplate = templateCheckFn ? templateCheckFn(userAnswer) : false;
    return {
      isValid: true,
      message: null,
      matchedActions,
      needsTemplate
    };
  }
  /**
   * Validate platform action order (LinkedIn must visit before message, must connect before message)
   * 
   * @param {string} platformKey - Platform identifier
   * @param {string} userAnswer - User's provided answer
   * @returns {object} - { isValid: boolean, message?: string }
   */
  static validateActionOrder(platformKey, userAnswer) {
    const answerLower = userAnswer.toLowerCase();
    // LinkedIn: must visit profile AND send connection request BEFORE sending message
    if (platformKey === 'linkedin') {
      const hasMessage = answerLower.includes('message') || answerLower.includes('send message');
      const hasVisit = answerLower.includes('visit') || answerLower.includes('profile');
      const hasConnect = answerLower.includes('connection request') || answerLower.includes('send connection');
      // If selecting message, MUST have both visit and connection request
      if (hasMessage && (!hasVisit || !hasConnect)) {
        let missing = [];
        if (!hasVisit) missing.push('"Visit profile"');
        if (!hasConnect) missing.push('"Send connection request"');
        return {
          isValid: false,
          message: `❌ Action order error: To "Send message" on LinkedIn, you must first:\n   • ${missing.join('\n   • ')}\n\n✅ Please select those actions before "Send message".`
        };
      }
    }
    // Email: must send email before follow-up
    if (platformKey === 'email') {
      const hasFollowUp = answerLower.includes('follow-up') || answerLower.includes('follow up');
      const hasSendEmail = answerLower.includes('send email') || answerLower.includes('email');
      if (hasFollowUp && !hasSendEmail) {
        return {
          isValid: false,
          message: `❌ Action order error: You must "Send email" before "Email follow-up sequence".\n\n✅ Please select "Send email" first, then you can add "Email follow-up sequence".`
        };
      }
    }
    return { isValid: true };
  }
  /**
   * Get clarification message for invalid answer
   * 
   * @param {string} platformKey - Platform identifier
   * @param {string} userAnswer - User's invalid answer
   * @returns {string} - Clarification message
   */
  static getClarificationMessage(platformKey, userAnswer) {
    const allowedActions = onboardingConfig.platforms.actions[platformKey] || [];
    const displayName = this._getPlatformDisplayName(platformKey);
    let message = `I didn't understand the actions for ${displayName}.\n\n`;
    message += `You said: "${userAnswer}"\n\n`;
    message += `Available actions for ${displayName}:\n`;
    allowedActions.forEach((action, index) => {
      message += `${index + 1}. ${action}\n`;
    });
    message += `\nPlease select one or more actions from the list above.`;
    return message;
  }
  /**
   * Validate collected platform answers
   * 
   * @param {object} collectedAnswers - All collected answers
   * @param {array} selectedPlatforms - Array of selected platform keys
   * @returns {object} - Validation result with any errors
   */
  static validateCollectedAnswers(collectedAnswers, selectedPlatforms) {
    const errors = [];
    const warnings = [];
    selectedPlatforms.forEach(platformKey => {
      const actionKey = `${platformKey}_actions`;
      const templateKey = `${platformKey}_template`;
      const actionAnswer = collectedAnswers[actionKey];
      if (actionAnswer) {
        // Validate the action answer
        const validation = this.validateActionAnswer(platformKey, actionAnswer, actionKey);
        if (!validation.isValid) {
          errors.push({
            platform: platformKey,
            type: 'invalid_action',
            message: validation.message
          });
        }
        // Check template requirement
        if (validation.needsTemplate && !collectedAnswers[templateKey]) {
          warnings.push({
            platform: platformKey,
            type: 'missing_template',
            message: `Template needed for ${this._getPlatformDisplayName(platformKey)}`
          });
        }
      }
    });
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  /**
   * Get display name for platform
   * 
   * @private
   * @param {string} platformKey - Platform identifier
   * @returns {string} - Display name
   */
  static _getPlatformDisplayName(platformKey) {
    const platformConfig = onboardingConfig.platforms.supported.find(
      p => p.key === platformKey || p.normalized === platformKey
    );
    return platformConfig ? platformConfig.displayName : platformKey;
  }
  /**
   * Validate integration platforms (Apollo, Zapier, etc.)
   * 
   * These are special platforms with specific action sets
   * 
   * @param {string} platformKey - Integration platform identifier
   * @param {string} userAnswer - User's provided action answer
   * @returns {object} - Validation result
   */
  static validateIntegrationPlatform(platformKey, userAnswer) {
    // Define integration platform actions
    const integrationPlatforms = {
      apollo: {
        displayName: 'Apollo',
        actions: [
          'Add to list',
          'Send email sequences',
          'Track opens/clicks',
          'Log in CRM',
          'Update lead status',
        ]
      },
      zapier: {
        displayName: 'Zapier',
        actions: [
          'Connect to other tools',
          'Create leads',
          'Send to spreadsheet',
          'Trigger automation',
          'Update records',
        ]
      },
      apollo_enrichment: {
        displayName: 'Apollo Enrichment',
        actions: [
          'Fetch company info',
          'Get contact details',
          'Enrich with metadata',
          'Validate emails',
        ]
      },
    };
    const integration = integrationPlatforms[platformKey];
    if (!integration) {
      return {
        isValid: false,
        message: `Unknown integration platform: ${platformKey}`
      };
    }
    // Check if answer contains any allowed actions
    const normalizedAnswer = userAnswer.toLowerCase();
    const matchedActions = integration.actions.filter(action =>
      normalizedAnswer.includes(action.toLowerCase())
    );
    if (matchedActions.length === 0) {
      let message = `Invalid action for ${integration.displayName}.\n\n`;
      message += `✅ Valid actions for ${integration.displayName}:\n`;
      integration.actions.forEach(action => {
        message += `   • ${action}\n`;
      });
      message += `\nPlease select one or more of these actions.`;
      return {
        isValid: false,
        message
      };
    }
    return {
      isValid: true,
      matchedActions,
      platformDisplayName: integration.displayName
    };
  }
}
module.exports = PlatformValidationService;