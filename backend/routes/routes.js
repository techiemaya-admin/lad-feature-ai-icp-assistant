/**
 * AI ICP Assistant Routes
 * Enhanced with Gemini AI and action command handling
 */

const express = require('express');
const router = express.Router();
const { chatWithAI, resetConversation, getChatHistory, expandKeywords } = require('./services/AIAssistantService');

// Initialize Gemini AI with fallback handling
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
    console.log('✅ Gemini AI initialized successfully');
  }
} catch (error) {
  console.log('⚠️ Gemini AI package not found. Running in fallback mode.');
  console.log('Install @google/generative-ai package to enable full AI functionality');
  genAI = null;
}

// System prompt for Maya AI to help with ICP and company data
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
   - What type? (user's exact keywords: "oil and gas", "SaaS companies", "cleaning services")
   - Where? (location: "Dubai", "UAE", "New York")

2. **If you have BOTH → CONFIRM:**
   "Perfect! I'll find [USER'S EXACT KEYWORDS] companies in [LOCATION].
   
   I'll get for you:
   ✓ Company names & profiles
   ✓ Executive contacts (CEO, CFO, CTO)
   ✓ Employee count & revenue data
   ✓ Phone numbers & emails
   
   Should I start the search?"

**CRITICAL RULES:**
- NEVER change the user's keywords (if they say "cleaning services", use "cleaning services")
- NEVER change "SaaS companies with more than 50 employees" to just "technology companies"
- ALWAYS use LinkedIn/Apollo for company searches
- Keep responses SHORT, FRIENDLY, and actionable
- Ask for missing info ONE at a time, not all at once
- When ready, confirm and wait for user approval before searching
- Be conversational and helpful, like a friendly assistant

**Examples:**
❌ BAD: "I'll search for 'facility management' companies" (when user said "cleaning services")
✅ GOOD: "I'll search for 'cleaning services' companies in Dubai"

❌ BAD: "I'll search for 'technology companies'" (when user said "SaaS companies with more than 50 employees")
✅ GOOD: "I'll search for 'SaaS companies with more than 50 employees' in San Francisco"`;

// Helper functions from mayaAI.js

/**
 * POST /api/ai-icp-assistant/chat
 * Chat with AI assistant to define ICP and trigger searches
 * Enhanced with Gemini AI intent detection
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [], searchResults = [] } = req.body;
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    let text, suggestedParams = null, shouldScrape = false;

    // STEP 1: Use Gemini AI FIRST to understand the true intent
    let geminiIntent = null;
    if (genAI && searchResults && searchResults.length > 0) {
      try {
        console.log('🧠 Using Gemini AI to understand user intent (with existing results)...');
        const intentPrompt = `You are an AI assistant helping users work with ICP and company search results.

The user has ${searchResults.length} companies already loaded in the results.

Analyze the user's message and determine their intent. Return ONLY a JSON object:

{
  "intent_type": "action" | "search" | "question",
  "action_type": "collect_numbers" | "filter" | "select" | "call" | "export" | "analyze" | "navigate" | "search_employees" | "other" | null,
  "requires_results": true | false,
  "description": "brief description of what user wants",
  "is_search_query": true | false,
  "search_params": {
    "keywords": "extracted keywords if this is a search",
    "location": "extracted location if this is a search"
  } | null
}

CRITICAL RULES:
- User has ${searchResults.length} companies ALREADY LOADED - prioritize ACTION over search!
- If message mentions ANY of these → intent_type MUST be "action":
  * "select", "choose", "pick", "show me", "filter", "find companies with"
  * "collect", "get", "extract", "gather", "list", "show"
  * "call", "calling", "start calling"
  * "export", "download", "save"
- ONLY set intent_type: "search" if user EXPLICITLY says they want NEW companies

User message: "${message}"
Previous context: ${conversationHistory.slice(-2).map(m => `${m.role}: ${m.content.substring(0, 100)}`).join('\n') || 'None'}

JSON response:`;

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(intentPrompt);
        const response = await result.response;
        const responseText = response.text().trim();
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          geminiIntent = JSON.parse(jsonMatch[0]);
          console.log('✅ Gemini AI intent analysis:', JSON.stringify(geminiIntent, null, 2));
        }
      } catch (error) {
        console.log('⚠️ Gemini intent analysis failed:', error.message);
      }
    }

    // STEP 2: Check for action commands first when results exist
    if (searchResults && searchResults.length > 0) {
      console.log(`📊 User has ${searchResults.length} companies loaded - checking for actions...`);
      
      // Handle action commands (filter, collect, select, etc.)
      const actionResponse = handleActionCommand(message, searchResults, conversationHistory);
      if (actionResponse) {
        console.log('✅ Action command detected and handled');
        return res.json(actionResponse);
      }
    }

    // STEP 3: Use Gemini AI to extract search parameters
    let directParams = null;
    
    if (genAI) {
      try {
        console.log('🤖 Using Gemini AI to extract ICP/search parameters...');
        const extractionPrompt = `Analyze the following user message and extract ICP or search parameters.

Return ONLY a JSON object with these fields:

{
  "search_type": "company",
  "keywords": "company keywords/industry (e.g., 'oil and gas', 'SaaS companies')",
  "location": "location name (e.g., 'Dubai', 'San Francisco')",
  "company_size": "employee count range (e.g., '50-200', '1000+')" | null,
  "revenue": "revenue range (e.g., '$1M-$10M')" | null,
  "job_titles": ["list of decision maker titles like 'CEO', 'CTO'] | null
}

CRITICAL RULES:
- Extract EXACT keywords the user mentioned (don't change them)
- If user says "SaaS companies with more than 50 employees" → use that exact phrase
- Location should be a place name (city, country, region)
- Return valid JSON only, no explanation

User message: "${message}"
Previous conversation context: ${conversationHistory.slice(-2).map(m => `${m.role}: ${m.content}`).join('\n') || 'None'}

JSON response:`;

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(extractionPrompt);
        const response = await result.response;
        const responseText = response.text().trim();
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const geminiParams = JSON.parse(jsonMatch[0]);
            console.log('✅ Gemini AI extracted params:', JSON.stringify(geminiParams, null, 2));
            
            if (geminiParams.keywords && typeof geminiParams.keywords === 'string') {
              directParams = {
                searchType: 'company',
                keywords: geminiParams.keywords.trim(),
                location: geminiParams.location?.trim() || null,
                companySize: geminiParams.company_size || null,
                revenue: geminiParams.revenue || null,
                jobTitles: geminiParams.job_titles || null,
                autoExecute: false // Always require confirmation
              };
            }
          } catch (parseError) {
            console.log('⚠️ Failed to parse Gemini JSON response, using fallback');
          }
        }
      } catch (geminiError) {
        console.log('⚠️ Gemini extraction failed, using fallback:', geminiError.message);
      }
    }

    // Fallback to pattern-based extraction if Gemini didn't work
    if (!directParams) {
      console.log('📋 Using pattern-based extraction as fallback...');
      directParams = extractICPFromMessage(message, conversationHistory);
    }

    // Check if ICP/search is complete
    const isSearchReady = directParams && 
                         directParams.keywords && 
                         directParams.location;
    
    if (isSearchReady) {
      console.log('✅ All required parameters present, ready to search');
      suggestedParams = directParams;
      
      // Generate confirmation message
      text = `Perfect! I'm ready to search for **${directParams.keywords}** companies in **${directParams.location}**.

**Search Parameters:**
• **Industry/Keywords:** ${directParams.keywords}
• **Location:** ${directParams.location}
${directParams.companySize ? `• **Company Size:** ${directParams.companySize}` : ''}
${directParams.revenue ? `• **Revenue:** ${directParams.revenue}` : ''}
${directParams.jobTitles?.length > 0 ? `• **Decision Makers:** ${directParams.jobTitles.join(', ')}` : ''}

I'll find:
✓ Company names & profiles
✓ Executive contacts (CEO, CFO, CTO)
✓ Employee count & revenue data
✓ Phone numbers & emails

**Ready to start the search?**

Click "Apply & Search" below or say "yes", "start", "go ahead" to begin! 🚀`;
      
      return res.json({
        success: true,
        response: text,
        suggestedParams,
        shouldScrape: false,
        autoSearchExecuted: false
      });
    } else {
      // Generate conversational response when parameters are missing
      console.log('❌ Missing required parameters - AI will ask conversationally');

      const missingParts = [];
      if (!directParams?.keywords) missingParts.push('industry/keywords');
      if (!directParams?.location) missingParts.push('location');

      // Use Gemini AI to generate conversational response
      if (genAI && directParams) {
        try {
          const conversationPrompt = `You are Maya AI (AGENT MAYA), a friendly assistant helping users define their ICP.

Current ICP data:
${directParams.keywords ? `Keywords: ${directParams.keywords}` : 'Keywords: Not specified'}
${directParams.location ? `Location: ${directParams.location}` : 'Location: Not specified'}

I need to ask for the missing information: ${missingParts.join(' and ')}.

Generate a friendly, conversational response asking for this missing information. 
Keep it short (2-3 sentences) and provide 2-3 examples.
Do NOT include any JSON or code blocks, just plain conversational text.

Response:`;

          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
          const result = await model.generateContent(conversationPrompt);
          const response = await result.response;
          text = response.text().trim();
          
          console.log('✅ Gemini generated conversational response for missing params');
          
          return res.json({
            success: true,
            response: text,
            suggestedParams: null,
            shouldScrape: false,
            autoSearchExecuted: false
          });
        } catch (error) {
          console.log('⚠️ Gemini response generation failed, using fallback');
        }
      }
      
      // Fallback to using existing service
      const response = await chatWithAI({
        message,
        conversationHistory,
        userId,
        organizationId
      });

      res.json({
        success: true,
        ...response
      });
    }

  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process chat message'
    });
  }
});

/**
 * Extract ICP parameters from user message (pattern-based fallback)
 */
function extractICPFromMessage(message, conversationHistory = []) {
  const lowerMessage = message.toLowerCase();
  const extractedParams = {};

  // Extract keywords/industry
  const keywordPatterns = [
    /\b(?:find|search|get|show|looking for)\s+(?:me\s+)?(.+?)\s+(?:companies|businesses|firms|organizations)\b/i,
    /\b(?:companies|businesses|firms|organizations)\s+(?:in|from|based in)\s+(.+?)\s+(?:that|which|in)\b/i,
    /\b(.+?)\s+(?:companies|businesses|firms|organizations)\s+in\b/i
  ];

  for (const pattern of keywordPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      extractedParams.keywords = match[1].trim();
      break;
    }
  }

  // Extract location
  const locationPatterns = [
    /\b(?:in|from|based in|located in)\s+([A-Z][a-zA-Z\s]+?)(?:\s+(?:with|that|which|and|,)|\s*$)/,
    /\b(?:companies|businesses)\s+in\s+([A-Z][a-zA-Z\s]+?)(?:\s|,|$)/
  ];

  for (const pattern of locationPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      extractedParams.location = match[1].trim();
      break;
    }
  }

  // Extract company size
  const sizePatterns = [
    /\b(\d+)\s*-\s*(\d+)\s+employees?\b/i,
    /\bmore than\s+(\d+)\s+employees?\b/i,
    /\bless than\s+(\d+)\s+employees?\b/i,
    /\b(\d+)\+\s+employees?\b/i
  ];

  for (const pattern of sizePatterns) {
    const match = message.match(pattern);
    if (match) {
      extractedParams.companySize = match[0];
      break;
    }
  }

  // Use conversation history to fill missing params
  if (conversationHistory.length > 0) {
    const recentMessages = conversationHistory.slice(-3).filter(m => m.role === 'user');
    const combinedContext = recentMessages.map(m => m.content).join(' ') + ' ' + message;
    
    if (!extractedParams.keywords) {
      for (const pattern of keywordPatterns) {
        const match = combinedContext.match(pattern);
        if (match && match[1]) {
          extractedParams.keywords = match[1].trim();
          break;
        }
      }
    }
    
    if (!extractedParams.location) {
      for (const pattern of locationPatterns) {
        const match = combinedContext.match(pattern);
        if (match && match[1]) {
          extractedParams.location = match[1].trim();
          break;
        }
      }
    }
  }

  return {
    searchType: 'company',
    keywords: extractedParams.keywords || null,
    location: extractedParams.location || null,
    companySize: extractedParams.companySize || null,
    autoExecute: false
  };
}

/**
 * Handle action commands on existing search results
 */
function handleActionCommand(message, searchResults, conversationHistory) {
  const lowerMessage = message.toLowerCase();

  // Pattern 1: Collect numbers
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

    const text = `📱 **Company Phone Numbers Collected!**

I collected **${uniquePhones.length} unique phone numbers** from **${companiesWithPhones.length} companies**.

${companiesWithPhones.slice(0, 20).map((item, i) => 
  `${i + 1}. **${item.company}**\n   📞 ${item.phone}\n   📍 ${item.location || 'N/A'}`
).join('\n\n')}

${companiesWithPhones.length > 20 ? `\n... and ${companiesWithPhones.length - 20} more companies.\n` : ''}

What would you like to do next?
• Export to CSV
• Start calling campaign
• Filter by location`;

    return {
      success: true,
      response: text,
      actionResult: {
        type: 'collect_numbers',
        data: companiesWithPhones,
        count: uniquePhones.length
      }
    };
  }

  // Pattern 2: Filter companies
  const isNegativeFilter = lowerMessage.includes("didn't have") || 
                          lowerMessage.includes("don't have") || 
                          lowerMessage.includes("without");

  if (lowerMessage.match(/\b(select|choose|pick|show|filter)\b/i) && lowerMessage.match(/\b(numbers?|phone|contacts?)\b/i)) {
    const filtered = searchResults.filter(company => {
      const phone = company.phone || company.company_phone;
      const hasPhone = phone && String(phone).trim().length > 5;
      return isNegativeFilter ? !hasPhone : hasPhone;
    });

    const text = `✅ **Filtered Results**

Found **${filtered.length} companies** ${isNegativeFilter ? 'without' : 'with'} phone numbers.

${filtered.slice(0, 10).map((company, i) => 
  `${i + 1}. **${company.company_name || company.name}**\n   📍 ${company.location || company.city || 'N/A'}`
).join('\n\n')}

${filtered.length > 10 ? `\n... and ${filtered.length - 10} more companies.\n` : ''}

What would you like to do with these companies?`;

    return {
      success: true,
      response: text,
      actionResult: {
        type: 'filter',
        data: filtered,
        count: filtered.length
      }
    };
  }

  // Pattern 3: Start calling
  if (lowerMessage.match(/\b(start\s+calling|calling|call\s+them|call\s+all|begin\s+calling)/i)) {
    const companiesWithPhones = searchResults.filter(company => {
      const phone = company.phone || company.company_phone;
      return phone && String(phone).trim().length > 5;
    });

    const text = `📞 **Calling Campaign Ready**

**${companiesWithPhones.length} companies** are ready for calling.

To start the campaign, I'll need:
• Voice agent selection
• Call script/greeting
• Time zone preferences

Would you like to:
1. Configure calling campaign
2. Preview call list
3. Export numbers first`;

    return {
      success: true,
      response: text,
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
 * POST /api/ai-icp-assistant/reset
 * Reset conversation history
 */
router.post('/reset', async (req, res) => {
  try {
    const userId = req.user?.userId;

    await resetConversation(userId);

    res.json({
      success: true,
      message: 'Conversation reset successfully'
    });
  } catch (error) {
    console.error('Reset conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset conversation'
    });
  }
});

/**
 * GET /api/ai-icp-assistant/history
 * Get chat history for user
 */
router.get('/history', async (req, res) => {
  try {
    const userId = req.user?.userId;

    const history = await getChatHistory(userId);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get chat history'
    });
  }
});

/**
 * POST /api/ai-icp-assistant/expand-keywords
 * Expand keywords/topic into comprehensive search terms
 * Migrated from vcp_sales_agent for better Apollo search results
 */
router.post('/expand-keywords', async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required'
      });
    }

    const expandedKeywords = await expandKeywords(topic);

    res.json({
      success: true,
      original: topic,
      expanded: expandedKeywords,
      keywords: expandedKeywords.split(',').map(k => k.trim())
    });
  } catch (error) {
    console.error('Expand keywords error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to expand keywords'
    });
  }
});

module.exports = router;
