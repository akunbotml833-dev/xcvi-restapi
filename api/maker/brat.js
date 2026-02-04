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
    
    // FIXED: 800x800 PIXELS EXACT
    const width = 800;
    const height = 800;
    
    // Calculate optimal font size
    let baseFontSize = 70;
    if (cleanText.length > 30) baseFontSize = 60;
    if (cleanText.length > 50) baseFontSize = 50;
    if (cleanText.length > 70) baseFontSize = 42;
    
    // Word wrapping untuk left alignment
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = '';
    const maxLineWidth = width - 100; // 50px margin kiri-kanan
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      
      // Estimasi lebih akurat
      const estimatedWidth = testLine.length * baseFontSize * 0.6;
      
      if (estimatedWidth > maxLineWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    // Adjust font size jika terlalu banyak lines
    let finalFontSize = baseFontSize;
    const maxLines = Math.floor((height - 150) / (baseFontSize * 1.4));
    
    if (lines.length > maxLines && lines.length > 1) {
      finalFontSize = Math.max(32, baseFontSize * 0.85);
    }
    
    // Create SVG dengan dimensions yang fixed
    const lineHeight = finalFontSize * 1.4;
    const startX = 50; // Margin kiri 50px
    const startY = 80; // Margin atas 80px
    
    // FIXED: SVG dengan width dan height yang eksplisit
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" version="1.1">
  <!-- Background putih 800x800 -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF"/>
  
  <!-- Text container -->
  <g font-family="Arial, Helvetica, sans-serif" 
     font-size="${finalFontSize}px" 
     font-weight="bold" 
     fill="#000000"
     text-anchor="start">`;
    
    // Escape XML special characters
    function escapeXml(unsafe) {
      return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
        }
      });
    }
    
    // Add each line
    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      svg += `<text x="${startX}" y="${y}">${escapeXml(line)}</text>`;
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
        fontSize: finalFontSize,
        dimensions: `${width}x${height}`
      },
      'success'
    );
    
    // Return SVG image
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', Buffer.byteLength(svg));
    res.setHeader('X-Dimensions', `${width}x${height}`);
    res.setHeader('X-Text-Length', cleanText.length);
    
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
