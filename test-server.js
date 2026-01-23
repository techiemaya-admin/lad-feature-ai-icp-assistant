/**
 * Test Server for AI ICP Assistant
 * 
 * Simple Express server to test the AI ICP Assistant endpoints
 * with proper database connection and middleware.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./backend/features/ai-icp-assistant/utils/logger');
// Load environment variables from .env file
require('dotenv').config();
// Environment configuration with fallbacks
if (!process.env.DB_HOST) {
  process.env.DB_HOST = '165.22.221.77';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'salesmaya_agent';
  process.env.DB_USER = 'dbadmin';
  process.env.DB_PASSWORD = 'TechieMaya';
  process.env.DB_SCHEMA = 'lad_dev';
}
// Backward compatibility for DATABASE_URL
if (process.env.DATABASE_URL && !process.env.DB_HOST) {
  const url = new URL(process.env.DATABASE_URL);
  process.env.DB_HOST = url.hostname;
  process.env.DB_PORT = url.port || '5432';
  process.env.DB_NAME = url.pathname.slice(1).split('?')[0];
  process.env.DB_USER = url.username;
  process.env.DB_PASSWORD = url.password;
  const searchParams = new URLSearchParams(url.search);
  process.env.DB_SCHEMA = searchParams.get('schema') || 'lad_dev';
}
const app = express();
const PORT = process.env.PORT || 3001;
// Middleware - CORS with credentials support
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-organization-id', 'x-tenant-id', 'userid', 'tenantid']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  logger.info('Request', {
    timestamp,
    method: req.method,
    url: req.originalUrl,
    userId: req.headers['x-user-id'],
    orgId: req.headers['x-organization-id'],
    tenantId: req.headers['x-tenant-id']
  });
  next();
});
// Mock authentication middleware (for testing)
app.use((req, res, next) => {
  // Extract user info from headers (in production, this comes from JWT)
  const userId = req.headers['x-user-id'] || req.headers['userid'] || '1';
  const tenantId = req.headers['x-tenant-id'] || req.headers['tenantid'] || '00000000-0000-0000-0000-000000000001';
  req.user = {
    id: userId,
    userId: userId, // Add both for compatibility
    organizationId: req.headers['x-organization-id'] || 'test-org-456',
    tenantId: tenantId,
    schema: 'lad_dev', // In production, this is resolved from tenant
    capabilities: ['chat_with_ai', 'define_icp', 'trigger_apollo_search'] // Mock capabilities
  };
  next();
});
// Mount AI ICP Assistant routes
try {
  // Mock the auth middleware before loading routes
  const mockAuthMiddleware = (req, res, next) => {
    // Authentication is already set up above in the mock authentication middleware
    next();
  };
  // Override the authenticateToken middleware globally
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id.includes('core/middleware/auth')) {
      return { authenticateToken: mockAuthMiddleware };
    }
    return originalRequire.apply(this, arguments);
  };
  const aiICPRoutes = require('./backend/features/ai-icp-assistant/routes/ai-icp-assistant.routes.js');
  app.use('/api/ai-icp-assistant', aiICPRoutes);
  // ...existing code...
  // Restore original require
  Module.prototype.require = originalRequire;
} catch (error) {
  logger.error('Failed to mount AI ICP Assistant routes:', error.message);
  // ...existing code...
  try {
    // Create a simplified router without the problematic require
    const express = require('express');
    const router = express.Router();
    const AIAssistantController = require('./backend/features/ai-icp-assistant/controllers/AIAssistantController');
    const IndustryClassificationController = require('./backend/features/ai-icp-assistant/controllers/IndustryClassificationController');
    const {
      validateChatRequest,
      validateKeywordRequest,
      validateProfileCreation,
      validateUuidParam,
      validatePagination
    } = require('./backend/features/ai-icp-assistant/middleware/validation');
    // Chat routes
    router.post('/chat', validateChatRequest, AIAssistantController.chat);
    router.get('/history', validatePagination, AIAssistantController.getHistory);
    router.get('/conversations/:id', validateUuidParam('id'), AIAssistantController.getConversation);
    router.post('/reset', AIAssistantController.resetConversation);
    // Keyword expansion
    router.post('/expand-keywords', validateKeywordRequest, AIAssistantController.expandKeywords);
    // Industry Classification (Gemini AI)
    router.post('/classify-industry', IndustryClassificationController.classifyIndustry);
    router.get('/industry-suggestions', IndustryClassificationController.getIndustrySuggestions);
    // ICP Profiles
    router.get('/profiles', validatePagination, AIAssistantController.getProfiles);
    router.post('/profiles', validateProfileCreation, AIAssistantController.createProfile);
    router.put('/profiles/:id', validateUuidParam('id'), AIAssistantController.updateProfile);
    router.delete('/profiles/:id', validateUuidParam('id'), AIAssistantController.deleteProfile);
    router.post('/profiles/:id/use', validateUuidParam('id'), AIAssistantController.useProfile);
    // Try to mount onboarding routes separately
    try {
      const onboardingRoutes = require('./backend/features/ai-icp-assistant/routes/ai-icp-assistant.routes');
      router.use('/', onboardingRoutes);
      // ...existing code...
    } catch (onboardingError) {
      // ...existing code...
    }
    app.use('/api/ai-icp-assistant', router);
    // ...existing code...
  } catch (fallbackError) {
    logger.error('Failed to mount even basic routes:', fallbackError.message);
  }
}
// Serve static test UI
app.use('/test-ui', express.static(path.join(__dirname)));
app.get('/test-ui', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-ui.html'));
});
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      database: process.env.DATABASE_URL ? 'configured' : 'not configured',
      geminiApi: process.env.GEMINI_API_KEY ? 'configured' : 'not configured'
    }
  });
});
// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AI ICP Assistant Test Server',
    version: '1.0.0',
    endpoints: {
      testUI: '/test-ui',
      health: '/health',
      api: '/api/ai-icp-assistant/*'
    },
    availableRoutes: [
      'POST /api/ai-icp-assistant/chat',
      'GET /api/ai-icp-assistant/history',
      'GET /api/ai-icp-assistant/conversations/:id',
      'POST /api/ai-icp-assistant/reset',
      'POST /api/ai-icp-assistant/expand-keywords',
      'POST /api/ai-icp-assistant/classify-industry',
      'GET /api/ai-icp-assistant/industry-suggestions',
      'GET /api/ai-icp-assistant/profiles',
      'POST /api/ai-icp-assistant/profiles',
      'PUT /api/ai-icp-assistant/profiles/:id',
      'DELETE /api/ai-icp-assistant/profiles/:id',
      'POST /api/ai-icp-assistant/profiles/:id/use',
      'GET /api/ai-icp-assistant/onboarding/icp-questions',
      'GET /api/ai-icp-assistant/onboarding/icp-questions/:stepIndex',
      'POST /api/ai-icp-assistant/onboarding/icp-answer'
    ]
  });
});
// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path
  });
});
// Start server
app.listen(PORT, () => {
  // ...existing code...
});
// Graceful shutdown
process.on('SIGTERM', () => {
  // ...existing code...
  process.exit(0);
});
process.on('SIGINT', () => {
  // ...existing code...
  process.exit(0);
});