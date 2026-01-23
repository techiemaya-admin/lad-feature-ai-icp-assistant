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
- Be confident - only mark as 'low' confidence if genuinely ambiguous
- Only include clarifying_question if the input is truly unclear
- Write reasoning in natural, user-friendly language (NO technical terms like "Apollo", "taxonomy", "API", etc.)
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
        confidence: 'medium',
        reasoning: 'This fits businesses in marketing, advertising, and digital services.',
        alternative_industries: ['Internet', 'Media & Entertainment']
      },
      'finance|fintech|bank|investment': {
        apollo_industry: 'Financial Services',
        confidence: 'medium',
        reasoning: 'This matches companies in finance and financial technology.',
        alternative_industries: ['Banking', 'Insurance']
      },
      'healthcare|medical|health|hospital': {
        apollo_industry: 'Hospital & Health Care',
        confidence: 'medium',
        reasoning: 'This matches healthcare providers, hospitals, and medical services.',
        alternative_industries: ['Medical Devices', 'Pharmaceuticals']
      },
      'retail|ecommerce|e-commerce|store': {
        apollo_industry: 'Retail',
        confidence: 'medium',
        reasoning: 'This fits businesses selling products directly to consumers.',
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
        confidence: 'medium',
        reasoning: 'This fits consulting and professional service businesses.',
        alternative_industries: ['Management Consulting', 'Business Consulting']
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