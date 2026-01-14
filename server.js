/**
 * Standalone Express Server for AI ICP Assistant Feature
 * 
 * This server runs the AI ICP Assistant feature independently
 * for testing purposes. In production, this feature is integrated
 * into the main LAD Backend via feature registry.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./backend/features/ai-icp-assistant/routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    query: req.query,
    hasBody: req.method === 'POST' ? !!req.body : undefined,
    bodyKeys: req.method === 'POST' && req.body ? Object.keys(req.body) : undefined
  });
  next();
});

// Mock authentication middleware for testing
// In production, this would be handled by the main LAD backend
app.use((req, res, next) => {
  // Mock user for testing
  if (!req.user) {
    req.user = {
      userId: 'test-user-id',
      tenantId: 'test-tenant-id',
      email: 'test@example.com'
    };
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ai-icp-assistant',
    version: '2.0.0'
  });
});

// Mount feature routes
// The routes include both /chat and /onboarding/* endpoints
app.use('/api/ai-icp-assistant', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI ICP Assistant Backend running on http://localhost:${PORT}`);
  console.log(`📝 API Base: http://localhost:${PORT}/api/ai-icp-assistant`);
  console.log(`📋 Health Check: http://localhost:${PORT}/health`);
  console.log(`\n⚠️  Note: This is a standalone server for testing.`);
  console.log(`   In production, this feature is integrated into LAD Backend.\n`);
});

module.exports = app;

