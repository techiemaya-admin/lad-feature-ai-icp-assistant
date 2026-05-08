/**
 * ProspectSearchController
 *
 * Handles POST /api/ai-icp-assistant/prospect-search
 *
 * Takes a generic natural-language query (e.g. "decision makers in hotels
 * with swimming pools in Dubai") and returns a paginated list of enriched
 * prospect profiles discovered via Claude + Serper + Unipile + Apollo.
 *
 * Credit cost: PROSPECT_SEARCH_CREDITS per call (default 5).
 */

const GenericProspectSearchService = require('../services/GenericProspectSearchService');
const { deductCredits, refundCredits } = require('../../../shared/middleware/credit_guard');
const logger = require('../utils/logger');

// Credits deducted per search call (configurable via billing_pricing_catalog)
const PROSPECT_SEARCH_CREDITS = parseInt(process.env.PROSPECT_SEARCH_CREDITS || '5', 10);

const ProspectSearchController = {
  /**
   * POST /api/ai-icp-assistant/prospect-search
   *
   * Body:
   *   query        {string}   - Natural language search query
   *   icpProfile   {Object}   - Tenant ICP data (optional — loaded from DB if omitted)
   *   sessionId    {string}   - Opaque session identifier for tracking
   *   seenIds      {string[]} - LinkedIn URLs / provider IDs already returned (for dedup)
   *   batchSize    {number}   - How many prospects to return (default 10, max 20)
   */
  async search(req, res) {
    const tenantId  = req.user?.tenantId || req.user?.organizationId;
    const {
      query,
      icpProfile: clientIcpProfile,
      sessionId,
      seenIds   = [],
      batchSize = 10,
    } = req.body;

    if (!query || !String(query).trim()) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorised — tenant ID missing' });
    }

    // ── Load ICP from DB if client didn't send it ──────────────────────────────
    let icpProfile = clientIcpProfile;
    if (!icpProfile || Object.keys(icpProfile).length === 0) {
      try {
        const { query: dbQuery, schema: dbSchema } = require('../utils/database');
        const r = await dbQuery(
          `SELECT icp_data FROM ${dbSchema}.ai_icp_profiles
           WHERE tenant_id = $1 AND is_active = true AND is_deleted = false
           ORDER BY updated_at DESC LIMIT 1`,
          [tenantId]
        );
        if (r.rows.length) {
          const d = r.rows[0].icp_data;
          icpProfile = typeof d === 'string' ? JSON.parse(d) : d;
          logger.info('[ProspectSearch] Loaded ICP from DB', { tenantId, keys: Object.keys(icpProfile || {}).length });
        }
      } catch (dbErr) {
        logger.warn('[ProspectSearch] Could not load ICP from DB', { error: dbErr.message });
      }
    }

    // ── Deduct credits BEFORE processing (fail-fast if balance insufficient) ───
    let creditsDeducted = false;
    try {
      await deductCredits(
        tenantId,
        'ai-icp-assistant',
        'prospect_search',
        PROSPECT_SEARCH_CREDITS,
        req,
        { query: query.substring(0, 100) }
      );
      creditsDeducted = true;
    } catch (creditErr) {
      // Insufficient credits or billing error
      if (creditErr.message?.includes('Insufficient')) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits',
          message: `This search costs ${PROSPECT_SEARCH_CREDITS} credits. Please top up your account.`,
          creditsRequired: PROSPECT_SEARCH_CREDITS,
        });
      }
      logger.warn('[ProspectSearch] Credit deduction failed (non-blocking)', { error: creditErr.message });
      // Allow through in soft-fail mode (non-blocking billing)
    }

    // ── Run the search ─────────────────────────────────────────────────────────
    try {
      const capped = Math.min(Math.max(parseInt(batchSize, 10) || 10, 1), 20);
      const result = await GenericProspectSearchService.search({
        query:     String(query).trim(),
        icpProfile,
        tenantId,
        seenIds:   Array.isArray(seenIds) ? seenIds : [],
        batchSize: capped,
      });

      return res.json({
        success:          true,
        results:          result.prospects,
        total:            result.total,
        hasMore:          result.hasMore,
        discoveredTargets: result.discoveredTargets,
        sessionId:        sessionId || `gps-${Date.now()}`,
        creditsUsed:      PROSPECT_SEARCH_CREDITS,
        searchType:       'generic_prospect',
      });
    } catch (err) {
      logger.error('[ProspectSearch] Search failed', { error: err.message, tenantId, query });

      // Refund credits if search completely failed
      if (creditsDeducted) {
        try {
          await refundCredits(tenantId, 'prospect_search', PROSPECT_SEARCH_CREDITS, req, 'Search processing failed');
        } catch (refundErr) {
          logger.warn('[ProspectSearch] Credit refund failed', { error: refundErr.message });
        }
      }

      return res.status(500).json({
        success: false,
        error:   'Prospect search failed — please try again',
        detail:  process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  },
};

module.exports = ProspectSearchController;
