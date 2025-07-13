// server-native-enhanced.js
// Production server with integration test endpoints - no external dependencies required
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

console.log('======== InnovativeBioScience Custom GPT API ========');
console.log(`» NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`» PORT: ${PORT}`);
console.log('» Integration tests: ENABLED');
console.log('----------------------------------------');

// Helper function for HTTPS requests
function makeHttpsRequest(options) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 10000;
    let data = '';
    
    const req = https.request(options, (res) => {
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// MongoDB test function (using HTTP API if available, otherwise connection check)
async function testMongoDB() {
  if (!process.env.MONGODB_URI) {
    return { success: false, error: 'MONGODB_URI not configured' };
  }
  
  try {
    // Parse MongoDB URI to extract connection info
    const uri = process.env.MONGODB_URI;
    const isAtlas = uri.includes('mongodb.net') || uri.includes('mongodb+srv');
    
    return {
      success: true,
      data: {
        configured: true,
        uri_pattern: uri.replace(/:[^:@]+@/, ':****@'),
        is_atlas: isAtlas,
        database: process.env.MONGODB_DATABASE || 'innovativebiosci',
        note: 'Full connection test requires mongodb driver'
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// GoHighLevel test function
async function testGoHighLevel() {
  if (!process.env.GHL_API_KEY) {
    return { success: false, error: 'GHL_API_KEY not configured' };
  }
  
  if (!process.env.GHL_LOCATION_ID) {
    return { success: false, error: 'GHL_LOCATION_ID not configured' };
  }
  
  try {
    const baseUrl = process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com';
    const url = new URL(`${baseUrl}/locations/${process.env.GHL_LOCATION_ID}`);
    
    const response = await makeHttpsRequest({
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
        'Accept': 'application/json',
        'Version': '2021-07-28'
      },
      timeout: 10000
    });
    
    if (response.status === 200) {
      return {
        success: true,
        data: {
          location_id: process.env.GHL_LOCATION_ID,
          name: response.data.name || 'Location found',
          email: response.data.email,
          phone: response.data.phone,
          api_version: '2021-07-28'
        }
      };
    } else {
      return {
        success: false,
        error: `GHL API error: ${response.status} - ${JSON.stringify(response.data)}`
      };
    }
  } catch (error) {
    return { success: false, error: `GHL connection error: ${error.message}` };
  }
}

// OpenAI test function
async function testOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    return { success: false, error: 'OPENAI_API_KEY not configured' };
  }
  
  try {
    const response = await makeHttpsRequest({
      hostname: 'api.openai.com',
      path: '/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.status === 200) {
      const models = response.data.data || [];
      const gptModels = models.filter(m => m.id.includes('gpt')).map(m => m.id);
      
      return {
        success: true,
        data: {
          connected: true,
          total_models: models.length,
          gpt_models: gptModels.slice(0, 5),
          embedding_models: models.filter(m => m.id.includes('embedding')).length,
          api_version: 'v1'
        }
      };
    } else {
      return {
        success: false,
        error: `OpenAI API error: ${response.status} - ${JSON.stringify(response.data)}`
      };
    }
  } catch (error) {
    return { success: false, error: `OpenAI connection error: ${error.message}` };
  }
}

// Anthropic/Claude test function
async function testAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  
  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY not configured' };
  }
  
  try {
    const requestBody = JSON.stringify({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Say "API test successful" in 5 words or less.' }],
      max_tokens: 20
    });
    
    const response = await makeHttpsRequest({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      },
      body: requestBody,
      timeout: 15000
    });
    
    if (response.status === 200) {
      return {
        success: true,
        data: {
          connected: true,
          model: 'claude-3-haiku-20240307',
          response: response.data.content?.[0]?.text || 'Connected',
          usage: response.data.usage,
          api_version: '2023-06-01'
        }
      };
    } else {
      return {
        success: false,
        error: `Anthropic API error: ${response.status} - ${JSON.stringify(response.data)}`
      };
    }
  } catch (error) {
    return { success: false, error: `Anthropic connection error: ${error.message}` };
  }
}

// Pinecone test function
async function testPinecone() {
  if (!process.env.PINECONE_API_KEY) {
    return { success: false, error: 'PINECONE_API_KEY not configured' };
  }
  
  const indexName = process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX || 'innovativebiosci-rag';
  const environment = process.env.PINECONE_ENVIRONMENT || 'us-east-1-aws';
  
  try {
    // First, get the index host
    const listResponse = await makeHttpsRequest({
      hostname: 'api.pinecone.io',
      path: '/indexes',
      method: 'GET',
      headers: {
        'Api-Key': process.env.PINECONE_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (listResponse.status === 200) {
      const indexes = listResponse.data.indexes || [];
      const targetIndex = indexes.find(idx => idx.name === indexName);
      
      if (targetIndex) {
        // Get index stats
        const statsUrl = new URL(`https://${targetIndex.host}/describe_index_stats`);
        const statsResponse = await makeHttpsRequest({
          hostname: statsUrl.hostname,
          path: statsUrl.pathname,
          method: 'GET',
          headers: {
            'Api-Key': process.env.PINECONE_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        return {
          success: true,
          data: {
            connected: true,
            index_name: indexName,
            environment: targetIndex.environment || environment,
            dimension: targetIndex.dimension,
            host: targetIndex.host,
            ready: targetIndex.ready,
            vector_count: statsResponse.data?.totalVectorCount || 0,
            namespaces: Object.keys(statsResponse.data?.namespaces || {})
          }
        };
      } else {
        return {
          success: false,
          error: `Index '${indexName}' not found. Available indexes: ${indexes.map(i => i.name).join(', ')}`
        };
      }
    } else {
      return {
        success: false,
        error: `Pinecone API error: ${listResponse.status} - ${JSON.stringify(listResponse.data)}`
      };
    }
  } catch (error) {
    return { success: false, error: `Pinecone connection error: ${error.message}` };
  }
}

// GoHighLevel API request helper
async function makeGHLRequest(path, options = {}) {
  if (!process.env.GHL_API_KEY) {
    throw new Error('GHL_API_KEY not configured');
  }
  
  if (!process.env.GHL_LOCATION_ID) {
    throw new Error('GHL_LOCATION_ID not configured');
  }
  
  const baseUrl = process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com';
  const url = new URL(`${baseUrl}${path}`);
  
  // Add query params if provided
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });
  }
  
  const requestOptions = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
      'Version': '2021-07-28',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers
    },
    timeout: 15000
  };
  
  if (options.body) {
    requestOptions.body = JSON.stringify(options.body);
  }
  
  try {
    const response = await makeHttpsRequest(requestOptions);
    
    if (response.status >= 200 && response.status < 300) {
      return { success: true, data: response.data };
    } else {
      return {
        success: false,
        error: `GHL API error: ${response.status}`,
        details: response.data
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `GHL request failed: ${error.message}`
    };
  }
}

// WooCommerce test function
async function testWooCommerce() {
  if (!process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
    return { success: false, error: 'WooCommerce credentials not configured' };
  }
  
  const apiUrl = process.env.WC_API_URL || 'https://innovativebiosci.com/wp-json/wc/v3';
  
  try {
    const url = new URL(`${apiUrl}/system_status`);
    const auth = Buffer.from(`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`).toString('base64');
    
    const response = await makeHttpsRequest({
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'User-Agent': 'InnovativeBioSci-API/1.0'
      },
      timeout: 15000
    });
    
    if (response.status === 200) {
      const data = response.data;
      return {
        success: true,
        data: {
          connected: true,
          store_name: data.environment?.site_name || 'Connected',
          wc_version: data.environment?.version,
          currency: data.settings?.currency,
          api_url: apiUrl,
          active_plugins: data.active_plugins?.length || 0
        }
      };
    } else if (response.status === 401) {
      return {
        success: false,
        error: 'WooCommerce authentication failed. Check consumer key and secret.'
      };
    } else {
      // Try alternate endpoint if system_status fails
      const productsUrl = new URL(`${apiUrl}/products`);
      productsUrl.searchParams.set('per_page', '1');
      
      const altResponse = await makeHttpsRequest({
        hostname: productsUrl.hostname,
        path: productsUrl.pathname + productsUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'User-Agent': 'InnovativeBioSci-API/1.0'
        },
        timeout: 10000
      });
      
      if (altResponse.status === 200) {
        const totalProducts = altResponse.headers['x-wp-total'] || '0';
        return {
          success: true,
          data: {
            connected: true,
            api_url: apiUrl,
            total_products: parseInt(totalProducts),
            note: 'Connected via products endpoint'
          }
        };
      } else {
        return {
          success: false,
          error: `WooCommerce API error: ${altResponse.status}`
        };
      }
    }
  } catch (error) {
    return { success: false, error: `WooCommerce connection error: ${error.message}` };
  }
}

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
    quantity: 25,
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
    reorder_point: 50,
    location: 'Media Storage B1',
    stock_status: 'NORMAL',
    needs_reorder: false
  },
  'PLS-001': {
    sku: 'PLS-001',
    name: 'Plastic Pipette Tips',
    category: 'PLASTICS',
    quantity: 45,
    unit: 'boxes',
    reorder_point: 100,
    location: 'Supply Cabinet C1',
    stock_status: 'LOW',
    needs_reorder: true
  }
};

// Main server
const server = http.createServer(async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // Set JSON content type for all responses
  res.setHeader('Content-Type', 'application/json');

  // Health check
  if (req.url === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: 'healthy',
      timestamp,
      uptime_s: Math.round(process.uptime()),
      endpoints: [
        '/health',
        '/api/inventory/check',
        '/api/inventory/low-stock',
        '/api/ghl/contacts',
        '/api/ghl/opportunities',
        '/api/ghl/tasks',
        '/api/ghl/stats',
        '/api/test/mongodb',
        '/api/test/ghl',
        '/api/test/openai',
        '/api/test/anthropic',
        '/api/test/pinecone',
        '/api/test/woocommerce'
      ]
    }));
  }

  // Test endpoints
  if (req.url.startsWith('/api/test/') && req.method === 'GET') {
    const service = req.url.split('/').pop();
    let result;
    
    try {
      switch (service) {
        case 'mongodb':
          result = await testMongoDB();
          break;
        case 'ghl':
          result = await testGoHighLevel();
          break;
        case 'openai':
          result = await testOpenAI();
          break;
        case 'anthropic':
          result = await testAnthropic();
          break;
        case 'pinecone':
          result = await testPinecone();
          break;
        case 'woocommerce':
          result = await testWooCommerce();
          break;
        default:
          result = { success: false, error: `Unknown service: ${service}` };
      }
      
      const statusCode = result.success ? 200 : 500;
      res.writeHead(statusCode);
      return res.end(JSON.stringify({
        service,
        timestamp,
        ...result
      }));
    } catch (error) {
      console.error(`Error testing ${service}:`, error);
      res.writeHead(500);
      return res.end(JSON.stringify({
        service,
        success: false,
        error: error.message,
        timestamp
      }));
    }
  }

  // GoHighLevel Operational Endpoints
  
  // GET /api/ghl/contacts - Fetch contacts with search
  if (req.url.startsWith('/api/ghl/contacts') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const search = url.searchParams.get('search');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      
      const query = {
        locationId: process.env.GHL_LOCATION_ID,
        limit: Math.min(limit, 100), // Cap at 100
        skip: offset
      };
      
      if (search) {
        query.query = search;
      }
      
      const result = await makeGHLRequest('/contacts/', { query });
      
      if (result.success) {
        res.writeHead(200);
        return res.end(JSON.stringify({
          success: true,
          data: result.data.contacts || [],
          total: result.data.total || 0,
          limit,
          offset
        }));
      } else {
        res.writeHead(500);
        return res.end(JSON.stringify(result));
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
  }
  
  // POST /api/ghl/contacts - Create new contact
  if (req.url === '/api/ghl/contacts' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const contactData = JSON.parse(body);
        
        // Validate required fields
        if (!contactData.email && !contactData.phone) {
          res.writeHead(400);
          return res.end(JSON.stringify({
            success: false,
            error: 'Either email or phone is required'
          }));
        }
        
        const ghlContact = {
          locationId: process.env.GHL_LOCATION_ID,
          firstName: contactData.firstName || '',
          lastName: contactData.lastName || '',
          email: contactData.email,
          phone: contactData.phone,
          tags: contactData.tags || []
        };
        
        const result = await makeGHLRequest('/contacts/', {
          method: 'POST',
          body: ghlContact
        });
        
        if (result.success) {
          res.writeHead(200);
          return res.end(JSON.stringify({
            success: true,
            data: result.data.contact || result.data
          }));
        } else {
          res.writeHead(500);
          return res.end(JSON.stringify(result));
        }
      } catch (error) {
        console.error('Error creating contact:', error);
        res.writeHead(400);
        return res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    return;
  }
  
  // GET /api/ghl/opportunities - Fetch open opportunities
  if (req.url.startsWith('/api/ghl/opportunities') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const status = url.searchParams.get('status') || 'open';
      
      const query = {
        locationId: process.env.GHL_LOCATION_ID,
        limit: Math.min(limit, 100),
        status: status
      };
      
      const result = await makeGHLRequest('/opportunities/', { query });
      
      if (result.success) {
        const opportunities = result.data.opportunities || [];
        res.writeHead(200);
        return res.end(JSON.stringify({
          success: true,
          data: opportunities,
          total: result.data.total || opportunities.length,
          limit
        }));
      } else {
        res.writeHead(500);
        return res.end(JSON.stringify(result));
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
  }
  
  // GET /api/ghl/tasks - Fetch tasks
  if (req.url.startsWith('/api/ghl/tasks') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const contactId = url.searchParams.get('contactId');
      const status = url.searchParams.get('status') || 'open';
      
      let path = '/contacts/';
      const query = {};
      
      if (contactId) {
        // Get tasks for specific contact
        path = `/contacts/${contactId}/tasks`;
      } else {
        // Get all tasks for location - using contacts endpoint with tasks expanded
        query.locationId = process.env.GHL_LOCATION_ID;
        query.limit = 100;
      }
      
      const result = await makeGHLRequest(path, { query });
      
      if (result.success) {
        let tasks = [];
        
        if (contactId) {
          tasks = result.data.tasks || [];
        } else {
          // Extract tasks from contacts if fetching location-wide
          const contacts = result.data.contacts || [];
          contacts.forEach(contact => {
            if (contact.tasks && contact.tasks.length > 0) {
              tasks = tasks.concat(contact.tasks.map(task => ({
                ...task,
                contactId: contact.id,
                contactName: `${contact.firstName} ${contact.lastName}`.trim()
              })));
            }
          });
        }
        
        // Filter by status if specified
        if (status !== 'all') {
          tasks = tasks.filter(task => 
            status === 'open' ? !task.completed : task.completed
          );
        }
        
        res.writeHead(200);
        return res.end(JSON.stringify({
          success: true,
          data: tasks,
          total: tasks.length
        }));
      } else {
        res.writeHead(500);
        return res.end(JSON.stringify(result));
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
  }
  
  // GET /api/ghl/stats - Location statistics
  if (req.url === '/api/ghl/stats' && req.method === 'GET') {
    try {
      // Fetch multiple data points in parallel
      const [contactsResult, opportunitiesResult] = await Promise.all([
        makeGHLRequest('/contacts/', {
          query: {
            locationId: process.env.GHL_LOCATION_ID,
            limit: 1
          }
        }),
        makeGHLRequest('/opportunities/', {
          query: {
            locationId: process.env.GHL_LOCATION_ID,
            status: 'open',
            limit: 1
          }
        })
      ]);
      
      const stats = {
        locationId: process.env.GHL_LOCATION_ID,
        totalContacts: 0,
        openOpportunities: 0,
        timestamp: new Date().toISOString()
      };
      
      if (contactsResult.success) {
        stats.totalContacts = contactsResult.data.total || 0;
      }
      
      if (opportunitiesResult.success) {
        stats.openOpportunities = opportunitiesResult.data.total || 0;
      }
      
      res.writeHead(200);
      return res.end(JSON.stringify({
        success: true,
        data: stats
      }));
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
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

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, count: results.length, data: results }));
      } catch (err) {
        console.error('Error parsing /api/inventory/check body:', err);
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Low stock
  if (req.url === '/api/inventory/low-stock' && req.method === 'GET') {
    const low = Object.values(inventory).filter(i => i.needs_reorder || i.stock_status === 'LOW');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true, count: low.length, data: low }));
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found', path: req.url }));
});

// Log just before binding
console.log('>> about to call server.listen()');
server.listen(PORT, () => {
  console.log('>> server.listen() callback fired');
  console.log(`
🚀 Custom GPT Inventory API is LIVE with Integration Tests!
   
   Core Endpoints:
   • Health: http://localhost:${PORT}/health
   • Check:  http://localhost:${PORT}/api/inventory/check
   • Low:    http://localhost:${PORT}/api/inventory/low-stock
   
   GoHighLevel Endpoints:
   • Contacts:      http://localhost:${PORT}/api/ghl/contacts
   • Opportunities: http://localhost:${PORT}/api/ghl/opportunities
   • Tasks:         http://localhost:${PORT}/api/ghl/tasks
   • Stats:         http://localhost:${PORT}/api/ghl/stats
   
   Integration Test Endpoints:
   • MongoDB:     http://localhost:${PORT}/api/test/mongodb
   • GoHighLevel: http://localhost:${PORT}/api/test/ghl
   • OpenAI:      http://localhost:${PORT}/api/test/openai
   • Anthropic:   http://localhost:${PORT}/api/test/anthropic
   • Pinecone:    http://localhost:${PORT}/api/test/pinecone
   • WooCommerce: http://localhost:${PORT}/api/test/woocommerce
   
   Environment Variables Status:
   • MongoDB:     ${process.env.MONGODB_URI ? '✓' : '✗'} MONGODB_URI
   • GoHighLevel: ${process.env.GHL_API_KEY ? '✓' : '✗'} GHL_API_KEY
   • OpenAI:      ${process.env.OPENAI_API_KEY ? '✓' : '✗'} OPENAI_API_KEY
   • Anthropic:   ${(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) ? '✓' : '✗'} ANTHROPIC_API_KEY
   • Pinecone:    ${process.env.PINECONE_API_KEY ? '✓' : '✗'} PINECONE_API_KEY
   • WooCommerce: ${process.env.WC_CONSUMER_KEY ? '✓' : '✗'} WC_CONSUMER_KEY
`);
});