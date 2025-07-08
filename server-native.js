// server-native.js

// Production server - no external dependencies required
const http = require('http');
const PORT = process.env.PORT || 3000;

console.log('======== InnovativeBioScience Custom GPT API ========');
console.log(`» NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`» PORT: ${PORT}`);
console.log('----------------------------------------');

const inventory = {
  'FBS-001': { /* … same as before … */ },
  'FBS-002': { /* … */ },
  'MED-001': { /* … */ },
  'PLS-001': { /* … */ },
};

const server = http.createServer((req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.end();
  }

  // Health check
  if (req.url === '/health') {
    return res.end(JSON.stringify({
      status: 'healthy',
      timestamp,
      uptime_s: Math.round(process.uptime()),
      endpoints: ['/health', '/api/inventory/check', '/api/inventory/low-stock']
    }));
  }

  // Inventory check
  if (req.url === '/api/inventory/check' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { sku, category } = JSON.parse(body || '{}');
        let results = [];

        if (sku) {
          const item = inventory[sku.toUpperCase()];
          if (item) results.push(item);
        } else if (category) {
          results = Object.values(inventory)
            .filter(i => i.category === category.toUpperCase());
        } else {
          results = Object.values(inventory);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: results.length, data: results }));
      } catch (err) {
        console.error('Error parsing /api/inventory/check body:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Low stock
  if (req.url === '/api/inventory/low-stock' && req.method === 'GET') {
    const low = Object.values(inventory).filter(i => i.needs_reorder || i.stock_status === 'LOW');
    return res.end(JSON.stringify({ success: true, count: low.length, data: low }));
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: req.url }));
});

// Log just before binding
console.log('>> about to call server.listen()');
server.listen(PORT, () => {
  console.log('>> server.listen() callback fired');
  console.log(`
🚀 Custom GPT Inventory API is LIVE!
   • Health: http://localhost:${PORT}/health
   • Check:  http://localhost:${PORT}/api/inventory/check
   • Low:    http://localhost:${PORT}/api/inventory/low-stock
`);
});
