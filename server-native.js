// Production server - no external dependencies required
const http = require('http');
const PORT = process.env.PORT || 3000;

console.log('Starting InnovativeBioScience Custom GPT server...');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', PORT);

// Simple in-memory inventory data
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
        needs_reorder: true
    },
    'MED-001': {
        sku: 'MED-001',
        name: 'DMEM Media',
        category: 'MEDIA',
        quantity: 200,
        unit: 'bottles (1L)',
        reorder_point: 100,
        location: 'Shelf B3',
        stock_status: 'NORMAL',
        needs_reorder: false
    },
    'PLS-001': {
        sku: 'PLS-001',
        name: 'T75 Flask',
        category: 'PLASTICWARE',
        quantity: 500,
        unit: 'cases (5x100)',
        reorder_point: 200,
        location: 'Warehouse C1',
        stock_status: 'NORMAL',
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
            uptime: process.uptime(),
            endpoints: [
                '/health',
                '/api/inventory/check',
                '/api/inventory/low-stock'
            ]
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
                    count: results.length,
                    request_id: `req_${Date.now()}`
                }));
                
            } catch (error) {
                console.error(`${logPrefix} Error:`, error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: error.message
                }));
            }
        });
        return;
    }
    
    // Low stock endpoint
    if (req.url === '/api/inventory/low-stock' && req.method === 'GET') {
        const lowStock = Object.values(inventory)
            .filter(item => item.needs_reorder || item.stock_status === 'LOW');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: lowStock,
            count: lowStock.length
        }));
        return;
    }
    
    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'Not found',
        path: req.url
    }));
});

server.listen(PORT, () => {
    console.log(`
🚀 InnovativeBioScience Custom GPT API is running!
   Port: ${PORT}
   Health: http://localhost:${PORT}/health
   Inventory: http://localhost:${PORT}/api/inventory/check
   Low Stock: http://localhost:${PORT}/api/inventory/low-stock
    `);
});
