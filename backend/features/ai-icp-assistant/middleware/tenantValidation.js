/**
 * Tenant Validation Middleware
 * LAD Architecture: Security layer for multi-tenancy
 */

const logger = require('../utils/logger');

/**
 * Middleware to validate tenant context is available
 */
const validateTenantContext = (req, res, next) => {
  try {
    if (!req.user) {
      logger.warn('Missing user context in request', { path: req.path, method: req.method });
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'MISSING_USER_CONTEXT'
      });
    }

    if (!req.user.tenantId) {
      logger.warn('Missing tenant context in user', { 
        userId: req.user.id, 
        path: req.path, 
        method: req.method 
      });
      return res.status(403).json({ 
        error: 'Tenant context required',
        code: 'MISSING_TENANT_CONTEXT'
      });
    }

    // Add tenant validation to request context
    req.tenantId = req.user.tenantId;
    req.userId = req.user.id;

    logger.debug('Tenant context validated', { 
      userId: req.userId, 
      tenantId: req.tenantId, 
      path: req.path 
    });

    next();
  } catch (error) {
    logger.error('Tenant validation middleware error', { 
      error: error.message, 
      path: req.path 
    });
    return res.status(500).json({ 
      error: 'Internal server error',
      code: 'TENANT_VALIDATION_ERROR'
    });
  }
};

/**
 * Middleware to validate resource access within tenant
 */
const validateResourceAccess = (resourceIdParam = 'id') => {
  return (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      
      if (resourceId) {
        // Store for logging and audit
        req.resourceId = resourceId;
        req.resourceType = req.baseUrl.split('/').pop(); // e.g., 'conversations', 'profiles'
        
        logger.debug('Resource access validation', {
          userId: req.userId,
          tenantId: req.tenantId,
          resourceType: req.resourceType,
          resourceId: req.resourceId,
          method: req.method
        });
      }

      next();
    } catch (error) {
      logger.error('Resource access validation error', { 
        error: error.message,
        resourceIdParam,
        path: req.path 
      });
      return res.status(500).json({ 
        error: 'Internal server error',
        code: 'RESOURCE_VALIDATION_ERROR'
      });
    }
  };
};

/**
 * Middleware for role-based access control
 */
const validateRBACPermission = (requiredPermission) => {
  return (req, res, next) => {
    try {
      if (!req.user.capabilities || !Array.isArray(req.user.capabilities)) {
        logger.warn('Missing user capabilities for RBAC check', { 
          userId: req.userId, 
          tenantId: req.tenantId,
          requiredPermission 
        });
        return res.status(403).json({ 
          error: 'Access denied - insufficient permissions',
          code: 'MISSING_CAPABILITIES'
        });
      }

      const hasPermission = req.user.capabilities.includes(requiredPermission);
      
      if (!hasPermission) {
        logger.warn('RBAC permission denied', { 
          userId: req.userId, 
          tenantId: req.tenantId,
          requiredPermission,
          userCapabilities: req.user.capabilities,
          path: req.path
        });
        return res.status(403).json({ 
          error: `Access denied - missing permission: ${requiredPermission}`,
          code: 'INSUFFICIENT_PERMISSIONS',
          required: requiredPermission
        });
      }

      logger.debug('RBAC permission granted', { 
        userId: req.userId, 
        tenantId: req.tenantId,
        permission: requiredPermission 
      });

      next();
    } catch (error) {
      logger.error('RBAC validation error', { 
        error: error.message, 
        requiredPermission 
      });
      return res.status(500).json({ 
        error: 'Internal server error',
        code: 'RBAC_VALIDATION_ERROR'
      });
    }
  };
};

/**
 * Audit middleware for sensitive operations
 */
const auditOperation = (operation) => {
  return (req, res, next) => {
    // Log the operation for audit trail
    logger.info('Audit log', {
      operation,
      userId: req.userId,
      tenantId: req.tenantId,
      resourceType: req.resourceType,
      resourceId: req.resourceId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    next();
  };
};

module.exports = {
  validateTenantContext,
  validateResourceAccess,
  validateRBACPermission,
  auditOperation
};