
const security = require('../security');
const sharp = require('sharp');

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
    
    // CREATE SVG WITH TEXT
    const width = 800;
    const height = 800;
    
    // Word wrapping untuk SVG
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = '';
    const maxCharsPerLine = 20; // Approx untuk font size 50
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (testLine.length > maxCharsPerLine && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    // Calculate font size
    let fontSize = 55;
    if (lines.length > 3) fontSize = 45;
    if (lines.length > 5) fontSize = 38;
    
    // Build SVG dengan text
    const lineHeight = fontSize * 1.3;
    const startX = 60;
    const totalHeight = lines.length * lineHeight;
    const startY = (height - totalHeight) / 2 + fontSize;
    
    // Escape XML special characters
    function escapeXml(unsafe) {
      return unsafe.replace(/[<>&'"]/g, function(c) {
        switch(c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
        }
      });
    }
    
    // Create SVG string
    const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  
  <g font-family="Arial, Helvetica, sans-serif" 
     font-size="${fontSize}" 
     font-weight="bold" 
     fill="black"
     text-anchor="start">
    ${lines.map((line, index) => {
      const y = startY + (index * lineHeight);
      return `<text x="${startX}" y="${y}">${escapeXml(line)}</text>`;
    }).join('\n    ')}
  </g>
  
  <!-- Debug border -->
  <rect x="10" y="10" width="${width-20}" height="${height-20}" 
        stroke="red" stroke-width="2" fill="none"/>
</svg>`;
    
    // Convert SVG to PNG menggunakan sharp
    const pngBuffer = await sharp(Buffer.from(svgString))
      .png()
      .toBuffer();
    
    // Send report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { 
        text: cleanText.substring(0, 30),
        length: cleanText.length,
        lines: lines.length,
        fontSize: fontSize,
        dimensions: `${width}x${height}`,
        method: 'sharp+svg'
      },
      'success'
    );
    
    // Set response headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pngBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Dimensions', `${width}x${height}`);
    res.setHeader('X-Format', 'PNG');
    res.setHeader('X-Text-Length', cleanText.length);
    
    // Return PNG
    return res.status(200).send(pngBuffer);
    
  } catch (error) {
    console.error('Brat API error (sharp):', error);
    
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      req.query,
      'error',
      error
    );
    
    // Fallback: Return simple SVG
    try {
      const fallbackSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  <text x="50" y="100" font-family="Arial" font-size="40" fill="red">ERROR</text>
  <text x="50" y="150" font-family="Arial" font-size="20" fill="black">${error.message.substring(0, 50)}</text>
  <text x="50" y="180" font-family="Arial" font-size="16" fill="gray">Text: ${(cleanText || 'none').substring(0, 30)}</text>
</svg>`;
      
      const fallbackPng = await sharp(Buffer.from(fallbackSvg))
        .png()
        .toBuffer();
      
      res.setHeader('Content-Type', 'image/png');
      return res.status(500).send(fallbackPng);
      
    } catch (fallbackError) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        success: false,
        error: 'Failed to generate image',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
};
