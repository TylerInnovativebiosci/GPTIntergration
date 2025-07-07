const CircuitBreaker = require('opossum');

class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
    this.defaultOptions = {
      timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 3000,
      errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD) || 50,
      resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT) || 30000
    };
  }

  create(name, asyncFunction, options = {}) {
    const breakerOptions = { ...this.defaultOptions, ...options };
    const breaker = new CircuitBreaker(asyncFunction, breakerOptions);
    
    // Add event listeners
    breaker.on('open', () => {
      console.log(`Circuit breaker ${name} opened`);
    });
    
    breaker.on('halfOpen', () => {
      console.log(`Circuit breaker ${name} is half-open`);
    });
    
    breaker.on('close', () => {
      console.log(`Circuit breaker ${name} closed`);
    });
    
    this.breakers.set(name, breaker);
    return breaker;
  }

  get(name) {
    return this.breakers.get(name);
  }

  getStatus() {
    const status = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = {
        state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
        stats: breaker.stats
      };
    }
    return status;
  }
}

// Create singleton instance
const circuitBreakerManager = new CircuitBreakerManager();

module.exports = {
  circuitBreakerManager
};