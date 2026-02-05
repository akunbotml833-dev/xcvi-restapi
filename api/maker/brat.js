const security = require('../security');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs').promises;

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
    
    // LOAD TEMPLATE PNG dari assets folder (100x100)
    const templatePath = path.join(process.cwd(), 'assets', 'brat.png');
    
    let templateImage;
    try {
      // Coba baca file template
      templateImage = await loadImage(templatePath);
      console.log('Template loaded:', templateImage.width, 'x', templateImage.height);
    } catch (templateError) {
      console.log('Template not found, using white background:', templateError.message);
      // Fallback ke background putih
      templateImage = null;
    }
    
    // CREATE CANVAS 800x800
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // DRAW BACKGROUND
    if (templateImage) {
      // Resize template 100x100 ke 800x800
      ctx.drawImage(templateImage, 0, 0, width, height);
    } else {
      // Fallback: white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }
    
    // TEXT CONFIGURATION
    ctx.fillStyle = '#000000'; // Black text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Cari font yang available
    const testFonts = ['Arial', 'Helvetica', 'sans-serif', 'Verdana', 'Tahoma'];
    let selectedFont = 'Arial';
    let fontSize = 60;
    
    // Test font
    for (const font of testFonts) {
      try {
        ctx.font = `bold ${fontSize}px "${font}"`;
        const metrics = ctx.measureText('Test');
        if (metrics.width > 0) {
          selectedFont = font;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // WORD WRAPPING
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = '';
    const maxWidth = width - 100; // 50px margin kiri-kanan
    
    // Set font untuk wrapping calculation
    ctx.font = `bold ${fontSize}px "${selectedFont}"`;
    
    // Simple wrapping algorithm
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
        
        // Adjust font size jika terlalu banyak lines
        if (lines.length > 6) {
          fontSize = Math.max(32, fontSize - 8);
          ctx.font = `bold ${fontSize}px "${selectedFont}"`;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    // Adjust font size berdasarkan jumlah line
    if (lines.length > 4) {
      fontSize = Math.max(40, 60 - (lines.length * 4));
      ctx.font = `bold ${fontSize}px "${selectedFont}"`;
    }
    
    // POSITIONING - RATA KIRI
    const lineHeight = fontSize * 1.4;
    const marginLeft = 60;
    const marginTop = 80;
    
    // Center vertically jika text pendek
    let startY = marginTop;
    const totalTextHeight = lines.length * lineHeight;
    if (totalTextHeight < (height - 200)) {
      startY = (height - totalTextHeight) / 2;
    }
    
    // DRAW TEXT LINES
    lines.forEach((line, index) => {
      const yPos = startY + (index * lineHeight);
      ctx.fillText(line, marginLeft, yPos);
    });
    
    // OPTIONAL: Add watermark atau border
    // ctx.strokeStyle = '#DDDDDD';
    // ctx.lineWidth = 2;
    // ctx.strokeRect(20, 20, width - 40, height - 40);
    
    // GENERATE PNG
    const pngBuffer = canvas.toBuffer('image/png');
    
    // SEND TELEGRAM REPORT
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      { 
        text: cleanText.substring(0, 30),
        length: cleanText.length,
        lines: lines.length,
        fontSize: fontSize,
        font: selectedFont,
        template: templateImage ? 'used' : 'white_bg',
        dimensions: `${width}x${height}`
      },
      'success'
    );
    
    // SET RESPONSE HEADERS
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pngBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Dimensions', `${width}x${height}`);
    res.setHeader('X-Format', 'PNG');
    res.setHeader('X-Text', cleanText.substring(0, 50));
    
    // RETURN PNG
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
      error: 'Failed to generate sticker',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
