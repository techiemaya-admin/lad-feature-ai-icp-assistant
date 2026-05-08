/**
 * IntentAuditRepository
 * =====================
 * Data-access layer for intent_extraction_audits table.
 * All SQL lives here — no business logic.
 */

const { query, schema } = require('../utils/database');
const logger = require('../utils/logger');

class IntentAuditRepository {

  /**
   * Insert a new audit record.
   * @param {object} data  Matches intent_extraction_audits column set
   * @returns {object}     Inserted row
   */
  static async create(data) {
    const sql = `
      INSERT INTO ${schema}.intent_extraction_audits (
        tenant_id, user_id,
        original_query, preprocessed_query,
        query_type, classification_confidence, classifier_version,
        extracted_intent,
        confidence_score, confidence_level, extraction_flags, ambiguities_detected,
        routed_to_module, fallback_used,
        search_executed, result_count, avg_icp_score, avg_buy_intent_score, top_result_score,
        needs_refinement, user_refined_query, refined_query,
        llm_provider, gemini_model, tokens_used, latency_ms
      ) VALUES (
        $1,  $2,
        $3,  $4,
        $5,  $6,  $7,
        $8,
        $9,  $10, $11, $12,
        $13, $14,
        $15, $16, $17, $18, $19,
        $20, $21, $22,
        $23, $24, $25, $26
      )
      RETURNING *
    `;

    const values = [
      data.tenant_id,
      data.user_id || null,
      data.original_query,
      data.preprocessed_query || null,
      data.query_type,
      data.classification_confidence ?? null,
      data.classifier_version || '1.0',
      JSON.stringify(data.extracted_intent || {}),
      data.confidence_score ?? 0,
      data.confidence_level || 'low',
      data.extraction_flags || [],
      data.ambiguities_detected || false,
      data.routed_to_module,
      data.fallback_used || false,
      data.search_executed || false,
      data.result_count ?? null,
      data.avg_icp_score ?? null,
      data.avg_buy_intent_score ?? null,
      data.top_result_score ?? null,
      data.needs_refinement || false,
      data.user_refined_query || false,
      data.refined_query || null,
      data.llm_provider || 'google',
      data.gemini_model || null,
      data.tokens_used ?? null,
      data.latency_ms ?? null,
    ];

    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Update an existing audit record (e.g. after search completes).
   * @param {string} id    UUID of audit row
   * @param {object} patch Partial update — only provided fields are updated
   */
  static async update(id, patch) {
    const allowed = [
      'search_executed', 'result_count', 'avg_icp_score',
      'avg_buy_intent_score', 'top_result_score',
      'user_refined_query', 'refined_query',
      'user_accepted_results', 'leads_added_to_campaign',
      'latency_ms',
    ];

    const sets   = [];
    const values = [];
    let   idx    = 1;

    for (const key of allowed) {
      if (key in patch) {
        sets.push(`${key} = $${idx++}`);
        values.push(patch[key]);
      }
    }

    if (!sets.length) return null;

    values.push(id);
    const sql = `
      UPDATE ${schema}.intent_extraction_audits
      SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = await query(sql, values);
    return result.rows[0] || null;
  }

  /**
   * Aggregate statistics for a tenant over a rolling window.
   * @param {string} tenantId
   * @param {string} timeRange  e.g. '7d', '30d', '90d'
   */
  static async getStatistics(tenantId, timeRange = '30d') {
    const interval = timeRange.replace(/d$/, '') + ' days';
    const sql = `
      SELECT
        COUNT(*)                                           AS total_extractions,
        AVG(confidence_score)::NUMERIC(4,3)               AS avg_confidence,
        COUNT(*) FILTER (WHERE confidence_level = 'high')  AS high_confidence_count,
        COUNT(*) FILTER (WHERE confidence_level = 'medium') AS medium_confidence_count,
        COUNT(*) FILTER (WHERE confidence_level = 'low')   AS low_confidence_count,
        COUNT(*) FILTER (WHERE routed_to_module = 'abm')              AS abm_count,
        COUNT(*) FILTER (WHERE routed_to_module = 'advanced_search')  AS advanced_search_count,
        COUNT(*) FILTER (WHERE routed_to_module = 'signal_detection') AS signal_detection_count,
        COUNT(*) FILTER (WHERE routed_to_module = 'competitor_intent') AS competitor_intel_count,
        COUNT(*) FILTER (WHERE search_executed = true)   AS searches_executed,
        COUNT(*) FILTER (WHERE user_refined_query = true) AS queries_refined,
        AVG(result_count)::NUMERIC(8,2)                   AS avg_result_count,
        AVG(latency_ms)::NUMERIC(8,2)                     AS avg_latency_ms
      FROM ${schema}.intent_extraction_audits
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '${interval}'
    `;

    const result = await query(sql, [tenantId]);
    return result.rows[0];
  }

  /**
   * Get recent audit entries for a tenant.
   */
  static async listRecent(tenantId, limit = 50) {
    const sql = `
      SELECT id, original_query, query_type, confidence_level, confidence_score,
             routed_to_module, search_executed, result_count, latency_ms, created_at
      FROM ${schema}.intent_extraction_audits
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await query(sql, [tenantId, limit]);
    return result.rows;
  }
}

module.exports = IntentAuditRepository;
