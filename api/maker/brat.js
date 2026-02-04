const security = require('../security');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

// Load font (kita pakai font default system atau Arial)
// Untuk Vercel, kita perlu register font atau pakai font built-in
// Font built-in: 'sans-serif', 'serif', 'monospace'

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
    
    // Clean and validate text
    const cleanText = String(text).trim();
    
    // Check max length (80 karakter)
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
    
    // Create canvas 800x800
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Draw white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // Draw border (optional)
    ctx.strokeStyle = '#DDDDDD';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, width - 40, height - 40);
    
    // Configure text
    const maxWidth = width - 100; // Margin kiri-kanan 50px
    let fontSize = 72; // Start dengan font size besar
    
    // Function untuk wrap text
    function wrapText(context, text, x, y, maxWidth, fontSize) {
      const lines = [];
      const words = text.split(' ');
      let line = '';
      
      // Reduce font size sampai pas
      let currentFontSize = fontSize;
      let fits = false;
      
      while (!fits && currentFontSize >= 24) {
        context.font = `bold ${currentFontSize}px 'sans-serif'`;
        line = '';
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = context.measureText(testLine);
          const testWidth = metrics.width;
          
          if (testWidth > maxWidth && i > 0) {
            lines.push(line);
            line = words[i] + ' ';
          } else {
            line = testLine;
          }
        }
        
        if (line) {
          lines.push(line);
        }
        
        // Cek apakah text muat dalam tinggi canvas
        const totalHeight = lines.length * currentFontSize * 1.2;
        if (totalHeight < height - 100 && lines.length <= 5) {
          fits = true;
        } else {
          currentFontSize -= 4;
          lines.length = 0; // Reset lines
        }
      }
      
      // Draw lines
      const lineHeight = currentFontSize * 1.2;
      const startY = y - ((lines.length - 1) * lineHeight) / 2;
      
      lines.forEach((line, index) => {
        const textWidth = context.measureText(line.trim()).width;
        const xPos = x - textWidth / 2;
        const yPos = startY + (index * lineHeight);
        
        // Text shadow
        context.fillStyle = 'rgba(0, 0, 0, 0.1)';
        context.fillText(line.trim(), xPos + 2, yPos + 2);
        
        // Main text
        context.fillStyle = '#333333';
        context.fillText(line.trim(), xPos, yPos);
      });
      
      return { fontSize: currentFontSize, lineCount: lines.length };
    }
    
    // Set text properties
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Wrap and draw text
    const centerX = width / 2;
    const centerY = height / 2;
    
    const textInfo = wrapText(ctx, cleanText, centerX, centerY, maxWidth, fontSize);
    
    // Generate PNG buffer
    const pngBuffer = canvas.toBuffer('image/png');
    
    // Send success report
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { 
        text: cleanText.substring(0, 30),
        length: cleanText.length,
        fontSize: textInfo.fontSize,
        lines: textInfo.lineCount
      },
      'success'
    );
    
    // Set response headers untuk gambar PNG
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pngBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 hari
    res.setHeader('X-API-Endpoint', '/api/maker/brat');
    res.setHeader('X-Text-Length', cleanText.length);
    res.setHeader('X-Font-Size', textInfo.fontSize);
    
    // Return PNG image
    return res.status(200).send(pngBuffer);
    
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
    
    // Jika error saat generate gambar, return JSON error
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      success: false,
      error: 'Failed to generate image',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
