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
    
    // Create canvas
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // White background - POLOS
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // Text properties
    const maxWidth = width - 100;
    let fontSize = 60;
    
    // Simple text drawing - coba beberapa font
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000'; // Black text
    
    // Coba font yang berbeda
    const fonts = [
      '60px Arial',
      '60px Helvetica',
      '60px sans-serif',
      '55px Arial',
      '50px Arial',
      '45px Arial'
    ];
    
    let textFits = false;
    let finalFont = '';
    let lines = [];
    
    for (const font of fonts) {
      ctx.font = `bold ${font}`;
      
      // Simple line breaking
      const words = cleanText.split(' ');
      lines = [];
      let currentLine = words[0];
      
      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + ' ' + word).width;
        if (width < maxWidth) {
          currentLine += ' ' + word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);
      
      // Check if fits
      const lineHeight = parseInt(font) * 1.3;
      const totalHeight = lines.length * lineHeight;
      
      if (totalHeight < height - 100 && lines.length <= 5) {
        finalFont = font;
        textFits = true;
        break;
      }
    }
    
    if (textFits && finalFont) {
      ctx.font = `bold ${finalFont}`;
      const fontSizeNum = parseInt(finalFont);
      const lineHeight = fontSizeNum * 1.3;
      const startY = (height - (lines.length * lineHeight)) / 2 + fontSizeNum / 2;
      
      lines.forEach((line, index) => {
        const y = startY + (index * lineHeight);
        ctx.fillText(line, width / 2, y);
      });
    } else {
      // Fallback: draw single line dengan font size kecil
      ctx.font = 'bold 40px Arial';
      ctx.fillText(cleanText, width / 2, height / 2);
    }
    
    // Generate PNG
    const pngBuffer = canvas.toBuffer('image/png');
    
    // Send report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { 
        text: cleanText.substring(0, 30),
        length: cleanText.length,
        lines: lines.length || 1
      },
      'success'
    );
    
    // Return image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(pngBuffer);
    
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
