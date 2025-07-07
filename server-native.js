// Production server - no external dependencies required
const http = require('http');
const PORT = process.env.PORT || 3000;

console.log('Starting InnovativeBioScience Custom GPT server...');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', PORT);

// Simple in-memory data
const inventory = {
    'FBS-001': {
        sku: 'FBS-001',
        name: 'Fetal Bovine Serum - US Origin',
        category: 'FBS',
        quantity: 150,
        unit: 'bottles (500ml)',
        reorder_point: 50,
        location: 'Cold Storage A1',
        stock_status: 'NORMAL',
        needs_reorder: false
    },
    'FBS-002': {
        sku: 'FBS-002',
        name: 'Fetal Bovine Serum - USDA Approved',
        category: 'FBS',
        quantity: 30,
        unit: 'bottles (500ml)',
        reorder_point: 30,
        location: 'Cold Storage A2',
        stock_status: 'LOW',
        needs_reorder: false
    }
};

const server = http.createServer((req, res) => {
    const timestamp = new Date().toISOString();
    const logPrefix = `[${timestamp}]`;
    
    // Log every request
    console.log(`${logPrefix} ${req.method} ${req.url}`);
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Health check
    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            service: 'InnovativeBioScience GPT API',
            timestamp: timestamp,
            uptime: process.uptime()
        }));
        return;
    }
    
    // Inventory check endpoint
    if (req.url === '/api/inventory/check' && req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = body ? JSON.parse(body) : {};
                const { sku, category } = data;
                
                let results = [];
                
                if (sku) {
                    const item = inventory[sku.toUpperCase()];
                    if (item) {
                        results.push(item);
                    }
                } else if (category) {
                    results = Object.values(inventory)
                        .filter(item => item.category === category.toUpperCase());
                } else {
                    results = Object.values(inventory);
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    data: results,
                    request_id: `req_${Date.now()}`
                }));
                
            } catch (error) {
                console.error(`${logPrefix} Error:`, error.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid request data'
                }));
            }
        });
        
        return;
    }
    
    // 404 for unknown endpoints
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'Not found',
        path: req.url,
        timestamp: timestamp
    }));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Custom GPT server listening on port ${PORT}`);
    console.log('Ready for Custom GPT integration!');
    console.log('Endpoints:');
    console.log('  - Health: /health');
    console.log('  - Inventory: /api/inventory/check');
    
    // Log Railway deployment info if available
    if (process.env.RAILWAY_STATIC_URL) {
        console.log(`🚂 Railway URL: ${process.env.RAILWAY_STATIC_URL}`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Keep process alive
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});