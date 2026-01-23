/**
 * AI Conversation Repository
 * LAD Architecture: Data Access Layer for AI Conversations
 */
const { query } = require('../utils/database');
const logger = require('../utils/logger');
class AIConversationRepository {
  /**
   * Create a new conversation with tenant isolation
   */
  static async create({ userId, tenantId, title = null, metadata = {} }) {
    const sql = `
      INSERT INTO ai_conversations (
        user_id, 
        tenant_id, 
        title, 
        metadata
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    try {
      const result = await query(sql, [userId, tenantId, title, JSON.stringify(metadata)]);
      return result.rows[0];
    } catch (error) {
      logger.error('Repository error creating conversation', { error: error.message, userId, tenantId });
      throw error;
    }
  }
  /**
   * Find conversation by ID with tenant scoping
   */
  static async findById(conversationId, tenantId) {
    const sql = `
      SELECT * FROM ai_conversations
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
    `;
    try {
      const result = await query(sql, [conversationId, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error finding conversation', { error: error.message, conversationId, tenantId });
      throw error;
    }
  }
  /**
   * Get all conversations for a user within tenant
   */
  static async findByUser(userId, tenantId, options = {}) {
    let sql = `
      SELECT * FROM ai_conversations
      WHERE user_id = $1 AND tenant_id = $2 AND is_deleted = false
    `;
    const params = [userId, tenantId];
    // Add optional filters
    if (options.status) {
      sql += ` AND status = $${params.length + 1}`;
      params.push(options.status);
    }
    if (options.limit) {
      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(options.limit);
    } else {
      sql += ` ORDER BY created_at DESC`;
    }
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error finding user conversations', { error: error.message, userId, tenantId });
      throw error;
    }
  }
  /**
   * Update conversation with tenant validation
   */
  static async update(conversationId, tenantId, updates = {}) {
    const allowedFields = ['title', 'status', 'icp_data', 'search_params', 'search_triggered', 'metadata'];
    const validUpdates = {};
    // Filter only allowed fields
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        validUpdates[key] = updates[key];
      }
    });
    if (Object.keys(validUpdates).length === 0) {
      throw new Error('No valid fields provided for update');
    }
    const setClause = Object.keys(validUpdates)
      .map((key, index) => `${key} = $${index + 3}`)
      .join(', ');
    const sql = `
      UPDATE ai_conversations
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
      RETURNING *
    `;
    const params = [conversationId, tenantId, ...Object.values(validUpdates)];
    try {
      const result = await query(sql, params);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error updating conversation', { error: error.message, conversationId, tenantId });
      throw error;
    }
  }
  /**
   * Soft delete conversation with tenant validation
   */
  static async softDelete(conversationId, tenantId) {
    const sql = `
      UPDATE ai_conversations
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
      RETURNING id
    `;
    try {
      const result = await query(sql, [conversationId, tenantId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Repository error soft deleting conversation', { error: error.message, conversationId, tenantId });
      throw error;
    }
  }
  /**
   * Archive conversation
   */
  static async archive(conversationId, tenantId) {
    const sql = `
      UPDATE ai_conversations
      SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
      RETURNING *
    `;
    try {
      const result = await query(sql, [conversationId, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error archiving conversation', { error: error.message, conversationId, tenantId });
      throw error;
    }
  }
  /**
   * Get conversation summary statistics
   */
  static async getStats(conversationId, tenantId) {
    const sql = `
      SELECT 
        c.id,
        c.user_id,
        c.status,
        c.created_at,
        COUNT(m.id) as message_count,
        COALESCE(SUM(m.tokens_used), 0)::INTEGER as total_tokens
      FROM ai_conversations c
      LEFT JOIN ai_messages m ON m.conversation_id = c.id AND m.is_deleted = false
      WHERE c.id = $1 AND c.tenant_id = $2 AND c.is_deleted = false
      GROUP BY c.id, c.user_id, c.status, c.created_at
    `;
    try {
      const result = await query(sql, [conversationId, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error getting conversation stats', { error: error.message, conversationId, tenantId });
      throw error;
    }
  }
}
module.exports = AIConversationRepository;