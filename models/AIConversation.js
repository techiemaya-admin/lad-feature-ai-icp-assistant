/**
 * AI Conversation Model
 * LAD Architecture: Business Logic Layer
 * Uses Repository Pattern for Data Access
 */
const { AIConversationRepository } = require('../repositories');
const logger = require('../utils/logger');
class AIConversation {
  /**
   * Create a new conversation
   */
  static async create({ userId, tenantId, title = null, metadata = {} }) {
    try {
      // Validate required parameters
      if (!userId || !tenantId) {
        throw new Error('userId and tenantId are required');
      }
      // Business logic: Validate metadata structure
      const validatedMetadata = this.validateMetadata(metadata);
      return await AIConversationRepository.create({
        userId,
        tenantId,
        title,
        metadata: validatedMetadata
      });
    } catch (error) {
      logger.error('Model error creating conversation', { 
        error: error.message, 
        userId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get conversation by ID with tenant validation
   */
  static async findById(conversationId, tenantId) {
    try {
      if (!conversationId || !tenantId) {
        throw new Error('conversationId and tenantId are required');
      }
      return await AIConversationRepository.findById(conversationId, tenantId);
    } catch (error) {
      logger.error('Model error finding conversation', { 
        error: error.message, 
        conversationId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get all conversations for a user with tenant scoping
   */
  static async findByUser(userId, tenantId, options = {}) {
    try {
      if (!userId || !tenantId) {
        throw new Error('userId and tenantId are required');
      }
      // Business logic: Apply default limits for performance
      const safeOptions = {
        ...options,
        limit: options.limit || 50 // Default limit for performance
      };
      return await AIConversationRepository.findByUser(userId, tenantId, safeOptions);
    } catch (error) {
      logger.error('Model error finding user conversations', { 
        error: error.message, 
        userId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Update conversation with business logic validation
   */
  static async update(conversationId, tenantId, updates = {}) {
    try {
      if (!conversationId || !tenantId) {
        throw new Error('conversationId and tenantId are required');
      }
      // Business logic: Validate updates
      const validatedUpdates = this.validateUpdates(updates);
      return await AIConversationRepository.update(conversationId, tenantId, validatedUpdates);
    } catch (error) {
      logger.error('Model error updating conversation', { 
        error: error.message, 
        conversationId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Archive conversation (business logic: mark as completed)
   */
  static async archive(conversationId, tenantId) {
    try {
      if (!conversationId || !tenantId) {
        throw new Error('conversationId and tenantId are required');
      }
      return await AIConversationRepository.archive(conversationId, tenantId);
    } catch (error) {
      logger.error('Model error archiving conversation', { 
        error: error.message, 
        conversationId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Delete conversation (soft delete)
   */
  static async delete(conversationId, tenantId) {
    try {
      if (!conversationId || !tenantId) {
        throw new Error('conversationId and tenantId are required');
      }
      return await AIConversationRepository.softDelete(conversationId, tenantId);
    } catch (error) {
      logger.error('Model error deleting conversation', { 
        error: error.message, 
        conversationId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Get conversation statistics
   */
  static async getStats(conversationId, tenantId) {
    try {
      if (!conversationId || !tenantId) {
        throw new Error('conversationId and tenantId are required');
      }
      return await AIConversationRepository.getStats(conversationId, tenantId);
    } catch (error) {
      logger.error('Model error getting conversation stats', { 
        error: error.message, 
        conversationId, 
        tenantId 
      });
      throw error;
    }
  }
  /**
   * Update ICP data for conversation (legacy method for backward compatibility)
   */
  static async updateICPData(conversationId, tenantId, icpData) {
    return await this.update(conversationId, tenantId, { icp_data: icpData });
  }
  /**
   * Mark search as triggered (legacy method)
   */
  static async markSearchTriggered(conversationId, tenantId, searchParams) {
    return await this.update(conversationId, tenantId, { 
      search_triggered: true,
      search_params: searchParams,
      status: 'completed'
    });
  }
  /**
   * Business Logic: Validate metadata structure
   */
  static validateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return {};
    }
    // Ensure metadata doesn't contain sensitive information
    const allowedKeys = ['stage', 'preferences', 'ui_state', 'custom_fields'];
    const validatedMetadata = {};
    Object.keys(metadata).forEach(key => {
      if (allowedKeys.includes(key)) {
        validatedMetadata[key] = metadata[key];
      }
    });
    return validatedMetadata;
  }
  /**
   * Business Logic: Validate update fields
   */
  static validateUpdates(updates) {
    const validatedUpdates = { ...updates };
    // Validate specific fields
    if (validatedUpdates.metadata) {
      validatedUpdates.metadata = this.validateMetadata(validatedUpdates.metadata);
    }
    if (validatedUpdates.status) {
      const validStatuses = ['active', 'archived', 'completed'];
      if (!validStatuses.includes(validatedUpdates.status)) {
        throw new Error('Invalid status value');
      }
    }
    if (validatedUpdates.title && validatedUpdates.title.length > 255) {
      validatedUpdates.title = validatedUpdates.title.substring(0, 255);
    }
    return validatedUpdates;
  }
}
module.exports = AIConversation;