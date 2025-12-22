/**
 * AI ICP Assistant Service (Refactored)
 * 
 * Handles AI processing for:
 * - Conversational ICP definition
 * - Intent detection and parameter extraction
 * - Action command handling
 * - Keyword expansion
 * 
 * Integrated with database models for persistence
 */

const { AIConversation, AIMessage } = require('../models');

// Initialize Gemini AI
let genAI = null;
let GoogleGenerativeAI = null;

try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY environment variable is not set!');
    console.log('⚠️ Gemini AI will not be available. Set GEMINI_API_KEY in .env file.');
    genAI = null;
  } else {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log('✅ Gemini AI initialized successfully in AIAssistantService');
  }
} catch (error) {
  console.log('⚠️ Gemini AI package not found. Running in fallback mode.');
  genAI = null;
}

// System prompt for Maya AI
const MAYA_SYSTEM_PROMPT = `You are Maya AI (AGENT MAYA), an intelligent assistant specialized in helping users define their Ideal Customer Profile (ICP) and find companies using LinkedIn and Apollo.io.

**Your Main Goal:** Make ICP definition and company searches SIMPLE, FAST, and CONVERSATIONAL.

**What You Do:**
- Help users define their Ideal Customer Profile through conversation
- Find companies using LinkedIn/Apollo.io automatically
- Extract company details, executives, and contact information
- Focus on the user's EXACT search terms (never change their keywords)
- Have natural, helpful conversations

**How to Handle Requests:**

**ICP DEFINITION (Priority #1):**
When someone asks about ICP or needs to define target customers:

1. **Ask about key ICP parameters:**
   - Industry/Keywords: What type of companies?
   - Location: Where are they based?
   - Company Size: How many employees?
   - Revenue: What revenue range?
   - Technologies: What tools do they use?
   - Job Titles: Who are the decision makers?

2. **If you have parameters → CONFIRM and ready to search:**
   "Perfect! I understand your ICP:
   
   ✓ Industry: [USER'S EXACT KEYWORDS]
   ✓ Location: [LOCATION]
   ✓ Company Size: [SIZE]
   ✓ Job Titles: [TITLES]
   
   Should I search for companies matching this profile?"

**COMPANY SEARCHES:**
When someone mentions: "companies", "businesses", "firms", "organizations":

1. **Identify TWO things:**
   - What type? (user's exact keywords)
   - Where? (location)

2. **If you have BOTH → CONFIRM:**
   "Perfect! I'll find [USER'S EXACT KEYWORDS] companies in [LOCATION].
   
   I'll get for you:
   ✓ Company names & profiles
   ✓ Executive contacts (CEO, CFO, CTO)
   ✓ Employee count & revenue data
   ✓ Phone numbers & emails
   
   Should I start the search?"

**CRITICAL RULES:**
- NEVER change the user's keywords
- ALWAYS use LinkedIn/Apollo for company searches
- Keep responses SHORT, FRIENDLY, and actionable
- Ask for missing info ONE at a time
- When ready, confirm and wait for user approval
- Be conversational and helpful`;

class AIAssistantService {
  /**
   * Process chat message with AI
   */
  static async processChat({
    message,
    conversationId,
    conversationHistory = [],
    searchResults = [],
    userId,
    organizationId
  }) {
    try {
      // Step 1: Check for action commands on existing results
      if (searchResults && searchResults.length > 0) {
        console.log(`📊 User has ${searchResults.length} companies loaded - checking for actions...`);
        
        const actionResponse = this.handleActionCommand(message, searchResults, conversationHistory);
        if (actionResponse) {
          console.log('✅ Action command detected and handled');
          return actionResponse;
        }
      }

      // Step 2: Use Gemini AI to extract search parameters
      let suggestedParams = null;
      let shouldScrape = false;
      
      if (genAI) {
        const geminiResult = await this.extractWithGemini(message, conversationHistory);
        if (geminiResult) {
          suggestedParams = geminiResult.params;
          shouldScrape = geminiResult.shouldScrape;
        }
      }

      // Step 3: Generate conversational response
      const conversationText = this.generateConversationalResponse(
        message,
        conversationHistory,
        suggestedParams
      );

      return {
        success: true,
        response: conversationText,
        text: conversationText,
        suggestedParams,
        shouldScrape,
        searchReady: shouldScrape && suggestedParams !== null,
        model: 'gemini-2.0-flash',
        tokensUsed: null // Track this if needed
      };

    } catch (error) {
      console.error('Process chat error:', error);
      throw error;
    }
  }

  /**
   * Extract parameters using Gemini AI
   */
  static async extractWithGemini(message, conversationHistory) {
    if (!genAI) return null;

    try {
      const extractionPrompt = `Analyze the following user message and extract ICP or search parameters.

Return ONLY a JSON object with these fields:

{
  "search_type": "company",
  "keywords": "company keywords/industry (e.g., 'oil and gas', 'SaaS companies')",
  "location": "location name (e.g., 'Dubai', 'San Francisco')",
  "company_size": "employee count range (e.g., '50-200', '1000+')" | null,
  "revenue": "revenue range (e.g., '$1M-$10M')" | null,
  "job_titles": ["CEO", "CTO"] | null,
  "technologies": ["Salesforce", "AWS"] | null,
  "should_scrape": true | false
}

Rules:
- Keep keywords EXACTLY as user stated (don't simplify or change)
- Set should_scrape: true ONLY if BOTH keywords and location are present
- If user is just chatting or asking questions, should_scrape: false

User message: "${message}"
Previous context: ${conversationHistory.slice(-2).map(m => `${m.role}: ${m.content}`).join('\n') || 'None'}

JSON response:`;

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(extractionPrompt);
      const response = await result.response;
      const responseText = response.text().trim();
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('✅ Gemini extracted params:', JSON.stringify(parsed, null, 2));
        
        return {
          params: parsed.keywords && parsed.location ? {
            searchType: parsed.search_type,
            keywords: parsed.keywords,
            location: parsed.location,
            companySize: parsed.company_size,
            revenue: parsed.revenue,
            jobTitles: parsed.job_titles,
            technologies: parsed.technologies
          } : null,
          shouldScrape: parsed.should_scrape || false
        };
      }
    } catch (error) {
      console.error('Gemini extraction error:', error);
    }

    return null;
  }

  /**
   * Generate conversational response
   */
  static generateConversationalResponse(message, conversationHistory, suggestedParams) {
    const lowerMessage = message.toLowerCase();

    // Greeting
    if (lowerMessage.match(/^(hi|hello|hey|good morning|good afternoon)/i)) {
      return `👋 Hi! I'm Maya AI, your ICP assistant.

I can help you:
• Define your Ideal Customer Profile
• Find companies using LinkedIn/Apollo
• Extract contact information

What would you like to do?`;
    }

    // If we have complete search params
    if (suggestedParams && suggestedParams.keywords && suggestedParams.location) {
      return `Perfect! I understand you're looking for:

✓ **Type:** ${suggestedParams.keywords}
✓ **Location:** ${suggestedParams.location}
${suggestedParams.companySize ? `✓ **Size:** ${suggestedParams.companySize}\n` : ''}

I'll search for companies matching this profile using LinkedIn and Apollo.

Should I proceed with the search?`;
    }

    // Missing location
    if (suggestedParams && suggestedParams.keywords && !suggestedParams.location) {
      return `Great! I'll look for **${suggestedParams.keywords}** companies.

📍 Which location would you like to focus on? (e.g., Dubai, New York, San Francisco)`;
    }

    // Missing keywords
    if (suggestedParams && !suggestedParams.keywords && suggestedParams.location) {
      return `Perfect! I'll search in **${suggestedParams.location}**.

🔍 What type of companies are you looking for? (e.g., SaaS companies, oil and gas, cleaning services)`;
    }

    // Default - ask for ICP
    return `I'd be happy to help you find companies!

To get started, I need to understand your target market:

1. **What type of companies** are you looking for? (industry/keywords)
2. **Where** are they located?

The more specific you are, the better results I can find!`;
  }

  /**
   * Handle action commands on search results
   */
  static handleActionCommand(message, searchResults, conversationHistory) {
    const lowerMessage = message.toLowerCase();

    // Collect numbers
    if (lowerMessage.match(/\b(collect|get|extract|gather|find|show|list|all)\s+(?:all\s+)?(?:the\s+)?(?:available\s+)?(?:phone\s+)?numbers?\b/i)) {
      const companiesWithPhones = searchResults
        .filter(company => {
          const phone = company.phone || company.company_phone;
          return phone && String(phone).trim().length > 5;
        })
        .map(company => ({
          company: company.company_name || company.name,
          phone: company.phone || company.company_phone,
          location: company.location || company.city
        }));

      const uniquePhones = [...new Set(companiesWithPhones.map(item => item.phone))];

      return {
        success: true,
        response: `📱 **Company Phone Numbers Collected!**

I collected **${uniquePhones.length} unique phone numbers** from **${companiesWithPhones.length} companies**.

${companiesWithPhones.slice(0, 20).map((item, i) => 
  `${i + 1}. **${item.company}**\n   📞 ${item.phone}\n   📍 ${item.location || 'N/A'}`
).join('\n\n')}

${companiesWithPhones.length > 20 ? `\n... and ${companiesWithPhones.length - 20} more companies.\n` : ''}

What would you like to do next?
• Export to CSV
• Start calling campaign
• Filter by location`,
        actionResult: {
          type: 'collect_numbers',
          data: companiesWithPhones,
          count: uniquePhones.length
        }
      };
    }

    // Filter companies
    const isNegativeFilter = lowerMessage.includes("didn't have") || 
                            lowerMessage.includes("don't have") || 
                            lowerMessage.includes("without");

    if (lowerMessage.match(/\b(select|choose|pick|show|filter)\b/i) && lowerMessage.match(/\b(numbers?|phone|contacts?)\b/i)) {
      const filtered = searchResults.filter(company => {
        const phone = company.phone || company.company_phone;
        const hasPhone = phone && String(phone).trim().length > 5;
        return isNegativeFilter ? !hasPhone : hasPhone;
      });

      return {
        success: true,
        response: `✅ **Filtered Results**

Found **${filtered.length} companies** ${isNegativeFilter ? 'without' : 'with'} phone numbers.

${filtered.slice(0, 10).map((company, i) => 
  `${i + 1}. **${company.company_name || company.name}**\n   📍 ${company.location || company.city || 'N/A'}`
).join('\n\n')}

${filtered.length > 10 ? `\n... and ${filtered.length - 10} more companies.\n` : ''}

What would you like to do with these companies?`,
        actionResult: {
          type: 'filter',
          data: filtered,
          count: filtered.length
        }
      };
    }

    // Start calling
    if (lowerMessage.match(/\b(start\s+calling|calling|call\s+them|call\s+all|begin\s+calling)/i)) {
      const companiesWithPhones = searchResults.filter(company => {
        const phone = company.phone || company.company_phone;
        return phone && String(phone).trim().length > 5;
      });

      return {
        success: true,
        response: `📞 **Calling Campaign Ready**

**${companiesWithPhones.length} companies** are ready for calling.

To start the campaign, I'll need:
• Voice agent selection
• Call script/greeting
• Time zone preferences

Would you like to:
1. Configure calling campaign
2. Preview call list
3. Export numbers first`,
        actionResult: {
          type: 'prepare_calling',
          data: companiesWithPhones,
          count: companiesWithPhones.length
        }
      };
    }

    return null;
  }

  /**
   * Expand keywords using Gemini AI
   */
  static async expandKeywords(topic, context = 'general') {
    if (!genAI) {
      // Fallback: return topic as-is
      return [topic];
    }

    try {
      const prompt = `You are a keyword expansion expert. Given a topic, generate related keywords and variations that would help find relevant companies or information.

Topic: "${topic}"
Context: ${context}

Return 8-12 relevant keywords/phrases as a comma-separated list. Include:
- Synonyms and variations
- Related terms
- Industry-specific terminology
- Common abbreviations

Keywords:`;

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      
      // Parse comma-separated keywords
      const keywords = text.split(',').map(k => k.trim()).filter(k => k.length > 0);
      
      return keywords.length > 0 ? keywords : [topic];

    } catch (error) {
      console.error('Keyword expansion error:', error);
      return [topic];
    }
  }
}

module.exports = AIAssistantService;
