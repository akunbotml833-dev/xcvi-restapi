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
    
    // GENERATE SVG 800x800 dengan text rata kiri
    const width = 800;
    const height = 800;
    
    // Calculate font size based on text length
    let fontSize = 64; // Ukuran font lebih besar
    
    // Adjust font size berdasarkan panjang text
    if (cleanText.length > 40) fontSize = 56;
    if (cleanText.length > 60) fontSize = 48;
    
    // Word wrapping untuk text rata kiri
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = words[0];
    
    // Maximum characters per line (estimasi)
    const maxCharsPerLine = Math.floor(80 / Math.ceil(cleanText.length / 40));
    
    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      // Estimasi: rata-rata 1.2 chars per pixel untuk font size ini
      const estimatedWidth = testLine.length * fontSize * 0.6;
      
      if (estimatedWidth > width - 100) { // Margin 50px kiri-kanan
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    
    // Create SVG dengan text rata kiri
    const lineHeight = fontSize * 1.4;
    const startX = 50; // Margin kiri 50px
    const startY = 100; // Mulai dari 100px dari atas
    
    let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background putih -->
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  
  <!-- Text container -->
  <g font-family="Arial, Helvetica, sans-serif" 
     font-size="${fontSize}" 
     font-weight="bold" 
     fill="#000000"
     text-anchor="start">`;
    
    // Add each line dengan posisi yang tepat
    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      svg += `<text x="${startX}" y="${y}">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`;
    });
    
    svg += `</g></svg>`;
    
    // Send report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { 
        text: cleanText.substring(0, 30),
        length: cleanText.length,
        lines: lines.length,
        fontSize: fontSize,
        alignment: 'left'
      },
      'success'
    );
    
    // Return SVG image
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Text-Length', cleanText.length);
    res.setHeader('X-Font-Size', fontSize);
    res.setHeader('X-Lines', lines.length);
    res.setHeader('X-Alignment', 'left');
    
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
