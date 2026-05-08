/**
 * IntentAuditService
 * ==================
 * Cross-cutting audit logger for all lead intelligence searches.
 *
 * Every search — regardless of which module handles it — must call:
 *   IntentAuditService.log(tenantId, userId, payload)
 *
 * Failures are caught and logged but never bubble up to the caller
 * (audit must never break the main search flow).
 */

const logger             = require('../utils/logger');
const IntentAuditRepository = require('../repositories/IntentAuditRepository');

class IntentAuditService {

  /**
   * Create an audit record for an intent extraction + search event.
   *
   * @param {string} tenantId
   * @param {string} userId
   * @param {object} payload
   *   @param {string}  payload.originalQuery
   *   @param {object}  payload.classification   Output of QueryClassifierService.classifyQuery()
   *   @param {object}  payload.intent            Output of LinkedInSearchService.extractSearchIntent().intent
   *   @param {boolean} [payload.searchExecuted]
   *   @param {number}  [payload.resultCount]
   *   @param {number}  [payload.avgIcpScore]
   *   @param {number}  [payload.avgBuyIntentScore]
   *   @param {number}  [payload.topResultScore]
   *   @param {boolean} [payload.needsRefinement]
   *   @param {boolean} [payload.fallbackUsed]
   *   @param {number}  [payload.latencyMs]
   *   @param {string}  [payload.geminiModel]
   *   @param {number}  [payload.tokensUsed]
   * @returns {string|null}  UUID of the created audit row, or null on failure
   */
  static async log(tenantId, userId, payload) {
    try {
      const {
        originalQuery,
        classification = {},
        intent = {},
        searchExecuted     = false,
        resultCount        = null,
        avgIcpScore        = null,
        avgBuyIntentScore  = null,
        topResultScore     = null,
        needsRefinement    = false,
        fallbackUsed       = false,
        latencyMs          = null,
        geminiModel        = process.env.GOOGLE_MODEL || 'gemini-2.5-flash',
        tokensUsed         = null,
      } = payload;

      const row = await IntentAuditRepository.create({
        tenant_id:                tenantId,
        user_id:                  userId,
        original_query:           originalQuery,
        preprocessed_query:       originalQuery?.trim(),
        query_type:               classification.type || 'advanced_search',
        classification_confidence: classification.confidence === 'high' ? 0.9
                                 : classification.confidence === 'medium' ? 0.65 : 0.4,
        classifier_version:       '1.0',
        extracted_intent:         intent,
        confidence_score:         intent.confidence_score ?? 0,
        confidence_level:         intent.confidence_level || 'low',
        extraction_flags:         intent.extraction_flags || [],
        ambiguities_detected:     intent.ambiguities_detected || false,
        routed_to_module:         classification.type || 'advanced_search',
        fallback_used:            fallbackUsed,
        search_executed:          searchExecuted,
        result_count:             resultCount,
        avg_icp_score:            avgIcpScore,
        avg_buy_intent_score:     avgBuyIntentScore,
        top_result_score:         topResultScore,
        needs_refinement:         needsRefinement,
        llm_provider:             process.env.LLM_PROVIDER || 'google',
        gemini_model:             geminiModel,
        tokens_used:              tokensUsed,
        latency_ms:               latencyMs,
      });

      logger.info('[IntentAuditService] Audit row created', {
        auditId:    row?.id,
        tenantId,
        module:     classification.type,
        confidence: intent.confidence_level,
        latencyMs,
      });

      return row?.id || null;

    } catch (err) {
      // Audit failures must NEVER break the main search flow
      logger.warn('[IntentAuditService] Failed to write audit log (non-fatal)', {
        error:    err.message,
        tenantId,
        query:    payload?.originalQuery?.substring(0, 100),
      });
      return null;
    }
  }

  /**
   * Update an audit record after the search result is available.
   * Call this once leads are returned to the user.
   *
   * @param {string} auditId
   * @param {object} resultPatch
   */
  static async updateWithResults(auditId, resultPatch) {
    if (!auditId) return;
    try {
      await IntentAuditRepository.update(auditId, resultPatch);
    } catch (err) {
      logger.warn('[IntentAuditService] Failed to update audit row', { error: err.message, auditId });
    }
  }

  /**
   * Get aggregated statistics for an analytics dashboard.
   *
   * @param {string} tenantId
   * @param {string} timeRange  '7d' | '30d' | '90d'
   */
  static async getStatistics(tenantId, timeRange = '30d') {
    try {
      const raw = await IntentAuditRepository.getStatistics(tenantId, timeRange);
      if (!raw) return null;

      const total = Number(raw.total_extractions) || 1; // avoid div/0

      return {
        time_range:        timeRange,
        total_extractions: Number(raw.total_extractions),
        avg_confidence:    Number(raw.avg_confidence),
        avg_latency_ms:    Number(raw.avg_latency_ms),
        avg_result_count:  Number(raw.avg_result_count),

        confidence_distribution: {
          high:   { count: Number(raw.high_confidence_count),   pct: Math.round(Number(raw.high_confidence_count)   / total * 100) },
          medium: { count: Number(raw.medium_confidence_count), pct: Math.round(Number(raw.medium_confidence_count) / total * 100) },
          low:    { count: Number(raw.low_confidence_count),    pct: Math.round(Number(raw.low_confidence_count)    / total * 100) },
        },

        module_distribution: {
          abm:               { count: Number(raw.abm_count),               pct: Math.round(Number(raw.abm_count)               / total * 100) },
          advanced_search:   { count: Number(raw.advanced_search_count),   pct: Math.round(Number(raw.advanced_search_count)   / total * 100) },
          signal_detection:  { count: Number(raw.signal_detection_count),  pct: Math.round(Number(raw.signal_detection_count)  / total * 100) },
          competitor_intent: { count: Number(raw.competitor_intel_count),  pct: Math.round(Number(raw.competitor_intel_count)  / total * 100) },
        },

        search_execution_rate: Math.round(Number(raw.searches_executed) / total * 100),
        query_refinement_rate: Math.round(Number(raw.queries_refined)   / total * 100),
      };
    } catch (err) {
      logger.error('[IntentAuditService] getStatistics error', { error: err.message, tenantId });
      return null;
    }
  }

  /**
   * List recent audit entries for a tenant.
   */
  static async listRecent(tenantId, limit = 50) {
    try {
      return await IntentAuditRepository.listRecent(tenantId, limit);
    } catch (err) {
      logger.error('[IntentAuditService] listRecent error', { error: err.message, tenantId });
      return [];
    }
  }
}

module.exports = IntentAuditService;
