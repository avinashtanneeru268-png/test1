import express from 'express';
import {
  AI_CONFIG,
  SUPPORTED_MODELS,
  resolveApiKey,
  verifyModelAccess,
  generateResponse,
  streamResponse,
  classifyOpenAIError
} from '../services/ai.js';
import {
  isSupabaseConfigured,
  createConversation,
  saveMessage
} from '../services/supabase.js';

const router = express.Router();

// Simple in-memory rate limiter (sliding window, max 30 requests per minute per IP)
const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const userRecord = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };

  if (now > userRecord.resetAt) {
    userRecord.count = 1;
    userRecord.resetAt = now + windowMs;
    rateLimitMap.set(ip, userRecord);
    return { allowed: true };
  }

  userRecord.count++;
  rateLimitMap.set(ip, userRecord);

  if (userRecord.count > limit) {
    const retryAfter = Math.ceil((userRecord.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetAt + 60000) {
      rateLimitMap.delete(ip);
    }
  }
}, 300000);

// GET /api/models - List supported models and configured defaults
router.get('/models', (req, res) => {
  res.json({
    models: SUPPORTED_MODELS,
    defaultModel: process.env.OPENAI_MODEL || AI_CONFIG.defaultModel,
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL || AI_CONFIG.fallbackModel
  });
});

// POST /api/model/verify - Live verification of OpenAI model access
router.post('/model/verify', async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    const targetModel = req.body?.model || process.env.OPENAI_MODEL || AI_CONFIG.defaultModel;

    if (!apiKey) {
      return res.status(400).json({
        verified: false,
        status: 'unconfigured',
        model: targetModel,
        message: 'No OpenAI API key found in server environment (OPENAI_API_KEY) or request.'
      });
    }

    const verificationResult = await verifyModelAccess(apiKey, targetModel);
    return res.json(verificationResult);
  } catch (error) {
    console.error('[Bunny AI] Verification error:', error);
    const classified = classifyOpenAIError(error, req.body?.model);
    return res.status(classified.status || 500).json({
      verified: false,
      errorType: classified.type,
      message: classified.message,
      details: classified.details
    });
  }
});

// POST /api/chat - Standard Chat completion
router.post('/chat', async (req, res) => {
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientIp, 30, 60000);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Please slow down.',
      retryAfter: rateLimit.retryAfter
    });
  }

  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        error: 'Missing OpenAI API Key.',
        errorType: 'AUTH_INVALID_KEY',
        hint: 'Please set OPENAI_API_KEY in backend/.env or configure it in Bunny AI Settings modal in the UI.',
        docsUrl: 'https://platform.openai.com/api-keys'
      });
    }

    let { message, history = [], model: requestedModel, temperature = 0.7, systemPrompt, conversationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Field "message" is required and cannot be empty.' });
    }

    // Input length control (16k chars limit)
    if (message.length > 16000) {
      return res.status(400).json({ error: 'Message exceeds maximum allowed length (16,000 characters).' });
    }

    const selectedModel = requestedModel || process.env.OPENAI_MODEL || AI_CONFIG.defaultModel;

    // Supabase auto-create conversation session if configured
    if (isSupabaseConfigured()) {
      try {
        if (!conversationId) {
          const title = message.trim().slice(0, 45) + (message.length > 45 ? '...' : '');
          const newConv = await createConversation(title, selectedModel);
          if (newConv) {
            conversationId = newConv.id;
          }
        }

        if (conversationId && !String(conversationId).startsWith('local_')) {
          await saveMessage(conversationId, 'user', message.trim());
        }
      } catch (dbErr) {
        // Soft standby - chat proceeds normally even if tables are pending
      }
    }

    // Call Central AI Service
    const result = await generateResponse({
      apiKey,
      message: message.trim(),
      history,
      model: selectedModel,
      temperature,
      systemPrompt
    });

    const reply = result.reply || '';

    // Persist assistant reply in Supabase if configured
    if (isSupabaseConfigured() && conversationId && !String(conversationId).startsWith('local_') && reply) {
      await saveMessage(conversationId, 'assistant', reply).catch(() => {});
    }

    res.json({
      reply,
      model: result.model || selectedModel,
      conversationId: conversationId || null,
      usage: result.usage || null
    });
  } catch (error) {
    console.error('[Bunny AI] Error in /api/chat:', error);
    const classified = classifyOpenAIError(error, req.body?.model);
    res.status(classified.status || 500).json({
      error: classified.message,
      errorType: classified.type,
      details: classified.details,
      canRetry: classified.canRetry
    });
  }
});

// POST /api/chat/stream - Real-time Streaming SSE
router.post('/chat/stream', async (req, res) => {
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientIp, 30, 60000);
  if (!rateLimit.allowed) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(`data: ${JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment before sending more messages.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // Set SSE headers upfront
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const abortController = new AbortController();
  req.on('close', () => {
    abortController.abort();
  });

  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      res.write(`data: ${JSON.stringify({
        error: 'Missing OpenAI API Key. Please configure OPENAI_API_KEY in backend/.env or application settings.',
        errorType: 'AUTH_INVALID_KEY'
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    let { message, history = [], model: requestedModel, temperature = 0.7, systemPrompt, conversationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.write(`data: ${JSON.stringify({ error: 'Field "message" is required.' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    if (message.length > 16000) {
      res.write(`data: ${JSON.stringify({ error: 'Message exceeds maximum length (16,000 characters).' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const selectedModel = requestedModel || process.env.OPENAI_MODEL || AI_CONFIG.defaultModel;

    // Supabase auto-create conversation session if configured
    if (isSupabaseConfigured()) {
      try {
        if (!conversationId) {
          const title = message.trim().slice(0, 45) + (message.length > 45 ? '...' : '');
          const newConv = await createConversation(title, selectedModel);
          if (newConv) {
            conversationId = newConv.id;
          }
        }

        if (conversationId && !String(conversationId).startsWith('local_')) {
          await saveMessage(conversationId, 'user', message.trim());
        }
      } catch (dbErr) {
        // Soft standby
      }
    }

    if (conversationId) {
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);
    }

    let fullReply = '';

    const streamResult = await streamResponse({
      apiKey,
      message: message.trim(),
      history,
      model: selectedModel,
      temperature,
      systemPrompt,
      signal: abortController.signal,
      onMeta: (meta) => {
        res.write(`data: ${JSON.stringify({ meta })}\n\n`);
      },
      onChunk: (chunk) => {
        fullReply += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    });

    // Persist complete assistant reply in Supabase
    if (isSupabaseConfigured() && conversationId && !String(conversationId).startsWith('local_') && fullReply.trim().length > 0) {
      await saveMessage(conversationId, 'assistant', fullReply.trim()).catch(() => {});
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('[Bunny AI] Error in /api/chat/stream:', error);
    const classified = classifyOpenAIError(error, req.body?.model);
    res.write(`data: ${JSON.stringify({
      error: classified.message,
      errorType: classified.type,
      details: classified.details,
      canRetry: classified.canRetry
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

export default router;
