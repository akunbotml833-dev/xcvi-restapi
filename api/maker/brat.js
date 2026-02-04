const security = require('../security');
const { createCanvas, loadImage, registerFont } = require('@napi-rs/canvas');
const path = require('path');

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
    
    // Draw white background (putih polos)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // Configure text - TIDAK ADA BORDER/LINE
    
    const maxWidth = width - 100; // Margin kiri-kanan 50px
    let fontSize = 64; // Start dengan font size
    
    // Function untuk wrap text dengan font yang tersedia
    function wrapTextAndDraw(context, text, x, y, maxWidth, initialFontSize) {
      const words = text.split(' ');
      let lines = [];
      let currentFontSize = initialFontSize;
      let fits = false;
      
      // Coba dari font size besar ke kecil
      while (!fits && currentFontSize >= 24) {
        // Coba beberapa font family
        const fontFamilies = [
          'Arial',
          'Helvetica',
          'sans-serif',
          'DejaVu Sans',
          'Liberation Sans'
        ];
        
        for (const fontFamily of fontFamilies) {
          context.font = `bold ${currentFontSize}px ${fontFamily}`;
          lines = [];
          let line = '';
          
          for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = context.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && i > 0) {
              lines.push(line.trim());
              line = words[i] + ' ';
            } else {
              line = testLine;
            }
          }
          
          if (line) {
            lines.push(line.trim());
          }
          
          // Cek apakah text muat dalam tinggi canvas
          const totalHeight = lines.length * currentFontSize * 1.3;
          if (totalHeight < height - 100 && lines.length <= 6) {
            // Draw the text
            const lineHeight = currentFontSize * 1.3;
            const startY = y - ((lines.length - 1) * lineHeight) / 2;
            
            // Set text color - hitam solid
            context.fillStyle = '#000000';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            
            lines.forEach((lineText, index) => {
              const yPos = startY + (index * lineHeight);
              context.fillText(lineText, x, yPos);
            });
            
            fits = true;
            break;
          }
        }
        
        if (!fits) {
          currentFontSize -= 4;
        }
      }
      
      return { fontSize: currentFontSize, lineCount: lines.length, fits };
    }
    
    // Coba draw text
    const centerX = width / 2;
    const centerY = height / 2;
    
    const textInfo = wrapTextAndDraw(ctx, cleanText, centerX, centerY, maxWidth, fontSize);
    
    // Jika tidak muat sama sekali, kasih pesan error
    if (!textInfo.fits) {
      // Draw error message
      ctx.font = 'bold 36px Arial';
      ctx.fillStyle = '#FF0000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Text too long', centerX, centerY - 30);
      ctx.fillText('Max 80 chars', centerX, centerY + 30);
    }
    
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
        lines: textInfo.lineCount,
        fits: textInfo.fits
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
    res.setHeader('X-Lines', textInfo.lineCount);
    
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
