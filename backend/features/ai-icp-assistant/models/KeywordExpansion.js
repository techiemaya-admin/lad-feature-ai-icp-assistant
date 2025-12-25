/**
 * Keyword Expansion Model
 * 
 * Manages cached keyword expansions for performance optimization
 */

const { query } = require('../../../shared/database/connection');

class KeywordExpansion {
  /**
   * Create or update keyword expansion cache
   */
  static async upsert({
    originalKeyword,
    expandedKeywords,
    context = 'general',
    model = null,
    organizationId = null
  }) {
    try {
      const result = await query(`
        INSERT INTO ai_keyword_expansions (
          original_keyword,
          expanded_keywords,
          context,
          model,
          organization_id,
          usage_count,
          last_used_at
        ) VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP)
        ON CONFLICT (original_keyword, context, organization_id)
        DO UPDATE SET
          expanded_keywords = EXCLUDED.expanded_keywords,
          model = EXCLUDED.model,
          usage_count = ai_keyword_expansions.usage_count + 1,
          last_used_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [
        originalKeyword.toLowerCase().trim(),
        JSON.stringify(expandedKeywords),
        context,
        model,
        organizationId
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error upserting keyword expansion:', error);
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
      console.error('Error finding cached keyword expansion:', error);
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
      console.error('Error finding organization keyword expansions:', error);
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
      console.error('Error getting most used keywords:', error);
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
      console.error('Error searching keyword expansions:', error);
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
      console.error('Error pruning old keyword expansions:', error);
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
      console.error('Error getting keyword expansion stats:', error);
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
      console.error('Error deleting keyword expansion:', error);
      throw error;
    }
  }
}

module.exports = KeywordExpansion;
