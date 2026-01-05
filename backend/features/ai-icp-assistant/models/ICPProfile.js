/**
 * ICP Profile Model
 * 
 * Manages saved ICP (Ideal Customer Profile) configurations
 */

const { query } = require('../utils/database');

class ICPProfile {
  /**
   * Create a new ICP profile
   */
  static async create({
    userId,
    organizationId,
    name,
    description = null,
    icpData,
    searchParams = null,
    sourceConversationId = null
  }) {
    try {
      const result = await query(`
        INSERT INTO ai_icp_profiles (
          user_id,
          organization_id,
          name,
          description,
          icp_data,
          search_params,
          source_conversation_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        userId,
        organizationId,
        name,
        description,
        JSON.stringify(icpData),
        searchParams ? JSON.stringify(searchParams) : null,
        sourceConversationId
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error creating ICP profile:', error);
      throw error;
    }
  }

  /**
   * Get profile by ID
   */
  static async findById(profileId) {
    try {
      const result = await query(`
        SELECT * FROM ai_icp_profiles
        WHERE id = $1 AND is_active = true
      `, [profileId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding ICP profile:', error);
      throw error;
    }
  }

  /**
   * Get all profiles for a user
   */
  static async findByUser(userId, organizationId, options = {}) {
    try {
      const { includeInactive = false, limit = 50, offset = 0 } = options;
      
      let sql = `
        SELECT * FROM ai_icp_profiles
        WHERE user_id = $1 AND organization_id = $2
      `;
      const params = [userId, organizationId];

      if (!includeInactive) {
        sql += ` AND is_active = true`;
      }

      sql += `
        ORDER BY usage_count DESC, updated_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limit, offset);

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Error finding user ICP profiles:', error);
      throw error;
    }
  }

  /**
   * Update profile
   */
  static async update(profileId, updates) {
    try {
      const allowedFields = ['name', 'description', 'icp_data', 'search_params'];
      const setClauses = [];
      const params = [profileId];
      let paramIndex = 2;

      Object.keys(updates).forEach(field => {
        if (allowedFields.includes(field)) {
          const value = ['icp_data', 'search_params'].includes(field) 
            ? JSON.stringify(updates[field])
            : updates[field];
          setClauses.push(`${field} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      });

      if (setClauses.length === 0) {
        throw new Error('No valid fields to update');
      }

      setClauses.push('updated_at = CURRENT_TIMESTAMP');

      const sql = `
        UPDATE ai_icp_profiles
        SET ${setClauses.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating ICP profile:', error);
      throw error;
    }
  }

  /**
   * Increment usage count
   */
  static async incrementUsage(profileId) {
    try {
      await query(`
        SELECT increment_profile_usage($1)
      `, [profileId]);

      return this.findById(profileId);
    } catch (error) {
      console.error('Error incrementing profile usage:', error);
      throw error;
    }
  }

  /**
   * Soft delete (deactivate) profile
   */
  static async deactivate(profileId) {
    try {
      const result = await query(`
        UPDATE ai_icp_profiles
        SET 
          is_active = false,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [profileId]);

      return result.rows[0];
    } catch (error) {
      console.error('Error deactivating ICP profile:', error);
      throw error;
    }
  }

  /**
   * Reactivate profile
   */
  static async activate(profileId) {
    try {
      const result = await query(`
        UPDATE ai_icp_profiles
        SET 
          is_active = true,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [profileId]);

      return result.rows[0];
    } catch (error) {
      console.error('Error activating ICP profile:', error);
      throw error;
    }
  }

  /**
   * Get most used profiles for an organization
   */
  static async getMostUsed(organizationId, limit = 10) {
    try {
      const result = await query(`
        SELECT * FROM ai_icp_profiles
        WHERE organization_id = $1 AND is_active = true
        ORDER BY usage_count DESC, last_used_at DESC
        LIMIT $2
      `, [organizationId, limit]);

      return result.rows;
    } catch (error) {
      console.error('Error getting most used profiles:', error);
      throw error;
    }
  }

  /**
   * Search profiles by name
   */
  static async search(userId, organizationId, searchTerm) {
    try {
      const result = await query(`
        SELECT * FROM ai_icp_profiles
        WHERE user_id = $1 
          AND organization_id = $2
          AND is_active = true
          AND (name ILIKE $3 OR description ILIKE $3)
        ORDER BY usage_count DESC
        LIMIT 20
      `, [userId, organizationId, `%${searchTerm}%`]);

      return result.rows;
    } catch (error) {
      console.error('Error searching ICP profiles:', error);
      throw error;
    }
  }

  /**
   * Delete profile permanently
   */
  static async delete(profileId) {
    try {
      const result = await query(`
        DELETE FROM ai_icp_profiles
        WHERE id = $1
        RETURNING id
      `, [profileId]);

      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting ICP profile:', error);
      throw error;
    }
  }
}

module.exports = ICPProfile;
