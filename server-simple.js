const express = require('express');
const app = express();

// Basic middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env_vars: Object.keys(process.env).filter(k => k.startsWith('MONGODB') || k.startsWith('GHL')).length
  });
});

// Webhook endpoint (no auth for testing)
app.post('/api/webhooks/ghl', (req, res) => {
  console.log('Webhook received:', req.body);
  res.json({ 
    success: true, 
    message: 'Webhook received',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- PORT:', process.env.PORT || 'not set');
  console.log('- MONGODB_URI:', process.env.MONGODB_URI ? 'set' : 'NOT SET');
  console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('Total env vars:', Object.keys(process.env).length);
});