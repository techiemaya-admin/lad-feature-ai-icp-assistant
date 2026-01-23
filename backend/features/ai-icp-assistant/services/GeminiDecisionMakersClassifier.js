/**
 * Gemini Decision Makers Classifier Service
 * Maps user's decision maker input to standardized job titles/roles
 */
// Silent logger (console logs removed for production)
const logger = {
  info: () => {},
  error: () => {}
};
class GeminiDecisionMakersClassifier {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
    this.systemPrompt = `You are a job title classification expert that helps identify and standardize decision maker roles. Your goal is to analyze user input about target decision makers and return the most accurate, standardized job title.
## Job Title Format
Use proper spelling and standard formatting for all roles:
- **C-Level**: CEO, CFO, CTO, CMO, COO, CHRO, CIO, CDO (Chief Data Officer)
- **VP Level**: VP of Sales, VP of Marketing, VP of Engineering, VP of Operations
- **Directors**: Director of Marketing, Sales Director, Engineering Director, Product Director
- **Heads**: Head of Sales, Head of Marketing, Head of Product, Head of Engineering
- **Managers**: Marketing Manager, Sales Manager, Product Manager, Project Manager
- **Founders**: Founder, Co-Founder, Founder & CEO
- **Owners**: Owner, Business Owner, Proprietor
## Common Mappings
Executive Level:
- "Chief Executive" OR "chief exec" → "CEO"
- "Chief Technology" → "CTO"
- "Chief Marketing" → "CMO"
- "Chief Financial" → "CFO"
- "Chief Operating" → "COO"
Management:
- "Mktg Manager" → "Marketing Manager"
- "Sales mgr" → "Sales Manager"
- "Prod Manager" → "Product Manager"
Founders:
- "founder" → "Founder"
- "co founder" → "Co-Founder"
- "startup founder" → "Founder"
## Important Context
- Always use standard capitalization (CEO, not Ceo)
- Expand common abbreviations (VP, not V.P.)
- If multiple roles are mentioned, identify the primary one
- For vague inputs like "decision maker", ask for clarification
- Be confident - only mark as 'low' confidence if genuinely ambiguous
## Response Format
Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "primary_role": "Standardized Job Title",
  "confidence": "high|medium|low",
  "reasoning": "Brief positive explanation about the role (DO NOT mention standardization or corrections - be encouraging)",
  "alternative_roles": ["Alt Role 1", "Alt Role 2"],
  "original_input": "User's original input",
  "clarifying_question": "Only if confidence is low AND input is ambiguous",
  "role_category": "C-Level|VP-Level|Director|Head|Manager|Founder|Owner|Other"
}
IMPORTANT: Never mention standardization or corrections in the reasoning. Instead, use positive phrases like:
- "Excellent choice! This is a key decision maker role."
- "Great! This role typically has strong purchasing power."
- "Perfect! This role is ideal for B2B campaigns."`;
  }
  /**
   * Classify and standardize user's decision maker input using Gemini AI
   * @param {string} userInput - User's description of their target decision makers
   * @returns {Promise<Object>} Classification result with standardized roles
   */
  async classifyDecisionMakers(userInput) {
    try {
      if (!this.geminiApiKey) {
        logger.warn('[Gemini Decision Makers Classifier] API key not configured, returning fallback');
        return this._getFallbackClassification(userInput);
      }
      logger.info('[Gemini Decision Makers Classifier] Classifying decision makers', { userInput });
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
      logger.info('[Gemini Decision Makers Classifier] Classification result', {
        primary_role: classification.primary_role,
        confidence: classification.confidence
      });
      return {
        success: true,
        ...classification
      };
    } catch (error) {
      logger.error('[Gemini Decision Makers Classifier] Error classifying decision makers', {
        error: error.message,
        userInput
      });
      // Return fallback on error
      return this._getFallbackClassification(userInput);
    }
  }
  /**
   * Get fallback classification when Gemini is unavailable
   * @private
   */
  _getFallbackClassification(userInput) {
    // Basic role standardization without AI
    const roleMap = {
      'ceo': 'CEO',
      'chief executive': 'CEO',
      'cto': 'CTO',
      'chief technology': 'CTO',
      'cmo': 'CMO',
      'chief marketing': 'CMO',
      'cfo': 'CFO',
      'chief financial': 'CFO',
      'coo': 'COO',
      'chief operating': 'COO',
      'founder': 'Founder',
      'cofounder': 'Co-Founder',
      'co-founder': 'Co-Founder',
      'vp sales': 'VP of Sales',
      'vp marketing': 'VP of Marketing',
      'head of sales': 'Head of Sales',
      'head of marketing': 'Head of Marketing',
      'sales director': 'Sales Director',
      'marketing director': 'Marketing Director'
    };
    const normalized = userInput.toLowerCase().trim();
    const matched = roleMap[normalized] || userInput;
    return {
      success: true,
      primary_role: matched,
      confidence: 'high',
      reasoning: `Great choice! This is a key decision maker role.`,
      alternative_roles: [],
      original_input: userInput,
      clarifying_question: null,
      role_category: this._categorizeRole(matched),
      isFallback: true
    };
  }
  /**
   * Categorize a role into a category
   * @private
   */
  _categorizeRole(role) {
    const roleUpper = role.toUpperCase();
    if (roleUpper.includes('CEO') || roleUpper.includes('CFO') || roleUpper.includes('CTO') || 
        roleUpper.includes('CMO') || roleUpper.includes('COO') || roleUpper.includes('CHIEF')) {
      return 'C-Level';
    }
    if (roleUpper.includes('VP') || roleUpper.includes('VICE PRESIDENT')) {
      return 'VP-Level';
    }
    if (roleUpper.includes('DIRECTOR')) {
      return 'Director';
    }
    if (roleUpper.includes('HEAD OF')) {
      return 'Head';
    }
    if (roleUpper.includes('MANAGER')) {
      return 'Manager';
    }
    if (roleUpper.includes('FOUNDER') || roleUpper.includes('CO-FOUNDER')) {
      return 'Founder';
    }
    if (roleUpper.includes('OWNER')) {
      return 'Owner';
    }
    return 'Other';
  }
  /**
   * Get decision maker suggestions for autocomplete (returns common roles)
   * @param {string} query - Search query
   * @returns {Promise<Object>} Suggestions result
   */
  async getDecisionMakerSuggestions(query = '') {
    const allRoles = [
      'CEO',
      'Founder',
      'Co-Founder',
      'CTO',
      'CMO',
      'CFO',
      'COO',
      'VP of Sales',
      'VP of Marketing',
      'VP of Engineering',
      'Head of Sales',
      'Head of Marketing',
      'Head of Product',
      'Sales Director',
      'Marketing Director',
      'Product Director',
      'Engineering Director',
      'Marketing Manager',
      'Sales Manager',
      'Product Manager',
      'Owner',
      'Business Owner'
    ];
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return {
        success: true,
        suggestions: allRoles.slice(0, 10),
        query: ''
      };
    }
    const filtered = allRoles.filter(role => 
      role.toLowerCase().includes(normalizedQuery)
    );
    return {
      success: true,
      suggestions: filtered.slice(0, 10),
      query
    };
  }
}
module.exports = new GeminiDecisionMakersClassifier();