/**
 * Platform Handler Service
 * Manages platform-specific logic and transitions
 */

const logger = require('../utils/logger');

class PlatformHandlerService {
  /**
   * Determine next step after platform actions
   */
  async determineNextStep({
    currentStepIndex,
    currentIntentKey,
    userAnswer,
    collectedAnswers = {}
  }) {
    try {
      if (currentStepIndex === 5 && this.isPlatformActionIntent(currentIntentKey)) {
        return this.handlePlatformActionTransition(currentIntentKey, userAnswer, collectedAnswers);
      }

      if (currentStepIndex === 10) {
        return this.handleCampaignSettingsTransition(currentIntentKey, userAnswer, collectedAnswers);
      }

      return {
        nextStepIndex: currentStepIndex + 1,
        context: {}
      };
    } catch (error) {
      logger.error('Error determining next step', { 
        error: error.message,
        stepIndex: currentStepIndex,
        intentKey: currentIntentKey
      });
      return {
        nextStepIndex: currentStepIndex + 1,
        context: {}
      };
    }
  }

  /**
   * Handle platform action transition
   */
  handlePlatformActionTransition(intentKey, userAnswer, collectedAnswers) {
    const platformKey = intentKey.replace('_actions', '');
    let completedActions = collectedAnswers.completed_platform_actions || [];
    const hasCurrentAnswer = userAnswer && userAnswer.trim().length > 0;
    
    if (hasCurrentAnswer && !completedActions.includes(platformKey)) {
      completedActions = [...completedActions, platformKey];
    }
    
    const selectedPlatforms = this.normalizePlatforms(collectedAnswers.selected_platforms || []);
    const allPlatformsDone = selectedPlatforms.length > 0 && 
                             selectedPlatforms.every(p => completedActions.includes(p));
    
    const context = {
      completed_platform_actions: completedActions,
      selected_platforms: selectedPlatforms
    };
    
    if (allPlatformsDone && hasCurrentAnswer) {
      return { nextStepIndex: 6, context: {} };
    }
    
    return { nextStepIndex: 5, context };
  }

  /**
   * Handle campaign settings transition
   */
  handleCampaignSettingsTransition(intentKey, userAnswer, collectedAnswers) {
    const hasCampaignDays = !!(collectedAnswers.campaign_days || 
                              collectedAnswers.campaign_settings?.campaign_days);
    const hasWorkingDays = !!(collectedAnswers.working_days || 
                             collectedAnswers.campaign_settings?.working_days);
    
    let updatedCampaignDays = hasCampaignDays;
    let updatedWorkingDays = hasWorkingDays;
    
    if (userAnswer && userAnswer.trim().length > 0) {
      if (intentKey === 'campaign_days') {
        updatedCampaignDays = true;
      } else if (intentKey === 'working_days') {
        updatedWorkingDays = true;
      }
    }
    
    if (!updatedCampaignDays) {
      return {
        nextStepIndex: 10,
        context: { subStepIndex: 0 }
      };
    }
    
    if (!updatedWorkingDays) {
      return {
        nextStepIndex: 10,
        context: { subStepIndex: 1 }
      };
    }
    
    return {
      nextStepIndex: 11,
      context: this.buildConfirmationContext(collectedAnswers)
    };
  }

  /**
   * Build context for confirmation step
   */
  buildConfirmationContext(collectedAnswers) {
    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        if (value.includes(',')) {
          return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
        return [value];
      }
      return [];
    };
    
    return {
      icp_industries: toArray(collectedAnswers.icp_industries),
      icp_locations: toArray(collectedAnswers.icp_locations),
      icp_roles: collectedAnswers.icp_roles && collectedAnswers.icp_roles !== 'Skip' 
        ? toArray(collectedAnswers.icp_roles) 
        : [],
      selected_platforms: toArray(collectedAnswers.selected_platforms),
      campaign_goal: collectedAnswers.campaign_goal || '',
      campaign_name: collectedAnswers.campaign_name || '',
      campaign_days: collectedAnswers.campaign_days || 
                    (typeof collectedAnswers.campaign_settings === 'object' && collectedAnswers.campaign_settings?.campaign_days) ||
                    '',
      working_days: collectedAnswers.working_days || 
                   (typeof collectedAnswers.campaign_settings === 'object' && collectedAnswers.campaign_settings?.working_days) ||
                   [],
      platform_features: collectedAnswers.platform_features || 
                        collectedAnswers.linkedin_actions || 
                        collectedAnswers.email_actions || 
                        collectedAnswers.whatsapp_actions || 
                        collectedAnswers.voice_actions || [],
      workflow_delays: collectedAnswers.workflow_delays || '',
      workflow_conditions: collectedAnswers.workflow_conditions || ''
    };
  }

  /**
   * Validate platform selection
   */
  validatePlatformSelection(platforms) {
    const normalized = this.normalizePlatforms(platforms);
    const validPlatforms = ['linkedin', 'email', 'whatsapp', 'voice'];
    
    const valid = normalized.filter(p => validPlatforms.includes(p));
    const invalid = normalized.filter(p => !validPlatforms.includes(p));
    
    return {
      valid,
      invalid,
      isValid: valid.length > 0,
      message: invalid.length > 0 
        ? `Invalid platforms: ${invalid.join(', ')}. Valid options: LinkedIn, Email, WhatsApp, Voice Calls`
        : null
    };
  }

  /**
   * Get platform progress
   */
  getPlatformProgress(selectedPlatforms, completedActions) {
    const normalized = this.normalizePlatforms(selectedPlatforms);
    const total = normalized.length;
    const completed = normalized.filter(p => completedActions.includes(p)).length;
    
    return {
      total,
      completed,
      remaining: total - completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      isComplete: completed === total && total > 0
    };
  }

  /**
   * Get next platform to configure
   */
  getNextPlatform(selectedPlatforms, completedActions) {
    const normalized = this.normalizePlatforms(selectedPlatforms);
    
    for (const platform of normalized) {
      if (!completedActions.includes(platform)) {
        return {
          platform,
          intentKey: `${platform}_actions`,
          displayName: this.getPlatformDisplayName(platform)
        };
      }
    }
    
    return null;
  }

  /**
   * Get platform display name
   */
  getPlatformDisplayName(platformKey) {
    const displayNames = {
      linkedin: 'LinkedIn',
      email: 'Email',
      whatsapp: 'WhatsApp',
      voice: 'Voice Calls'
    };
    return displayNames[platformKey] || platformKey;
  }

  /**
   * Check if intent is platform action
   */
  isPlatformActionIntent(intentKey) {
    return ['linkedin_actions', 'email_actions', 'whatsapp_actions', 'voice_actions'].includes(intentKey);
  }

  /**
   * Normalize platform names
   */
  normalizePlatforms(platforms) {
    let platformList = [];
    
    if (Array.isArray(platforms)) {
      platformList = platforms;
    } else if (typeof platforms === 'string') {
      platformList = platforms.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    return platformList.map(p => {
      const pLower = p.toLowerCase().trim();
      if (pLower.includes('linkedin')) return 'linkedin';
      if (pLower.includes('email') || pLower.includes('mail')) return 'email';
      if (pLower.includes('whatsapp')) return 'whatsapp';
      if (pLower.includes('voice')) return 'voice';
      return p.toLowerCase();
    }).filter(p => p);
  }

  /**
   * Extract platform from intent key
   */
  extractPlatformFromIntent(intentKey) {
    if (!intentKey) return null;
    
    if (intentKey.endsWith('_actions')) {
      return intentKey.replace('_actions', '');
    }
    
    if (intentKey.endsWith('_template')) {
      return intentKey.replace('_template', '');
    }
    
    return null;
  }

  /**
   * Build platform context for step 5
   */
  buildPlatformContext(selectedPlatforms, completedActions) {
    const filteredPlatforms = this.filterValidPlatforms(selectedPlatforms);
    
    return {
      selected_platforms: filteredPlatforms,
      completed_platform_actions: completedActions || []
    };
  }

  /**
   * Filter valid platforms
   */
  filterValidPlatforms(platforms) {
    const validPlatforms = ['linkedin', 'email', 'whatsapp', 'voice', 'voice calls', 'voice call'];
    const platformList = Array.isArray(platforms) 
      ? platforms 
      : (platforms ? platforms.split(',').map(s => s.trim()) : []);
    
    return platformList.filter(p => {
      const pLower = p.toLowerCase().trim();
      return validPlatforms.some(vp => pLower.includes(vp) || vp.includes(pLower));
    });
  }
}

module.exports = new PlatformHandlerService();
