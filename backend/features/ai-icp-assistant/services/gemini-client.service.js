/**
 * Gemini Client Service
 * 
 * Handles Gemini API initialization and communication.
 * No business logic - only API interaction.
 * 
 * NOTE: Uses lazy initialization to support optional API keys.
 * If GEMINI_API_KEY is not set, the service will return mock responses
 * for testing/development purposes.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
class GeminiClientService {
  constructor() {
    this._initialized = false;
    this.genAI = null;
    this.model = null;
    this._geminiAvailable = false;
  }
  /**
   * Initialize Gemini client (lazy initialization)
   * Throws error if API key is missing AND Gemini is actually needed
   */
  _initialize() {
    if (this._initialized) return;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('[GeminiClientService] GEMINI_API_KEY not set - using mock responses for development');
      this._geminiAvailable = false;
      this._initialized = true;
      return;
    }
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      const modelName = process.env.AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      this.model = this.genAI.getGenerativeModel({ model: modelName });
      this._geminiAvailable = true;
      logger.info(`[GeminiClientService] Gemini API initialized with model: ${modelName}`);
    } catch (error) {
      logger.error('[GeminiClientService] Failed to initialize Gemini:', error);
      this._geminiAvailable = false;
    }
    this._initialized = true;
  }
  /**
   * Generate content from Gemini
   */
  async generateContent(prompt) {
    this._initialize();
    if (!this._geminiAvailable) {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in your .env file.');
    }
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
    this._initialize();
    return this.model;
  }
  /**
   * Check if Gemini is available
   */
  isAvailable() {
    this._initialize();
    return this._geminiAvailable;
  }
}
module.exports = new GeminiClientService();