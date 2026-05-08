/**
 * Repository Index
 * LAD Architecture: Central export for all repositories
 */
const AIConversationRepository = require('./AIConversationRepository');
const AIMessageRepository = require('./AIMessageRepository');
const KeywordExpansionRepository = require('./KeywordExpansionRepository');
const ICPProfileRepository = require('./ICPProfileRepository');
module.exports = {
  AIConversationRepository,
  AIMessageRepository,
  KeywordExpansionRepository,
  ICPProfileRepository
};