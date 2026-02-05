const security = require('../security');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// Coba register font default
try {
  // Cek font yang tersedia
  const availableFonts = GlobalFonts.families;
  console.log('Available fonts:', availableFonts.slice(0, 5));
} catch (e) {
  console.log('Cannot get font list:', e.message);
}

module.exports = async (req, res) => {
  // [Header dan validation sama...]
  
  try {
    const { text } = req.query;
    
    // [Validation sama...]
    
    // CREATE CANVAS 800x800
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // DRAW BACKGROUND - PUTIH POLOS
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // DRAW TEXT - PAKAI FONT YANG PASTI ADA
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // FIX: Gunakan font generic yang pasti work
    // Di Vercel, 'sans-serif' harusnya selalu ada
    const fontSize = 60;
    ctx.font = `bold ${fontSize}px sans-serif`;
    
    // TEST: Draw test rectangle untuk verifikasi canvas work
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(10, 10, 10, 10); // Red dot di corner
    
    // TEST: Draw simple text tanpa wrapping
    ctx.fillStyle = '#000000';
    ctx.fillText('TESTING', 50, 100);
    
    // WORD WRAPPING SIMPLE
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = '';
    const maxWidth = width - 100;
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    // Adjust font size if needed
    let finalFontSize = fontSize;
    if (lines.length > 4) {
      finalFontSize = Math.max(40, fontSize - (lines.length * 3));
    }
    
    // Set final font
    ctx.font = `bold ${finalFontSize}px sans-serif`;
    
    // DRAW TEXT LINES
    const lineHeight = finalFontSize * 1.3;
    const marginLeft = 60;
    let startY = 100;
    
    lines.forEach((line, index) => {
      const yPos = startY + (index * lineHeight);
      ctx.fillText(line, marginLeft, yPos);
    });
    
    // GENERATE PNG
    const pngBuffer = canvas.toBuffer('image/png');
    
    // [Send report dan return...]
  }
};
