import OpenAI, { toFile } from 'openai';

/**
 * ==============================================================================
 * BUNNY AI — Centralized AI Service
 * Powered by official OpenAI API & modern Responses API.
 * 
 * Features:
 * - Centralized model & fallback configuration
 * - Model availability verification & diagnostic logging (without exposing secrets)
 * - Fine-grained error classification (Auth, Quota, Rate Limit, Model 404, Network)
 * - Safe retries only for transient network/server failures (NEVER for 401 or quota)
 * - Streaming & standard completions using official Responses API
 * - Audio transcription (Whisper) & Text-to-Speech (TTS-1)
 * ==============================================================================
 */

// Central Model Configuration
export const AI_CONFIG = {
  // Primary model requested (can be configured via OPENAI_MODEL)
  defaultModel: process.env.OPENAI_MODEL || 'gpt-6-luna',
  
  // Verified safe fallback model if primary model is unavailable on account
  fallbackModel: process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini',
  
  // Audio models
  sttModel: process.env.OPENAI_STT_MODEL || 'whisper-1',
  ttsModel: process.env.OPENAI_TTS_MODEL || 'tts-1',
  ttsVoice: process.env.OPENAI_TTS_VOICE || 'nova', // 'nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'
  
  // Safeguards
  maxOutputTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2048', 10),
  timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '35000', 10),
  maxRetries: 2
};

// Supported Curated Models for Bunny AI
export const SUPPORTED_MODELS = [
  {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    badge: 'Flagship Speed',
    description: 'High-speed, cost-efficient GPT-6 series for instant responses.'
  },
  {
    id: 'gpt-6-sol',
    name: 'GPT-6 Sol',
    badge: 'High Reasoning',
    description: 'Balanced GPT-6 series model with enhanced reasoning and precision.'
  },
  {
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra',
    badge: 'Flagship Omni',
    description: 'Premier flagship model for complex multi-step reasoning and deep tasks.'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    badge: 'Multimodal',
    description: 'High-intelligence flagship omni model for text and code.'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    badge: 'Reliable Fallback',
    description: 'Affordable, fast, and globally accessible model.'
  }
];

/**
 * Safely masks an API key for diagnostic logging.
 * Never prints full credentials.
 * e.g. "sk-proj-abc123456789" -> "sk-proj...6789"
 */
export function maskKey(key) {
  if (!key || typeof key !== 'string') return '[NONE]';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}`;
}

/**
 * Resolves the OpenAI API Key from headers, body, or server environment.
 * Precedence:
 * 1. Request header 'x-api-key'
 * 2. Request body 'apiKey'
 * 3. Environment variable OPENAI_API_KEY
 */
export function resolveApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string' && headerKey.trim().length > 0) {
    return headerKey.trim();
  }

  if (req.body && req.body.apiKey && typeof req.body.apiKey === 'string' && req.body.apiKey.trim().length > 0) {
    return req.body.apiKey.trim();
  }

  const envKey = process.env.OPENAI_API_KEY;
  if (envKey && envKey !== 'your_openai_api_key_here' && envKey.trim().length > 0) {
    return envKey.trim();
  }

  return null;
}

/**
 * Creates an OpenAI client instance with specified key and timeout.
 */
export function createOpenAIClient(apiKey) {
  if (!apiKey) {
    throw new Error('API key is required to initialize OpenAI client.');
  }
  return new OpenAI({
    apiKey: apiKey.trim(),
    timeout: AI_CONFIG.timeoutMs,
    maxRetries: 0 // We handle retries explicitly and strictly based on error type
  });
}

/**
 * Checks if a model supports the temperature parameter.
 * gpt-6 series, o1 series, o3 series, and reasoning models reject temperature in OpenAI APIs.
 */
export function modelSupportsTemperature(modelName = '') {
  const m = (modelName || '').toLowerCase().trim();
  if (m.startsWith('gpt-6') || m.startsWith('o1') || m.startsWith('o3')) {
    return false;
  }
  return true;
}

/**
 * Classifies an error into specific, actionable categories.
 */
export function classifyOpenAIError(error, modelName = '') {
  const status = error?.status || error?.statusCode || 500;
  const code = error?.code || error?.error?.code || '';
  const rawMessage = error?.message || 'An unknown error occurred.';
  const lowerMsg = rawMessage.toLowerCase();

  // 1. Authentication / Key Errors (401)
  if (status === 401 || code === 'invalid_api_key' || lowerMsg.includes('incorrect api key') || lowerMsg.includes('invalid api key')) {
    return {
      type: 'AUTH_INVALID_KEY',
      status: 401,
      canRetry: false,
      message: 'Invalid OpenAI API key. Please check your credentials in backend/.env or application settings.',
      details: 'Check your API key at https://platform.openai.com/api-keys.'
    };
  }

  // 2. Quota / Billing Exceeded (429 with insufficient_quota / credit_balance_exhausted)
  if (code === 'insufficient_quota' || code === 'credit_balance_exhausted' || lowerMsg.includes('quota') || lowerMsg.includes('billing') || lowerMsg.includes('no credits') || lowerMsg.includes('exceeded your current quota') || lowerMsg.includes('credit_balance_exhausted')) {
    return {
      type: 'QUOTA_EXCEEDED',
      status: 429,
      canRetry: false,
      message: 'OpenAI account quota exceeded or no credits remaining.',
      details: 'Please add credits or check billing at https://platform.openai.com/settings/organization/billing/.'
    };
  }

  // 3. Rate Limit (429 without quota error)
  if (status === 429 || code === 'rate_limit_exceeded' || lowerMsg.includes('rate limit')) {
    return {
      type: 'RATE_LIMITED',
      status: 429,
      canRetry: true,
      retryAfterSeconds: error?.headers?.['retry-after'] ? parseInt(error.headers['retry-after'], 10) : 5,
      message: 'OpenAI API rate limit reached. Please wait a few moments before trying again.',
      details: 'Too many requests sent in a short period.'
    };
  }

  // 4. Model Unavailable / Not Found (404)
  if (status === 404 || code === 'model_not_found' || lowerMsg.includes('does not exist') || lowerMsg.includes('not found') || lowerMsg.includes('unavailable')) {
    return {
      type: 'MODEL_UNAVAILABLE',
      status: 404,
      canRetry: false,
      model: modelName,
      message: `The model '${modelName}' is unavailable or not accessible with your OpenAI account.`,
      details: `Your account credentials do not have permission or access to '${modelName}'. A verified fallback model can be used.`
    };
  }

  // 5. Timeout Errors (408 / 504 / AbortError)
  if (code === 'ETIMEDOUT' || error.name === 'AbortError' || lowerMsg.includes('timeout') || status === 408 || status === 504) {
    return {
      type: 'TIMEOUT',
      status: 408,
      canRetry: true,
      message: 'Request timed out waiting for OpenAI response.',
      details: 'The upstream server took too long to generate a response. Please try again.'
    };
  }

  // 6. Network / Connection Errors
  if (code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'ECONNREFUSED' || lowerMsg.includes('network') || lowerMsg.includes('fetch failed')) {
    return {
      type: 'NETWORK_ERROR',
      status: 503,
      canRetry: true,
      message: 'Network connection error while reaching OpenAI servers.',
      details: 'Please check your internet connection or verify OpenAI server status.'
    };
  }

  // 7. General Server Errors (500 / 502 / 503)
  if (status >= 500) {
    return {
      type: 'SERVER_ERROR',
      status: status || 500,
      canRetry: true,
      message: 'OpenAI service encountered a temporary internal error.',
      details: rawMessage
    };
  }

  // 8. Bad Request (400)
  if (status === 400) {
    return {
      type: 'INVALID_REQUEST',
      status: 400,
      canRetry: false,
      message: 'Invalid request parameters.',
      details: rawMessage
    };
  }

  // Default Fallback
  return {
    type: 'UNKNOWN_ERROR',
    status: status || 500,
    canRetry: false,
    message: rawMessage,
    details: rawMessage
  };
}

/**
 * Safe retry executor for temporary/transient failures only.
 */
async function withTransientRetry(fn, label = 'OpenAI operation', maxRetries = 2) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const classified = classifyOpenAIError(err);
      
      // Strict rule: NEVER retry invalid credentials, quota failures, or invalid requests
      if (!classified.canRetry || attempt > maxRetries) {
        throw err;
      }

      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      console.warn(`[Bunny AI] Transient error during ${label} (attempt ${attempt}/${maxRetries}): ${classified.message}. Retrying in ${backoffMs}ms...`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

/**
 * Formats conversation history into Responses API input format.
 */
export function buildResponsesInput(history = [], currentMessage = '') {
  const input = [];

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (!msg || (!msg.content && !msg.text)) continue;
      const content = msg.content || msg.text;
      const role = (msg.role === 'assistant' || msg.role === 'model') ? 'assistant' : 'user';
      input.push({
        role,
        content: content.trim()
      });
    }
  }

  if (currentMessage && currentMessage.trim().length > 0) {
    input.push({
      role: 'user',
      content: currentMessage.trim()
    });
  }

  return input;
}

/**
 * Formats conversation history into Chat Completions format (fallback format).
 */
export function buildChatMessages(history = [], currentMessage = '', systemPrompt = '') {
  const messages = [];

  if (systemPrompt && systemPrompt.trim().length > 0) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (!msg || (!msg.content && !msg.text)) continue;
      const content = msg.content || msg.text;
      const role = (msg.role === 'assistant' || msg.role === 'model') ? 'assistant' : 'user';
      messages.push({ role, content: content.trim() });
    }
  }

  if (currentMessage && currentMessage.trim().length > 0) {
    messages.push({ role: 'user', content: currentMessage.trim() });
  }

  return messages;
}

/**
 * Real API verification of model access using provided credentials.
 * Does not assume access. Performs an actual minimal request.
 */
export async function verifyModelAccess(apiKey, modelToTest) {
  if (!apiKey) {
    return {
      verified: false,
      status: 'unconfigured',
      model: modelToTest || AI_CONFIG.defaultModel,
      message: 'No OpenAI API Key provided.'
    };
  }

  const client = createOpenAIClient(apiKey);
  const targetModel = modelToTest || AI_CONFIG.defaultModel;

  console.log(`[Bunny AI] Diagnostic: Verifying access for model '${targetModel}' using key ${maskKey(apiKey)}...`);

  // Try verifying primary target model
  try {
    let verifiedOk = false;
    const requestPayload = {
      model: targetModel,
      input: 'ping',
      max_output_tokens: 16 // Responses API minimum allowed tokens is 16
    };

    if (modelSupportsTemperature(targetModel)) {
      requestPayload.temperature = 0.7;
    }

    try {
      const response = await client.responses.create(requestPayload);
      if (response && (response.id || response.output_text !== undefined)) {
        verifiedOk = true;
      }
    } catch (respErr) {
      const classified = classifyOpenAIError(respErr, targetModel);

      // Strict failure: quota exceeded or invalid key or model unavailable
      if (classified.type === 'QUOTA_EXCEEDED' || classified.type === 'AUTH_INVALID_KEY' || classified.type === 'MODEL_UNAVAILABLE') {
        throw respErr;
      }

      // If temperature caused 400 parameter rejection, retry without temperature
      if (respErr?.status === 400 && respErr.message?.toLowerCase().includes('temperature')) {
        delete requestPayload.temperature;
        await client.responses.create(requestPayload);
        verifiedOk = true;
      } else {
        // Fallback to checking model retrieval in catalog
        await client.models.retrieve(targetModel);
        verifiedOk = true;
      }
    }

    if (verifiedOk) {
      console.log(`[Bunny AI] ✅ Successfully verified access for model '${targetModel}'.`);
      return {
        verified: true,
        status: 'verified',
        model: targetModel,
        message: `Model '${targetModel}' is verified and ready.`
      };
    }
  } catch (err) {
    const classified = classifyOpenAIError(err, targetModel);
    console.warn(`[Bunny AI] ⚠️ Model check failed for '${targetModel}': [${classified.type}] ${classified.message}`);

    // If quota is exhausted
    if (classified.type === 'QUOTA_EXCEEDED') {
      return {
        verified: false,
        status: 'quota_exceeded',
        model: targetModel,
        errorType: classified.type,
        message: classified.message,
        details: classified.details
      };
    }

    // If key is invalid
    if (classified.type === 'AUTH_INVALID_KEY') {
      return {
        verified: false,
        status: 'invalid_key',
        model: targetModel,
        errorType: classified.type,
        message: classified.message,
        details: classified.details
      };
    }

    // If the error was MODEL_UNAVAILABLE, check if our fallback model is accessible
    if (classified.type === 'MODEL_UNAVAILABLE' && AI_CONFIG.fallbackModel && AI_CONFIG.fallbackModel !== targetModel) {
      console.log(`[Bunny AI] Diagnostic: Testing fallback model '${AI_CONFIG.fallbackModel}'...`);
      try {
        await client.models.retrieve(AI_CONFIG.fallbackModel);
        console.log(`[Bunny AI] ✅ Fallback model '${AI_CONFIG.fallbackModel}' is verified and available!`);
        return {
          verified: false,
          status: 'model_unavailable_fallback_ready',
          model: targetModel,
          fallbackModel: AI_CONFIG.fallbackModel,
          errorType: classified.type,
          message: classified.message,
          hint: `Using verified fallback model '${AI_CONFIG.fallbackModel}'.`
        };
      } catch (fallbackErr) {
        const fallbackClassified = classifyOpenAIError(fallbackErr, AI_CONFIG.fallbackModel);
        return {
          verified: false,
          status: 'error',
          model: targetModel,
          fallbackModel: AI_CONFIG.fallbackModel,
          errorType: classified.type,
          message: classified.message,
          fallbackError: fallbackClassified.message
        };
      }
    }

    return {
      verified: false,
      status: 'error',
      model: targetModel,
      errorType: classified.type,
      message: classified.message,
      details: classified.details
    };
  }

  return {
    verified: false,
    status: 'unverified',
    model: targetModel,
    message: 'Could not verify model.'
  };
}

/**
 * Standard (non-streaming) text generation using official Responses API.
 */
export async function generateResponse({
  apiKey,
  message,
  history = [],
  model = AI_CONFIG.defaultModel,
  temperature = 0.7,
  systemPrompt = '',
  maxTokens = AI_CONFIG.maxOutputTokens
}) {
  const client = createOpenAIClient(apiKey);
  let activeModel = model || AI_CONFIG.defaultModel;

  const defaultInstructions = systemPrompt && systemPrompt.trim().length > 0
    ? systemPrompt.trim()
    : "You are Bunny, an intelligent, helpful, articulate, and friendly AI personal assistant. Provide clear, accurate, and beautifully structured responses.";

  const input = buildResponsesInput(history, message);

  const executeCall = async (modelToUse) => {
    try {
      console.log(`[Bunny AI] Executing Responses API request: model='${modelToUse}', key=${maskKey(apiKey)}`);
      
      const requestPayload = {
        model: modelToUse,
        instructions: defaultInstructions,
        input,
        max_output_tokens: maxTokens
      };

      if (modelSupportsTemperature(modelToUse) && temperature !== undefined && temperature !== null) {
        requestPayload.temperature = Number(temperature) || 0.7;
      }

      const response = await client.responses.create(requestPayload);

      // Extract generated text
      let replyText = '';
      if (typeof response.output_text === 'string') {
        replyText = response.output_text;
      } else if (Array.isArray(response.output)) {
        for (const item of response.output) {
          if (item.content && Array.isArray(item.content)) {
            for (const part of item.content) {
              if (part.type === 'output_text' && part.text) {
                replyText += part.text;
              }
            }
          }
        }
      }

      return {
        reply: replyText,
        model: modelToUse,
        usage: response.usage || null,
        id: response.id || null
      };
    } catch (err) {
      // If error is 400 temperature not supported, retry without temperature immediately
      if (err?.status === 400 && err.message?.toLowerCase().includes('temperature')) {
        console.warn(`[Bunny AI] Model '${modelToUse}' does not support temperature parameter. Retrying without temperature...`);
        const fallbackPayload = {
          model: modelToUse,
          instructions: defaultInstructions,
          input,
          max_output_tokens: maxTokens
        };
        const response = await client.responses.create(fallbackPayload);
        let replyText = response.output_text || '';
        if (!replyText && Array.isArray(response.output)) {
          for (const item of response.output) {
            if (item.content && Array.isArray(item.content)) {
              for (const part of item.content) {
                if (part.type === 'output_text' && part.text) replyText += part.text;
              }
            }
          }
        }
        return {
          reply: replyText,
          model: modelToUse,
          usage: response.usage || null,
          id: response.id || null
        };
      }

      const classified = classifyOpenAIError(err, modelToUse);

      // If Responses API or model returned 404 / model unavailable, attempt verified fallback
      if (classified.type === 'MODEL_UNAVAILABLE' && AI_CONFIG.fallbackModel && modelToUse !== AI_CONFIG.fallbackModel) {
        console.warn(`[Bunny AI] Primary model '${modelToUse}' unavailable. Safely failing over to '${AI_CONFIG.fallbackModel}'...`);
        return await executeCall(AI_CONFIG.fallbackModel);
      }

      // If Responses API itself is not supported by this model ID, fallback to chat.completions
      if (err?.status === 400 && err.message?.toLowerCase().includes('responses')) {
        console.log(`[Bunny AI] Falling back to chat completions API for model '${modelToUse}'...`);
        const messages = buildChatMessages(history, message, defaultInstructions);
        const completionParams = {
          model: modelToUse,
          messages,
          max_tokens: maxTokens
        };
        if (modelSupportsTemperature(modelToUse)) {
          completionParams.temperature = Number(temperature) || 0.7;
        }

        const completion = await client.chat.completions.create(completionParams);

        return {
          reply: completion.choices[0]?.message?.content || '',
          model: modelToUse,
          usage: completion.usage || null,
          id: completion.id || null
        };
      }

      throw err;
    }
  };

  return await withTransientRetry(() => executeCall(activeModel), 'generateResponse', AI_CONFIG.maxRetries);
}

/**
 * Real-time streaming response using official Responses API.
 * Calls onChunk(textDelta) for each incoming token chunk.
 */
export async function streamResponse({
  apiKey,
  message,
  history = [],
  model = AI_CONFIG.defaultModel,
  temperature = 0.7,
  systemPrompt = '',
  maxTokens = AI_CONFIG.maxOutputTokens,
  onChunk,
  onMeta,
  signal
}) {
  const client = createOpenAIClient(apiKey);
  let activeModel = model || AI_CONFIG.defaultModel;

  const defaultInstructions = systemPrompt && systemPrompt.trim().length > 0
    ? systemPrompt.trim()
    : "You are Bunny, an intelligent, helpful, articulate, and friendly AI personal assistant. Provide clear, accurate, and beautifully structured responses.";

  const input = buildResponsesInput(history, message);

  const executeStream = async (modelToUse) => {
    try {
      console.log(`[Bunny AI] Executing Responses API stream: model='${modelToUse}', key=${maskKey(apiKey)}`);

      if (onMeta) {
        onMeta({ activeModel: modelToUse });
      }

      const streamPayload = {
        model: modelToUse,
        instructions: defaultInstructions,
        input,
        max_output_tokens: maxTokens,
        stream: true
      };

      if (modelSupportsTemperature(modelToUse) && temperature !== undefined && temperature !== null) {
        streamPayload.temperature = Number(temperature) || 0.7;
      }

      const stream = await client.responses.create(streamPayload, { signal });

      let fullAccumulated = '';

      for await (const event of stream) {
        // Responses API event structure
        if (event.type === 'response.output_text.delta' && event.delta) {
          fullAccumulated += event.delta;
          if (onChunk) onChunk(event.delta);
        } else if (event.type === 'response.text.delta' && event.delta) {
          fullAccumulated += event.delta;
          if (onChunk) onChunk(event.delta);
        } else if (event.delta && typeof event.delta === 'string') {
          fullAccumulated += event.delta;
          if (onChunk) onChunk(event.delta);
        }
      }

      return {
        reply: fullAccumulated,
        model: modelToUse
      };
    } catch (err) {
      // Check for user abort
      if (err.name === 'AbortError' || signal?.aborted) {
        console.log(`[Bunny AI] Stream generation aborted by user.`);
        return { reply: '', model: modelToUse, aborted: true };
      }

      // If temperature caused 400 parameter rejection during stream, retry without temperature
      if (err?.status === 400 && err.message?.toLowerCase().includes('temperature')) {
        console.warn(`[Bunny AI] Model '${modelToUse}' does not support temperature during stream. Retrying without temperature...`);
        const fallbackStreamPayload = {
          model: modelToUse,
          instructions: defaultInstructions,
          input,
          max_output_tokens: maxTokens,
          stream: true
        };
        const stream = await client.responses.create(fallbackStreamPayload, { signal });
        let fullAccumulated = '';
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta' && event.delta) {
            fullAccumulated += event.delta;
            if (onChunk) onChunk(event.delta);
          } else if (event.type === 'response.text.delta' && event.delta) {
            fullAccumulated += event.delta;
            if (onChunk) onChunk(event.delta);
          } else if (event.delta && typeof event.delta === 'string') {
            fullAccumulated += event.delta;
            if (onChunk) onChunk(event.delta);
          }
        }
        return { reply: fullAccumulated, model: modelToUse };
      }

      const classified = classifyOpenAIError(err, modelToUse);

      // Safe fallback if primary model is unavailable (404)
      if (classified.type === 'MODEL_UNAVAILABLE' && AI_CONFIG.fallbackModel && modelToUse !== AI_CONFIG.fallbackModel) {
        console.warn(`[Bunny AI] Primary model '${modelToUse}' unavailable during stream. Failing over to '${AI_CONFIG.fallbackModel}'...`);
        if (onMeta) {
          onMeta({ fallbackTriggered: true, fallbackModel: AI_CONFIG.fallbackModel, reason: classified.message });
        }
        return await executeStream(AI_CONFIG.fallbackModel);
      }

      // Fallback to chat completions stream if model does not support responses endpoint
      if (err?.status === 400 && err.message?.toLowerCase().includes('responses')) {
        console.log(`[Bunny AI] Falling back to chat completions stream for '${modelToUse}'...`);
        const messages = buildChatMessages(history, message, defaultInstructions);
        const completionParams = {
          model: modelToUse,
          messages,
          max_tokens: maxTokens,
          stream: true
        };
        if (modelSupportsTemperature(modelToUse)) {
          completionParams.temperature = Number(temperature) || 0.7;
        }

        const chatStream = await client.chat.completions.create(completionParams, { signal });

        let fullAccumulated = '';
        for await (const chunk of chatStream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullAccumulated += content;
            if (onChunk) onChunk(content);
          }
        }

        return {
          reply: fullAccumulated,
          model: modelToUse
        };
      }

      throw err;
    }
  };

  return await executeStream(activeModel);
}

/**
 * Speech-to-Text Audio Transcription via OpenAI Whisper API.
 */
export async function transcribeAudio({ apiKey, audioBuffer, filename = 'audio.webm' }) {
  const client = createOpenAIClient(apiKey);
  console.log(`[Bunny AI] Transcribing audio with model '${AI_CONFIG.sttModel}', key=${maskKey(apiKey)}...`);

  const file = await toFile(audioBuffer, filename);
  const result = await client.audio.transcriptions.create({
    file,
    model: AI_CONFIG.sttModel
  });

  return {
    text: result.text || '',
    model: AI_CONFIG.sttModel
  };
}

/**
 * Text-to-Speech Audio Synthesis via OpenAI TTS API.
 */
export async function synthesizeSpeech({ apiKey, text, voice = AI_CONFIG.ttsVoice, model = AI_CONFIG.ttsModel }) {
  const client = createOpenAIClient(apiKey);
  console.log(`[Bunny AI] Synthesizing speech with voice '${voice}', model '${model}', key=${maskKey(apiKey)}...`);

  const response = await client.audio.speech.create({
    model: model || AI_CONFIG.ttsModel,
    voice: voice || AI_CONFIG.ttsVoice,
    input: text.slice(0, 4096) // Max 4096 chars per OpenAI TTS request
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
