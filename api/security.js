// Security module untuk Vercel Functions
// Menggunakan Telegram Bot API via HTTP (no polling)

const SECURITY_CONFIG = {
  RATE_LIMIT_MS: 3000, // 3 detik
  MAX_REQUESTS_PER_MINUTE: 15, // Maks 15 request per menit
  SPAM_WINDOW_MS: 60000, // 1 menit
  ENABLE_TELEGRAM_REPORT: true, // Enable reporting
  ENABLE_RATE_LIMIT: true
};

// Telegram Configuration
const TELEGRAM_BOT_TOKEN = '8534293367:AAF329BR-yQMdIpgZySEFKKFAa5L4alalng';
const TELEGRAM_CHAT_ID = '7950114253';

// Rate limiting storage (in-memory, reset setiap cold start)
let requestTimestamps = new Map();
let requestCounts = new Map();

// Helper untuk mendapatkan IP client
function getClientIP(req) {
  try {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress || 
           'unknown';
  } catch (error) {
    return 'unknown';
  }
}

// Helper untuk format timestamp
function formatDate(date) {
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Fungsi untuk kirim HTTP request ke Telegram API
async function sendTelegramMessage(messageText) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !SECURITY_CONFIG.ENABLE_TELEGRAM_REPORT) {
    return { success: false, reason: 'Telegram reporting disabled' };
  }
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: messageText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    
    const data = await response.json();
    
    return { 
      success: data.ok === true, 
      data: data 
    };
    
  } catch (error) {
    console.error('Telegram API error:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// Format message untuk Telegram
function formatReportMessage(endpoint, req, params, status, error = null) {
  const clientIP = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const timestamp = new Date();
  const method = req.method;
  
  let message = `<b>📊 API Request Report</b>\n\n`;
  message += `<b>🔧 Endpoint:</b> <code>${endpoint}</code>\n`;
  message += `<b>⚡ Method:</b> ${method}\n`;
  message += `<b>📅 Time:</b> ${formatDate(timestamp)}\n`;
  message += `<b>🌐 IP:</b> <code>${clientIP}</code>\n`;
  message += `<b>📱 Agent:</b> ${userAgent.substring(0, 40)}${userAgent.length > 40 ? '...' : ''}\n`;
  message += `<b>✅ Status:</b> ${status === 'success' ? '✅ Success' : '❌ Error'}\n`;
  
  if (params && Object.keys(params).length > 0) {
    message += `\n<b>📋 Parameters:</b>\n`;
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const valStr = String(value);
        message += `• <b>${key}:</b> <code>${valStr.substring(0, 30)}${valStr.length > 30 ? '...' : ''}</code>\n`;
      }
    });
  }
  
  if (error) {
    const errorMsg = error.message || String(error);
    message += `\n<b>❌ Error:</b> ${errorMsg.substring(0, 100)}${errorMsg.length > 100 ? '...' : ''}`;
  }
  
  return message;
}

// Kirim report ke Telegram
async function sendTelegramReport(endpoint, req, params = {}, status = 'success', error = null) {
  try {
    const message = formatReportMessage(endpoint, req, params, status, error);
    const result = await sendTelegramMessage(message);
    
    return {
      sent: result.success,
      ...result
    };
    
  } catch (error) {
    console.error('Failed to send report:', error.message);
    return {
      sent: false,
      error: error.message
    };
  }
}

// Check rate limit
function checkRateLimit(req) {
  if (!SECURITY_CONFIG.ENABLE_RATE_LIMIT) {
    return { allowed: true, reason: 'disabled' };
  }
  
  const clientIP = getClientIP(req);
  const now = Date.now();
  
  // Initialize jika belum ada
  if (!requestTimestamps.has(clientIP)) {
    requestTimestamps.set(clientIP, 0);
  }
  if (!requestCounts.has(clientIP)) {
    requestCounts.set(clientIP, []);
  }
  
  // 1. Cek rate limit 3 detik
  const lastRequestTime = requestTimestamps.get(clientIP);
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < SECURITY_CONFIG.RATE_LIMIT_MS) {
    return {
      allowed: false,
      reason: 'rate_limit',
      message: `Please wait ${Math.ceil((SECURITY_CONFIG.RATE_LIMIT_MS - timeSinceLastRequest) / 1000)} seconds`,
      waitTime: SECURITY_CONFIG.RATE_LIMIT_MS - timeSinceLastRequest
    };
  }
  
  // 2. Cek spam limit (15 request per menit)
  const userRequests = requestCounts.get(clientIP);
  const oneMinuteAgo = now - SECURITY_CONFIG.SPAM_WINDOW_MS;
  
  const recentRequests = userRequests.filter(time => time > oneMinuteAgo);
  
  if (recentRequests.length >= SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE) {
    // Kirim alert spam ke Telegram
    const alertMessage = `<b>🚫 SPAM ALERT</b>\n\n` +
      `<b>🌐 IP:</b> <code>${clientIP}</code>\n` +
      `<b>📊 Requests:</b> ${recentRequests.length} in 1 minute\n` +
      `<b>⏰ Time:</b> ${formatDate(new Date())}\n` +
      `<b>🔧 Endpoint:</b> ${req.url || 'unknown'}`;
    
    sendTelegramMessage(alertMessage).catch(() => {});
    
    return {
      allowed: false,
      reason: 'spam',
      message: `Too many requests (${recentRequests.length} in 1 minute). Please try again later.`,
      waitTime: SECURITY_CONFIG.SPAM_WINDOW_MS
    };
  }
  
  // Update data
  requestTimestamps.set(clientIP, now);
  requestCounts.set(clientIP, [...recentRequests, now]);
  
  return {
    allowed: true,
    reason: 'ok',
    message: 'Request allowed'
  };
}

// Security middleware
function securityMiddleware(req, res) {
  const rateLimitCheck = checkRateLimit(req);
  
  if (!rateLimitCheck.allowed) {
    // Kirim alert blocked ke Telegram
    const alertMessage = `<b>🚫 BLOCKED REQUEST</b>\n\n` +
      `<b>🔧 Endpoint:</b> ${req.url || 'unknown'}\n` +
      `<b>🌐 IP:</b> <code>${getClientIP(req)}</code>\n` +
      `<b>⏰ Time:</b> ${formatDate(new Date())}\n` +
      `<b>📛 Reason:</b> ${rateLimitCheck.reason}\n` +
      `<b>📝 Message:</b> ${rateLimitCheck.message}`;
    
    sendTelegramMessage(alertMessage).catch(() => {});
    
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: rateLimitCheck.message,
      reason: rateLimitCheck.reason,
      retry_after: rateLimitCheck.waitTime ? Math.ceil(rateLimitCheck.waitTime / 1000) : 3,
      timestamp: new Date().toISOString()
    });
    
    return false;
  }
  
  return true;
}

// Cleanup function (optional)
function cleanupOldData() {
  const now = Date.now();
  const fiveMinutesAgo = now - 300000;
  
  // Cleanup request timestamps older than 5 minutes
  for (const [ip, timestamp] of requestTimestamps.entries()) {
    if (timestamp < fiveMinutesAgo) {
      requestTimestamps.delete(ip);
    }
  }
  
  // Cleanup request counts older than 5 minutes
  for (const [ip, requests] of requestCounts.entries()) {
    const recentRequests = requests.filter(time => time > fiveMinutesAgo);
    if (recentRequests.length === 0) {
      requestCounts.delete(ip);
    } else {
      requestCounts.set(ip, recentRequests);
    }
  }
}

// Jalankan cleanup setiap 5 menit jika tidak di Vercel Edge
if (typeof setInterval !== 'undefined' && process.env.VERCEL !== '1') {
  setInterval(cleanupOldData, 300000);
}

// Module exports
module.exports = {
  SECURITY_CONFIG,
  getClientIP,
  formatDate,
  sendTelegramReport,
  sendTelegramMessage,
  checkRateLimit,
  securityMiddleware
};
