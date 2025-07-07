/**
 * Comprehensive Error Handler Middleware
 * Categorizes errors and provides user-friendly responses
 */

const { logger } = require('../lib/comprehensive-logger');
const { v4: uuidv4 } = require('uuid');

// Error categories
const ErrorCategories = {
  VALIDATION: 'VALIDATION_ERROR',
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE_ERROR',
  DATABASE: 'DATABASE_ERROR',
  INTERNAL: 'INTERNAL_ERROR'
};

// User-friendly error messages
const UserMessages = {
  [ErrorCategories.VALIDATION]: 'Please check your input and try again.',
  [ErrorCategories.AUTHENTICATION]: 'Please log in to continue.',
  [ErrorCategories.AUTHORIZATION]: 'You do not have permission to perform this action.',
  [ErrorCategories.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCategories.CONFLICT]: 'This operation conflicts with existing data.',
  [ErrorCategories.RATE_LIMITED]: 'Too many requests. Please try again later.',
  [ErrorCategories.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again.',
  [ErrorCategories.EXTERNAL_SERVICE]: 'External service is not responding. Please try again later.',
  [ErrorCategories.DATABASE]: 'Database operation failed. Please try again.',
  [ErrorCategories.INTERNAL]: 'An unexpected error occurred. Please try again.'
};

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Generate error ID for tracking
  const errorId = uuidv4();
  const timestamp = new Date().toISOString();
  
  // Build error context
  const errorContext = {
    id: errorId,
    timestamp,
    path: req.path,
    method: req.method,
    correlationId: req.correlationId || 'unknown',
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  };

  // Categorize the error
  const errorInfo = categorizeError(err);
  
  // Log the error with full context
  logError(err, errorInfo, errorContext);
  
  // Send metrics
  trackErrorMetrics(errorInfo.category, req.path);
  
  // Prepare response
  const response = {
    error: {
      id: errorId,
      type: errorInfo.category,
      message: errorInfo.userMessage,
      timestamp
    }
  };

  // Add additional info based on environment
  if (process.env.NODE_ENV === 'development') {
    response.error.details = errorInfo.details;
    response.error.stack = err.stack;
  }

  // Add retry information if applicable
  if (errorInfo.retryAfter) {
    response.error.retryAfter = errorInfo.retryAfter;
  }

  // Set appropriate status code
  res.status(errorInfo.statusCode);

  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Error-Id': errorId
  });

  // Send response
  res.json(response);
};

/**
 * Categorize error based on type and content
 */
function categorizeError(err) {
  let category = ErrorCategories.INTERNAL;
  let statusCode = 500;
  let userMessage = UserMessages[ErrorCategories.INTERNAL];
  let details = {};
  let retryAfter = null;

  // MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    category = ErrorCategories.DATABASE;
    
    if (err.code === 11000) {
      category = ErrorCategories.CONFLICT;
      statusCode = 409;
      userMessage = 'This record already exists.';
      details.field = extractDuplicateField(err.message);
    } else if (err.code === 8000) {
      category = ErrorCategories.AUTHENTICATION;
      statusCode = 401;
      userMessage = 'Database authentication failed.';
    }
  }
  
  // Validation errors
  else if (err.name === 'ValidationError' || err.isJoi) {
    category = ErrorCategories.VALIDATION;
    statusCode = 400;
    userMessage = UserMessages[ErrorCategories.VALIDATION];
    
    if (err.details) {
      details.fields = err.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }));
    } else if (err.errors) {
      details.fields = Object.keys(err.errors).map(field => ({
        field,
        message: err.errors[field].message
      }));
    }
  }
  
  // Authentication errors
  else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    category = ErrorCategories.AUTHENTICATION;
    statusCode = 401;
    userMessage = UserMessages[ErrorCategories.AUTHENTICATION];
    
    if (err.name === 'TokenExpiredError') {
      details.expired = true;
      userMessage = 'Your session has expired. Please log in again.';
    }
  }
  
  // Rate limiting
  else if (err.status === 429 || err.response?.status === 429) {
    category = ErrorCategories.RATE_LIMITED;
    statusCode = 429;
    userMessage = UserMessages[ErrorCategories.RATE_LIMITED];
    retryAfter = err.retryAfter || err.response?.headers?.['retry-after'] || 60;
  }
  
  // External service errors
  else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
    category = ErrorCategories.EXTERNAL_SERVICE;
    statusCode = 503;
    userMessage = UserMessages[ErrorCategories.EXTERNAL_SERVICE];
    details.service = err.address || err.hostname || 'unknown';
  }
  
  // Axios errors
  else if (err.isAxiosError) {
    if (err.response) {
      statusCode = err.response.status;
      
      if (statusCode === 404) {
        category = ErrorCategories.NOT_FOUND;
      } else if (statusCode === 429) {
        category = ErrorCategories.RATE_LIMITED;
        retryAfter = err.response.headers['retry-after'];
      } else if (statusCode >= 500) {
        category = ErrorCategories.EXTERNAL_SERVICE;
      } else if (statusCode === 401) {
        category = ErrorCategories.AUTHENTICATION;
      } else if (statusCode === 403) {
        category = ErrorCategories.AUTHORIZATION;
      } else if (statusCode === 400) {
        category = ErrorCategories.VALIDATION;
      }
      
      details.service = err.config?.baseURL || err.config?.url;
      details.responseData = err.response.data;
    } else if (err.request) {
      category = ErrorCategories.SERVICE_UNAVAILABLE;
      statusCode = 503;
      details.service = err.config?.baseURL || err.config?.url;
    }
  }
  
  // Custom application errors
  else if (err.statusCode) {
    statusCode = err.statusCode;
    userMessage = err.userMessage || UserMessages[category];
    
    if (err.category) {
      category = err.category;
    }
  }
  
  // Not found errors
  else if (err.status === 404 || err.message?.includes('not found')) {
    category = ErrorCategories.NOT_FOUND;
    statusCode = 404;
    userMessage = UserMessages[ErrorCategories.NOT_FOUND];
  }

  return {
    category,
    statusCode,
    userMessage: userMessage || UserMessages[category],
    details,
    retryAfter
  };
}

/**
 * Log error with appropriate level and context
 */
function logError(err, errorInfo, context) {
  const logData = {
    ...context,
    error: {
      message: err.message,
      name: err.name,
      code: err.code,
      category: errorInfo.category,
      statusCode: errorInfo.statusCode
    }
  };

  // Add stack trace for 5xx errors
  if (errorInfo.statusCode >= 500) {
    logData.error.stack = err.stack;
  }

  // Add request body for validation errors (sanitized)
  if (errorInfo.category === ErrorCategories.VALIDATION && context.method === 'POST') {
    logData.requestBody = sanitizeRequestBody(err.body || {});
  }

  // Choose log level based on error type
  if (errorInfo.statusCode >= 500) {
    logger.error('Request failed with server error', logData);
  } else if (errorInfo.statusCode >= 400) {
    logger.warn('Request failed with client error', logData);
  } else {
    logger.info('Request failed', logData);
  }
}

/**
 * Track error metrics
 */
function trackErrorMetrics(category, path) {
  // Implement your metrics tracking
  // Could use StatsD, Prometheus, CloudWatch, etc.
  logger.debug('Error metric tracked', { category, path });
}

/**
 * Extract duplicate field from MongoDB error
 */
function extractDuplicateField(message) {
  const match = message.match(/index: (\w+)_/);
  return match ? match[1] : 'unknown';
}

/**
 * Sanitize request body for logging
 */
function sanitizeRequestBody(body) {
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'creditCard'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Not found handler (404)
 */
const notFoundHandler = (req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.path}`);
  err.status = 404;
  err.category = ErrorCategories.NOT_FOUND;
  next(err);
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Create custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode = 500, category = ErrorCategories.INTERNAL) {
    super(message);
    this.statusCode = statusCode;
    this.category = category;
    this.userMessage = UserMessages[category];
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, fields) {
    super(message, 400, ErrorCategories.VALIDATION);
    this.fields = fields;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, ErrorCategories.AUTHENTICATION);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, ErrorCategories.AUTHORIZATION);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, ErrorCategories.NOT_FOUND);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, ErrorCategories.CONFLICT);
  }
}

class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Rate limit exceeded', 429, ErrorCategories.RATE_LIMITED);
    this.retryAfter = retryAfter;
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ErrorCategories
};