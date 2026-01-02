/**
 * Gemini Client Service
 * 
 * Handles Gemini API initialization and communication.
 * No business logic - only API interaction.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

class GeminiClientService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  /**
   * Generate content from Gemini
   */
  async generateContent(prompt) {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      logger.error('[GeminiClientService] Error generating content:', error);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Get model instance (for advanced usage)
   */
  getModel() {
    return this.model;
  }
}

module.exports = new GeminiClientService();

