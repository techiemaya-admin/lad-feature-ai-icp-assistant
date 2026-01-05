/**
 * Platform Progression Service
 * 
 * Handles platform action progression logic - determining which platform
 * needs actions next, tracking completion, etc.
 * Extracted from ICPOnboardingController to follow single responsibility.
 */

const platformHandlerService = require('./platform-handler.service');
const templateHandlerService = require('./template-handler.service');

class PlatformProgressionService {
  /**
   * Infer completed platforms from collected answers
   */
  inferCompletedPlatforms(collectedAnswers) {
    const completedActions = collectedAnswers.completed_platform_actions || [];
    const platformActionKeys = ['linkedin_actions', 'whatsapp_actions', 'email_actions', 'voice_actions'];
    
    platformActionKeys.forEach(actionKey => {
      const platformKey = actionKey.replace('_actions', '');
      
      if (collectedAnswers[actionKey]) {
        const actionAnswer = String(collectedAnswers[actionKey]).toLowerCase();
        const needsTemplate = templateHandlerService.needsTemplate(platformKey, actionAnswer);
        const templateKey = `${platformKey}_template`;
        const hasTemplate = collectedAnswers[templateKey] !== undefined;
        
        // Platform is completed if: no template needed, OR template is provided
        if ((!needsTemplate || hasTemplate) && !completedActions.includes(platformKey)) {
          completedActions.push(platformKey);
        }
      }
    });
    
    return completedActions;
  }

  /**
   * Find next platform that needs actions
   * CRITICAL: Only returns platforms that are in selectedPlatforms and not yet completed
   */
  findNextPlatform(selectedPlatforms, completedPlatformActions) {
    const normalized = platformHandlerService.normalizePlatforms(selectedPlatforms);
    const completed = (completedPlatformActions || []).map(p => String(p).toLowerCase());
    
    for (const platformKey of normalized) {
      const normalizedKey = String(platformKey).toLowerCase();
      if (!completed.includes(normalizedKey)) {
        return normalizedKey;
      }
    }
    
    return null;
  }

  /**
   * Check if all platforms are completed
   */
  areAllPlatformsCompleted(selectedPlatforms, completedPlatformActions) {
    const normalized = platformHandlerService.normalizePlatforms(selectedPlatforms);
    const completed = completedPlatformActions || [];
    
    return normalized.length > 0 && normalized.every(p => completed.includes(p));
  }

  /**
   * Find platform that needs template
   * CRITICAL: Only finds platforms that are in selectedPlatforms and have actions but no template
   */
  findPlatformNeedingTemplate(selectedPlatforms, completedPlatformActions, collectedAnswers) {
    const normalized = platformHandlerService.normalizePlatforms(selectedPlatforms);
    const completed = (completedPlatformActions || []).map(p => String(p).toLowerCase());
    
    // CRITICAL FIX: Only check platforms that are in the selected list
    for (const platformKey of normalized) {
      const normalizedKey = String(platformKey).toLowerCase();
      
      // Skip if already completed
      if (completed.includes(normalizedKey)) continue;
      
      const actionKey = `${normalizedKey}_actions`;
      const templateKey = `${normalizedKey}_template`;
      const hasActions = collectedAnswers[actionKey] !== undefined && String(collectedAnswers[actionKey]).trim() !== '';
      const hasTemplate = collectedAnswers[templateKey] !== undefined;
      
      // Only check if platform has actions but no template
      if (hasActions && !hasTemplate) {
        const actionAnswer = String(collectedAnswers[actionKey] || '');
        const needsTemplate = templateHandlerService.needsTemplate(normalizedKey, actionAnswer);
        
        if (needsTemplate) {
          return normalizedKey;
        }
      }
    }
    
    return null;
  }

  /**
   * Get platform index and total for display
   */
  getPlatformProgress(selectedPlatforms, currentPlatform) {
    const normalized = platformHandlerService.normalizePlatforms(selectedPlatforms);
    const index = normalized.findIndex(p => p === currentPlatform);
    
    return {
      platformIndex: index >= 0 ? index + 1 : 1,
      totalPlatforms: normalized.length,
    };
  }
}

module.exports = new PlatformProgressionService();

