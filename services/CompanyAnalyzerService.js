const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../../../core/utils/logger');
const geminiClientService = require('./gemini-client.service');
const UnipileBaseService = require('../../campaigns/services/UnipileBaseService');

class CompanyAnalyzerService extends UnipileBaseService {
    constructor() {
        super();
    }

    /**
     * Get account ID for a tenant.
     * Resolves the first connected LinkedIn account's unipile_account_id.
     */
    async getAccountIdForTenant(tenantId, context) {
        const { pool } = require('../../../shared/database/connection');
        const { getSchema } = require('../../../core/utils/schemaHelper');
        const schema = getSchema(context);

        const result = await pool.query(
            `SELECT provider_account_id FROM ${schema}.social_linkedin_accounts 
       WHERE tenant_id = $1 AND status = 'active' AND is_deleted = false
       AND provider_account_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
            [tenantId]
        );

        if (result.rows.length === 0) {
            throw new Error('No active LinkedIn account found. Please connect a LinkedIn account first.');
        }

        return result.rows[0].provider_account_id;
    }

    /**
     * Extract profile identifier from LinkedIn URL
     */
    extractProfileIdentifier(url) {
        const cleanUrl = url.trim().replace(/\/$/, '');
        const companyMatch = cleanUrl.match(/linkedin\.com\/company\/([^/?]+)/i);
        if (companyMatch) return { identifier: companyMatch[1], isCompany: true };
        const match = cleanUrl.match(/linkedin\.com\/in\/([^/?]+)/i);
        if (match) return { identifier: match[1], isCompany: false };
        return { identifier: cleanUrl.split('/').pop(), isCompany: false };
    }

    /**
     * Fetch top 10 recent posts for a company via Unipile
     */
    async fetchCompanyPosts(companyId, accountId) {
        try {
            const baseUrl = this.getBaseUrl();
            const headers = this.getAuthHeaders();

            const requestBody = {
                api: 'classic',
                category: 'posts',
                posted_by: {
                    company: [companyId]
                }
            };

            const response = await axios.post(
                `${baseUrl}/linkedin/search`,
                requestBody,
                { headers, params: { account_id: accountId } }
            );

            const posts = response.data?.items || response.data?.data?.items || [];
            return posts.slice(0, 10).map(p => p.text || p.content || p.description || p.message || '').filter(t => t.length > 20);
        } catch (error) {
            logger.warn('[CompanyAnalyzerService] Could not fetch company posts', { error: error.message });
            return [];
        }
    }

    /**
     * Fetch company profile via Unipile
     */
    async fetchCompanyInfo(identifier, accountId) {
        try {
            const baseUrl = this.getBaseUrl();
            const headers = this.getAuthHeaders();
            const url = `${baseUrl}/linkedin/company/${encodeURIComponent(identifier)}?account_id=${encodeURIComponent(accountId)}`;

            const response = await axios.get(url, { headers });
            const data = response.data;
            return {
                id: data.id || data.company_id || identifier,
                name: data.name || data.company_name,
                description: data.description || data.about || data.tagline || '',
                industry: Array.isArray(data.industry) ? data.industry.join(', ') : (data.industry || '')
            };
        } catch (error) {
            logger.error('[CompanyAnalyzerService] Error fetching company info', { error: error.message });
            return null;
        }
    }

    /**
     * Scrape the text from a website URL
     */
    async scrapeWebsite(url) {
        try {
            // Add protocol if missing
            const targetUrl = url.startsWith('http') ? url : `https://${url}`;
            const response = await axios.get(targetUrl, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            const html = response.data;
            const $ = cheerio.load(html);

            // Remove script, style, nav, footer, etc.
            $('script, style, nav, footer, header, noscript, iframe').remove();

            let text = $('body').text();
            text = text.replace(/\s+/g, ' ').trim();

            // Return max 5000 chars for prompt context size
            return text.substring(0, 5000);
        } catch (error) {
            logger.warn('[CompanyAnalyzerService] Could not scrape website', { url, error: error.message });
            return '';
        }
    }

    /**
     * Main method to analyze company and suggest ICP
     */
    async analyzeCompanyProfiles(linkedinUrl, websiteUrl, tenantId, context, history = [], message = '') {
        let companyPosts = [];
        let companyInfo = null;
        let websiteText = '';

        // 1. Fetch LinkedIn Data if provided
        if (linkedinUrl && this.isConfigured()) {
            try {
                const accountId = await this.getAccountIdForTenant(tenantId, context);
                const { identifier } = this.extractProfileIdentifier(linkedinUrl);

                companyInfo = await this.fetchCompanyInfo(identifier, accountId);
                if (companyInfo && companyInfo.id) {
                    companyPosts = await this.fetchCompanyPosts(companyInfo.id, accountId);
                }
            } catch (err) {
                logger.error('[CompanyAnalyzerService] LinkedIn extraction failed', { error: err.message });
            }
        }

        // 2. Fetch Website Data if provided
        if (websiteUrl) {
            websiteText = await this.scrapeWebsite(websiteUrl);
        }

        // 3. Prepare Prompt for Gemini
        let ctxContent = '';
        if (companyInfo) {
            ctxContent += `Company Name: ${companyInfo.name}\nIndustry: ${companyInfo.industry}\nDescription from LinkedIn: ${companyInfo.description}\n\n`;
        }
        if (companyPosts.length > 0) {
            ctxContent += `Recent LinkedIn Posts by Company:\n- ${companyPosts.join('\n- ')}\n\n`;
        }
        if (websiteText) {
            ctxContent += `Website Homepage Content:\n${websiteText}\n\n`;
        }

        const historyCtx = history.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text?.substring(0, 300)}`).join('\n');

        // ── Build Gemini prompt ───────────────────────────────────────────────
        // If scraping failed, fall back to Gemini's own general knowledge about
        // the domain / company rather than giving a "couldn't extract data" error.
        const hasScrapedData = !!ctxContent.trim();

        const dataSection = hasScrapedData
            ? `--- COMPANY DATA (scraped from LinkedIn / website) ---\n${ctxContent}\n--- END COMPANY DATA ---`
            : `--- NOTE ---\nI could not scrape live data from the provided URL(s), but I know this domain: "${websiteUrl || linkedinUrl}".
Use your general knowledge about what this company does, what industry it operates in, and what kind of B2B customers or partners they are likely to serve.
--- END NOTE ---`;

        const prompt = `You are an expert B2B Lead Generation Strategist and a helpful conversational AI assistant.

Your goal: figure out EXACTLY who this company's Ideal Customer Profile (ICP) is and suggest the best LinkedIn lead targeting.

CRITICAL RULE: LinkedIn is purely B2B. NEVER suggest targeting end-consumers or individuals just because they earn high salaries.
If the company is B2C (e.g. travel, retail, residential real estate), pivot to B2B referral partners — e.g. Corporate Travel Managers, HR Directors, Procurement Heads, Wealth Managers, Family Offices.

--- PREVIOUS CONVERSATION ---
${historyCtx || '(none)'}

--- USER'S LATEST MESSAGE ---
"${message}"

${dataSection}

Your response must:
1. Directly address what the user asked or said in their latest message.
2. Suggest 3-5 **specific B2B job titles** to target on LinkedIn (decision-makers or referral partners).
3. Suggest 2-3 **industries** to target.
4. Suggest the **best location** to search (infer from domain if possible — .ae = UAE/Dubai, .uk = UK, .sg = Singapore).
5. End with: "Would you like me to search for [job titles] in [location]?" as a friendly call to action.

Use bullet points for titles and industries. Keep it concise — 3 paragraphs max. Friendly, professional tone.`;

        try {
            return await geminiClientService.generateContent(prompt);
        } catch (e) {
            logger.error('[CompanyAnalyzerService] Gemini analysis failed', { error: e.message });
            return `I encountered an issue analyzing the company data right now, but from the links provided, I suggest targeting top decision-makers in the industries you serve. Could you manually describe the roles you'd like me to find?`;
        }
    }
}

module.exports = new CompanyAnalyzerService();
