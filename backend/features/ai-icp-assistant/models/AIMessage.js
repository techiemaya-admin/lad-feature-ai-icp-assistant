/**
 * AI Message Model
 * 
 * Manages individual messages within conversations
 */
const { query } = require('../utils/database');
class AIMessage {
  /**
   * Create a new message
   */
  static async create({ 
    conversationId, 
    role, 
    content, 
    messageData = {}, 
    tokensUsed = null,
    model = null 
  }) {
    try {
      const validRoles = ['user', 'assistant'];
      if (!validRoles.includes(role)) {
        throw new Error(`Invalid role: ${role}. Must be 'user' or 'assistant'`);
      }
      const result = await query(`
        INSERT INTO ai_messages (
          conversation_id,
          role,
          content,
          message_data,
          tokens_used,
          model
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        conversationId,
        role,
        content,
        JSON.stringify(messageData),
        tokensUsed,
        model
      ]);
      return result.rows[0];
    } catch (error) {
      // ...existing code...
      throw error;
    }
  }
  /**
   * Get all messages for a conversation
   */
  static async findByConversation(conversationId, options = {}) {
    try {
      const { limit = 100, offset = 0, order = 'ASC' } = options;
      const result = await query(`
        SELECT * FROM ai_messages
        WHERE conversation_id = $1
        ORDER BY created_at ${order}
        LIMIT $2 OFFSET $3
      `, [conversationId, limit, offset]);
      return result.rows;
    } catch (error) {
      // ...existing code...
      throw error;
    }
  }
  /**
   * Get message by ID
   */
  static async findById(messageId) {
    try {
      const result = await query(`
        SELECT * FROM ai_messages
        WHERE id = $1
      `, [messageId]);
      return result.rows[0] || null;
    } catch (error) {
      // ...existing code...
      throw error;
    }
  }
  /**
   * Get recent messages for a conversation (for context window)
   */
  static async getRecent(conversationId, limit = 10) {
    try {
      const result = await query(`
        SELECT * FROM ai_messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [conversationId, limit]);
      // Return in chronological order
      return result.rows.reverse();
    } catch (error) {
      // ...existing code...
      throw error;
    }
  }
  /**
   * Get total token usage for a conversation
   */
  static async getTotalTokens(conversationId) {
    try {
      const result = await query(`
        SELECT COALESCE(SUM(tokens_used), 0) as total_tokens
        FROM ai_messages
        WHERE conversation_id = $1
      `, [conversationId]);
      return parseInt(result.rows[0].total_tokens) || 0;
    } catch (error) {
      // ...existing code...
      throw error;
    }
  }
  /**
   * Get message count for a conversation
   */
  static async getCount(conversationId) {
    try {
      const result = await query(`
        SELECT COUNT(*) as message_count
        FROM ai_messages
        WHERE conversation_id = $1
      `, [conversationId]);
      return parseInt(result.rows[0].message_count) || 0;
    } catch (error) {
      // ...existing code...
      throw error;
    }
  }
  /**
   * Delete all messages for a conversation
   */
  static async deleteByConversation(conversationId) {
    try {
      const result = await query(`
        DELETE FROM ai_messages
        WHERE conversation_id = $1
        RETURNING id
      `, [conversationId]);
      return result.rowCount;
    } catch (error) {
      // ...existing code...
      throw error;
    }
  }
  /**
   * Get messages grouped by role
   */
  static async getStatsByConversation(conversationId) {
    try {
      const result = await query(`
        SELECT 
          role,
          COUNT(*) as message_count,
          COALESCE(SUM(tokens_used), 0) as total_tokens,
          AVG(LENGTH(content)) as avg_length
        FROM ai_messages
        WHERE conversation_id = $1
        GROUP BY role
      `, [conversationId]);
      return result.rows;
    } catch (error) {
      // ...existing code...
      throw error;
    }
  }
}
module.exports = AIMessage;