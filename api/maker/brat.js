const security = require('../security');
const Jimp = require('jimp');

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
    
    // CREATE 800x800 IMAGE DENGAN JIMP
    const width = 800;
    const height = 800;
    
    // Create white background
    const image = new Jimp(width, height, 0xFFFFFFFF);
    
    // Load font (Jimp自带字体或默认字体)
    let font;
    try {
      // Coba load font bawaan Jimp
      font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    } catch (fontError) {
      console.log('Using default bitmap font:', fontError.message);
      // Fallback ke font default
      font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    }
    
    // TEXT WRAPPING untuk Jimp
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = '';
    const maxWidth = width - 100; // Margin 50px kiri-kanan
    const charWidth = 20; // Approx width per character untuk font size 32
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const lineWidth = testLine.length * charWidth;
      
      if (lineWidth > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    // Calculate position
    const lineHeight = 40;
    const startX = 50;
    const totalHeight = lines.length * lineHeight;
    let startY = (height - totalHeight) / 2;
    
    // Draw each line
    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      image.print(font, startX, y, line);
    });
    
    // Convert to PNG buffer
    const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
    
    // Send report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { 
        text: cleanText.substring(0, 30),
        length: cleanText.length,
        lines: lines.length,
        font: 'Jimp default',
        dimensions: `${width}x${height}`
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
    console.error('Brat API error (Jimp):', error);
    
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      req.query,
      'error',
      error
    );
    
    // Fallback: Create simple image dengan Jimp
    try {
      const fallbackImage = new Jimp(800, 800, 0xFFFFFFFF);
      const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
      
      fallbackImage.print(font, 50, 100, 'ERROR: ' + error.message.substring(0, 50));
      fallbackImage.print(font, 50, 150, 'Text: ' + (cleanText || 'none').substring(0, 30));
      
      const fallbackBuffer = await fallbackImage.getBufferAsync(Jimp.MIME_PNG);
      
      res.setHeader('Content-Type', 'image/png');
      return res.status(500).send(fallbackBuffer);
      
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
