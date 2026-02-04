const security = require('../security');
const { Resvg } = require('@resvg/resvg-js');

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
    
    // ABSOLUTE FIXED DIMENSIONS: 800x800 pixels
    const width = 800;
    const height = 800;
    
    // Word wrapping untuk 800px width
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = '';
    
    // Untuk font size 50px, approx 0.6px per char
    const avgCharWidth = 0.6;
    const maxLineWidthPx = 700; // width - 100px margin
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const lineWidth = testLine.length * 50 * avgCharWidth;
      
      if (lineWidth > maxLineWidthPx && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    // Calculate optimal font size (40-60px)
    let fontSize = 55;
    if (cleanText.length > 40) fontSize = 48;
    if (cleanText.length > 60) fontSize = 42;
    if (lines.length > 4) fontSize = Math.max(36, fontSize - 8);
    
    // Create SVG string
    const lineHeight = fontSize * 1.4;
    const startX = 50;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (height - totalTextHeight) / 2 + fontSize;
    
    // Build SVG with explicit styles
    let svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style type="text/css">
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap');
      text { 
        font-family: 'Inter', Arial, sans-serif; 
        font-weight: 700;
      }
    </style>
  </defs>
  
  <!-- White background -->
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  
  <!-- Text container -->
  <g fill="#000000" font-size="${fontSize}">`;
    
    // XML escape
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
    
    // Add text lines
    lines.forEach((line, index) => {
      const yPos = startY + (index * lineHeight);
      svgString += `\n    <text x="${startX}" y="${yPos}">${escapeXml(line)}</text>`;
    });
    
    svgString += '\n  </g>\n</svg>';
    
    // Convert SVG to PNG
    const resvg = new Resvg(svgString, {
      fitTo: {
        mode: 'width',
        value: width,
      },
      font: {
        loadSystemFonts: true,
      },
    });
    
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    // Send report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { 
        text: cleanText.substring(0, 30),
        length: cleanText.length,
        lines: lines.length,
        fontSize: fontSize,
        format: 'PNG',
        dimensions: `${width}x${height}`
      },
      'success'
    );
    
    // Return PNG image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pngBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Dimensions', `${width}x${height}`);
    res.setHeader('X-Format', 'PNG');
    res.setHeader('X-Text-Length', cleanText.length);
    
    return res.status(200).send(pngBuffer);
    
  } catch (error) {
    console.error('Brat PNG API error:', error);
    
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      req.query,
      'error',
      error
    );
    
    // Fallback to JSON error
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      success: false,
      error: 'Failed to generate PNG image',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
