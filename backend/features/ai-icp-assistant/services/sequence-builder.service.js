/**
 * Sequence Builder Service
 *
 * Pure, stateless helpers to build a clear, human-readable onboarding
 * sequence (platform order, actions, and condition options) using
 * configuration only (no hardcoded values).
 */

const onboardingConfig = require('../config/onboarding.config');

/**
 * Determine platform order.
 * - If the user provided an explicit order in `collectedAnswers.platform_order`, use it.
 * - Otherwise use `onboardingConfig.platforms.supported` order filtered by selectedPlatforms.
 */
function determinePlatformOrder(selectedPlatforms = [], collectedAnswers = {}) {
  if (!Array.isArray(selectedPlatforms) || selectedPlatforms.length === 0) return [];

  const explicitOrder = Array.isArray(collectedAnswers.platform_order)
    ? collectedAnswers.platform_order.filter(p => selectedPlatforms.includes(p))
    : null;

  if (explicitOrder && explicitOrder.length > 0) return explicitOrder;

  const supported = onboardingConfig.platforms.supported.map(p => p.key);
  // Respect configured supported order, but only include selected platforms
  return supported.filter(p => selectedPlatforms.includes(p));
}

/**
 * Build a sequence item for a single platform
 */
function buildPlatformItem(platformKey, collectedAnswers = {}) {
  const platformConfig = onboardingConfig.platforms.supported.find(p => p.key === platformKey) || { key: platformKey, displayName: platformKey };
  const actions = (onboardingConfig.platforms.actions && onboardingConfig.platforms.actions[platformKey]) || [];

  const actionItems = actions.map(actionLabel => ({
    label: actionLabel,
    // Determine if this action likely requires a template via config function
    requiresTemplate: typeof onboardingConfig.platforms.templateRequired === 'object'
      ? (typeof onboardingConfig.platforms.templateRequired[platformKey] === 'function'
          ? onboardingConfig.platforms.templateRequired[platformKey](actionLabel)
          : false)
      : false,
  }));

  return {
    key: platformConfig.key,
    displayName: platformConfig.displayName || platformConfig.key,
    actions: actionItems,
    // Default condition options come from onboarding config
    conditionOptions: onboardingConfig.conditionOptions || [],
    // Return any saved templates/answers for this platform
    savedTemplate: collectedAnswers[`${platformKey}_template`] || null,
    savedActionsAnswer: collectedAnswers[`${platformKey}_actions`] || null,
  };
}

/**
 * Build full sequence for selected platforms
 * Returns: { orderedPlatforms: [ {key, displayName, actions, conditionOptions, ...} ], summary }
 */
function buildSequence(selectedPlatforms = [], collectedAnswers = {}) {
  const ordered = determinePlatformOrder(selectedPlatforms, collectedAnswers);

  const orderedPlatforms = ordered.map(pKey => buildPlatformItem(pKey, collectedAnswers));

  const summary = createSequenceSummary(orderedPlatforms);

  return { orderedPlatforms, summary };
}

/**
 * Get next platform that still needs configuration
 */
function getNextPlatformToConfigure(selectedPlatforms = [], completedPlatformActions = []) {
  if (!Array.isArray(selectedPlatforms) || selectedPlatforms.length === 0) return null;
  if (!Array.isArray(completedPlatformActions)) completedPlatformActions = [];

  const order = determinePlatformOrder(selectedPlatforms, {});
  for (const p of order) {
    if (!completedPlatformActions.includes(p)) return p;
  }
  return null; // all done
}

/**
 * Create a concise human-readable summary of the planned sequence.
 */
function createSequenceSummary(orderedPlatforms = []) {
  if (!Array.isArray(orderedPlatforms) || orderedPlatforms.length === 0) return 'No platforms selected.';

  const lines = orderedPlatforms.map((p, idx) => {
    const actionCount = Array.isArray(p.actions) ? p.actions.length : 0;
    const templateNeeded = p.actions.some(a => a.requiresTemplate) ? ' (template likely required)' : '';
    return `${idx + 1}. ${p.displayName}: ${actionCount} action(s)${templateNeeded}`;
  });

  return `Planned sequence:\n${lines.join('\n')}`;
}

module.exports = {
  determinePlatformOrder,
  buildPlatformItem,
  buildSequence,
  getNextPlatformToConfigure,
  createSequenceSummary,
};
