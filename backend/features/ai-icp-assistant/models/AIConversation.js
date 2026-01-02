/**
 * AI Conversation Model
 * 
 * Manages conversation sessions between users and the AI assistant
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

class AIConversation {
  /**
   * Create a new conversation
   */
  static async create({ userId, organizationId, title = null, metadata = {} }) {
    try {
      const result = await query(`
        INSERT INTO ai_conversations (
          user_id, 
          organization_id, 
          title, 
          metadata
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [userId, organizationId, title, JSON.stringify(metadata)]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating conversation', { error: error.message });
      throw error;
    }
  }

  /**
   * Get conversation by ID
   */
  static async findById(conversationId) {
    try {
      const result = await query(`
        SELECT * FROM ai_conversations
        WHERE id = $1
      `, [conversationId]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding conversation', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all conversations for a user
   */
  static async findByUser(userId, organizationId, options = {}) {
    try {
      const { status = null, limit = 50, offset = 0 } = options;
      
      let sql = `
        SELECT 
          c.*,
          COUNT(m.id) as message_count,
          MAX(m.created_at) as last_message_at
        FROM ai_conversations c
        LEFT JOIN ai_messages m ON m.conversation_id = c.id
        WHERE c.user_id = $1 AND c.organization_id = $2
      `;
      const params = [userId, organizationId];

      if (status) {
        sql += ` AND c.status = $${params.length + 1}`;
        params.push(status);
      }

      sql += `
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limit, offset);

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Error finding user conversations', { error: error.message });
      throw error;
    }
  }

  /**
   * Generic update method
   */
  static async update(conversationId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.metadata !== undefined) {
        fields.push(`metadata = $${paramIndex}`);
        values.push(JSON.stringify(updates.metadata));
        paramIndex++;
      }

      if (updates.icp_data !== undefined) {
        fields.push(`icp_data = $${paramIndex}`);
        values.push(JSON.stringify(updates.icp_data));
        paramIndex++;
      }

      if (updates.status !== undefined) {
        fields.push(`status = $${paramIndex}`);
        values.push(updates.status);
        paramIndex++;
      }

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(conversationId);

      const sql = `
        UPDATE ai_conversations
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await query(sql, values);

      return result.rows[0];
    } catch (error) {
      console.error('Error updating conversation:', error);
      throw error;
    }
  }

  /**
   * Update conversation ICP data
   */
  static async updateICPData(conversationId, icpData) {
    try {
      const result = await query(`
        UPDATE ai_conversations
        SET 
          icp_data = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [conversationId, JSON.stringify(icpData)]);

      return result.rows[0];
    } catch (error) {
      console.error('Error updating ICP data:', error);
      throw error;
    }
  }

  /**
   * Mark search as triggered
   */
  static async markSearchTriggered(conversationId, searchParams) {
    try {
      const result = await query(`
        UPDATE ai_conversations
        SET 
          search_triggered = true,
          search_params = $2,
          status = 'completed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [conversationId, JSON.stringify(searchParams)]);

      return result.rows[0];
    } catch (error) {
      console.error('Error marking search triggered:', error);
      throw error;
    }
  }

  /**
   * Update conversation status
   */
  static async updateStatus(conversationId, status) {
    try {
      const validStatuses = ['active', 'archived', 'completed'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const result = await query(`
        UPDATE ai_conversations
        SET 
          status = $2,
          ${status === 'archived' ? 'archived_at = CURRENT_TIMESTAMP,' : ''}
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [conversationId, status]);

      return result.rows[0];
    } catch (error) {
      console.error('Error updating conversation status:', error);
      throw error;
    }
  }

  /**
   * Delete conversation (soft delete by archiving)
   */
  static async archive(conversationId) {
    return this.updateStatus(conversationId, 'archived');
  }

  /**
   * Get conversation with message count and token usage
   */
  static async getWithStats(conversationId) {
    try {
      const result = await query(`
        SELECT * FROM get_conversation_summary($1)
      `, [conversationId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting conversation stats:', error);
      throw error;
    }
  }

  /**
   * Get active conversation for user (most recent)
   */
  static async getActiveForUser(userId, organizationId) {
    try {
      const result = await query(`
        SELECT * FROM ai_conversations
        WHERE user_id = $1 
          AND organization_id = $2
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
      `, [userId, organizationId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting active conversation:', error);
      throw error;
    }
  }
}

module.exports = AIConversation;
