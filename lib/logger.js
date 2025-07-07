const winston = require('winston');
const path = require('path');

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
      return `{"timestamp":"${timestamp}","level":"${level}","message":"${message}"${metaStr ? ',' + metaStr.slice(1, -1) : ''}}`;
    })
  ),
  defaultMeta: {
    service: 'rag-pipeline',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  },
  transports: [
    new winston.transports.Console()
  ]
});

// Request logging middleware
function requestLoggingMiddleware(req, res, next) {
  req.logger = logger.child({ 
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Log incoming request
  req.logger.info('Incoming request', {
    query: req.query,
    headers: req.headers
  });
  
  // Log response when finished
  const originalSend = res.send;
  res.send = function(data) {
    req.logger.info('Outgoing response', {
      statusCode: res.statusCode,
      duration: Date.now() - req.startTime,
      successful: res.statusCode < 400
    });
    originalSend.call(this, data);
  };
  
  next();
}

// Audit logger for security events
const auditLogger = {
  log: (event) => {
    logger.info('AUDIT', {
      ...event,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  logger,
  requestLoggingMiddleware,
  auditLogger
};