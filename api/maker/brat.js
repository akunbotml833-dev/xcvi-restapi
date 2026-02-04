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
      await security.sendTelegramReport(
        '/api/maker/brat',
        req,
        { text },
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
    
    const cleanText = String(text).trim();
    
    if (cleanText.length > 80) {
      await security.sendTelegramReport(
        '/api/maker/brat',
        req,
        { text: cleanText.substring(0, 20) },
        'error',
        'Text too long (max 80 chars)'
      );
      
      return res.status(400).json({
        success: false,
        error: 'Text too long',
        message: 'Maximum 80 characters allowed',
        length: cleanText.length,
        max_length: 80,
        timestamp: new Date().toISOString()
      });
    }
    
    // GENERATE SVG - 100% WORK DI MANA SAJA
    const width = 800;
    const height = 800;
    
    // Calculate font size based on text length
    let fontSize = 60;
    if (cleanText.length > 40) fontSize = 45;
    if (cleanText.length > 60) fontSize = 35;
    
    // Simple word wrapping for SVG
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = words[0];
    const maxCharsPerLine = Math.max(15, Math.floor(80 / (cleanText.length > 40 ? 2 : 1)));
    
    for (let i = 1; i < words.length; i++) {
      if ((currentLine + ' ' + words[i]).length > maxCharsPerLine) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine += ' ' + words[i];
      }
    }
    lines.push(currentLine);
    
    // Create SVG
    const lineHeight = fontSize * 1.3;
    const startY = (height - (lines.length * lineHeight)) / 2 + fontSize;
    
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  
  <text font-family="Arial, Helvetica, sans-serif" 
        font-size="${fontSize}" 
        font-weight="bold" 
        fill="#000000" 
        text-anchor="middle">`;
    
    // Add each line
    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      svg += `<tspan x="${width/2}" y="${y}">${line}</tspan>`;
    });
    
    svg += `</text></svg>`;
    
    // Send report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { 
        text: cleanText.substring(0, 30),
        length: cleanText.length,
        lines: lines.length,
        fontSize: fontSize,
        method: 'SVG'
      },
      'success'
    );
    
    // Return SVG image
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Text', cleanText.substring(0, 50));
    
    return res.status(200).send(svg);
    
  } catch (error) {
    console.error('Brat API error:', error);
    
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      req.query,
      'error',
      error
    );
    
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      success: false,
      error: 'Failed to generate image',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
