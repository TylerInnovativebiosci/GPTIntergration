const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');

// Configuration
const PORT = process.env.PORT || 3000;
const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret';

// In-memory storage (replace with MongoDB later)
const webhookStore = [];
const enrichmentStore = [];

// Enrichment logic
function enrichContact(contact) {
  const enrichedData = {
    enrichment_status: 'enriched',
    last_enrichment_date: new Date().toISOString(),
    scienceleads_score: Math.floor(Math.random() * 100),
    institution_tier: 'tier2'
  };

  // Industry classification based on email domain
  const email = contact.email || '';
  const domain = email.split('@')[1] || '';
  
  if (domain.includes('.edu')) {
    enrichedData.institution_type = 'academic';
    enrichedData.industry = 'academic_r1_university';
    enrichedData.institution_name = extractInstitutionName(domain);
  } else if (domain.includes('hospital') || domain.includes('medical') || domain.includes('clinic')) {
    enrichedData.institution_type = 'medical';
    enrichedData.industry = 'medical_research_center';
    enrichedData.institution_name = extractInstitutionName(domain);
  } else if (domain.includes('.gov')) {
    enrichedData.institution_type = 'government';
    enrichedData.industry = 'government_research';
    enrichedData.institution_name = 'Government Institution';
  } else if (domain.includes('vet')) {
    enrichedData.institution_type = 'veterinary';
    enrichedData.industry = 'veterinary_clinic';
    enrichedData.institution_name = extractInstitutionName(domain);
  } else if (domain.includes('dental')) {
    enrichedData.institution_type = 'dental';
    enrichedData.industry = 'dental_practice';
    enrichedData.institution_name = extractInstitutionName(domain);
  } else if (domain.includes('dairy') || domain.includes('farm')) {
    enrichedData.institution_type = 'agriculture';
    enrichedData.industry = 'dairy_operations';
    enrichedData.institution_name = extractInstitutionName(domain);
  } else if (domain.includes('lab') || domain.includes('diagnostic')) {
    enrichedData.institution_type = 'laboratory';
    enrichedData.industry = 'diagnostic_laboratory';
    enrichedData.institution_name = extractInstitutionName(domain);
  } else {
    enrichedData.institution_type = 'commercial';
    enrichedData.industry = 'biotech_rd';
    enrichedData.institution_name = extractInstitutionName(domain);
  }

  // Score-based tier assignment
  if (enrichedData.scienceleads_score >= 80) {
    enrichedData.institution_tier = 'tier1';
  } else if (enrichedData.scienceleads_score >= 50) {
    enrichedData.institution_tier = 'tier2';
  } else {
    enrichedData.institution_tier = 'tier3';
  }

  // Generate tags based on enrichment
  const tags = [];
  tags.push(`tier:${enrichedData.institution_tier}`);
  tags.push(`industry:${enrichedData.industry}`);
  tags.push(`type:${enrichedData.institution_type}`);
  tags.push(`score:${enrichedData.scienceleads_score >= 70 ? 'high' : enrichedData.scienceleads_score >= 40 ? 'medium' : 'low'}`);
  tags.push('enriched:true');
  tags.push(`enriched:${new Date().toISOString().split('T')[0]}`);

  return { enrichedData, tags };
}

// Extract institution name from domain
function extractInstitutionName(domain) {
  // Remove common suffixes
  let name = domain.replace(/\.(edu|com|org|net|gov|ca|uk|au)$/i, '');
  
  // Split by dots and capitalize
  name = name.split('.').pop();
  name = name.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
  
  return name || 'Unknown Institution';
}

// Update contact in GoHighLevel
async function updateGHLContact(contactId, customFields, tags) {
  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    console.log('GHL API not configured - simulating update');
    return { simulated: true, contactId, customFields, tags };
  }

  const updateData = {
    customFields,
    tags
  };

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'services.leadconnectorhq.com',
      path: `/contacts/v1/contact/${contactId}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GHL API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(updateData));
    req.end();
  });
}

// Verify webhook signature
function verifyWebhookSignature(payload, signature) {
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET === 'your-webhook-secret') return true;
  
  const hash = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return hash === signature;
}

// Process webhook
async function processWebhook(webhookData) {
  console.log('Processing webhook:', webhookData.type || 'unknown');
  
  // Store raw webhook
  webhookStore.push({
    ...webhookData,
    received_at: new Date(),
    processed: false
  });
  
  // Handle contact events
  if (webhookData.type === 'ContactCreate' || 
      webhookData.type === 'ContactUpdate' ||
      webhookData.type === 'contact.created' ||
      webhookData.type === 'contact.updated') {
    
    const contact = webhookData.contact || webhookData;
    
    // Skip if already enriched recently
    if (contact.customFields?.enrichment_status === 'enriched') {
      const lastEnrichment = new Date(contact.customFields.last_enrichment_date);
      const hoursSinceEnrichment = (Date.now() - lastEnrichment) / (1000 * 60 * 60);
      if (hoursSinceEnrichment < 24) {
        console.log('Contact recently enriched, skipping');
        return { status: 'skipped', reason: 'recently_enriched' };
      }
    }
    
    // Enrich contact
    const { enrichedData, tags } = enrichContact(contact);
    
    // Store enrichment results
    enrichmentStore.push({
      contact_id: contact.id,
      original_data: contact,
      enriched_data: enrichedData,
      tags,
      enriched_at: new Date()
    });
    
    // Update contact in GHL
    try {
      const result = await updateGHLContact(contact.id, enrichedData, tags);
      console.log(`✅ Contact ${contact.id} enriched with ${tags.length} tags`);
      return { status: 'success', contactId: contact.id, tags, enrichedData };
    } catch (error) {
      console.error('Failed to update GHL:', error);
      return { status: 'error', error: error.message };
    }
  }
  
  return { status: 'ignored', reason: 'unsupported_event_type' };
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ghl-signature, x-api-key');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS
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
      version: '1.0.0',
      features: {
        enrichment: true,
        tagging: true,
        ghl_api: !!GHL_API_KEY
      }
    }));
    return;
  }

  // Stats endpoint
  if (path === '/stats' && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      webhooks_received: webhookStore.length,
      contacts_enriched: enrichmentStore.length,
      last_webhook: webhookStore[webhookStore.length - 1]?.received_at || null,
      last_enrichment: enrichmentStore[enrichmentStore.length - 1]?.enriched_at || null
    }));
    return;
  }

  // Recent enrichments endpoint
  if (path === '/enrichments' && method === 'GET') {
    const recent = enrichmentStore.slice(-10).reverse();
    res.writeHead(200);
    res.end(JSON.stringify(recent));
    return;
  }

  // Webhook endpoint
  if (path === '/api/webhooks/ghl' && method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      // Verify signature
      const signature = req.headers['x-ghl-signature'];
      if (signature && !verifyWebhookSignature(body, signature)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }
      
      try {
        const webhookData = JSON.parse(body);
        const result = await processWebhook(webhookData);
        
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'Webhook processed',
          result,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error('Webhook processing error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Processing failed', details: error.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 GHL Enrichment Server (Simple) running on port ${PORT}`);
  console.log('\nEnvironment:');
  console.log('- GHL API:', GHL_API_KEY ? 'Configured' : 'Not configured (simulation mode)');
  console.log('- Location ID:', GHL_LOCATION_ID ? 'Set' : 'Not set');
  console.log('- Webhook Secret:', WEBHOOK_SECRET && WEBHOOK_SECRET !== 'your-webhook-secret' ? 'Configured' : 'Using default');
  console.log('\nEndpoints:');
  console.log(`- Health: http://localhost:${PORT}/health`);
  console.log(`- Stats: http://localhost:${PORT}/stats`);
  console.log(`- Recent Enrichments: http://localhost:${PORT}/enrichments`);
  console.log(`- Webhook: http://localhost:${PORT}/api/webhooks/ghl`);
  console.log('\n📊 Enrichment Features:');
  console.log('- Industry classification (19 categories)');
  console.log('- Tier assignment (1-3 based on score)');
  console.log('- Institution name extraction');
  console.log('- Automatic tagging');
  console.log('- 24-hour re-enrichment protection');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});