/**
 * Platform Handler Service
 * 
 * Handles platform normalization, detection, and action management.
 * Extracted from GeminiIntentService to follow single responsibility.
 */
const onboardingConfig = require('../config/onboarding.config');
class PlatformHandlerService {
  /**
   * Normalize platform names to standard keys
   */
  normalizePlatform(platformName) {
    const pLower = platformName.toLowerCase().trim();
    const { detectionPatterns } = onboardingConfig.platforms;
    for (const [key, patterns] of Object.entries(detectionPatterns)) {
      if (patterns.some(pattern => pLower.includes(pattern))) {
        return key;
      }
    }
    return pLower;
  }
  /**
   * Normalize array of platform names
   */
  normalizePlatforms(platforms) {
    if (Array.isArray(platforms)) {
      return platforms.map(p => this.normalizePlatform(p)).filter(p => p);
    }
    if (typeof platforms === 'string') {
      return platforms
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(p => this.normalizePlatform(p))
        .filter(p => p);
    }
    return [];
  }
  /**
   * Get platform display name
   */
  getPlatformDisplayName(platformKey) {
    const platform = onboardingConfig.platforms.supported.find(
      p => p.normalized === platformKey.toLowerCase()
    );
    return platform ? platform.displayName : platformKey;
  }
  /**
   * Get actions for a platform
   */
  getPlatformActions(platformKey) {
    return onboardingConfig.platforms.actions[platformKey.toLowerCase()] || [];
  }
  /**
   * Check if platform requires template based on selected actions
   */
  requiresTemplate(platformKey, actions) {
    const templateRequired = onboardingConfig.platforms.templateRequired[platformKey.toLowerCase()];
    if (!templateRequired) return false;
    return templateRequired(actions);
  }
  /**
   * Get platform configuration
   */
  getPlatformConfig(platformKey) {
    const normalized = platformKey.toLowerCase();
    const actions = this.getPlatformActions(normalized);
    const displayName = this.getPlatformDisplayName(normalized);
    return {
      key: normalized,
      displayName,
      actions,
      intentKey: `${normalized}_actions`,
    };
  }
  /**
   * Filter valid platforms from input
   */
  filterValidPlatforms(platforms) {
    const validKeys = onboardingConfig.platforms.supported.map(p => p.normalized);
    const normalized = this.normalizePlatforms(platforms);
    return normalized.filter(p => validKeys.includes(p));
  }
}
module.exports = new PlatformHandlerService();