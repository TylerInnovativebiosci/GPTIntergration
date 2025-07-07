/**
 * Secure Production Server
 * Implements all security best practices and monitoring
 */

require('dotenv').config();
const express = require('express');
const { createServer } = require('https');
const fs = require('fs');
const path = require('path');

// Security middleware
const {
  verifyGHLWebhook,
  authenticateAPIKey,
  createRateLimiter,
  sanitizeInput,
  securityHeaders,
  configureCORS,
  requestLogger,
  errorHandler
} = require('./middleware/security');

// Database and monitoring
const { connectMongoDB, connectRedis, healthCheck } = require('./lib/database');
const { logger, requestLoggingMiddleware, auditLogger } = require('./lib/logger');
const { circuitBreakerManager } = require('./lib/circuit-breaker');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Apply security headers
app.use(securityHeaders());

// Configure CORS
app.use(configureCORS());

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging
app.use(requestLoggingMiddleware);

// Sanitize all inputs
app.use(sanitizeInput);

// Global rate limiting
app.use('/api', createRateLimiter());

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    const cbHealth = circuitBreakerManager.healthCheck();
    
    const overall = {
      status: dbHealth.mongodb === 'healthy' && cbHealth.status === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: dbHealth,
      circuitBreakers: cbHealth
    };
    
    const statusCode = overall.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(overall);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// Metrics endpoint (requires API key)
app.get('/metrics', authenticateAPIKey, (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    circuitBreakers: circuitBreakerManager.getMetrics(),
    process: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  };
  
  res.json(metrics);
});

// GoHighLevel webhook endpoints with authentication
app.post('/webhook/contact.create', 
  verifyGHLWebhook,
  createRateLimiter({ max: 1000 }), // Higher limit for webhooks
  async (req, res) => {
    const logger = req.logger;
    
    try {
      logger.info('Contact create webhook received', {
        contactId: req.body.id,
        email: req.body.email ? '[REDACTED]' : undefined
      });
      
      // Audit log
      auditLogger.log({
        type: 'webhook_received',
        action: 'contact.create',
        resourceType: 'contact',
        resourceId: req.body.id,
        correlationId: req.correlationId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      // Process webhook (implement your logic)
      // const result = await processContactCreate(req.body);
      
      res.json({ success: true, correlationId: req.correlationId });
    } catch (error) {
      logger.error('Webhook processing failed', { error: error.message });
      res.status(500).json({ error: 'Processing failed', correlationId: req.correlationId });
    }
  }
);

// API endpoints with authentication
const apiRouter = express.Router();

// Apply API key authentication to all API routes
apiRouter.use(authenticateAPIKey);

// Specific rate limits for different endpoints
apiRouter.get('/contacts', createRateLimiter({ max: 100 }), async (req, res) => {
  // Implementation here
  res.json({ message: 'Contacts endpoint' });
});

apiRouter.post('/enrich', createRateLimiter({ max: 50 }), async (req, res) => {
  // Implementation here
  res.json({ message: 'Enrichment endpoint' });
});

app.use('/api/v1', apiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close database connections
  try {
    await require('./lib/database').disconnect();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections', { error: error.message });
  }
  
  // Shutdown circuit breakers
  try {
    await circuitBreakerManager.shutdown();
    logger.info('Circuit breakers shut down');
  } catch (error) {
    logger.error('Error shutting down circuit breakers', { error: error.message });
  }
  
  // Exit
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

// Start server
async function startServer() {
  try {
    // Connect to databases
    await connectMongoDB();
    await connectRedis();
    
    logger.info('Database connections established');
    
    // Create HTTPS server in production
    let server;
    if (process.env.NODE_ENV === 'production' && process.env.SSL_CERT && process.env.SSL_KEY) {
      const httpsOptions = {
        cert: fs.readFileSync(process.env.SSL_CERT),
        key: fs.readFileSync(process.env.SSL_KEY)
      };
      server = createServer(httpsOptions, app);
      logger.info('HTTPS server configured');
    } else {
      server = app;
      if (process.env.NODE_ENV === 'production') {
        logger.warn('⚠️ Running HTTP in production - configure SSL certificates!');
      }
    }
    
    // Start listening
    server.listen(PORT, () => {
      logger.info(`🚀 Secure server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔒 Environment: ${process.env.NODE_ENV}`);
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Export for testing
module.exports = { app, startServer };

// Start server if running directly
if (require.main === module) {
  startServer();
}