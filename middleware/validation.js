/**
 * Validation Middleware for AI ICP Assistant
 */
/**
 * Validate chat request
 */
function validateChatRequest(req, res, next) {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Message is required and must be a string'
    });
  }
  if (message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Message cannot be empty'
    });
  }
  if (message.length > 5000) {
    return res.status(400).json({
      success: false,
      error: 'Message too long (max 5000 characters)'
    });
  }
  next();
}
/**
 * Validate keyword expansion request
 */
function validateKeywordRequest(req, res, next) {
  const { topic } = req.body;
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Topic is required and must be a string'
    });
  }
  if (topic.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Topic cannot be empty'
    });
  }
  if (topic.length > 200) {
    return res.status(400).json({
      success: false,
      error: 'Topic too long (max 200 characters)'
    });
  }
  next();
}
/**
 * Validate ICP profile creation
 */
function validateProfileCreation(req, res, next) {
  const { name, icpData } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Name is required and must be a string'
    });
  }
  if (name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Name cannot be empty'
    });
  }
  if (name.length > 255) {
    return res.status(400).json({
      success: false,
      error: 'Name too long (max 255 characters)'
    });
  }
  if (!icpData || typeof icpData !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'ICP data is required and must be an object'
    });
  }
  next();
}
/**
 * Validate UUID parameter
 */
function validateUuidParam(paramName = 'id') {
  return (req, res, next) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid || !uuidRegex.test(uuid)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ${paramName} format`
      });
    }
    next();
  };
}
/**
 * Validate pagination parameters
 */
function validatePagination(req, res, next) {
  const { limit, offset } = req.query;
  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100'
      });
    }
  }
  if (offset !== undefined) {
    const offsetNum = parseInt(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        success: false,
        error: 'Offset must be a non-negative number'
      });
    }
  }
  next();
}
module.exports = {
  validateChatRequest,
  validateKeywordRequest,
  validateProfileCreation,
  validateUuidParam,
  validatePagination
};