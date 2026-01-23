/**
 * Keyword Expansion Repository
 * LAD Architecture: Data Access Layer for AI Keyword Expansions
 */
const { query } = require('../utils/database');
const logger = require('../utils/logger');
class KeywordExpansionRepository {
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
    const sql = `
      INSERT INTO ai_keyword_expansions (
        original_keyword,
        expanded_keywords,
        context,
        model,
        tenant_id,
        usage_count,
        last_used_at
      ) VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (original_keyword, context, tenant_id)
      WHERE is_deleted = false
      DO UPDATE SET
        expanded_keywords = EXCLUDED.expanded_keywords,
        model = EXCLUDED.model,
        usage_count = ai_keyword_expansions.usage_count + 1,
        last_used_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    try {
      const result = await query(sql, [
        originalKeyword.toLowerCase().trim(),
        JSON.stringify(expandedKeywords),
        context,
        model,
        tenantId
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error('Repository error upserting keyword expansion', { 
        error: error.message, 
        originalKeyword, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Find cached expansion with tenant preference
   */
  static async findCached(originalKeyword, context = 'general', tenantId = null) {
    // Prefer tenant-specific, fall back to global
    const sql = `
      SELECT * FROM ai_keyword_expansions
      WHERE original_keyword = $1
        AND context = $2
        AND (tenant_id = $3 OR tenant_id IS NULL)
        AND is_deleted = false
      ORDER BY tenant_id DESC NULLS LAST
      LIMIT 1
    `;
    try {
      const result = await query(sql, [
        originalKeyword.toLowerCase().trim(), 
        context, 
        tenantId
      ]);
      if (result.rows[0]) {
        // Update usage stats
        await this._incrementUsage(result.rows[0].id);
        return result.rows[0];
      }
      return null;
    } catch (error) {
      logger.error('Repository error finding cached keyword expansion', { 
        error: error.message, 
        originalKeyword, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get all expansions for a tenant
   */
  static async findByTenant(tenantId, options = {}) {
    let sql = `
      SELECT * FROM ai_keyword_expansions
      WHERE tenant_id = $1 AND is_deleted = false
    `;
    const params = [tenantId];
    if (options.context) {
      sql += ` AND context = $${params.length + 1}`;
      params.push(options.context);
    }
    if (options.limit) {
      sql += ` ORDER BY usage_count DESC, last_used_at DESC LIMIT $${params.length + 1}`;
      params.push(options.limit);
    } else {
      sql += ` ORDER BY usage_count DESC, last_used_at DESC`;
    }
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error finding expansions by tenant', { 
        error: error.message, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Search expansions with tenant scoping
   */
  static async search(searchTerm, tenantId, options = {}) {
    let sql = `
      SELECT * FROM ai_keyword_expansions
      WHERE (tenant_id = $1 OR tenant_id IS NULL)
        AND is_deleted = false
        AND (
          original_keyword ILIKE $2
          OR expanded_keywords::text ILIKE $2
        )
    `;
    const params = [tenantId, `%${searchTerm}%`];
    if (options.context) {
      sql += ` AND context = $${params.length + 1}`;
      params.push(options.context);
    }
    sql += ` ORDER BY tenant_id DESC NULLS LAST, usage_count DESC`;
    if (options.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error searching keyword expansions', { 
        error: error.message, 
        searchTerm, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get popular keywords for tenant
   */
  static async getPopular(tenantId, options = {}) {
    let sql = `
      SELECT 
        original_keyword,
        context,
        usage_count,
        last_used_at,
        expanded_keywords
      FROM ai_keyword_expansions
      WHERE (tenant_id = $1 OR tenant_id IS NULL)
        AND is_deleted = false
        AND usage_count > 1
    `;
    const params = [tenantId];
    if (options.context) {
      sql += ` AND context = $${params.length + 1}`;
      params.push(options.context);
    }
    if (options.minUsage) {
      sql += ` AND usage_count >= $${params.length + 1}`;
      params.push(options.minUsage);
    }
    sql += ` ORDER BY usage_count DESC, last_used_at DESC`;
    if (options.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Repository error getting popular keywords', { 
        error: error.message, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Clear cache for tenant
   */
  static async clearTenantCache(tenantId) {
    const sql = `
      UPDATE ai_keyword_expansions
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND is_deleted = false
    `;
    try {
      const result = await query(sql, [tenantId]);
      return result.rowCount;
    } catch (error) {
      logger.error('Repository error clearing tenant cache', { 
        error: error.message, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Soft delete expansion
   */
  static async softDelete(expansionId, tenantId) {
    const sql = `
      UPDATE ai_keyword_expansions
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL) AND is_deleted = false
      RETURNING id
    `;
    try {
      const result = await query(sql, [expansionId, tenantId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Repository error soft deleting expansion', { 
        error: error.message, 
        expansionId, 
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
        COUNT(*) as total_expansions,
        COUNT(DISTINCT context) as unique_contexts,
        SUM(usage_count) as total_usage,
        AVG(usage_count) as avg_usage_per_expansion,
        MAX(last_used_at) as last_activity
      FROM ai_keyword_expansions
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
   * Private method to increment usage counter
   */
  static async _incrementUsage(expansionId) {
    const sql = `
      UPDATE ai_keyword_expansions
      SET 
        usage_count = usage_count + 1,
        last_used_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    try {
      await query(sql, [expansionId]);
    } catch (error) {
      logger.warn('Failed to increment usage counter', { 
        error: error.message, 
        expansionId 
      });
      // Don't throw - this is non-critical
    }
  }
}
module.exports = KeywordExpansionRepository;