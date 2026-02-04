const TelegramBot = require('node-telegram-bot-api');

// Konfigurasi Telegram Bot
const TELEGRAM_BOT_TOKEN = '8534293367:AAF329BR-yQMdIpgZySEFKKFAa5L4alalng';
const TELEGRAM_CHAT_ID = '7950114253';
let bot;

try {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
} catch (error) {
  console.error('Failed to initialize Telegram bot:', error.message);
  bot = null;
}

// Rate limiting storage
const requestTimestamps = new Map();
const spamCounters = new Map();

// Konfigurasi Security
const SECURITY_CONFIG = {
  RATE_LIMIT_MS: 3000, // 3 detik
  MAX_REQUESTS_PER_MINUTE: 15, // Maks 15 request per menit per IP
  SPAM_WINDOW_MS: 60000, // 1 menit
  BLOCK_DURATION_MS: 300000, // 5 menit block jika spam
  ENABLE_TELEGRAM_REPORT: true
};

// Helper untuk mendapatkan IP client
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.socket?.remoteAddress || 
         'unknown';
}

// Helper untuk format timestamp
function formatDate(date) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta'
  }).format(date);
}

// Format message untuk Telegram
function formatTelegramMessage(endpoint, req, params, status = 'success', error = null) {
  const clientIP = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const timestamp = new Date();
  const method = req.method;
  
  let message = `📊 *API Request Report* 📊\n\n`;
  message += `🔧 *Endpoint:* \`${endpoint}\`\n`;
  message += `⚡ *Method:* ${method}\n`;
  message += `📅 *Timestamp:* ${formatDate(timestamp)}\n`;
  message += `🌐 *Client IP:* \`${clientIP}\`\n`;
  message += `📱 *User Agent:* \`${userAgent.substring(0, 60)}${userAgent.length > 60 ? '...' : ''}\`\n`;
  message += `✅ *Status:* ${status === 'success' ? '✅ Success' : '❌ Error'}\n\n`;
  
  if (params && Object.keys(params).length > 0) {
    message += `📋 *Parameters:*\n`;
    Object.entries(params).forEach(([key, value]) => {
      const valStr = String(value);
      message += `  • *${key}:* \`${valStr.substring(0, 50)}${valStr.length > 50 ? '...' : ''}\`\n`;
    });
  }
  
  if (error) {
    message += `\n❌ *Error:* ${error.message || error}`;
  }
  
  message += `\n\n🔒 *Security Check:* Passed`;
  
  return message;
}

// Kirim report ke Telegram
async function sendTelegramReport(endpoint, req, params, status = 'success', error = null) {
  if (!bot || !SECURITY_CONFIG.ENABLE_TELEGRAM_REPORT) {
    return { sent: false, reason: 'Telegram bot not configured or disabled' };
  }
  
  try {
    const message = formatTelegramMessage(endpoint, req, params, status, error);
    await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
    return { sent: true };
  } catch (error) {
    console.error('Failed to send Telegram report:', error.message);
    return { sent: false, error: error.message };
  }
}

// Check rate limit
function checkRateLimit(req) {
  const clientIP = getClientIP(req);
  const now = Date.now();
  
  // Cek spam counter
  if (!spamCounters.has(clientIP)) {
    spamCounters.set(clientIP, []);
  }
  
  const userRequests = spamCounters.get(clientIP);
  const oneMinuteAgo = now - SECURITY_CONFIG.SPAM_WINDOW_MS;
  
  // Filter requests dalam 1 menit terakhir
  const recentRequests = userRequests.filter(time => time > oneMinuteAgo);
  spamCounters.set(clientIP, [...recentRequests, now]);
  
  // Cek apakah melebihi batas spam
  if (recentRequests.length >= SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE) {
    return {
      allowed: false,
      reason: 'spam',
      message: `Too many requests. Maximum ${SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE} requests per minute allowed.`,
      waitTime: SECURITY_CONFIG.BLOCK_DURATION_MS
    };
  }
  
  // Cek rate limit per request
  const lastRequestTime = requestTimestamps.get(clientIP) || 0;
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < SECURITY_CONFIG.RATE_LIMIT_MS) {
    return {
      allowed: false,
      reason: 'rate_limit',
      message: `Please wait ${Math.ceil((SECURITY_CONFIG.RATE_LIMIT_MS - timeSinceLastRequest) / 1000)} seconds before making another request.`,
      waitTime: SECURITY_CONFIG.RATE_LIMIT_MS - timeSinceLastRequest
    };
  }
  
  // Update timestamp jika allowed
  requestTimestamps.set(clientIP, now);
  
  return {
    allowed: true,
    reason: 'ok',
    message: 'Request allowed'
  };
}

// Cleanup old data (prevent memory leak)
function cleanupOldData() {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  // Cleanup spam counters
  for (const [ip, requests] of spamCounters.entries()) {
    const recentRequests = requests.filter(time => time > oneHourAgo);
    if (recentRequests.length === 0) {
      spamCounters.delete(ip);
    } else {
      spamCounters.set(ip, recentRequests);
    }
  }
  
  // Cleanup rate limit timestamps
  for (const [ip, timestamp] of requestTimestamps.entries()) {
    if (timestamp < oneHourAgo) {
      requestTimestamps.delete(ip);
    }
  }
}

// Jalankan cleanup setiap jam
setInterval(cleanupOldData, 3600000);

// Middleware untuk security check
function securityMiddleware(req, res, next) {
  const rateLimitCheck = checkRateLimit(req);
  
  if (!rateLimitCheck.allowed) {
    // Kirim report ke Telegram untuk blocked request
    if (bot && SECURITY_CONFIG.ENABLE_TELEGRAM_REPORT) {
      const endpoint = req.url || 'unknown';
      const message = `🚫 *BLOCKED REQUEST* 🚫\n\n`;
      const fullMessage = message + 
        `🔧 *Endpoint:* ${endpoint}\n` +
        `🌐 *IP:* \`${getClientIP(req)}\`\n` +
        `⏰ *Time:* ${formatDate(new Date())}\n` +
        `📛 *Reason:* ${rateLimitCheck.reason}\n` +
        `📝 *Message:* ${rateLimitCheck.message}`;
      
      bot.sendMessage(TELEGRAM_CHAT_ID, fullMessage, { parse_mode: 'Markdown' })
        .catch(err => console.error('Failed to send blocked report:', err));
    }
    
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: rateLimitCheck.message,
      reason: rateLimitCheck.reason,
      wait_time_seconds: rateLimitCheck.waitTime ? Math.ceil(rateLimitCheck.waitTime / 1000) : null,
      timestamp: new Date().toISOString()
    });
  }
  
  // Jika ada next function (untuk Express middleware)
  if (typeof next === 'function') {
    next();
  }
  
  return rateLimitCheck;
}

// Module exports
module.exports = {
  SECURITY_CONFIG,
  getClientIP,
  formatDate,
  sendTelegramReport,
  checkRateLimit,
  securityMiddleware,
  formatTelegramMessage
};