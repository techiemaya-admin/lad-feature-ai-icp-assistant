/**
 * AI ICP Assistant Service
 * 
 * Handles conversational AI for defining Ideal Customer Profile
 * and triggering Apollo searches based on user requirements.
 * 
 * Enhanced with keyword expansion from vcp_sales_agent for better search results.
 */

const { query } = require('../../../shared/database/connection');
const axios = require('axios');

// In-memory conversation store (in production, use Redis or database)
const conversationStore = new Map();

// AI Configuration
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

/**
 * Chat with AI Assistant
 */
async function chatWithAI({ message, conversationHistory, userId, organizationId }) {
  try {
    // Get or create conversation context
    const conversationKey = `${organizationId}:${userId}`;
    let context = conversationStore.get(conversationKey) || {
      icpData: {},
      searchTriggers: [],
      conversationHistory: conversationHistory || []
    };

    // Add user message to history
    context.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Analyze message for ICP parameters and search intent
    const analysis = analyzeMessage(message, context);

    // Update ICP data based on analysis
    if (analysis.extractedData) {
      context.icpData = {
        ...context.icpData,
        ...analysis.extractedData
      };
    }

    // Generate AI response
    const aiResponse = generateResponse(analysis, context);

    // Add AI response to history
    context.conversationHistory.push({
      role: 'assistant',
      content: aiResponse.message,
      timestamp: new Date().toISOString()
    });

    // Check if ready to trigger search
    if (analysis.shouldTriggerSearch && isICPComplete(context.icpData)) {
      aiResponse.searchReady = true;
      aiResponse.searchParams = await buildSearchParams(context.icpData);
    }

    // Save conversation context
    conversationStore.set(conversationKey, context);

    // Track usage in database
    await trackAIUsage({
      userId,
      organizationId,
      messageLength: message.length,
      creditsUsed: 0.1
    });

    return {
      message: aiResponse.message,
      icpData: context.icpData,
      searchReady: aiResponse.searchReady || false,
      searchParams: aiResponse.searchParams || null,
      conversationHistory: context.conversationHistory,
      suggestions: aiResponse.suggestions || []
    };

  } catch (error) {
    console.error('AI Chat error:', error);
    throw error;
  }
}

/**
 * Analyze user message for ICP parameters and intent
 */
function analyzeMessage(message, context) {
  const lowerMessage = message.toLowerCase();
  const extractedData = {};
  let intent = 'gather_info';

  // Extract industry - More flexible matching
  const industries = ['healthcare', 'fintech', 'technology', 'saas', 'e-commerce', 'manufacturing', 'retail', 'education', 
                      'oil and gas', 'oil & gas', 'petroleum', 'energy', 'construction', 'real estate', 'logistics', 
                      'transportation', 'hospitality', 'food', 'restaurant', 'automotive', 'pharma', 'biotech'];
  
  for (const industry of industries) {
    if (lowerMessage.includes(industry)) {
      extractedData.industry = industry;
      break;
    }
  }
  
  // If no exact match, look for general business terms and extract them
  if (!extractedData.industry) {
    // Extract first meaningful noun phrase before location words
    const locationWords = ['in', 'at', 'near', 'located', 'based', 'from'];
    const parts = message.split(new RegExp(`\\b(${locationWords.join('|')})\\b`, 'i'));
    if (parts.length > 0) {
      const potentialIndustry = parts[0].trim().replace(/^(find|search|looking for|get|show me)\s+/i, '');
      if (potentialIndustry && potentialIndustry.length > 2 && potentialIndustry.length < 50) {
        extractedData.industry = potentialIndustry;
      }
    }
  }

  // Extract company size
  if (lowerMessage.match(/\d+\s*-\s*\d+\s*(employees|people)/i)) {
    const match = lowerMessage.match(/(\d+)\s*-\s*(\d+)/);
    if (match) {
      extractedData.company_size = `${match[1]}-${match[2]}`;
    }
  } else if (lowerMessage.includes('small') || lowerMessage.includes('startup')) {
    extractedData.company_size = '1-50';
  } else if (lowerMessage.includes('medium')) {
    extractedData.company_size = '51-500';
  } else if (lowerMessage.includes('large') || lowerMessage.includes('enterprise')) {
    extractedData.company_size = '500+';
  }

  // Extract location - More comprehensive list
  const locations = {
    'usa': 'United States', 'united states': 'United States', 'us': 'United States',
    'canada': 'Canada', 'uk': 'United Kingdom', 'germany': 'Germany', 'france': 'France',
    'india': 'India', 'australia': 'Australia', 'japan': 'Japan', 'china': 'China',
    'dubai': 'Dubai', 'uae': 'UAE', 'singapore': 'Singapore', 'hong kong': 'Hong Kong',
    'new york': 'New York', 'california': 'California', 'texas': 'Texas', 'london': 'London',
    'san francisco': 'San Francisco', 'miami': 'Miami', 'toronto': 'Toronto', 'sydney': 'Sydney'
  };
  
  for (const [key, value] of Object.entries(locations)) {
    if (lowerMessage.includes(key)) {
      extractedData.location = value;
      break;
    }
  }

  // Extract revenue
  if (lowerMessage.includes('revenue')) {
    if (lowerMessage.includes('million')) {
      extractedData.revenue_range = '1M-10M';
    } else if (lowerMessage.includes('billion')) {
      extractedData.revenue_range = '1B+';
    }
  }

  // Extract technologies
  const technologies = ['salesforce', 'hubspot', 'aws', 'azure', 'react', 'python', 'java', 'nodejs'];
  const foundTechs = technologies.filter(tech => lowerMessage.includes(tech));
  if (foundTechs.length > 0) {
    extractedData.technology = foundTechs.join(',');
  }

  // Check for search intent
  const searchKeywords = ['search', 'find', 'show me', 'get me', 'look for', 'ready', 'go ahead', 'start'];
  const shouldTriggerSearch = searchKeywords.some(keyword => lowerMessage.includes(keyword));

  return {
    intent,
    extractedData: Object.keys(extractedData).length > 0 ? extractedData : null,
    shouldTriggerSearch
  };
}

/**
 * Generate AI response based on analysis
 */
function generateResponse(analysis, context) {
  const { icpData } = context;
  let message = '';
  const suggestions = [];

  // Check what information we have
  const hasIndustry = !!icpData.industry;
  const hasSize = !!icpData.company_size;
  const hasLocation = !!icpData.location;

  if (analysis.shouldTriggerSearch) {
    if (isICPComplete(icpData)) {
      message = `Perfect! I have all the information needed. Let me search for companies matching your criteria:\n\n`;
      message += formatICPSummary(icpData);
      message += `\n\nClick "Start Search" to find matching companies.`;
      return { message, shouldTriggerSearch: true };
    } else {
      message = `I need a bit more information before we can search. `;
    }
  }

  // Ask for missing information or acknowledge what we have
  if (!hasIndustry && !hasLocation) {
    // No info at all
    message += `What industry are you targeting? (e.g., healthcare, fintech, oil & gas, technology)`;
    suggestions.push('Healthcare', 'Fintech', 'Oil & Gas', 'Technology');
  } else if (hasIndustry && hasLocation && !hasSize) {
    // Have industry and location, ask for size
    message += `Great! I see you're looking for **${icpData.industry}** companies in **${icpData.location}**.\n\n`;
    message += `What company size should I focus on? (e.g., small businesses 1-50 employees, medium 50-500, large 500+)`;
    suggestions.push('Small (1-50)', 'Medium (50-500)', 'Large (500+)', 'Any size');
  } else if (!hasIndustry) {
    message += `What industry are you targeting? (e.g., healthcare, fintech, oil & gas, technology)`;
    suggestions.push('Healthcare', 'Fintech', 'Oil & Gas', 'Technology');
  } else if (!hasLocation) {
    message += `What location should I focus on? (e.g., USA, Dubai, UK, India)`;
    suggestions.push('USA', 'Dubai', 'UK', 'India');
  } else if (!hasSize) {
    message += `What company size are you looking for?`;
    suggestions.push('Small (1-50)', 'Medium (50-500)', 'Large (500+)', 'Any size');
  } else {
    // We have all basic info, ask for optional refinements or start search
    message += `Perfect! I have all the key information:\n\n`;
    message += formatICPSummary(icpData);
    message += `\n\nYou can:\n`;
    message += `- **Start searching** for these companies\n`;
    message += `- Add revenue range (e.g., "$1M-$10M")\n`;
    message += `- Add technology requirements (e.g., "using Salesforce")\n\n`;
    message += `Say "search" or "start" to begin!`;
    suggestions.push('Start search', 'Add revenue filter', 'Add technology filter');
  }

  return { message, suggestions };
}

/**
 * Check if ICP has minimum required data
 */
function isICPComplete(icpData) {
  return !!(icpData.industry && icpData.company_size && icpData.location);
}

/**
 * Format ICP summary
 */
function formatICPSummary(icpData) {
  let summary = '📋 Current ICP:\n';
  if (icpData.industry) summary += `• Industry: ${icpData.industry}\n`;
  if (icpData.company_size) summary += `• Company Size: ${icpData.company_size} employees\n`;
  if (icpData.location) summary += `• Location: ${icpData.location}\n`;
  if (icpData.revenue_range) summary += `• Revenue: ${icpData.revenue_range}\n`;
  if (icpData.technology) summary += `• Technologies: ${icpData.technology}\n`;
  return summary;
}

/**
 * Expand keywords using AI to improve search results
 * Migrated from vcp_sales_agent expand_topic_keywords()
 */
async function expandKeywords(topic) {
  if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY) {
    console.log('No AI API key configured, skipping keyword expansion');
    return topic;
  }

  try {
    console.log(`🔍 Expanding keywords for: "${topic}"`);

    const systemPrompt = `You are an AI sales intelligence assistant. Your task is to expand the user's search topic into a comprehensive, comma-separated list of related keywords and phrases. The goal is to find relevant companies even if they don't use the user's exact words.

Include:
- Synonyms and related terms
- Industry-specific terminology
- Common variations and related concepts
- Product/service categories
- Business models and approaches

Example:
User Topic: "healthcare SaaS companies"
Your Response: healthcare SaaS, medical software, health tech, digital health platforms, telemedicine solutions, EHR systems, patient engagement software, healthcare technology, clinical software, medical practice management, health information systems, telehealth platforms

Return ONLY the comma-separated list. Do not add any other text.`;

    let expandedKeywords;

    if (AI_PROVIDER === 'openai' && OPENAI_API_KEY) {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: AI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: topic }
          ],
          temperature: 0.5,
          max_tokens: 200
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      expandedKeywords = response.data.choices[0].message.content.trim();
    } else if (AI_PROVIDER === 'anthropic' && ANTHROPIC_API_KEY) {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: AI_MODEL || 'claude-3-haiku-20240307',
          max_tokens: 200,
          messages: [
            {
              role: 'user',
              content: `${systemPrompt}\n\nUser Topic: ${topic}`
            }
          ]
        },
        {
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          }
        }
      );

      expandedKeywords = response.data.content[0].text.trim();
    }

    if (expandedKeywords) {
      // Clean up response
      expandedKeywords = expandedKeywords.replace(/\n/g, ', ').trim();
      console.log(`✅ Expanded to: "${expandedKeywords.substring(0, 100)}..."`);
      return expandedKeywords;
    }

    return topic;

  } catch (error) {
    console.error('Keyword expansion error:', error.message);
    return topic; // Fall back to original topic
  }
}

/**
 * Build Apollo search parameters from ICP data
 * Enhanced with keyword expansion
 */
async function buildSearchParams(icpData) {
  // Expand industry keywords for better search results
  let expandedKeywords = icpData.industry;
  
  if (icpData.industry) {
    try {
      expandedKeywords = await expandKeywords(icpData.industry);
    } catch (error) {
      console.error('Failed to expand keywords:', error);
      expandedKeywords = icpData.industry;
    }
  }

  return {
    keywords: expandedKeywords,
    industry: icpData.industry,
    location: icpData.location,
    company_size: icpData.company_size,
    revenue_range: icpData.revenue_range,
    technology: icpData.technology,
    expandedKeywords: expandedKeywords // Include expanded keywords in response
  };
}

/**
 * Reset conversation
 */
async function resetConversation(userId) {
  // Clear from memory store
  for (const [key] of conversationStore.entries()) {
    if (key.endsWith(`:${userId}`)) {
      conversationStore.delete(key);
    }
  }
  return true;
}

/**
 * Get chat history
 */
async function getChatHistory(userId) {
  const history = [];
  for (const [key, value] of conversationStore.entries()) {
    if (key.endsWith(`:${userId}`)) {
      history.push(value);
    }
  }
  return history;
}

/**
 * Track AI usage in database
 */
async function trackAIUsage({ userId, organizationId, messageLength, creditsUsed }) {
  try {
    await query(`
      INSERT INTO feature_usage (
        feature_key, user_id, organization_id, 
        credits_used, request_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [
      'ai-icp-assistant',
      userId,
      organizationId,
      creditsUsed,
      JSON.stringify({ messageLength })
    ]);
  } catch (error) {
    console.error('Failed to track AI usage:', error);
  }
}

module.exports = {
  chatWithAI,
  resetConversation,
  getChatHistory,
  expandKeywords // Export for use by other features
};
