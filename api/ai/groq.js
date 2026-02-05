const security = require('../security');
const Groq = require('groq-sdk');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (!security.securityMiddleware(req, res)) {
    return;
  }
  
  if (req.method !== 'GET' && req.method !== 'POST') {
    await security.sendTelegramReport(
      '/api/ai/groq',
      req,
      null,
      'error',
      'Method not allowed'
    );
    
    return res.status(405).json({
      error: 'Method not allowed. Use GET or POST.',
      creator: 'Wanz Official',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    let prompt, text, stream = false;
    
    if (req.method === 'GET') {
      prompt = req.query.prompt;
      text = req.query.text;
      stream = req.query.stream === 'true';
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      prompt = body.prompt;
      text = body.text;
      stream = body.stream === true || body.stream === 'true';
    }
    
    if (!prompt || !text) {
      const missing = [];
      if (!prompt) missing.push('prompt');
      if (!text) missing.push('text');
      
      await security.sendTelegramReport(
        '/api/ai/groq',
        req,
        { missing: missing },
        'error',
        'Missing required parameters'
      );
      
      return res.status(400).json({
        success: false,
        error: `Missing required parameters: ${missing.join(', ')}`,
        example: '/api/ai/groq?prompt=You+are+a+helpful+assistant&text=Hello',
        creator: 'Wanz Official',
        timestamp: new Date().toISOString()
      });
    }
    
    const cleanPrompt = String(prompt).trim();
    const cleanText = String(text).trim();
    
    if (cleanPrompt.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Prompt too long',
        message: 'Maximum 2000 characters allowed for prompt',
        length: cleanPrompt.length,
        max_length: 2000,
        creator: 'Wanz Official',
        timestamp: new Date().toISOString()
      });
    }
    
    if (cleanText.length > 4000) {
      return res.status(400).json({
        success: false,
        error: 'Text too long',
        message: 'Maximum 4000 characters allowed for text',
        length: cleanText.length,
        max_length: 4000,
        creator: 'Wanz Official',
        timestamp: new Date().toISOString()
      });
    }
    
    const groq = new Groq({
      apiKey: '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'
    });
    
    const messages = [
      {
        role: "system",
        content: cleanPrompt
      },
      {
        role: "user",
        content: cleanText
      }
    ];
    
    const model = 'llama-3.1-8b-instant'; 
    const startTime = Date.now();
    
    await security.sendTelegramReport(
      '/api/ai/groq',
      req,
      { 
        promptLength: cleanPrompt.length,
        textLength: cleanText.length,
        model: model,
        stream: stream
      },
      'processing'
    );
    
    if (stream) {
      return await handleStreamingResponse(res, groq, messages, model, startTime, req);
    } else {
      return await handleRegularResponse(res, groq, messages, model, startTime, req);
    }
    
  } catch (error) {
    console.error('Groq API error:', error);
    
    await security.sendTelegramReport(
      '/api/ai/groq',
      req,
      req.method === 'GET' ? req.query : req.body,
      'error',
      error.message || error.toString()
    );
    
    return res.status(500).json({
      success: false,
      error: 'Failed to process AI request',
      message: error.message || 'Unknown error',
      creator: 'Wanz Official',
      timestamp: new Date().toISOString()
    });
  }
};

async function handleRegularResponse(res, groq, messages, model, startTime, req) {
  try {
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: model,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });
    
    const responseText = completion.choices[0]?.message?.content || 'No response generated';
    const totalTokens = completion.usage?.total_tokens || 0;
    const responseTime = Date.now() - startTime;
    
    await security.sendTelegramReport(
      '/api/ai/groq',
      req,
      { 
        responseLength: responseText.length,
        totalTokens: totalTokens,
        responseTime: responseTime,
        model: model
      },
      'success'
    );
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    res.setHeader('X-Total-Tokens', totalTokens);
    
    return res.status(200).json({
      success: true,
      response: responseText,
      creator: 'Wanz Official'
    });
    
  } catch (error) {
    console.error('Groq API call error:', error);
    
    await security.sendTelegramReport(
      '/api/ai/groq',
      req,
      { model: model, error: error.message },
      'error',
      'Groq API call failed'
    );
    
    return res.status(500).json({
      success: false,
      error: 'Groq API call failed',
      message: error.message || 'Unknown API error',
      creator: 'Wanz Official',
      timestamp: new Date().toISOString()
    });
  }
}

async function handleStreamingResponse(res, groq, messages, model, startTime, req) {
  try {
    const stream = await groq.chat.completions.create({
      messages: messages,
      model: model,
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    });
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Stream', 'true');
    
    let fullResponse = '';
    let tokenCount = 0;
    
    res.write(`data: ${JSON.stringify({
      type: 'start',
      model: model,
      timestamp: new Date().toISOString()
    })}\n\n`);
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        fullResponse += content;
        tokenCount++;
        
        res.write(`data: ${JSON.stringify({
          type: 'chunk',
          content: content,
          token: tokenCount
        })}\n\n`);
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      fullResponse: fullResponse,
      tokens: tokenCount,
      responseTime: responseTime,
      timestamp: new Date().toISOString()
    })}\n\n`);
    
    await security.sendTelegramReport(
      '/api/ai/groq',
      req,
      { 
        responseLength: fullResponse.length,
        tokens: tokenCount,
        responseTime: responseTime,
        stream: true
      },
      'success'
    );
    
    res.write('data: [DONE]\n\n');
    res.end();
    
  } catch (error) {
    console.error('Streaming error:', error);
    
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    })}\n\n`);
    
    res.end();
    
    await security.sendTelegramReport(
      '/api/ai/groq',
      req,
      { error: error.message, stream: true },
      'error',
      'Streaming failed'
    );
  }
}