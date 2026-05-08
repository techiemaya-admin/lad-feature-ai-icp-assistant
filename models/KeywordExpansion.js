/**
 * Keyword Expansion Model
 * LAD Architecture: Business Logic Layer
 * Uses Repository Pattern for Data Access
 */
const { KeywordExpansionRepository } = require('../repositories');
const logger = require('../utils/logger');
class KeywordExpansion {
  /**
   * Create or update keyword expansion cache with tenant isolation
   */
  static async upsert({
    originalKeyword,
    expandedKeywords,
    context = 'general',
    model = null,
    tenantId = null // Nullable for global expansions
  }) {
    try {
      if (!originalKeyword || !expandedKeywords) {
        throw new Error('originalKeyword and expandedKeywords are required');
      }
      // Business logic: Validate expanded keywords array
      const validatedKeywords = this.validateKeywords(expandedKeywords);
      return await KeywordExpansionRepository.upsert({
        originalKeyword,
        expandedKeywords: validatedKeywords,
        context,
        model,
        tenantId
      });
    } catch (error) {
      logger.error('Model error upserting keyword expansion', { 
        error: error.message, 
        originalKeyword, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get cached expansion
   */
  static async findCached(originalKeyword, context = 'general', organizationId = null) {
    try {
      const result = await query(`
        SELECT * FROM ai_keyword_expansions
        WHERE original_keyword = $1
          AND context = $2
          AND (organization_id = $3 OR organization_id IS NULL)
        ORDER BY organization_id DESC NULLS LAST
        LIMIT 1
      `, [originalKeyword.toLowerCase().trim(), context, organizationId]);
      if (result.rows[0]) {
        // Update usage stats
        await query(`
          UPDATE ai_keyword_expansions
          SET 
            usage_count = usage_count + 1,
            last_used_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [result.rows[0].id]);
      }
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding cached keyword expansion:', error);
      throw error;
    }
  }
  /**
   * Get all cached expansions for an organization
   */
  static async findByOrganization(organizationId, options = {}) {
    try {
      const { context = null, limit = 100, offset = 0 } = options;
      let sql = `
        SELECT * FROM ai_keyword_expansions
        WHERE organization_id = $1
      `;
      const params = [organizationId];
      if (context) {
        sql += ` AND context = $${params.length + 1}`;
        params.push(context);
      }
      sql += `
        ORDER BY usage_count DESC, last_used_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limit, offset);
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Error finding organization keyword expansions:', error);
      throw error;
    }
  }
  /**
   * Get most used keywords (analytics)
   */
  static async getMostUsed(organizationId = null, limit = 50) {
    try {
      let sql = `
        SELECT 
          original_keyword,
          context,
          usage_count,
          last_used_at,
          created_at
        FROM ai_keyword_expansions
      `;
      const params = [];
      if (organizationId) {
        sql += ` WHERE organization_id = $1`;
        params.push(organizationId);
      }
      sql += `
        ORDER BY usage_count DESC
        LIMIT $${params.length + 1}
      `;
      params.push(limit);
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting most used keywords:', error);
      throw error;
    }
  }
  /**
   * Search cached keywords
   */
  static async search(searchTerm, organizationId = null, limit = 20) {
    try {
      let sql = `
        SELECT * FROM ai_keyword_expansions
        WHERE original_keyword ILIKE $1
      `;
      const params = [`%${searchTerm}%`];
      if (organizationId) {
        sql += ` AND (organization_id = $${params.length + 1} OR organization_id IS NULL)`;
        params.push(organizationId);
      }
      sql += `
        ORDER BY usage_count DESC
        LIMIT $${params.length + 1}
      `;
      params.push(limit);
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Error searching keyword expansions:', error);
      throw error;
    }
  }
  /**
   * Delete old/unused cache entries
   */
  static async pruneOldEntries(daysOld = 90, minUsageCount = 1) {
    try {
      const result = await query(`
        DELETE FROM ai_keyword_expansions
        WHERE last_used_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
          AND usage_count < $1
        RETURNING id
      `, [minUsageCount]);
      return result.rowCount;
    } catch (error) {
      logger.error('Error pruning old keyword expansions:', error);
      throw error;
    }
  }
  /**
   * Get cache statistics
   */
  static async getStats(organizationId = null) {
    try {
      let sql = `
        SELECT 
          COUNT(*) as total_entries,
          COUNT(DISTINCT original_keyword) as unique_keywords,
          COUNT(DISTINCT context) as contexts_used,
          SUM(usage_count) as total_usage,
          AVG(usage_count) as avg_usage_per_keyword,
          MAX(last_used_at) as most_recent_use
        FROM ai_keyword_expansions
      `;
      const params = [];
      if (organizationId) {
        sql += ` WHERE organization_id = $1`;
        params.push(organizationId);
      }
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting keyword expansion stats:', error);
      throw error;
    }
  }
  /**
   * Delete by ID
   */
  static async delete(expansionId) {
    try {
      const result = await query(`
        DELETE FROM ai_keyword_expansions
        WHERE id = $1
        RETURNING id
      `, [expansionId]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error deleting keyword expansion:', error);
      throw error;
    }
  }
}
module.exports = KeywordExpansion;