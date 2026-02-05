const security = require('../security');
const axios = require('axios');
const cheerio = require('cheerio');
const { createCanvas, loadImage, registerFont } = require('canvas');
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
    const { text, theme = 'white', format = 'png' } = req.query;
    
    // Validation
    if (!text) {
      await security.sendTelegramReport(
        '/api/maker/brat',
        req,
        { text, theme, format },
        'error',
        'Text parameter required'
      );
      
      return res.status(400).json({
        success: false,
        error: 'Text parameter is required',
        example: '/api/maker/brat?text=Hello+World&theme=white&format=png',
        timestamp: new Date().toISOString()
      });
    }
    
    const cleanText = String(text).trim();
    const cleanTheme = String(theme).toLowerCase();
    const cleanFormat = String(format).toLowerCase();
    
    // Validate theme
    const validThemes = ['white', 'green', 'black', 'blue', 'red', 'strike'];
    if (!validThemes.includes(cleanTheme)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid theme',
        validThemes: validThemes,
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate format
    if (!['png', 'jpeg', 'jpg', 'webp', 'svg'].includes(cleanFormat)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format',
        validFormats: ['png', 'jpeg', 'jpg', 'webp', 'svg'],
        timestamp: new Date().toISOString()
      });
    }
    
    if (cleanText.length > 200) {
      await security.sendTelegramReport(
        '/api/maker/brat',
        req,
        { text: cleanText.substring(0, 20) },
        'error',
        'Text too long (max 200 chars)'
      );
      
      return res.status(400).json({
        success: false,
        error: 'Text too long',
        message: 'Maximum 200 characters allowed',
        length: cleanText.length,
        max_length: 200,
        timestamp: new Date().toISOString()
      });
    }
    
    // Scrape the Brat Generator website
    let cssStyles = '';
    let fontFamilies = {};
    let fontSizeMultiplier = 1;
    
    try {
      const response = await axios.get('https://www.bratgenerator.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract CSS styles
      $('style').each((i, elem) => {
        cssStyles += $(elem).html() + '\n';
      });
      
      // Extract font-face definitions
      const fontFaceRegex = /@font-face\s*{([^}]+)}/g;
      const matches = cssStyles.match(fontFaceRegex) || [];
      
      matches.forEach(match => {
        const fontFamilyMatch = match.match(/font-family:\s*['"]?([^;'"]+)['"]?/);
        const srcMatch = match.match(/src:\s*url\(['"]?([^)'"]+)['"]?\)/);
        
        if (fontFamilyMatch && srcMatch) {
          const fontName = fontFamilyMatch[1].trim().replace(/['"]/g, '');
          const fontUrl = srcMatch[1];
          
          // Store font URLs for reference
          fontFamilies[fontName.toLowerCase()] = {
            name: fontName,
            url: fontUrl.startsWith('http') ? fontUrl : `https://www.bratgenerator.com${fontUrl}`
          };
        }
      });
      
      // Determine font size multiplier based on theme
      switch(cleanTheme) {
        case 'black':
          fontSizeMultiplier = 0.8;
          break;
        case 'blue':
          fontSizeMultiplier = 1.5;
          break;
        case 'red':
          fontSizeMultiplier = 2.5;
          break;
        case 'green':
          fontSizeMultiplier = 1.0;
          break;
        case 'strike':
          fontSizeMultiplier = 0.7;
          break;
        default: // white
          fontSizeMultiplier = 0.9;
      }
      
    } catch (scrapeError) {
      console.error('Scraping error:', scrapeError.message);
      // Continue with default values if scraping fails
    }
    
    // Generate image based on format
    if (cleanFormat === 'svg') {
      return generateSVG(res, cleanText, cleanTheme, fontFamilies);
    } else {
      return generateCanvasImage(res, cleanText, cleanTheme, cleanFormat, fontFamilies, fontSizeMultiplier);
    }
    
  } catch (error) {
    console.error('Brat API error:', error);
    
    await security.sendTelegramReport(
      '/api/maker/brat',
      req,
      req.query,
      'error',
      error.message
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

// Function to generate SVG
async function generateSVG(res, text, theme, fontFamilies) {
  const width = 800;
  const height = 800;
  
  // Calculate font size based on text length and theme
  let baseFontSize = 60;
  if (text.length > 40) baseFontSize = 45;
  if (text.length > 60) baseFontSize = 35;
  if (text.length > 100) baseFontSize = 25;
  
  // Apply theme multiplier
  if (theme === 'blue') baseFontSize *= 1.5;
  if (theme === 'red') baseFontSize *= 2.5;
  
  // Determine font family based on theme
  let fontFamily = 'Arial, Helvetica, sans-serif';
  if (theme === 'blue' && fontFamilies.compactablack) {
    fontFamily = fontFamilies.compactablack.name;
  } else if (theme === 'red' && fontFamilies.drukcondsuper) {
    fontFamily = fontFamilies.drukcondsuper.name;
  } else if (fontFamilies.arial_narrowregular) {
    fontFamily = fontFamilies.arial_narrowregular.name;
  }
  
  // Determine text color and background
  let backgroundColor = '#FFFFFF';
  let textColor = '#000000';
  let fontWeight = 'normal';
  let textTransform = 'none';
  let textDecoration = 'none';
  
  switch(theme) {
    case 'blue':
      backgroundColor = '#0A00AD';
      textColor = '#DE0100';
      fontWeight = '900';
      textTransform = 'uppercase';
      break;
    case 'red':
      backgroundColor = '#000000';
      textColor = '#FFFFFF';
      fontWeight = 'bold';
      textTransform = 'uppercase';
      break;
    case 'green':
      backgroundColor = '#8ACF00';
      textColor = '#000000';
      break;
    case 'black':
      backgroundColor = '#000000';
      textColor = '#FFFFFF';
      break;
    case 'strike':
      backgroundColor = '#8ACF00';
      textColor = '#000000';
      textDecoration = 'line-through';
      break;
    default: // white
      backgroundColor = '#FFFFFF';
      textColor = '#000000';
  }
  
  // Word wrapping
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0] || '';
  const maxCharsPerLine = Math.max(10, Math.floor(40 / Math.sqrt(text.length)));
  
  for (let i = 1; i < words.length; i++) {
    if ((currentLine + ' ' + words[i]).length > maxCharsPerLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine += ' ' + words[i];
    }
  }
  if (currentLine) lines.push(currentLine);
  
  // Create SVG
  const lineHeight = baseFontSize * 1.3;
  const startY = (height - (lines.length * lineHeight)) / 2 + baseFontSize;
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${backgroundColor}"/>
  
  <text font-family="${fontFamily}" 
        font-size="${baseFontSize}px" 
        font-weight="${fontWeight}" 
        fill="${textColor}" 
        text-anchor="middle"
        text-transform="${textTransform}"
        text-decoration="${textDecoration}">`;
  
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
      text: text.substring(0, 30),
      length: text.length,
      theme: theme,
      format: 'svg',
      method: 'SVG'
    },
    'success'
  );
  
  // Return SVG image
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Text', text.substring(0, 50));
  res.setHeader('X-Theme', theme);
  
  return res.status(200).send(svg);
}

// Function to generate canvas image (PNG/JPEG/WEBP)
async function generateCanvasImage(res, text, theme, format, fontFamilies, fontSizeMultiplier) {
  const width = 800;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Set background based on theme
  switch(theme) {
    case 'blue':
      ctx.fillStyle = '#0A00AD';
      break;
    case 'red':
      ctx.fillStyle = '#000000';
      break;
    case 'green':
      ctx.fillStyle = '#8ACF00';
      break;
    case 'black':
      ctx.fillStyle = '#000000';
      break;
    case 'strike':
      ctx.fillStyle = '#8ACF00';
      break;
    default: // white
      ctx.fillStyle = '#FFFFFF';
  }
  ctx.fillRect(0, 0, width, height);
  
  // Configure text properties based on theme
  let fontSize = Math.max(20, Math.min(80, Math.floor(80 - text.length * 0.5))) * fontSizeMultiplier;
  let fontFamily = 'Arial';
  let fontWeight = 'normal';
  let textColor = '#000000';
  let textAlign = 'center';
  let textTransform = 'none';
  
  switch(theme) {
    case 'blue':
      fontFamily = fontFamilies.compactablack ? fontFamilies.compactablack.name : 'Impact';
      fontWeight = '900';
      textColor = '#DE0100';
      fontSize = Math.max(40, Math.min(120, Math.floor(100 - text.length * 0.8))) * fontSizeMultiplier;
      textTransform = 'uppercase';
      break;
    case 'red':
      fontFamily = fontFamilies.drukcondsuper ? fontFamilies.drukcondsuper.name : 'Impact';
      fontWeight = '900';
      textColor = '#FFFFFF';
      fontSize = Math.max(60, Math.min(200, Math.floor(150 - text.length * 1.2))) * fontSizeMultiplier;
      textTransform = 'uppercase';
      break;
    case 'green':
      fontFamily = fontFamilies.arial_narrowregular ? fontFamilies.arial_narrowregular.name : 'Arial Narrow';
      textColor = '#000000';
      break;
    case 'black':
      fontFamily = fontFamilies.arial_narrowregular ? fontFamilies.arial_narrowregular.name : 'Arial Narrow';
      textColor = '#FFFFFF';
      break;
    case 'strike':
      fontFamily = fontFamilies.timesregular ? fontFamilies.timesregular.name : 'Times New Roman';
      textColor = '#000000';
      textDecoration = 'line-through';
      break;
    default: // white
      fontFamily = fontFamilies.arial_narrowregular ? fontFamilies.arial_narrowregular.name : 'Arial Narrow';
      textColor = '#000000';
  }
  
  // Apply font
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  
  // Apply text transformation
  let displayText = text;
  if (textTransform === 'uppercase') {
    displayText = text.toUpperCase();
  }
  
  // Word wrapping
  const words = displayText.split(' ');
  const lines = [];
  let currentLine = words[0] || '';
  
  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > width * 0.9) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  
  // Draw text with strike-through if needed
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  let startY = (height - totalHeight) / 2 + fontSize / 2;
  
  lines.forEach((line, index) => {
    const y = startY + (index * lineHeight);
    
    // Draw main text
    ctx.fillText(line, width / 2, y);
    
    // Draw strike-through for strike theme
    if (theme === 'strike') {
      const textWidth = ctx.measureText(line).width;
      const strikeY = y + fontSize * 0.1;
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = fontSize * 0.05;
      ctx.beginPath();
      ctx.moveTo(width / 2 - textWidth / 2, strikeY);
      ctx.lineTo(width / 2 + textWidth / 2, strikeY);
      ctx.stroke();
    }
  });
  
  // Convert to buffer
  let mimeType, buffer;
  switch(format) {
    case 'jpeg':
    case 'jpg':
      mimeType = 'image/jpeg';
      buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
      break;
    case 'webp':
      mimeType = 'image/webp';
      buffer = canvas.toBuffer('image/webp');
      break;
    default: // png
      mimeType = 'image/png';
      buffer = canvas.toBuffer('image/png');
  }
  
  // Send report
  await security.sendTelegramReport(
    '/api/maker/brat',
    req,
    { 
      text: text.substring(0, 30),
      length: text.length,
      theme: theme,
      format: format,
      lines: lines.length,
      fontSize: fontSize,
      method: 'Canvas'
    },
    'success'
  );
  
  // Return image
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Text', text.substring(0, 50));
  res.setHeader('X-Theme', theme);
  res.setHeader('X-Format', format);
  
  return res.status(200).send(buffer);
}