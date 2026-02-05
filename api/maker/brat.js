const security = require('../security');
const { createCanvas } = require('@napi-rs/canvas');

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
    return;
  }
  
  // Only allow GET
  if (req.method !== 'GET') {
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
    const { text } = req.query;
    
    // Validation
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text parameter is required',
        example: '/api/maker/brat?text=Hello+World',
        timestamp: new Date().toISOString()
      });
    }
    
    const cleanText = String(text).trim();
    
    if (cleanText.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Text too long',
        message: 'Maximum 200 characters allowed',
        length: cleanText.length,
        max_length: 200,
        timestamp: new Date().toISOString()
      });
    }
    
    // Generate image
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // Black text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Simple word wrapping
    const maxWidth = width - 100; // 50px margin on each side
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    // Draw text
    const lineHeight = 60;
    const totalHeight = lines.length * lineHeight;
    const startY = (height - totalHeight) / 2 + 30;
    
    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      ctx.fillText(line, width / 2, y);
    });
    
    // Convert to PNG
    const buffer = canvas.toBuffer('image/png');
    
    // Return image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    return res.status(200).send(buffer);
    
  } catch (error) {
    console.error('Brat API error:', error);
    
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      req.query,
      'error',
      error.message
    );
    
    return res.status(500).json({
      success: false,
      error: 'Failed to generate image',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};