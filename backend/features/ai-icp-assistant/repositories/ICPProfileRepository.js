/**
 * ICP Profile Repository
 * LAD Architecture: Data Access Layer for ICP Profiles
 */
const { query } = require('../utils/database');
const logger = require('../utils/logger');
class ICPProfileRepository {
  /**
   * Create a new ICP profile with tenant isolation
   */
  static async create({
    userId,
    tenantId,
    name,
    description = null,
    icpData,
    searchParams = null,
    sourceConversationId = null
  }) {
    const sql = `
      INSERT INTO ai_icp_profiles (
        user_id,
        tenant_id,
        name,
        description,
        icp_data,
        search_params,
        source_conversation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    try {
      const result = await query(sql, [
        userId,
        tenantId,
        name,
        description,
        JSON.stringify(icpData),
        searchParams ? JSON.stringify(searchParams) : null,
        sourceConversationId
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error('Repository error creating ICP profile', { 
        error: error.message, 
        userId, 
        tenantId, 
        name 
      });
      throw error;
    }
  }
  /**
   * Find profile by ID with tenant validation
   */
  static async findById(profileId, tenantId) {
    const sql = `
      SELECT * FROM ai_icp_profiles
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
    `;
    try {
      const result = await query(sql, [profileId, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error finding ICP profile', { 
        error: error.message, 
        profileId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Find profiles by user with tenant scoping
   */
  static async findByUser(userId, tenantId, options = {}) {
    let sql = `
      SELECT * FROM ai_icp_profiles
      WHERE user_id = $1 AND tenant_id = $2 AND is_deleted = false
    `;
    const params = [userId, tenantId];
    if (options.isActive !== undefined) {
      sql += ` AND is_active = $${params.length + 1}`;
      params.push(options.isActive);
    }
    if (options.limit) {
      sql += ` ORDER BY last_used_at DESC NULLS LAST, created_at DESC LIMIT $${params.length + 1}`;
      params.push(options.limit);
    } else {
      sql += ` ORDER BY last_used_at DESC NULLS LAST, created_at DESC`;
    }
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error finding profiles by user', { 
        error: error.message, 
        userId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Find profiles by tenant (admin view)
   */
  static async findByTenant(tenantId, options = {}) {
    let sql = `
      SELECT 
        p.*,
        u.email as user_email,
        c.title as source_conversation_title
      FROM ai_icp_profiles p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN ai_conversations c ON p.source_conversation_id = c.id
      WHERE p.tenant_id = $1 AND p.is_deleted = false
    `;
    const params = [tenantId];
    if (options.isActive !== undefined) {
      sql += ` AND p.is_active = $${params.length + 1}`;
      params.push(options.isActive);
    }
    if (options.userId) {
      sql += ` AND p.user_id = $${params.length + 1}`;
      params.push(options.userId);
    }
    if (options.limit) {
      sql += ` ORDER BY p.usage_count DESC, p.last_used_at DESC NULLS LAST LIMIT $${params.length + 1}`;
      params.push(options.limit);
    } else {
      sql += ` ORDER BY p.usage_count DESC, p.last_used_at DESC NULLS LAST`;
    }
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error finding profiles by tenant', { 
        error: error.message, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Update profile with tenant validation
   */
  static async update(profileId, tenantId, updates = {}) {
    const allowedFields = [
      'name', 
      'description', 
      'icp_data', 
      'search_params', 
      'is_active'
    ];
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
    // Handle JSON fields
    if (validUpdates.icp_data) {
      validUpdates.icp_data = JSON.stringify(validUpdates.icp_data);
    }
    if (validUpdates.search_params) {
      validUpdates.search_params = JSON.stringify(validUpdates.search_params);
    }
    const setClause = Object.keys(validUpdates)
      .map((key, index) => `${key} = $${index + 3}`)
      .join(', ');
    const sql = `
      UPDATE ai_icp_profiles
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
      RETURNING *
    `;
    const params = [profileId, tenantId, ...Object.values(validUpdates)];
    try {
      const result = await query(sql, params);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error updating ICP profile', { 
        error: error.message, 
        profileId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Increment usage counter
   */
  static async incrementUsage(profileId, tenantId) {
    const sql = `
      UPDATE ai_icp_profiles
      SET 
        usage_count = usage_count + 1,
        last_used_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
      RETURNING usage_count, last_used_at
    `;
    try {
      const result = await query(sql, [profileId, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Repository error incrementing profile usage', { 
        error: error.message, 
        profileId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Soft delete profile with tenant validation
   */
  static async softDelete(profileId, tenantId) {
    const sql = `
      UPDATE ai_icp_profiles
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
      RETURNING id
    `;
    try {
      const result = await query(sql, [profileId, tenantId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Repository error soft deleting ICP profile', { 
        error: error.message, 
        profileId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Search profiles by name or content within tenant
   */
  static async search(searchTerm, tenantId, options = {}) {
    let sql = `
      SELECT * FROM ai_icp_profiles
      WHERE tenant_id = $1 
        AND is_deleted = false
        AND (
          name ILIKE $2
          OR description ILIKE $2
          OR icp_data::text ILIKE $2
        )
    `;
    const params = [tenantId, `%${searchTerm}%`];
    if (options.userId) {
      sql += ` AND user_id = $${params.length + 1}`;
      params.push(options.userId);
    }
    if (options.isActive !== undefined) {
      sql += ` AND is_active = $${params.length + 1}`;
      params.push(options.isActive);
    }
    sql += ` ORDER BY usage_count DESC, last_used_at DESC NULLS LAST`;
    if (options.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error searching ICP profiles', { 
        error: error.message, 
        searchTerm, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get most popular profiles for tenant
   */
  static async getPopular(tenantId, options = {}) {
    let sql = `
      SELECT 
        p.*,
        u.email as user_email
      FROM ai_icp_profiles p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.tenant_id = $1 
        AND p.is_deleted = false
        AND p.usage_count > 0
    `;
    const params = [tenantId];
    if (options.minUsage) {
      sql += ` AND p.usage_count >= $${params.length + 1}`;
      params.push(options.minUsage);
    }
    if (options.isActive !== undefined) {
      sql += ` AND p.is_active = $${params.length + 1}`;
      params.push(options.isActive);
    }
    sql += ` ORDER BY p.usage_count DESC, p.last_used_at DESC`;
    if (options.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error getting popular profiles', { 
        error: error.message, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get usage statistics for tenant
   */
  static async getUsageStats(tenantId) {
    const sql = `
      SELECT 
        COUNT(*) as total_profiles,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(usage_count) as total_usage,
        AVG(usage_count) as avg_usage_per_profile,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_profiles,
        MAX(last_used_at) as last_activity
      FROM ai_icp_profiles
      WHERE tenant_id = $1 AND is_deleted = false
    `;
    try {
      const result = await query(sql, [tenantId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Repository error getting usage stats', { 
        error: error.message, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Deactivate old unused profiles (cleanup job)
   */
  static async deactivateUnused(tenantId, daysUnused = 90) {
    const sql = `
      UPDATE ai_icp_profiles
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 
        AND is_deleted = false
        AND is_active = true
        AND (
          last_used_at < NOW() - INTERVAL '${daysUnused} days'
          OR (last_used_at IS NULL AND created_at < NOW() - INTERVAL '${daysUnused} days')
        )
      RETURNING id, name
    `;
    try {
      const result = await query(sql, [tenantId]);
      return result.rows;
    } catch (error) {
      logger.error('Repository error deactivating unused profiles', { 
        error: error.message, 
        tenantId, 
        daysUnused 
      });
      throw error;
    }
  }
}
module.exports = ICPProfileRepository;