/**
 * Intent Extractor
 * Extracts outreach intent from user messages
 */
const logger = require('../utils/logger');

let genAI = null;
let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
  }
} catch (error) {
  genAI = null;
}
class IntentExtractor {
  /**
   * Extract outreach intent from message
   */
  static async extractOutreachIntent(message, conversationHistory, currentContext) {
    if (!genAI) {
      return this.extractIntentFallback(message, currentContext);
    }
    try {
      const ContextManager = require('./ContextManager');
      const contextSummary = ContextManager.formatContextForAI(currentContext);
      const historySummary = conversationHistory
        .slice(-5)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
      const prompt = `Analyze this user message and extract outreach intent information.
Current context:
${contextSummary}
Recent conversation:
${historySummary || 'None'}
User message: "${message}"
Return ONLY a JSON object:
{
  "outreachType": "inbound" | "outbound" | null,
  "targetKnowledge": "known" | "discovery" | null,
  "inferredStrategy": "people_search" | "company_search" | "people_enrichment" | "unknown" | null,
  "roles": ["CEO", "CTO"] | null,
  "industries": ["Technology", "SaaS"] | null,
  "locations": ["Dubai", "San Francisco"] | null,
  "companies": ["Acme Corp", "Tech Inc"] | null,
  "linkedinUrls": ["https://linkedin.com/..."] | null,
  "problemStatement": "string" | null,
  "companySize": "smb" | "mid-market" | "enterprise" | null,
  "dealType": "smb" | "mid-market" | "enterprise" | null,
  "confidenceScore": 0-100
}
Rules:
- Only extract NEW information (don't repeat what's already in context)
- Extract arrays only if explicitly mentioned
- confidenceScore: How confident you are (0-100)
JSON response:`;
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text().trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const intent = JSON.parse(jsonMatch[0]);
        return intent;
      }
    } catch (error) {
      logger.warn('Intent extraction error:', error.message);
    }
    return this.extractIntentFallback(message, currentContext);
  }
  /**
   * Fallback intent extraction (rule-based)
   */
  static extractIntentFallback(message, currentContext) {
    const lower = message.toLowerCase();
    const intent = {};
    if (lower.match(/\b(inbound|incoming|respond|reply|follow.?up|leads? that|requests?)\b/)) {
      intent.outreachType = 'inbound';
    } else if (lower.match(/\b(outbound|proactive|reach out|contact|find new|search for|look for)\b/)) {
      intent.outreachType = 'outbound';
    }
    if (lower.match(/\b(already have|have profiles?|have linkedin|have names?|specific people|these companies|these people|list of)\b/)) {
      intent.targetKnowledge = 'known';
    } else if (lower.match(/\b(find|search|discover|new prospects?|need to find|looking for)\b/)) {
      intent.targetKnowledge = 'discovery';
    }
    const linkedinMatches = message.match(/linkedin\.com\/in\/[\w-]+/gi);
    if (linkedinMatches) {
      intent.linkedinUrls = linkedinMatches;
      intent.targetKnowledge = 'known';
    }
    const rolePatterns = [
      /\b(ceo|cto|cfo|coo|cmo|chief executive|chief technology|chief financial|chief operating|chief marketing)\b/gi,
      /\b(vp|vice president|director|manager|head of|founder|owner|president)\b/gi,
      /\b(marketing director|sales director|operations director|hr director)\b/gi
    ];
    const extractedRoles = [];
    rolePatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        extractedRoles.push(...matches.map(r => r.trim()));
      }
    });
    if (extractedRoles.length > 0) {
      intent.roles = [...new Set(extractedRoles.map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()))];
    }
    const locationPatterns = [
      /\b(dubai|abu dhabi|sharjah|uae|united arab emirates)\b/gi,
      /\b(new york|san francisco|los angeles|chicago|boston|seattle|austin|miami)\b/gi,
      /\b(london|paris|berlin|amsterdam|singapore|tokyo|sydney|toronto)\b/gi,
      /\b(usa|united states|uk|united kingdom|canada|australia|india)\b/gi
    ];
    const extractedLocations = [];
    locationPatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        extractedLocations.push(...matches.map(l => l.trim()));
      }
    });
    if (extractedLocations.length > 0) {
      intent.locations = [...new Set(extractedLocations.map(l => l.charAt(0).toUpperCase() + l.slice(1).toLowerCase()))];
    }
    const industryKeywords = [
      'technology', 'saas', 'software', 'fintech', 'healthcare', 'real estate',
      'construction', 'retail', 'manufacturing', 'education', 'consulting',
      'marketing', 'advertising', 'oil and gas', 'energy', 'logistics'
    ];
    const extractedIndustries = [];
    industryKeywords.forEach(industry => {
      if (lower.includes(industry)) {
        extractedIndustries.push(industry.charAt(0).toUpperCase() + industry.slice(1));
      }
    });
    if (extractedIndustries.length > 0) {
      intent.industries = extractedIndustries;
    }
    let confidence = 30;
    if (intent.outreachType) confidence += 20;
    if (intent.targetKnowledge) confidence += 20;
    if (intent.roles && intent.roles.length > 0) confidence += 10;
    if (intent.industries && intent.industries.length > 0) confidence += 10;
    if (intent.locations && intent.locations.length > 0) confidence += 10;
    if (intent.companies && intent.companies.length > 0) confidence += 10;
    if (intent.problemStatement) confidence += 10;
    if (intent.companySize) confidence += 5;
    if (intent.dealType) confidence += 5;
    intent.confidenceScore = Math.min(confidence, 80);
    return intent;
  }
  /**
   * Extract outreach type from message
   */
  static extractOutreachType(message) {
    const lower = message.toLowerCase();
    if (lower.match(/\b(inbound|incoming|leads come|respond to|follow.?up)\b/) || lower.includes('1')) {
      return 'inbound';
    }
    if (lower.match(/\b(outbound|reach out|proactively|contact|find new|discover)\b/) || lower.includes('2')) {
      return 'outbound';
    }
    return null;
  }
  /**
   * Extract target knowledge from message
   */
  static extractTargetKnowledge(message) {
    const lower = message.toLowerCase().trim();
    // Known target patterns - check phrases first (before word boundaries)
    if (lower.includes("i know") || 
        lower.includes("i have") || 
        lower.includes("i've got") ||
        lower.includes("already have") ||
        lower.includes("have profiles") ||
        lower.includes("have linkedin") ||
        lower.includes("have names") ||
        lower.includes("these companies") ||
        lower.includes("these people") ||
        lower.includes("my target") ||
        lower.includes("know my") ||
        lower.includes("know the")) {
      return 'known';
    }
    // Then check single words with word boundaries
    if (lower.match(/\b(yes|yeah|yep|yup|specific)\b/) || lower.includes('1')) {
      return 'known';
    }
    // Discovery patterns - expanded to catch "i dont know", "not sure", etc.
    // Check for "i dont know" or "i don't know" first (before word boundary check)
    if (lower.includes("i dont know") || 
        lower.includes("i don't know") || 
        lower.includes("i do not know") ||
        lower.includes("dont know") ||
        lower.includes("don't know")) {
      return 'discovery';
    }
    if (lower.match(/\b(no|nope|nah|not sure|unsure|discover|find new|need to find|looking for|ideal prospects|help me find|want to find|should discover|we discover|discover together)\b/) || 
        lower.includes('2')) {
      return 'discovery';
    }
    return null;
  }
  /**
   * Extract inbound source from message
   */
  static extractInboundSource(message) {
    const lower = message.toLowerCase();
    if (lower.match(/\b(website|form|web form|contact form)\b/)) return 'website';
    if (lower.match(/\b(whatsapp|whats app)\b/)) return 'whatsapp';
    if (lower.match(/\b(ads|advertising|google ads|facebook ads)\b/)) return 'ads';
    if (lower.match(/\b(crm|salesforce|hubspot|import)\b/)) return 'crm';
    if (lower.match(/\b(webhook|api|integration)\b/)) return 'webhook';
    return null;
  }
  /**
   * Extract yes/no from message
   */
  static extractYesNo(message) {
    const lower = message.toLowerCase().trim();
    if (lower.match(/^(yes|yep|yeah|yup|correct|right|that's right|sounds good|looks good|perfect|exactly|i do|i have)\b/)) {
      return true;
    }
    if (lower.match(/^(no|nope|nah|incorrect|wrong|not quite|that's not right|i don't|i don't have)\b/)) {
      return false;
    }
    return null;
  }
}
module.exports = IntentExtractor;
