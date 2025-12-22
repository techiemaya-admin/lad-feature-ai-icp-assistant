/**
 * Test Server for AI-ICP-Assistant Feature
 * 
 * This is a standalone server to test the ai-icp-assistant feature
 * without needing the full LAD application.
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Mock the database connection for testing
const mockDb = require('./test-database');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  // Intercept database connection requires
  if (id.includes('shared/database/connection')) {
    return mockDb;
  }
  return originalRequire.apply(this, arguments);
};

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple auth middleware (for testing)
app.use((req, res, next) => {
  // Mock user for testing
  req.user = {
    userId: 'test-user-123',
    email: 'test@example.com',
    organizationId: 'test-org-456'
  };
  next();
});

// Load AI-ICP-Assistant routes
try {
  const aiRoutes = require('./backend/routes/index');
  app.use('/api/ai-icp-assistant', aiRoutes);
  console.log('✅ AI-ICP-Assistant routes loaded');
} catch (error) {
  console.error('❌ Failed to load AI routes:', error.message);
  process.exit(1);
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    feature: 'ai-icp-assistant',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AI-ICP-Assistant Test Server',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      chat: 'POST /api/ai-icp-assistant/chat',
      expandKeywords: 'POST /api/ai-icp-assistant/expand-keywords',
      history: 'GET /api/ai-icp-assistant/history',
      reset: 'POST /api/ai-icp-assistant/reset'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 AI-ICP-Assistant Test Server Running');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📋 API Base: http://localhost:${PORT}/api/ai-icp-assistant`);
  console.log('');
  console.log('Available Endpoints:');
  console.log(`  • Health: http://localhost:${PORT}/health`);
  console.log(`  • Chat: POST http://localhost:${PORT}/api/ai-icp-assistant/chat`);
  console.log(`  • Keywords: POST http://localhost:${PORT}/api/ai-icp-assistant/expand-keywords`);
  console.log('');
  console.log('🔑 Gemini API Key:', process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});
