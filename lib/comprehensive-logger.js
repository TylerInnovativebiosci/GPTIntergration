/**
 * Comprehensive Logging System
 * Logs EVERYTHING for debugging and monitoring
 */

const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const util = require('util');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for detailed logging
const detailedFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const log = {
      timestamp,
      level,
      message,
      ...meta
    };
    
    // Pretty print for console, JSON for files
    if (process.stdout.isTTY) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message} ${Object.keys(meta).length ? '\n' + util.inspect(meta, { depth: null, colors: true }) : ''}`;
    }
    return JSON.stringify(log);
  })
);

// Create main logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug', // Log everything by default
  format: detailedFormat,
  defaultMeta: {
    service: 'claude-ghl-integration',
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid,
    hostname: require('os').hostname()
  },
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        detailedFormat
      )
    }),
    
    // All logs file
    new winston.transports.File({
      filename: path.join(logsDir, 'all.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      tailable: true
    }),
    
    // Error logs file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Debug logs file (verbose)
    new winston.transports.File({
      filename: path.join(logsDir, 'debug.log'),
      level: 'debug',
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 3,
      tailable: true
    }),
    
    // HTTP request logs
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Database logs
    new winston.transports.File({
      filename: path.join(logsDir, 'database.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Security events
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 10,
      tailable: true
    }),
    
    // Performance metrics
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5,
      tailable: true
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ]
});

// Specialized loggers
const httpLogger = logger.child({ category: 'http' });
const dbLogger = logger.child({ category: 'database' });
const securityLogger = logger.child({ category: 'security' });
const performanceLogger = logger.child({ category: 'performance' });

/**
 * Log HTTP requests with full details
 */
function logHttpRequest(req, res, next) {
  const start = Date.now();
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  
  req.correlationId = correlationId;
  req.startTime = start;
  
  // Log request
  httpLogger.info('Incoming HTTP request', {
    correlationId,
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: req.headers,
    ip: req.ip,
    ips: req.ips,
    protocol: req.protocol,
    secure: req.secure,
    xhr: req.xhr,
    httpVersion: req.httpVersion,
    body: req.body, // Will log body if parsed
    cookies: req.cookies,
    signedCookies: req.signedCookies,
    fresh: req.fresh,
    stale: req.stale,
    hostname: req.hostname,
    subdomains: req.subdomains,
    originalUrl: req.originalUrl
  });
  
  // Capture response
  const originalSend = res.send;
  const originalJson = res.json;
  const originalEnd = res.end;
  
  // Track response body
  let responseBody;
  
  res.send = function(data) {
    responseBody = data;
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    responseBody = JSON.stringify(data);
    return originalJson.call(this, data);
  };
  
  res.end = function(chunk, encoding) {
    if (chunk) {
      responseBody = chunk;
    }
    
    // Log response
    const duration = Date.now() - start;
    
    httpLogger.info('Outgoing HTTP response', {
      correlationId,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      duration,
      headers: res.getHeaders(),
      body: responseBody,
      size: res.get('content-length'),
      type: res.get('content-type')
    });
    
    // Log performance
    if (duration > 1000) {
      performanceLogger.warn('Slow HTTP request', {
        correlationId,
        duration,
        method: req.method,
        path: req.path
      });
    }
    
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
}

/**
 * Log database operations
 */
function logDatabaseOperation(operation, collection, query, options, result, error, duration) {
  const log = {
    operation,
    collection,
    query,
    options,
    duration,
    timestamp: new Date().toISOString()
  };
  
  if (error) {
    log.error = {
      message: error.message,
      code: error.code,
      stack: error.stack
    };
    dbLogger.error('Database operation failed', log);
  } else {
    log.result = {
      success: true,
      affectedDocuments: result?.modifiedCount || result?.deletedCount || result?.insertedCount || 0,
      matched: result?.matchedCount,
      upserted: result?.upsertedCount
    };
    dbLogger.info('Database operation completed', log);
  }
  
  // Log slow queries
  if (duration > 100) {
    performanceLogger.warn('Slow database query', {
      operation,
      collection,
      duration,
      query
    });
  }
}

/**
 * Log security events
 */
function logSecurityEvent(event, details) {
  securityLogger.warn('Security event', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log API calls to external services
 */
function logApiCall(service, method, url, headers, body, response, error, duration) {
  const log = {
    service,
    method,
    url,
    duration,
    timestamp: new Date().toISOString()
  };
  
  // Log request details
  if (headers) log.requestHeaders = headers;
  if (body) log.requestBody = body;
  
  if (error) {
    log.error = {
      message: error.message,
      code: error.code,
      response: error.response?.data
    };
    logger.error(`External API call failed: ${service}`, log);
  } else {
    log.response = {
      status: response?.status,
      headers: response?.headers,
      data: response?.data
    };
    logger.info(`External API call completed: ${service}`, log);
  }
  
  // Log slow API calls
  if (duration > 3000) {
    performanceLogger.warn('Slow external API call', {
      service,
      url,
      duration
    });
  }
}

/**
 * Log application lifecycle events
 */
function logLifecycle(event, details) {
  logger.info(`Application lifecycle: ${event}`, {
    event,
    ...details,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
}

/**
 * Log process events
 */
function setupProcessLogging() {
  // Log uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      timestamp: new Date().toISOString()
    });
  });
  
  // Log unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', {
      reason,
      promise: util.inspect(promise),
      timestamp: new Date().toISOString()
    });
  });
  
  // Log process warnings
  process.on('warning', (warning) => {
    logger.warn('Process warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
      timestamp: new Date().toISOString()
    });
  });
  
  // Log exit
  process.on('exit', (code) => {
    logger.info('Process exit', {
      code,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  // Log signals
  ['SIGTERM', 'SIGINT', 'SIGUSR1', 'SIGUSR2'].forEach(signal => {
    process.on(signal, () => {
      logger.info('Process signal received', {
        signal,
        timestamp: new Date().toISOString()
      });
    });
  });
}

/**
 * Create child logger with context
 */
function createLogger(context) {
  return logger.child(context);
}

/**
 * Log with correlation ID
 */
function logWithCorrelation(correlationId, level, message, meta) {
  logger.log(level, message, { correlationId, ...meta });
}

// Setup process logging immediately
setupProcessLogging();

// Log startup
logLifecycle('startup', {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  env: process.env.NODE_ENV,
  args: process.argv,
  execPath: process.execPath,
  cwd: process.cwd(),
  pid: process.pid,
  ppid: process.ppid
});

module.exports = {
  logger,
  httpLogger,
  dbLogger,
  securityLogger,
  performanceLogger,
  logHttpRequest,
  logDatabaseOperation,
  logSecurityEvent,
  logApiCall,
  logLifecycle,
  createLogger,
  logWithCorrelation,
  
  // Direct access to log levels
  debug: (message, meta) => logger.debug(message, meta),
  info: (message, meta) => logger.info(message, meta),
  warn: (message, meta) => logger.warn(message, meta),
  error: (message, meta) => logger.error(message, meta),
  
  // Log categories
  http: (message, meta) => httpLogger.info(message, meta),
  db: (message, meta) => dbLogger.info(message, meta),
  security: (message, meta) => securityLogger.info(message, meta),
  performance: (message, meta) => performanceLogger.info(message, meta)
};