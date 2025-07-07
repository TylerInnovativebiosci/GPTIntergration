/**
 * Security Middleware Suite
 * Implements authentication, rate limiting, and request validation
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const { createHash } = require('crypto');

/**
 * Webhook signature verification for GoHighLevel
 */
function verifyGHLWebhook(req, res, next) {
  try {
    const signature = req.headers['x-ghl-signature'] || req.headers['x-hook-signature'];
    const webhookSecret = process.env.GHL_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('❌ GHL_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook verification not configured' });
    }

    if (!signature) {
      console.warn('⚠️ Webhook request without signature');
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    // Generate expected signature
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    // Timing-safe comparison
    const signatureValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!signatureValid) {
      console.warn('⚠️ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Add webhook metadata to request
    req.webhookVerified = true;
    req.webhookTimestamp = Date.now();
    
    next();
  } catch (error) {
    console.error('❌ Webhook verification error:', error);
    return res.status(500).json({ error: 'Webhook verification failed' });
  }
}

/**
 * API Key authentication middleware
 */
function authenticateAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  // In production, validate against database
  const validApiKeys = new Set([
    process.env.INTERNAL_API_KEY,
    process.env.EXTERNAL_API_KEY
  ].filter(Boolean));

  if (!validApiKeys.has(apiKey)) {
    console.warn(`⚠️ Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Add API key metadata
  req.apiKeyUsed = apiKey.substring(0, 8);
  next();
}

/**
 * JWT authentication middleware
 */
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

/**
 * Rate limiting configuration
 */
function createRateLimiter(options = {}) {
  const defaults = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
    handler: (req, res) => {
      console.warn(`⚠️ Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: req.rateLimit.resetTime,
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining
      });
    }
  };

  const config = { ...defaults, ...options };

  // Use Redis store if available
  if (process.env.REDIS_URL) {
    const Redis = require('ioredis');
    const client = new Redis(process.env.REDIS_URL);
    
    config.store = new RedisStore({
      client: client,
      prefix: 'rl:'
    });
  }

  return rateLimit(config);
}

/**
 * Request validation middleware
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors 
      });
    }
    
    next();
  };
}

/**
 * Sanitize input to prevent injection attacks
 */
function sanitizeInput(req, res, next) {
  // Recursively sanitize object
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove potential SQL injection patterns
        obj[key] = obj[key]
          .replace(/(['";\\])/g, '\\$1')
          .replace(/(\r\n|\n|\r)/gm, ' ')
          .trim();
        
        // Remove script tags
        obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        // Limit string length
        if (obj[key].length > 10000) {
          obj[key] = obj[key].substring(0, 10000);
        }
      } else if (typeof obj[key] === 'object') {
        obj[key] = sanitize(obj[key]);
      }
    }
    
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
}

/**
 * Security headers middleware
 */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });
}

/**
 * CORS configuration
 */
function configureCORS() {
  const cors = require('cors');
  
  const allowedOrigins = [
    'https://app.gohighlevel.com',
    'https://innovativebioscience.com',
    process.env.FRONTEND_URL
  ].filter(Boolean);

  return cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200
  });
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = crypto.randomBytes(16).toString('hex');
  
  req.requestId = requestId;
  
  // Log request
  console.log({
    type: 'request',
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log({
      type: 'response',
      requestId,
      status: res.statusCode,
      duration,
      contentLength: res.get('content-length')
    });
  });

  next();
}

/**
 * Error handling middleware
 */
function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'unknown';
  
  console.error({
    type: 'error',
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(err.status || 500).json({
    error: message,
    requestId
  });
}

module.exports = {
  verifyGHLWebhook,
  authenticateAPIKey,
  authenticateJWT,
  createRateLimiter,
  validateRequest,
  sanitizeInput,
  securityHeaders,
  configureCORS,
  requestLogger,
  errorHandler
};