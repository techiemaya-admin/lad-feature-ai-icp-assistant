/**
 * QueryClassifierService
 * ======================
 * Classifies an incoming natural-language lead-search query into one of four module types:
 *
 *   'abm'               → Specific person or company (Account-Based Marketing)
 *   'advanced_search'   → Multi-dimensional filters: 2+ of (job title / industry / location)
 *   'signal_detection'  → Behavioral signals: hiring, funding, product launches, posts, activity
 *   'competitor_intent' → Competitor or tech-stack mentions
 *
 * Classification strategy:
 *   1. LLM (Gemini) — single unified prompt handles ALL 4 module types + entity extraction
 *   2. Fallback: rule-based keyword patterns + heuristics (offline, < 1ms) used ONLY when LLM fails
 */

const logger = require('../../../core/utils/logger');

// Lazy-load geminiClient to avoid circular dependency issues at module load time
let _geminiClient = null;
function getGeminiClient() {
  if (!_geminiClient) _geminiClient = require('./gemini-client.service');
  return _geminiClient;
}

// ─── Heuristic Fallback Banks (used ONLY when LLM fails/times out) ───────────

const SIGNAL_PATTERNS_FALLBACK = [
  'posted', 'posting', 'published', 'wrote about', 'shared about',
  'commented on', 'active on linkedin', 'linkedin activity',
  'job opening', 'job posting', 'hiring for', 'we are hiring', 'looking to hire',
  'open position', 'open role', 'raised funding', 'raised a round',
  'series a', 'series b', 'series c', 'seed round', 'funding round',
  'acquired by', 'announced', 'launched product', 'product launch',
  'recently joined', 'just joined', 'new role at', 'started at', 'promoted to',
  'just promoted', 'expanding to', 'new office', 'opening office', 'reposted',
  'recent trip', 'abroad', 'travel', 'attended', 'event',
];

const COMPETITOR_PATTERNS_FALLBACK = [
  'people who use ', 'companies using ', 'using salesforce', 'using hubspot',
  'using zoho', 'using sap', 'using oracle', 'using pipedrive',
  'clients of ', 'customers of ', 'users of ',
  'switched from ', 'switching from ', 'moving away from ', 'leaving salesforce',
  'alternatives to ', 'compared to ', 'vs hubspot', 'vs salesforce',
  'replace salesforce', 'replace hubspot', 'replace sap',
  'evaluating salesforce', 'evaluating hubspot', 'evaluating crm',
  'salesforce competitor', 'hubspot competitor',
];

// Common English first names (top 200) — heuristic fallback
const COMMON_FIRST_NAMES = new Set([
  'james','john','robert','michael','william','david','richard','joseph','thomas','charles',
  'christopher','daniel','matthew','anthony','mark','donald','steven','paul','andrew','joshua',
  'kenneth','kevin','brian','george','edward','ronald','timothy','jason','jeffrey','ryan',
  'jacob','gary','nicholas','eric','jonathan','stephen','larry','justin','scott','brandon',
  'benjamin','samuel','raymond','gregory','frank','alexander','raymond','patrick','jack','dennis',
  'mary','patricia','jennifer','linda','barbara','elizabeth','susan','jessica','sarah','karen',
  'lisa','nancy','betty','margaret','sandra','ashley','dorothy','kimberly','emily','donna',
  'michelle','carol','amanda','melissa','deborah','stephanie','rebecca','sharon','laura','cynthia',
  'naveen','priya','amit','rahul','deepika','anjali','arjun','vikram','rohan','pooja',
  'fatima','omar','ali','ahmed','sara','layla','hassan','aisha','khalid','nour',
  'marina','alexei','ivan','olga','dmitri','anna','sofia','elena','nikolai','mikhail',
  'mei','wei','lin','yang','zhang','chen','liu','wang','li','zhao',
  'yuki','kenji','sakura','haruto','aiko','takeshi','hana','ryu','nori','kaito',
]);

// Predefined LinkedIn job title keywords (subset) for dimension counting
const JOB_TITLE_KEYWORDS = [
  'ceo','cto','cfo','coo','cmo','cpo','vp','vice president',
  'director','head of','manager','lead','senior','junior','associate',
  'founder','co-founder','partner','president','principal',
  'engineer','developer','designer','analyst','consultant','advisor',
  'sales','marketing','operations','finance','hr','legal','product',
  'recruiter','account executive','business development','bd',
];

// LinkedIn industry keywords for dimension counting
const INDUSTRY_KEYWORDS = [
  'healthcare','medical','hospital','pharma','pharmaceutical',
  'technology','tech','software','saas','fintech','edtech','proptech',
  'real estate','property','construction','architecture',
  'finance','banking','investment','insurance','accounting',
  'retail','ecommerce','e-commerce','fmcg','consumer goods',
  'manufacturing','industrial','engineering','automotive',
  'education','university','school','training',
  'hospitality','hotel','restaurant','food','beverage',
  'media','advertising','marketing agency','pr agency',
  'logistics','supply chain','transportation','shipping',
  'energy','oil','gas','renewable','solar','utilities',
  'legal','law firm','consulting','professional services',
  'nonprofit','ngo','government','public sector',
  'telecom','telecommunications','internet','network',
  'sports','fitness','wellness','beauty','fashion',
];

// Major world locations for dimension counting
const LOCATION_KEYWORDS = [
  'dubai','uae','abu dhabi','sharjah','riyadh','saudi','ksa','doha','qatar',
  'kuwait','bahrain','oman','jordan','egypt','lebanon',
  'india','mumbai','delhi','bangalore','hyderabad','chennai','pune',
  'usa','us','united states','new york','san francisco','chicago','los angeles','boston',
  'uk','united kingdom','london','manchester','birmingham',
  'germany','berlin','munich','frankfurt',
  'singapore','hong kong','australia','sydney','melbourne',
  'canada','toronto','vancouver',
  'france','paris','netherlands','amsterdam',
  'africa','nigeria','kenya','south africa',
  'gcc','mena','apac','emea','latam','global','worldwide','international',
];

// ─── Module Label Map ─────────────────────────────────────────────────────────

const MODULE_LABELS = {
  abm:               'Target Specific Account',
  advanced_search:   'Multi-Filter Lead Search',
  signal_detection:  'Intent Signal Search',
  competitor_intent: 'Competitor Prospect Search',
};

// ─── Classifier ───────────────────────────────────────────────────────────────

class QueryClassifierService {

  /**
   * Classify a natural-language query into a module type.
   *
   * @param {string} query  Raw user query from ChatPanel
   * @returns {Promise<{
   *   type: string,
   *   subtype: string|null,
   *   confidence: string,
   *   dimensions: object,
   *   module_label: string,
   *   detection_reasons: string[],
   *   llm_entities: { person_name: string|null, company_name: string|null, signal_keywords: string[], competitor_name: string|null }
   * }>}
   */
  static async classifyQuery(query) {
    if (!query || typeof query !== 'string') {
      return this._result('advanced_search', null, 'low', {}, ['empty_query']);
    }

    const msg   = query.toLowerCase().trim();
    const words = msg.split(/\s+/);
    const reasons = [];

    // ── Primary: Unified LLM classification (handles ALL 4 module types) ────────
    const llmResult = await this._classifyWithLLM(query);

    if (llmResult._source === 'llm') {
      const { module, subtype, confidence, person_name, company_name, signal_keywords, competitor_name } = llmResult;

      reasons.push(`llm_classified:${module}`, `confidence:${confidence}`);

      logger.info('[QueryClassifier] LLM classification', {
        query,
        module,
        subtype,
        confidence,
        person_name,
        company_name,
        signal_keywords,
        competitor_name,
      });

      const result = this._result(module, subtype || null, confidence, {}, reasons);
      result.llm_entities = {
        person_name:      person_name      || null,
        company_name:     company_name     || null,
        signal_keywords:  signal_keywords  || [],
        competitor_name:  competitor_name  || null,
        _source:          'llm',
      };
      return result;
    }

    // ── Fallback: rule-based heuristics (LLM failed / timed out) ─────────────────
    logger.warn('[QueryClassifier] LLM failed — using heuristic fallback', { query, error: llmResult._error });
    reasons.push('llm_failed', 'heuristic_fallback');

    // Fallback Priority 1: Competitor patterns
    for (const pattern of COMPETITOR_PATTERNS_FALLBACK) {
      if (msg.includes(pattern)) {
        reasons.push(`competitor_pattern:"${pattern}"`);
        const result = this._result('competitor_intent', null, 'medium', {}, reasons);
        result.llm_entities = { person_name: null, company_name: null, signal_keywords: [], competitor_name: null, _source: 'heuristic' };
        return result;
      }
    }

    // Fallback Priority 2: Signal patterns
    for (const pattern of SIGNAL_PATTERNS_FALLBACK) {
      if (msg.includes(pattern)) {
        reasons.push(`signal_pattern:"${pattern}"`);
        const result = this._result('signal_detection', null, 'medium', {}, reasons);
        result.llm_entities = { person_name: null, company_name: null, signal_keywords: [pattern], competitor_name: null, _source: 'heuristic' };
        return result;
      }
    }

    // Fallback Priority 3: ABM person/company detection
    const personDetected  = this._detectPersonName(msg, words);
    const companyDetected = this._detectCompanyName(msg);

    if (personDetected && companyDetected) {
      reasons.push('person_name_detected', 'company_name_detected');
      const result = this._result('abm', 'person_at_company', 'medium', {}, reasons);
      result.llm_entities = { person_name: null, company_name: null, signal_keywords: [], competitor_name: null, _source: 'heuristic' };
      return result;
    }
    if (companyDetected && !this._hasJobTitle(msg)) {
      reasons.push('company_name_detected', 'no_job_title');
      const result = this._result('abm', 'company_search', 'medium', {}, reasons);
      result.llm_entities = { person_name: null, company_name: null, signal_keywords: [], competitor_name: null, _source: 'heuristic' };
      return result;
    }
    if (personDetected && !companyDetected) {
      reasons.push('person_name_detected', 'no_company');
      const result = this._result('abm', 'person_search', 'low', {}, reasons);
      result.llm_entities = { person_name: null, company_name: null, signal_keywords: [], competitor_name: null, _source: 'heuristic' };
      return result;
    }

    // Fallback Priority 4: Multi-dimension advanced search
    const dims    = this._countDimensions(msg);
    const dimCount = Object.values(dims).filter(Boolean).length;
    if (dimCount >= 2) {
      reasons.push(`multi_dim:${Object.entries(dims).filter(([,v])=>v).map(([k])=>k).join('+')}`);
      const result = this._result('advanced_search', null, 'medium', dims, reasons);
      result.llm_entities = { person_name: null, company_name: null, signal_keywords: [], competitor_name: null, _source: 'heuristic' };
      return result;
    }

    // Final fallback
    reasons.push('no_strong_signal');
    const result = this._result('advanced_search', null, 'low', {}, reasons);
    result.llm_entities = { person_name: null, company_name: null, signal_keywords: [], competitor_name: null, _source: 'heuristic' };
    return result;
  }

  /**
   * Single unified LLM call that classifies the query AND extracts all relevant entities.
   *
   * Returns the full classification + entity extraction in one prompt, covering:
   *   - Module type (signal_detection, competitor_intent, abm, advanced_search)
   *   - ABM entity extraction (person_name, company_name)
   *   - Signal keyword extraction (what to search for on LinkedIn)
   *   - Competitor name extraction
   *
   * Uses a 4-second timeout so classification never blocks the request.
   */
  static async _classifyWithLLM(query) {
    const TIMEOUT_MS = 4000;

    try {
      const gemini = getGeminiClient();
      if (!gemini.isAvailable()) {
        return { _source: 'llm_unavailable', _error: 'Gemini not available' };
      }

      const prompt = `
You are a query classifier for a B2B lead generation system. Classify the user's search query into exactly one module and extract relevant entities.

MODULE DEFINITIONS:

1. "signal_detection" — User wants leads based on LinkedIn activity or behavioral signals:
   - Posting/publishing content about any topic
   - Commenting, sharing, reposting
   - Attending events, conferences, trips
   - Getting promoted, joining a new company
   - Company news: hiring, funding, product launch, expansion, acquisition
   Examples:
   - "leads who posted about their recent abroad trip" → signal_detection
   - "people who recently got promoted" → signal_detection
   - "founders posting about AI tools" → signal_detection
   - "companies that just raised funding" → signal_detection
   - "people who attended a conference recently" → signal_detection
   - "leads active on linkedin" → signal_detection

2. "competitor_intent" — User wants people using, evaluating, or switching from a specific tool/platform:
   Examples:
   - "people who use HubSpot" → competitor_intent
   - "companies switching from Salesforce" → competitor_intent
   - "clients of Oracle in healthcare" → competitor_intent

3. "abm" — User wants a specific named person or named company:
   Examples:
   - "naveen at techiemaya" → abm (person_at_company)
   - "find John Smith" → abm (person_search)
   - "people at Microsoft" → abm (company_search)

4. "advanced_search" — Generic search by job title, industry, location, or other standard filters:
   Examples:
   - "CEOs in Dubai fintech" → advanced_search
   - "sales directors in UAE real estate" → advanced_search
   - "founders in healthcare" → advanced_search

RULES:
- If the query mentions ANY kind of posting, sharing, activity, travel, event, job change, promotion, or company news → classify as "signal_detection"
- Extract signal_keywords as the key topics/actions to search for on LinkedIn (e.g. for "posted about abroad trip" → ["abroad trip", "travel", "international trip"])
- For abm, set subtype: "person_at_company" | "person_search" | "company_search"
- confidence: "high" if the intent is clear, "medium" if somewhat ambiguous, "low" if very vague

Input: "${query.replace(/"/g, '\\"')}"

Return ONLY valid JSON, no explanation:
{
  "module": "signal_detection|competitor_intent|abm|advanced_search",
  "subtype": "person_at_company|person_search|company_search|null",
  "confidence": "high|medium|low",
  "person_name": "full name or null",
  "company_name": "company name or null",
  "signal_keywords": ["keyword1", "keyword2"],
  "competitor_name": "competitor name or null"
}
`.trim();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('LLM classification timed out')), TIMEOUT_MS)
      );

      const raw = await Promise.race([
        gemini.generateContent(prompt, { maxTokens: 150 }),
        timeoutPromise,
      ]);

      // Strip markdown fences if present
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      // Validate module type
      const validModules = ['signal_detection', 'competitor_intent', 'abm', 'advanced_search'];
      if (!validModules.includes(parsed.module)) {
        throw new Error(`Invalid module: ${parsed.module}`);
      }

      // Normalise "null" strings to actual null
      const normalise = v => (!v || v === 'null' || v === '') ? null : v;

      return {
        _source:         'llm',
        module:          parsed.module,
        subtype:         normalise(parsed.subtype),
        confidence:      parsed.confidence || 'medium',
        person_name:     normalise(parsed.person_name),
        company_name:    normalise(parsed.company_name),
        signal_keywords: Array.isArray(parsed.signal_keywords) ? parsed.signal_keywords : [],
        competitor_name: normalise(parsed.competitor_name),
      };

    } catch (err) {
      logger.warn('[QueryClassifier] LLM classification failed', { error: err.message, query });
      return { _source: 'llm_failed', _error: err.message };
    }
  }

  /**
   * Generate refinement suggestions for low-confidence queries.
   */
  static generateRefinementSuggestions(query, extractedIntent = {}) {
    const suggestions = [];
    const { job_titles = [], industries = [], locations = [], company_names = [] } = extractedIntent;

    if (!locations.length) {
      suggestions.push(`${query} in Dubai`);
      suggestions.push(`${query} in United States`);
    }
    if (!job_titles.length && !company_names.length) {
      suggestions.push(`${query} — CEOs only`);
      suggestions.push(`${query} — Directors and above`);
    }
    if (!industries.length) {
      suggestions.push(`${query} in Healthcare`);
      suggestions.push(`${query} in Technology`);
    }
    if (!suggestions.length) {
      suggestions.push(`${query} — decision makers`);
      suggestions.push(`Find founders who ${query}`);
    }
    return suggestions.slice(0, 3);
  }

  /**
   * Return the human-readable label for a module type.
   */
  static getModuleLabel(type) {
    return MODULE_LABELS[type] || 'Lead Search';
  }

  // ─── Private helpers (used only in heuristic fallback path) ──────────────────

  static _result(type, subtype, confidence, dimensions, reasons) {
    return {
      type,
      subtype:           subtype || null,
      confidence,
      dimensions,
      module_label:      MODULE_LABELS[type],
      detection_reasons: reasons,
      llm_entities:      { person_name: null, company_name: null, signal_keywords: [], competitor_name: null, _source: 'none' },
    };
  }

  static _detectPersonName(msg, words) {
    const personPrefixes = ['find ', 'search for ', 'look for ', 'locate '];
    const personSuffixes = [' from ', ' at ', ' in ', ' who ', ' working at '];
    const genericStarts  = new Set(['find','get','show','search','look','give','fetch','list','identify','the','a','an']);

    for (const prefix of personPrefixes) {
      if (msg.startsWith(prefix)) {
        const rest = msg.slice(prefix.length).split(/\s+/)[0];
        if (COMMON_FIRST_NAMES.has(rest)) return true;
      }
    }
    for (const suffix of personSuffixes) {
      const idx = msg.indexOf(suffix);
      if (idx > 0) {
        const nameCandidate = msg.slice(0, idx).trim().split(/\s+/).slice(-2).join(' ');
        const firstName = nameCandidate.split(' ')[0];
        if (COMMON_FIRST_NAMES.has(firstName)) return true;
      }
    }
    for (let i = 0; i < Math.min(3, words.length); i++) {
      if (COMMON_FIRST_NAMES.has(words[i]) && !genericStarts.has(words[i])) return true;
    }
    for (const suffix of personSuffixes) {
      const idx = msg.indexOf(suffix);
      if (idx <= 0) continue;
      const before      = msg.slice(0, idx).trim();
      const beforeWords = before.split(/\s+/);
      if (beforeWords.length < 1 || beforeWords.length > 3) continue;
      const firstWord = beforeWords[0];
      if (genericStarts.has(firstWord)) continue;
      if (JOB_TITLE_KEYWORDS.some(kw => before.includes(kw))) continue;
      if (INDUSTRY_KEYWORDS.some(kw => before.includes(kw))) continue;
      if (LOCATION_KEYWORDS.includes(firstWord)) continue;
      if (before.length > 20) continue;
      return true;
    }
    return false;
  }

  static _detectCompanyName(msg) {
    const companyPrepositions = [' at ', ' from ', ' in ', ' @'];
    const fillers = new Set(['the','a','an','my','our','your','their','this','that','these','those']);
    for (const prep of companyPrepositions) {
      const idx = msg.indexOf(prep);
      if (idx >= 0) {
        const afterPrep = msg.slice(idx + prep.length).trim();
        const word = afterPrep.split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
        if (LOCATION_KEYWORDS.includes(word)) continue;
        if (fillers.has(word)) continue;
        if (word.length >= 3) return true;
      }
    }
    return false;
  }

  static _hasJobTitle(msg) {
    return JOB_TITLE_KEYWORDS.some(kw => msg.includes(kw));
  }

  static _countDimensions(msg) {
    return {
      job_title: JOB_TITLE_KEYWORDS.some(kw => msg.includes(kw)),
      industry:  INDUSTRY_KEYWORDS.some(kw => msg.includes(kw)),
      location:  LOCATION_KEYWORDS.some(kw => msg.includes(kw)),
    };
  }
}

module.exports = QueryClassifierService;
