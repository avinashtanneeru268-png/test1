import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import chatRoutes from './routes/chat.js';
import conversationsRoutes from './routes/conversations.js';
import voiceRoutes from './routes/voice.js';
import { isSupabaseConfigured } from './services/supabase.js';
import { AI_CONFIG, maskKey } from './services/ai.js';

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Enable Cross-Origin Resource Sharing for standalone frontend clients
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// Parse JSON request bodies (supports base64 audio uploads up to 25mb)
app.use(express.json({ limit: '25mb' }));

// Helper to determine if OpenAI API key is configured
function hasServerApiKey() {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(
    key &&
    key !== 'your_openai_api_key_here' &&
    key.trim().length > 0
  );
}

// Safe Public Config Endpoint for Frontend Clients (ZERO secrets exposed)
app.get('/api/config', (req, res) => {
  res.json({
    appName: 'Bunny',
    assistantName: 'Bunny AI',
    browserTitle: 'Bunny AI — Your Personal Assistant',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    isSupabaseConfigured: isSupabaseConfigured(),
    hasApiKey: hasServerApiKey(),
    defaultModel: process.env.OPENAI_MODEL || AI_CONFIG.defaultModel,
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL || AI_CONFIG.fallbackModel,
    backendUrl: `http://localhost:${PORT}`
  });
});

// Health and Status Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Bunny AI',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    hasApiKey: hasServerApiKey(),
    hasSupabase: isSupabaseConfigured(),
    defaultModel: process.env.OPENAI_MODEL || AI_CONFIG.defaultModel,
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL || AI_CONFIG.fallbackModel,
    nodeVersion: process.version
  });
});

// Mount API Routes
app.use('/api', chatRoutes);
app.use('/api', conversationsRoutes);
app.use('/api', voiceRoutes);

// Serve Frontend Static Assets
const frontendPath = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendPath));

// For non-API routes, fallback to serving the frontend single-page index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Bunny AI] Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal server error occurred.',
    message: err.message || 'An unexpected problem happened.'
  });
});

// Start Server
app.listen(PORT, () => {
  const isKeySet = hasServerApiKey();
  const isSupabaseSet = isSupabaseConfigured();
  const model = process.env.OPENAI_MODEL || AI_CONFIG.defaultModel;
  const fallback = process.env.OPENAI_FALLBACK_MODEL || AI_CONFIG.fallbackModel;

  console.log('='.repeat(62));
  console.log('🐰 BUNNY AI — Backend Server Running!');
  console.log(`🌐 Web App & API: http://localhost:${PORT}`);
  console.log(`📁 Frontend Assets: ${frontendPath}`);
  console.log(`🧠 Primary Model:  ${model}`);
  console.log(`🛡️ Fallback Model: ${fallback}`);
  console.log(`🔑 OpenAI Key in .env: ${isKeySet ? `✅ Configured (${maskKey(process.env.OPENAI_API_KEY)})` : '⚠️ Not detected (Set in backend/.env or UI)'}`);
  console.log(`⚡ Supabase Database:  ${isSupabaseSet ? '✅ Connected' : '⚪ Standby (Set keys in backend/.env)'}`);
  console.log('='.repeat(62));
});
