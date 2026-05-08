/**
 * GenericProspectSearchService
 *
 * Handles intent-based prospect searches like:
 *   "get me decision makers in hotels with swimming pools in Dubai"
 *   "find GMs at 5-star resorts in Abu Dhabi"
 *
 * Flow:
 *  1. Claude (Anthropic) parses the query + tenant ICP → discovers specific real companies
 *     and the most relevant decision maker titles/names for each.
 *  2. Serper enriches each company with website, address, phone number.
 *  3. Person discovery waterfall (Unipile search → Serper x-ray → Apollo people match)
 *     to resolve the LinkedIn profile URL.
 *  4. Unipile profile extraction: contact details, summary, recent posts.
 *  5. Web presence generation via ProspectWebEnrichmentService.
 *  6. ICP scoring via ICPLeadQualificationService.
 *
 * Pagination:
 *  The caller passes `seenIds` (LinkedIn URLs / provider IDs already returned) so
 *  "Get More Leads" rounds can extend the result set without duplicates.
 */

const AnthropicService = require('../../../core/services/AnthropicService');
const logger = require('../utils/logger');

// Safety-net: max results Claude should suggest per call
const MAX_TARGETS_PER_CALL = 20;

class GenericProspectSearchService {
  /**
   * Main entry point.
   *
   * @param {Object} params
   * @param {string} params.query         - User's natural language query
   * @param {Object} params.icpProfile    - Tenant ICP profile (from ai_icp_profiles)
   * @param {string} params.tenantId
   * @param {string[]} params.seenIds     - LinkedIn URLs / provider IDs already shown (for dedup)
   * @param {number} params.batchSize     - How many unique prospects to return (default 10)
   * @returns {Promise<{prospects, total, hasMore, discoveredTargets}>}
   */
  async search({ query, icpProfile, tenantId, seenIds = [], batchSize = 10 }) {
    logger.info('[GenericProspectSearch] Starting', {
      query: query.substring(0, 120),
      seenCount: seenIds.length,
      batchSize,
    });

    // ── Step 1: Claude discovers specific companies + decision makers ────────────
    const targets = await this._discoverTargets(query, icpProfile, seenIds);
    if (!targets || targets.length === 0) {
      logger.warn('[GenericProspectSearch] Claude returned no targets', { query });
      return { prospects: [], total: 0, hasMore: false, discoveredTargets: 0 };
    }
    logger.info('[GenericProspectSearch] Targets discovered', { count: targets.length });

    // ── Step 2: Resolve tenant's Unipile/LinkedIn account ───────────────────────
    let unipileAccountId = null;
    try {
      const LinkedInIntegrationService = require('../../campaigns/services/LinkedInIntegrationService');
      const accounts = await LinkedInIntegrationService.getUserLinkedInAccounts(tenantId);
      if (accounts && accounts.length > 0) {
        unipileAccountId = accounts[0].unipileAccountId || accounts[0].provider_account_id;
      }
    } catch (e) {
      logger.warn('[GenericProspectSearch] Could not resolve LinkedIn account', { error: e.message });
    }

    // ── Step 3: Enrich each target (parallel, batches of 3 to avoid rate limits) ─
    const seenSet = new Set(seenIds.map(s => (s || '').toLowerCase().replace(/\/$/, '')));
    const prospects = [];

    for (let i = 0; i < targets.length && prospects.length < batchSize; i += 3) {
      const batch = targets.slice(i, i + 3);
      const settled = await Promise.allSettled(
        batch.map(t => this._enrichTarget(t, unipileAccountId, icpProfile))
      );

      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) {
          const p = r.value;
          const key = (p.profile_url || `${p.name}__${p.current_company}`).toLowerCase().replace(/\/$/, '');
          if (!seenSet.has(key)) {
            seenSet.add(key);
            prospects.push(p);
            if (prospects.length >= batchSize) break;
          }
        } else if (r.status === 'rejected') {
          logger.warn('[GenericProspectSearch] Enrichment rejected', { reason: r.reason?.message });
        }
      }
    }

    logger.info('[GenericProspectSearch] Complete', {
      targets: targets.length,
      enriched: prospects.length,
    });

    return {
      prospects,
      total: targets.length,
      hasMore: targets.length > batchSize,
      discoveredTargets: targets.length,
    };
  }

  // ─── Private: Claude discovery ──────────────────────────────────────────────

  async _discoverTargets(query, icpProfile, seenIds = []) {
    const icpCtx = icpProfile ? `
## Tenant's ICP (Ideal Customer Profile)
- Company Name: ${icpProfile.companyName || 'Not set'}
- Products/Services: ${icpProfile.productsServices || 'Not set'}
- Value Proposition: ${icpProfile.valueProposition || 'Not set'}
- Target Customers: ${icpProfile.targetCustomers || 'Not set'}
- Target Job Titles: ${(icpProfile.icpJobTitles || []).join(', ') || 'Not set'}
- Target Industries: ${icpProfile.industry || 'Not set'}
- Geographic Focus: ${icpProfile.geographicFocus || 'Not set'}
- Campaign Tone: ${icpProfile.campaignTone || 'Professional'}` : '';

    const seenHint = seenIds.length > 0
      ? `\n## Already found (EXCLUDE these companies/people):\n${seenIds.slice(0, 30).join('\n')}`
      : '';

    const systemPrompt = `You are a B2B prospect research specialist. Your task is to identify specific REAL companies and their key decision makers that match a user's search query and their ICP.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "targets": [
    {
      "company_name": "Exact legal/trading name",
      "company_type": "Category (e.g. 5-star hotel, hospital, construction firm)",
      "company_website": "https://... or null",
      "company_address": "Full address or city at minimum, or null",
      "company_phone": "+971... or null",
      "company_linkedin_url": "https://linkedin.com/company/... or null",
      "location": "City, Country",
      "decision_maker_title": "Most relevant title that would buy this tenant's product",
      "decision_maker_name": "Full name of actual person if known, or null",
      "decision_maker_email_pattern": "firstname.lastname@domain.com format guess, or null",
      "notes": "Brief context about company (size, stars, notable facts)"
    }
  ]
}

RULES:
1. Return 15-20 SPECIFIC, REAL named companies — NOT generic categories
2. Pick the decision maker title most likely to purchase the tenant's offering
3. Include the person's actual name ONLY if you are confident it is accurate (you know the GM/Director etc.)
4. Phone numbers should be the main company switchboard
5. Company websites should be real, not guesses
6. Prioritize companies that are most likely to need the tenant's product/service${seenHint}`;

    const userPrompt = `Search Query: "${query}"
${icpCtx}

Return ${MAX_TARGETS_PER_CALL} specific real companies matching the query, with their most relevant decision makers.`;

    try {
      const raw = await AnthropicService.generateMessage(userPrompt, {
        systemPrompt,
        maxTokens: 5000,
        temperature: 0.2, // Low temperature for factual company discovery
      });
      const parsed = AnthropicService.parseJsonResponse(raw);
      return (parsed.targets || []).slice(0, MAX_TARGETS_PER_CALL);
    } catch (err) {
      logger.error('[GenericProspectSearch] Claude discovery failed', { error: err.message });
      return [];
    }
  }

  // ─── Private: Enrich a single target ────────────────────────────────────────

  async _enrichTarget(target, unipileAccountId, icpProfile) {
    const {
      company_name,
      decision_maker_title,
      location,
    } = target;

    let personName     = target.decision_maker_name || null;
    let companyPhone   = target.company_phone || null;
    let companyAddress = target.company_address || null;
    let companyWebsite = target.company_website || null;
    let linkedInUrl    = null;

    // ── 1a: Serper search — fill in missing person name / company details ──────
    if (!personName || !companyPhone || !companyAddress) {
      const serperData = await this._serperEnrichCompany(decision_maker_title, company_name, location);
      if (serperData) {
        if (!personName && serperData.person_name)       personName     = serperData.person_name;
        if (!companyPhone && serperData.company_phone)   companyPhone   = serperData.company_phone;
        if (!companyAddress && serperData.address)       companyAddress = serperData.address;
        if (!companyWebsite && serperData.website)       companyWebsite = serperData.website;
      }
    }

    // ── 1b: If still no person name, fall back to title placeholder ──────────
    if (!personName) {
      personName = `${decision_maker_title} at ${company_name}`;
    }

    const nameParts  = personName.split(' ');
    const firstName  = nameParts[0] || '';
    const lastName   = nameParts.slice(1).join(' ') || '';
    const isRealName = personName !== `${decision_maker_title} at ${company_name}`;

    // ── 2: LinkedIn URL discovery waterfall ───────────────────────────────────
    if (isRealName && unipileAccountId) {
      linkedInUrl = await this._findLinkedInViaUnipile(personName, company_name, unipileAccountId);
    }
    if (!linkedInUrl && isRealName) {
      linkedInUrl = await this._findLinkedInViaSerper(personName, company_name);
    }
    if (!linkedInUrl && isRealName) {
      linkedInUrl = await this._findLinkedInViaApollo(firstName, lastName, company_name);
    }

    // ── 3: Unipile profile fetch (contact details, summary, posts) ────────────
    let unipileProfile = null;
    if (linkedInUrl && unipileAccountId) {
      unipileProfile = await this._fetchUnipileProfile(linkedInUrl, unipileAccountId);
    }

    // Pull phone/email from Unipile profile if available
    const resolvedPhone = (unipileProfile?.phone) || companyPhone || null;
    const resolvedEmail = (unipileProfile?.email) || target.decision_maker_email_pattern || null;

    // ── 4: Web presence (async-fire, non-blocking) ────────────────────────────
    let webPresence = null;
    if (isRealName && company_name) {
      webPresence = await this._generateWebPresence(personName, company_name);
    }

    // ── 5: Build prospect object ──────────────────────────────────────────────
    const id = `gps-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const prospect = {
      id,
      name:            personName,
      first_name:      firstName,
      last_name:       lastName,
      headline:        decision_maker_title,
      location:        location || '',
      current_company: company_name,
      profile_url:     linkedInUrl || '',
      profile_picture: unipileProfile?.profile_picture || '',
      industry:        target.company_type || '',
      network_distance: '',
      phone:           resolvedPhone || '',
      email:           resolvedEmail || '',
      company_website: companyWebsite || '',
      company_address: companyAddress || '',
      company_phone:   companyPhone || '',
      company_linkedin_url: target.company_linkedin_url || '',
      discovery_notes: target.notes || '',
      source:          'generic_prospect_search',
      enriched_profile: unipileProfile ? {
        summary:    unipileProfile.summary    || null,
        experience: unipileProfile.experience || [],
        education:  unipileProfile.education  || [],
        skills:     unipileProfile.skills     || [],
        posts:      unipileProfile.recentPosts || unipileProfile.posts || [],
      } : null,
      web_presence: webPresence,
    };

    // ── 6: ICP scoring ───────────────────────────────────────────────────────
    if (icpProfile) {
      try {
        const ICPService   = require('../../campaigns/services/ICPLeadQualificationService');
        const icpDesc      = this._buildIcpDescription(icpProfile);
        const enrichedArr  = unipileProfile ? [unipileProfile] : [null];
        const scored       = await ICPService.qualifyLeads([prospect], enrichedArr, icpDesc, {});
        if (scored && scored.length > 0) {
          prospect.icp_score    = scored[0].icp_score;
          prospect.match_level  = scored[0].match_level;
          prospect.icp_reasoning = scored[0].icp_reasoning;
        }
      } catch (icpErr) {
        logger.warn('[GenericProspectSearch] ICP scoring failed', { error: icpErr.message, company: company_name });
      }
    }

    return prospect;
  }

  // ─── Private: Serper company enrichment ─────────────────────────────────────

  async _serperEnrichCompany(title, company, location) {
    try {
      const GoogleSearchService = require('../../campaigns/services/GoogleSearchService');
      const gs = new GoogleSearchService();
      if (!gs.isAvailable()) return null;

      const query = `"${title}" "${company}" ${location || ''}`;
      const { organic, knowledgeGraph } = await gs.searchWithContext(query, 5);
      if (organic.length === 0 && !knowledgeGraph) return null;

      const snippets = organic.slice(0, 5).map(r => `Title: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}`).join('\n\n');
      const kgText   = knowledgeGraph ? `\nKnowledge Graph: ${JSON.stringify(knowledgeGraph).substring(0, 600)}` : '';

      const extractPrompt = `From these search results about the "${title}" at "${company}" in ${location || ''}, extract available details.

${snippets}${kgText}

Return ONLY JSON (null for any field not found):
{
  "person_name": "Full name of the ${title} if mentioned",
  "company_phone": "Main switchboard or direct phone number",
  "address": "Full street address or at minimum city",
  "website": "Company website URL"
}`;

      const raw    = await AnthropicService.generateMessage(extractPrompt, { maxTokens: 300, temperature: 0 });
      const parsed = AnthropicService.parseJsonResponse(raw);
      return parsed;
    } catch (e) {
      logger.debug('[GenericProspectSearch] Serper company enrichment failed', { error: e.message });
      return null;
    }
  }

  // ─── Private: LinkedIn URL discovery ────────────────────────────────────────

  async _findLinkedInViaUnipile(name, company, accountId) {
    try {
      const UnipileBaseService = require('../../campaigns/services/UnipileBaseService');
      const base   = new UnipileBaseService();
      const result = await base.searchLinkedInProfile(name, company, accountId);
      if (result.success && result.topMatch) {
        const match    = result.topMatch;
        const publicId = match.public_identifier || match.publicIdentifier;
        if (publicId) return `https://www.linkedin.com/in/${publicId}`;
        if (match.profile_url || match.profileUrl) return match.profile_url || match.profileUrl;
      }
    } catch (e) {
      logger.debug('[GenericProspectSearch] Unipile LinkedIn search failed', { error: e.message });
    }
    return null;
  }

  async _findLinkedInViaSerper(name, company) {
    try {
      const GoogleSearchService = require('../../campaigns/services/GoogleSearchService');
      const gs = new GoogleSearchService();
      if (!gs.isAvailable()) return null;

      const query   = `site:linkedin.com/in/ "${name}" "${company}"`;
      const results = await gs.search(query, 3);
      for (const r of results) {
        if (r.link && r.link.includes('linkedin.com/in/')) {
          return r.link.split('?')[0].replace(/\/$/, '');
        }
      }
    } catch (e) {
      logger.debug('[GenericProspectSearch] Serper LinkedIn x-ray failed', { error: e.message });
    }
    return null;
  }

  async _findLinkedInViaApollo(firstName, lastName, company) {
    try {
      const ApolloApiService = require('../../apollo-leads/services/ApolloApiService');
      const result = await ApolloApiService.callApolloService('people_match', {
        first_name:        firstName,
        last_name:         lastName,
        organization_name: company,
      });
      if (result?.person?.linkedin_url) return result.person.linkedin_url;
    } catch (e) {
      logger.debug('[GenericProspectSearch] Apollo LinkedIn lookup failed', { error: e.message });
    }
    return null;
  }

  // ─── Private: Unipile full profile fetch ────────────────────────────────────

  async _fetchUnipileProfile(linkedInUrl, accountId) {
    try {
      const unipileService = require('../../campaigns/services/unipileService');
      const contactDetails = await unipileService.profile.getLinkedInContactDetails(linkedInUrl, accountId);
      if (contactDetails && contactDetails.success !== false) {
        return contactDetails;
      }
    } catch (e) {
      logger.debug('[GenericProspectSearch] Unipile profile fetch failed', { error: e.message });
    }
    return null;
  }

  // ─── Private: Web presence generation ───────────────────────────────────────

  async _generateWebPresence(name, company) {
    try {
      const ProspectWebEnrichmentService = require('../../campaigns/services/ProspectWebEnrichmentService');
      if (typeof ProspectWebEnrichmentService.enrich === 'function') {
        return await ProspectWebEnrichmentService.enrich(name, company);
      }
    } catch (e) {
      logger.debug('[GenericProspectSearch] Web presence failed', { error: e.message });
    }
    return null;
  }

  // ─── Private: Build ICP description string ──────────────────────────────────

  _buildIcpDescription(icpProfile) {
    if (!icpProfile) return '';
    const parts = [];
    if (icpProfile.companyName)       parts.push(`We are ${icpProfile.companyName}`);
    if (icpProfile.productsServices)  parts.push(`offering ${icpProfile.productsServices}`);
    if (icpProfile.valueProposition)  parts.push(`value proposition: ${icpProfile.valueProposition}`);
    if (icpProfile.targetCustomers)   parts.push(`targeting ${icpProfile.targetCustomers}`);
    if ((icpProfile.icpJobTitles || []).length) parts.push(`key titles: ${icpProfile.icpJobTitles.join(', ')}`);
    if (icpProfile.industry)          parts.push(`industry: ${icpProfile.industry}`);
    if ((icpProfile.icpPainPoints || []).length) parts.push(`pain points: ${icpProfile.icpPainPoints.join(', ')}`);
    return parts.join('. ');
  }
}

module.exports = new GenericProspectSearchService();
