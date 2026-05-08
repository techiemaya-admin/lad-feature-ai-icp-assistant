/**
 * LeadChatService
 *
 * Conversational AI service for the Advanced Search AI chat page.
 * Handles follow-up questions about leads, campaigns, and targeting refinement.
 * Uses Gemini AI to detect user intent and generate contextual responses.
 *
 * KEY FIXES:
 * 1. Trigger phrases ("find those leads", "search now", "yes find them") now read
 *    conversation HISTORY to extract industries / roles / location discussed by the AI.
 * 2. Location is always derived from conversation context (not ignored).
 * 3. Rolling conversation summary — WhatsApp-style bullet list passed per turn so
 *    the AI retains full session context even when history window is small.
 *
 * Self-contained within ai-icp-assistant — no imports from other feature repos.
 * LAD Architecture: Service Layer — no SQL, no HTTP framework logic.
 */

const geminiClientService = require('./claude-client.service');
const companyAnalyzer = require('./CompanyAnalyzerService');
const promptLoader = require('./PromptLoader');
const logger = require('../utils/logger');
const llmWithBilling = require('../../../core/services/LLMWithBillingService');

// ─── Intent labels ────────────────────────────────────────────────────────────
const INTENTS = {
    SEARCH_LEADS: 'search_leads',      // "find me marketing directors in Paris"
    CONTEXT_SEARCH: 'context_search',    // "find those leads" / "yes search" — use history
    REFINE_LOCATION: 'refine_location',   // "try London instead"
    REFINE_TITLE: 'refine_title',      // "change to CTO"
    REFINE_INDUSTRY: 'refine_industry',   // "switch to healthcare"
    REFINE_FILTER: 'refine_filter',     // "nationality: India", "seniority: senior", "skills: HVAC"
    CHANGE_SEARCH: 'change_search',     // "I want to change what I'm looking for", "let me refine this"
    CLARIFY_LOCATION: 'clarify_location',  // answering a pending "which location?" prompt
    CLARIFY_TITLE: 'clarify_title',     // answering a pending "which title?" prompt
    CLARIFY_INDUSTRY: 'clarify_industry',  // answering a pending "which industry?" prompt
    CAMPAIGN_QUESTION: 'campaign_question', // "how many days should I run?"
    REQUEST_ICP_HELP: 'request_icp_help', // "who should I target?", "what type of leads?"
    ANALYZE_COMPANY_URLS: 'analyze_company_urls', // User provides linkedin OR website URL
    GENERAL_Q: 'general_q',         // everything else
};

// Phrases that mean "proceed with what was discussed" — no new info in message
const TRIGGER_PHRASES = [
    /^(yes|yeah|yep|sure|ok|okay|go|proceed|perfect|great|sounds good)[,.\s]*(find|search|do it|start|go ahead)?/i,
    /find\s+(those|the|that|these|relevant|right)?\s*(leads|people|contacts|profiles)/i,
    /search\s+(for\s+(them|those|that|leads|people|contacts))?$/i,
    /^(now\s+)?find\s+leads?$/i,
    /start\s+(the\s+)?search/i,
    /^go ahead$/i,
    /^do it$/i,
];

// Single-word trigger responses that should never be treated as search keywords
const TRIGGER_WORDS = new Set([
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'go', 'proceed',
    'perfect', 'great', 'good', 'fine', 'done', 'do', 'search', 'find',
    'start', 'begin', 'run', 'no', 'cancel', 'stop', 'back',
]);

// ─── Main class ───────────────────────────────────────────────────────────────
class LeadChatService {
    /**
     * Main entry — process a user message given the current search context.
     *
     * NOW WITH BILLING: Token usage tracked and credits debited for all Gemini calls
     *
     * @param {Object}      params
     * @param {string}      params.message              - Current user message
     * @param {Array}       params.history               - Recent messages [{role, text}]
     * @param {Object|null} params.currentTargeting      - Active targeting
     * @param {string|null} params.pendingIntent         - null | 'location' | 'title' | 'industry'
     * @param {string}      params.conversationSummary   - Rolling bullet-point summary of the session
     * @param {string|null} params.tenantId              - User tenant ID for Unipile config
     * @param {string|null} params.userId                - User ID for billing tracking
     * @param {Object|null} params.context               - Request context
     * @returns {Promise<Object>} { response, newSearch, updatedTargeting, pendingIntent, options, summaryUpdate }
     */
    async processMessage({ message, history = [], currentTargeting = null, pendingIntent = null, conversationSummary = '', icpProfile = null, tenantId = null, userId = null, context = null }) {
        try {
            // Step 1: Explicitly check for URLs to override trigger phrases
            // Detects: https://, http://, www., or naked domains ending in common TLDs (.com, .ae, .io, etc.)
            const hasUrls = /(https?:\/\/|www\.|[a-z0-9-]+\.(?:com|ae|io|co|net|org|ai|app|dev|uk|sg|in|us|me|biz|info)(?=[\s/,;'"!?]|$))/i.test(message);
            const isTrigger = !hasUrls && TRIGGER_PHRASES.some(re => re.test(message.trim()));

            // Step 2: Detect intent
            let intent;
            if (hasUrls) {
                intent = { type: INTENTS.ANALYZE_COMPANY_URLS, value: null };
            } else if (/\b(use.*my.*icp|icp.*knowledge|icp.*profile|based on.*icp|search.*from.*icp|use my profile|find.*using.*icp)\b/i.test(message)) {
                intent = { type: INTENTS.REQUEST_ICP_HELP, value: null };
            } else {
                intent = isTrigger
                    ? { type: INTENTS.CONTEXT_SEARCH, value: null }
                    : await this._detectIntent(message, currentTargeting, pendingIntent, history, conversationSummary, icpProfile, tenantId, userId);
            }

            logger.info('[LeadChatService] Intent', { type: intent.type, msg: message.substring(0, 80), isTrigger, hasIcpProfile: !!(icpProfile && Object.values(icpProfile).some(v => v)) });

            // Step 3: Route
            switch (intent.type) {

                // ── User describes leads directly (new full query) ─────────────────
                case INTENTS.SEARCH_LEADS: {
                    // ── Generic prospect search detection ──────────────────────────
                    // When the query describes a COMPANY TYPE + ATTRIBUTE rather than
                    // directly targeting individuals by role/industry/location, route
                    // to the enriched prospect discovery pipeline (Claude + Serper +
                    // Unipile + Apollo) instead of plain LinkedIn search.
                    //
                    // Characteristics of a generic company search:
                    //   • Mentions company category nouns (hotels, hospitals, restaurants…)
                    //   • Includes attribute qualifiers ("with X", "having Y", "5-star")
                    //   • Has a location reference
                    //   • Is NOT a direct role+location LinkedIn-style query
                    if (this._isGenericCompanySearch(message)) {
                        const summaryUpdate = this._buildSummaryUpdate(INTENTS.SEARCH_LEADS, null, message);
                        return {
                            response: `🔍 **Finding specific companies and decision makers for you...**\n\nI'm using AI to identify real companies matching your description and their key contacts. This may take a moment as I research each prospect.\n\n⚡ *Searching across the web, LinkedIn, and company databases...*`,
                            newSearch:    true,
                            searchType:   'generic_prospect',
                            originalQuery: message,
                            updatedTargeting: null,
                            pendingIntent: null,
                            options:      [],
                            summaryUpdate,
                        };
                    }
                    // ── Standard LinkedIn search ───────────────────────────────────
                    let targeting = await this._extractTargetingFromMessage(message, history, tenantId, userId);
                    // If the message yielded no real targeting but ICP profile is available, use it
                    const hasExtracted = targeting && (targeting.job_titles?.length || targeting.industries?.length || targeting.locations?.length);
                    if (!hasExtracted && icpProfile) {
                        const icpTargeting = this._extractTargetingFromIcp(icpProfile);
                        if (icpTargeting) targeting = icpTargeting;
                    }
                    const summaryUpdate = this._buildSummaryUpdate(INTENTS.SEARCH_LEADS, targeting, message);
                    return {
                        response: hasExtracted
                            ? this._buildSearchConfirmText(targeting, message)
                            : this._buildIcpSearchConfirmText(targeting, icpProfile),
                        newSearch: true,
                        updatedTargeting: targeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate,
                    };
                }

                // ── Trigger phrase: extract targeting from conversation history ─────
                case INTENTS.CONTEXT_SEARCH: {
                    // If we already have valid targeting (job_titles/industries/locations/company_names), use it directly.
                    // Never re-extract — that's how "yes" ends up as a keyword.
                    if (currentTargeting && (currentTargeting.job_titles?.length || currentTargeting.industries?.length || currentTargeting.locations?.length || currentTargeting.company_names?.length)) {
                        const summaryUpdate = this._buildSummaryUpdate(INTENTS.CONTEXT_SEARCH, currentTargeting, message);
                        return {
                            response: this._buildSearchConfirmText(currentTargeting, message),
                            newSearch: true,
                            updatedTargeting: currentTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate,
                        };
                    }

                    // No current targeting — extract from conversation history
                    const targeting = await this._extractTargetingFromHistory(history, currentTargeting, conversationSummary, tenantId, userId);

                    // Guard: only proceed if real targeting was found (not just trigger-word keywords like "yes")
                    const hasRealTargeting = targeting && (
                        targeting.job_titles?.length ||
                        targeting.industries?.length ||
                        targeting.locations?.length ||
                        targeting.company_names?.length ||
                        (targeting.keywords?.length && !targeting.keywords.every(k => TRIGGER_WORDS.has(k.toLowerCase())))
                    );

                    if (!hasRealTargeting) {
                        // Use ICP profile to auto-suggest targeting if available
                        const icpTargeting = icpProfile ? this._extractTargetingFromIcp(icpProfile) : null;
                        if (icpTargeting && (icpTargeting.job_titles?.length || icpTargeting.industries?.length || icpTargeting.locations?.length)) {
                            const summaryUpdate = this._buildSummaryUpdate(INTENTS.CONTEXT_SEARCH, icpTargeting, message);
                            return {
                                response: this._buildIcpSearchConfirmText(icpTargeting, icpProfile),
                                newSearch: true,
                                updatedTargeting: icpTargeting,
                                pendingIntent: null,
                                options: [],
                                summaryUpdate,
                            };
                        }
                        return {
                            response: `✦ What kind of leads are you looking for?\n\nHere are a few ways to get started:\n\n• **By role** — "Marketing Directors in London"\n• **By company** — "All people at Tesla"\n• **By decision-makers** — "CTOs at Series A startups in Dubai"\n• **By person** — "John Smith, VP of Sales at HubSpot"\n• **By industry** — "Procurement heads at construction firms in UAE"\n\nJust describe your ideal customer and I'll find them on LinkedIn. 🔍`,
                            newSearch: false,
                            updatedTargeting: currentTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate: null,
                        };
                    }

                    const summaryUpdate = this._buildSummaryUpdate(INTENTS.CONTEXT_SEARCH, targeting, message);
                    return {
                        response: this._buildSearchConfirmText(targeting, message),
                        newSearch: true,
                        updatedTargeting: targeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate,
                    };
                }

                // ── Refine location only ───────────────────────────────────────────
                case INTENTS.REFINE_LOCATION: {
                    if (intent.value) {
                        // Strip accidental prefixes: "Change location to Dubai" → "Dubai"
                        const cleanLocation = intent.value
                            .replace(/^(change|switch|update|set|use|try|only|just)\s+(location\s+)?(to\s+)?/i, '')
                            .trim();
                        const updatedTargeting = {
                            ...(currentTargeting || {}),
                            locations: [cleanLocation],
                            // drop any stale trigger-word keywords from previous searches
                            keywords: (currentTargeting?.keywords || []).filter(k => !TRIGGER_WORDS.has(k.toLowerCase().trim())),
                            // preserve company_names from current targeting
                            company_names: currentTargeting?.company_names || [],
                        };
                        return {
                            response: `📍 Location updated to **${cleanLocation}** — searching now...`,
                            newSearch: true,
                            updatedTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate: this._buildSummaryUpdate(INTENTS.REFINE_LOCATION, updatedTargeting, message, cleanLocation),
                        };
                    }
                    return {
                        response: `📍 Sure! Which location would you like to search in?`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: 'location',
                        options: [],
                        summaryUpdate: null,
                    };
                }

                // ── Refine job title only ──────────────────────────────────────────
                case INTENTS.REFINE_TITLE: {
                    if (intent.value) {
                        // Strip accidental prefixes: "Change title to CTO" → "CTO"
                        const cleanTitle = intent.value
                            .replace(/^(change|switch|update|set|use|try|only|just)\s+(title\s+|role\s+|job\s+title\s+)?(to\s+)?/i, '')
                            .trim();
                        const updatedTargeting = {
                            ...(currentTargeting || {}),
                            job_titles: [cleanTitle],
                            keywords: (currentTargeting?.keywords || []).filter(k => !TRIGGER_WORDS.has(k.toLowerCase().trim())),
                            // preserve company_names from current targeting
                            company_names: currentTargeting?.company_names || [],
                        };
                        return {
                            response: `🎯 Job title updated to **${cleanTitle}** — finding leads now...`,
                            newSearch: true,
                            updatedTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate: this._buildSummaryUpdate(INTENTS.REFINE_TITLE, updatedTargeting, message, cleanTitle),
                        };
                    }
                    return {
                        response: `🎯 What job title or role would you like to target instead?`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: 'title',
                        options: [],
                        summaryUpdate: null,
                    };
                }

                // ── Refine industry only ───────────────────────────────────────────
                case INTENTS.REFINE_INDUSTRY: {
                    if (intent.value) {
                        // Strip accidental prefixes Gemini sometimes returns:
                        // "Change industry to Financial Services" → "Financial Services"
                        // "switch to Healthcare" → "Healthcare"
                        const cleanIndustry = intent.value
                            .replace(/^(change|switch|update|set|use|try|only|just)\s+(industry\s+)?(to\s+)?/i, '')
                            .trim();
                        const updatedTargeting = {
                            ...(currentTargeting || {}),
                            industries: [cleanIndustry],
                            keywords: (currentTargeting?.keywords || []).filter(k => !TRIGGER_WORDS.has(k.toLowerCase().trim())),
                            // preserve company_names from current targeting
                            company_names: currentTargeting?.company_names || [],
                        };
                        return {
                            response: `🏭 Industry updated to **${cleanIndustry}** — searching now...`,
                            newSearch: true,
                            updatedTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate: this._buildSummaryUpdate(INTENTS.REFINE_INDUSTRY, updatedTargeting, message, cleanIndustry),
                        };
                    }
                    return {
                        response: `🏭 Which industry would you like to target?`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: 'industry',
                        options: [],
                        summaryUpdate: null,
                    };
                }

                // ── Answering a pending clarification ─────────────────────────────
                case INTENTS.CLARIFY_LOCATION: {
                    const updatedTargeting = { ...(currentTargeting || {}), locations: [message.trim()] };
                    return {
                        response: `📍 Got it — **${message.trim()}**. Searching for leads there now...`,
                        newSearch: true,
                        updatedTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate: `• Location clarified: ${message.trim()}`,
                    };
                }

                case INTENTS.CLARIFY_TITLE: {
                    const updatedTargeting = { ...(currentTargeting || {}), job_titles: [message.trim()] };
                    return {
                        response: `🎯 Perfect — targeting **${message.trim()}**. Finding leads now...`,
                        newSearch: true,
                        updatedTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate: `• Title clarified: ${message.trim()}`,
                    };
                }

                case INTENTS.CLARIFY_INDUSTRY: {
                    const updatedTargeting = { ...(currentTargeting || {}), industries: [message.trim()] };
                    return {
                        response: `🏭 Great — **${message.trim()}** industry. Searching now...`,
                        newSearch: true,
                        updatedTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate: `• Industry clarified: ${message.trim()}`,
                    };
                }

                // ── User wants to refine/change the current search ─────────────────
                case INTENTS.CHANGE_SEARCH: {
                    if (currentTargeting && (currentTargeting.job_titles?.length || currentTargeting.industries?.length || currentTargeting.locations?.length)) {
                        const titleStr = currentTargeting.job_titles?.join(', ') || '—';
                        const industryStr = currentTargeting.industries?.join(', ') || '—';
                        const locationStr = currentTargeting.locations?.join(', ') || '—';

                        // Check if this is a meta-instruction about a specific field (e.g. "only 1 industry")
                        // In that case, give direct guidance on how to apply it
                        const isIndustryMeta = /\bindustr(y|ies)\b/i.test(message);
                        const isTitleMeta = /\b(title|role|position|job)\b/i.test(message);
                        const isLocationMeta = /\b(location|city|country|place|region)\b/i.test(message);

                        if (isIndustryMeta && currentTargeting.industries?.length > 1) {
                            const industryList = currentTargeting.industries.map(ind => `• "${ind}"`).join('\n');
                            return {
                                response: `Got it — currently searching across **${currentTargeting.industries.length} industries**:\n\n${industryList}\n\nWhich single industry should I focus on?`,
                                newSearch: false,
                                updatedTargeting: currentTargeting,
                                pendingIntent: 'industry',
                                // value is just the industry name — pendingIntent:'industry' routes it
                                // directly to CLARIFY_INDUSTRY (bypasses Gemini), so no prefix needed
                                options: currentTargeting.industries.slice(0, 4).map(ind => ({ label: `🏭 ${ind}`, value: ind })),
                                summaryUpdate: `• Asked to narrow to 1 industry`,
                            };
                        }

                        return {
                            response: `Here's your active search:\n\n🎯 **Titles** — ${titleStr}\n🏭 **Industry** — ${industryStr}\n📍 **Location** — ${locationStr}\n\nWhat would you like to tweak?\n\n• "Change location to Abu Dhabi"\n• "Switch titles to VP of Engineering"\n• "Change industry to Construction"\n• "Add filter: nationality: Indian"\n• Or just describe a completely new search`,
                            newSearch: false,
                            updatedTargeting: currentTargeting,
                            pendingIntent: null,
                            options: [
                                { label: '📍 Change location', value: 'Change location to ' },
                                { label: '🎯 Change titles', value: 'Change titles to ' },
                                { label: '🏭 Change industry', value: 'Change industry to ' },
                                { label: '🔄 New search', value: 'I want to search for ' },
                            ],
                            summaryUpdate: `• Asked to change search criteria`,
                        };
                    }
                    // No existing targeting — treat same as request_icp_help
                    return {
                        response: `Let's find the right leads for you. 🔍\n\nTry something like:\n\n• "Procurement Heads in Dubai, HVAC industry"\n• "Marketing Directors at SaaS companies in London"\n• "CTOs at early-stage startups in Singapore"\n\nWhat's your ideal customer profile?`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate: null,
                    };
                }

                // ── Extra filter like "nationality: India" or structured multi-line targeting form ──
                case INTENTS.REFINE_FILTER: {
                    const filterRaw = intent.value || message;

                    // ── Multi-line targeting form: "Refine my targeting with these additional criteria:\nNationality: X\n..." ──
                    const isMultiLineForm = /^Refine my targeting with these additional criteria/i.test(filterRaw);
                    if (isMultiLineForm) {
                        const lines = filterRaw.split('\n').slice(1); // skip the header line
                        let merged = { ...(currentTargeting || {}) };
                        const appliedParts = [];
                        for (const line of lines) {
                            const m = line.match(/^([a-z_\s]+)\s*[:=]\s*(.+)$/i);
                            if (!m) continue;
                            const key = m[1].trim().toLowerCase();
                            const val = m[2].trim();
                            if (/nationality/i.test(key)) {
                                merged.decision_maker_nationality = [
                                    ...(merged.decision_maker_nationality || []),
                                    ...val.split(/[,;]+/).map(v => v.trim()).filter(Boolean),
                                ];
                            } else if (/experience\s*level|seniority/i.test(key)) {
                                merged.decision_maker_experience_level = val.split(/[,;]+/).map(v => v.trim()).filter(Boolean);
                            } else if (/company\s*size/i.test(key)) {
                                merged.company_size = val.split(/[,;]+/).map(v => v.trim()).filter(Boolean);
                            } else if (/company\s*age/i.test(key)) {
                                merged.company_age = val.split(/[,;]+/).map(v => v.trim()).filter(Boolean);
                            } else if (/education/i.test(key)) {
                                merged.decision_maker_education = val.split(/[,;]+/).map(v => v.trim()).filter(Boolean);
                            } else if (/skill/i.test(key)) {
                                merged.decision_maker_skills = val.split(/[,;]+/).map(v => v.trim()).filter(Boolean);
                            } else {
                                merged.keywords = [...(merged.keywords || []), val];
                            }
                            appliedParts.push(`**${key}**: ${val}`);
                        }
                        if (appliedParts.length > 0) {
                            return {
                                response: `✦ Filters applied:\n${appliedParts.join('\n')}\n\nRunning updated search now...`,
                                newSearch: true,
                                updatedTargeting: merged,
                                pendingIntent: null,
                                options: [],
                                summaryUpdate: `• Targeting filters: ${appliedParts.join(', ')}`,
                            };
                        }
                        return {
                            response: `✦ No changes detected — search unchanged.`,
                            newSearch: false,
                            updatedTargeting: currentTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate: null,
                        };
                    }

                    // ── Single-line filter: "key: value" ──
                    const filterMatch = filterRaw.match(/^([a-z_\s]+)\s*[:=]\s*(.+)$/i) ||
                                        message.match(/^([a-z_\s]+)\s*[:=]\s*(.+)$/i);

                    if (filterMatch) {
                        const filterKey = filterMatch[1].trim().toLowerCase();
                        const filterVal = filterMatch[2].trim();

                        // Route nationality to decision_maker_nationality (not keywords)
                        const isNationality = /^(nationality|nationalities|national|citizen|citizenship)$/i.test(filterKey);
                        const updatedTargeting = isNationality
                            ? {
                                ...(currentTargeting || {}),
                                decision_maker_nationality: [
                                    ...(currentTargeting?.decision_maker_nationality || []),
                                    ...filterVal.split(/[,;]+/).map(v => v.trim()).filter(Boolean),
                                ],
                              }
                            : {
                                ...(currentTargeting || {}),
                                keywords: [...(currentTargeting?.keywords || []), filterVal],
                              };

                        return {
                            response: `✦ Filter applied — **${filterKey}: ${filterVal}**\n\nRunning updated search now...`,
                            newSearch: true,
                            updatedTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate: `• Filter: ${filterKey} = ${filterVal}`,
                        };
                    }

                    // Couldn't parse — ask for clarification
                    return {
                        response: `Try specifying the filter as **key: value**, for example:\n\n• nationality: Indian\n• seniority: Senior\n• skills: Gas Detection\n• company size: 50-250`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate: null,
                    };
                }

                // ── Campaign question ──────────────────────────────────────────────
                case INTENTS.CAMPAIGN_QUESTION: {
                    const answer = await this._answerCampaignQuestion(message, currentTargeting, conversationSummary, tenantId, userId);
                    return {
                        response: answer,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate: this._buildSummaryUpdate(INTENTS.CAMPAIGN_QUESTION, currentTargeting, message),
                    };
                }

                // ── Request ICP Help ───────────────────────────────────────────────
                case INTENTS.REQUEST_ICP_HELP: {
                    // If the user already has an active search, guide them to refine it
                    if (currentTargeting && (currentTargeting.job_titles?.length || currentTargeting.industries?.length || currentTargeting.locations?.length)) {
                        const titleStr = currentTargeting.job_titles?.join(', ') || '—';
                        const industryStr = currentTargeting.industries?.join(', ') || '—';
                        const locationStr = currentTargeting.locations?.join(', ') || '—';
                        return {
                            response: `Here's what you're currently targeting:\n\n🎯 **Titles** — ${titleStr}\n🏭 **Industry** — ${industryStr}\n📍 **Location** — ${locationStr}\n\nWant to refine this, or explore a completely different audience?`,
                            newSearch: false,
                            updatedTargeting: currentTargeting,
                            pendingIntent: null,
                            options: [
                                { label: '✏️ Refine current', value: 'I want to change what I\'m looking for' },
                                { label: '🔄 New search', value: 'I want to search for ' },
                                { label: '🌐 Analyze my website', value: 'My website is https://' },
                            ],
                            summaryUpdate: null,
                        };
                    }
                    // If ICP profile is available, suggest targeting from it
                    if (icpProfile) {
                        const icpTargeting = this._extractTargetingFromIcp(icpProfile);
                        if (icpTargeting && (icpTargeting.job_titles?.length || icpTargeting.industries?.length || icpTargeting.locations?.length)) {
                            return {
                                response: this._buildIcpSearchConfirmText(icpTargeting, icpProfile),
                                newSearch: true,
                                updatedTargeting: icpTargeting,
                                pendingIntent: null,
                                options: [],
                                summaryUpdate: `• ICP-based targeting applied`,
                            };
                        }
                    }
                    return {
                        response: `I'd love to help you zero in on the right audience! 🎯\n\nShare your **website URL** or **LinkedIn company page** and I'll analyze your business to suggest the best industries, job titles, and locations to target.`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate: null,
                    };
                }

                // ── Analyze Company URLs ───────────────────────────────────────────
                case INTENTS.ANALYZE_COMPANY_URLS: {
                    if (!tenantId) {
                        return {
                            response: `I need your account to be properly connected to analyze that right now. Could you just manually tell me what industries and titles you want to search?`,
                            newSearch: false,
                            updatedTargeting: currentTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate: null,
                        };
                    }

                    // Normalise bare www. and domain-only URLs → prepend https://
                    // e.g. "www.techiemaya.com" → "https://www.techiemaya.com"
                    //      "techiemaya.com"     → "https://techiemaya.com"
                    // NOTE: lookbehind includes '.' so subdomains inside an already-normalized
                    //       URL (https://www.techiemaya.com) are NOT double-prefixed.
                    const normalizedMsg = message
                        // www.foo.com  (not already prefixed with http/https)
                        .replace(/(?<![:/\w.])(www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g, 'https://$1')
                        // naked domain like "techiemaya.com" with no www/http
                        .replace(/(?<![:/\w.])([a-zA-Z0-9-]+\.(com|ae|io|co|net|org|ai|app|dev)[^\s]*)/g, 'https://$1');

                    const urls = normalizedMsg.match(/(https?:\/\/[^\s]+)/g) || [];
                    const linkedinUrl = urls.find(url => url.includes('linkedin.com/company') || url.includes('linkedin.com/in'));
                    const websiteUrl = urls.find(url => !url.includes('linkedin.com'));

                    if (!linkedinUrl && !websiteUrl) {
                        return {
                            response: `Hmm, I couldn't detect a valid URL in your message. Try sharing it like:\n\n• https://www.yourdomain.com\n• www.yourdomain.com\n• linkedin.com/company/yourcompany`,
                            newSearch: false,
                            updatedTargeting: currentTargeting,
                            pendingIntent: null,
                            options: [],
                            summaryUpdate: null,
                        };
                    }

                    const analysisResponse = await companyAnalyzer.analyzeCompanyProfiles(linkedinUrl, websiteUrl, tenantId, context, history, message);

                    // Build a short summary bullet for the URL analyzed
                    const displayUrl = (websiteUrl || linkedinUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
                    const summaryUpdate = `• Company analyzed: ${displayUrl.substring(0, 60)}`;

                    return {
                        response: analysisResponse,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate,
                    };
                }

                // ── General / fallback ─────────────────────────────────────────────
                case INTENTS.GENERAL_Q:
                default: {
                    const answer = await this._answerGeneralQuestion(message, currentTargeting, history, conversationSummary, icpProfile, tenantId, userId);
                    return {
                        response: answer,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: null,
                        options: [],
                        summaryUpdate: this._buildSummaryUpdate(INTENTS.GENERAL_Q, currentTargeting, message),
                    };
                }
            }

        } catch (error) {
            logger.error('[LeadChatService] processMessage error', { error: error.message });
            return {
                response: `Something went sideways on my end — could you try again?\n\nHere are a few prompts to get started:\n\n• "Find all VPs of Sales at SaaS companies in UAE"\n• "Decision makers at Google"\n• "John Smith, CTO at Stripe"\n• "Marketing directors at fintech startups in London"`,
                newSearch: false,
                updatedTargeting: currentTargeting,
                pendingIntent: null,
                options: [],
                summaryUpdate: null,
            };
        }
    }

    // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

    /**
     * Extract LinkedIn search targeting from a saved ICP profile object.
     */
    _extractTargetingFromIcp(icpProfile) {
        if (!icpProfile) return null;
        const titles = (icpProfile.icpJobTitles || '')
            .split(/[,;]+/).map(s => s.trim()).filter(Boolean);
        const industries = (icpProfile.targetCustomers || icpProfile.industry || '')
            .split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
        const locations = (icpProfile.icpLocations || icpProfile.geographicFocus || '')
            .split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
        const companySizes = (icpProfile.icpCompanySize || '')
            .split(/[,;]+/).map(s => s.trim()).filter(Boolean);
        if (!titles.length && !industries.length && !locations.length) return null;
        return {
            job_titles: titles,
            industries,
            locations,
            keywords: companySizes,
            company_names: [],
        };
    }

    /**
     * Build a confirmation message that explains ICP-sourced targeting to the user.
     */
    _buildIcpSearchConfirmText(targeting, icpProfile) {
        const titleStr = (targeting.job_titles || []).slice(0, 3).join(', ') || '—';
        const industryStr = (targeting.industries || []).slice(0, 3).join(', ') || '—';
        const locationStr = (targeting.locations || []).slice(0, 3).join(', ') || 'Global';
        const companyName = icpProfile?.companyName ? ` for **${icpProfile.companyName}**` : '';
        return `🎯 Based on your ICP profile${companyName}, here's who I'll search for:\n\n` +
            `• **Titles** — ${titleStr}\n` +
            `• **Industry** — ${industryStr}\n` +
            `• **Location** — ${locationStr}\n\n` +
            `Searching LinkedIn now...`;
    }

    /**
     * Build a one-line rolling summary bullet to append to conversationSummary.
     * Returns null when the turn isn't worth recording (greetings, trivial confirmations).
     */
    _buildSummaryUpdate(intentType, targeting, message, intentValue = null) {
        const truncate = (str, n) => str && str.length > n ? str.substring(0, n) + '…' : (str || '');

        switch (intentType) {
            case INTENTS.SEARCH_LEADS:
            case INTENTS.CONTEXT_SEARCH: {
                const titles = (targeting?.job_titles || []).slice(0, 2).join(', ');
                const loc = (targeting?.locations || [])[0] || '';
                const ind = (targeting?.industries || [])[0] || '';
                const parts = [titles, loc && `in ${loc}`, ind && `(${ind})`].filter(Boolean);
                return parts.length ? `• Searched: ${parts.join(' ')}` : `• Search triggered`;
            }
            case INTENTS.ANALYZE_COMPANY_URLS: {
                const urlMatch = message.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/);
                const url = urlMatch ? urlMatch[0].replace(/^https?:\/\//, '').replace(/\/$/, '') : 'company URL';
                return `• Analyzed: ${truncate(url, 60)}`;
            }
            case INTENTS.REFINE_LOCATION:
                return `• Location → ${intentValue || message.trim()}`;
            case INTENTS.REFINE_TITLE:
                return `• Title → ${intentValue || message.trim()}`;
            case INTENTS.REFINE_INDUSTRY:
                return `• Industry → ${intentValue || message.trim()}`;
            case INTENTS.REFINE_FILTER:
                return `• Filter: ${truncate(intentValue || message, 60)}`;
            case INTENTS.CAMPAIGN_QUESTION:
                return `• Campaign Q: ${truncate(message, 60)}`;
            case INTENTS.GENERAL_Q: {
                // Only record substantive context messages (business description, questions)
                if (
                    message.length > 30 &&
                    !/^(hi|hello|hey|thanks|thank you|great|ok|okay|cool|awesome|nice|perfect)\b/i.test(message.trim())
                ) {
                    return `• User context: ${truncate(message, 90)}`;
                }
                return null;
            }
            default:
                return null;
        }
    }

    /**
     * Detect intent using Gemini with keyword fallback.
     * Accepts history AND conversationSummary so Gemini can consider prior context.
     * NOW WITH BILLING: Token usage tracked and credits debited
     */
    async _detectIntent(message, currentTargeting, pendingIntent, history = [], conversationSummary = '', icpProfile = null, tenantId = null, userId = null) {
        // Pending clarification bypasses Gemini entirely
        if (pendingIntent === 'location') return { type: INTENTS.CLARIFY_LOCATION };
        if (pendingIntent === 'title') return { type: INTENTS.CLARIFY_TITLE };
        if (pendingIntent === 'industry') return { type: INTENTS.CLARIFY_INDUSTRY };

        const targetingCtx = currentTargeting
            ? `Current targeting: titles=${JSON.stringify(currentTargeting.job_titles)}, industries=${JSON.stringify(currentTargeting.industries)}, locations=${JSON.stringify(currentTargeting.locations)}`
            : 'No current targeting set.';

        const recentHistory = history.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 2500)}`).join('\n');

        const summarySection = conversationSummary
            ? `--- SESSION CONTEXT (earlier turns) ---\n${conversationSummary}\n--- END SESSION CONTEXT ---\n\n`
            : '';

        const icpSection = icpProfile && (icpProfile.targetCustomers || icpProfile.icpJobTitles || icpProfile.companyDescription)
            ? `--- USER'S ICP PROFILE ---\nCompany: ${icpProfile.companyName || ''}\nProducts/Services: ${icpProfile.productsServices || ''}\nTarget Customers: ${icpProfile.targetCustomers || ''}\nICP Titles: ${icpProfile.icpJobTitles || ''}\nLocations: ${icpProfile.icpLocations || icpProfile.geographicFocus || ''}\nPain Points: ${icpProfile.icpPainPoints || ''}\n--- END ICP PROFILE ---\n\n`
            : '';

        const prompt = await promptLoader.build('intent_detection', {
            SUMMARY_SECTION: icpSection + summarySection,
            TARGETING_CTX: targetingCtx,
            RECENT_HISTORY: recentHistory || '(none)',
            MESSAGE: message,
        }, '');

        // Guard: if prompt template failed to load (DB unavailable), skip LLM entirely
        if (!prompt.trim()) {
            logger.warn('[LeadChatService] intent_detection prompt empty — skipping LLM, using regex fallback');
            return { type: INTENTS.GENERAL_Q };
        }

        try {
            let raw;
            // Use Gemini with billing if credentials available
            if (llmWithBilling && tenantId && userId) {
              const result = await llmWithBilling.generateWithGemini({
                tenantId,
                userId,
                featureKey: 'lead-chat-intent-detection',
                prompt,
                options: { maxOutputTokens: 200, temperature: 0.3 },
                skipBilling: false,
                metadata: { messagePreview: message.substring(0, 60) },
              });
              raw = result.text;
            } else {
              // Fallback to direct Gemini
              raw = await geminiClientService.generateContent(prompt);
            }
            const cleaned = raw.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return { type: parsed.type || INTENTS.GENERAL_Q, value: parsed.value || null };
        } catch (e) {
            logger.warn('[LeadChatService] Intent detection fallback', { error: e.message });
            const lower = message.toLowerCase();
            if (/https?:\/\/|www\.|\.(?:com|ae|io|co|net|org|ai|app|dev|uk|sg|in|us|me|biz|info)(?=[\s/,;'"!?]|$)/i.test(message)) return { type: INTENTS.ANALYZE_COMPANY_URLS };
            if (/\b(campaign|schedule|daily|days|run|duration|connection message)\b/.test(lower)) return { type: INTENTS.CAMPAIGN_QUESTION };
            // Targeting form structured submission: multi-line "Nationality: X\nExperience: Y" etc.
            if (/^Refine my targeting with these additional criteria/i.test(message)) return { type: INTENTS.REFINE_FILTER, value: message };
            // Meta-instructions about HOW to search → change_search (must come BEFORE search_leads check)
            if (/\b(only \d+|\d+ at a time|at a time|per (search|query)|from now on|limit (to|the)|just (one|1|show)|one (industry|title|location))\b/i.test(message)) return { type: INTENTS.CHANGE_SEARCH };
            // change_search: user wants to modify the current search
            if (/\b(change|modify|update|refine|different|can you refine)\b.*(search|looking|criteria|target|find|want|industr|title|location)/i.test(message) || /i want (to )?(change|different|something else)/i.test(message)) return { type: INTENTS.CHANGE_SEARCH };
            // refine_filter: "key: value" pattern like "nationality: India"
            if (/^[a-z _]+\s*[:=]\s*.+$/i.test(message.trim()) && message.length < 80) return { type: INTENTS.REFINE_FILTER, value: message.trim() };
            if (/\b(try|change|switch|update|different)\b.*(location|city|country|place)/i.test(message)) return { type: INTENTS.REFINE_LOCATION };
            if (/\b(try|change|switch|update|different)\b.*(title|role|position|job)/i.test(message)) return { type: INTENTS.REFINE_TITLE };
            if (/\b(try|change|switch|update)\b.*(industry|sector|field)/i.test(message)) return { type: INTENTS.REFINE_INDUSTRY };
            if (/\b(who should|help me|what type|suggest targeting|what leads|use.*icp|icp.*knowledge|icp.*profile|my icp|based on.*icp|use my profile|search.*my.*profile)\b/i.test(message)) return { type: INTENTS.REQUEST_ICP_HELP };
            // Person + company pattern: "[name] from/at [company]", "find [name]", "decision maker(s) at [company]"
            if (/\b\w+\s+(from|at)\s+\w+/i.test(message)) return { type: INTENTS.SEARCH_LEADS };
            if (/\b(decision maker|people|employees|team|who works?)\s+(at|in|from)\s+\w+/i.test(message)) return { type: INTENTS.SEARCH_LEADS };
            if (/\b(i want to find(out)?|find out)\s+(the\s+)?(decision maker|cto|ceo|cfo|vp|founder|head)/i.test(lower)) return { type: INTENTS.SEARCH_LEADS };
            if (/\b(cto|cfo|coo|ceo|vp\s|director|manager|engineer|developer)\b/i.test(message) && message.length > 15) return { type: INTENTS.SEARCH_LEADS };
            // "Head of X", "Chief X", "VP of X", "X Officer", role+location patterns
            if (/\b(head of|chief|officer|president|founder|owner|partner|principal|lead|specialist|consultant|analyst|architect|executive)\b/i.test(message) && message.length > 10) return { type: INTENTS.SEARCH_LEADS };
            // Role "in" location/industry pattern: "X in Finance in UAE", "Marketing director in Dubai"
            if (/\b\w[\w\s]{3,}\s+in\s+[A-Z]/i.test(message) && message.length > 15) return { type: INTENTS.SEARCH_LEADS };
            return { type: INTENTS.GENERAL_Q };
        }
    }

    /**
     * Extract targeting from a direct user message (e.g. "Marketing directors in London").
     * Also uses history to fill in missing fields (e.g. location mentioned earlier).
     * NOW WITH BILLING: Token usage tracked and credits debited
     */
    async _extractTargetingFromMessage(message, history = [], tenantId = null, userId = null) {
        const historyCtx = history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 2500)}`).join('\n');

        const prompt = await promptLoader.build('extract_targeting_message', {
            MESSAGE: message,
            HISTORY_CTX: historyCtx || '(none)',
        }, '');

        // Guard: if prompt template failed to load (DB unavailable), skip LLM entirely
        if (!prompt.trim()) {
            logger.warn('[LeadChatService] extract_targeting_message prompt empty — skipping LLM');
            const fallbackKeyword = TRIGGER_WORDS.has(message.toLowerCase().trim()) ? [] : [message];
            return { job_titles: [], industries: [], locations: [], keywords: fallbackKeyword, company_names: [], profile_language: [] };
        }

        try {
            let raw;
            // Use Claude for structured extraction (better at parsing structured requests)
            if (llmWithBilling && tenantId && userId) {
              const result = await llmWithBilling.generateMessage({
                tenantId,
                userId,
                featureKey: 'lead-chat-targeting-extraction',
                prompt,
                options: { maxTokens: 400, temperature: 0.3 },
                skipBilling: false,
                metadata: { messagePreview: message.substring(0, 60) },
              });
              raw = result.text;
            } else {
              // Fallback to direct Claude if billing unavailable
              const Anthropic = require('@anthropic-ai/sdk');
              const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
              const response = await client.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 400,
                messages: [{ role: 'user', content: prompt }],
              });
              raw = response.content[0].text;
            }
            const cleaned = raw.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            const cleanKw = (arr) => (arr || []).filter(k => k && k.length > 2 && !TRIGGER_WORDS.has(k.toLowerCase().trim()));
            return {
                job_titles: parsed.job_titles || [],
                industries: parsed.industries || [],
                locations: parsed.locations || [],
                keywords: cleanKw(parsed.keywords),
                company_names: parsed.company_names || [],
                profile_language: parsed.profile_language || [],
            };
        } catch (e) {
            logger.warn('[LeadChatService] Targeting extraction from message failed', { error: e.message });
            // Don't use trigger words as fallback keyword
            const fallbackKeyword = TRIGGER_WORDS.has(message.toLowerCase().trim()) ? [] : [message];
            return { job_titles: [], industries: [], locations: [], keywords: fallbackKeyword, company_names: [], profile_language: [] };
        }
    }

    /**
     * KEY FIX: Extract targeting entirely from conversation HISTORY + session summary.
     * Used when the user says "find those leads" / "yes search" without repeating details.
     * Reads AI's previous suggestions for industries, roles, and location.
     * NOW WITH BILLING: Token usage tracked and credits debited
     */
    async _extractTargetingFromHistory(history = [], currentTargeting = null, conversationSummary = '', tenantId = null, userId = null) {
        if (!history || history.length === 0) return currentTargeting;

        // Build full conversation context for Gemini to scan
        const fullHistory = history.slice(-10)
            .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 2500)}`)
            .join('\n');

        const summarySection = conversationSummary
            ? `--- SESSION SUMMARY (earlier turns not in the recent history) ---\n${conversationSummary}\n--- END SUMMARY ---\n\n`
            : '';

        const prompt = await promptLoader.build('extract_targeting_history', {
            SUMMARY_SECTION: summarySection,
            FULL_HISTORY: fullHistory,
        }, '');

        // Guard: if prompt template failed to load (DB unavailable), skip LLM entirely
        if (!prompt.trim()) {
            logger.warn('[LeadChatService] extract_targeting_history prompt empty — skipping LLM');
            return currentTargeting;
        }

        try {
            let raw;
            // Use Claude for structured extraction (better at parsing structured requests)
            if (llmWithBilling && tenantId && userId) {
              const result = await llmWithBilling.generateMessage({
                tenantId,
                userId,
                featureKey: 'lead-chat-history-extraction',
                prompt,
                options: { maxTokens: 400, temperature: 0.3 },
                skipBilling: false,
                metadata: { historyLength: history.length },
              });
              raw = result.text;
            } else {
              // Fallback to direct Claude if billing unavailable
              const Anthropic = require('@anthropic-ai/sdk');
              const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
              const response = await client.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 400,
                messages: [{ role: 'user', content: prompt }],
              });
              raw = response.content[0].text;
            }
            const cleaned = raw.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);

            logger.info('[LeadChatService] Extracted targeting from history', {
                titles: parsed.job_titles,
                industries: parsed.industries,
                locations: parsed.locations,
                reasoning: parsed.reasoning,
            });

            // Strip trigger words (yes/no/ok/go…) from keywords — they are never valid search terms
            const cleanKeywords = (arr) => (arr || []).filter(k => k && k.length > 2 && !TRIGGER_WORDS.has(k.toLowerCase().trim()));

            // Merge with currentTargeting — prefer freshly extracted values
            return {
                job_titles: parsed.job_titles?.length ? parsed.job_titles : (currentTargeting?.job_titles || []),
                industries: parsed.industries?.length ? parsed.industries : (currentTargeting?.industries || []),
                locations: parsed.locations?.length ? parsed.locations : (currentTargeting?.locations || []),
                keywords: cleanKeywords(parsed.keywords?.length ? parsed.keywords : (currentTargeting?.keywords || [])),
                profile_language: parsed.profile_language?.length ? parsed.profile_language : (currentTargeting?.profile_language || []),
            };
        } catch (e) {
            logger.warn('[LeadChatService] History targeting extraction failed', { error: e.message });
            return currentTargeting;
        }
    }

    /** Answer a campaign-related question with Gemini
     * NOW WITH BILLING: Token usage tracked and credits debited
     */
    async _answerCampaignQuestion(message, currentTargeting, conversationSummary = '', tenantId = null, userId = null) {
        const ctx = currentTargeting
            ? `The user is targeting: ${currentTargeting.job_titles?.join(', ') || 'any titles'} in ${currentTargeting.industries?.join(', ') || 'any industry'}, located in ${currentTargeting.locations?.join(', ') || 'any location'}.`
            : '';

        const summarySection = conversationSummary
            ? `\n--- SESSION CONTEXT ---\n${conversationSummary}\n--- END ---\n`
            : '';

        const prompt = await promptLoader.build('campaign_question', {
            SUMMARY_SECTION: summarySection,
            CTX: ctx ? `\nContext: ${ctx}` : '',
            MESSAGE: message,
        }, '');

        if (!prompt.trim()) {
            logger.warn('[LeadChatService] campaign_question prompt empty — returning static fallback');
            return `### Campaign Quick Guide\n\n📅 **Duration** — 2–4 weeks is the sweet spot for most campaigns\n🔢 **Daily limit** — 10–25 connections/day stays safely within LinkedIn's limits\n✉️ **Messages** — Keep under 300 chars and always personalise with their first name\n📆 **Schedule** — Monday–Friday gets significantly better response rates`;
        }

        try {
            let response;
            // Use Gemini with billing if credentials available
            if (llmWithBilling && tenantId && userId) {
              const result = await llmWithBilling.generateWithGemini({
                tenantId,
                userId,
                featureKey: 'lead-chat-campaign-question',
                prompt,
                options: { maxOutputTokens: 600, temperature: 0.5 },
                skipBilling: false,
                metadata: { messagePreview: message.substring(0, 60) },
              });
              response = result.text;
            } else {
              // Fallback to direct Gemini
              response = await geminiClientService.generateContent(prompt);
            }
            return response;
        } catch (e) {
            return `### Campaign Quick Guide\n\n📅 **Duration** — 2–4 weeks is the sweet spot for most campaigns\n🔢 **Daily limit** — 10–25 connections/day stays safely within LinkedIn's limits\n✉️ **Messages** — Keep under 300 chars and always personalise with their first name\n📆 **Schedule** — Monday–Friday gets significantly better response rates`;
        }
    }

    /** Answer a general question or web analysis request
     * NOW WITH BILLING: Token usage tracked and credits debited
     */
    async _answerGeneralQuestion(message, currentTargeting, history, conversationSummary = '', icpProfile = null, tenantId = null, userId = null) {
        const recentHistory = (history || []).slice(-8).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 400)}`).join('\n');
        const ctx = currentTargeting && (currentTargeting.job_titles?.length || currentTargeting.locations?.length)
            ? `Active targeting: ${currentTargeting.job_titles?.join(', ') || '—'} in ${currentTargeting.industries?.join(', ') || '—'} (${currentTargeting.locations?.join(', ') || '—'})`
            : 'No targeting set yet.';

        const summarySection = conversationSummary
            ? `--- SESSION SUMMARY (earlier turns) ---\n${conversationSummary}\n--- END SUMMARY ---\n\n`
            : '';

        const icpSection = icpProfile && (icpProfile.targetCustomers || icpProfile.icpJobTitles || icpProfile.companyDescription)
            ? `--- USER'S ICP PROFILE ---\nCompany: ${icpProfile.companyName || ''}\nDescription: ${icpProfile.companyDescription || ''}\nProducts/Services: ${icpProfile.productsServices || ''}\nTarget Customers: ${icpProfile.targetCustomers || ''}\nICP Titles: ${icpProfile.icpJobTitles || ''}\nLocations: ${icpProfile.icpLocations || icpProfile.geographicFocus || ''}\nPain Points: ${icpProfile.icpPainPoints || ''}\n--- END ICP PROFILE ---\n\n`
            : '';

        const prompt = await promptLoader.build('general_question', {
            SUMMARY_SECTION: icpSection + summarySection,
            CTX: ctx,
            RECENT_HISTORY: recentHistory || '(none)',
            MESSAGE: message,
        }, '');

        if (!prompt.trim()) {
            logger.warn('[LeadChatService] general_question prompt empty — returning static fallback');
            return `I'm here to help you find the right leads! ✦\n\nHere's what I can do:\n\n• **Find a person** — "John Smith, CTO at Stripe"\n• **People at a company** — "Everyone at Tesla"\n• **Decision-makers** — "C-suite at fintech startups in Dubai"\n• **Industry search** — "Marketing Directors in London"\n• **Analyze your website** — share your URL and I'll suggest who to target\n\nWhat are you looking for?`;
        }

        try {
            let response;
            // Use Gemini with billing if credentials available
            if (llmWithBilling && tenantId && userId) {
              const result = await llmWithBilling.generateWithGemini({
                tenantId,
                userId,
                featureKey: 'lead-chat-general-question',
                prompt,
                options: { maxOutputTokens: 800, temperature: 0.6 },
                skipBilling: false,
                metadata: { messagePreview: message.substring(0, 60), hasHistory: history.length > 0 },
              });
              response = result.text;
            } else {
              // Fallback to direct Gemini
              response = await geminiClientService.generateContent(prompt);
            }
            return response;
        } catch (e) {
            return `I'm here to help you find the right leads! ✦\n\nHere's what I can do:\n\n• **Find a person** — "John Smith, CTO at Stripe"\n• **People at a company** — "Everyone at Tesla"\n• **Decision-makers** — "C-suite at fintech startups in Dubai"\n• **Industry search** — "Marketing Directors in London"\n• **Analyze your website** — share your URL and I'll suggest who to target\n\nWhat are you looking for?`;
        }
    }

    /**
     * Detect whether a message is a generic COMPANY-TYPE search rather than a
     * LinkedIn-style role/industry/location search.
     *
     * A generic company search:
     *   "decision makers in hotels with swimming pools in Dubai"
     *   "GMs at 5-star resorts in Abu Dhabi"
     *   "CEOs of construction companies in Saudi Arabia"
     *   "owners of gyms and fitness studios in UAE"
     *
     * NOT a generic company search:
     *   "marketing directors in Dubai"      — direct LinkedIn role search
     *   "CTOs at tech startups"             — LinkedIn industry search
     *   "John Smith at Tesla"               — specific person
     *   "all employees at Apple"            — specific company
     */
    _isGenericCompanySearch(message) {
        const lower = message.toLowerCase();

        // ── 1. Contains a company category noun ──────────────────────────────────
        const COMPANY_TYPE_PATTERN = /\b(hotel|resort|hospital|clinic|pharmacy|school|university|college|bank|restaurant|cafe|coffee\s*shop|salon|spa|gym|fitness\s*(studio|center|club)|mall|shopping\s*(center|centre|mall)|construction\s*(firm|company)|real\s*estate\s*(agenc|compan|firm|developer)|property\s*(developer|management|firm)|law\s*firm|accounting\s*firm|insurance\s*(compan|firm|broker)|retailer|retail\s*(store|shop|chain)|supermarket|car\s*(dealership|showroom)|automotive|manufact|factory|factories|warehouse|startup|tech\s*compan|software\s*compan|recruitment\s*agenc|staffing\s*agenc|advertising\s*agenc|marketing\s*agenc|pr\s*firm|logistics\s*compan|shipping\s*compan|freight\s*compan|travel\s*agenc|tourism\s*compan)\w*/i;
        if (!COMPANY_TYPE_PATTERN.test(message)) return false;

        // ── 2. Contains a location ───────────────────────────────────────────────
        const HAS_LOCATION = /\b(in|from|across|based in|located in|around|within)\s+\w+/i.test(message)
            || /\b(dubai|uae|abu dhabi|sharjah|ajman|fujairah|ras al khaimah|riyadh|jeddah|dammam|khobar|saudi|ksa|qatar|doha|kuwait|bahrain|manama|muscat|oman|london|uk|new york|usa|singapore|india|mumbai|delhi|bangalore|cairo|egypt|beirut|lebanon|jordan|amman|istanbul|turkey|australia|sydney|canada|toronto|germany|france|paris)\b/i.test(lower);

        if (!HAS_LOCATION) return false;

        // ── 3. Contains an attribute qualifier (makes this clearly company-type, not LinkedIn role) ──
        // Covers: "which have", "that have", "with pools", "having X", "that offer", "featuring" etc.
        const HAS_ATTRIBUTE_QUALIFIER = /\b(with\b|having\b|which\s+(have|has|had|contain|offer|provide|include|feature)|that\s+(have|has|had|offer|provide|sell|serve|include|feature|contain|are|is)|featuring\b|equipped\s+with|known\s+for|famous\s+for|speciali[sz]ing\s+in|5[-\s]?star|\d+[-\s]?star|luxury|boutique|premium|high[-\s]end|budget|affordable|independent|family[-\s]owned|franchise|chain|group)\b/i.test(message);
        if (HAS_ATTRIBUTE_QUALIFIER) return true;

        // ── 4. Generic company plural nouns ─────────────────────────────────────
        const HAS_GENERIC_COMPANY_WORD = /\b(companies|businesses|firms|agencies|stores|establishments|outlets|chains|brands|operators|venues|properties|facilities)\b/i.test(lower);
        if (HAS_GENERIC_COMPANY_WORD) return true;

        // ── 5. Explicit "decision maker" phrasing with company type ─────────────
        const HAS_DECISION_MAKER_PHRASE = /\b(decision[\s-]?maker|gm\b|general\s*manager|managing\s*director|md\b|ceo\b|owner\b|proprietor|director\s+of|head\s+of|vp\s+of|vice\s*president|operations\s*manager)\b/i.test(lower);
        if (HAS_DECISION_MAKER_PHRASE) return true;

        return false;
    }

    /** Build a readable confirmation when triggering a search */
    _buildSearchConfirmText(targeting, originalMessage) {
        const parts = [];
        if (targeting.keywords?.length) parts.push(`👤 **Person** — ${Array.isArray(targeting.keywords) ? targeting.keywords.join(', ') : targeting.keywords}`);
        if (targeting.job_titles?.length) parts.push(`🎯 **Titles** — ${targeting.job_titles.join(', ')}`);
        if (targeting.company_names?.length) parts.push(`🏢 **Company** — ${targeting.company_names.join(', ')}`);
        if (targeting.industries?.length) parts.push(`🏭 **Industry** — ${targeting.industries.join(', ')}`);
        if (targeting.locations?.length) parts.push(`📍 **Location** — ${targeting.locations.join(', ')}`);

        if (!parts.length) {
            return `Scanning LinkedIn for leads...\n\nFetching profiles now...`;
        }
        return `✦ **Searching LinkedIn for:**\n\n${parts.join('\n')}\n\nFetching profiles now...`;
    }
}

module.exports = new LeadChatService();
