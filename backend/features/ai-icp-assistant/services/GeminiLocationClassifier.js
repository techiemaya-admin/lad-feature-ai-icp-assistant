/**
 * Gemini Location Classifier Service
 * Maps user's location input to standardized location names with spelling correction
 */
// Silent logger (console logs removed for production)
const logger = {
  info: () => {},
  error: () => {}
};
class GeminiLocationClassifier {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
    this.systemPrompt = `You are a location classification expert that helps identify and correct location names. Your goal is to analyze user input about target locations and return the most accurate, properly spelled location name.
## Location Format
Use proper spelling and formatting for all locations:
- **Countries**: Use full country names (e.g., "United States", not "USA" or "US"; "United Arab Emirates", not "UAE")
- **Cities**: Use correct spelling (e.g., "New York", "San Francisco", "Los Angeles", "Dubai", "Mumbai", "Singapore")
- **Regions**: Use standard region names (e.g., "North America", "Europe", "Asia Pacific", "Middle East")
## Common Corrections
Spelling Fixes:
- "Dubay" → "Dubai"
- "Bangalor" → "Bangalore"
- "Singapur" → "Singapore"
- "Londan" → "London"
- "Berln" → "Berlin"
- "Tokio" → "Tokyo"
- "Mumbi" → "Mumbai"
- "Sydny" → "Sydney"
Country Abbreviations:
- "USA" OR "US" → "United States"
- "UK" → "United Kingdom"
- "UAE" → "United Arab Emirates"
- "AUS" → "Australia"
- "SA" → "South Africa"
## Important Context
- Always correct obvious spelling mistakes
- Expand common abbreviations to full names
- If multiple locations are mentioned, split them into an array
- For ambiguous inputs, provide alternatives
- Be confident - only mark as 'low' confidence if genuinely ambiguous
## Response Format
Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "primary_location": "Corrected Location Name",
  "confidence": "high|medium|low",
  "reasoning": "Brief positive explanation about the location (DO NOT mention spelling corrections or mistakes - be encouraging)",
  "alternative_locations": ["Alt 1", "Alt 2"],
  "original_input": "User's original input",
  "clarifying_question": "Only if confidence is low AND input is ambiguous"
}
IMPORTANT: Never mention spelling corrections or mistakes in the reasoning. Instead, use positive phrases like:
- "Great! This is a popular location for campaigns."
- "Perfect choice! This location has good market opportunities."
- "This location is commonly targeted by businesses."`;
  }
  /**
   * Classify and correct user's location input using Gemini AI
   * @param {string} userInput - User's description of their target location
   * @returns {Promise<Object>} Classification result with spelling corrections
   */
  async classifyLocation(userInput) {
    try {
      if (!this.geminiApiKey) {
        logger.warn('[Gemini Location Classifier] API key not configured, returning fallback');
        return this._getFallbackClassification(userInput);
      }
      logger.info('[Gemini Location Classifier] Classifying location', { userInput });
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
      logger.info('[Gemini Location Classifier] Classification result', {
        primary_location: classification.primary_location,
        confidence: classification.confidence
      });
      return {
        success: true,
        ...classification
      };
    } catch (error) {
      logger.error('[Gemini Location Classifier] Error classifying location', {
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
    // Basic spelling corrections without AI
    const corrections = {
      'usa': 'United States',
      'us': 'United States',
      'uk': 'United Kingdom',
      'uae': 'United Arab Emirates',
      'dubay': 'Dubai',
      'bangalor': 'Bangalore',
      'singapur': 'Singapore',
      'londan': 'London',
      'berln': 'Berlin',
      'tokio': 'Tokyo',
      'mumbi': 'Mumbai',
      'sydny': 'Sydney'
    };
    const normalized = userInput.toLowerCase().trim();
    const corrected = corrections[normalized] || userInput;
    return {
      success: true,
      primary_location: corrected,
      confidence: 'high',
      reasoning: `Great! This is a popular location for targeting campaigns.`,
      alternative_locations: [],
      original_input: userInput,
      clarifying_question: null,
      isFallback: true
    };
  }
  /**
   * Get location suggestions for autocomplete (returns common locations)
   * @param {string} query - Search query
   * @returns {Promise<Object>} Suggestions result
   */
  async getLocationSuggestions(query = '') {
    const allLocations = [
      'United States',
      'United Kingdom',
      'United Arab Emirates',
      'India',
      'Singapore',
      'Australia',
      'Canada',
      'Germany',
      'France',
      'Netherlands',
      'China',
      'Japan',
      'Dubai',
      'London',
      'New York',
      'San Francisco',
      'Bangalore',
      'Mumbai'
    ];
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return {
        success: true,
        suggestions: allLocations.slice(0, 10),
        query: ''
      };
    }
    const filtered = allLocations.filter(loc => 
      loc.toLowerCase().includes(normalizedQuery)
    );
    return {
      success: true,
      suggestions: filtered.slice(0, 10),
      query
    };
  }
}
module.exports = new GeminiLocationClassifier();
