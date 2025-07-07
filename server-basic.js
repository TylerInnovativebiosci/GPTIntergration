const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;

// Simple request handler
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ghl-signature, x-api-key');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (path === '/health' && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: {
        PORT: process.env.PORT || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set',
        MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'NOT SET',
        totalEnvVars: Object.keys(process.env).length
      }
    }));
    return;
  }

  // Webhook endpoint
  if (path === '/api/webhooks/ghl' && method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      console.log('Webhook received:', body);
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: 'Webhook received',
        timestamp: new Date().toISOString()
      }));
    });
    return;
  }

  // Default response
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
server.listen(PORT, () => {
  console.log(`Basic server running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- PORT:', process.env.PORT || 'not set');
  console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('- MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
  console.log('- Total env vars:', Object.keys(process.env).length);
  console.log('\nEndpoints:');
  console.log(`- Health: http://localhost:${PORT}/health`);
  console.log(`- Webhook: http://localhost:${PORT}/api/webhooks/ghl`);
});
