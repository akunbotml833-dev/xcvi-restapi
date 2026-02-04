const security = require('../security');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Check rate limit
  if (!security.securityMiddleware(req, res)) {
    return; // Response sudah dikirim
  }
  
  // Only allow GET
  if (req.method !== 'GET') {
    // Send error report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      null,
      'error',
      'Method not allowed'
    );
    
    return res.status(405).json({
      error: 'Method not allowed. Use GET.',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    const { text, model } = req.query;
    
    // Validation
    if (!text) {
      await security.sendTelegramReport(
        '/api/maker/brat',
        req,
        { text, model },
        'error',
        'Text parameter required'
      );
      
      return res.status(400).json({
        success: false,
        error: 'Text parameter is required',
        example: '/api/maker/brat?text=Hello+World',
        timestamp: new Date().toISOString()
      });
    }
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Build response
    const response = {
      success: true,
      endpoint: '/api/maker/brat',
      parameters: {
        text: text.substring(0, 500), // Limit text length
        model: model || 'default',
        length: text.length
      },
      result: {
        sticker: `Sticker created: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
        url: `https://xcvi-restapi.vercel.app/stickers/${Date.now()}.png`,
        size: '512x512',
        format: 'PNG'
      },
      metadata: {
        status: 'success',
        timestamp: new Date().toISOString(),
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        client_ip: security.getClientIP(req),
        rate_limit: '3s per request'
      }
    };
    
    // Send success report (async, don't wait)
    security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { text: text.substring(0, 100), model },
      'success'
    ).catch(err => console.log('Telegram report failed:', err.message));
    
    // Return response
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Brat API error:', error);
    
    // Send error report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      req.query,
      'error',
      error
    );
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
