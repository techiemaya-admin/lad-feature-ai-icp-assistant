/**
 * Gemini Industry Classifier Service
 * Maps user's industry input to Apollo.io's standardized taxonomy
 */
// Silent logger (console logs removed for production)
const logger = {
  info: () => {},
  error: () => {}
};
class GeminiIndustryClassifier {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
    this.systemPrompt = `You are an industry classification expert that helps identify the exact industry category for a business. Your goal is to analyze user input about their business and return the most accurate industry name from the standardized list provided.
## Industry Format
Use these exact industry names (spelling and formatting matter):
- **Information Technology and Services** (not just "IT" or "Tech")
- **Computer Software** (not "Software Development" or "SaaS")
- **Marketing and Advertising** (not "Marketing Agency")
- **Internet** (for internet-based businesses)
- **Financial Services** (not "Finance")
- **Hospital & Health Care** (not "Healthcare")
- **Health, Wellness and Fitness** (for gyms, fitness centers)
- **Retail** (for retail businesses)
- **Real Estate** (exact phrasing)
- **Construction** (for construction industry)
- **Manufacturing** (for manufacturing companies)
- **Telecommunications** (not "Telecom")
- **Hospitality** (for hotels, restaurants, etc.)
- **Education Management** (not "Education")
- **Professional Services** (for consulting, legal, etc.)
- **E-Learning** (for online education)
- **Automotive** (for car industry)
- **Pharmaceuticals** (not "Pharma")
- **Banking** (separate from Financial Services)
- **Insurance** (separate from Financial Services)
- **Logistics and Supply Chain** (not just "Logistics")
- **Food & Beverages** (with ampersand)
- **Consumer Goods** (not "CPG" alone)
- **Media & Entertainment** (with ampersand)
- **Biotechnology** (not "Biotech")
- **Oil & Energy** (with ampersand)
- **Nonprofit Organization Management** (not just "Nonprofit")
- **Government Administration** (not "Government")
- **Legal Services** (separate from Professional Services)
- **Architecture & Planning** (with ampersand)
- **Civil Engineering** (separate industry)
- **Electrical/Electronic Manufacturing** (with slash)
- **Medical Devices** (separate from Healthcare)
## Common Mappings
Technology: "SaaS" → Computer Software, "IT services" → Information Technology and Services
Marketing: "Digital marketing" → Marketing and Advertising
Finance: "Fintech" → Financial Services, "Bank" → Banking
Healthcare: "Healthcare" → Hospital & Health Care, "Biotech" → Biotechnology
E-commerce: "Online store" → Retail OR Internet
## Important Context
- "fitness" OR "gym" OR "fitness center" → **Health, Wellness and Fitness** (NOT Hospital & Health Care)
- "hospital" OR "healthcare provider" OR "medical" → Hospital & Health Care
- "tech" OR "software" OR "saas" → Computer Software
- "retail" OR "store" OR "shop" → **Retail** (EXACT MATCH - not Computer Software or Internet)
- Be confident - only mark as 'low' confidence if genuinely ambiguous
- Only include clarifying_question if the input is truly unclear
- Write reasoning in natural, user-friendly language (NO technical terms like "Apollo", "taxonomy", "API", etc.)
- **CRITICAL**: When user says "retail", ALWAYS return "Retail" industry - this is an exact match
## Response Format
Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "apollo_industry": "Exact Industry Name",
  "confidence": "high|medium|low",
  "reasoning": "Brief user-friendly explanation (e.g., 'This matches companies in the software industry' NOT 'This matches Apollo.io industry')",
  "alternative_industries": ["Alt 1", "Alt 2"],
  "clarifying_question": "Only if confidence is low AND input is ambiguous"
}`;
  }
  /**
   * Classify user's industry input using Gemini AI
   * @param {string} userInput - User's description of their industry
   * @returns {Promise<Object>} Classification result
   */
  async classifyIndustry(userInput) {
    try {
      if (!this.geminiApiKey) {
        logger.warn('[Gemini Classifier] API key not configured, returning fallback');
        return this._getFallbackClassification(userInput);
      }
      
      // PRE-CHECK: Fast path for exact keyword matches (avoid Gemini API misclassifications)
      // This ensures critical industries like "Retail" are never misclassified
      const quickMatchResult = this._quickMatchIndustry(userInput);
      if (quickMatchResult) {
        logger.info('[Gemini Classifier] Quick match found for', { userInput, industry: quickMatchResult.apollo_industry });
        return {
          success: true,
          ...quickMatchResult,
          isFallback: false  // Not fallback, this is pre-checked
        };
      }
      
      logger.info('[Gemini Classifier] Classifying industry', { userInput });
      const response = await fetch(`${this.geminiEndpoint}?key=${this.geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${this.systemPrompt}\n\nUser Input: "${userInput}"\n\nProvide your classification in JSON format.`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          }
        })
      });
      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!generatedText) {
        throw new Error('No response from Gemini');
      }
      // Parse JSON from response (remove markdown code blocks if present)
      const jsonText = generatedText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const classification = JSON.parse(jsonText);
      logger.info('[Gemini Classifier] Classification result', {
        apollo_industry: classification.apollo_industry,
        confidence: classification.confidence
      });
      return {
        success: true,
        ...classification
      };
    } catch (error) {
      logger.error('[Gemini Classifier] Error classifying industry', {
        error: error.message,
        userInput
      });
      return this._getFallbackClassification(userInput);
    }
  }

  /**
   * Quick match for exact/common industry keywords (avoids Gemini misclassifications)
   * Returns early for high-confidence matches to prevent API from hallucinating
   * @private
   */
  _quickMatchIndustry(userInput) {
    const input = userInput.toLowerCase().trim();
    
    // Exact single-word matches for critical industries
    const exactMatches = {
      'retail': { apollo_industry: 'Retail', confidence: 'high', reasoning: 'Perfect match for retail business.' },
      'saas': { apollo_industry: 'Computer Software', confidence: 'high', reasoning: 'SaaS companies are software businesses.' },
      'healthcare': { apollo_industry: 'Hospital & Health Care', confidence: 'high', reasoning: 'Healthcare provider.' },
      'manufacturing': { apollo_industry: 'Manufacturing', confidence: 'high', reasoning: 'Manufacturing company.' },
      'fintech': { apollo_industry: 'Financial Services', confidence: 'high', reasoning: 'Financial technology company.' },
      'ecommerce': { apollo_industry: 'Retail', confidence: 'high', reasoning: 'E-commerce is retail business.' },
      'e-commerce': { apollo_industry: 'Retail', confidence: 'high', reasoning: 'E-commerce is retail business.' },
      'logistics': { apollo_industry: 'Logistics and Supply Chain', confidence: 'high', reasoning: 'Logistics company.' },
      'telecom': { apollo_industry: 'Telecommunications', confidence: 'high', reasoning: 'Telecommunications company.' },
      'insurance': { apollo_industry: 'Insurance', confidence: 'high', reasoning: 'Insurance company.' },
      'banking': { apollo_industry: 'Banking', confidence: 'high', reasoning: 'Banking institution.' },
      'pharma': { apollo_industry: 'Pharmaceuticals', confidence: 'high', reasoning: 'Pharmaceutical company.' },
      'automotive': { apollo_industry: 'Automotive', confidence: 'high', reasoning: 'Automotive industry.' },
      'hotel': { apollo_industry: 'Hospitality', confidence: 'high', reasoning: 'Hospitality business.' },
      'restaurant': { apollo_industry: 'Hospitality', confidence: 'high', reasoning: 'Food service and hospitality.' }
    };
    
    // Check exact match first
    if (exactMatches[input]) {
      return {
        ...exactMatches[input],
        alternative_industries: [],
        isFallback: true
      };
    }
    
    // Check if input starts with or contains critical keywords
    const criticalKeywords = [
      { keyword: 'retail', industry: 'Retail' },
      { keyword: 'ecommerce', industry: 'Retail' },
      { keyword: 'e-commerce', industry: 'Retail' }
    ];
    
    for (const { keyword, industry } of criticalKeywords) {
      if (input.includes(keyword)) {
        return {
          apollo_industry: industry,
          confidence: 'high',
          reasoning: `Matches ${industry} industry.`,
          alternative_industries: [],
          isFallback: true
        };
      }
    }
    
    return null; // No quick match, proceed with Gemini
  }

  /**
   * Get fallback classification when Gemini is unavailable
   * @private
   */
  _getFallbackClassification(userInput) {
    const input = userInput.toLowerCase();
    // Simple keyword-based fallback
    const fallbackMap = {
      'software|saas|app|tech|it|ai': {
        apollo_industry: 'Computer Software',
        confidence: 'medium',
        reasoning: 'This matches companies in the software and technology industry.',
        alternative_industries: ['Information Technology and Services', 'Internet']
      },
      'fitness|gym|wellness|health club|exercise|training': {
        apollo_industry: 'Health, Wellness and Fitness',
        confidence: 'high',
        reasoning: 'Perfect match for fitness centers, gyms, and wellness businesses.',
        alternative_industries: ['Hospital & Health Care', 'Professional Training & Coaching']
      },
      'marketing|advertising|seo|digital': {
        apollo_industry: 'Marketing and Advertising',
        confidence: 'high',
        reasoning: 'This fits businesses in marketing, advertising, and digital services.',
        alternative_industries: ['Internet', 'Media & Entertainment']
      },
      'finance|fintech|bank|investment': {
        apollo_industry: 'Financial Services',
        confidence: 'high',
        reasoning: 'This matches companies in finance and financial technology.',
        alternative_industries: ['Banking', 'Insurance']
      },
      'healthcare|medical|health|hospital': {
        apollo_industry: 'Hospital & Health Care',
        confidence: 'high',
        reasoning: 'This matches healthcare providers, hospitals, and medical services.',
        alternative_industries: ['Medical Devices', 'Pharmaceuticals']
      },
      'retail|ecommerce|e-commerce|store|retail business|retail company': {
        apollo_industry: 'Retail',
        confidence: 'high',
        reasoning: 'Perfect match for retail and e-commerce businesses selling to consumers.',
        alternative_industries: ['Internet', 'Consumer Goods']
      },
      'real estate|property': {
        apollo_industry: 'Real Estate',
        confidence: 'high',
        reasoning: 'Perfect match for real estate and property businesses.',
        alternative_industries: ['Construction']
      },
      'education|edtech|learning|training': {
        apollo_industry: 'E-Learning',
        confidence: 'medium',
        reasoning: 'This matches companies in education and online learning.',
        alternative_industries: ['Education Management', 'Professional Training & Coaching']
      },
      'consulting|professional services': {
        apollo_industry: 'Professional Services',
        confidence: 'high',
        reasoning: 'This fits consulting and professional service businesses.',
        alternative_industries: ['Management Consulting', 'Business Consulting']
      },
      'manufacturing|manufacturing|factory|production|industrial': {
        apollo_industry: 'Manufacturing',
        confidence: 'high',
        reasoning: 'This matches manufacturing and industrial production companies.',
        alternative_industries: ['Electrical/Electronic Manufacturing', 'Automotive']
      },
      'construction|building|contractor|civil': {
        apollo_industry: 'Construction',
        confidence: 'high',
        reasoning: 'This matches construction and building companies.',
        alternative_industries: ['Architecture & Planning', 'Civil Engineering']
      },
      'legal|law firm|attorney|lawyer': {
        apollo_industry: 'Legal Services',
        confidence: 'high',
        reasoning: 'This matches law firms and legal service providers.',
        alternative_industries: ['Professional Services']
      },
      'automotive|car|vehicle|motor|auto': {
        apollo_industry: 'Automotive',
        confidence: 'high',
        reasoning: 'This matches automotive and motor vehicle companies.',
        alternative_industries: ['Manufacturing', 'Electrical/Electronic Manufacturing']
      },
      'telecom|telecommunications|phone|wireless|mobile network': {
        apollo_industry: 'Telecommunications',
        confidence: 'high',
        reasoning: 'This matches telecommunications and mobile network providers.',
        alternative_industries: ['Internet', 'Information Technology and Services']
      },
      'hotel|hospitality|restaurant|food|catering|cafe|bar': {
        apollo_industry: 'Hospitality',
        confidence: 'high',
        reasoning: 'This matches hospitality, hotel, and food service businesses.',
        alternative_industries: ['Food & Beverages', 'Consumer Goods']
      },
      'pharmaceutical|pharma|drug|medicine': {
        apollo_industry: 'Pharmaceuticals',
        confidence: 'high',
        reasoning: 'This matches pharmaceutical and drug manufacturing companies.',
        alternative_industries: ['Medical Devices', 'Hospital & Health Care']
      },
      'biotech|biotechnology|life science': {
        apollo_industry: 'Biotechnology',
        confidence: 'high',
        reasoning: 'This matches biotechnology and life science companies.',
        alternative_industries: ['Pharmaceuticals', 'Medical Devices']
      },
      'medical device|medtech|health device': {
        apollo_industry: 'Medical Devices',
        confidence: 'high',
        reasoning: 'This matches medical device manufacturers and healthcare technology.',
        alternative_industries: ['Biotechnology', 'Pharmaceuticals']
      },
      'insurance|insurer|claims': {
        apollo_industry: 'Insurance',
        confidence: 'high',
        reasoning: 'This matches insurance and insurance service companies.',
        alternative_industries: ['Financial Services', 'Banking']
      },
      'bank|banking': {
        apollo_industry: 'Banking',
        confidence: 'high',
        reasoning: 'This matches banks and banking institutions.',
        alternative_industries: ['Financial Services', 'Insurance']
      },
      'logistics|supply chain|shipping|warehouse|delivery': {
        apollo_industry: 'Logistics and Supply Chain',
        confidence: 'high',
        reasoning: 'This matches logistics, supply chain, and shipping companies.',
        alternative_industries: ['Transportation', 'Retail']
      },
      'food|beverage|drink|brewery|winery': {
        apollo_industry: 'Food & Beverages',
        confidence: 'high',
        reasoning: 'This matches food and beverage companies.',
        alternative_industries: ['Hospitality', 'Consumer Goods']
      },
      'consumer goods|cpg|fmcg': {
        apollo_industry: 'Consumer Goods',
        confidence: 'high',
        reasoning: 'This matches consumer goods and packaged goods companies.',
        alternative_industries: ['Retail', 'Food & Beverages']
      },
      'media|entertainment|film|tv|broadcast|music|publishing': {
        apollo_industry: 'Media & Entertainment',
        confidence: 'high',
        reasoning: 'This matches media, entertainment, and publishing companies.',
        alternative_industries: ['Marketing and Advertising', 'Internet']
      },
      'energy|oil|gas|utility|power|renewable': {
        apollo_industry: 'Oil & Energy',
        confidence: 'high',
        reasoning: 'This matches oil, gas, energy, and utility companies.',
        alternative_industries: ['Manufacturing']
      },
      'nonprofit|ngo|charity|non-profit': {
        apollo_industry: 'Nonprofit Organization Management',
        confidence: 'high',
        reasoning: 'This matches nonprofit organizations and charities.',
        alternative_industries: ['Government Administration']
      },
      'government|public sector|federal|state|local': {
        apollo_industry: 'Government Administration',
        confidence: 'high',
        reasoning: 'This matches government agencies and public sector organizations.',
        alternative_industries: ['Nonprofit Organization Management']
      },
      'architecture|architect|design|planning|urban': {
        apollo_industry: 'Architecture & Planning',
        confidence: 'high',
        reasoning: 'This matches architecture and urban planning firms.',
        alternative_industries: ['Construction', 'Civil Engineering']
      },
      'civil engineering|engineer|infrastructure': {
        apollo_industry: 'Civil Engineering',
        confidence: 'high',
        reasoning: 'This matches civil engineering and infrastructure companies.',
        alternative_industries: ['Architecture & Planning', 'Construction']
      }
    };
    for (const [pattern, classification] of Object.entries(fallbackMap)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(input)) {
        return {
          success: true,
          ...classification,
          clarifying_question: 'Could you provide more details about your specific industry focus for better targeting?',
          isFallback: true
        };
      }
    }
    // Ultimate fallback
    return {
      success: true,
      apollo_industry: 'Professional Services',
      confidence: 'low',
      reasoning: 'I need more details to accurately identify your industry.',
      alternative_industries: ['Information Technology and Services', 'Marketing and Advertising', 'Financial Services'],
      clarifying_question: 'Could you describe your industry more specifically? For example, are you in technology, marketing, finance, healthcare, or another sector?',
      isFallback: true
    };
  }
  /**
   * Get suggested industries based on partial input
   * @param {string} partialInput - Partial industry name
   * @returns {Array<string>} List of matching Apollo industries
   */
  getSuggestedIndustries(partialInput) {
    const apolloIndustries = [
      'Computer Software',
      'Information Technology and Services',
      'Marketing and Advertising',
      'Financial Services',
      'Hospital & Health Care',
      'Retail',
      'Real Estate',
      'Construction',
      'Manufacturing',
      'E-Learning',
      'Professional Services',
      'Internet',
      'Telecommunications',
      'Banking',
      'Insurance',
      'Pharmaceuticals',
      'Biotechnology',
      'Medical Devices',
      'Legal Services',
      'Management Consulting',
      'Media & Entertainment',
      'Food & Beverages',
      'Consumer Goods',
      'Logistics and Supply Chain',
      'Automotive',
      'Oil & Energy',
      'Architecture & Planning',
      'Hospitality',
      'Education Management',
      'Nonprofit Organization Management',
      'Government Administration'
    ];
    const input = partialInput.toLowerCase();
    return apolloIndustries.filter(industry =>
      industry.toLowerCase().includes(input)
    );
  }
}
module.exports = new GeminiIndustryClassifier();
