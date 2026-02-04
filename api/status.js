const security = require('./security');
const creator = 'Wanz Official';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Test Telegram reporting
    const testResult = await security.sendTelegramMessage(
      `<b>🔄 API Test Report</b>\n\n` +
      `<b>🔧 Endpoint:</b> /api/test\n` +
      `<b>⏰ Time:</b> ${security.formatDate(new Date())}\n` +
      `<b>✅ Status:</b> Test message from XCVI API`
    );
    
    return res.status(200).json({
      success: true,
      message: 'XCVI REST API is online',
      timestamp: new Date().toISOString(),
      security: {
        rate_limit_enabled: security.SECURITY_CONFIG.ENABLE_RATE_LIMIT,
        telegram_reporting: security.SECURITY_CONFIG.ENABLE_TELEGRAM_REPORT,
        telegram_test: testResult.success ? '✅ Working' : '❌ Failed',
        creator: creator
      }});
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
