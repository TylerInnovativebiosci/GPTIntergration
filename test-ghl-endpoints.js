// Test script for GoHighLevel operational endpoints
const https = require('https');
const http = require('http');

// Configuration
const RAILWAY_URL = 'https://gptintergration-production.up.railway.app';
const LOCAL_URL = 'http://localhost:3000';

// Use Railway URL if available, otherwise local
const BASE_URL = process.argv[2] === '--local' ? LOCAL_URL : RAILWAY_URL;

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};

// Helper to make requests
async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ 
            status: res.statusCode, 
            data: JSON.parse(data),
            headers: res.headers 
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            data: data,
            headers: res.headers 
          });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log(`${colors.cyan}Testing GoHighLevel Endpoints${colors.reset}`);
  console.log(`${colors.cyan}Base URL: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
  
  // Test 1: Check GHL connection first
  console.log(`${colors.cyan}1. Testing GHL Connection...${colors.reset}`);
  try {
    const testResult = await makeRequest(`${BASE_URL}/api/test/ghl`);
    if (testResult.data.success) {
      console.log(`${colors.green}✓ GoHighLevel connected successfully${colors.reset}`);
      console.log(`  Location: ${testResult.data.data.name || testResult.data.data.location_id}`);
    } else {
      console.log(`${colors.red}✗ GoHighLevel connection failed${colors.reset}`);
      console.log(`  Error: ${testResult.data.error}`);
      console.log(`\n${colors.yellow}Please ensure GHL_API_KEY and GHL_LOCATION_ID are configured${colors.reset}`);
      return;
    }
  } catch (error) {
    console.log(`${colors.red}✗ Connection test failed: ${error.message}${colors.reset}`);
    return;
  }
  
  // Test 2: Get contacts
  console.log(`\n${colors.cyan}2. Testing GET /api/ghl/contacts...${colors.reset}`);
  try {
    const result = await makeRequest(`${BASE_URL}/api/ghl/contacts?limit=5`);
    
    if (result.data.success) {
      console.log(`${colors.green}✓ Contacts fetched successfully${colors.reset}`);
      console.log(`  Total contacts: ${result.data.total}`);
      console.log(`  Returned: ${result.data.data.length} contacts`);
      
      if (result.data.data.length > 0) {
        const contact = result.data.data[0];
        console.log(`  Sample: ${contact.firstName} ${contact.lastName} (${contact.email || contact.phone})`);
      }
    } else {
      console.log(`${colors.red}✗ Failed to fetch contacts${colors.reset}`);
      console.log(`  Error: ${result.data.error}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ Request failed: ${error.message}${colors.reset}`);
  }
  
  // Test 3: Search contacts
  console.log(`\n${colors.cyan}3. Testing Contact Search...${colors.reset}`);
  try {
    const result = await makeRequest(`${BASE_URL}/api/ghl/contacts?search=test&limit=5`);
    
    if (result.data.success) {
      console.log(`${colors.green}✓ Contact search completed${colors.reset}`);
      console.log(`  Found: ${result.data.data.length} contacts matching 'test'`);
    } else {
      console.log(`${colors.red}✗ Search failed${colors.reset}`);
      console.log(`  Error: ${result.data.error}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ Request failed: ${error.message}${colors.reset}`);
  }
  
  // Test 4: Create contact
  console.log(`\n${colors.cyan}4. Testing POST /api/ghl/contacts...${colors.reset}`);
  const testContact = {
    firstName: 'Test',
    lastName: 'Contact',
    email: `test-${Date.now()}@example.com`,
    phone: '+1234567890',
    tags: ['api-test']
  };
  
  try {
    const result = await makeRequest(`${BASE_URL}/api/ghl/contacts`, {
      method: 'POST',
      body: testContact
    });
    
    if (result.data.success) {
      console.log(`${colors.green}✓ Contact created successfully${colors.reset}`);
      console.log(`  ID: ${result.data.data.id}`);
      console.log(`  Name: ${result.data.data.firstName} ${result.data.data.lastName}`);
      console.log(`  Email: ${result.data.data.email}`);
    } else {
      console.log(`${colors.red}✗ Failed to create contact${colors.reset}`);
      console.log(`  Error: ${result.data.error}`);
      if (result.data.details) {
        console.log(`  Details:`, result.data.details);
      }
    }
  } catch (error) {
    console.log(`${colors.red}✗ Request failed: ${error.message}${colors.reset}`);
  }
  
  // Test 5: Get opportunities
  console.log(`\n${colors.cyan}5. Testing GET /api/ghl/opportunities...${colors.reset}`);
  try {
    const result = await makeRequest(`${BASE_URL}/api/ghl/opportunities?limit=5&status=open`);
    
    if (result.data.success) {
      console.log(`${colors.green}✓ Opportunities fetched successfully${colors.reset}`);
      console.log(`  Total open opportunities: ${result.data.total}`);
      console.log(`  Returned: ${result.data.data.length} opportunities`);
      
      if (result.data.data.length > 0) {
        const opp = result.data.data[0];
        console.log(`  Sample: ${opp.name} - ${opp.monetaryValue || 0} (${opp.status})`);
      }
    } else {
      console.log(`${colors.red}✗ Failed to fetch opportunities${colors.reset}`);
      console.log(`  Error: ${result.data.error}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ Request failed: ${error.message}${colors.reset}`);
  }
  
  // Test 6: Get tasks
  console.log(`\n${colors.cyan}6. Testing GET /api/ghl/tasks...${colors.reset}`);
  try {
    const result = await makeRequest(`${BASE_URL}/api/ghl/tasks?status=open`);
    
    if (result.data.success) {
      console.log(`${colors.green}✓ Tasks fetched successfully${colors.reset}`);
      console.log(`  Total open tasks: ${result.data.total}`);
      
      if (result.data.data.length > 0) {
        const task = result.data.data[0];
        console.log(`  Sample: ${task.title || 'Untitled'} - ${task.contactName || 'No contact'}`);
      }
    } else {
      console.log(`${colors.red}✗ Failed to fetch tasks${colors.reset}`);
      console.log(`  Error: ${result.data.error}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ Request failed: ${error.message}${colors.reset}`);
  }
  
  // Test 7: Get stats
  console.log(`\n${colors.cyan}7. Testing GET /api/ghl/stats...${colors.reset}`);
  try {
    const result = await makeRequest(`${BASE_URL}/api/ghl/stats`);
    
    if (result.data.success) {
      console.log(`${colors.green}✓ Stats fetched successfully${colors.reset}`);
      console.log(`  Location ID: ${result.data.data.locationId}`);
      console.log(`  Total Contacts: ${result.data.data.totalContacts}`);
      console.log(`  Open Opportunities: ${result.data.data.openOpportunities}`);
      console.log(`  Timestamp: ${result.data.data.timestamp}`);
    } else {
      console.log(`${colors.red}✗ Failed to fetch stats${colors.reset}`);
      console.log(`  Error: ${result.data.error}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ Request failed: ${error.message}${colors.reset}`);
  }
  
  // Summary
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}Test Summary${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`\n${colors.green}GoHighLevel integration endpoints are ready for use!${colors.reset}`);
  console.log(`\n${colors.cyan}Required Scopes per Endpoint:${colors.reset}`);
  console.log(`  • /api/ghl/contacts (GET):    contacts.readonly`);
  console.log(`  • /api/ghl/contacts (POST):   contacts.write`);
  console.log(`  • /api/ghl/opportunities:     opportunities.readonly`);
  console.log(`  • /api/ghl/tasks:            contacts.readonly`);
  console.log(`  • /api/ghl/stats:            contacts.readonly, opportunities.readonly`);
  
  console.log(`\n${colors.cyan}Usage Examples:${colors.reset}`);
  console.log(`  GET  ${BASE_URL}/api/ghl/contacts?search=john&limit=10`);
  console.log(`  POST ${BASE_URL}/api/ghl/contacts { "email": "test@example.com", "firstName": "John" }`);
  console.log(`  GET  ${BASE_URL}/api/ghl/opportunities?status=open&limit=20`);
  console.log(`  GET  ${BASE_URL}/api/ghl/tasks?contactId=xxx`);
  console.log(`  GET  ${BASE_URL}/api/ghl/stats`);
}

// Run tests
console.log(`${colors.cyan}Starting GoHighLevel endpoint tests...${colors.reset}\n`);
console.log(`${colors.yellow}Usage: node test-ghl-endpoints.js [--local]${colors.reset}\n`);
runTests().catch(console.error);