const { MongoClient } = require('mongodb');
const winston = require('winston');

// Simple logger for database operations
const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

let mongoClient = null;
let mongoDb = null;

async function connectMongoDB() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    mongoClient = new MongoClient(uri, {
      maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE) || 5,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 5000
    });

    await mongoClient.connect();
    mongoDb = mongoClient.db(process.env.MONGODB_DATABASE || 'innovativebiosci');
    
    logger.info('✅ MongoDB connected successfully');
    return { client: mongoClient, db: mongoDb };
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

async function connectRedis() {
  // Redis is optional
  if (!process.env.REDIS_URL) {
    logger.warn('⚠️ REDIS_URL not configured, skipping Redis connection');
    return null;
  }
  
  // Implement Redis connection if needed
  return null;
}

async function healthCheck() {
  const health = {
    mongodb: 'disconnected',
    redis: 'not configured',
    timestamp: new Date().toISOString()
  };

  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected()) {
      await mongoDb.admin().ping();
      health.mongodb = 'healthy';
    }
  } catch (error) {
    health.mongodb = 'unhealthy';
  }

  return health;
}

module.exports = {
  connectMongoDB,
  connectRedis,
  healthCheck,
  getDb: () => mongoDb,
  getClient: () => mongoClient
};