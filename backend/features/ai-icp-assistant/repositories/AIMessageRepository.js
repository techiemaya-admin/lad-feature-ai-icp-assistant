/**
 * AI Message Repository
 * LAD Architecture: Data Access Layer for AI Messages
 */
const { query } = require('../utils/database');
const logger = require('../utils/logger');
class AIMessageRepository {
  /**
   * Create a new message with tenant validation via conversation
   */
  static async create({
    conversationId,
    tenantId,
    role,
    content,
    messageData = {},
    tokensUsed = null,
    model = null
  }) {
    // First verify the conversation belongs to the tenant
    const verifyConversationSql = `
      SELECT id FROM ai_conversations
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
    `;
    try {
      const verifyResult = await query(verifyConversationSql, [conversationId, tenantId]);
      if (verifyResult.rows.length === 0) {
        throw new Error('Conversation not found or access denied');
      }
      const sql = `
        INSERT INTO ai_messages (
          conversation_id,
          role,
          content,
          message_data,
          tokens_used,
          model
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const result = await query(sql, [
        conversationId,
        role,
        content,
        JSON.stringify(messageData),
        tokensUsed,
        model
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error('Repository error creating message', { 
        error: error.message, 
        conversationId, 
        tenantId, 
        role 
      });
      throw error;
    }
  }
  /**
   * Get messages for a conversation with tenant validation
   */
  static async findByConversation(conversationId, tenantId, options = {}) {
    // Verify tenant access to conversation
    const verifySql = `
      SELECT id FROM ai_conversations
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
    `;
    try {
      const verifyResult = await query(verifySql, [conversationId, tenantId]);
      if (verifyResult.rows.length === 0) {
        throw new Error('Conversation not found or access denied');
      }
      let sql = `
        SELECT * FROM ai_messages
        WHERE conversation_id = $1 AND is_deleted = false
      `;
      const params = [conversationId];
      if (options.role) {
        sql += ` AND role = $${params.length + 1}`;
        params.push(options.role);
      }
      if (options.limit) {
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(options.limit);
      } else {
        sql += ` ORDER BY created_at ASC`;
      }
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error finding messages', { 
        error: error.message, 
        conversationId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get message by ID with tenant validation
   */
  static async findById(messageId, tenantId) {
    const sql = `
      SELECT m.* FROM ai_messages m
      JOIN ai_conversations c ON m.conversation_id = c.id
      WHERE m.id = $1 AND c.tenant_id = $2 
        AND m.is_deleted = false AND c.is_deleted = false
    `;
    try {
      const result = await query(sql, [messageId, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error finding message', { 
        error: error.message, 
        messageId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Update message with tenant validation
   */
  static async update(messageId, tenantId, updates = {}) {
    const allowedFields = ['content', 'message_data', 'tokens_used', 'model'];
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
      UPDATE ai_messages
      SET ${setClause}
      FROM ai_conversations c
      WHERE ai_messages.id = $1 
        AND c.tenant_id = $2 
        AND ai_messages.conversation_id = c.id
        AND ai_messages.is_deleted = false
        AND c.is_deleted = false
      RETURNING ai_messages.*
    `;
    const params = [messageId, tenantId, ...Object.values(validUpdates)];
    try {
      const result = await query(sql, params);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error updating message', { 
        error: error.message, 
        messageId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Soft delete message with tenant validation
   */
  static async softDelete(messageId, tenantId) {
    const sql = `
      UPDATE ai_messages
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
      FROM ai_conversations c
      WHERE ai_messages.id = $1 
        AND c.tenant_id = $2 
        AND ai_messages.conversation_id = c.id
        AND ai_messages.is_deleted = false
        AND c.is_deleted = false
      RETURNING ai_messages.id
    `;
    try {
      const result = await query(sql, [messageId, tenantId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Repository error soft deleting message', { 
        error: error.message, 
        messageId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Delete all messages for a conversation (when conversation is deleted)
   */
  static async deleteByConversation(conversationId, tenantId) {
    const sql = `
      UPDATE ai_messages
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
      FROM ai_conversations c
      WHERE ai_messages.conversation_id = $1 
        AND c.tenant_id = $2 
        AND ai_messages.conversation_id = c.id
        AND ai_messages.is_deleted = false
        AND c.is_deleted = false
    `;
    try {
      const result = await query(sql, [conversationId, tenantId]);
      return result.rowCount;
    } catch (error) {
      logger.error('Repository error deleting messages by conversation', { 
        error: error.message, 
        conversationId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get token usage statistics for tenant
   */
  static async getTokenUsageStats(tenantId, options = {}) {
    let sql = `
      SELECT 
        DATE_TRUNC('day', m.created_at) as date,
        COUNT(m.id) as message_count,
        SUM(COALESCE(m.tokens_used, 0)) as total_tokens,
        m.model
      FROM ai_messages m
      JOIN ai_conversations c ON m.conversation_id = c.id
      WHERE c.tenant_id = $1 AND m.is_deleted = false AND c.is_deleted = false
    `;
    const params = [tenantId];
    if (options.startDate) {
      sql += ` AND m.created_at >= $${params.length + 1}`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      sql += ` AND m.created_at <= $${params.length + 1}`;
      params.push(options.endDate);
    }
    sql += ` GROUP BY DATE_TRUNC('day', m.created_at), m.model ORDER BY date DESC`;
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error getting token usage stats', { 
        error: error.message, 
        tenantId 
      });
      throw error;
    }
  }
}
module.exports = AIMessageRepository;