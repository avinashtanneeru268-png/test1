import express from 'express';
import {
  AI_CONFIG,
  resolveApiKey,
  transcribeAudio,
  synthesizeSpeech,
  classifyOpenAIError
} from '../services/ai.js';

const router = express.Router();

// GET /api/voice/status - Status of audio capabilities
router.get('/voice/status', (req, res) => {
  const apiKey = resolveApiKey(req);
  res.json({
    enabled: Boolean(apiKey),
    sttModel: AI_CONFIG.sttModel,
    ttsModel: AI_CONFIG.ttsModel,
    defaultVoice: AI_CONFIG.ttsVoice,
    supportedVoices: ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer']
  });
});

// POST /api/voice/transcribe - Speech-to-Text using OpenAI Whisper
router.post('/voice/transcribe', async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        error: 'Missing OpenAI API Key for transcription.',
        errorType: 'AUTH_INVALID_KEY'
      });
    }

    const { audio, format = 'webm' } = req.body;
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: 'Field "audio" (base64-encoded audio) is required.' });
    }

    // Clean base64 data uri prefix if present (e.g. "data:audio/webm;base64,...")
    const cleanBase64 = audio.includes(',') ? audio.split(',')[1] : audio;
    const audioBuffer = Buffer.from(cleanBase64, 'base64');

    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: 'Received empty audio payload.' });
    }

    // Maximum 25MB check (Whisper limit)
    if (audioBuffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio file exceeds 25MB limit.' });
    }

    const filename = `recording.${format === 'wav' ? 'wav' : (format === 'mp3' ? 'mp3' : 'webm')}`;
    const result = await transcribeAudio({ apiKey, audioBuffer, filename });

    res.json({
      success: true,
      text: result.text,
      model: result.model
    });
  } catch (error) {
    console.error('[Bunny AI] Voice transcription error:', error);
    const classified = classifyOpenAIError(error, AI_CONFIG.sttModel);
    res.status(classified.status || 500).json({
      error: classified.message,
      errorType: classified.type,
      details: classified.details
    });
  }
});

// POST /api/voice/speak - Text-to-Speech using OpenAI TTS-1
router.post('/voice/speak', async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        error: 'Missing OpenAI API Key for speech synthesis.',
        errorType: 'AUTH_INVALID_KEY'
      });
    }

    const { text, voice, model } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Field "text" is required.' });
    }

    // Limit text length to max 4000 characters
    const safeText = text.trim().slice(0, 4000);
    const audioBuffer = await synthesizeSpeech({
      apiKey,
      text: safeText,
      voice: voice || AI_CONFIG.ttsVoice,
      model: model || AI_CONFIG.ttsModel
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(audioBuffer);
  } catch (error) {
    console.error('[Bunny AI] Speech synthesis error:', error);
    const classified = classifyOpenAIError(error, AI_CONFIG.ttsModel);
    res.status(classified.status || 500).json({
      error: classified.message,
      errorType: classified.type,
      details: classified.details
    });
  }
});

export default router;
