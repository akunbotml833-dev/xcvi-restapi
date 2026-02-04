// CommonJS format untuk Vercel Functions
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Hanya terima GET request
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed. Use GET.',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    // Ambil query parameters
    const { text, model } = req.query;
    
    console.log('API Request:', { text, model, url: req.url });
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text parameter is required',
        example: '/api/maker/brat?text=Hello+World',
        timestamp: new Date().toISOString()
      });
    }
    
    // Simulasi response
    const response = {
      success: true,
      endpoint: '/api/maker/brat',
      parameters: {
        text: text,
        model: model || 'default'
      },
      result: {
        sticker: `Sticker created: "${text}"`,
        url: `https://xcvi-restapi/stickers/${encodeURIComponent(text)}.png`,
        size: `${Math.floor(Math.random() * 1000) + 500}KB`,
        format: 'PNG'
      },
      metadata: {
        status: 'success',
        processed: true,
        timestamp: new Date().toISOString(),
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };
    
    // Set response header
    res.setHeader('Content-Type', 'application/json');
    
    // Kirim response
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};