/**
 * Mock Database Connection for Testing
 * 
 * This provides in-memory storage for testing without a real database
 */

class MockDatabase {
  constructor() {
    this.conversations = [];
    this.messages = [];
    this.profiles = [];
    this.keywords = [];
    this.idCounter = 1;
  }

  generateId() {
    return this.idCounter++;
  }

  generateUuid() {
    return `mock-uuid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async query(sql, params = []) {
    console.log('[Mock DB Query]', sql.substring(0, 100) + '...');
    
    // Handle INSERT INTO ai_conversations
    if (sql.includes('INSERT INTO ai_conversations')) {
      const conversation = {
        id: this.generateId(),
        conversation_id: this.generateUuid(),
        user_id: params[0],
        organization_id: params[1],
        title: params[2],
        metadata: params[3],
        created_at: new Date(),
        updated_at: new Date()
      };
      this.conversations.push(conversation);
      return { rows: [conversation] };
    }

    // Handle INSERT INTO ai_messages
    if (sql.includes('INSERT INTO ai_messages')) {
      const message = {
        id: this.generateId(),
        message_id: this.generateUuid(),
        conversation_id: params[0],
        role: params[1],
        content: params[2],
        metadata: params[3],
        created_at: new Date()
      };
      this.messages.push(message);
      return { rows: [message] };
    }

    // Handle INSERT INTO icp_profiles
    if (sql.includes('INSERT INTO icp_profiles')) {
      const profile = {
        id: this.generateId(),
        profile_id: this.generateUuid(),
        user_id: params[0],
        conversation_id: params[1],
        profile_data: params[2],
        status: params[3],
        created_at: new Date(),
        updated_at: new Date()
      };
      this.profiles.push(profile);
      return { rows: [profile] };
    }

    // Handle INSERT INTO keyword_expansions
    if (sql.includes('INSERT INTO keyword_expansions')) {
      const keyword = {
        id: this.generateId(),
        expansion_id: this.generateUuid(),
        conversation_id: params[0],
        original_keyword: params[1],
        expanded_keywords: params[2],
        metadata: params[3],
        created_at: new Date()
      };
      this.keywords.push(keyword);
      return { rows: [keyword] };
    }

    // Handle SELECT for conversations
    if (sql.includes('SELECT') && sql.includes('ai_conversations')) {
      if (sql.includes('WHERE user_id')) {
        const userId = params[0];
        const filtered = this.conversations.filter(c => c.user_id === userId);
        return { rows: filtered };
      }
      if (sql.includes('WHERE conversation_id')) {
        const convId = params[0];
        const found = this.conversations.find(c => c.conversation_id === convId);
        return { rows: found ? [found] : [] };
      }
      return { rows: this.conversations };
    }

    // Handle SELECT for messages
    if (sql.includes('SELECT') && sql.includes('ai_messages')) {
      if (sql.includes('WHERE conversation_id')) {
        const convId = params[0];
        const filtered = this.messages.filter(m => m.conversation_id === convId);
        return { rows: filtered };
      }
      return { rows: this.messages };
    }

    // Handle UPDATE for conversations
    if (sql.includes('UPDATE ai_conversations')) {
      const convId = params[params.length - 1];
      const conv = this.conversations.find(c => c.conversation_id === convId);
      if (conv) {
        conv.updated_at = new Date();
        if (sql.includes('title')) conv.title = params[0];
        if (sql.includes('metadata')) conv.metadata = params[0];
        return { rows: [conv] };
      }
      return { rows: [] };
    }

    // Handle DELETE
    if (sql.includes('DELETE FROM ai_conversations')) {
      const convId = params[0];
      this.conversations = this.conversations.filter(c => c.conversation_id !== convId);
      this.messages = this.messages.filter(m => m.conversation_id !== convId);
      return { rows: [] };
    }

    // Default empty response
    return { rows: [] };
  }
}

const mockDb = new MockDatabase();

module.exports = {
  query: mockDb.query.bind(mockDb),
  mockDb
};
