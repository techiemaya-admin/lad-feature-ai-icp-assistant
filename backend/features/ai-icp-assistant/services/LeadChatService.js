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
 *
 * Self-contained within ai-icp-assistant — no imports from other feature repos.
 * LAD Architecture: Service Layer — no SQL, no HTTP framework logic.
 */

const geminiClientService = require('./gemini-client.service');
const logger = require('../utils/logger');

// ─── Intent labels ────────────────────────────────────────────────────────────
const INTENTS = {
    SEARCH_LEADS: 'search_leads',      // "find me marketing directors in Paris"
    CONTEXT_SEARCH: 'context_search',    // "find those leads" / "yes search" — use history
    REFINE_LOCATION: 'refine_location',   // "try London instead"
    REFINE_TITLE: 'refine_title',      // "change to CTO"
    REFINE_INDUSTRY: 'refine_industry',   // "switch to healthcare"
    CLARIFY_LOCATION: 'clarify_location',  // answering a pending "which location?" prompt
    CLARIFY_TITLE: 'clarify_title',     // answering a pending "which title?" prompt
    CLARIFY_INDUSTRY: 'clarify_industry',  // answering a pending "which industry?" prompt
    CAMPAIGN_QUESTION: 'campaign_question', // "how many days should I run?"
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

// ─── Main class ───────────────────────────────────────────────────────────────
class LeadChatService {
    /**
     * Main entry — process a user message given the current search context.
     *
     * @param {Object}      params
     * @param {string}      params.message          - Current user message
     * @param {Array}       params.history           - Recent messages [{role, text}]
     * @param {Object|null} params.currentTargeting  - Active targeting
     * @param {string|null} params.pendingIntent     - null | 'location' | 'title' | 'industry'
     * @returns {Promise<Object>} { response, newSearch, updatedTargeting, pendingIntent, options }
     */
    async processMessage({ message, history = [], currentTargeting = null, pendingIntent = null }) {
        try {
            // Step 1: Fast-path check for trigger phrases (before calling Gemini)
            const isTrigger = TRIGGER_PHRASES.some(re => re.test(message.trim()));

            // Step 2: Detect intent
            const intent = isTrigger
                ? { type: INTENTS.CONTEXT_SEARCH, value: null }
                : await this._detectIntent(message, currentTargeting, pendingIntent, history);

            logger.info('[LeadChatService] Intent', { type: intent.type, msg: message.substring(0, 80), isTrigger });

            // Step 3: Route
            switch (intent.type) {

                // ── User describes leads directly (new full query) ─────────────────
                case INTENTS.SEARCH_LEADS: {
                    const targeting = await this._extractTargetingFromMessage(message, history);
                    return {
                        response: this._buildSearchConfirmText(targeting, message),
                        newSearch: true,
                        updatedTargeting: targeting,
                        pendingIntent: null,
                        options: [],
                    };
                }

                // ── Trigger phrase: extract targeting from conversation history ─────
                case INTENTS.CONTEXT_SEARCH: {
                    const targeting = await this._extractTargetingFromHistory(history, currentTargeting);

                    if (!targeting || (!targeting.job_titles?.length && !targeting.industries?.length && !targeting.locations?.length)) {
                        return {
                            response: `🎯 I'd love to find those leads! Could you describe who you're looking for? For example:\n\n• "Event Managers in Dubai"\n• "HR Directors at corporate companies in UAE"`,
                            newSearch: false,
                            updatedTargeting: currentTargeting,
                            pendingIntent: null,
                            options: [],
                        };
                    }

                    return {
                        response: this._buildSearchConfirmText(targeting, message),
                        newSearch: true,
                        updatedTargeting: targeting,
                        pendingIntent: null,
                        options: [],
                    };
                }

                // ── Refine location only ───────────────────────────────────────────
                case INTENTS.REFINE_LOCATION: {
                    if (intent.value) {
                        const updatedTargeting = { ...(currentTargeting || {}), locations: [intent.value] };
                        return {
                            response: `📍 Updated location to **${intent.value}**. Searching for leads there now...`,
                            newSearch: true,
                            updatedTargeting,
                            pendingIntent: null,
                            options: [],
                        };
                    }
                    return {
                        response: `📍 Sure! Which location would you like to search in?`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: 'location',
                        options: [],
                    };
                }

                // ── Refine job title only ──────────────────────────────────────────
                case INTENTS.REFINE_TITLE: {
                    if (intent.value) {
                        const updatedTargeting = { ...(currentTargeting || {}), job_titles: [intent.value] };
                        return {
                            response: `🎯 Updated job title to **${intent.value}**. Finding those leads now...`,
                            newSearch: true,
                            updatedTargeting,
                            pendingIntent: null,
                            options: [],
                        };
                    }
                    return {
                        response: `🎯 What job title or role would you like to target instead?`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: 'title',
                        options: [],
                    };
                }

                // ── Refine industry only ───────────────────────────────────────────
                case INTENTS.REFINE_INDUSTRY: {
                    if (intent.value) {
                        const updatedTargeting = { ...(currentTargeting || {}), industries: [intent.value] };
                        return {
                            response: `🏭 Updated industry to **${intent.value}**. Searching now...`,
                            newSearch: true,
                            updatedTargeting,
                            pendingIntent: null,
                            options: [],
                        };
                    }
                    return {
                        response: `🏭 Which industry would you like to target?`,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: 'industry',
                        options: [],
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
                    };
                }

                // ── Campaign question ──────────────────────────────────────────────
                case INTENTS.CAMPAIGN_QUESTION: {
                    const answer = await this._answerCampaignQuestion(message, currentTargeting);
                    return {
                        response: answer,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: null,
                        options: [],
                    };
                }

                // ── General / fallback ─────────────────────────────────────────────
                case INTENTS.GENERAL_Q:
                default: {
                    const answer = await this._answerGeneralQuestion(message, currentTargeting, history);
                    return {
                        response: answer,
                        newSearch: false,
                        updatedTargeting: currentTargeting,
                        pendingIntent: null,
                        options: [],
                    };
                }
            }

        } catch (error) {
            logger.error('[LeadChatService] processMessage error', { error: error.message });
            return {
                response: `I had a bit of trouble with that. Could you rephrase?\n\n• "Find Event Managers in Dubai"\n• "Change location to Abu Dhabi"\n• "How long should my campaign run?"`,
                newSearch: false,
                updatedTargeting: currentTargeting,
                pendingIntent: null,
                options: [],
            };
        }
    }

    // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

    /**
     * Detect intent using Gemini with keyword fallback.
     * Accepts history so Gemini can consider prior context.
     */
    async _detectIntent(message, currentTargeting, pendingIntent, history = []) {
        // Pending clarification bypasses Gemini entirely
        if (pendingIntent === 'location') return { type: INTENTS.CLARIFY_LOCATION };
        if (pendingIntent === 'title') return { type: INTENTS.CLARIFY_TITLE };
        if (pendingIntent === 'industry') return { type: INTENTS.CLARIFY_INDUSTRY };

        const targetingCtx = currentTargeting
            ? `Current targeting: titles=${JSON.stringify(currentTargeting.job_titles)}, industries=${JSON.stringify(currentTargeting.industries)}, locations=${JSON.stringify(currentTargeting.locations)}`
            : 'No current targeting set.';

        const recentHistory = history.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 200)}`).join('\n');

        const prompt = `You are an AI assistant for a LinkedIn lead generation tool.

${targetingCtx}

Recent conversation:
${recentHistory || '(none)'}

User message: "${message}"

Classify the user's intent as exactly ONE of these:
- "search_leads"      — User clearly describes new leads to find WITH specific details (titles/industry/location in the message itself)
- "context_search"    — User wants to search based on what was discussed in the conversation (e.g. "find those leads", "search now", "yes go ahead")
- "refine_location"   — User wants to change ONLY the location
- "refine_title"      — User wants to change ONLY the job title
- "refine_industry"   — User wants to change ONLY the industry
- "campaign_question" — User asks about campaigns, scheduling, duration, daily limits, connection messages
- "general_q"         — Any other general question, website analysis, advice request, or follow-up

IMPORTANT: If the message is short (under 6 words) and contains "find", "search", "go" or similar action words without specific lead details → use "context_search".

Respond ONLY with valid JSON:
{"type":"<intent>","value":"<extracted value if applicable, else null>","reasoning":"<one line>"}`;

        try {
            const raw = await geminiClientService.generateContent(prompt);
            const cleaned = raw.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return { type: parsed.type || INTENTS.GENERAL_Q, value: parsed.value || null };
        } catch (e) {
            logger.warn('[LeadChatService] Intent detection fallback', { error: e.message });
            const lower = message.toLowerCase();
            if (/\b(campaign|schedule|daily|limit|days|run|duration|connection message)\b/.test(lower)) return { type: INTENTS.CAMPAIGN_QUESTION };
            if (/\b(try|change|switch|update|different)\b.*(location|city|country|place)/i.test(message)) return { type: INTENTS.REFINE_LOCATION };
            if (/\b(try|change|switch|update|different)\b.*(title|role|position|job)/i.test(message)) return { type: INTENTS.REFINE_TITLE };
            if (/\b(try|change|switch|update)\b.*(industry|sector|field)/i.test(message)) return { type: INTENTS.REFINE_INDUSTRY };
            if (/\b(cto|cfo|coo|ceo|vp\s|director|manager|engineer|developer)\b/i.test(message) && message.length > 15) return { type: INTENTS.SEARCH_LEADS };
            return { type: INTENTS.GENERAL_Q };
        }
    }

    /**
     * Extract targeting from a direct user message (e.g. "Marketing directors in London").
     * Also uses history to fill in missing fields (e.g. location mentioned earlier).
     */
    async _extractTargetingFromMessage(message, history = []) {
        const historyCtx = history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 300)}`).join('\n');

        const prompt = `Extract LinkedIn lead targeting from this search request.

User message: "${message}"

Recent conversation context (use this to fill in missing fields):
${historyCtx || '(none)'}

Rules:
- Extract job titles, industries, locations, keywords from the message
- If location is NOT in the message but is clearly mentioned in recent conversation context, use that location
- If industry is NOT in the message but is clearly mentioned in recent conversation context, use that industry
- Use formal job title names (e.g. "Marketing Director" not "marketing directors")
- For UAE/Dubai companies, default location to "Dubai, United Arab Emirates" if no other location specified

Respond ONLY with valid JSON:
{
  "job_titles": ["array of specific job titles"],
  "industries": ["array of industries"],
  "locations": ["array of city/country strings"],
  "keywords": ["array of additional keywords"],
  "profile_language": []
}`;

        try {
            const raw = await geminiClientService.generateContent(prompt);
            const cleaned = raw.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return {
                job_titles: parsed.job_titles || [],
                industries: parsed.industries || [],
                locations: parsed.locations || [],
                keywords: parsed.keywords || [],
                profile_language: parsed.profile_language || [],
            };
        } catch (e) {
            logger.warn('[LeadChatService] Targeting extraction from message failed', { error: e.message });
            return { job_titles: [], industries: [], locations: [], keywords: [message], profile_language: [] };
        }
    }

    /**
     * KEY FIX: Extract targeting entirely from conversation HISTORY.
     * Used when the user says "find those leads" / "yes search" without repeating details.
     * Reads AI's previous suggestions for industries, roles, and location.
     */
    async _extractTargetingFromHistory(history = [], currentTargeting = null) {
        if (!history || history.length === 0) return currentTargeting;

        // Build full conversation context for Gemini to scan
        const fullHistory = history.slice(-10)
            .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 500)}`)
            .join('\n');

        const prompt = `You are extracting LinkedIn lead targeting parameters from a conversation.

Read the following conversation and extract the BEST targeting based on what was discussed.
Pay special attention to:
- Industries mentioned or suggested by the AI
- Job titles / roles mentioned or suggested by the AI  
- Locations mentioned (company location, website location, city/country)
- If a website like "plutotravels.ae" is mentioned → location is Dubai, UAE

Conversation:
${fullHistory}

Extract the targeting that the user should search for based on the conversation above.
If the AI suggested specific industries and roles, use those.
If a UAE/Dubai company was mentioned, use "Dubai, United Arab Emirates" as location.

Respond ONLY with valid JSON:
{
  "job_titles": ["up to 3 most relevant job titles"],
  "industries": ["up to 2 most relevant industries"],
  "locations": ["primary location"],
  "keywords": [],
  "profile_language": [],
  "reasoning": "one sentence explaining the choices"
}`;

        try {
            const raw = await geminiClientService.generateContent(prompt);
            const cleaned = raw.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);

            logger.info('[LeadChatService] Extracted targeting from history', {
                titles: parsed.job_titles,
                industries: parsed.industries,
                locations: parsed.locations,
                reasoning: parsed.reasoning,
            });

            // Merge with currentTargeting — never overwrite a field that's already set
            // unless the history extraction gave a better value
            return {
                job_titles: parsed.job_titles?.length ? parsed.job_titles : (currentTargeting?.job_titles || []),
                industries: parsed.industries?.length ? parsed.industries : (currentTargeting?.industries || []),
                locations: parsed.locations?.length ? parsed.locations : (currentTargeting?.locations || []),
                keywords: parsed.keywords?.length ? parsed.keywords : (currentTargeting?.keywords || []),
                profile_language: parsed.profile_language?.length ? parsed.profile_language : (currentTargeting?.profile_language || []),
            };
        } catch (e) {
            logger.warn('[LeadChatService] History targeting extraction failed', { error: e.message });
            return currentTargeting;
        }
    }

    /** Answer a campaign-related question with Gemini */
    async _answerCampaignQuestion(message, currentTargeting) {
        const ctx = currentTargeting
            ? `The user is targeting: ${currentTargeting.job_titles?.join(', ') || 'any titles'} in ${currentTargeting.industries?.join(', ') || 'any industry'}, located in ${currentTargeting.locations?.join(', ') || 'any location'}.`
            : '';

        const prompt = `You are an expert LinkedIn outreach campaign advisor.
${ctx}

User question: "${message}"

Answer helpfully and concisely (3-5 sentences). Give specific actionable advice.
- Duration: 2-4 weeks typical
- Daily limit: 10-25 connections/day is safe. Our system auto-respects LinkedIn limits
- Connection messages: Under 300 chars, personalize with first name
- Schedule: Mon-Fri gets better response rates
Keep tone conversational and friendly. Use emojis sparingly.`;

        try {
            return await geminiClientService.generateContent(prompt);
        } catch (e) {
            return `📅 **Duration**: 2–4 weeks works well for most campaigns\n🔢 **Daily limit**: 10–25 connections/day to stay within LinkedIn's safe limits\n✉️ **Messages**: Keep under 300 characters and personalize with their name\n📆 **Schedule**: Monday–Friday gets the best response rates`;
        }
    }

    /** Answer a general question or web analysis request */
    async _answerGeneralQuestion(message, currentTargeting, history) {
        const recentHistory = (history || []).slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 300)}`).join('\n');
        const ctx = currentTargeting
            ? `Current targeting: ${currentTargeting.job_titles?.join(', ') || 'any titles'} in ${currentTargeting.industries?.join(', ') || 'any industry'}, ${currentTargeting.locations?.join(', ') || 'any location'}.`
            : 'No specific targeting set yet.';

        const prompt = `You are an AI Lead Finder assistant for a LinkedIn outreach tool.

Context: ${ctx}
Recent conversation:
${recentHistory || '(none)'}

User: "${message}"

If the user shares a website URL or describes their business, analyze it and suggest:
1. The most relevant industries to target on LinkedIn (use LinkedIn/Apollo industry names)
2. The most relevant job titles / decision-maker roles to target
3. The most relevant location (infer from domain if possible — .ae = UAE/Dubai, .uk = UK, etc.)

Then invite the user to search for those leads by saying something like "Would you like me to find [role] leads in [location]?"

Keep tone friendly, professional, and helpful. Max 8 sentences.`;

        try {
            return await geminiClientService.generateContent(prompt);
        } catch (e) {
            return `I'm here to help you find the perfect leads! 🎯\n\nYou can:\n• Ask me to find leads — e.g. "Find Event Managers in Dubai"\n• Refine your search — e.g. "Try Abu Dhabi instead"\n• Ask about campaign setup\n\nWhat would you like to do?`;
        }
    }

    /** Build a readable confirmation when triggering a search */
    _buildSearchConfirmText(targeting, originalMessage) {
        const parts = [];
        if (targeting.job_titles?.length) parts.push(`🎯 **Titles:** ${targeting.job_titles.join(', ')}`);
        if (targeting.industries?.length) parts.push(`🏭 **Industry:** ${targeting.industries.join(', ')}`);
        if (targeting.locations?.length) parts.push(`📍 **Location:** ${targeting.locations.join(', ')}`);
        if (!parts.length && targeting.keywords?.length) parts.push(`🔑 **Keywords:** ${targeting.keywords.join(', ')}`);

        if (!parts.length) {
            return `Searching LinkedIn for leads...\n\nFetching results now...`;
        }
        return `✨ **Searching LinkedIn for:**\n${parts.join('\n')}\n\nFetching profiles now...`;
    }
}

module.exports = new LeadChatService();
