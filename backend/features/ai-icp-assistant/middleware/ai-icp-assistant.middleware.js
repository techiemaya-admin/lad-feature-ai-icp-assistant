/**
 * AI ICP Assistant Middleware
 * 
 * Validation and guards for ICP onboarding endpoints.
 * No business logic - only validation.
 */

const onboardingConfig = require('../config/onboarding.config');

/**
 * Validate step index parameter
 */
function validateStepIndex(req, res, next) {
  const { stepIndex } = req.params;
  const stepNum = parseInt(stepIndex, 10);
  const { minStepIndex, maxStepIndex } = onboardingConfig.steps;
  
  if (isNaN(stepNum) || stepNum < minStepIndex || stepNum > maxStepIndex) {
    return res.status(400).json({
      success: false,
      error: `Invalid step index (must be ${minStepIndex}-${maxStepIndex})`
    });
  }
  
  req.validatedStepIndex = stepNum;
  next();
}

/**
 * Validate ICP answer request
 */
function validateICPAnswer(req, res, next) {
  const { userAnswer, currentStepIndex } = req.body;
  const { minAnswerLength, maxAnswerLength } = onboardingConfig.validation;
  
  if (!userAnswer || typeof userAnswer !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'userAnswer is required and must be a string'
    });
  }
  
  if (userAnswer.trim().length < minAnswerLength) {
    return res.status(400).json({
      success: false,
      error: `Answer must be at least ${minAnswerLength} character(s)`
    });
  }
  
  if (userAnswer.length > maxAnswerLength) {
    return res.status(400).json({
      success: false,
      error: `Answer too long (max ${maxAnswerLength} characters)`
    });
  }
  
  if (!currentStepIndex || typeof currentStepIndex !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'currentStepIndex is required and must be a number'
    });
  }
  
  const { minStepIndex, maxStepIndex } = onboardingConfig.steps;
  if (currentStepIndex < minStepIndex || currentStepIndex > maxStepIndex) {
    return res.status(400).json({
      success: false,
      error: `currentStepIndex must be between ${minStepIndex} and ${maxStepIndex}`
    });
  }
  
  next();
}

/**
 * Validate category query parameter
 */
function validateCategory(req, res, next) {
  const { category } = req.query;
  
  // Allow default category or validate against known categories
  if (category && typeof category !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'category must be a string'
    });
  }
  
  next();
}

module.exports = {
  validateStepIndex,
  validateICPAnswer,
  validateCategory,
};

